// Unit jobs, part sizes and shapes, the layout check, and the planner's builder sorts and shape preference
import { describe, expect, it } from 'vitest';
import { recordedJobs, suggestJobs } from './jobSuggest';
import { layoutCheck } from './layoutCheck';
import { buildTree, expandCompartments, plan } from './planner';
import { acceptSuggestion, analyseSetup, contentsName, placePockets, setupComps, undoLastAccepted } from './setup';
import { sizeClass } from './taxonomy';
import { DEFAULT_SETTINGS, EMPTY_SETUP, type Part, type Setup, type SetupPocket, type StorageUnit } from './types';
import { fitsJob, jobLabel, nameFromJobs, setDrawerJob, setJob, shapeOf, unitShape } from './unitJobs';
import { swapDrawers, undoStep } from './move';
import { placeOptions, filterPlaces } from '../components/storage/places';

const BRICKS = 11;
const PLATES = 14;
const PLATES_SPECIAL = 9;
const TECHNIC_PINS = 53;
const WINDOWS = 16;
const part = (partNum: string, name: string, qty: number, catId: number, unitVolume = 1): Part => ({ partNum, name, catId, qty, colours: 1, unitVolume, known: true });

describe('size classes', () => {
  it('sorts parts by the storage that suits them', () => {
    expect(sizeClass('Plate 1 x 8', PLATES)).toBe('long');
    expect(sizeClass('Brick 2 x 10', BRICKS)).toBe('long');
    expect(sizeClass('Technic Axle 8', 46)).toBe('long');
    expect(sizeClass('Plate 6 x 6', PLATES)).toBe('big');
    expect(sizeClass('Plate 2 x 4', PLATES)).toBe('flat');
    expect(sizeClass('Plate 1 x 1', PLATES)).toBe('flat');
    expect(sizeClass('Technic Pin with Friction Ridges', TECHNIC_PINS)).toBe('tiny');
    expect(sizeClass('Brick 1 x 1', BRICKS)).toBe('tiny');
    expect(sizeClass('Brick 2 x 4', BRICKS)).toBe('ordinary');
  });

  it('reads what a compartment’s shape suits', () => {
    expect(shapeOf({ w: 220, d: 300, h: 30 })).toBe('flat');
    expect(shapeOf({ w: 90, d: 225, h: 80 })).toBe('long');
    expect(shapeOf({ w: 60, d: 60, h: 50 })).toBe('tiny');
    expect(shapeOf({ w: 310, d: 310, h: 60 })).toBe('big');
    expect(shapeOf({ w: 220, d: 290, h: 70 })).toBe('ordinary');
    const eazy = { compartments: [{ id: 'l', label: 'Large', w: 125, d: 125, h: 50, qty: 1 }, { id: 's', label: 'Small', w: 60, d: 60, h: 50, qty: 4 }] };
    expect(unitShape(eazy)).toBe('tiny');
  });
});

describe('unit jobs', () => {
  const unit: StorageUnit = { id: 'u', name: 'Sterilite Medium', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] };

  it('says what a unit is for, in words', () => {
    expect(jobLabel({ what: 'group:bricks' })).toBe('Bricks & Slopes');
    expect(jobLabel({ what: 'plates', size: 'long' })).toBe('Plates: long parts');
    expect(jobLabel({ size: 'tiny' })).toBe('Tiny parts');
    expect(jobLabel(undefined)).toBe('');
  });

  it('knows which parts fit a job', () => {
    const brick = part('3001', 'Brick 2 x 4', 1, BRICKS);
    const longPlate = part('3460', 'Plate 1 x 8', 1, PLATES);
    expect(fitsJob(undefined, brick)).toBeNull();
    expect(fitsJob({ what: 'group:bricks' }, brick)).toBe(true);
    expect(fitsJob({ what: 'group:bricks' }, longPlate)).toBe(false);
    expect(fitsJob({ size: 'long' }, longPlate)).toBe(true);
    expect(fitsJob({ what: 'group:plates', size: 'flat' }, longPlate)).toBe(false);
  });

  it('sets, clears and names from jobs', () => {
    const withJob = setJob([unit], 'u', { what: 'bricks' });
    expect(withJob[0].job).toEqual({ what: 'bricks' });
    expect(setJob(withJob, 'u', {})[0].job).toBeUndefined();
    expect(nameFromJobs(withJob)[0].title).toBe('Bricks');
    const named = [{ ...withJob[0], title: 'Mine' }];
    expect(nameFromJobs(named)).toBe(named);
  });

  it('offers the units whose job the parts fit first when moving', () => {
    const plates: StorageUnit = { id: 'p', name: 'Shallow drawers', code: 'B', accessibility: 2, job: { what: 'group:plates' }, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 300, h: 30, qty: 2 }] };
    const comps = setupComps(expandCompartments([{ ...unit, code: 'A' }, plates], DEFAULT_SETTINGS));
    const plate = part('3020', 'Plate 2 x 4', 10, PLATES);
    const options = filterPlaces(placeOptions(comps, EMPTY_SETUP, [], [plate]), '');
    expect(options[0].code).toBe('B1');
    expect(options[0].similar).toBe(3);
    expect(options[0].detail).toContain('for Plates & Tiles');
  });
});

describe('layout check', () => {
  const units: StorageUnit[] = ['A', 'B', 'C', 'D'].map((code) => ({ id: code.toLowerCase(), code, name: 'Drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 200, d: 200, h: 100, qty: 3 }] }));
  const parts = [part('3001', 'Brick 2 x 4', 100, BRICKS), part('3003', 'Brick 2 x 2', 100, BRICKS), part('3004', 'Brick 1 x 2', 100, BRICKS), part('3020', 'Plate 2 x 4', 100, PLATES), part('60592', 'Window 1 x 2 x 2', 100, WINDOWS), part('2780', 'Technic Pin', 100, TECHNIC_PINS)];
  const check = (byCode: Record<string, SetupPocket[]>, us = units) => {
    const comps = setupComps(expandCompartments(us, DEFAULT_SETTINGS));
    const setup: Setup = { ...EMPTY_SETUP, drawers: Object.fromEntries(Object.entries(byCode).map(([code, ps]) => [comps.find((c) => c.code === code)!.key, ps])) };
    return layoutCheck(placePockets(setup, comps, parts, 1));
  };
  const pocket = (id: string, ps: string[]): SetupPocket => ({ id, share: 1, parts: ps });

  it('finds a family in many units and drawers with no name', () => {
    const found = check({ A1: [pocket('1', ['3001'])], A2: [pocket('2', ['60592'])], B1: [pocket('3', ['3003'])], C1: [pocket('4', ['3004'])] });
    expect(found.find((f) => f.kind === 'spread')?.text).toBe('Bricks are in 3 units: A, B, C');
    expect(found.find((f) => f.kind === 'unnamed')?.text).toBe('4 recorded drawers have no name: A1, A2, B1, C1');
  });

  it('finds a catch-all drawer', () => {
    const found = check({ A1: [pocket('1', ['3001']), pocket('2', ['3020']), pocket('3', ['2780'])] });
    expect(found.find((f) => f.kind === 'catchAll')?.text).toBe('A1 holds 3 part types in 3 pockets, from Bricks & Slopes, Plates & Tiles and Technic');
  });

  it('points out parts that aren’t their unit’s job, and is quiet about a tidy layout', () => {
    const jobs = units.map((u) => (u.code === 'A' ? { ...u, title: 'Bricks', job: { what: 'group:bricks' } } : u));
    const found = check({ A1: [pocket('1', ['3001', '3020'])] }, jobs);
    expect(found.find((f) => f.kind === 'againstJob')?.text).toBe('A is for Bricks & Slopes, but holds Plate 2×4');
    const named = jobs.map((u) => ({ ...u, title: u.title ?? 'Things' }));
    expect(check({ A1: [pocket('1', ['3001'])], A2: [pocket('2', ['3003'])] }, named)).toEqual([]);
  });
});

describe('builder sorts in the plan', () => {
  it('groups the sorts of part a builder would keep together, and names mixed pockets by them', () => {
    const parts = [
      part('44728', 'Bracket 1 x 2 - 2 x 2', 50, PLATES_SPECIAL),
      part('99781', 'Bracket 1 x 2 - 1 x 2 Up', 50, PLATES_SPECIAL),
      part('4085', 'Plate Special 1 x 1 with Clip Vertical [Thick U Clip]', 50, PLATES_SPECIAL),
      part('63868', 'Plate Special 1 x 2 with Clip Horizontal on End', 50, PLATES_SPECIAL),
      part('3795x', 'Plate Special 2 x 2 with Groove', 50, PLATES_SPECIAL),
    ];
    const tree = buildTree(parts, { 9: 'Plates Special' });
    const labels = (n: typeof tree): string[] => [n.label, ...n.children.flatMap(labels)];
    expect(labels(tree)).toEqual(expect.arrayContaining(['Brackets', 'Plates with clips']));

    const unit: StorageUnit = { id: 'u', name: 'Drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 200, d: 200, h: 100, qty: 1 }] };
    const comps = setupComps(expandCompartments([unit], DEFAULT_SETTINGS));
    const groups = new Map<string, { key: string; label: string }>([
      ['44728', { key: 'b', label: 'Brackets' }],
      ['4085', { key: 'c', label: 'Plates with clips' }],
    ]);
    const mixed = placePockets({ ...EMPTY_SETUP, drawers: { [comps[0].key]: [{ id: 'p', share: 1, parts: ['44728', '4085'] }] } }, comps, [...parts, part('3001', 'Brick 2 x 4', 1, BRICKS)], 1, groups);
    expect(contentsName(mixed[0])).toBe('Modified Plates & Tiles');
    const across = placePockets({ ...EMPTY_SETUP, drawers: { [comps[0].key]: [{ id: 'p', share: 1, parts: ['44728', '3001'] }] } }, comps, [...parts, part('3001', 'Brick 2 x 4', 100, BRICKS)], 1, groups);
    expect(contentsName(across[0])).toBe('Bricks & brackets');
  });

  it('prefers shallow drawers for flat parts', () => {
    const parts = [part('3020', 'Plate 2 x 4', 400, PLATES, 2), part('3022', 'Plate 2 x 2', 400, PLATES, 1), part('3001', 'Brick 2 x 4', 300, BRICKS, 4), part('3003', 'Brick 2 x 2', 300, BRICKS, 2)];
    const tree = buildTree(parts, { 11: 'Bricks', 14: 'Plates' });
    const shallow: StorageUnit = { id: 'flat', name: 'Shallow drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 300, h: 30, qty: 6 }] };
    const deep: StorageUnit = { id: 'deep', name: 'Deep drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] };
    const p = plan(tree, [deep, shallow], DEFAULT_SETTINGS);
    const where = (family: string) => p.zones.find((z) => z.families.includes(family))?.unitIds;
    expect(where('plates')).toEqual(['flat']);
    expect(where('bricks')).toEqual(['deep']);
  });
});

describe('jobs in the plan', () => {
  it('sends a family to the units given its job', () => {
    const parts = [part('3001', 'Brick 2 x 4', 200, BRICKS, 4), part('60592', 'Window 1 x 2 x 2', 200, WINDOWS, 4)];
    const tree = buildTree(parts, { 11: 'Bricks', 16: 'Windows and Doors' });
    const drawers = (id: string, job?: StorageUnit['job']): StorageUnit => ({ id, name: `Drawers ${id}`, accessibility: 2, ...(job ? { job } : {}), compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] });
    const p = plan(tree, [drawers('x', { what: 'building' }), drawers('y', { what: 'group:bricks' })], DEFAULT_SETTINGS);
    const where = (family: string) => p.zones.find((z) => z.families.includes(family))?.unitIds;
    expect(where('building')).toEqual(['x']);
    expect(where('bricks')).toEqual(['y']);
  });
});

describe('jobs split a kind of unit', () => {
  it('plans identical units with different jobs as separate places', () => {
    const parts = [part('3001', 'Brick 2 x 4', 200, BRICKS, 4), part('60592', 'Window 1 x 2 x 2', 200, WINDOWS, 4)];
    const tree = buildTree(parts, { 11: 'Bricks', 16: 'Windows and Doors' });
    const drawers = (id: string, job: StorageUnit['job']): StorageUnit => ({ id, name: id === 'x' ? 'Sterilite Medium' : 'Sterilite Medium #2', accessibility: 2, job, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] });
    const p = plan(tree, [drawers('x', { what: 'building' }), drawers('y', { what: 'group:bricks' })], DEFAULT_SETTINGS);
    const where = (family: string) => p.zones.find((z) => z.families.includes(family))?.unitIds;
    expect(where('building')).toEqual(['x']);
    expect(where('bricks')).toEqual(['y']);
  });
});

describe('suggested jobs', () => {
  const ordinary = (id: string, code: string): StorageUnit => ({ id, code, name: `Drawers ${code}`, accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 2 }] });
  const shallow = (id: string, code: string): StorageUnit => ({ id, code, name: `Shallow ${code}`, accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 300, h: 30, qty: 2 }] });
  const cups = (id: string, code: string): StorageUnit => ({ id, code, name: `Cups ${code}`, accessibility: 2, compartments: [{ id: 's', label: 'Cup', w: 60, d: 60, h: 50, qty: 4 }] });
  const parts = [part('3001', 'Brick 2 x 4', 100, BRICKS, 4), part('3003', 'Brick 2 x 2', 100, BRICKS, 2), part('3020', 'Plate 2 x 4', 100, PLATES), part('60592', 'Window 1 x 2 x 2', 20, WINDOWS)];
  const setupWith = (units: StorageUnit[], byCode: Record<string, string[]>) => {
    const comps = setupComps(expandCompartments(units, DEFAULT_SETTINGS));
    const setup: Setup = { ...EMPTY_SETUP, drawers: Object.fromEntries(Object.entries(byCode).map(([code, ps]) => [comps.find((c) => c.code === code)!.key, [{ id: code, share: 1, parts: ps }]])) };
    return placePockets(setup, comps, parts, 1);
  };

  it('suggests a job from what a unit holds and what its drawers suit', () => {
    const units = [ordinary('a', 'A'), shallow('b', 'B'), shallow('c', 'C'), cups('d', 'D')];
    const hints = suggestJobs(units, setupWith(units, { A1: ['3001', '60592'], B1: ['3020'], C1: ['3003'] }));
    expect(jobLabel(hints.get('a')!.job)).toBe('Bricks');
    expect(hints.get('a')!.why).toMatch(/of what's in it is Bricks$/);
    expect(jobLabel(hints.get('b')!.job)).toBe('Plates: flat parts');
    // Bricks in shallow drawers: the drawers are for plates and tiles, and the bricks would be better elsewhere
    expect(jobLabel(hints.get('c')!.job)).toBe('Plates & Tiles: flat parts');
    expect(hints.get('c')!.why).toMatch(/none of what's in it is: the Bricks would be easier to find/);
    expect(jobLabel(hints.get('d')!.job)).toBe('Tiny parts');
  });

  it('leaves out units whose job already matches, and steers the suggestions by recorded contents', () => {
    const units = [{ ...ordinary('a', 'A'), job: { what: 'bricks' } }, ordinary('b', 'B')];
    const pockets = setupWith(units, { A1: ['3001'], B1: ['60592'] });
    expect(suggestJobs(units, pockets).has('a')).toBe(false);
    const jobs = recordedJobs(units, pockets);
    expect(jobs.has('a')).toBe(false);
    expect(jobLabel(jobs.get('b'))).toBe('Windows, Doors & Panels');
  });
});

describe('moves towards the jobs', () => {
  const drawers = (id: string, code: string, job?: StorageUnit['job']): StorageUnit => ({ id, code, name: `Drawers ${code}`, accessibility: 2, ...(job ? { job } : {}), compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 2 }] });
  const parts = [part('3001', 'Brick 2 x 4', 100, BRICKS, 20), part('3003', 'Brick 2 x 2', 100, BRICKS, 2), part('3020', 'Plate 2 x 4', 100, PLATES, 10)];
  const units = [drawers('a', 'A', { what: 'group:bricks' }), drawers('b', 'B', { what: 'group:plates' })];
  const comps = setupComps(expandCompartments(units, DEFAULT_SETTINGS));
  const key = (code: string) => comps.find((c) => c.code === code)!.key;

  it('moves a stray part to a pocket of its sort in the unit for it', () => {
    const setup: Setup = { ...EMPTY_SETUP, drawers: { [key('A1')]: [{ id: 'a1', share: 1, parts: ['3001', '3020'] }], [key('B1')]: [{ id: 'b1', share: 1, parts: ['3020'] }] } };
    const jobs = analyseSetup(setup, comps, parts, DEFAULT_SETTINGS, null).allSuggestions.filter((s) => s.kind === 'job');
    expect(jobs.map((s) => s.title)).toContain('Move Plate 2×4 from A1 to B1');
  });

  it('moves a whole pocket, with its name, to an empty drawer in the unit for it', () => {
    const setup: Setup = { ...EMPTY_SETUP, drawers: { [key('A1')]: [{ id: 'a1', share: 1, parts: ['3001', '3003'] }, { id: 'a2', share: 1, parts: ['3020'], label: 'Plates' }] } };
    const an = analyseSetup(setup, comps, parts, DEFAULT_SETTINGS, null);
    const s = an.allSuggestions.find((x) => x.kind === 'job')!;
    expect(s.title).toBe('Move A1.2 (Plates) to B1');
    const after = acceptSuggestion(setup, s, an.pockets, () => 'new');
    expect(after.drawers[key('B1')]).toEqual([{ id: 'new', share: 1, parts: ['3020'], label: 'Plates' }]);
    expect(after.drawers[key('A1')][1]).toEqual({ id: 'a2', share: 1, parts: [] });
    expect(undoLastAccepted(after).drawers[key('B1')]).toBeUndefined();
  });

  it('offers a new use for a drawer mostly of another sort, instead of emptying it', () => {
    const setup: Setup = { ...EMPTY_SETUP, drawers: { [key('A2')]: [{ id: 'p', share: 1, parts: ['3020'] }] } };
    const an = analyseSetup(setup, comps, parts, DEFAULT_SETTINGS, null);
    expect(an.drawerUses.map((d) => [d.code, jobLabel(d.job)])).toEqual([['A2', 'Plates']]);
    expect(an.drawerUses[0].why).toMatch(/^100% of what's in it is Plates, but it's for Bricks & Slopes along with the rest of A/);
    expect(an.allSuggestions.filter((s) => s.kind === 'job')).toEqual([]);
    // Given that use, the drawer is for plates and the rest of A is still for bricks
    const given = setDrawerJob(units, 'a', 'c:1', an.drawerUses[0].job);
    const after = setupComps(expandCompartments(given, DEFAULT_SETTINGS));
    expect(jobLabel(after.find((c) => c.code === 'A2')!.unitJob)).toBe('Plates');
    expect(jobLabel(after.find((c) => c.code === 'A1')!.unitJob)).toBe('Bricks & Slopes');
    expect(analyseSetup(setup, after, parts, DEFAULT_SETTINGS, null).drawerUses).toEqual([]);
  });

  it('takes a drawer’s use with it when drawers swap', () => {
    const given = setDrawerJob(units, 'a', 'c:0', { what: 'plates' });
    const r = swapDrawers({ setup: EMPTY_SETUP, units: given }, key('A1'), key('A2'));
    expect(r.units[0].drawerJobs).toEqual({ 'c:1': { what: 'plates' } });
    expect(undoStep({ setup: r.setup, units: r.units }, { text: '', drawers: r.before, names: r.names, jobs: r.jobs }).units[0].drawerJobs).toEqual({ 'c:0': { what: 'plates' } });
  });
});
