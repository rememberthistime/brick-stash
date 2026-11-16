import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi } from './api.mjs';

let dir, server, base;
const project = (extra = {}) => JSON.stringify({ version: 1, rows: [], units: [], ...extra });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brick-stash-'));
  const api = createApi({ dataDir: path.join(dir, 'data') });
  server = http.createServer((req, res) => api(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
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

});

it('leaves everything outside /api/ for the app', async () => {
  const api = createApi({ dataDir: dir });
  expect(await api({ url: '/plan', method: 'GET' }, {})).toBe(false);
});
