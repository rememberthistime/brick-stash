// Rebrickable API v3 (https://rebrickable.com/api/v3/docs/) via the dev-server proxy at /rb-api.
// Users supply their own free API key from rebrickable.com → Profile → Settings → API.
import Papa from 'papaparse';
import type { InventoryRow } from './types';

const BASE = '/rb-api';

/** Times to wait out Rebrickable's rate limit before giving up on a request */
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_WAIT = 10_000;

export class BadKeyError extends Error {}

async function get<T>(path: string, key: string): Promise<T> {
  const url = path.startsWith('http') ? path.replace('https://rebrickable.com/api/v3', BASE) : BASE + path;
  const headers = { Authorization: `key ${key}`, Accept: 'application/json' };
  let res = await fetch(url, { headers });
  for (let i = 0; res.status === 429 && i < RATE_LIMIT_RETRIES; i++) {
    await pause(RATE_LIMIT_WAIT * (i + 1));
    res = await fetch(url, { headers });
  }
  if (res.status === 401 || res.status === 403) throw new BadKeyError('Rebrickable rejected the API key.');
  if (res.status === 404) throw new Error('not found on Rebrickable');
  if (res.status === 429) throw new Error('Rebrickable rate limit hit — wait a minute and try again.');
  if (!res.ok) throw new Error(`Rebrickable error ${res.status}`);
  return res.json();
}

interface Page<T> {
  next: string | null;
  results: T[];
}

interface SetPart {
  part: { part_num: string; name: string };
  color: { name: string };
  quantity: number;
  is_spare: boolean;
}

export const normaliseSetNum = (s: string) => (/-\d+$/.test(s.trim()) ? s.trim() : `${s.trim()}-1`);

/** All parts in a set, including minifig parts; spares are flagged so callers can treat them differently */
export async function setParts(setNum: string, key: string, copies = 1): Promise<InventoryRow[]> {
  const rows: InventoryRow[] = [];
  let url: string | null = `/lego/sets/${encodeURIComponent(normaliseSetNum(setNum))}/parts/?page_size=1000&inc_minifig_parts=1`;
  while (url) {
    const page: Page<SetPart> = await get<Page<SetPart>>(url, key);
    for (const r of page.results)
      rows.push({ partNum: r.part.part_num, name: r.part.name, colour: r.color.name, qty: r.quantity * copies, ...(r.is_spare ? { spare: true } : {}) });
    url = page.next;
    if (url) await pause(1100); // Rebrickable allows ~1 request/second
  }
  return rows;
}

/** Set name, for labelling */
export async function setName(setNum: string, key: string): Promise<string> {
  const s = await get<{ name: string }>(`/lego/sets/${encodeURIComponent(normaliseSetNum(setNum))}/`, key);
  return s.name;
}

export interface WantedSet {
  setNum: string;
  copies: number;
}

/** The same set listed twice (Rebrickable does this for different inventory versions) means two copies */
function mergeCopies(sets: WantedSet[]): WantedSet[] {
  const byNum = new Map<string, number>();
  for (const s of sets) byNum.set(s.setNum, (byNum.get(s.setNum) ?? 0) + s.copies);
  return [...byNum].map(([setNum, copies]) => ({ setNum, copies }));
}

const SET_COLS = ['set number', 'set_num', 'set num', 'setnumber', 'set', 'set id'];
const COPY_COLS = ['quantity', 'qty', 'count', 'copies'];

/** A set list spreadsheet (Rebrickable's export: Set Number, Quantity, …); null if the text isn't one */
export function parseSetList(text: string): WantedSet[] | null {
  const res = Papa.parse<Record<string, string>>(text.trim().replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const fields = res.meta.fields ?? [];
  const setCol = fields.find((f) => SET_COLS.includes(f));
  if (!setCol) return null;
  const copyCol = fields.find((f) => COPY_COLS.includes(f));
  const sets = res.data
    .map((r) => ({ setNum: (r[setCol] ?? '').trim(), copies: Math.max(1, Math.round(Number(copyCol ? r[copyCol] : 1)) || 1) }))
    .filter((s) => s.setNum)
    .map((s) => ({ ...s, setNum: normaliseSetNum(s.setNum) }));
  return mergeCopies(sets);
}

/** Parse "10294", "10294-1 x2", "75192 2" lines (or a pasted set list) into set numbers and copy counts */
export function parseSetLines(text: string): WantedSet[] {
  const list = parseSetList(text);
  if (list) return list;
  const sets = text
    .split(/[\n,;]+/)
    .map((s) => s.trim().match(/^(\S+)(?:\s*[x×]?\s*(\d+))?$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    // A bare one- or two-digit number is a stray spreadsheet column, not a set
    .filter((m) => !/^\d{1,2}$/.test(m[1]))
    .map((m) => ({ setNum: normaliseSetNum(m[1]), copies: Number(m[2] ?? 1) }));
  return mergeCopies(sets);
}

export const formatSetLines = (sets: WantedSet[]) => sets.map((s) => (s.copies > 1 ? `${s.setNum} x${s.copies}` : s.setNum)).join('\n');

/** Look up the Rebrickable part number for a BrickLink id */
export async function resolveBrickLinkId(blId: string, key: string): Promise<string | null> {
  const page = await get<Page<{ part_num: string }>>(`/lego/parts/?bricklink_id=${encodeURIComponent(blId)}`, key);
  return page.results[0]?.part_num ?? null;
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
