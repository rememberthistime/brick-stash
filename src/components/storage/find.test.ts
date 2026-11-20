import { describe, expect, it } from 'vitest';
import { findElsewhere } from './find';
import { EMPTY_SETUP, type Catalog, type Part } from '../../lib/types';

const part = (partNum: string, name: string, qty = 5): Part => ({ partNum, name, catId: 36, qty, colours: 1, unitVolume: 60, known: true });
const catalog: Catalog = { built: '', categories: {}, parts: { 52037: ['Vehicle Base 6 x 16 x 2/3 with 4 x 4 Recessed Center', 36], 3001: ['Brick 2 x 4', 11], 3002: ['Brick 2 x 3', 11] }, aliases: {} };

describe('finding a part that isn’t in the Put away list', () => {
  const base = part('52037', 'Vehicle Base 6 x 16 x 2/3 with 4 x 4 Recessed Center', 1);
  const brick = part('3001', 'Brick 2 x 4');
  const setup = { ...EMPTY_SETUP, drawers: { k: [{ id: 'p', share: 1, parts: ['3001'] }] } };

  it('says when it’s kept out, and why', () => {
    const f = findElsewhere('52037', { owned: [base, brick], toStore: [brick], kept: [{ part: base, reason: 'bulky' }], setup, catalog });
    expect(f.kept.map((k) => [k.part.partNum, k.reason])).toEqual([['52037', 'bulky']]);
    expect(f.catalog).toEqual([]);
  });

  it('says when it’s already in a drawer, or all in sets kept built', () => {
    expect(findElsewhere('brick 2 x 4', { owned: [brick], toStore: [brick], kept: [], setup, catalog }).inDrawers[0].spots).toEqual([{ key: 'k', pocket: 0 }]);
    expect(findElsewhere('52037', { owned: [base], toStore: [], kept: [], setup, catalog }).built.map((p) => p.partNum)).toEqual(['52037']);
  });

  it('offers catalogue parts to add when the collection has none', () => {
    expect(findElsewhere('3002', { owned: [brick], toStore: [brick], kept: [], setup, catalog }).catalog).toEqual([{ partNum: '3002', name: 'Brick 2 x 3' }]);
  });
});
