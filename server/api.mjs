// What the app needs a server for: one project, shared by every device, and a version of it kept for each day.
// No dependencies, so the same code runs inside the Vite dev server, from `npm run serve` and in Docker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brickWorkDefaults, createBrickWork } from './brickwork.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const defaultDirs = () => ({
  dataDir: process.env.BRICK_DATA_DIR ?? path.join(ROOT, 'data'),
});

/** Sites the browser reaches through us. The Rebrickable API has no CORS, and label drawing needs to read picture pixels. */
export const UPSTREAMS = {
  '/rb-api': 'https://rebrickable.com/api/v3',
  '/part-img/rb': 'https://cdn.rebrickable.com/media/parts/ldraw',
  '/part-img/bl': 'https://img.bricklink.com/ItemImage',
};

const MAX_PROJECT = 64 * 1024 * 1024;
/** How many days' versions of the project are kept */
const KEEP_VERSIONS = 30;
const VERSION_NAME = /^project-(\d{4}-\d{2}-\d{2})\.json$/;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) reject(Object.assign(new Error('That file is too large.'), { status: 413 }));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createApi({ dataDir, brickWork = createBrickWork(brickWorkDefaults()) }) {
  const projectFile = path.join(dataDir, 'project.json');
  const revOf = () => (fs.existsSync(projectFile) ? String(fs.statSync(projectFile).mtimeMs) : null);

  // The project as it stood before the first change of each day it changed. project.previous.json only goes back one
  // save, and saves follow every edit, so on its own a mistake is out of reach a couple of edits later.
  const versionsDir = path.join(dataDir, 'backups');
  const listVersions = () =>
    (fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir) : [])
      .flatMap((name) => {
        const m = name.match(VERSION_NAME);
        return m ? [{ name, date: m[1], size: fs.statSync(path.join(versionsDir, name)).size }] : [];
      })
      .sort((a, b) => b.date.localeCompare(a.date));

  /** Called just before the project file is replaced. Never stops a save: the newest work matters most. */
  function keepVersion() {
    try {
      const now = new Date();
      const two = (n) => String(n).padStart(2, '0');
      const file = path.join(versionsDir, `project-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`);
      if (fs.existsSync(file)) return;
      fs.mkdirSync(versionsDir, { recursive: true });
      fs.copyFileSync(projectFile, `${file}.tmp`);
      fs.renameSync(`${file}.tmp`, file);
      for (const old of listVersions().slice(KEEP_VERSIONS)) fs.unlinkSync(path.join(versionsDir, old.name));
    } catch (e) {
      console.error(`Couldn't keep a version of the project in ${versionsDir}: ${e.message}`);
    }
  }

  async function saveProject(req, res) {
    const body = await readBody(req, MAX_PROJECT);
    let project;
    try {
      project = JSON.parse(body.toString('utf8'));
    } catch {
      return send(res, 400, { error: 'That isn’t JSON.' });
    }
    if (project?.version !== 1 || !Array.isArray(project.rows)) return send(res, 400, { error: 'That isn’t a Brick Stash project.' });
    // Everything from here to the rename is synchronous, so two saves can't interleave
    const current = revOf();
    const base = req.headers['x-base-rev'] || null;
    if (current !== null && base !== current) return send(res, 409, { error: 'Changed elsewhere.' }, { 'X-Rev': current });
    fs.mkdirSync(dataDir, { recursive: true });
    const temp = `${projectFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(project));
    if (current !== null) {
      fs.copyFileSync(projectFile, path.join(dataDir, 'project.previous.json'));
      keepVersion();
    }
    fs.renameSync(temp, projectFile);
    return send(res, 200, { rev: revOf() });
  }

  /** Resolves true if it answered the request */
  return async function api(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    if (!p.startsWith('/api/')) return false;
    try {
      if (p === '/api/project' && req.method === 'GET') {
        const rev = revOf();
        if (rev === null) send(res, 404, { error: 'No project yet.' });
        else send(res, 200, JSON.parse(fs.readFileSync(projectFile, 'utf8')), { 'X-Rev': rev, 'Cache-Control': 'no-store' });
      } else if (p === '/api/project' && req.method === 'PUT') await saveProject(req, res);
      else if (p === '/api/brickwork' && req.method === 'GET') send(res, 200, await brickWork.status(), { 'Cache-Control': 'no-store' });
      else if (p === '/api/brickwork/collection' && req.method === 'GET') {
        if (!brickWork.configured) send(res, 404, { error: 'Brick Work isn’t set up here. Set BRICK_WORK_URL and BRICK_WORK_TOKEN on the server.' });
        else send(res, 200, await brickWork.collection(), { 'Cache-Control': 'no-store' });
      } else if (p === '/api/versions' && req.method === 'GET') send(res, 200, listVersions(), { 'Cache-Control': 'no-store' });
      else if (p.startsWith('/api/versions/') && req.method === 'GET') {
        // The pattern allows no slashes or dots beyond the extension, so a name can't leave the folder
        const name = p.slice('/api/versions/'.length);
        const file = VERSION_NAME.test(name) ? path.join(versionsDir, name) : null;
        if (!file || !fs.existsSync(file)) send(res, 404, { error: 'No such version.' });
        else send(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')), { 'Cache-Control': 'no-store' });
      } else send(res, 404, { error: 'Not found.' });
    } catch (e) {
      // A body cut short by the limit leaves the connection unusable, so close it after answering
      if (!res.headersSent) send(res, e.status ?? 500, { error: e.message }, e.status === 413 ? { Connection: 'close' } : {});
      else res.destroy();
    }
    return true;
  };
}
