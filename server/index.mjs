// Runs the built app for every device on the network: `npm run serve`, or the Docker image.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createApi, defaultDirs, UPSTREAMS } from './api.mjs';
import { createReader, readerDefaults } from './reader.mjs';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT ?? 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.svg': 'image/svg+xml', '.png': 'image/png' };

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('No built app found. Run "npm run build" first, or use "npm run serve".');
  process.exit(1);
}

const dirs = defaultDirs();
// In Docker, HOME is a folder in the data volume, so Claude's sign-in outlives updates to the image. It has to
// exist before anyone signs in.
if (process.env.HOME) fs.mkdirSync(process.env.HOME, { recursive: true });
const reader = createReader(readerDefaults(dirs));
const api = createApi({ ...dirs, reader });
/** When photos are read each day, by this machine's clock: "21:07", or "off" */
const READ_AT = process.env.BRICK_READ_AT ?? '21:07';

async function proxy(req, res, upstream, rest) {
  const headers = { ...req.headers };
  for (const h of ['host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer']) delete headers[h];
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const reply = await fetch(upstream + rest, { method: req.method, headers, body: hasBody ? req : undefined, duplex: hasBody ? 'half' : undefined });
  const out = { 'Content-Type': reply.headers.get('content-type') ?? 'application/octet-stream' };
  const retry = reply.headers.get('retry-after');
  if (retry) out['Retry-After'] = retry;
  const cache = reply.headers.get('cache-control');
  if (cache) out['Cache-Control'] = cache;
  res.writeHead(reply.status, out);
  if (reply.body) Readable.fromWeb(reply.body).pipe(res);
  else res.end();
}

function serveFile(req, res, pathname) {
  let wanted;
  try {
    wanted = path.resolve(DIST, `.${decodeURIComponent(pathname)}`);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const inside = wanted === DIST || wanted.startsWith(DIST + path.sep);
  // Anything that isn't a file is a page of the app, such as /snap
  const file = inside && fs.existsSync(wanted) && fs.statSync(wanted).isFile() ? wanted : path.join(DIST, 'index.html');
  const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' };
  if (pathname.startsWith('/assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else headers['Cache-Control'] = 'no-cache';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (await api(req, res)) return;
    const url = new URL(req.url, 'http://local');
    const prefix = Object.keys(UPSTREAMS).find((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
    if (prefix) await proxy(req, res, UPSTREAMS[prefix], url.pathname.slice(prefix.length) + url.search);
    else if (req.method === 'GET' || req.method === 'HEAD') serveFile(req, res, url.pathname);
    else res.writeHead(405).end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(502).end();
    else res.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Brick Stash is running.\n  On this computer: http://localhost:${PORT}`);
  for (const a of Object.values(os.networkInterfaces()).flat()) {
    if (a && a.family === 'IPv4' && !a.internal && /^(192\.168|10)\./.test(a.address)) console.log(`  On your phone:    http://${a.address}:${PORT}/snap`);
  }
  console.log(`  Project: ${dirs.dataDir}\n  Photos:  ${dirs.photosDir}`);
  if (!reader.state().available) console.log('  Photo reading: not available here (it needs Claude Code and the photo tool, which the Docker image has).');
  else {
    const next = reader.schedule(READ_AT);
    console.log(`  Photo reading: on request${next ? `, and daily at ${READ_AT} if there’s anything new (next: ${next.toLocaleString('en-AU')})` : ' only (BRICK_READ_AT is off)'}`);
  }
});
