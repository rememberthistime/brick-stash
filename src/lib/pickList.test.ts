import { describe, expect, it } from 'vitest';
import { pickList, placesWithFallback, planPlaces, setupPlaces, type Place, type Places } from './pickList';
import type { PlannedCompartment, TreeNode } from './planner';
import type { SetupComp } from './setup';
import { EMPTY_SETUP, type Catalog, type Part } from './types';

const part = (partNum: string, name: string, qty: number): Part => ({ partNum, name, catId: 11, qty, colours: 1, unitVolume: 1, known: true });
const catalog: Catalog = { built: '', categories: {}, parts: { 3001: ['Brick 2 x 4', 11], 3003: ['Brick 2 x 2', 11], '3069b': ['Tile 1 x 2 with Groove', 19], 3023: ['Plate 1 x 2', 14], '3626c': ['Minifig Head', 59], 99999: ['Rare thing', 11] }, aliases: { '3069a': '3069b', '3626cpr0001': '3626c' } };
const owned = [part('3001', 'Brick 2 x 4', 50), part('3003', 'Brick 2 x 2', 3), part('3069b', 'Tile 1 x 2 with Groove', 40), part('3023', 'Plate 1 x 2', 10), part('3626c', 'Minifig Head', 6)];
const at = (code: string, order: number): Place[] => [{ code, drawer: code.split('.')[0], where: `Unit › ${code}`, order }];
const places: Places = new Map([
  ['3001', at('B2', 5)],
  ['3003', at('B2', 5)],
  ['3069b', at('A1.2', 0)],
]);

describe('pick list', () => {
  const wanted = [
    { partNum: '3001', qty: 4, colour: 'Red' },
    { partNum: '3001', qty: 6, colour: 'Blue' },
    { partNum: '3003', qty: 5, colour: 'Red' },
    { partNum: '3069a', qty: 2, colour: 'Black' },
    { partNum: '3023', qty: 1 },
    { partNum: '3626cpr0001', qty: 1, colour: 'Yellow' },
    { partNum: '99999', qty: 2 },
    { partNum: '3001', qty: 1, colour: 'Red', spare: true },
  ];
  const list = pickList(wanted, catalog, owned, places, new Set(['3626c']));

  it('lists drawers in the order they come, with how many of each part to take and in which colours', () => {
    expect(list.drawers.map((d) => d.code)).toEqual(['A1', 'B2']);
    expect(list.drawers[1].lines.map((l) => [l.partNum, l.want, l.have])).toEqual([['3003', 5, 3], ['3001', 10, 50]]);
    expect(list.drawers[1].lines[1].colours).toEqual([{ name: 'Blue', qty: 6 }, { name: 'Red', qty: 4 }]);
  });

  it('finds a part by its mould, whatever variant the build names', () => {
    expect(list.drawers[0].lines.map((l) => [l.partNum, l.places[0].code])).toEqual([['3069b', 'A1.2']]);
  });

  it('says what’s short, missing, stored elsewhere or without a drawer, and leaves spares off', () => {
    expect(list.short.map((l) => l.partNum)).toEqual(['3003']);
    expect(list.missing.map((l) => l.partNum)).toEqual(['99999']);
    expect(list.elsewhere.map((l) => l.partNum)).toEqual(['3626c']);
    expect(list.unplaced.map((l) => l.partNum)).toEqual(['3023']);
    expect([list.pieces, list.types, list.piecesShort]).toEqual([21, 6, 4]);
  });

  it('reads places from the plan, numbering sections that share a compartment', () => {
    const leaf = (p: Part): TreeNode => ({ id: `part:${p.partNum}`, label: p.name, familyKey: 'bricks', children: [], part: p, pieces: p.qty, volume: 1, seq: 0 });
    const group: TreeNode = { id: 'g', label: 'Bricks (mixed)', familyKey: 'bricks', children: [leaf(owned[0]), leaf(owned[1])], pieces: 53, volume: 2, seq: 0 };
    const comp = { comp: { unitName: 'Cabinet', label: 'Drawer 3' }, code: 'C3', sections: [{ node: leaf(owned[2]), volume: 1, pieces: 40 }, { node: group, volume: 2, pieces: 53 }] } as unknown as PlannedCompartment & { code: string };
    const found = planPlaces([comp]);
    expect(found.get('3069b')).toEqual([{ code: 'C3.1', drawer: 'C3', where: 'Cabinet › Drawer 3', order: 0 }]);
    expect(found.get('3001')![0]).toMatchObject({ code: 'C3.2', section: 'Bricks (mixed)' });
  });

  it('prefers where a part really is over where the plan would put it', () => {
    const comps = [{ key: 'k1', code: 'D1', unitName: 'Tubs', label: 'Tub' }] as SetupComp[];
    const real = setupPlaces({ ...EMPTY_SETUP, drawers: { k1: [{ id: 'a', share: 1, parts: ['3001'] }, { id: 'b', share: 1, parts: ['3023'], label: 'Small plates' }] } }, comps);
    const both = placesWithFallback(real, places);
    expect(both.get('3001')![0].code).toBe('D1.1');
    expect(both.get('3023')![0]).toMatchObject({ code: 'D1.2', section: 'Small plates' });
    expect(both.get('3003')![0].code).toBe('B2');
  });
});
