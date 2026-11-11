// What the app needs a server for: one project and one folder of photos, shared by every device.
// No dependencies, so the same code runs inside the Vite dev server, from `npm run serve` and in Docker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReader, readerDefaults } from './reader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const defaultDirs = () => ({
  dataDir: process.env.BRICK_DATA_DIR ?? path.join(ROOT, 'data'),
  photosDir: process.env.BRICK_PHOTOS_DIR ?? path.join(ROOT, 'photos'),
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
const MAX_PHOTO = 40 * 1024 * 1024;
const VIEWS = ['piece', 'closeup', 'top', 'side'];
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * A1-top.jpg, A1-piece-3.jpg, A1-closeup-2-at-62-15.jpg. The name is the record of what a photo shows, so photos can
 * be added or renamed by hand. "at-62-15" marks where a piece or close-up came from, as a percentage across and down
 * the drawer's most recent top photo.
 */
const PHOTO_NAME = /^([A-Z]+\d*)-(piece|closeup|top|side)(?:-(\d+))?(?:-at-(\d{1,2})-(\d{1,2}))?\.(jpe?g|png|webp)$/i;
const SPOTTED = ['piece', 'closeup'];
const DRAWER_CODE = /^[A-Z]+\d*$/;
/** A draft can be filed under a code still to be confirmed, such as "A3?" */
const DRAFT_CODE = /^[A-Z]+\d*\??$/;
const PART_NUM = /^[A-Za-z0-9._-]{1,40}$/;

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

export function createApi({ dataDir, photosDir, reader = createReader(readerDefaults({ dataDir, photosDir })) }) {
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

  function listPhotos() {
    if (!fs.existsSync(photosDir)) return [];
    return fs
      .readdirSync(photosDir)
      .flatMap((name) => {
        const m = name.match(PHOTO_NAME);
        if (!m) return [];
        const stat = fs.statSync(path.join(photosDir, name));
        const spot = m[4] === undefined ? {} : { spot: { x: Number(m[4]), y: Number(m[5]) } };
        return [{ name, code: m[1].toUpperCase(), view: m[2].toLowerCase(), ...spot, size: stat.size, mtime: Math.round(stat.mtimeMs) }];
      })
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.mtime - b.mtime);
  }

  function nextPhotoName(code, view, ext, spot) {
    const taken = fs.existsSync(photosDir) ? fs.readdirSync(photosDir) : [];
    const numbers = taken.flatMap((name) => {
      const m = name.match(PHOTO_NAME);
      return m && m[1].toUpperCase() === code && m[2].toLowerCase() === view ? [Number(m[3] ?? 1)] : [];
    });
    const n = Math.max(0, ...numbers) + 1;
    const at = spot ? `-at-${spot.x}-${spot.y}` : '';
    // A lone view or close-up keeps the plain name; pieces are always a series
    return view !== 'piece' && n === 1 ? `${code}-${view}${at}.${ext}` : `${code}-${view}-${n}${at}.${ext}`;
  }

  /**
   * Refile a photo: move it to another drawer, or mark (or clear) which box it came from. A photo that stays in its
   * drawer keeps its number; one that moves takes the next free number there. Renaming keeps the file's date, so
   * photos stay in the order they were taken.
   */
  async function changePhoto(req, res, file) {
    const m = path.basename(file).match(PHOTO_NAME);
    let change;
    try {
      change = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}');
    } catch {
      return send(res, 400, { error: 'That isn’t JSON.' });
    }
    const code = (change.code ?? m[1]).toUpperCase();
    const view = m[2].toLowerCase();
    if (!DRAWER_CODE.test(code)) return send(res, 400, { error: 'That isn’t a drawer code.' });
    let spot = m[4] === undefined ? null : { x: Number(m[4]), y: Number(m[5]) };
    if ('spot' in change) {
      const s = change.spot;
      const valid = s === null || (Number.isInteger(s?.x) && Number.isInteger(s?.y) && s.x >= 0 && s.x <= 99 && s.y >= 0 && s.y <= 99);
      if (!valid) return send(res, 400, { error: 'That isn’t a place on the photo.' });
      if (s && !SPOTTED.includes(view)) return send(res, 400, { error: 'Only pieces and close-ups can be marked.' });
      spot = s;
    }
    const ext = m[6].toLowerCase();
    const at = spot ? `-at-${spot.x}-${spot.y}` : '';
    const sameDrawer = code === m[1].toUpperCase();
    const name = sameDrawer ? `${code}-${view}${m[3] ? `-${m[3]}` : ''}${at}.${ext}` : nextPhotoName(code, view, ext, spot);
    if (name !== path.basename(file)) {
      if (fs.existsSync(path.join(photosDir, name))) return send(res, 409, { error: 'There’s already a photo by that name.' });
      fs.renameSync(file, path.join(photosDir, name));
    }
    return send(res, 200, listPhotos().find((p) => p.name === name));
  }

  // Names given to boxes on the phone ("Fences"), by drawer and place on its top photo. They live with the photos
  // rather than in the project, so the phone never has to write the project.
  const boxesFile = path.join(photosDir, 'boxes.json');
  const readBoxes = () => {
    try {
      return JSON.parse(fs.readFileSync(boxesFile, 'utf8'));
    } catch {
      return {};
    }
  };

  async function saveBoxes(req, res, code) {
    if (!DRAWER_CODE.test(code)) return send(res, 400, { error: 'That isn’t a drawer code.' });
    let list;
    try {
      list = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8'));
    } catch {
      return send(res, 400, { error: 'That isn’t JSON.' });
    }
    const place = (v) => Number.isInteger(v) && v >= 0 && v <= 99;
    const valid = Array.isArray(list) && list.length <= 100 && list.every((b) => place(b?.x) && place(b?.y) && typeof b.name === 'string' && b.name.trim() && b.name.length <= 60);
    if (!valid) return send(res, 400, { error: 'Those aren’t box names.' });
    const all = readBoxes();
    if (list.length) all[code] = list.map((b) => ({ x: b.x, y: b.y, name: b.name.trim() }));
    else delete all[code];
    fs.mkdirSync(photosDir, { recursive: true });
    fs.writeFileSync(`${boxesFile}.tmp`, JSON.stringify(all, null, 1));
    fs.renameSync(`${boxesFile}.tmp`, boxesFile);
    return send(res, 200, all[code] ?? []);
  }

  // Drafts of drawers read from photos, and what the user said about them on the review page. Both live with the
  // photos: drafts are written by whoever reads the photos, reviews by the phone or the site.
  const draftsFile = path.join(photosDir, 'drawer-drafts.json');
  const reviewsFile = path.join(photosDir, 'reviews.json');

  function readDrafts() {
    if (!fs.existsSync(draftsFile)) return { drawers: [] };
    try {
      return JSON.parse(fs.readFileSync(draftsFile, 'utf8'));
    } catch {
      throw Object.assign(new Error('drawer-drafts.json in the photos folder isn’t valid JSON.'), { status: 500 });
    }
  }

  const readReviews = () => {
    try {
      return JSON.parse(fs.readFileSync(reviewsFile, 'utf8'));
    } catch {
      return {};
    }
  };

  /** A review keeps only what it should have, or is refused */
  function cleanReview(r) {
    const text = (v, max) => v === undefined || (typeof v === 'string' && v.length <= max);
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    if (r.code !== undefined && !(typeof r.code === 'string' && DRAWER_CODE.test(r.code.toUpperCase()))) return null;
    const pockets = r.pockets ?? {};
    if (typeof pockets !== 'object' || Array.isArray(pockets) || Object.keys(pockets).length > 100) return null;
    const out = { pockets: {} };
    if (r.code) out.code = r.code.toUpperCase();
    for (const [where, p] of Object.entries(pockets)) {
      if (where.length > 120 || !p || typeof p !== 'object') return null;
      const parts = p.parts ?? {};
      if (typeof parts !== 'object' || Array.isArray(parts)) return null;
      const verdicts = Object.entries(parts);
      if (verdicts.length > 400 || !verdicts.every(([n, v]) => PART_NUM.test(n) && (v === 'yes' || v === 'no'))) return null;
      const added = p.added ?? [];
      if (!Array.isArray(added) || added.length > 200 || !added.every((n) => typeof n === 'string' && PART_NUM.test(n))) return null;
      if (!text(p.label, 60) || !text(p.note, 1000) || !(p.done === undefined || typeof p.done === 'boolean')) return null;
      const kept = {};
      if (verdicts.length) kept.parts = Object.fromEntries(verdicts);
      if (added.length) kept.added = [...new Set(added)];
      if (p.label?.trim()) kept.label = p.label.trim();
      if (p.note?.trim()) kept.note = p.note.trim();
      if (p.done) kept.done = true;
      out.pockets[where] = kept;
    }
    return out;
  }

  async function saveReview(req, res, code) {
    if (!DRAFT_CODE.test(code)) return send(res, 400, { error: 'That isn’t a drawer code.' });
    let body;
    try {
      body = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8'));
    } catch {
      return send(res, 400, { error: 'That isn’t JSON.' });
    }
    const review = cleanReview(body);
    if (!review) return send(res, 400, { error: 'That isn’t a review.' });
    const all = readReviews();
    all[code] = { ...review, updated: Date.now() };
    fs.mkdirSync(photosDir, { recursive: true });
    fs.writeFileSync(`${reviewsFile}.tmp`, JSON.stringify(all, null, 1));
    fs.renameSync(`${reviewsFile}.tmp`, reviewsFile);
    return send(res, 200, all[code]);
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

  async function addPhoto(req, res, url) {
    const code = (url.searchParams.get('code') ?? '').toUpperCase();
    const view = url.searchParams.get('view') ?? 'piece';
    const ext = EXTENSIONS[(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()];
    if (!DRAWER_CODE.test(code)) return send(res, 400, { error: 'That isn’t a drawer code.' });
    if (!VIEWS.includes(view)) return send(res, 400, { error: 'That isn’t a kind of photo.' });
    if (!ext) return send(res, 415, { error: 'Photos need to be JPEG, PNG or WebP.' });
    const x = url.searchParams.get('x');
    const y = url.searchParams.get('y');
    const inRange = (v) => /^\d{1,2}$/.test(v ?? '');
    if ((x !== null || y !== null) && !(inRange(x) && inRange(y))) return send(res, 400, { error: 'That isn’t a place on the photo.' });
    const spot = x !== null && SPOTTED.includes(view) ? { x: Number(x), y: Number(y) } : null;
    const body = await readBody(req, MAX_PHOTO);
    if (!body.length) return send(res, 400, { error: 'That photo was empty.' });
    fs.mkdirSync(photosDir, { recursive: true });
    const name = nextPhotoName(code, view, ext, spot);
    fs.writeFileSync(path.join(photosDir, name), body, { flag: 'wx' });
    return send(res, 201, listPhotos().find((p) => p.name === name));
  }

  function photoFile(res, encoded) {
    let name = '';
    try {
      name = decodeURIComponent(encoded);
    } catch {
      /* falls through to not found */
    }
    // The pattern allows no slashes or dots beyond the extension, so a name can't leave the folder
    const file = PHOTO_NAME.test(name) ? path.join(photosDir, name) : null;
    if (!file || !fs.existsSync(file)) {
      send(res, 404, { error: 'No such photo.' });
      return null;
    }
    return file;
  }

  function info(req, res) {
    const port = req.socket.localPort;
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal && /^(192\.168|10)\./.test(a.address))
      .map((a) => `http://${a.address}:${port}/snap`);
    return send(res, 200, { urls: addresses, features: ['spots', 'refile', 'boxes', 'reviews', 'versions', 'read-now'] });
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
        else {
          let project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
          // The phone only needs the storage, not the whole collection
          const only = url.searchParams.get('only')?.split(',');
          if (only) project = Object.fromEntries(only.map((k) => [k, project[k]]));
          send(res, 200, project, { 'X-Rev': rev, 'Cache-Control': 'no-store' });
        }
      } else if (p === '/api/project' && req.method === 'PUT') await saveProject(req, res);
      else if (p === '/api/read-photos' && req.method === 'GET') send(res, 200, reader.state(), { 'Cache-Control': 'no-store' });
      else if (p === '/api/read-photos' && req.method === 'POST') {
        if (reader.ask()) send(res, 202, reader.state());
        else send(res, 503, { error: 'Photos can’t be read here: this needs Claude Code and the photo tool, which the Docker image has.' });
      }
      else if (p === '/api/versions' && req.method === 'GET') send(res, 200, listVersions(), { 'Cache-Control': 'no-store' });
      else if (p.startsWith('/api/versions/') && req.method === 'GET') {
        // The pattern allows no slashes or dots beyond the extension, so a name can't leave the folder
        const name = p.slice('/api/versions/'.length);
        const file = VERSION_NAME.test(name) ? path.join(versionsDir, name) : null;
        if (!file || !fs.existsSync(file)) send(res, 404, { error: 'No such version.' });
        else send(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')), { 'Cache-Control': 'no-store' });
      } else if (p === '/api/photos' && req.method === 'GET') send(res, 200, listPhotos(), { 'Cache-Control': 'no-store' });
      else if (p === '/api/photos' && req.method === 'POST') await addPhoto(req, res, url);
      else if (p.startsWith('/api/photos/') && req.method === 'GET') {
        const file = photoFile(res, p.slice('/api/photos/'.length));
        if (file) {
          // Links carry the photo's modified time, so a reused name can't show the old picture
          res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).slice(1).toLowerCase()], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=31536000, immutable' });
          fs.createReadStream(file).pipe(res);
        }
      } else if (p === '/api/boxes' && req.method === 'GET') send(res, 200, readBoxes(), { 'Cache-Control': 'no-store' });
      else if (p === '/api/drafts' && req.method === 'GET') send(res, 200, readDrafts(), { 'Cache-Control': 'no-store' });
      else if (p === '/api/reviews' && req.method === 'GET') send(res, 200, readReviews(), { 'Cache-Control': 'no-store' });
      else if (p.startsWith('/api/reviews/') && req.method === 'PUT') await saveReview(req, res, decodeURIComponent(p.slice('/api/reviews/'.length)).toUpperCase());
      else if (p.startsWith('/api/boxes/') && req.method === 'PUT') await saveBoxes(req, res, decodeURIComponent(p.slice('/api/boxes/'.length)).toUpperCase());
      else if (p.startsWith('/api/photos/') && req.method === 'PATCH') {
        const file = photoFile(res, p.slice('/api/photos/'.length));
        if (file) await changePhoto(req, res, file);
      } else if (p.startsWith('/api/photos/') && req.method === 'DELETE') {
        const file = photoFile(res, p.slice('/api/photos/'.length));
        if (file) {
          fs.unlinkSync(file);
          send(res, 200, { ok: true });
        }
      } else if (p === '/api/info' && req.method === 'GET') info(req, res);
      else send(res, 404, { error: 'Not found.' });
    } catch (e) {
      // A body cut short by the limit leaves the connection unusable, so close it after answering
      if (!res.headersSent) send(res, e.status ?? 500, { error: e.message }, e.status === 413 ? { Connection: 'close' } : {});
      else res.destroy();
    }
    return true;
  };
}
