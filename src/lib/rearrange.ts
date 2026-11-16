// Tidying the layout: whole drawers moved between slots that take the same drawer, within a unit or across units of
// the same kind, so each family of parts sits in one run and the run reads in a sensible order. A Sterilite drawer
// pulls out of one unit and slides into another, so moving its contents is moving the drawer. Nothing moves until the
// user accepts a move, and each is a swap of two drawers, so they can be done one at a time.
import { drawerKeyOf, setPlaceName } from './codes';
import type { PlacedPocket, SetupComp } from './setup';
import { stem } from './storageList';
import { FAMILIES, familyGroup } from './taxonomy';
import type { Project, StorageUnit } from './types';

/** A drawer's contents moved from one slot to another */
export interface DrawerStep {
  from: string;
  to: string;
}

/** Drawers moved round in a ring: each into the next one's slot. The suggestions are all swaps of two. */
export interface DrawerCycle {
  id: string;
  steps: DrawerStep[];
}

export interface Rearrangement {
  /** what kind of drawer these are, as in "Sterilite Medium drawers" */
  kind: string;
  /** the slots, in order */
  slots: string[];
  /** the family taking up most of the drawer in each slot, now and once every swap is done (null for empty) */
  now: (string | null)[];
  then: (string | null)[];
  /** places where one family's run gives way to another's, now and after */
  before: number;
  after: number;
  cycles: DrawerCycle[];
}

const familyIndex = new Map(FAMILIES.map((f, i) => [f.key, i]));

/** The family taking up most of a recorded drawer, or null for one recorded as empty */
function contentsOf(pockets: PlacedPocket[]) {
  const byFamily = new Map<string, number>();
  for (const p of pockets) for (const x of p.parts) byFamily.set(x.family, (byFamily.get(x.family) ?? 0) + x.used);
  return byFamily.size ? { family: [...byFamily].sort((a, b) => b[1] - a[1])[0][0] } : null;
}

/** Slots that take the same drawer: the same product, compartment size, and whether opened up into one space */
const slotKind = (c: SetupComp) => `${stem(c.unitName)}|${c.sections ? 'whole' : c.label.replace(/\s*\d+$/, '')}|${Math.round(c.w)}x${Math.round(c.d)}x${Math.round(c.h)}`;

/** Where one family's run of drawers gives way to another's */
const breaksIn = (families: (string | null)[]) => families.reduce((t, f, i) => t + (i > 0 && f !== families[i - 1] && (f !== null || families[i - 1] !== null) ? 1 : 0), 0);

/**
 * For each kind of drawer, moves that bring each family's drawers into one run, if that's better than today. Runs stay
 * roughly where most of a family's drawers already are, and related families sit side by side, so as few drawers as
 * possible move, as swaps of two. Drawers recorded as empty go to the end. Drawers with nothing recorded stay
 * where they are, as what's in them isn't known.
 */
export function rearrangements(comps: SetupComp[], pocketsOf: Map<string, PlacedPocket[]>): Rearrangement[] {
  const kinds = new Map<string, SetupComp[]>();
  for (const c of [...comps].sort((a, b) => a.physOrder - b.physOrder)) if (pocketsOf.get(c.key)?.length) kinds.set(slotKind(c), [...(kinds.get(slotKind(c)) ?? []), c]);

  const out: Rearrangement[] = [];
  for (const [kind, slots] of kinds) {
    if (slots.length < 3) continue;
    const contents = slots.map((c) => contentsOf(pocketsOf.get(c.key) ?? []));
    const families = contents.map((x) => x?.family ?? null);
    // Each family gets one run of slots. Runs are ordered by where each family's drawers are on average now, kept
    // beside related families, so as few drawers as possible are out of their run. Drawers recorded as empty last.
    const mean = (pick: (f: string) => string) => {
      const at = new Map<string, number[]>();
      families.forEach((f, i) => f && at.set(pick(f), [...(at.get(pick(f)) ?? []), i]));
      return new Map([...at].map(([k, is]) => [k, is.reduce((t, i) => t + i, 0) / is.length]));
    };
    const groupAt = mean(familyGroup);
    const familyAt = mean((f) => f);
    const runOrder = [...familyAt.keys()].sort((x, y) => groupAt.get(familyGroup(x))! - groupAt.get(familyGroup(y))! || familyAt.get(x)! - familyAt.get(y)! || (familyIndex.get(x) ?? 99) - (familyIndex.get(y) ?? 99));
    const runOf: (string | null)[] = [];
    for (const f of [...runOrder, null]) for (const x of families) if (x === f) runOf.push(f);
    const before = breaksIn(families);
    const after = breaksIn(runOf);
    if (after >= before) continue;
    // Swaps of two drawers, each putting at least one drawer into its family's run, until every drawer is in its run.
    // A swap that puts both in place is taken first. Each is one simple step, so they can be done one at a time.
    const now = [...families];
    const cycles: DrawerCycle[] = [];
    const swap = (i: number, j: number) => {
      cycles.push({ id: `${kind}:${slots[i].key}<>${slots[j].key}`, steps: [{ from: slots[i].key, to: slots[j].key }, { from: slots[j].key, to: slots[i].key }] });
      [now[i], now[j]] = [now[j], now[i]];
    };
    for (let guard = 0; guard < slots.length * 2; guard++) {
      const out = now.map((_, i) => i).filter((i) => now[i] !== runOf[i]);
      if (!out.length) break;
      let pair: [number, number] | null = null;
      for (const i of out) {
        const j = out.find((k) => k !== i && now[k] === runOf[i] && runOf[k] === now[i]);
        if (j !== undefined) {
          pair = [i, j];
          break;
        }
      }
      if (!pair) {
        const i = out[0];
        const j = out.find((k) => k !== i && runOf[k] === now[i]);
        if (j === undefined) break;
        pair = [i, j];
      }
      swap(...pair);
    }
    if (!cycles.length) continue;
    out.push({ kind: `${stem(slots[0].unitName)} ${slots[0].sections ? 'boxes' : 'drawers'}`, slots: slots.map((c) => c.key), now: families, then: now, before, after, cycles });
  }
  return out;
}

/** A drawer's own name, wherever it's kept: on its unit for an opened-up box, else under the drawer */
function nameAt(units: StorageUnit[], key: string): string {
  if (key.startsWith('whole:')) return units.find((u) => u.id === key.slice('whole:'.length))?.title ?? '';
  const drawer = drawerKeyOf(key);
  return (drawer && units.find((u) => u.id === key.split(':')[0])?.drawerNames?.[drawer]) || '';
}

function withNameAt(units: StorageUnit[], key: string, name: string): StorageUnit[] {
  const whole = key.startsWith('whole:');
  return setPlaceName(units, whole ? key.slice('whole:'.length) : key.split(':')[0], whole ? null : drawerKeyOf(key), name);
}

/**
 * Move the drawers in one ring: each drawer's pockets, and its name, go to the slot it moves to. The move is added to
 * Moves to make, with what's needed to undo it.
 */
export function applyCycle(p: Project, cycle: DrawerCycle, text: string): Pick<Project, 'setup' | 'units'> {
  const keys = cycle.steps.map((s) => s.from);
  const before = Object.fromEntries(keys.map((k) => [k, p.setup.drawers[k]]));
  const namesBefore = Object.fromEntries(keys.map((k) => [k, nameAt(p.units, k)]));
  const drawers = { ...p.setup.drawers };
  let units = p.units;
  for (const { from, to } of cycle.steps) {
    drawers[to] = before[from];
    units = withNameAt(units, to, namesBefore[from]);
  }
  return { units, setup: { ...p.setup, drawers, accepted: [...p.setup.accepted, { id: cycle.id, text, before, namesBefore }] } };
}

/** Undo the most recent accepted move, drawer names included */
export function undoLast(p: Project): Pick<Project, 'setup' | 'units'> {
  const last = p.setup.accepted[p.setup.accepted.length - 1];
  if (!last) return { setup: p.setup, units: p.units };
  let units = p.units;
  for (const [key, name] of Object.entries(last.namesBefore ?? {})) units = withNameAt(units, key, name);
  return { units, setup: { ...p.setup, drawers: { ...p.setup.drawers, ...last.before }, accepted: p.setup.accepted.slice(0, -1) } };
}
