import { describe, expect, it } from 'vitest';
import { homesInRecorded, planGaps } from './gaps';
import { buildTree, expandCompartments } from './planner';
import { analyseSetup, groupsOf, setupComps } from './setup';
import { DEFAULT_SETTINGS, EMPTY_SETUP, type Part, type Setup, type StorageUnit } from './types';

const part = (partNum: string, name: string, qty: number, catId: number, unitVolume = 1): Part => ({ partNum, name, catId, qty, colours: 1, unitVolume, known: true });
const drawers = (id: string, qty: number): StorageUnit => ({ id, name: `Drawers ${id}`, code: id.toUpperCase(), accessibility: 2, compartments: [{ id: `${id}c`, label: 'Drawer', w: 220, d: 290, h: 70, qty }] });
const s = { ...DEFAULT_SETTINGS, spareFraction: 0 };
const units = [drawers('a', 6)];
const key = (n: number) => `a:ac:${n}`;

describe('filling the gaps', () => {
  const bricks = [part('b1', 'Brick 2 x 4', 200, 11, 3.5), part('b2', 'Brick 2 x 2', 200, 11, 3.5), part('b3', 'Brick 1 x 2', 200, 11, 3.5)];

  it('fills free drawers in turn and leaves the rest empty, unless asked to spread', () => {
    const inTurn = planGaps(units, EMPTY_SETUP, bricks, {}, s);
    const spread = planGaps(units, EMPTY_SETUP, bricks, {}, { ...s, spread: true });
    expect(inTurn.suggested.size).toBeLessThan(spread.suggested.size);
    expect(inTurn.suggested.size).toBe(1);
  });

  it('never suggests anything for a recorded drawer', () => {
    const setup: Setup = { ...EMPTY_SETUP, drawers: { [key(0)]: [{ id: 'p', share: 1, parts: [] }] } };
    expect(planGaps(units, setup, bricks, {}, s).suggested.has(key(0))).toBe(false);
  });

  it('offers room beside the same group in a recorded drawer first, and not in a pocket labelled for something else', () => {
    const all = [...bricks, part('b4', 'Brick 1 x 1', 10, 11), part('b5', 'Brick 1 x 4', 10, 11)];
    const setup: Setup = {
      ...EMPTY_SETUP,
      drawers: {
        [key(0)]: [{ id: 'p', share: 0.5, parts: ['b3'] }, { id: 'q', share: 0.5, parts: ['b1'], label: 'Big bricks' }],
      },
    };
    const comps = setupComps(expandCompartments(units, s), setup.open);
    const tree = buildTree(all, {}, 1);
    const a = analyseSetup(setup, comps, all, s, tree);
    const groups = groupsOf(tree);
    const homes = homesInRecorded(a.unplaced, a.pockets, setup, (n) => groups.get(n)?.key, s);
    expect([...homes.keys()].sort()).toEqual(['b2', 'b4', 'b5']);
    // The labelled pocket only takes parts of its own group
    for (const h of homes.values()) expect(h.code).toMatch(/^A1\.[12]$/);
  });

  it('tips a near-empty suggested drawer into another of the same group where it fits', () => {
    const two = [drawers('a', 1), { ...drawers('b', 1), name: 'Boxes', compartments: [{ id: 'bc', label: 'Box', w: 300, d: 300, h: 90, qty: 1 }] }];
    const mixed = [part('b1', 'Brick 2 x 4', 30, 11), part('s1', 'Slope 45 2 x 2', 30, 3)];
    const g = planGaps(two, EMPTY_SETUP, mixed, { 3: 'Bricks Sloped', 11: 'Bricks' }, s);
    expect(g.suggested.size).toBe(1);
    expect(g.homeOf.size).toBe(2);
  });
});
