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

describe('filing parts in Brick Work by drawer', () => {
  // A stand-in that keeps storages and stock in memory, as Brick Work would
  let bw, srv, calls;
  beforeEach(async () => {
    calls = [];
    bw = {
      storages: [{ id: 'mine', name: 'My sorting tub', type: 'Bin', parent_id: null, note: null, archived_at: null }],
      stock: [
        { id: 's1', item: item('3001', 'Brick 2 x 4'), color: colour('Red'), quantity: 5, storage_id: null, lot_id: null, archived_at: null },
        { id: 's2', item: item('3001', 'Brick 2 x 4'), color: colour('Blue'), quantity: 5, storage_id: 'mine', lot_id: null, archived_at: null },
      ],
      next: 1,
    };
    srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      calls.push({ method: req.method, path: url.pathname, key: req.headers['idempotency-key'], body });
      const send = (status, b) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(b));
      if (req.method === 'GET' && url.pathname === '/api/v2/storages') return send(200, { data: [{ id: null, name: 'Not stored' }, ...bw.storages], page: { next_cursor: null, limit: 200 } });
      if (req.method === 'GET' && url.pathname === '/api/v2/stock') return send(200, { data: bw.stock, page: { next_cursor: null, limit: 200 } });
      if (req.method === 'POST' && url.pathname === '/api/v2/storages') {
        const made = { id: `st${bw.next++}`, ...body, archived_at: null };
        bw.storages.push(made);
        return send(201, { data: made, event_id: 1 });
      }
      const patch = url.pathname.match(/^\/api\/v2\/storages\/([^/]+)$/);
      if (req.method === 'PATCH' && patch) {
        const s = bw.storages.find((x) => x.id === patch[1]);
        Object.assign(s, body);
        return send(200, { data: s, event_id: 2 });
      }
      const move = url.pathname.match(/^\/api\/v2\/storages\/([^/]+)\/contents$/);
      if (req.method === 'POST' && move) {
        for (const sel of body.selections) bw.stock.find((x) => x.id === sel.id).storage_id = move[1];
        return send(200, { data: {}, event_id: 3 });
      }
      send(404, { title: 'not found' });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  });
  afterEach(async () => {
    srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
  });
  const client = () => createBrickWork({ url: `http://127.0.0.1:${srv.address().port}`, token: 'good' });
  const plan = (unitName) => ({
    storages: [
      { key: 'unit:a', name: unitName, type: 'Cabinet', parentKey: null },
      { key: 'space:a:c:0', name: 'A1', type: 'Drawer', parentKey: 'unit:a' },
    ],
    moves: [{ key: 'space:a:c:0', stockIds: ['s1'] }],
  });

  it('makes the storages, marked as its own, and files the lines it was given', async () => {
    const r = await client().apply(plan('A: Sterilite Medium'));
    expect(r).toMatchObject({ created: 2, updated: 0, moved: 1, errors: [] });
    const unit = bw.storages.find((x) => x.note === 'Brick Stash unit:a');
    expect(bw.storages.find((x) => x.note === 'Brick Stash space:a:c:0')).toMatchObject({ name: 'A1', type: 'Drawer', parent_id: unit.id });
    expect(bw.stock.find((x) => x.id === 's1').storage_id).toBe(r.ids['space:a:c:0']);
    // Every write carries its own key
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(new Set(writes.map((c) => c.key)).size).toBe(writes.length);
  });

  it('updates its own storages on a second run rather than making more, and never touches the user’s', async () => {
    await client().apply(plan('A: Sterilite Medium'));
    const r = await client().apply(plan('A: Bricks'));
    expect(r).toMatchObject({ created: 0, updated: 1 });
    expect(bw.storages.filter((x) => x.note?.startsWith('Brick Stash'))).toHaveLength(2);
    expect(bw.storages.find((x) => x.id === 'mine')).toMatchObject({ name: 'My sorting tub', note: null });
    expect(calls.some((c) => c.path.includes('/mine'))).toBe(false);
  });

  it('lists stock lines with where they’re filed, and storages with Brick Stash’s mark', async () => {
    await client().apply(plan('A'));
    const { lines } = await client().stock();
    expect(lines.map((l) => [l.id, l.partNum, l.colour, l.storageId])).toEqual([
      ['s1', '3001', 'Red', expect.stringMatching(/^st/)],
      ['s2', '3001', 'Blue', 'mine'],
    ]);
    const { storages } = await client().storages();
    expect(storages.map((x) => x.mark)).toEqual([null, 'unit:a', 'space:a:c:0']);
  });
});
