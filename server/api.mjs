// What the app needs a server for: the project, shared by every device, and a version of it kept for each day. More
// than one profile can be kept: the main one where the project always was, and others each in a folder of their own.
// No dependencies, so the same code runs inside the Vite dev server, from `npm run serve` and in Docker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** One profile's project and its versions, in a folder of its own */
function projectStore(dataDir) {
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

  return { projectFile, revOf, versionsDir, listVersions, saveProject };
}

/** The project and versions routes, for one profile */
async function projectRequest({ projectFile, revOf, versionsDir, listVersions, saveProject }, p, req, res) {
  if (p === '/api/project' && req.method === 'GET') {
    const rev = revOf();
    if (rev === null) send(res, 404, { error: 'No project yet.' });
    else send(res, 200, JSON.parse(fs.readFileSync(projectFile, 'utf8')), { 'X-Rev': rev, 'Cache-Control': 'no-store' });
  } else if (p === '/api/project' && req.method === 'PUT') await saveProject(req, res);
  else if (p === '/api/versions' && req.method === 'GET') send(res, 200, listVersions(), { 'Cache-Control': 'no-store' });
  else if (p.startsWith('/api/versions/') && req.method === 'GET') {
    // The pattern allows no slashes or dots beyond the extension, so a name can't leave the folder
    const name = p.slice('/api/versions/'.length);
    const file = VERSION_NAME.test(name) ? path.join(versionsDir, name) : null;
    if (!file || !fs.existsSync(file)) send(res, 404, { error: 'No such version.' });
    else send(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')), { 'Cache-Control': 'no-store' });
  } else send(res, 404, { error: 'Not found.' });
}

const PROFILE_ID = /^[a-z0-9-]{1,48}$/;
const MAIN = 'main';

const readJson = async (req) => {
  try {
    return JSON.parse((await readBody(req, 4096)).toString('utf8'));
  } catch {
    return null;
  }
};

export function createApi({ dataDir }) {
  const profilesFile = path.join(dataDir, 'profiles.json');
  const profilesDir = path.join(dataDir, 'profiles');
  const readProfiles = () => {
    try {
      const list = JSON.parse(fs.readFileSync(profilesFile, 'utf8'));
      return Array.isArray(list) ? list.filter((x) => x && PROFILE_ID.test(x.id) && typeof x.name === 'string') : [];
    } catch {
      return [];
    }
  };
  const writeProfiles = (list) => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(`${profilesFile}.tmp`, JSON.stringify(list, null, 2));
    fs.renameSync(`${profilesFile}.tmp`, profilesFile);
  };
  /** Every profile, the main one first; it's called "My stash" until renamed */
  const allProfiles = () => {
    const list = readProfiles();
    const main = list.find((x) => x.id === MAIN) ?? { id: MAIN, name: 'My stash' };
    return [main, ...list.filter((x) => x.id !== MAIN)];
  };
  const known = (id) => PROFILE_ID.test(id) && allProfiles().some((x) => x.id === id);
  const stores = new Map();
  /** The main profile lives where the project always has, so an existing setup carries on as it is */
  const storeFor = (id) => {
    if (!stores.has(id)) stores.set(id, projectStore(id === MAIN ? dataDir : path.join(profilesDir, id)));
    return stores.get(id);
  };
  const nameFrom = (body) => String(body?.name ?? '').trim().slice(0, 80);

  async function createProfile(req, res) {
    const name = nameFrom(await readJson(req));
    if (!name) return send(res, 400, { error: 'A profile needs a name.' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'profile';
    const id = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    fs.mkdirSync(path.join(profilesDir, id), { recursive: true });
    writeProfiles([...allProfiles(), { id, name, created: new Date().toISOString() }]);
    return send(res, 201, { id, name });
  }

  async function renameProfile(req, res, id) {
    const name = nameFrom(await readJson(req));
    if (!name) return send(res, 400, { error: 'A profile needs a name.' });
    writeProfiles(allProfiles().map((x) => (x.id === id ? { ...x, name } : x)));
    return send(res, 200, { id, name });
  }

  /** A profile taken away is moved aside on the server, not deleted */
  function removeProfile(res, id) {
    if (id === MAIN) return send(res, 400, { error: 'The main profile can’t be removed.' });
    const from = path.join(profilesDir, id);
    if (fs.existsSync(from)) {
      const to = path.join(dataDir, 'removed-profiles');
      fs.mkdirSync(to, { recursive: true });
      fs.renameSync(from, path.join(to, `${id}-${Date.now()}`));
    }
    stores.delete(id);
    writeProfiles(allProfiles().filter((x) => x.id !== id));
    return send(res, 200, { removed: id });
  }

  /** Resolves true if it answered the request */
  return async function api(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    if (!p.startsWith('/api/')) return false;
    try {
      if (p === '/api/profiles' && req.method === 'GET') send(res, 200, allProfiles(), { 'Cache-Control': 'no-store' });
      else if (p === '/api/profiles' && req.method === 'POST') await createProfile(req, res);
      else if (p.startsWith('/api/profiles/')) {
        const id = p.slice('/api/profiles/'.length);
        if (!known(id)) send(res, 404, { error: 'No such profile.' });
        else if (req.method === 'PATCH') await renameProfile(req, res, id);
        else if (req.method === 'DELETE') removeProfile(res, id);
        else send(res, 405, { error: 'Not allowed.' });
      } else {
        const id = url.searchParams.get('profile') || MAIN;
        if (!known(id)) send(res, 404, { error: 'No such profile.' });
        else await projectRequest(storeFor(id), p, req, res);
      }
    } catch (e) {
      // A body cut short by the limit leaves the connection unusable, so close it after answering
      if (!res.headersSent) send(res, e.status ?? 500, { error: e.message }, e.status === 413 ? { Connection: 'close' } : {});
      else res.destroy();
    }
    return true;
  };
}
