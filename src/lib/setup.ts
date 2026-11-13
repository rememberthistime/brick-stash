// The user's real storage as it stands today: which parts are in which pocket of which drawer, and roughly how
// full each pocket is. It's reviewed as it is, and improved by a short list of moves, rather than being replaced
// by a fresh plan.
import { onePieceVolume, partVolume } from './collection';
import { lettersFor, unitLetter } from './codes';
import { familyLabel, leaves, targetFill, type Compartment, type TreeNode } from './planner';
import { stem } from './storageList';
import { familyFor } from './taxonomy';
import type { LooseContainer, Measurement, OpenedUnit, Part, Settings, Setup, SetupPocket } from './types';
import { compartmentVolume, partSizeMm } from './volume';

export { unitLetter };

export type SetupComp = Compartment & {
  code: string;
  /** a unit opened up into one space: how many sections it had */
  sections?: number;
};

export const wholeKey = (unitId: string) => `whole:${unitId}`;

/** "Ezy Storage 2.5L" or "storer, 10L": what the maker says the whole thing holds */
export function litresInName(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*l\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * A unit with its dividers or containers out. Its sections usually add up to less than it holds (a 2.5 L tub's
 * come to 1.9 L), so its stated size is used if there is one. The floor is only known by area, so it's taken as square.
 */
function wholeBox(sections: Compartment[], code: string, how: OpenedUnit): SetupComp {
  const volume = (how.litres ?? litresInName(sections[0].unitName) ?? sections.reduce((t, c) => t + c.volume, 0) / 1000) * 1000;
  const h = Math.max(...sections.map((c) => c.h));
  const side = Math.sqrt((volume * 1000) / h);
  return { ...sections[0], key: wholeKey(sections[0].unitId), code, label: 'Whole box', w: side, d: side, h, volume, cap: volume, sections: sections.length };
}

/** The same A1, A2… B1 codes the plan uses. An opened-up unit is one space, and just takes its letter. */
export function setupComps(comps: Compartment[], open: Setup['open'] = {}): SetupComp[] {
  const letters = lettersFor(comps);
  const counts = new Map<string, number>();
  const out: SetupComp[] = [];
  for (const c of comps) {
    const letter = letters.get(c.unitId)!;
    const n = (counts.get(c.unitId) ?? 0) + 1;
    counts.set(c.unitId, n);
    const how = open[c.unitId];
    if (!how) out.push({ ...c, code: `${letter}${n}` });
    else if (n === 1) out.push(wholeBox(comps.filter((x) => x.unitId === c.unitId), letter, how));
  }
  return out.map((c, physOrder) => ({ ...c, physOrder }));
}

/** Units split into sections that could be opened up. Chests of drawers can't be, however many drawers they have. */
export function openableUnits(comps: Compartment[]): Map<string, Compartment[]> {
  const units = new Map<string, Compartment[]>();
  for (const c of comps) units.set(c.unitId, [...(units.get(c.unitId) ?? []), c]);
  return new Map([...units].filter(([, list]) => list.length > 1 && !list.some((c) => /drawer|tray|shelf/i.test(c.label))));
}

/** Open a unit up. What's recorded in its sections carries over, and is kept in case they go back in. */
export function openUnit(setup: Setup, sections: Compartment[], how: OpenedUnit['how'], newId: () => string): Setup {
  const unitId = sections[0].unitId;
  const key = wholeKey(unitId);
  const parts = [...new Set(sections.flatMap((c) => setup.drawers[c.key] ?? []).flatMap((p) => p.parts))];
  const drawers = setup.drawers[key] || !parts.length ? setup.drawers : { ...setup.drawers, [key]: [{ ...newPocket(newId()), parts }] };
  return { ...setup, drawers, open: { ...setup.open, [unitId]: { ...setup.open[unitId], how } } };
}

/** Put a unit's sections back. If they were never recorded, what's in the whole box starts off in the first. */
export function closeUnit(setup: Setup, sections: Compartment[]): Setup {
  const unitId = sections[0].unitId;
  const key = wholeKey(unitId);
  const { [unitId]: _closed, ...open } = setup.open;
  if (sections.some((c) => setup.drawers[c.key]) || !setup.drawers[key]) return { ...setup, open };
  const { [key]: whole, ...drawers } = setup.drawers;
  return { ...setup, open, drawers: { ...drawers, [sections[0].key]: whole } };
}

// ─── Containers ──────────────────────────────────────────────────────────────

export interface ContainerChoice {
  key: string;
  container: LooseContainer;
  /** how many there are, for those lifted out of units */
  total: number | null;
  used: number;
}

const containerKey = (c: LooseContainer) => `${c.name}|${c.w}|${c.d}|${c.h}`;

/** Containers lifted out of opened-up units, and any sizes added by hand, with how many are in use */
export function containerChoices(setup: Setup, comps: Compartment[]): ContainerChoice[] {
  const choices = new Map<string, ContainerChoice>();
  for (const c of comps) {
    if (setup.open[c.unitId]?.how !== 'containers') continue;
    const container = { name: `${stem(c.unitName)}, ${c.label.replace(/\s*\d+$/, '')}`, w: c.w, d: c.d, h: c.h };
    const key = containerKey(container);
    const e = choices.get(key) ?? { key, container, total: 0, used: 0 };
    e.total!++;
    choices.set(key, e);
  }
  for (const container of setup.containers) {
    const key = containerKey(container);
    if (!choices.has(key)) choices.set(key, { key, container, total: null, used: 0 });
  }
  for (const pockets of Object.values(setup.drawers)) {
    for (const p of pockets) {
      const e = p.container && choices.get(containerKey(p.container));
      if (e) e.used++;
    }
  }
  return [...choices.values()];
}

/** How many of a container stand in a compartment, turning them whichever way suits */
export function howManyFit(c: LooseContainer, comp: Pick<Compartment, 'w' | 'd' | 'h'>): number {
  if (c.h > comp.h) return 0;
  return Math.max(Math.floor(comp.w / c.w) * Math.floor(comp.d / c.d), Math.floor(comp.w / c.d) * Math.floor(comp.d / c.w));
}

/** Share of a compartment's floor not taken up by loose containers. Below zero means they can't all stand on it. */
export const floorLeft = (comp: Pick<Compartment, 'w' | 'd'>, pockets: SetupPocket[]) => 1 - pockets.reduce((t, p) => t + (p.container ? (p.container.w * p.container.d) / (comp.w * comp.d) : 0), 0);

// ─── Editing a drawer ────────────────────────────────────────────────────────

export const newPocket = (id: string, share = 1): SetupPocket => ({ id, share, parts: [] });

/** Change the number of ordinary pockets, evenly sized. Contents of pockets taken away go into the last one left. */
export function resizePockets(pockets: SetupPocket[], count: number, newId: () => string): SetupPocket[] {
  const plain = pockets.filter((p) => !p.container);
  const containers = pockets.filter((p) => p.container);
  const share = count ? 1 / count : 1;
  const kept = plain.slice(0, count).map((p) => ({ ...p, share }));
  const gone = plain.slice(count);
  if (gone.some((p) => p.parts.length) && !kept.length) return pockets;
  if (gone.length && kept.length) {
    const last = kept[kept.length - 1];
    const merged = new Set([...last.parts, ...gone.flatMap((p) => p.parts)]);
    kept[kept.length - 1] = { ...last, parts: [...merged], fill: gone.some((p) => p.parts.length) ? undefined : last.fill };
  }
  while (kept.length < count) kept.push(newPocket(newId(), share));
  return [...kept, ...containers];
}

/** Stand containers in a drawer. They replace a blank pocket, which is what an undivided drawer starts as. */
export function addContainers(pockets: SetupPocket[], container: LooseContainer, count: number, newId: () => string): SetupPocket[] {
  const blank = pockets.length === 1 && !pockets[0].container && !pockets[0].parts.length;
  return [...(blank ? [] : pockets), ...Array.from({ length: count }, () => ({ ...newPocket(newId()), container }))];
}

/** Take a pocket or container away. Whatever it held moves to a neighbour, so nothing recorded goes missing. */
export function removePocket(pockets: SetupPocket[], index: number, newId: () => string): SetupPocket[] {
  const gone = pockets[index];
  const rest = pockets.filter((_, i) => i !== index);
  if (!rest.length) return [{ ...newPocket(newId()), parts: gone.parts }];
  if (!gone.parts.length) return rest;
  const to = Math.max(0, index - 1);
  return rest.map((p, i) => (i === to ? { ...p, parts: [...new Set([...p.parts, ...gone.parts])], fill: undefined } : p));
}

export const addToPocket = (pockets: SetupPocket[], index: number, parts: string[]) => pockets.map((p, i) => (i === index ? { ...p, parts: [...new Set([...p.parts, ...parts])] } : p));

export const removeFromPocket = (pockets: SetupPocket[], index: number, part: string) => pockets.map((p, i) => (i === index ? { ...p, parts: p.parts.filter((x) => x !== part) } : p));

export const setPocket = (pockets: SetupPocket[], index: number, change: Partial<SetupPocket>) => pockets.map((p, i) => (i === index ? { ...p, ...change } : p));

// ─── What's where ────────────────────────────────────────────────────────────

/** How full a pocket is taken to be when working out how a part in several places is shared between them */
const TYPICAL_FILL = 0.7;

export interface Placed {
  part: Part;
  family: string;
  group: string;
  groupLabel: string;
  /** this pocket's share of the part, 0–1 */
  share: number;
  /** estimated cm³ here before any scale */
  raw: number;
  /** estimated cm³ here */
  estimate: number;
  /** cm³ here, going by the pocket's real fill if it has one */
  used: number;
  /** too long for the space it's in, going by its name */
  tooBig: boolean;
}

export interface PlacedPocket {
  id: string;
  comp: SetupComp;
  /** "A3", or "A3 pocket 2" where the drawer is divided */
  name: string;
  capacity: number;
  fill?: number;
  /** cm³ of what's here, by the estimates */
  estimate: number;
  /** cm³ of what's here: real if a fill has been entered, otherwise the estimate */
  used: number;
  parts: Placed[];
  container?: LooseContainer;
  mixed: boolean;
  label?: string;
  /** whichever family and group take up the most room here */
  family: string;
  group: string;
  groupLabel: string;
}

interface Group {
  key: string;
  label: string;
}

/** Each part's nearest group in the part tree, e.g. Plate 2 x 12 → "Plates 2 × 9+" */
export function groupsOf(tree: TreeNode | null): Map<string, Group> {
  const out = new Map<string, Group>();
  if (!tree) return out;
  for (const leaf of leaves(tree)) if (leaf.part && leaf.parent && leaf.parent !== tree) out.set(leaf.part.partNum, { key: leaf.parent.id, label: leaf.parent.label });
  return out;
}

const largest = (totals: Map<string, number>) => [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

/** Whether a part's longest dimensions can't fit the space, whichever way it's turned */
function tooBigFor(part: Part, space: { w: number; d: number; h: number }) {
  const size = partSizeMm(part.name, part.catId);
  if (!size) return false;
  const a = [...size].sort((x, y) => x - y);
  const b = [space.w, space.d, space.h].sort((x, y) => x - y);
  return a[0] > b[0] || a[1] > b[1] || a[2] > b[2];
}

export function placePockets(setup: Setup, comps: SetupComp[], parts: Part[], volumeScale: number, groups = new Map<string, Group>()): PlacedPocket[] {
  const byNum = new Map(parts.map((p) => [p.partNum, p]));
  const raw: { pocket: SetupPocket; comp: SetupComp; capacity: number; name: string; weight: number }[] = [];
  for (const comp of comps) {
    const pockets = setup.drawers[comp.key];
    if (!pockets?.length) continue;
    // Containers take their part of the floor, and ordinary pockets share what's left
    const totalShare = pockets.reduce((t, p) => t + (p.container ? 0 : p.share), 0) || 1;
    const left = Math.max(0, floorLeft(comp, pockets));
    pockets.forEach((pocket, i) => {
      const capacity = pocket.container ? compartmentVolume(pocket.container) : Math.max(1, (comp.volume * left * pocket.share) / totalShare);
      raw.push({ pocket, comp, capacity, name: pockets.length > 1 ? `${comp.code} pocket ${i + 1}` : comp.code, weight: capacity * (pocket.fill ?? TYPICAL_FILL) });
    });
  }
  // A part in several places is assumed to be shared out in line with how much room it has in each
  const weights = new Map<string, number>();
  for (const r of raw) for (const num of r.pocket.parts) weights.set(num, (weights.get(num) ?? 0) + r.weight);
  const places = new Map<string, number>();
  for (const r of raw) for (const num of r.pocket.parts) places.set(num, (places.get(num) ?? 0) + 1);

  return raw.map(({ pocket, comp, capacity, name, weight }) => {
    const placed: Placed[] = pocket.parts.flatMap((num) => {
      const part = byNum.get(num);
      if (!part) return [];
      const total = weights.get(num) ?? 0;
      const share = total > 0 ? weight / total : 1 / (places.get(num) ?? 1);
      const family = familyFor(part.catId).key;
      const group = groups.get(num) ?? { key: family, label: familyLabel(family) };
      const estimate = share * partVolume(part, volumeScale);
      return [{ part, family, group: group.key, groupLabel: group.label, share, raw: share * part.qty * (part.volumeOverride ?? part.unitVolume), estimate, used: estimate, tooBig: tooBigFor(part, pocket.container ?? comp) }];
    });
    const estimate = placed.reduce((t, p) => t + p.estimate, 0);
    const real = pocket.fill !== undefined && placed.length ? pocket.fill * capacity : null;
    if (real !== null && estimate > 0) for (const p of placed) p.used = (real * p.estimate) / estimate;
    const families = new Map<string, number>();
    const groupTotals = new Map<string, number>();
    for (const p of placed) {
      families.set(p.family, (families.get(p.family) ?? 0) + p.used);
      groupTotals.set(p.group, (groupTotals.get(p.group) ?? 0) + p.used);
    }
    const group = largest(groupTotals);
    return {
      id: pocket.id,
      comp,
      name,
      capacity,
      fill: placed.length ? pocket.fill : undefined,
      container: pocket.container,
      mixed: !!pocket.mixed,
      label: pocket.label,
      estimate,
      used: real ?? estimate,
      parts: placed,
      family: largest(families),
      group,
      groupLabel: placed.find((p) => p.group === group)?.groupLabel ?? '',
    };
  });
}

/** Pockets with a real fill, as measurements the planner can learn from */
export function setupMeasurements(setup: Setup, comps: SetupComp[], parts: Part[]): Measurement[] {
  return placePockets(setup, comps, parts, 1).flatMap((p) => {
    if (!p.fill || !p.parts.length) return [];
    const m: Measurement = { id: `setup:${p.id}`, compKey: `setup:${p.id}`, where: `${p.name}, ${p.comp.unitName}`, volume: p.capacity, fill: p.fill, parts: {}, families: {} };
    for (const x of p.parts) {
      m.parts[x.part.partNum] = (m.parts[x.part.partNum] ?? 0) + x.raw;
      m.families[x.family] = (m.families[x.family] ?? 0) + x.raw;
    }
    return [m];
  });
}

// ─── The review ──────────────────────────────────────────────────────────────

export type FindingKind = 'overfull' | 'tooBig' | 'unsure' | 'split' | 'scattered' | 'mixed' | 'roomy';

export interface Finding {
  kind: FindingKind;
  text: string;
}

export interface EstimateRow {
  label: string;
  /** cm³ */
  real: number;
  estimate: number;
}

export interface SetupMove {
  part: string;
  from: string;
  to: string;
  /** cm³ */
  volume: number;
}

export interface Suggestion {
  id: string;
  kind: 'ease' | 'join' | 'stray' | 'combine';
  title: string;
  why: string;
  /** relies on the estimates rather than a fill you've entered, so check it fits */
  estimated: boolean;
  moves: SetupMove[];
}

export interface SetupAnalysis {
  pockets: PlacedPocket[];
  drawersRecorded: number;
  drawersTotal: number;
  partsPlaced: number;
  partsTotal: number;
  /** share of the collection, by estimated volume, that's somewhere in the setup */
  volumePlaced: number;
  unplaced: Part[];
  /** what's used in the drawers recorded, cm³, against what they hold */
  used: number;
  capacity: number;
  check: { pockets: number; total: EstimateRow; families: EstimateRow[]; worst: EstimateRow[] };
  findings: Finding[];
  suggestions: Suggestion[];
  /** suggestions beyond those shown */
  moreSuggestions: number;
}

const MAX_SHOWN_SUGGESTIONS = 15;
/** A pocket may hold bits of other families without being called mixed */
const MIXED_MINORITY = 0.05;
const ROOMY_FREE = 0.5;
/** A family-level combine only makes sense for a pocket that's barely in use */
const COMBINE_SMALL = 0.25;

const pct = (x: number) => `${Math.round(x * 100)}%`;

const listCodes = (codes: string[]) => (codes.length > 5 ? `${codes.slice(0, 5).join(', ')} and ${codes.length - 5} more` : codes.join(', '));

/** How many separate runs of neighbouring drawers these are in */
function runsOf(comps: SetupComp[]) {
  const orders = [...new Set(comps.map((c) => c.physOrder))].sort((a, b) => a - b);
  return orders.filter((o, i) => i === 0 || o - orders[i - 1] > 1).length;
}

function checkEstimates(pockets: PlacedPocket[]) {
  const measured = pockets.filter((p) => p.fill !== undefined && p.parts.length);
  const families = new Map<string, EstimateRow>();
  for (const p of measured) {
    for (const x of p.parts) {
      const row = families.get(x.family) ?? { label: familyLabel(x.family), real: 0, estimate: 0 };
      row.real += x.used;
      row.estimate += x.estimate;
      families.set(x.family, row);
    }
  }
  const rows = measured.map((p) => ({ label: p.name, real: p.used, estimate: p.estimate }));
  const off = (r: EstimateRow) => Math.abs(Math.log((r.real || 1) / (r.estimate || 1)));
  return {
    pockets: measured.length,
    total: { label: 'Everything measured', real: rows.reduce((t, r) => t + r.real, 0), estimate: rows.reduce((t, r) => t + r.estimate, 0) },
    families: [...families.values()].sort((a, b) => b.estimate - a.estimate),
    worst: [...rows].sort((a, b) => off(b) - off(a)).slice(0, 8),
  };
}

function findingsFor(pockets: PlacedPocket[], settings: Settings): Finding[] {
  const out: Finding[] = [];
  const inUse = pockets.filter((p) => p.parts.length);
  for (const p of inUse) {
    const fill = p.used / p.capacity;
    if (p.fill !== undefined && p.fill > settings.practicalFill) out.push({ kind: 'overfull', text: `${p.name} is ${pct(p.fill)} full: ${p.parts.length === 1 ? p.parts[0].part.name : `${p.parts.length} part types`}` });
    if (p.fill === undefined && fill > 1) out.push({ kind: 'unsure', text: `${p.name} would be ${pct(fill)} full by the estimates. Enter its real fill to settle it.` });
    if (fill <= 1 - ROOMY_FREE) out.push({ kind: 'roomy', text: `${p.name} is ${p.fill === undefined ? 'estimated at ' : ''}${pct(fill)} full: ${p.groupLabel}` });
    const byFamily = new Map<string, number>();
    for (const x of p.parts) byFamily.set(x.family, (byFamily.get(x.family) ?? 0) + x.used);
    const major = [...byFamily].filter(([, v]) => p.used > 0 && v / p.used >= MIXED_MINORITY);
    for (const x of p.parts) if (x.tooBig) out.push({ kind: 'tooBig', text: `${x.part.name} looks too big for ${p.name}` });
    if (major.length > 1 && !p.mixed) out.push({ kind: 'mixed', text: `${p.name} mixes ${major.sort((a, b) => b[1] - a[1]).map(([k]) => familyLabel(k)).join(', ')}` });
  }

  const placesOfPart = new Map<string, { part: Part; pockets: PlacedPocket[] }>();
  const placesOfGroup = new Map<string, { label: string; parts: Set<string>; pockets: PlacedPocket[] }>();
  for (const p of inUse) {
    for (const x of p.parts) {
      const e = placesOfPart.get(x.part.partNum) ?? { part: x.part, pockets: [] };
      e.pockets.push(p);
      placesOfPart.set(x.part.partNum, e);
      if (p.mixed) continue; // a mixed box isn't where this group lives
      const g = placesOfGroup.get(x.group) ?? { label: x.groupLabel, parts: new Set<string>(), pockets: [] };
      g.parts.add(x.part.partNum);
      g.pockets.push(p);
      placesOfGroup.set(x.group, g);
    }
  }
  const spread = <T extends { pockets: PlacedPocket[] }>(entries: T[]) =>
    entries
      .map((e) => ({ e, runs: runsOf(e.pockets.map((p) => p.comp)), codes: [...new Set(e.pockets.map((p) => p.comp.code))] }))
      .filter((x) => x.runs > 1)
      .sort((a, b) => b.runs - a.runs);
  for (const { e, codes } of spread([...placesOfPart.values()])) out.push({ kind: 'split', text: `${e.part.name} is split between ${listCodes(codes)}` });
  for (const { e, codes } of spread([...placesOfGroup.values()].filter((g) => g.parts.size > 1))) out.push({ kind: 'scattered', text: `${e.label} is spread across ${listCodes(codes)}` });
  return out;
}

function suggestionsFor(pockets: PlacedPocket[], settings: Settings, skipped: string[]) {
  const limit = targetFill(settings);
  const room = (p: PlacedPocket) => (p.mixed ? 0 : p.capacity * limit - p.used);
  const inUse = pockets.filter((p) => p.parts.length);
  const after = (host: PlacedPocket, volume: number) => pct((host.used + volume) / host.capacity);
  const unmeasured = (...ps: PlacedPocket[]) => ps.some((p) => p.fill === undefined);
  // Quickest wins first within each kind, and real problems before tidying
  const found: { rank: number; size: number; s: Suggestion }[] = [];
  const move = (x: Placed, from: PlacedPocket, to: PlacedPocket): SetupMove => ({ part: x.part.partNum, from: from.id, to: to.id, volume: x.used });
  const nearest = (from: PlacedPocket, x: Placed) => (a: PlacedPocket, b: PlacedPocket) =>
    Number(b.group === x.group) - Number(a.group === x.group) || Math.abs(a.comp.physOrder - from.comp.physOrder) - Math.abs(b.comp.physOrder - from.comp.physOrder);

  // Over the practical limit: find something in there that can live with similar parts elsewhere
  for (const p of inUse) {
    if (p.fill === undefined || p.fill <= settings.practicalFill || p.parts.length < 2) continue;
    const excess = p.used - p.capacity * limit;
    const movable = [...p.parts].sort((a, b) => a.used - b.used);
    const x = movable.find((c) => c.used >= excess) ?? movable[movable.length - 1];
    const host = inUse.filter((h) => h !== p && h.family === x.family && room(h) >= x.used).sort(nearest(p, x))[0];
    if (host)
      found.push({
        rank: 0,
        size: x.used,
        s: { id: `ease:${x.part.partNum}:${p.id}:${host.id}`, kind: 'ease', title: `Move ${x.part.name} from ${p.name} to ${host.name}`, why: `${p.name} is ${pct(p.fill)} full. ${host.name} holds similar parts and would be ${after(host, x.used)} full.`, estimated: unmeasured(host), moves: [move(x, p, host)] },
      });
  }

  // The same part in two places, where one could take it all
  const places = new Map<string, { x: Placed; pocket: PlacedPocket }[]>();
  for (const p of inUse) for (const x of p.parts) places.set(x.part.partNum, [...(places.get(x.part.partNum) ?? []), { x, pocket: p }]);
  for (const list of places.values()) {
    const sorted = [...list].sort((x, y) => x.x.used - y.x.used);
    sorted.forEach((small, i) => {
      for (const large of sorted.slice(i + 1)) {
        // Moving the smaller pile is the shorter job, but it may be the one with room that has to take it
        const [from, to] = room(large.pocket) >= small.x.used ? [small, large] : [large, small];
        if (room(to.pocket) < from.x.used) continue;
        found.push({
          rank: 1,
          size: from.x.used,
          s: {
            id: `join:${from.x.part.partNum}:${[from.pocket.id, to.pocket.id].sort().join(':')}`,
            kind: 'join',
            title: `Bring ${from.x.part.name} together in ${to.pocket.name}`,
            why: `Some of it is in ${from.pocket.name}. All of it would fit, leaving ${to.pocket.name} ${after(to.pocket, from.x.used)} full.`,
            estimated: unmeasured(from.pocket, to.pocket),
            moves: [move(from.x, from.pocket, to.pocket)],
          },
        });
      }
    });
  }

  // A part in with a different family, when there's room with its own
  for (const p of inUse) {
    if (p.mixed || new Set(p.parts.map((x) => x.family)).size < 2) continue;
    for (const x of p.parts) {
      if (x.family === p.family) continue;
      const host = inUse.filter((h) => h !== p && h.family === x.family && room(h) >= x.used).sort(nearest(p, x))[0];
      if (!host) continue;
      found.push({
        rank: 2,
        size: x.used,
        s: {
          id: `stray:${x.part.partNum}:${p.id}:${host.id}`,
          kind: 'stray',
          title: `Move ${x.part.name} from ${p.name} to ${host.name}`,
          why: `${p.name} is mostly ${familyLabel(p.family)}, and ${host.name} already holds ${familyLabel(x.family)}, with room for it.`,
          estimated: unmeasured(p, host),
          moves: [move(x, p, host)],
        },
      });
    }
  }

  // Two pockets of similar parts that would fit in one
  for (const a of inUse) {
    for (const b of inUse) {
      if (a === b || a.mixed || b.mixed || a.used > b.used || (a.used === b.used && a.id > b.id) || room(b) < a.used) continue;
      const sameGroup = a.group === b.group;
      if (!sameGroup && !(a.family === b.family && a.used <= a.capacity * COMBINE_SMALL)) continue;
      const wholeDrawer = pockets.filter((p) => p.comp.key === a.comp.key).every((p) => p === a || !p.parts.length);
      found.push({
        rank: sameGroup ? 3 : 4,
        size: -a.capacity,
        s: {
          id: `combine:${a.id}:${b.id}`,
          kind: 'combine',
          title: `Combine ${a.name} into ${b.name}`,
          why: `Both hold ${sameGroup ? a.groupLabel : familyLabel(a.family)}. Together they'd make ${b.name} ${after(b, a.used)} full, which frees ${wholeDrawer ? `all of ${a.comp.code}` : a.name}.`,
          estimated: unmeasured(a, b),
          moves: a.parts.map((x) => move(x, a, b)),
        },
      });
    }
  }

  // No pocket twice: each accepted move changes the figures for the next
  const skip = new Set(skipped);
  const touched = new Set<string>();
  const shown: Suggestion[] = [];
  let more = 0;
  for (const { s } of found.filter((f) => !skip.has(f.s.id)).sort((a, b) => a.rank - b.rank || a.size - b.size)) {
    const { from, to } = s.moves[0];
    if (touched.has(from) || touched.has(to) || shown.length >= MAX_SHOWN_SUGGESTIONS) {
      more++;
      continue;
    }
    touched.add(from).add(to);
    shown.push(s);
  }
  return { suggestions: shown, more };
}

export function analyseSetup(setup: Setup, comps: SetupComp[], parts: Part[], settings: Settings, tree: TreeNode | null): SetupAnalysis {
  const pockets = placePockets(setup, comps, parts, settings.volumeScale, groupsOf(tree));
  const placed = new Set(pockets.flatMap((p) => p.parts.map((x) => x.part.partNum)));
  const volumeOf = (p: Part) => partVolume(p, settings.volumeScale);
  const allVolume = parts.reduce((t, p) => t + volumeOf(p), 0);
  const { suggestions, more } = suggestionsFor(pockets, settings, setup.skipped);
  return {
    pockets,
    drawersRecorded: comps.filter((c) => setup.drawers[c.key]?.length).length,
    drawersTotal: comps.length,
    partsPlaced: placed.size,
    partsTotal: parts.length,
    volumePlaced: allVolume ? parts.filter((p) => placed.has(p.partNum)).reduce((t, p) => t + volumeOf(p), 0) / allVolume : 0,
    unplaced: parts.filter((p) => !placed.has(p.partNum)).sort((a, b) => volumeOf(b) - volumeOf(a)),
    used: pockets.reduce((t, p) => t + p.used, 0),
    capacity: pockets.reduce((t, p) => t + p.capacity, 0),
    check: checkEstimates(pockets),
    findings: findingsFor(pockets, settings),
    suggestions,
    moreSuggestions: more,
  };
}

// ─── Accepting a suggestion ──────────────────────────────────────────────────

const roundFill = (f: number) => Math.round(Math.min(1, Math.max(0, f)) * 100) / 100;

export function acceptSuggestion(setup: Setup, s: Suggestion, pockets: PlacedPocket[]): Setup {
  const placed = new Map(pockets.map((p) => [p.id, p]));
  const keys = new Set(s.moves.flatMap((m) => [placed.get(m.from)?.comp.key, placed.get(m.to)?.comp.key]).filter((k): k is string => !!k));
  const before = Object.fromEntries([...keys].map((k) => [k, setup.drawers[k]]));
  const drawers = { ...setup.drawers };
  const changed = (id: string, f: (p: SetupPocket, capacity: number) => SetupPocket) => {
    const at = placed.get(id);
    if (at) drawers[at.comp.key] = drawers[at.comp.key].map((p) => (p.id === id ? f(p, at.capacity) : p));
  };
  for (const m of s.moves) {
    changed(m.from, (p, capacity) => {
      const left = p.parts.filter((x) => x !== m.part);
      return { ...p, parts: left, fill: !left.length || p.fill === undefined ? undefined : roundFill(p.fill - m.volume / capacity) };
    });
    changed(m.to, (p, capacity) => ({ ...p, parts: [...new Set([...p.parts, m.part])], fill: p.fill === undefined ? undefined : roundFill(p.fill + m.volume / capacity) }));
  }
  return { ...setup, drawers, accepted: [...setup.accepted, { id: s.id, text: s.title, before }] };
}

/** Put back the drawers the most recent accepted suggestion changed */
export function undoLastAccepted(setup: Setup): Setup {
  const last = setup.accepted[setup.accepted.length - 1];
  if (!last) return setup;
  return { ...setup, drawers: { ...setup.drawers, ...last.before }, accepted: setup.accepted.slice(0, -1) };
}

// ─── Loading drafts ──────────────────────────────────────────────────────────

/** Drawers worked out elsewhere, such as from photos, to load in and then correct */
/** Where a box is on its drawer's top photo, in percent across and down */
export interface PhotoArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DraftPocket {
  /** "Back left", which the review is kept under */
  where?: string;
  share?: number;
  fill?: number;
  parts: string[];
  container?: LooseContainer;
  label?: string;
  /** parts that might be here, for the user to say yes or no to */
  maybe?: string[];
  /** a question for the user about this box */
  ask?: string;
  area?: PhotoArea;
}

export interface DraftDrawer {
  code: string;
  open?: OpenedUnit['how'];
  note?: string;
  /** the drawer code its photos are filed under, when that isn't the code (a draft filed as "A3?" with photos as A3) */
  photos?: string;
  pockets: DraftPocket[];
}

export interface SetupDraft {
  note?: string;
  drawers: DraftDrawer[];
}

export interface DraftResult {
  setup: Setup;
  loaded: string[];
  /** drawers that already had something recorded, which this replaces */
  replaced: string[];
  /** drawer codes with no such drawer */
  noDrawer: string[];
  /** part numbers that aren't in the planned collection */
  noPart: string[];
}

export function loadDraft(setup: Setup, draft: SetupDraft, comps: Compartment[], parts: Part[], newId: () => string): DraftResult {
  const known = new Set(parts.map((p) => p.partNum));
  const result: DraftResult = { setup, loaded: [], replaced: [], noDrawer: [], noPart: [] };
  for (const drawer of draft.drawers) {
    let next = result.setup;
    if (drawer.open) {
      // A drawer that's opened up goes by its unit's letter, whether or not it's been opened yet
      const first = setupComps(comps).find((c) => c.code === `${drawer.code}1`);
      if (first) next = openUnit(next, comps.filter((c) => c.unitId === first.unitId), drawer.open, newId);
    }
    const comp = setupComps(comps, next.open).find((c) => c.code === drawer.code);
    if (!comp) {
      result.noDrawer.push(drawer.code);
      continue;
    }
    if (result.setup.drawers[comp.key]?.length || next.drawers[comp.key]?.length) result.replaced.push(drawer.code);
    const even = 1 / drawer.pockets.length;
    const pockets = drawer.pockets.map((p) => {
      result.noPart.push(...p.parts.filter((n) => !known.has(n)));
      return { ...newPocket(newId(), p.share ?? even), fill: p.fill, parts: p.parts.filter((n) => known.has(n)), ...(p.container ? { container: p.container } : {}), ...(p.label ? { label: p.label } : {}) };
    });
    result.setup = { ...next, drawers: { ...next.drawers, [comp.key]: pockets } };
    result.loaded.push(drawer.code);
  }
  result.noPart = [...new Set(result.noPart)];
  return result;
}

// ─── Finding parts to add ────────────────────────────────────────────────────

export interface SearchResults {
  groups: { id: string; label: string; family: string; parts: Part[]; unplaced: number }[];
  parts: Part[];
}

const MAX_GROUPS = 6;
const MAX_PARTS = 24;

const isWordChar = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);

/** Whether a word in the text starts with this, so "2" finds "2 x 4" but not "12 x 4" */
function startsAWord(text: string, word: string) {
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) if (!isWordChar(text[at - 1])) return true;
  return false;
}

/** Parts and groups matching what was typed, however the words are ordered ("2 x 4 brick"), closest match first */
export function searchParts(tree: TreeNode | null, query: string, placed: ReadonlySet<string>): SearchResults {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tree || !words.length) return { groups: [], parts: [] };
  const phrase = words.join(' ');
  const matches = (text: string) => words.every((w) => startsAWord(text.toLowerCase(), w));
  const groups: SearchResults['groups'] = [];
  const parts: Part[] = [];
  const walk = (n: TreeNode) => {
    if (n.part) {
      if (n.part.partNum.toLowerCase() === phrase || matches(n.part.name)) parts.push(n.part);
      return;
    }
    // A category named the same as its family would just be listed twice
    if (n.id !== 'root' && matches(n.label) && n.parent?.label !== n.label) {
      const all = leaves(n).flatMap((l) => (l.part ? [l.part] : []));
      if (all.length > 1) groups.push({ id: n.id, label: n.label, family: n.familyKey, parts: all, unplaced: all.filter((p) => !placed.has(p.partNum)).length });
    }
    n.children.forEach(walk);
  };
  walk(tree);
  const closeness = (p: Part) => {
    const name = p.name.toLowerCase();
    if (name === phrase || p.partNum.toLowerCase() === phrase) return 0;
    if (name.startsWith(phrase)) return 1;
    return name.includes(phrase) ? 2 : 3;
  };
  const best = (a: Part, b: Part) =>
    closeness(a) - closeness(b) || Number(placed.has(a.partNum)) - Number(placed.has(b.partNum)) || a.name.length - b.name.length || onePieceVolume(b) * b.qty - onePieceVolume(a) * a.qty;
  return { groups: groups.slice(0, MAX_GROUPS), parts: parts.sort(best).slice(0, MAX_PARTS) };
}

/** Other parts in the same group as this one, not yet in any drawer: usually what goes in next */
export function unplacedNeighbours(tree: TreeNode | null, partNum: string, placed: ReadonlySet<string>, max = 8): Part[] {
  if (!tree) return [];
  const leaf = leaves(tree).find((l) => l.part?.partNum === partNum);
  if (!leaf?.parent) return [];
  return leaves(leaf.parent)
    .flatMap((l) => (l.part && !placed.has(l.part.partNum) ? [l.part] : []))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, max);
}

export interface UnsortedFamily {
  family: string;
  label: string;
  /** biggest by volume first */
  parts: Part[];
  pieces: number;
  volume: number;
}

/** How "Not sorted yet" is ordered: by the room parts take, or by how many pieces there are */
export type UnsortedOrder = 'volume' | 'pieces';

/**
 * Parts not in any recorded drawer, by family. Families and the parts in each come biggest first: by volume, or
 * with `order` 'pieces', by how many pieces there are.
 */
export function unsortedByFamily(unplaced: Part[], scale = 1, order: UnsortedOrder = 'volume'): UnsortedFamily[] {
  const out = new Map<string, UnsortedFamily>();
  for (const p of unplaced) {
    const fam = familyFor(p.catId);
    const f = out.get(fam.key) ?? { family: fam.key, label: fam.label, parts: [], pieces: 0, volume: 0 };
    f.parts.push(p);
    f.pieces += p.qty;
    f.volume += partVolume(p, scale);
    out.set(fam.key, f);
  }
  const byName = (a: Part, b: Part) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const partOrder = order === 'pieces' ? (a: Part, b: Part) => b.qty - a.qty || byName(a, b) : (a: Part, b: Part) => partVolume(b, scale) - partVolume(a, scale) || byName(a, b);
  for (const f of out.values()) f.parts.sort(partOrder);
  return [...out.values()].sort(order === 'pieces' ? (a, b) => b.pieces - a.pieces || b.volume - a.volume : (a, b) => b.volume - a.volume);
}
