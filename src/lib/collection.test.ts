import { describe, expect, it } from 'vitest';
import { collectionRows, findInCatalog, mergeToParts } from './collection';
import type { Catalog } from './types';

const catalog: Catalog = { built: '', categories: { 11: 'Bricks', 14: 'Plates' }, parts: { 3001: ['Brick 2 x 4', 11], 3003: ['Brick 2 x 2', 11], 3023: ['Plate 1 x 2', 14], 30010: ['Panel 1 x 2 x 3', 11] }, aliases: {} };

describe('parts added by hand', () => {
  it('join the imported list, and a part the catalogue lacks keeps its own name and kind', () => {
    const rows = collectionRows({ rows: [{ partNum: '3001', qty: 10 }], extraParts: [{ id: 'a', partNum: '3001', qty: 2 }, { id: 'b', partNum: 'own-1', qty: 5, name: 'Printed clip', catId: 14 }] });
    const parts = mergeToParts(rows, catalog);
    expect(parts.find((p) => p.partNum === '3001')?.qty).toBe(12);
    expect(parts.find((p) => p.partNum === 'own-1')).toMatchObject({ name: 'Printed clip', catId: 14, known: false, qty: 5 });
  });

  it('are found in the catalogue by number or by the words of a name, an exact number first', () => {
    expect(findInCatalog(catalog, '3001').map((p) => p.partNum)).toEqual(['3001', '30010']);
    expect(findInCatalog(catalog, 'brick 2').map((p) => p.partNum)).toEqual(['3001', '3003']);
    expect(findInCatalog(catalog, 'x')).toEqual([]);
  });
});

describe('finding a part in the catalogue', () => {
  const cat: Catalog = { built: '', categories: {}, parts: { 3867: ['Baseplate 16 x 22', 1], 3023: ['Plate 1 x 2', 14], 3794: ['Plate Special 1 x 2 with 1 Stud', 14] }, aliases: {} };
  it('matches the start of words, closest name first', () => {
    expect(findInCatalog(cat, 'plate 1 x 2').map((p) => p.partNum)).toEqual(['3023', '3794']);
  });
});
