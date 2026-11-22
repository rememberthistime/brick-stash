// Moves to make: the moves you've accepted, which are already recorded here, set out as the work still to do in the
// real drawers. Moves of parts are grouped by the drawer they come out of, so one trip to a drawer does all of them.
// Swaps of whole drawers are put together into where each drawer ends up, as a run of swaps through one slot is
// really a handful of drawers changing places.
import type { AcceptedMove, Setup } from './types';
import { setChecked } from './setup';

/** A move of a whole drawer from one slot to another, once every accepted swap is done */
export interface DrawerShift {
  /** the slot the drawer is in now, in the real storage */
  from: string;
  /** the slot it goes to */
  to: string;
}

/** Drawers changing places among themselves, and the accepted swaps that add up to it */
export interface DrawerRing {
  shifts: DrawerShift[];
  /** indices into the accepted list */
  indices: number[];
}

/** Moves of parts out of one drawer (null where it can't be told) */
export interface PartTrip {
  from: string | null;
  indices: number[];
}

export interface TodoList {
  rings: DrawerRing[];
  trips: PartTrip[];
}

/** A swap of whole drawers, made on Tidy the layout or by Swap with another drawer, carries the drawers' names */
export const isDrawerSwap = (a: AcceptedMove) => a.namesBefore !== undefined && Object.keys(a.before).length === 2;

/** The drawer a move of parts takes them out of: the one that held them before */
export function sourceOf(a: AcceptedMove): string | null {
  if (!a.parts?.length) return null;
  const parts = new Set(a.parts);
  const keys = Object.keys(a.before);
  return keys.find((k) => (a.before[k] ?? []).some((p) => p.parts.some((x) => parts.has(x)))) ?? keys[0] ?? null;
}

export function todoList(accepted: AcceptedMove[]): TodoList {
  // Swaps: which real drawer ends up in each slot, and which swaps belong together
  const occupant = new Map<string, string>();
  const parent = new Map<string, string>();
  const root = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const r = root(p);
    parent.set(k, r);
    return r;
  };
  const swapsAt: { index: number; a: string; b: string }[] = [];
  const trips = new Map<string | null, number[]>();
  accepted.forEach((m, index) => {
    if (isDrawerSwap(m)) {
      const [a, b] = Object.keys(m.before);
      const [oa, ob] = [occupant.get(a) ?? a, occupant.get(b) ?? b];
      occupant.set(a, ob);
      occupant.set(b, oa);
      parent.set(root(a), root(b));
      swapsAt.push({ index, a, b });
    } else {
      const from = sourceOf(m);
      trips.set(from, [...(trips.get(from) ?? []), index]);
    }
  });
  const rings = new Map<string, DrawerRing>();
  for (const s of swapsAt) {
    const r = root(s.a);
    const ring = rings.get(r) ?? { shifts: [], indices: [] };
    ring.indices.push(s.index);
    rings.set(r, ring);
  }
  for (const [slot, from] of occupant) if (from !== slot) rings.get(root(slot))?.shifts.push({ from, to: slot });
  return {
    rings: [...rings.values()],
    trips: [...trips].map(([from, indices]) => ({ from, indices })),
  };
}

/** What's needed to put moves taken off the list back, ticks and all */
export interface DoneStep {
  removed: { index: number; move: AcceptedMove }[];
  drawers: Setup['drawers'];
}

/** Take moves off the list once they're done in the real drawers. The parts they moved are ticked as there. */
export function markDone(setup: Setup, indices: number[]): { setup: Setup; step: DoneStep } {
  const gone = new Set(indices.filter((i) => setup.accepted[i]));
  const drawers = { ...setup.drawers };
  const before: Setup['drawers'] = {};
  for (const i of gone) {
    const m = setup.accepted[i];
    if (!m.parts?.length || isDrawerSwap(m)) continue;
    for (const key of Object.keys(m.before)) {
      const pockets = drawers[key];
      if (!pockets) continue;
      if (!(key in before)) before[key] = setup.drawers[key];
      drawers[key] = pockets.map((p) => setChecked(p, m.parts!.filter((x) => p.parts.includes(x)), true));
    }
  }
  return {
    setup: { ...setup, drawers, accepted: setup.accepted.filter((_, i) => !gone.has(i)) },
    step: { removed: [...gone].sort((a, b) => a - b).map((index) => ({ index, move: setup.accepted[index] })), drawers: before },
  };
}

/** Put moves taken off the list back where they were in it, and their ticks as they were */
export function unmarkDone(setup: Setup, step: DoneStep): Setup {
  const accepted = [...setup.accepted];
  for (const r of step.removed) accepted.splice(Math.min(r.index, accepted.length), 0, r.move);
  return { ...setup, accepted, drawers: { ...setup.drawers, ...step.drawers } };
}
