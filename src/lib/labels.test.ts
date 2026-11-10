import { describe, expect, it } from 'vitest';
import { setupLabels } from './labels';
import { expandCompartments } from './planner';
import { placePockets, setupComps } from './setup';
import { DEFAULT_SETTINGS, EMPTY_SETUP, type Part, type Setup, type StorageUnit } from './types';

const part = (partNum: string, name: string, qty: number, catId = 11): Part => ({ partNum, name, catId, qty, colours: 1, unitVolume: 1, known: true });
const parts = [part('3001', 'Brick 2 x 4', 50), part('3003', 'Brick 2 x 2', 80), part('30055', 'Fence Spindled 1 x 4 x 2 [2 Top Studs]', 20, 32), part('3185', 'Fence Lattice 1 x 4 x 2', 5, 32)];
const unit: StorageUnit = { id: 'u', name: 'Sterilite Large #2', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 310, d: 310, h: 60, qty: 2 }] };
const comps = setupComps(expandCompartments([unit], DEFAULT_SETTINGS));
const pocket = (id: string, ps: string[], label?: string) => ({ id, share: 1, parts: ps, ...(label ? { label } : {}) });

function labels(drawer: ReturnType<typeof pocket>[], perBox = false) {
  const setup: Setup = { ...EMPTY_SETUP, drawers: { [comps[0].key]: drawer } };
  return setupLabels(placePockets(setup, comps, parts, 1), comps, perBox);
}

describe('labels for the setup', () => {
  it('prints a named box’s name, with pictures of what is most in it', () => {
    const [entry] = labels([pocket('a', ['3185', '30055'], 'Fences')]);
    expect(entry.cells[0]).toMatchObject({ title: 'Fences', sheetTitle: 'Fences', detail: '2 types', images: ['30055', '3185'] });
    expect(entry.where).toBe('Sterilite Large #2 › Drawer 1');
    expect(entry.kind).toBe('Sterilite Large');
  });

  it('prints a single part by name and number, and leaves out empty unnamed boxes', () => {
    const [entry] = labels([pocket('a', ['3001']), pocket('b', []), pocket('c', [], 'Spare')]);
    expect(entry.cells.map((c) => [c.title, c.detail])).toEqual([
      ['Brick 2 x 4', '3001'],
      ['Spare', ''],
    ]);
  });

  it('can make one label per box, numbered as in the drawer', () => {
    const entries = labels([pocket('a', ['3001']), pocket('b', []), pocket('c', ['3003'], 'Small bricks')], true);
    expect(entries.map((e) => e.code)).toEqual(['I1.1', 'I1.3'].map((c) => c.replace('I1', comps[0].code)));
    expect(entries[1].where).toContain('box 3');
  });

  it('labels nothing for a drawer with nothing recorded', () => {
    expect(labels([pocket('a', [])])).toEqual([]);
  });
});
