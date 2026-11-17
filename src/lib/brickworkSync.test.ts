import { describe, expect, it } from 'vitest';
import { planSync, type BwLine, type BwStorage } from './brickworkSync';
import { withUnitCodes } from './codes';
import { buildTree, expandCompartments } from './planner';
import { analyseSetup, setupComps } from './setup';
import { DEFAULT_SETTINGS, EMPTY_SETUP, type Part, type Setup, type StorageUnit } from './types';

const part = (partNum: string, name: string, catId: number): Part => ({ partNum, name, catId, qty: 20, colours: 2, unitVolume: 1, known: true });
const parts = [part('3001', 'Brick 2 x 4', 11), part('3003', 'Brick 2 x 2', 11), part('3023', 'Plate 1 x 2', 14), part('3069b', 'Tile 1 x 2 with Groove', 19)];
const units = withUnitCodes([{ id: 'a', name: 'Sterilite Medium', title: 'Bricks', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] } as StorageUnit]);
const setup: Setup = {
  ...EMPTY_SETUP,
  drawers: {
    'a:c:0': [{ id: 'p1', share: 1, parts: ['3001'] }],
    'a:c:1': [
      { id: 'p2', share: 0.5, parts: ['3003', '3001'], label: 'Small bricks' },
      { id: 'p3', share: 0.5, parts: ['3023'] },
    ],
  },
};
const catalog = { built: '', categories: {}, parts: { 3001: ['Brick 2 x 4', 11], 3003: ['Brick 2 x 2', 11], 3023: ['Plate 1 x 2', 14], '3069b': ['Tile', 19] }, aliases: { '3069a': '3069b' } } as never;
const comps = setupComps(expandCompartments(units, DEFAULT_SETTINGS), setup.open);
const pockets = analyseSetup(setup, comps, parts, DEFAULT_SETTINGS, buildTree(parts, {}, 1)).pockets;
const line = (id: string, partNum: string | null, storageId: string | null, lotId: string | null = null): BwLine => ({ id, partNum, name: '', colour: 'Red', qty: 5, storageId, lotId });

describe('filing parts in Brick Work by drawer', () => {
  it('mirrors units, drawers and pockets, parents first', () => {
    const plan = planSync(units, comps, setup, pockets, catalog, [], []);
    expect(plan.storages.map((s) => [s.key, s.name, s.type, s.parentKey, s.change])).toEqual([
      ['unit:a', 'A: Bricks', 'Cabinet', null, 'create'],
      ['space:a:c:0', 'A1', 'Drawer', 'unit:a', 'create'],
      ['space:a:c:1', 'A2', 'Drawer', 'unit:a', 'create'],
      ['pocket:p2', 'A2.1: Small bricks', 'Bin', 'space:a:c:1', 'create'],
      ['pocket:p3', 'A2.2: Plate 1 x 2', 'Bin', 'space:a:c:1', 'create'],
    ]);
  });

  it('files unstored lines and lines in its own places, and leaves the user’s places and lots alone', () => {
    const storages: BwStorage[] = [
      { id: 'u1', name: 'A: Bricks', type: 'Cabinet', parentId: null, mark: 'unit:a' },
      { id: 'd1', name: 'A1', type: 'Drawer', parentId: 'u1', mark: 'space:a:c:0' },
      { id: 'old', name: 'Gone', type: 'Bin', parentId: null, mark: 'pocket:gone' },
      { id: 'mine', name: 'My tub', type: 'Bin', parentId: null, mark: null },
    ];
    const stock = [
      line('s1', '3023', null), // unstored → its bin
      line('s2', '3069a', 'd1'), // a tile in one of ours, but tiles aren't in a drawer here
      line('s3', '3003', 'mine'), // the user's own place: left
      line('s4', '3003', null, 'lot1'), // in a lot: left
      line('s5', '3001', 'd1'), // split part: 3001 is in A1 and A2.1, and A1 holds more of it, so already right
      line('s6', '3003', 'd1'), // in one of ours, wrong drawer → moves
      line('s7', null, null),
    ];
    const plan = planSync(units, comps, setup, pockets, catalog, stock, storages);
    expect(plan.moves).toEqual([
      { key: 'pocket:p3', stockIds: ['s1'] },
      { key: 'pocket:p2', stockIds: ['s6'] },
    ]);
    expect(plan).toMatchObject({ lines: 7, fromUnstored: 1, fromOurs: 1, fromTheirs: 0, alreadyFiled: 1, inTheirPlaces: 1, inLots: 1, notInDrawers: 2 });
    expect(plan.storages.find((s) => s.key === 'unit:a')?.change).toBe('none');
    expect(plan.unused.map((s) => s.id)).toEqual(['old']);
    // Asked to, it takes lines from the user's own places too
    const all = planSync(units, comps, setup, pockets, catalog, stock, storages, true);
    expect(all.fromTheirs).toBe(1);
    expect(all.moves.find((m) => m.key === 'pocket:p2')?.stockIds).toEqual(['s3', 's6']);
  });
});
