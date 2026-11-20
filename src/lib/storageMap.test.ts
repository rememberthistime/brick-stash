import { describe, expect, it } from 'vitest';
import { nudgeUnit, storageMap } from './storageMap';
import type { StorageUnit } from './types';

const unit = (id: string, spaceId?: string, shelf?: number, w?: number): StorageUnit => ({ id, name: id, accessibility: 2, compartments: [], ...(spaceId ? { spaceId } : {}), ...(shelf ? { shelf } : {}), ...(w ? { external: { w, d: 300, h: 200 } } : {}) });

describe('storage map', () => {
  const units = [unit('a', 's1', 2, 400), unit('b', 's1', 1, 200), unit('c', 's1', 2, 200), unit('d'), unit('e', 'gone')];
  const map = storageMap([{ id: 's1', name: 'Hall cupboard', w: 900, d: 400, h: 1800 }], units, (u) => [{ code: `${u.id}1`, title: 'Plates', recorded: true }]);

  it('puts units on their shelves from the top, left to right, sized by their width', () => {
    expect(map[0].space?.name).toBe('Hall cupboard');
    expect(map[0].shelves.map((s) => s.map((m) => m.unit.id))).toEqual([['b'], ['a', 'c']]);
    expect(map[0].shelves[1].map((m) => Math.round(m.width * 100))).toEqual([67, 33]);
  });

  it('collects units in no cupboard, or in one that has gone, at the end', () => {
    expect(map[1].space).toBeNull();
    expect(map[1].shelves[0].map((m) => m.unit.id)).toEqual(['d', 'e']);
  });

  it('moves a unit along its own shelf only', () => {
    expect(nudgeUnit(units, 'c', -1).map((u) => u.id)).toEqual(['c', 'b', 'a', 'd', 'e']);
    expect(nudgeUnit(units, 'b', 1)).toBe(units);
  });
});
