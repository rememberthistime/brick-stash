import type { Granularity, Part, Settings, StorageUnit } from './types';
import { FAMILIES, bucketOrder, catOrder, familyFor, familyGroup, familyOrder, parseSize, sizeBucket } from './taxonomy';
import { compartmentVolume } from './volume';
import { partVolume } from './collection';
import { inReachOrder, withUnitCodes } from './codes';

// ─── Tree ────────────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  label: string;
  familyKey: string;
  children: TreeNode[];
  part?: Part;
  pieces: number;
  volume: number;
  /** pre-order position — canonical "reading order" for layout */
  seq: number;
  /** synthetic "Other …" lumps aren't split further unless forced */
  lump?: boolean;
  /** synthetic: tiny siblings sharing one section (made during layout) */
  merged?: boolean;
  parent?: TreeNode;
  /** what a section started as, and the parts moved into it by hand */
  plus?: { base: string; added: TreeNode[] };
  /** a group held together by hand sorts as its main part would */
  sortAs?: Part;
}

/** "Brick 2 x 6 + Brick 4 x 6", or "Brick 2 x 6 + 3 more" */
export function plusLabel(base: string, added: TreeNode[]) {
  if (!added.length) return base;
  return added.length === 1 ? `${base} + ${added[0].label}` : `${base} + ${added.length} more`;
}

/** One section for several tiny siblings, e.g. "Plates Special 1 × 1–2 (mixed)" */
function mergeNodes(a: TreeNode, b: TreeNode): TreeNode {
  const members = [...(a.merged ? a.children : [a]), b];
  const parent = a.parent!;
  return {
    id: `${parent.id}/~mix:${members[0].id}`,
    label: `${parent.label.replace(/ — other$/, '')} (mixed)`,
    familyKey: a.familyKey,
    children: members,
    pieces: members.reduce((t, m) => t + m.pieces, 0),
    volume: members.reduce((t, m) => t + m.volume, 0),
    seq: members[0].seq,
    lump: true,
    merged: true,
    parent,
  };
}

/** Which part each part ends up stored with, following chains; a part in a loop or left alone stays where it is */
function togetherHosts(parts: Part[], together: Record<string, string>) {
  const present = new Set(parts.map((p) => p.partNum));
  const hostOf = (num: string): string | null => {
    const seen = new Set([num]);
    let at = num;
    while (together[at] && present.has(together[at])) {
      at = together[at];
      if (seen.has(at)) return null;
      seen.add(at);
    }
    return at === num ? null : at;
  };
  const guests = new Map<string, Part[]>();
  for (const p of parts) {
    const host = hostOf(p.partNum);
    if (host) guests.set(host, [...(guests.get(host) ?? []), p]);
  }
  return { guests, isGuest: (p: Part) => hostOf(p.partNum) != null };
}

export function buildTree(parts: Part[], categories: Record<string, string>, volumeScale = 1, together: Record<string, string> = {}): TreeNode {
  const root: TreeNode = { id: 'root', label: 'Collection', familyKey: '', children: [], pieces: 0, volume: 0, seq: 0 };
  const child = (parent: TreeNode, id: string, label: string, familyKey: string) => {
    let c = parent.children.find((n) => n.id === id);
    if (!c) {
      c = { id, label, familyKey, children: [], pieces: 0, volume: 0, seq: 0 };
      parent.children.push(c);
    }
    return c;
  };

  // Group parts by category first so we know whether a size-bucket level is worth having
  const { guests, isGuest } = togetherHosts(parts, together);
  const byCat = new Map<string, Part[]>();
  for (const p of parts) {
    if (isGuest(p)) continue;
    const k = String(p.catId ?? 'none');
    byCat.set(k, [...(byCat.get(k) ?? []), p]);
  }
  for (const [catKey, catParts] of byCat) {
    const catId = catKey === 'none' ? null : Number(catKey);
    const fam = familyFor(catId);
    const famNode = child(root, fam.key, fam.label, fam.key);
    const catName = catId == null ? 'Unknown parts' : categories[catId] ?? `Category ${catId}`;
    const catNode = fam.cats.length === 1 || catId == null ? famNode : child(famNode, `${fam.key}/${catKey}`, catName, fam.key);
    const buckets = new Set(catParts.map((p) => sizeBucket(p.name, fam.key)));
    for (const p of catParts) {
      const b = sizeBucket(p.name, fam.key);
      const parent = buckets.size > 1 && b ? child(catNode, `${catNode.id}/${b}`, `${catNode.label} ${b}`, fam.key) : catNode;
      const leafOf = (x: Part): TreeNode => ({ id: `part:${x.partNum}`, label: x.name, familyKey: fam.key, children: [], part: x, pieces: x.qty, volume: partVolume(x, volumeScale), seq: 0 });
      const added = (guests.get(p.partNum) ?? []).map(leafOf);
      parent.children.push(
        added.length
          ? // Parts stored together by hand plan as one group
            { id: `together:${p.partNum}`, label: plusLabel(p.name, added), familyKey: fam.key, children: [leafOf(p), ...added], pieces: 0, volume: 0, seq: 0, lump: true, plus: { base: p.name, added }, sortAs: p }
          : leafOf(p),
      );
    }
  }

  let seq = 0;
  const finish = (n: TreeNode): void => {
    n.seq = seq++;
    n.children.sort(compareNodes);
    for (const c of n.children) finish(c);
    // A group with a single sub-group adds a level without adding a choice — skip it
    n.children = n.children.map((c) => (!c.part && c.children.length === 1 ? c.children[0] : c));
    for (const c of n.children) c.parent = n;
    if (n.children.length) {
      n.pieces = n.children.reduce((t, c) => t + c.pieces, 0);
      n.volume = n.children.reduce((t, c) => t + c.volume, 0);
    }
  };
  finish(root);
  return root;
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  const partA = a.part ?? a.sortAs;
  const partB = b.part ?? b.sortAs;
  if (partA && partB) {
    const sa = parseSize(partA.name);
    const sb = parseSize(partB.name);
    if (sa && sb) return sa.a - sb.a || sa.b - sb.b || a.label.localeCompare(b.label);
    if (sa || sb) return sa ? -1 : 1;
    return a.label.localeCompare(b.label);
  }
  const fa = familyOrder(a.id);
  const fb = familyOrder(b.id);
  if (fa >= 0 && fb >= 0) return fa - fb;
  const ca = catOrder(Number(a.id.split('/')[1]));
  const cb = catOrder(Number(b.id.split('/')[1]));
  if (ca !== cb && a.id.split('/').length === 2) return ca - cb;
  const ba = bucketOrder(a.id.split('/').pop() ?? null);
  const bb = bucketOrder(b.id.split('/').pop() ?? null);
  if (ba !== bb) return ba - bb;
  return a.label.localeCompare(b.label);
}

export const leaves = (n: TreeNode): TreeNode[] => (n.children.length ? n.children.flatMap(leaves) : [n]);

// ─── Compartments ────────────────────────────────────────────────────────────

export interface Compartment {
  key: string;
  unitId: string;
  unitName: string;
  /** the unit's letter: the A in A1 */
  unitCode?: string;
  label: string;
  w: number;
  d: number;
  h: number;
  /** physical volume cm³ */
  volume: number;
  /** planned capacity cm³ (volume × target fill) */
  cap: number;
  maxSections: number;
  classKey: string;
  physOrder: number;
  accessibility: number;
}

export const targetFill = (s: Settings) => s.practicalFill / (1 + s.growth);

export function expandCompartments(units: StorageUnit[], s: Settings): Compartment[] {
  const out: Compartment[] = [];
  for (const u of inReachOrder(withUnitCodes(units))) {
    for (const spec of u.compartments) {
      for (let i = 0; i < spec.qty; i++) {
        const volume = compartmentVolume(spec);
        // sections need a usable footprint (~45 mm square) to be worth a divider
        const footprintSections = Math.floor(spec.w / 45) * Math.floor(spec.d / 45);
        out.push({
          key: `${u.id}:${spec.id}:${i}`,
          unitId: u.id,
          unitName: u.name,
          unitCode: u.code,
          label: spec.qty > 1 ? `${spec.label} ${i + 1}` : spec.label,
          w: spec.w,
          d: spec.d,
          h: spec.h,
          volume,
          cap: volume * targetFill(s),
          maxSections: spec.noDividers ? 1 : Math.max(1, Math.min(s.maxSections, footprintSections)),
          classKey: `${spec.w}x${spec.d}x${spec.h}${spec.noDividers ? 'n' : ''}`,
          physOrder: out.length,
          accessibility: u.accessibility,
        });
      }
    }
  }
  return out;
}

// ─── Packing ─────────────────────────────────────────────────────────────────
//
// Similarity first, space second. Units of the same kind form a zone; families are poured into zones
// from the smallest compartments to the largest (by how big their groups typically are), then laid out
// in reading order within each zone, each family starting in a fresh compartment. When space runs
// short the plan gives up, in order: growth headroom, spare compartments, and only then lets
// neighbouring families share a compartment.

export interface Section {
  node: TreeNode;
  volume: number;
  pieces: number;
  /** when one big group spans several compartments: [index, of] */
  span?: [number, number];
}

interface Cell {
  comp: Compartment;
  sections: Section[];
  used: number;
  /** holds a different group from what's being placed now — takes nothing more */
  closed?: boolean;
}

/** Filled as one: a single compartment, or a whole unit whose compartments differ (a box with one large and four small cells) */
interface Box {
  cells: Compartment[];
}

interface Zone {
  label: string;
  unitIds: string[];
  boxes: Box[];
  /** median compartment volume — zones are filled smallest first */
  cellVolume: number;
}

interface Tier {
  fill: 'target' | 'practical';
  spares: boolean;
  share: boolean;
  note?: string;
}

const TIERS: Tier[] = [
  { fill: 'target', spares: true, share: false },
  { fill: 'practical', spares: true, share: false, note: 'Storage is tight: compartments are filled past the growth allowance (up to the practical maximum) so families can stay apart.' },
  { fill: 'practical', spares: false, share: false, note: 'Storage is tight: compartments are filled to the practical maximum and none are kept spare, so families can stay apart.' },
  { fill: 'practical', spares: false, share: true, note: 'Storage is too tight to keep every family apart, even filled to the practical maximum: neighbouring families share compartments where one ends and the next begins. More storage would separate them.' },
];

interface PackResult {
  cells: Cell[];
  spares: Map<string, string>;
  unplaced: Section[];
  unplacedVolume: number;
  /** non-leaf groups bigger than any compartment — must be split */
  tooBig: TreeNode[];
  tier: number;
  zones: { label: string; unitIds: string[]; families: string[] }[];
}

/** Extra room a section needs when sharing (divider, not perfectly proportioned sections) */
export const SHARE_OVERHEAD = 1.15;
/** Leftover room (share of a compartment) worth topping up with the start of an oversized mould */
const MIN_TOP_UP = 0.15;
/** The last compartment of a run should hold at least this share of a compartment's capacity */
const MIN_RUN_TAIL = 0.2;
/** How full a compartment can physically get to absorb the tail of a run */
const RUN_MAX_FILL = 0.95;
/** A group gets a compartment to itself only if it would use at least this much of it */
const MIN_OWN_FILL = 0.3;

const sectionOf = (node: TreeNode): Section => ({ node, volume: node.volume, pieces: node.pieces });
const stem = (name: string) => name.replace(/\s*#\d+$/, '');
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

export function buildZones(comps: Compartment[]): Zone[] {
  const byUnit = new Map<string, Compartment[]>();
  for (const c of [...comps].sort((a, b) => a.physOrder - b.physOrder)) byUnit.set(c.unitId, [...(byUnit.get(c.unitId) ?? []), c]);
  const zones = new Map<string, Zone>();
  for (const [unitId, cs] of byUnit) {
    const shape = cs.map((c) => c.classKey).join(',');
    const key = `${stem(cs[0].unitName)}|${shape}`;
    const z = zones.get(key) ?? { label: stem(cs[0].unitName), unitIds: [], boxes: [], cellVolume: 0 };
    z.unitIds.push(unitId);
    if (new Set(cs.map((c) => c.classKey)).size > 1) z.boxes.push({ cells: cs });
    else for (const c of cs) z.boxes.push({ cells: [c] });
    zones.set(key, z);
  }
  for (const z of zones.values()) z.cellVolume = median(z.boxes.flatMap((b) => b.cells.map((c) => c.volume)));
  return [...zones.values()].sort((a, b) => a.cellVolume - b.cellVolume);
}

interface FillResult {
  cells: Cell[];
  spares: [string, string][];
  leftover: TreeNode[];
  /** first box left untouched */
  end: number;
}

/** How to run one mould through several compartments: as few as possible, and none holding just a few pieces */
function planRun(volume: number, headRoom: number, comps: Compartment[], capOf: (c: Compartment) => number) {
  const through = (amount: number) => {
    const chunks: { comp: Compartment; volume: number }[] = [];
    let left = amount;
    for (const comp of comps) {
      if (left <= 0) break;
      const v = Math.min(capOf(comp), left);
      chunks.push({ comp, volume: v });
      left -= v;
    }
    return left > 1e-6 ? null : chunks;
  };
  // Only use the part-used compartment if that doesn't mean more places to look in total. Leave enough
  // over that the last compartment isn't left holding a token amount.
  const cap = comps.length ? capOf(comps[0]) : 0;
  const topUp = Math.min(headRoom, volume - MIN_RUN_TAIL * cap);
  const withTopUp = topUp > 0 ? through(volume - topUp) : null;
  const without = through(volume);
  const useTopUp = withTopUp && (!without || withTopUp.length + 1 <= without.length);
  const chunks = useTopUp ? withTopUp : without;
  if (!chunks) return null;

  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last.volume < MIN_RUN_TAIL * capOf(last.comp)) {
    // A small remainder goes into the compartments before it if they have the room, even past their
    // planned fill; otherwise the last two share it evenly.
    const before = chunks.slice(0, -1);
    const slack = before.map((c) => Math.max(0, c.comp.volume * RUN_MAX_FILL - c.volume));
    const totalSlack = slack.reduce((t, x) => t + x, 0);
    if (last.volume <= totalSlack) {
      before.forEach((c, i) => (c.volume += (last.volume * slack[i]) / totalSlack));
      chunks.pop();
    } else {
      const prev = before[before.length - 1];
      const even = (prev.volume + last.volume) / 2;
      prev.volume = even;
      last.volume = even;
    }
  }
  return { topUp: useTopUp ? topUp : 0, chunks };
}

/**
 * How many boxes stay open at once. Multi-compartment boxes keep two open so small groups can still use
 * the earlier box's small cells after a bigger group has moved on to the next one.
 */
const OPEN_MULTI_BOXES = 2;

/**
 * Lay groups (already in order) into a zone's boxes one after another, from box `start`. `capOf` gives
 * each compartment's capacity. `limitOf` is a softer limit on adding to a compartment already in use, so
 * groups spread out when there's room to spare, while a group still only needs one compartment if it
 * fits in one. `familyBreak` stops unrelated groups sharing a compartment; `spareQuota` leaves an empty
 * compartment after a group's run.
 */
function fillZone(
  groups: TreeNode[],
  zone: Zone,
  capOf: (c: Compartment) => number,
  familyBreak: boolean,
  spareQuota: Map<string, number>,
  start = 0,
  limitOf: (c: Compartment) => number = capOf,
): FillResult {
  const cells: Cell[] = [];
  const spares: [string, string][] = [];
  const leftover: TreeNode[] = [];
  const quota = new Map(spareQuota);
  const boxes = zone.boxes;
  const window = boxes.some((b) => b.cells.length > 1) ? OPEN_MULTI_BOXES : 1;
  const zoneMax = Math.max(0, ...boxes.flatMap((b) => b.cells.map(capOf)));
  let bi = start;
  let open: Cell[][] = [];

  const closeOldest = () => cells.push(...open.shift()!.filter((c) => c.sections.length));
  const closeAll = () => {
    while (open.length) closeOldest();
  };
  const openBox = (): boolean => {
    if (bi >= boxes.length) return false;
    open.push(boxes[bi++].cells.map((comp) => ({ comp, sections: [], used: 0 })));
    while (open.length > window) closeOldest();
    return true;
  };
  const isEmpty = (box: Cell[]) => box.every((c) => !c.sections.length);

  const placeIn = (box: Cell[], node: TreeNode): boolean => {
    // A tiny group joins the previous section when that holds its tiny siblings — no extra divider
    for (const c of box) {
      if (c.closed || c.used + node.volume > limitOf(c.comp)) continue;
      const tiny = capOf(c.comp) / (2 * c.comp.maxSections);
      if (node.volume >= tiny) continue;
      // An existing mixed section of its siblings first, else the last section if that's a tiny sibling
      const last = c.sections[c.sections.length - 1];
      const host =
        c.sections.find((x) => x.node.merged && x.node.parent === node.parent) ??
        (last && !last.span && last.volume < tiny * 2 && last.node.parent && last.node.parent === node.parent ? last : undefined);
      if (host) {
        host.node = mergeNodes(host.node, node);
        host.volume += node.volume;
        host.pieces += node.pieces;
        c.used += node.volume;
        return true;
      }
    }
    // Otherwise prefer: an empty cell it fills well, then sharing with a sibling, then any shared cell, then a poorly-filled empty cell
    let best: Cell | null = null;
    let bestScore = Infinity;
    for (const c of box) {
      const cap = capOf(c.comp);
      const need = c.sections.length ? node.volume * SHARE_OVERHEAD : node.volume;
      if (c.closed || c.sections.length >= c.comp.maxSections || c.used + need > (c.sections.length ? limitOf(c.comp) : cap)) continue;
      const sibling = c.sections.some((s) => s.node.parent && s.node.parent === node.parent);
      const score = (!c.sections.length ? (node.volume >= MIN_OWN_FILL * cap ? 0 : 3) : sibling ? 1 : 2) + (cap - c.used - need) / cap;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) return false;
    best.used += best.sections.length ? node.volume * SHARE_OVERHEAD : node.volume;
    best.sections.push(sectionOf(node));
    return true;
  };
  const tryPlace = (node: TreeNode) => open.some((box) => placeIn(box, node));

  let prevFam: string | null = null;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];

    // New group: unrelated parts don't share a compartment. Cells in use close; boxes with no empty
    // cells left close entirely, leaving a spare compartment behind if one is due.
    if (familyBreak && prevFam && familyGroup(g.familyKey) !== familyGroup(prevFam) && open.some((b) => !isEmpty(b))) {
      for (const box of open) for (const c of box) if (c.sections.length) c.closed = true;
      const full = open.filter((box) => box.every((c) => c.closed || c.sections.length));
      if (full.length) {
        cells.push(...full.flatMap((box) => box.filter((c) => c.sections.length)));
        open = open.filter((box) => !full.includes(box));
        const grp = familyGroup(prevFam);
        const q = quota.get(grp) ?? 0;
        if (q > 0 && bi < boxes.length && boxes[bi].cells.length === 1) {
          spares.push([boxes[bi].cells[0].key, prevFam]);
          quota.set(grp, q - 1);
          bi++;
        }
      }
    }

    if (tryPlace(g)) {
      prevFam = g.familyKey;
      continue;
    }
    // One mould bigger than any compartment runs through consecutive single compartments: it tops up
    // the part-used one first, and its last compartment stays open for whatever comes next.
    if (!g.children.length && g.volume > zoneMax && window === 1) {
      const head = open[open.length - 1]?.[0];
      const headRoom = head && !head.closed && head.sections.length && head.sections.length < head.comp.maxSections ? (capOf(head.comp) - head.used) / SHARE_OVERHEAD : 0;
      const run = planRun(g.volume, headRoom > MIN_TOP_UP * (head ? capOf(head.comp) : 0) ? headRoom : 0, boxes.slice(bi).map((b) => b.cells[0]), capOf);
      if (run) {
        const n = run.chunks.length + (run.topUp ? 1 : 0);
        let piecesLeft = g.pieces;
        let volumeLeft = g.volume;
        const chunk = (v: number, k: number): Section => {
          const pieces = k === n ? piecesLeft : Math.round((g.pieces * v) / g.volume);
          piecesLeft -= pieces;
          volumeLeft -= v;
          return { node: g, volume: v, pieces, span: [k, n] };
        };
        if (run.topUp) {
          head!.sections.push(chunk(run.topUp, 1));
          head!.used += run.topUp * SHARE_OVERHEAD;
        }
        closeAll();
        run.chunks.forEach(({ comp, volume }, k) => {
          const cell: Cell = { comp, used: volume, sections: [chunk(volume, k + 1 + (run.topUp ? 1 : 0))] };
          if (k === run.chunks.length - 1) open.push([cell]);
          else cells.push(cell);
        });
        bi += run.chunks.length;
        prevFam = g.familyKey;
        continue;
      }
      leftover.push(g);
      continue;
    }
    if ((!open.length || !isEmpty(open[open.length - 1])) && openBox() && tryPlace(g)) {
      prevFam = g.familyKey;
      continue;
    }
    leftover.push(g);
  }
  closeAll();
  return { cells, spares, leftover, end: bi };
}

/** Volume-weighted median group size: what a family's groups typically need */
function typicalGroup(groups: TreeNode[]): number {
  const sorted = [...groups].sort((a, b) => a.volume - b.volume);
  const total = sorted.reduce((t, g) => t + g.volume, 0);
  let acc = 0;
  for (const g of sorted) {
    acc += g.volume;
    if (acc >= total / 2) return g.volume;
  }
  return 0;
}

const zoneCells = (z: Zone) => z.boxes.flatMap((b) => b.cells);
const singleCellZone = (z: Zone) => z.boxes.every((b) => b.cells.length === 1);

/**
 * How well a zone suits a family: can its groups physically go there, and how close are its typical
 * group sizes to the zone's per-section size. Lower is better.
 */
function zoneCost(groups: TreeNode[], z: Zone, capOf: (c: Compartment) => number): number {
  const cells = zoneCells(z);
  const maxCell = Math.max(0, ...cells.map(capOf));
  const total = groups.reduce((t, g) => t + g.volume, 0) || 1;
  const fitting = groups.reduce((t, g) => t + (fitsZone(g, z, maxCell) ? g.volume : 0), 0);
  const slot = median(cells.map((c) => capOf(c) / c.maxSections));
  return Math.abs(Math.log((typicalGroup(groups) + 1) / (slot + 1))) + 10 * (1 - fitting / total);
}

/** A group fits a zone if some compartment holds it — or, for one mould, if it can run through consecutive single compartments */
const fitsZone = (g: TreeNode, z: Zone, maxCell: number) => g.volume <= maxCell || (!g.children.length && singleCellZone(z));

/**
 * Decide which families go to which zone. The least flexible families choose first — those whose
 * biggest group needs the biggest compartments — each taking its best-suited zone that genuinely has
 * room (checked by laying it out). A family only spills into its next-best zone, at a group boundary
 * in reading order, when the first is full. Small-part families come last and fill what's left,
 * small compartments included.
 */
function assignFamilies(cut: TreeNode[], zones: Zone[], capOf: (c: Compartment) => number, familyBreak: boolean, reserve: Map<Zone, number>) {
  const families = new Map<string, TreeNode[]>();
  for (const n of [...cut].sort((a, b) => a.seq - b.seq)) families.set(n.familyKey, [...(families.get(n.familyKey) ?? []), n]);
  const members = new Map<Zone, TreeNode[]>(zones.map((z) => [z, []]));
  // Spare compartments come off the end of a zone for the purpose of checking what fits
  const usable = new Map(zones.map((z) => [z, { ...z, boxes: z.boxes.slice(0, z.boxes.length - (reserve.get(z) ?? 0)) }]));
  const fits = (z: Zone, extra: TreeNode[]) =>
    !fillZone([...members.get(z)!, ...extra].sort((a, b) => a.seq - b.seq), usable.get(z)!, capOf, familyBreak, new Map()).leftover.length;

  const largest = (gs: TreeNode[]) => Math.max(...gs.map((g) => g.volume));
  const total = (gs: TreeNode[]) => gs.reduce((t, g) => t + g.volume, 0);
  const leastFlexibleFirst = [...families.values()].sort((a, b) => largest(b) - largest(a) || total(b) - total(a));
  const maxCell = new Map(zones.map((z) => [z, Math.max(0, ...zoneCells(z).map(capOf))]));
  const room = new Map(zones.map((z) => [z, zoneCells(usable.get(z)!).reduce((t, c) => t + capOf(c), 0)]));
  const place = (groups: TreeNode[]) => {
    const ranked = [...zones].sort((a, b) => zoneCost(groups, a, capOf) - zoneCost(groups, b, capOf));
    let pending = groups;
    for (const z of ranked) {
      // Longest run, in reading order, of the groups this zone's compartments can physically hold
      // (anything too big is left for a zone with bigger compartments)
      const candidates = pending.filter((g) => fitsZone(g, z, maxCell.get(z)!));
      if (!candidates.length) continue;
      // Plain arithmetic rules most things out without laying anything out
      let free = room.get(z)!;
      let hi = 0;
      for (let left = free; hi < candidates.length && candidates[hi].volume <= left; hi++) left -= candidates[hi].volume;
      let lo = 0;
      if (hi && fits(z, candidates.slice(0, hi))) lo = hi;
      else
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (fits(z, candidates.slice(0, mid))) lo = mid;
          else hi = mid - 1;
        }
      const take = new Set(candidates.slice(0, lo));
      members.get(z)!.push(...take);
      for (const g of take) free -= g.volume;
      // Then any later ones that still fit on their own (small groups for small leftover cells)
      for (const g of candidates.slice(lo + 1)) {
        if (g.volume <= free && fits(z, [g])) {
          take.add(g);
          members.get(z)!.push(g);
          free -= g.volume;
        }
      }
      room.set(z, free);
      pending = pending.filter((g) => !take.has(g));
      if (!pending.length) break;
    }
    return pending;
  };
  // Second pass: anything a full zone turned away may still fit somewhere once everyone has chosen
  const unassigned = place(leastFlexibleFirst.flatMap((groups) => place(groups)));
  return { members, unassigned };
}

/** Lay out every zone's groups in reading order; returns the result plus what didn't fit, per zone */
function layoutZones(members: Map<Zone, TreeNode[]>, zones: Zone[], capOf: (c: Compartment) => number, tier: Tier, reserve: Map<Zone, number>) {
  const cells: Cell[] = [];
  const spares = new Map<string, string>();
  const ends = new Map<Zone, number>();
  const leftovers = new Map<Zone, TreeNode[]>();
  for (const z of zones) {
    const groups = [...(members.get(z) ?? [])].sort((a, b) => a.seq - b.seq);
    const quota = new Map<string, number>();
    if (tier.spares) {
      // Spares follow the biggest groups (they grow fastest), one each, round-robin
      const grpVol = new Map<string, number>();
      for (const g of groups) grpVol.set(familyGroup(g.familyKey), (grpVol.get(familyGroup(g.familyKey)) ?? 0) + g.volume);
      const order = [...grpVol.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      for (let i = 0, n = reserve.get(z) ?? 0; n > 0 && order.length; i = (i + 1) % order.length, n--) quota.set(order[i], (quota.get(order[i]) ?? 0) + 1);
    }
    const capacity = zoneCells(z).reduce((t, c) => t + capOf(c), 0);
    const need = groups.reduce((t, g) => t + g.volume, 0);
    // Room to spare: fill each compartment only as far as needed so groups spread evenly through the zone
    const breathe = Math.min(1, Math.max(0.45, need / Math.max(1, capacity) + 0.15));
    let r = fillZone(groups, z, capOf, !tier.share, quota, 0, (c) => capOf(c) * breathe);
    if (r.leftover.length && breathe < 1) r = fillZone(groups, z, capOf, !tier.share, quota);
    if (r.leftover.length && quota.size) r = fillZone(groups, z, capOf, !tier.share, new Map());
    cells.push(...r.cells);
    for (const [k, f] of r.spares) spares.set(k, f);
    ends.set(z, r.end);
    leftovers.set(z, r.leftover);
  }
  return { cells, spares, ends, leftovers };
}

function packTier(cut: TreeNode[], zones: Zone[], s: Settings, tierIndex: number): PackResult {
  const tier = TIERS[tierIndex];
  const fill = tier.fill === 'target' ? targetFill(s) : s.practicalFill;
  const capOf = (c: Compartment) => c.volume * fill;
  const globalMax = Math.max(0, ...zones.flatMap((z) => zoneCells(z).map(capOf)));
  const tooBig = cut.filter((n) => n.children.length && n.volume > globalMax);

  // Spare compartments, per zone: a share of its single compartments, kept for the biggest groups
  const reserve = new Map(
    zones.map((z) => {
      const singles = z.boxes.filter((b) => b.cells.length === 1).length;
      return [z, tier.spares && singles >= 5 ? Math.round(singles * s.spareFraction) : 0];
    }),
  );
  const { members, unassigned } = assignFamilies(cut, zones, capOf, !tier.share, reserve);
  const { cells, spares, ends, leftovers } = layoutZones(members, zones, capOf, tier, reserve);

  // Anything still over goes after the last used compartment of a zone — one already holding its family if possible
  let carry = [...unassigned, ...[...leftovers.values()].flat()].sort((a, b) => a.seq - b.seq);
  const holds = (z: Zone, fam: string) => cells.some((c) => z.unitIds.includes(c.comp.unitId) && c.sections.some((x) => x.node.familyKey === fam));
  for (const z of [...zones].sort((a, b) => Number(carry.some((g) => holds(b, g.familyKey))) - Number(carry.some((g) => holds(a, g.familyKey))))) {
    if (!carry.length) break;
    const r = fillZone(carry, z, capOf, !tier.share, new Map(), ends.get(z) ?? 0);
    cells.push(...r.cells);
    ends.set(z, r.end);
    carry = r.leftover;
  }

  const zoneFamilies: PackResult['zones'] = zones.map((z) => {
    const fams: string[] = [];
    const ids = new Set(z.unitIds);
    for (const c of [...cells].sort((a, b) => a.comp.physOrder - b.comp.physOrder))
      if (ids.has(c.comp.unitId)) for (const sec of c.sections) if (!fams.includes(sec.node.familyKey)) fams.push(sec.node.familyKey);
    return { label: z.label, unitIds: z.unitIds, families: fams };
  });

  // Whatever's left is reported as not fitting, rather than slipped into an unrelated compartment
  const unplaced = carry.map(sectionOf);
  return { cells, spares, unplaced, unplacedVolume: unplaced.reduce((t, x) => t + x.volume, 0), tooBig, tier: tierIndex, zones: zoneFamilies };
}

/** Try each tier in turn; the first that fits everything wins (or the last, with overflow) */
function pack(cut: TreeNode[], zones: Zone[], s: Settings, maxTier = TIERS.length - 1): PackResult {
  let best: PackResult | null = null;
  for (let t = 0; t <= maxTier; t++) {
    const r = packTier(cut, zones, s, t);
    if (!best || r.unplacedVolume < best.unplacedVolume - 1e-6) best = r;
    if (r.unplacedVolume === 0) break;
  }
  return best!;
}

// ─── Granularity ─────────────────────────────────────────────────────────────

const THRESHOLDS: Record<Granularity, { split: number; child: number }> = {
  relaxed: { split: 250, child: 60 },
  balanced: { split: 100, child: 25 },
  fine: { split: 40, child: 10 },
};
/** How many of the biggest groups to try breaking up, per round, when the plan has had to compromise */
const RELIEF_CANDIDATES = 6;
/** Rounds of breaking up groups to ease a compromise, and the most plans to try in doing so */
const RELIEF_ROUNDS = 25;
const RELIEF_MAX_TRIALS = 40;
/** Overflow above this share of the collection is a shortage of storage, which splitting can't fix */
const RELIEF_MAX_OVERFLOW = 0.1;
/** A child this big (cm³) earns its own group regardless of piece count (e.g. baseplates) */
const BIG_CHILD_VOLUME = 500;

/** Split a node into its children, lumping the small ones into one "Other …" group */
function splitNode(n: TreeNode, g: Granularity, forced: boolean): TreeNode[] {
  if (n.lump || forced) return n.children;
  const t = THRESHOLDS[g];
  const big = n.children.filter((c) => c.pieces >= t.child || c.volume >= BIG_CHILD_VOLUME);
  const small = n.children.filter((c) => !big.includes(c));
  if (small.length <= 1) return n.children;
  const lump: TreeNode = {
    id: `${n.id}/~other`,
    label: `${n.label} — other`,
    familyKey: n.familyKey,
    children: small,
    pieces: small.reduce((s, c) => s + c.pieces, 0),
    volume: small.reduce((s, c) => s + c.volume, 0),
    seq: small[0].seq,
    lump: true,
    parent: n,
  };
  return big.length ? [...big, lump] : [lump];
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export interface PlannedCompartment {
  comp: Compartment;
  sections: Section[];
  /** physical fill fraction now */
  fill: number;
  status: 'used' | 'spare' | 'empty';
  /** family a spare compartment is reserved next to */
  spareFor?: string;
  /** the fill above was measured in real life; this is what the plan had estimated */
  measured?: { estimated: number };
}

export interface PlanStats {
  pieces: number;
  moulds: number;
  volume: number;
  physicalCapacity: number;
  plannedCapacity: number;
  used: number;
  spare: number;
  empty: number;
  overflowVolume: number;
  /** extra volume (cm³) that fits at practical fill without rearranging */
  headroom: number;
  groups: number;
  /** compartments holding unrelated families (different groups — only happens when space is tight) */
  mixed: number;
}

export interface Plan {
  compartments: PlannedCompartment[];
  overflow: Section[];
  stats: PlanStats;
  settings: Settings;
  /** which families went to which kind of storage, for explaining the layout */
  zones: { label: string; unitIds: string[]; families: string[] }[];
  /** compromises made to fit (empty when nothing had to give) */
  notes: string[];
}

/**
 * Granularity straight from the setting: a group with at least `split` pieces is broken into its
 * sub-groups (small ones lumped into "… — other"); a group too big for any compartment is always broken up.
 */
function initialCut(n: TreeNode, g: Granularity, maxCap: number): TreeNode[] {
  if (!n.children.length) return [n];
  const tooBig = n.volume > maxCap;
  if (!tooBig && (n.lump || n.pieces < THRESHOLDS[g].split)) return [n];
  return splitNode(n, g, tooBig).flatMap((c) => initialCut(c, g, maxCap));
}

/** Split for relief when the plan has had to compromise — lumping small sub-groups where possible */
const reliefSplit = (n: TreeNode, g: Granularity) => {
  const kids = splitNode(n, g, false);
  return kids.length > 1 ? kids : n.children;
};

/** `reserved` compartments stay out of planning: parts were placed in them by hand */
export function plan(tree: TreeNode, units: StorageUnit[], s: Settings, reserved: ReadonlySet<string> = new Set()): Plan {
  const comps = expandCompartments(units, s);
  const zones = buildZones(comps.filter((c) => !reserved.has(c.key)));
  const g = s.granularity;
  const maxCap = Math.max(0, ...comps.map((c) => c.volume * s.practicalFill));

  let cut = tree.children.flatMap((n) => initialCut(n, g, maxCap));
  let current = pack(cut, zones, s);

  // Under pressure (overflow, or a compromise tier), break up the biggest groups — smaller pieces fill
  // the gaps — keeping a split only if it reduces the compromise
  const tried = new Set<string>();
  let trials = 0;
  const hopeless = () => current.unplacedVolume > tree.volume * RELIEF_MAX_OVERFLOW;
  for (let round = 0; round < RELIEF_ROUNDS && (current.tier > 0 || current.unplacedVolume > 0) && !hopeless(); round++) {
    const big = cut
      .filter((n) => n.children.length && !tried.has(n.id))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, RELIEF_CANDIDATES);
    let eased = false;
    for (const n of big) {
      if (++trials > RELIEF_MAX_TRIALS) break;
      tried.add(n.id);
      const trialCut = cut.flatMap((x) => (x === n ? reliefSplit(x, g) : [x]));
      // While things are still overflowing, a stricter tier can't do better than this one
      const trial = current.unplacedVolume > 0 ? packTier(trialCut, zones, s, current.tier) : pack(trialCut, zones, s, current.tier);
      if (trial.tier < current.tier || (trial.tier === current.tier && trial.unplacedVolume < current.unplacedVolume - 1e-6)) {
        cut = trialCut;
        current = trial;
        eased = true;
        break;
      }
    }
    if (!eased) break;
  }

  return layout(current, comps, tree, s);
}

/** The stats that depend on what's in each compartment */
export function countStats(out: PlannedCompartment[], overflowVolume: number, s: Settings) {
  const used = out.filter((p) => p.status === 'used');
  return {
    used: used.length,
    spare: out.filter((p) => p.status === 'spare').length,
    empty: out.filter((p) => p.status === 'empty').length,
    overflowVolume,
    headroom: out.reduce((t, p) => t + Math.max(0, p.comp.volume * s.practicalFill - p.fill * p.comp.volume), 0),
    groups: used.reduce((t, p) => t + p.sections.length, 0),
    mixed: used.filter((p) => new Set(p.sections.map((x) => familyGroup(x.node.familyKey))).size > 1).length,
  };
}

function layout(r: PackResult, comps: Compartment[], tree: TreeNode, s: Settings): Plan {
  const byKey = new Map<string, Cell[]>();
  for (const c of r.cells) byKey.set(c.comp.key, [...(byKey.get(c.comp.key) ?? []), c]);
  const out: PlannedCompartment[] = comps
    .slice()
    .sort((a, b) => a.physOrder - b.physOrder)
    .map((comp) => {
      const cs = byKey.get(comp.key) ?? [];
      const sections = cs.flatMap((c) => c.sections);
      const used = cs.reduce((t, c) => t + c.used, 0);
      const spareFor = r.spares.get(comp.key);
      const status: PlannedCompartment['status'] = sections.length ? 'used' : spareFor ? 'spare' : 'empty';
      return { comp, sections, fill: used / comp.volume, status, ...(spareFor && !sections.length ? { spareFor } : {}) };
    });

  const stats: PlanStats = {
    pieces: tree.pieces,
    moulds: leaves(tree).filter((l) => l.part).length,
    volume: tree.volume,
    physicalCapacity: comps.reduce((t, c) => t + c.volume, 0),
    plannedCapacity: comps.reduce((t, c) => t + c.cap, 0),
    ...countStats(out, r.unplacedVolume, s),
  };
  const notes = TIERS[r.tier].note ? [TIERS[r.tier].note!] : [];
  return { compartments: out, overflow: r.unplaced, stats, settings: s, zones: r.zones, notes };
}

export const familyLabel = (key: string) => FAMILIES.find((f) => f.key === key)?.label ?? key;

/** Short human label for a section, e.g. "Plate 2 x 4" or "Plates 1 × 3+" */
export function sectionLabel(sec: Section): string {
  return sec.span ? `${sec.node.label} (${sec.span[0]}/${sec.span[1]})` : sec.node.label;
}
