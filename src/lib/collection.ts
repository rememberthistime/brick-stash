// Parsing imported spreadsheets/exports and merging colours into moulds.
import Papa from 'papaparse';
import type { Catalog, InventoryRow, Part } from './types';
import { estimateUnitVolume } from './volume';

const PART_COLS = ['part', 'part_num', 'part num', 'partnum', 'part number', 'item no', 'item no.', 'itemid', 'item id', 'item number', 'design id', 'design', 'blitemno', 'element id'];
const QTY_COLS = ['quantity', 'qty', 'count', 'minqty', 'amount', 'number', 'total'];
const COLOUR_COLS = ['color', 'colour', 'color name', 'colour name', 'color_id', 'colorid', 'color id'];
const NAME_COLS = ['name', 'part name', 'description', 'item name'];
const SPARE_COLS = ['is spare', 'is_spare', 'spare', 'isspare'];

export interface ImportResult {
  rows: InventoryRow[];
  warnings: string[];
}

export function parseInventory(text: string): ImportResult {
  const trimmed = text.trim().replace(/^﻿/, '');
  if (trimmed.startsWith('<')) return parseBrickLinkXml(trimmed);
  return parseDelimited(trimmed);
}

function parseDelimited(text: string): ImportResult {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fields = res.meta.fields ?? [];
  const find = (cands: string[]) => fields.find((f) => cands.includes(f));
  const partCol = find(PART_COLS);
  const qtyCol = find(QTY_COLS);
  if (!partCol) {
    return { rows: [], warnings: [`Couldn't find a part number column. Headers seen: ${fields.join(', ') || '(none)'}. Expected one of: Part, Part Num, Item No, Design ID.`] };
  }
  const colourCol = find(COLOUR_COLS);
  const nameCol = find(NAME_COLS);
  const spareCol = find(SPARE_COLS);
  const warnings: string[] = [];
  if (!qtyCol) warnings.push('No quantity column found — assuming 1 of each row.');

  const rows: InventoryRow[] = [];
  let skipped = 0;
  for (const r of res.data) {
    const partNum = (r[partCol] ?? '').trim();
    const qty = qtyCol ? Number(String(r[qtyCol]).replace(/[^\d.]/g, '')) : 1;
    if (!partNum || !(qty > 0)) {
      skipped++;
      continue;
    }
    const spare = spareCol ? /^(true|t|yes|y|1)$/i.test(String(r[spareCol]).trim()) : undefined;
    rows.push({ partNum, qty: Math.round(qty), colour: colourCol ? r[colourCol]?.trim() : undefined, name: nameCol ? r[nameCol]?.trim() : undefined, ...(spare ? { spare } : {}) });
  }
  if (skipped) warnings.push(`Skipped ${skipped} rows with no part number or zero quantity.`);
  return { rows, warnings };
}

/** BrickLink wanted-list / inventory XML: <INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>11</COLOR><MINQTY>4</MINQTY></ITEM>… */
function parseBrickLinkXml(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return { rows: [], warnings: ['That XML could not be parsed.'] };
  const get = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent?.trim();
  const rows: InventoryRow[] = [];
  let nonParts = 0;
  for (const item of Array.from(doc.getElementsByTagName('ITEM'))) {
    const type = get(item, 'ITEMTYPE');
    if (type && type !== 'P') {
      nonParts++;
      continue;
    }
    const partNum = get(item, 'ITEMID');
    const qty = Number(get(item, 'MINQTY') ?? get(item, 'QTY') ?? 1);
    if (partNum && qty > 0) rows.push({ partNum, qty, colour: get(item, 'COLOR') });
  }
  return { rows, warnings: nonParts ? [`Ignored ${nonParts} non-part items (sets/minifigs) — break them down into parts first.`] : [] };
}

const VARIANT = /^(.+?)(pr|pat|ps)\d+[a-z]?$/;

/** BrickLink ids that differ from Rebrickable's (checked against the Rebrickable catalogue) */
const BRICKLINK_ALIASES: Record<string, string> = {
  '4073': '6141', // Plate Round 1 x 1
  '4085d': '60897', // Plate Special 1 x 1 with Clip Vertical [Thick Open O Clip]
};

/** BrickLink-style minifig assembly ids (970c00, 973pb0001c01, 3626cpb…) we can still file sensibly */
const ID_PATTERNS: [RegExp, number, string][] = [
  [/^970c/, 61, 'Minifig legs'],
  [/^973/, 60, 'Minifig torso'],
  [/^3626/, 59, 'Minifig head'],
];

/** Map variants (3001pr0001, 3069b, BrickLink ids) onto the canonical mould used for grouping */
export function baseMould(partNum: string, catalog: Catalog | null): string {
  let p = partNum.trim();
  if (!catalog) return p.replace(VARIANT, '$1');
  p = BRICKLINK_ALIASES[p] ?? p;
  for (let i = 0; i < 6; i++) {
    const next = catalog.aliases?.[p] ?? (catalog.parts[p] ? undefined : stripVariant(p, catalog));
    if (!next || next === p) break;
    p = next;
  }
  if (catalog.parts[p]) return p;
  // BrickLink sometimes drops a/b suffixes that Rebrickable keeps (3069 → 3069b)
  for (const s of ['b', 'a', 'c']) if (catalog.parts[p + s]) return baseMould(p + s, catalog);
  return p;
}

function stripVariant(p: string, catalog: Catalog) {
  const m = p.match(VARIANT);
  return m && (catalog.parts[m[1]] || catalog.aliases?.[m[1]]) ? m[1] : undefined;
}

export function mergeToParts(rows: InventoryRow[], catalog: Catalog | null, overrides: Record<string, number> = {}): Part[] {
  const byMould = new Map<string, { qty: number; colours: Set<string>; variants: Map<string, number>; name?: string }>();
  for (const r of rows) {
    const key = baseMould(r.partNum, catalog);
    const e = byMould.get(key) ?? { qty: 0, colours: new Set<string>(), variants: new Map(), name: r.name };
    e.qty += r.qty;
    if (r.colour) e.colours.add(r.colour);
    const v = r.partNum.trim();
    e.variants.set(v, (e.variants.get(v) ?? 0) + r.qty);
    byMould.set(key, e);
  }
  return Array.from(byMould, ([partNum, e]) => {
    const info = catalog?.parts[partNum];
    // Show the name of the variant the user actually has most of (e.g. "Tile 1 x 2 with Groove", not the 1970s original)
    const top = [...e.variants].sort((a, b) => b[1] - a[1])[0][0];
    const topInfo = catalog?.parts[top];
    const pattern = info ? undefined : ID_PATTERNS.find(([re]) => re.test(partNum));
    const name = topInfo?.[0] ?? info?.[0] ?? e.name ?? (pattern ? `${pattern[2]} ${partNum}` : partNum);
    const catId = info?.[1] ?? pattern?.[1] ?? null;
    return {
      partNum,
      name,
      catId,
      qty: e.qty,
      colours: Math.max(1, e.colours.size),
      unitVolume: estimateUnitVolume(name, catId),
      volumeOverride: overrides[partNum],
      known: !!info,
    };
  });
}

export interface SubtractResult {
  parts: Part[];
  /** pieces actually taken off */
  removed: number;
  /** excluded pieces the collection didn't have enough of — a sign the lists don't match */
  missing: { partNum: string; name: string; qty: number }[];
}

/**
 * Take excluded parts (e.g. sets kept built) off the collection, mould by mould — colour doesn't
 * matter for storage. Spares are skipped: a built set's spares are still loose in the boxes.
 */
export function subtractParts(parts: Part[], excluded: InventoryRow[], catalog: Catalog | null): SubtractResult {
  const take = new Map<string, number>();
  for (const r of excluded) {
    if (r.spare) continue;
    const k = baseMould(r.partNum, catalog);
    take.set(k, (take.get(k) ?? 0) + r.qty);
  }
  let removed = 0;
  const out: Part[] = [];
  for (const p of parts) {
    const t = take.get(p.partNum) ?? 0;
    take.delete(p.partNum);
    const off = Math.min(t, p.qty);
    removed += off;
    if (t > p.qty) take.set(p.partNum, t - p.qty);
    if (p.qty - off > 0) out.push(off ? { ...p, qty: p.qty - off } : p);
  }
  const missing = [...take]
    .map(([partNum, qty]) => ({ partNum, qty, name: catalog?.parts[partNum]?.[0] ?? partNum }))
    .sort((a, b) => b.qty - a.qty);
  return { parts: out, removed, missing };
}

/** One piece's volume in cm³: a value set by hand, else the estimate corrected by measurements or the volume scale */
export const onePieceVolume = (p: Part, scale = 1) => p.volumeOverride ?? p.unitVolume * (p.scaleFactor ?? scale);

export const partVolume = (p: Part, scale = 1) => onePieceVolume(p, scale) * p.qty;

export const TEMPLATE_CSV = 'Part,Color,Quantity,Name\n3001,Red,24,Brick 2 x 4\n3023,Light Bluish Gray,60,Plate 1 x 2\n3069b,Black,40,Tile 1 x 2 with Groove\n';
