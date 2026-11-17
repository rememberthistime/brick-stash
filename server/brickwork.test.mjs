import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrickWork, partNumberOf } from './brickwork.mjs';

// A stand-in for Brick Work's API, shaped as its openapi-v2.yaml describes: pages of `data` with `page.next_cursor`
const item = (rb, name, kind = 'part', bl) => ({ id: 1, kind, name, unidentified: false, bricklink: bl ? [{ type: 'P', no: bl, preferred: true }] : [], rebrickable: rb ? { key: rb } : null });
const colour = (name) => ({ id: 1, name, rgb: 'C91A09', bricklink_id: 5, rebrickable_id: 4 });
let server, base, seen;
const stock = [
  { id: 's1', item: item('3001', 'Brick 2 x 4'), color: colour('Red'), quantity: 150, archived_at: null },
  { id: 's2', item: item('3001', 'Brick 2 x 4'), color: colour('Blue'), quantity: 50, archived_at: null },
  { id: 's3', item: item(null, 'Something odd'), color: colour('Red'), quantity: 2, archived_at: null },
  { id: 's4', item: item('3023', 'Plate 1 x 2'), color: colour('Red'), quantity: 9, archived_at: '2026-01-01' },
];
const copies = [{ id: 'c1', item: item('10294-1', 'Titanic', 'set'), archived_at: null }];
const copyParts = [
  { id: 'p1', item: item(null, 'Tile 1 x 2', 'part', '3069b'), color: colour('White'), quantity: 10, missing: 2, spare: false },
  { id: 'p2', item: item('3626c', 'Minifig head'), color: colour('Yellow'), quantity: 1, missing: 0, spare: true },
  { id: 'p3', item: item('fig-1', 'Captain', 'minifigure'), color: null, quantity: 1, missing: 0, spare: false },
];
const page = (list, cursor, limit) => {
  const at = Number(cursor ?? 0);
  const next = at + limit < list.length ? String(at + limit) : null;
  return { data: list.slice(at, at + limit), page: { next_cursor: next, limit } };
};

beforeEach(async () => {
  seen = [];
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    seen.push({ path: url.pathname + url.search, auth: req.headers.authorization });
    if (req.headers.authorization !== 'Bearer good') return res.writeHead(401).end('{}');
    // Pages of one line, to prove the paging is followed
    const limit = 1;
    const send = (body) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/api/v2/me') return send({ data: { name: 'brick-stash', scopes: ['read'] } });
    if (url.pathname === '/api/v2/stock') return send(page(stock, url.searchParams.get('cursor'), limit));
    if (url.pathname === '/api/v2/copies') return send(page(copies, url.searchParams.get('cursor'), limit));
    if (url.pathname === '/api/v2/copies/c1/parts') return send(page(copyParts, url.searchParams.get('cursor'), limit));
    res.writeHead(404).end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

describe('reading the collection from Brick Work', () => {
  it('takes Rebrickable’s number, else the preferred BrickLink one', () => {
    expect(partNumberOf(item('3001', 'x'))).toBe('3001');
    expect(partNumberOf(item(null, 'x', 'part', '3069b'))).toBe('3069b');
    expect(partNumberOf(item(null, 'x'))).toBeNull();
  });

  it('reads loose parts and every set’s parts, page by page, with the token on each call', async () => {
    const bw = createBrickWork({ url: `${base}/`, token: 'good' });
    const got = await bw.collection();
    expect(got.rows).toEqual([
      { partNum: '3001', qty: 150, colour: 'Red', name: 'Brick 2 x 4' },
      { partNum: '3001', qty: 50, colour: 'Blue', name: 'Brick 2 x 4' },
      { partNum: '3069b', qty: 8, colour: 'White', name: 'Tile 1 x 2' },
      { partNum: '3626c', qty: 1, colour: 'Yellow', name: 'Minifig head', spare: true },
    ]);
    expect(got).toMatchObject({ looseLines: 4, sets: 1, setLines: 2, unnamed: 1 });
    expect(seen.every((s) => s.auth === 'Bearer good')).toBe(true);
    expect(seen.some((s) => s.path.includes('cursor=2'))).toBe(true);
    expect(seen.find((s) => s.path.startsWith('/api/v2/stock'))?.path).toContain('kind=part');
  });

  it('says plainly when the token is wrong or Brick Work can’t be reached', async () => {
    expect(await createBrickWork({ url: base, token: 'bad' }).status()).toMatchObject({ configured: true, ok: false, error: expect.stringMatching(/turned the token down/) });
    expect(await createBrickWork({ url: 'http://127.0.0.1:9', token: 'good' }).status()).toMatchObject({ ok: false, error: expect.stringMatching(/Couldn't reach Brick Work/) });
    expect(await createBrickWork({ url: '', token: '' }).status()).toEqual({ configured: false });
    expect(await createBrickWork({ url: base, token: 'good' }).status()).toMatchObject({ ok: true, token: 'brick-stash', scopes: ['read'] });
  });
});
