import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi } from './api.mjs';

let dir, server, base;
const project = (extra = {}) => JSON.stringify({ version: 1, rows: [], units: [], ...extra });
const jpeg = (url, body = 'fake-jpeg') => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brick-stash-'));
  const api = createApi({ dataDir: path.join(dir, 'data'), photosDir: path.join(dir, 'photos') });
  server = http.createServer((req, res) => api(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('reading photos now', () => {
  it('leaves a request for the development box, once, and passes on how the run went', async () => {
    expect(await (await fetch(`${base}/api/read-photos`)).json()).toMatchObject({ requested: null, status: null });
    const asked = await fetch(`${base}/api/read-photos`, { method: 'POST' });
    expect(asked.status).toBe(202);
    const { requested } = await asked.json();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'read-request.json'), 'utf8'))).toEqual({ requested });
    await new Promise((r) => setTimeout(r, 15));
    expect((await (await fetch(`${base}/api/read-photos`, { method: 'POST' })).json()).requested).toBe(requested);
    // The box takes the request up and reports back
    fs.rmSync(path.join(dir, 'data', 'read-request.json'));
    fs.writeFileSync(path.join(dir, 'data', 'read-status.json'), JSON.stringify({ state: 'done', started: 1, finished: 2, ok: true, summary: 'Read A1.' }));
    const after = await (await fetch(`${base}/api/read-photos`)).json();
    expect(after).toMatchObject({ requested: null, status: { state: 'done', ok: true, summary: 'Read A1.' } });
    expect(after.now).toBeGreaterThan(0);
  });

  it('copes with a status file that’s half written', async () => {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'read-status.json'), '{"state":');
    expect((await (await fetch(`${base}/api/read-photos`)).json()).status).toBeNull();
  });
});

describe('versions', () => {
  const save = async (note, rev) => (await (await fetch(`${base}/api/project`, { method: 'PUT', headers: rev ? { 'X-Base-Rev': rev } : {}, body: project({ note }) })).json()).rev;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('keeps the project as it was before the day’s first change, however many saves follow', async () => {
    expect(await (await fetch(`${base}/api/versions`)).json()).toEqual([]);
    let rev = await save('one');
    expect(await (await fetch(`${base}/api/versions`)).json()).toEqual([]);
    for (const note of ['two', 'three', 'four']) {
      await new Promise((r) => setTimeout(r, 15));
      rev = await save(note, rev);
    }
    const list = await (await fetch(`${base}/api/versions`)).json();
    expect(list.map((v) => v.date)).toEqual([today()]);
    expect((await (await fetch(`${base}/api/versions/${list[0].name}`)).json()).note).toBe('one');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'project.previous.json'), 'utf8')).note).toBe('three');
  });

  it('keeps thirty days of them, newest first', async () => {
    const backups = path.join(dir, 'data', 'backups');
    fs.mkdirSync(backups, { recursive: true });
    for (let d = 1; d <= 31; d++) fs.writeFileSync(path.join(backups, `project-2020-01-${String(d).padStart(2, '0')}.json`), project({ note: `day ${d}` }));
    fs.writeFileSync(path.join(backups, 'notes.txt'), 'not one of ours');
    const rev = await save('one');
    await new Promise((r) => setTimeout(r, 15));
    await save('two', rev);
    const dates = (await (await fetch(`${base}/api/versions`)).json()).map((v) => v.date);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe(today());
    expect(dates.at(-1)).toBe('2020-01-03');
    expect(fs.existsSync(path.join(backups, 'notes.txt'))).toBe(true);
  });

  it('still saves when a version can’t be kept', async () => {
    const rev = await save('one');
    fs.writeFileSync(path.join(dir, 'data', 'backups'), 'a file where the folder should be');
    await new Promise((r) => setTimeout(r, 15));
    await save('two', rev);
    expect((await (await fetch(`${base}/api/project`)).json()).note).toBe('two');
  });

  it('only hands out its own files', async () => {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'project-2020-01-01.json'), '{}');
    for (const name of ['..%2Fproject-2020-01-01.json', 'project.json', 'project-2020-01-01.json']) expect((await fetch(`${base}/api/versions/${name}`)).status).toBe(404);
  });
});

describe('project', () => {
  it('has none to begin with, then returns what was saved', async () => {
    expect((await fetch(`${base}/api/project`)).status).toBe(404);
    const saved = await fetch(`${base}/api/project`, { method: 'PUT', body: project({ note: 'hello' }) });
    expect(saved.status).toBe(200);
    const got = await fetch(`${base}/api/project`);
    expect((await got.json()).note).toBe('hello');
    expect(got.headers.get('x-rev')).toBe((await saved.json()).rev);
  });

  it('turns down a save based on an older version, and leaves the project alone', async () => {
    const first = await (await fetch(`${base}/api/project`, { method: 'PUT', body: project({ note: 'one' }) })).json();
    await new Promise((r) => setTimeout(r, 15));
    const second = await fetch(`${base}/api/project`, { method: 'PUT', headers: { 'X-Base-Rev': first.rev }, body: project({ note: 'two' }) });
    expect(second.status).toBe(200);
    const stale = await fetch(`${base}/api/project`, { method: 'PUT', headers: { 'X-Base-Rev': first.rev }, body: project({ note: 'stale' }) });
    expect(stale.status).toBe(409);
    expect((await (await fetch(`${base}/api/project`)).json()).note).toBe('two');
  });

  it('keeps the previous version and refuses anything that is not a project', async () => {
    const first = await (await fetch(`${base}/api/project`, { method: 'PUT', body: project({ note: 'one' }) })).json();
    await fetch(`${base}/api/project`, { method: 'PUT', headers: { 'X-Base-Rev': first.rev }, body: project({ note: 'two' }) });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'project.previous.json'), 'utf8')).note).toBe('one');
    expect((await fetch(`${base}/api/project`, { method: 'PUT', body: '{"version":2}' })).status).toBe(400);
    expect((await fetch(`${base}/api/project`, { method: 'PUT', body: 'nope' })).status).toBe(400);
  });

  it('can send just part of the project', async () => {
    await fetch(`${base}/api/project`, { method: 'PUT', body: project({ setup: { open: {} } }) });
    expect(await (await fetch(`${base}/api/project?only=units,setup`)).json()).toEqual({ units: [], setup: { open: {} } });
  });
});

describe('photos', () => {
  it('names photos by drawer and kind, and carries on from what is already there', async () => {
    fs.mkdirSync(path.join(dir, 'photos'));
    fs.writeFileSync(path.join(dir, 'photos', 'A1-top.jpg'), 'x');
    fs.writeFileSync(path.join(dir, 'photos', 'notes.md'), 'x');
    const names = [];
    for (const u of ['code=a1&view=piece', 'code=A1&view=piece', 'code=A1&view=top', 'code=A1&view=side', 'code=B&view=piece']) names.push((await (await jpeg(`/api/photos?${u}`)).json()).name);
    expect(names).toEqual(['A1-piece-1.jpg', 'A1-piece-2.jpg', 'A1-top-2.jpg', 'A1-side.jpg', 'B-piece-1.jpg']);
    const list = await (await fetch(`${base}/api/photos`)).json();
    expect(list.map((p) => p.name)).not.toContain('notes.md');
    expect(list.find((p) => p.name === 'A1-top.jpg')).toMatchObject({ code: 'A1', view: 'top' });
  });

  it('takes close-ups, and records where pieces and close-ups came from', async () => {
    const names = [];
    for (const u of ['code=H1&view=closeup&x=62&y=5', 'code=H1&view=closeup', 'code=H1&view=piece&x=0&y=99', 'code=H1&view=top&x=10&y=10']) names.push((await (await jpeg(`/api/photos?${u}`)).json()).name);
    expect(names).toEqual(['H1-closeup-at-62-5.jpg', 'H1-closeup-2.jpg', 'H1-piece-1-at-0-99.jpg', 'H1-top.jpg']);
    const list = await (await fetch(`${base}/api/photos`)).json();
    expect(list.find((p) => p.name === 'H1-closeup-at-62-5.jpg')).toMatchObject({ code: 'H1', view: 'closeup', spot: { x: 62, y: 5 } });
    expect(list.find((p) => p.name === 'H1-top.jpg').spot).toBeUndefined();
    expect((await fetch(`${base}/api/photos/H1-piece-1-at-0-99.jpg`)).status).toBe(200);
  });

  it('refuses a place that is off the photo', async () => {
    for (const q of ['x=100&y=5', 'x=5', 'x=-1&y=5', 'x=a&y=5']) expect((await jpeg(`/api/photos?code=H1&${q}`)).status).toBe(400);
  });

  const patch = (name, body) => fetch(`${base}/api/photos/${name}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('marks, moves and clears where a photo came from, keeping its number in the same drawer', async () => {
    await jpeg('/api/photos?code=I2&view=piece');
    await jpeg('/api/photos?code=I2&view=piece');
    expect((await (await patch('I2-piece-2.jpg', { spot: { x: 40, y: 7 } })).json()).name).toBe('I2-piece-2-at-40-7.jpg');
    expect((await (await patch('I2-piece-2-at-40-7.jpg', { spot: { x: 41, y: 8 } })).json()).name).toBe('I2-piece-2-at-41-8.jpg');
    expect((await (await patch('I2-piece-2-at-41-8.jpg', { spot: null })).json()).name).toBe('I2-piece-2.jpg');
  });

  it('refiles photos under another drawer, carrying their marks and their order', async () => {
    await jpeg('/api/photos?code=A3&view=top');
    await jpeg('/api/photos?code=A3&view=piece&x=10&y=20');
    await jpeg('/api/photos?code=J1&view=piece');
    expect((await (await patch('A3-top.jpg', { code: 'J1' })).json()).name).toBe('J1-top.jpg');
    const moved = await (await patch('A3-piece-1-at-10-20.jpg', { code: 'j1' })).json();
    expect(moved).toMatchObject({ name: 'J1-piece-2-at-10-20.jpg', code: 'J1', spot: { x: 10, y: 20 } });
    expect(fs.readdirSync(path.join(dir, 'photos')).filter((n) => n.startsWith('A3'))).toEqual([]);
  });

  it('refuses refiling that makes no sense', async () => {
    await jpeg('/api/photos?code=K1&view=top');
    await jpeg('/api/photos?code=K1&view=piece');
    expect((await patch('K1-top.jpg', { spot: { x: 1, y: 1 } })).status).toBe(400);
    expect((await patch('K1-piece-1.jpg', { spot: { x: 100, y: 1 } })).status).toBe(400);
    expect((await patch('K1-piece-1.jpg', { code: '../x' })).status).toBe(400);
    expect((await patch('K1-nope.jpg', { code: 'K2' })).status).toBe(404);
  });

  it('says what it can do, so the phone can spot an out-of-date server', async () => {
    expect((await (await fetch(`${base}/api/info`)).json()).features).toContain('spots');
  });

  it('keeps names for boxes by drawer, beside the photos, and forgets a drawer with none', async () => {
    const put = (code, list) => fetch(`${base}/api/boxes/${code}`, { method: 'PUT', body: JSON.stringify(list) });
    expect(await (await fetch(`${base}/api/boxes`)).json()).toEqual({});
    expect(await (await put('i2', [{ x: 80, y: 20, name: ' Fences ' }])).json()).toEqual([{ x: 80, y: 20, name: 'Fences' }]);
    await put('H1', [{ x: 1, y: 2, name: 'Food' }]);
    expect(await (await fetch(`${base}/api/boxes`)).json()).toEqual({ I2: [{ x: 80, y: 20, name: 'Fences' }], H1: [{ x: 1, y: 2, name: 'Food' }] });
    await put('H1', []);
    expect(Object.keys(await (await fetch(`${base}/api/boxes`)).json())).toEqual(['I2']);
    expect((await (await fetch(`${base}/api/photos`)).json()).map((p) => p.name)).not.toContain('boxes.json');
  });

  it('refuses box names that make no sense', async () => {
    const put = (body) => fetch(`${base}/api/boxes/I2`, { method: 'PUT', body });
    for (const bad of ['{}', '[{"x":100,"y":1,"name":"a"}]', '[{"x":1,"y":1,"name":""}]', 'nope']) expect((await put(bad)).status).toBe(400);
    expect((await fetch(`${base}/api/boxes/..%2Fx`, { method: 'PUT', body: '[]' })).status).toBe(400);
  });

  it('serves the drafts beside the photos, or none', async () => {
    expect(await (await fetch(`${base}/api/drafts`)).json()).toEqual({ drawers: [] });
    fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'photos', 'drawer-drafts.json'), JSON.stringify({ drawers: [{ code: 'H2', pockets: [] }] }));
    expect((await (await fetch(`${base}/api/drafts`)).json()).drawers[0].code).toBe('H2');
    fs.writeFileSync(path.join(dir, 'photos', 'drawer-drafts.json'), '{oops');
    const broken = await fetch(`${base}/api/drafts`);
    expect(broken.status).toBe(500);
    expect((await broken.json()).error).toContain('drawer-drafts.json');
  });

  it('keeps reviews of drafts by drawer, tidied, including codes still to be confirmed', async () => {
    const put = (code, body) => fetch(`${base}/api/reviews/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(body) });
    expect(await (await fetch(`${base}/api/reviews`)).json()).toEqual({});
    const saved = await (await put('h2', { pockets: { 'Front left': { parts: { 33243: 'yes', 6191: 'no' }, added: ['3001', '3001'], label: ' Curves ', note: '', done: true } } })).json();
    expect(saved.pockets['Front left']).toEqual({ parts: { 33243: 'yes', 6191: 'no' }, added: ['3001'], label: 'Curves', done: true });
    expect(saved.updated).toBeGreaterThan(0);
    await put('A3?', { code: 'c4', pockets: {} });
    const all = await (await fetch(`${base}/api/reviews`)).json();
    expect(Object.keys(all)).toEqual(['H2', 'A3?']);
    expect(all['A3?'].code).toBe('C4');
  });

  it('refuses reviews that make no sense', async () => {
    const put = (code, body) => fetch(`${base}/api/reviews/${encodeURIComponent(code)}`, { method: 'PUT', body });
    for (const bad of ['[]', 'nope', '{"code":"a-1"}', '{"pockets":{"x":{"parts":{"3001":"maybe"}}}}', '{"pockets":{"x":{"added":["../x"]}}}', '{"pockets":{"x":{"done":"yes"}}}'])
      expect((await put('H2', bad)).status).toBe(400);
    expect((await put('../x', '{}')).status).toBe(400);
  });

  it('never reuses a lower number after a gap', async () => {
    await jpeg('/api/photos?code=A1');
    await jpeg('/api/photos?code=A1');
    await jpeg('/api/photos?code=A1');
    await fetch(`${base}/api/photos/A1-piece-2.jpg`, { method: 'DELETE' });
    expect((await (await jpeg('/api/photos?code=A1')).json()).name).toBe('A1-piece-4.jpg');
  });

  it('serves a photo back byte for byte, and can delete it', async () => {
    const { name } = await (await jpeg('/api/photos?code=C2', 'the-pixels')).json();
    const got = await fetch(`${base}/api/photos/${name}`);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(await got.text()).toBe('the-pixels');
    expect((await fetch(`${base}/api/photos/${name}`, { method: 'DELETE' })).status).toBe(200);
    expect((await fetch(`${base}/api/photos/${name}`)).status).toBe(404);
  });

  it('refuses bad codes, kinds, types and empty photos', async () => {
    expect((await jpeg('/api/photos?code=../../evil')).status).toBe(400);
    expect((await jpeg('/api/photos?code=A1&view=../x')).status).toBe(400);
    expect((await jpeg('/api/photos?code=A1', '')).status).toBe(400);
    expect((await fetch(`${base}/api/photos?code=A1`, { method: 'POST', headers: { 'Content-Type': 'text/html' }, body: '<script>' })).status).toBe(415);
    expect(fs.existsSync(path.join(dir, 'photos'))).toBe(false);
  });

  it('will not read or delete anything outside the photos folder', async () => {
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(path.join(dir, 'data', 'A1-top.jpg'), 'secret');
    const probe = (name, method) =>
      new Promise((resolve) => {
        // A raw request, because fetch would tidy the dots away before sending
        const req = http.request({ host: '127.0.0.1', port: server.address().port, path: `/api/photos/${name}`, method }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.end();
      });
    expect(await probe('..%2Fdata%2FA1-top.jpg', 'GET')).toBe(404);
    expect(await probe('..%2Fdata%2FA1-top.jpg', 'DELETE')).toBe(404);
    expect(await probe('%E0%A4%A', 'GET')).toBe(404);
    expect(fs.existsSync(path.join(dir, 'data', 'A1-top.jpg'))).toBe(true);
  });
});

it('leaves everything outside /api/ for the app', async () => {
  const api = createApi({ dataDir: dir, photosDir: dir });
  expect(await api({ url: '/snap', method: 'GET' }, {})).toBe(false);
});
