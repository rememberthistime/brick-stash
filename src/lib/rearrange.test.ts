import { describe, expect, it } from 'vitest';
import { setPlaceName, withUnitCodes } from './codes';
import { buildTree, expandCompartments } from './planner';
import { applyCycle, rearrangements, undoLast } from './rearrange';
import { analyseSetup, setupComps } from './setup';
import { emptyProject } from '../state';
import { DEFAULT_SETTINGS, type Part, type Project, type SetupPocket, type StorageUnit } from './types';

const part = (partNum: string, name: string, catId: number): Part => ({ partNum, name, catId, qty: 20, colours: 1, unitVolume: 1, known: true });
const parts = [part('b1', 'Brick 2 x 4', 11), part('b2', 'Brick 2 x 2', 11), part('p1', 'Plate 2 x 4', 14), part('p2', 'Plate 2 x 2', 14), part('w1', 'Wheel 18mm', 29)];
const unit = (id: string): StorageUnit => ({ id, name: 'Sterilite Medium', accessibility: 2, compartments: [{ id: `${id}c`, label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] });
const pocket = (id: string, nums: string[]): SetupPocket[] => [{ id, share: 1, parts: nums }];

function setUp(contents: Record<string, string[]>): { project: Project; plans: ReturnType<typeof rearrangements>; code: (key: string) => string } {
  const units = withUnitCodes([unit('a'), unit('b')]);
  const drawers = Object.fromEntries(Object.entries(contents).map(([k, nums]) => [k, pocket(`x${k}`, nums)]));
  const project: Project = { ...emptyProject(), units, rows: [], setup: { ...emptyProject().setup, drawers } };
  const comps = setupComps(expandCompartments(units, DEFAULT_SETTINGS), {});
  const a = analyseSetup(project.setup, comps, parts, DEFAULT_SETTINGS, buildTree(parts, {}, 1));
  const placed = new Map(comps.map((c) => [c.key, a.pockets.filter((p) => p.comp.key === c.key)]));
  const codes = new Map(comps.map((c) => [c.key, c.code]));
  return { project, plans: rearrangements(comps, placed), code: (k) => codes.get(k)! };
}

describe('tidying the layout', () => {
  // Bricks in A1 and B1, plates in A2 and B2: interleaved across the two units
  const contents = { 'a:ac:0': ['b1'], 'a:ac:1': ['p1'], 'a:ac:2': ['w1'], 'b:bc:0': ['b2'], 'b:bc:1': ['p2'] };

  it('suggests swaps of whole drawers, across units of the same kind, that bring each family together', () => {
    const { plans, code } = setUp(contents);
    expect(plans).toHaveLength(1);
    const [r] = plans;
    expect(r.after).toBeLessThan(r.before);
    expect(r.cycles.every((c) => c.steps.length === 2)).toBe(true);
    // Once all are done, each family is in one run
    const runs = r.then.filter((f, i) => i === 0 || f !== r.then[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
    expect(r.cycles.map((c) => code(c.steps[0].from))).not.toHaveLength(0);
  });

  it('has nothing to suggest when families are already together', () => {
    const { plans } = setUp({ 'a:ac:0': ['b1'], 'a:ac:1': ['b2'], 'a:ac:2': ['p1'], 'b:bc:0': ['p2'], 'b:bc:1': ['w1'] });
    expect(plans).toEqual([]);
  });

  it('moves each drawer’s pockets and name with it, and undoes both', () => {
    const { project, plans } = setUp(contents);
    const named = { ...project, units: setPlaceName(project.units, 'a', 'ac:1', 'Plates') };
    const swap = plans[0].cycles[0];
    const done = { ...named, ...applyCycle(named, swap, 'Swap') };
    const [{ from, to }] = swap.steps;
    expect(done.setup.drawers[to]).toEqual(named.setup.drawers[from]);
    expect(done.setup.drawers[from]).toEqual(named.setup.drawers[to]);
    expect(done.setup.accepted.at(-1)?.text).toBe('Swap');
    const back = { ...done, ...undoLast(done) };
    expect(back.setup.drawers).toEqual(named.setup.drawers);
    expect(back.units).toEqual(named.units);
    expect(back.setup.accepted).toEqual([]);
  });
});
