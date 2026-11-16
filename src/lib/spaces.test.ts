import { describe, expect, it } from 'vitest';
import { howManyFitIn, spaceUse } from './spaces';
import type { Space, StorageUnit } from './types';

const unit = (id: string, name: string, external?: { w: number; d: number; h: number }, spaceId?: string): StorageUnit => ({ id, name, accessibility: 2, compartments: [], ...(external ? { external } : {}), ...(spaceId ? { spaceId } : {}) });
const cupboard: Space = { id: 's', name: 'Cupboard', w: 560, d: 380, h: 560 };

describe('spaces', () => {
  it('counts boxes in rows and stacks, turned whichever way fits more', () => {
    expect(howManyFitIn(cupboard, { w: 280, d: 340, h: 240 })).toBe(4);
    expect(howManyFitIn(cupboard, { w: 340, d: 280, h: 240 })).toBe(4);
    expect(howManyFitIn(cupboard, { w: 600, d: 100, h: 100 })).toBe(0);
  });

  it('says how much of a cupboard its units take, and what else would fit', () => {
    const medium = { w: 280, d: 340, h: 240 };
    const units = [unit('a', 'Sterilite Medium', medium, 's'), unit('b', 'Sterilite Medium #2', medium, 's'), unit('c', 'Large Tray', undefined, 's'), unit('d', 'Organiser', { w: 155, d: 350, h: 70 })];
    const use = spaceUse(cupboard, units);
    expect(use.units.map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(use.unsized).toBe(1);
    expect(use.used).toBeCloseTo((2 * 280 * 340 * 240) / (560 * 380 * 560));
    expect(use.more).toEqual([
      { name: 'Organiser', count: 11 },
      { name: 'Sterilite Medium', count: 2 },
    ]);
  });
});
