// Moving parts by hand: from wherever they are (a pocket, or not in a drawer yet) to any pocket of any drawer, a
// pocket's whole contents to another, or two drawers swapped. Each change says which drawers it touched and how they
// were before, so it can be undone, a step at a time.
import { newPocket, withParts } from './setup';
import { jobAt, nameAt, withJobAt, withNameAt } from './rearrange';
import type { Project, Setup, SetupPocket, StorageUnit, UnitJob } from './types';

/** A pocket: the drawer's compartment key and the pocket's place in it */
export interface Spot {
  key: string;
  pocket: number;
}

/** A part to move, and the pocket it's in now (none for a part not in a drawer yet) */
export interface MoveItem {
  part: string;
  from?: Spot;
}

/** One step that can be undone: the drawers it touched as they were (undefined: not recorded), and their names */
export interface Step {
  text: string;
  drawers: Record<string, SetupPocket[] | undefined>;
  names?: Record<string, string>;
  jobs?: Record<string, UnitJob | null>;
}

const same = (a: Spot | undefined, b: Spot) => !!a && a.key === b.key && a.pocket === b.pocket;

/**
 * Move parts into one pocket. Each comes out of the pocket it was in. A drawer with nothing recorded is recorded as
 * one pocket. A pocket emptied by the move loses its fill, as there's nothing to be full of; other fills are left as
 * entered, since only you can say how full it is now.
 */
export function moveParts(setup: Setup, items: MoveItem[], to: Spot, newId: () => string): { setup: Setup; before: Step['drawers'] } {
  const moving = items.filter((it) => !same(it.from, to));
  const keys = new Set([to.key, ...moving.flatMap((it) => (it.from ? [it.from.key] : []))]);
  const before = Object.fromEntries([...keys].map((k) => [k, setup.drawers[k]]));
  if (!moving.length) return { setup, before: {} };
  const drawers = { ...setup.drawers };
  for (const it of moving) {
    if (!it.from || !drawers[it.from.key]) continue;
    drawers[it.from.key] = drawers[it.from.key].map((p, i) => {
      if (i !== it.from!.pocket || !p.parts.includes(it.part)) return p;
      const parts = p.parts.filter((x) => x !== it.part);
      return { ...withParts(p, parts), fill: parts.length ? p.fill : undefined };
    });
  }
  const list = drawers[to.key]?.length ? drawers[to.key] : [newPocket(newId())];
  const index = Math.max(0, Math.min(to.pocket, list.length - 1));
  drawers[to.key] = list.map((p, i) => (i === index ? { ...p, parts: [...new Set([...p.parts, ...moving.map((it) => it.part)])] } : p));
  return { setup: { ...setup, drawers }, before };
}

/** Everything in one pocket into another */
export function movePocket(setup: Setup, from: Spot, to: Spot, newId: () => string) {
  const parts = setup.drawers[from.key]?.[from.pocket]?.parts ?? [];
  return moveParts(
    setup,
    parts.map((part) => ({ part, from })),
    to,
    newId,
  );
}

/** Two drawers swapped: each one's pockets and its own name go to the other's slot */
export function swapDrawers(p: Pick<Project, 'setup' | 'units'>, a: string, b: string): { setup: Setup; units: StorageUnit[]; before: Step['drawers']; names: Record<string, string>; jobs: Record<string, UnitJob | null> } {
  const before = { [a]: p.setup.drawers[a], [b]: p.setup.drawers[b] };
  const names = { [a]: nameAt(p.units, a), [b]: nameAt(p.units, b) };
  const jobs = { [a]: jobAt(p.units, a), [b]: jobAt(p.units, b) };
  if (a === b) return { setup: p.setup, units: p.units, before: {}, names: {}, jobs: {} };
  const drawers = { ...p.setup.drawers };
  for (const [to, from] of [
    [a, b],
    [b, a],
  ]) {
    if (before[from]) drawers[to] = before[from]!;
    else delete drawers[to];
  }
  const units = withJobAt(withJobAt(withNameAt(withNameAt(p.units, a, names[b]), b, names[a]), a, jobs[b]), b, jobs[a]);
  return { setup: { ...p.setup, drawers }, units, before, names, jobs };
}

/** Put the drawers a step touched back as they were, and their names */
export function undoStep(p: Pick<Project, 'setup' | 'units'>, step: Step): { setup: Setup; units: StorageUnit[] } {
  const drawers = { ...p.setup.drawers };
  for (const [key, pockets] of Object.entries(step.drawers)) {
    if (pockets) drawers[key] = pockets;
    else delete drawers[key];
  }
  let units = p.units;
  for (const [key, name] of Object.entries(step.names ?? {})) units = withNameAt(units, key, name);
  for (const [key, job] of Object.entries(step.jobs ?? {})) units = withJobAt(units, key, job);
  return { setup: { ...p.setup, drawers }, units };
}

/** Take parts out of their pockets, so they're not in a drawer any more */
export function takeOut(setup: Setup, items: Required<MoveItem>[]): { setup: Setup; before: Step['drawers'] } {
  const keys = new Set(items.map((it) => it.from.key));
  const before = Object.fromEntries([...keys].map((k) => [k, setup.drawers[k]]));
  const drawers = { ...setup.drawers };
  for (const { part, from } of items) {
    if (!drawers[from.key]) continue;
    drawers[from.key] = drawers[from.key].map((p, i) => {
      if (i !== from.pocket) return p;
      const parts = p.parts.filter((x) => x !== part);
      return { ...withParts(p, parts), fill: parts.length ? p.fill : undefined };
    });
  }
  return { setup: { ...setup, drawers }, before };
}
