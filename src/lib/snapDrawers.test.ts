import { describe, expect, it } from 'vitest';
import { buildTree, expandCompartments, plan } from './planner';
import { setupComps } from './setup';
import { DEFAULT_SETTINGS, type StorageUnit } from './types';

const drawers = (id: string, accessibility: 1 | 2 | 3, qty: number): StorageUnit => ({ id, name: id, accessibility, compartments: [{ id: `${id}c`, label: 'Drawer', w: 200, d: 280, h: 70, qty }] });

describe('the phone’s drawer codes', () => {
  // The phone skips the planner, so its codes have to come out the same as the My setup tab's, which go through it
  it('match the ones worked out from a full plan, in the same order', () => {
    const units = [drawers('low', 1, 2), drawers('high', 3, 3), drawers('mid', 2, 1)];
    const open = { low: { how: 'dividers' as const } };
    const fromPlan = plan(buildTree([], {}, 1), units, DEFAULT_SETTINGS).compartments.map((c) => c.comp);
    const direct = expandCompartments(units, DEFAULT_SETTINGS);
    const codes = (list: typeof direct) => setupComps(list, open).map((c) => [c.code, c.key]);
    expect(codes(direct)).toEqual(codes(fromPlan));
    expect(codes(direct).map(([code]) => code)).toEqual(['A1', 'A2', 'A3', 'B1', 'C']);
  });
});
