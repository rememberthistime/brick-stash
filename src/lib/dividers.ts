// Divider layouts for shared compartments. Sections become pockets arranged in rows: long dividers
// between rows, short ones between pockets in a row. The arrangement with the most comfortable pockets
// wins, and when a compartment holds little, its pockets are kept compact and the rest left as a free bay.
import { leaves, type PlannedCompartment, type Section } from './planner';
import { parseSize } from './taxonomy';

/** Narrower than this and fingers don't fit to pick parts out */
const MIN_POCKET = 40;
/** Round cut positions to make them easy to mark out */
const STEP = 5;
/** A free bay must be at least this deep, and this share of the compartment, to be worth a divider */
const MIN_BAY = 60;
const MIN_BAY_SHARE = 0.4;
/** Each short divider is fiddlier to fit than a full-length one, so it has to earn its place */
const SHORT_DIVIDER_COST = 0.2;
/** Beyond this many sections, trying every arrangement gets slow; rows are made evenly instead */
const MAX_EXHAUSTIVE = 10;
const STUD = 8; // mm
const TOO_SMALL_COST = 100;
/** Wheels and tyres are named in millimetres, not studs */
const WHEELS_AND_TYRES = 29;

/** x is measured from the left of the compartment, y from the front; w across, d front to back */
export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface Pocket extends Rect {
  section: Section;
}

export interface Divider {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  /** runs only part of the way across, between two longer dividers or walls */
  short: boolean;
}

export interface DividerLayout {
  height: number;
  pockets: Pocket[];
  dividers: Divider[];
  /** part of the compartment deliberately left unused */
  free: Rect | null;
  /** a single group that needs no divider to stay separate: only a tidier option, left off the cutting list */
  optional: boolean;
}

/** Cut a length into consecutive pieces in proportion to weights, each at least MIN_POCKET; null if it can't be done */
function cutUp(length: number, weights: number[]): number[] | null {
  const n = weights.length;
  if (length < MIN_POCKET * n) return null;
  const total = weights.reduce((t, w) => t + w, 0) || 1;
  const spare = length - MIN_POCKET * n;
  const edges = [0];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += MIN_POCKET + (spare * weights[i]) / total;
    // Round each cut (not each size) so rounding errors don't accumulate, keeping both neighbours wide enough
    const snapped = Math.round(acc / STEP) * STEP;
    edges.push(Math.min(Math.max(snapped, edges[i] + MIN_POCKET), length - MIN_POCKET * (n - i - 1)));
  }
  edges.push(length);
  return edges;
}

/** The biggest part in a section, lying flat, in mm: a pocket has to be able to hold it */
function largestPart(section: Section): { short: number; long: number } {
  let short = 0;
  let long = 0;
  for (const { part } of leaves(section.node)) {
    if (!part || part.catId === WHEELS_AND_TYRES || /\d\s*mm\b/i.test(part.name)) continue;
    const size = parseSize(part.name);
    if (!size) continue;
    short = Math.max(short, size.a * STUD);
    long = Math.max(long, size.b * STUD);
  }
  return { short, long };
}

interface Arrangement {
  pockets: Pocket[];
  dividers: Divider[];
  score: number;
}

/**
 * Lay sections out in the given rows. Rows stack along `along` ('d': front to back, so long dividers
 * run left to right; 'w': left to right, so long dividers run front to back).
 */
function arrange(rows: number[][], sections: Section[], areas: number[], box: { w: number; d: number }, along: 'w' | 'd'): Arrangement | null {
  const length = along === 'd' ? box.d : box.w;
  const span = along === 'd' ? box.w : box.d;
  const rowEdges = cutUp(length, rows.map((r) => r.reduce((t, i) => t + areas[i], 0)));
  if (!rowEdges) return null;

  const pockets: Pocket[] = [];
  const dividers: Divider[] = [];
  const line = (at: number, from: number, to: number, short: boolean): Divider =>
    along === 'd' ? { x1: from, x2: to, y1: at, y2: at, length: to - from, short } : { x1: at, x2: at, y1: from, y2: to, length: to - from, short };

  for (const [r, row] of rows.entries()) {
    const start = rowEdges[r];
    const thick = rowEdges[r + 1] - start;
    const edges = cutUp(span, row.map((i) => areas[i]));
    if (!edges) return null;
    for (const [k, i] of row.entries()) {
      const a = edges[k];
      const size = edges[k + 1] - a;
      pockets[i] = { section: sections[i], ...(along === 'd' ? { x: a, y: start, w: size, d: thick } : { x: start, y: a, w: thick, d: size }) };
    }
    if (r > 0) dividers.push(line(start, 0, span, false));
    // Short dividers cross the row
    for (const e of edges.slice(1, -1)) dividers.push(along === 'd' ? { x1: e, x2: e, y1: start, y2: start + thick, length: thick, short: true } : { x1: start, x2: start + thick, y1: e, y2: e, length: thick, short: true });
  }

  // Long thin pockets are awkward to reach into, weighted by how much of the compartment they take
  const total = areas.reduce((t, a) => t + a, 0) || 1;
  const awkward = pockets.reduce((t, p, i) => t + (areas[i] / total) * Math.max(0, Math.max(p.w, p.d) / Math.min(p.w, p.d) - 2), 0);
  // A pocket a part can't lie flat in costs far more than an awkward one, but is better than no plan at all
  const tooSmall = pockets.filter((p) => {
    const part = largestPart(p.section);
    return Math.min(p.w, p.d) < part.short || Math.max(p.w, p.d) < part.long;
  }).length;
  return { pockets, dividers, score: awkward + SHORT_DIVIDER_COST * dividers.filter((d) => d.short).length + TOO_SMALL_COST * tooSmall };
}

/** Every way to split sections, in reading order, into consecutive rows */
function rowChoices(n: number): number[][][] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (n > MAX_EXHAUSTIVE) {
    const perRow = Math.ceil(Math.sqrt(n));
    const rows: number[][] = [];
    for (let i = 0; i < n; i += perRow) rows.push(all.slice(i, i + perRow));
    return [rows, [all]];
  }
  const out: number[][][] = [];
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    const rows: number[][] = [[0]];
    for (let i = 1; i < n; i++) {
      if (mask & (1 << (i - 1))) rows.push([i]);
      else rows[rows.length - 1].push(i);
    }
    out.push(rows);
  }
  return out;
}

function best(sections: Section[], areas: number[], box: { w: number; d: number }): Arrangement | null {
  let top: Arrangement | null = null;
  for (const rows of rowChoices(sections.length)) {
    for (const along of ['d', 'w'] as const) {
      const a = arrange(rows, sections, areas, box, along);
      if (a && (!top || a.score < top.score)) top = a;
    }
  }
  return top;
}

const cache = new WeakMap<PlannedCompartment, Map<number, DividerLayout | null>>();

/**
 * The layout for one compartment. `fill` is how full a pocket should be planned to (height-wise,
 * growth allowance included), which sets how much floor each section needs.
 */
export function dividerLayout(c: PlannedCompartment, fill: number): DividerLayout | null {
  const known = cache.get(c)?.get(fill);
  if (known !== undefined) return known;
  const result = computeLayout(c, fill);
  if (!cache.has(c)) cache.set(c, new Map());
  cache.get(c)!.set(fill, result);
  return result;
}

function computeLayout(c: PlannedCompartment, fill: number): DividerLayout | null {
  const n = c.sections.length;
  const { w, d, h, maxSections } = c.comp;
  if (!n || maxSections < 2) return null;
  const areas = c.sections.map((s) => Math.max(MIN_POCKET * MIN_POCKET, (s.volume * 1000) / (h * fill)));
  const needed = areas.reduce((t, a) => t + a, 0);

  // Holding little? Keep the pockets at one end of the long side and leave the rest as a free bay
  const longIsDepth = d >= w;
  const long = longIsDepth ? d : w;
  const short = longIsDepth ? w : d;
  const used = Math.max(MIN_POCKET, Math.ceil(needed / short / STEP) * STEP);
  const bay = long - used;
  if (bay >= MIN_BAY && bay >= MIN_BAY_SHARE * long) {
    const box = longIsDepth ? { w, d: used } : { w: used, d };
    const a = best(c.sections, areas, box);
    if (a) {
      const wall: Divider = longIsDepth ? { x1: 0, x2: w, y1: used, y2: used, length: w, short: false } : { x1: used, x2: used, y1: 0, y2: d, length: d, short: false };
      const free: Rect = longIsDepth ? { x: 0, y: used, w, d: bay } : { x: used, y: 0, w: bay, d };
      return { height: h, pockets: a.pockets, dividers: [...a.dividers, wall], free, optional: n === 1 };
    }
  }
  if (n === 1) return null;
  const a = best(c.sections, areas, { w, d });
  return a && { height: h, pockets: a.pockets, dividers: a.dividers, free: null, optional: false };
}

export interface CutListLine {
  length: number;
  height: number;
  count: number;
}

/** Dividers needed across the whole plan, grouped by size */
export function cuttingList(compartments: PlannedCompartment[], fill: number): CutListLine[] {
  const lines = new Map<string, CutListLine>();
  for (const c of compartments) {
    const l = dividerLayout(c, fill);
    if (!l || l.optional) continue;
    for (const v of l.dividers) {
      const key = `${v.length}x${l.height}`;
      const line = lines.get(key) ?? { length: v.length, height: l.height, count: 0 };
      line.count++;
      lines.set(key, line);
    }
  }
  return [...lines.values()].sort((a, b) => b.count - a.count || b.length - a.length);
}
