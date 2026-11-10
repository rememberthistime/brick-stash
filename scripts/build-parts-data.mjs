// Builds public/data/parts.json from Rebrickable's free catalogue downloads.
// Usage: npm run fetch-data   (re-downloads)   |   node scripts/build-parts-data.mjs --offline
// Data: https://rebrickable.com/downloads/ — please keep the attribution in the app footer.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'data-raw');
const outFile = join(root, 'public', 'data', 'parts.json');
const BASE = 'https://cdn.rebrickable.com/media/downloads/';
const FILES = ['parts.csv.gz', 'part_categories.csv.gz', 'part_relationships.csv.gz'];
const offline = process.argv.includes('--offline');

mkdirSync(rawDir, { recursive: true });
for (const f of FILES) {
  const dest = join(rawDir, f);
  if (offline && existsSync(dest)) continue;
  process.stdout.write(`Downloading ${f}... `);
  const res = await fetch(BASE + f);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log('ok');
}

const readCsv = (f) =>
  Papa.parse(gunzipSync(readFileSync(join(rawDir, f))).toString('utf8'), { header: true, skipEmptyLines: true }).data;

const categories = Object.fromEntries(readCsv('part_categories.csv.gz').map((r) => [r.id, r.name]));
const STICKERS = '58';
const rows = readCsv('parts.csv.gz');
const all = new Set(rows.map((r) => r.part_num));

// Printed / patterned variants are stored with their base mould, so they don't need their own
// entry when the base exists — the app strips the suffix at import time (see baseMould()).
const variant = /^(.+?)(pr|pat|ps)\d+[a-z]?$/;
const parts = {};
for (const r of rows) {
  if (r.part_cat_id === STICKERS) continue;
  const m = r.part_num.match(variant);
  if (m && all.has(m[1])) continue;
  parts[r.part_num] = [r.name, Number(r.part_cat_id)];
}

// Aliases: print (P), pattern (T), mould revision (M) and alternate (A) → parent, so e.g. 3069b and
// 3069a land in the same group. Only store ones the suffix-stripping rule wouldn't already resolve.
const direct = {};
for (const r of readCsv('part_relationships.csv.gz')) {
  if (!['P', 'T', 'M', 'A'].includes(r.rel_type) || r.child_part_num === r.parent_part_num) continue;
  direct[r.child_part_num] ??= r.parent_part_num;
}
const resolve = (p) => {
  for (let i = 0; i < 6 && direct[p]; i++) p = direct[p];
  return p;
};
const strip = (p) => {
  const m = p.match(variant);
  return m && all.has(m[1]) ? m[1] : p;
};
const aliases = {};
for (const child of Object.keys(direct)) {
  const target = resolve(child);
  if (strip(child) !== target && target !== child) aliases[child] = target;
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ built: new Date().toISOString().slice(0, 10), categories, parts, aliases }));
console.log(`Wrote ${Object.keys(parts).length} parts, ${Object.keys(aliases).length} aliases, ${Object.keys(categories).length} categories → ${outFile}`);
