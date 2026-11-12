import { describe, expect, it } from 'vitest';
import { calibrationFrom } from './measure';
import { buildTree, expandCompartments } from './planner';
import {
  acceptSuggestion,
  addContainers,
  addToPocket,
  analyseSetup,
  closeUnit,
  containerChoices,
  floorLeft,
  howManyFit,
  loadDraft,
  litresInName,
  openableUnits,
  openUnit,
  placePockets,
  removeFromPocket,
  removePocket,
  resizePockets,
  wholeKey,
  searchParts,
  setupComps,
  setupMeasurements,
  undoLastAccepted,
  unitLetter,
  unplacedNeighbours,
} from './setup';
import { DEFAULT_SETTINGS, EMPTY_SETUP, type Part, type Setup, type SetupPocket, type StorageUnit } from './types';

const BRICKS = 11;
const PLATES = 14;
const part = (partNum: string, name: string, qty: number, catId: number, unitVolume = 1): Part => ({ partNum, name, catId, qty, colours: 1, unitVolume, known: true });
const unit: StorageUnit = { id: 'u', name: 'Drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 100, d: 100, h: 100, qty: 6 }] }; // 1 L each, before wall allowances
const settings = { ...DEFAULT_SETTINGS, practicalFill: 0.9, growth: 0 };
const comps = setupComps(expandCompartments([unit], settings));
const key = (code: string) => comps.find((c) => c.code === code)!.key;
const volume = comps[0].volume;

const parts = [
  part('b1', 'Brick 1 x 2', Math.round(volume * 0.3), BRICKS),
  part('b2', 'Brick 1 x 4', Math.round(volume * 0.2), BRICKS),
  part('b3', 'Brick 2 x 4', Math.round(volume * 0.1), BRICKS),
  part('p1', 'Plate 2 x 12', Math.round(volume * 0.3), PLATES),
  part('p2', 'Plate 2 x 16', Math.round(volume * 0.4), PLATES),
  part('p3', 'Plate 1 x 1', Math.round(volume * 0.05), PLATES),
];
const tree = buildTree(parts, { 11: 'Bricks', 14: 'Plates' });

const pocket = (id: string, ps: string[], fill?: number, share = 1): SetupPocket => ({ id, share, parts: ps, fill });
const setupOf = (drawers: Record<string, SetupPocket[]>): Setup => ({ ...EMPTY_SETUP, drawers: Object.fromEntries(Object.entries(drawers).map(([code, ps]) => [key(code), ps])) });
const analyse = (s: Setup) => analyseSetup(s, comps, parts, settings, tree);

describe('recording a drawer', () => {
  let n = 0;
  const id = () => `n${n++}`;

  it('makes even pockets, keeping what is in them', () => {
    const one = [pocket('a', ['b1'])];
    const three = resizePockets(one, 3, id);
    expect(three.map((p) => p.share)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(three[0].parts).toEqual(['b1']);
    expect(three[2].parts).toEqual([]);
  });

  it('folds the contents of removed pockets into the last one left', () => {
    const three = [pocket('a', ['b1'], 0.5), pocket('b', ['b2'], 0.5), pocket('c', ['b3', 'b2'], 0.5)];
    const two = resizePockets(three, 2, id);
    expect(two).toHaveLength(2);
    expect(two[1].parts).toEqual(['b2', 'b3']);
    expect(two[1].fill).toBeUndefined();
    expect(two[0].fill).toBe(0.5);
  });

  it('adds parts once, and removes them', () => {
    const ps = addToPocket([pocket('a', ['b1'])], 0, ['b1', 'b2']);
    expect(ps[0].parts).toEqual(['b1', 'b2']);
    expect(removeFromPocket(ps, 0, 'b1')[0].parts).toEqual(['b2']);
  });
});

describe('what is where', () => {
  it('sizes pockets by their share, scaled if the shares do not add up', () => {
    const [a, b] = placePockets(setupOf({ A1: [pocket('a', [], undefined, 0.6), pocket('b', [], undefined, 0.6)] }), comps, parts, 1);
    expect(a.capacity).toBeCloseTo(volume / 2);
    expect(b.capacity).toBeCloseTo(volume / 2);
    expect(a.name).toBe('A1 pocket 1');
  });

  it('shares a part in several places by how much room it has in each', () => {
    const placed = placePockets(setupOf({ A1: [pocket('a', ['b1'], 0.3)], A2: [pocket('b', ['b1'], 0.1)] }), comps, parts, 1);
    expect(placed[0].parts[0].share).toBeCloseTo(0.75);
    expect(placed[1].parts[0].share).toBeCloseTo(0.25);
    expect(placed[0].estimate + placed[1].estimate).toBeCloseTo(parts[0].qty);
  });

  it('uses a real fill when there is one, and the estimate otherwise', () => {
    const [a, b] = placePockets(setupOf({ A1: [pocket('a', ['b1'], 0.15)], A2: [pocket('b', ['b2'])] }), comps, parts, 1);
    expect(a.used).toBeCloseTo(0.15 * volume);
    expect(a.estimate).toBeCloseTo(parts[0].qty);
    expect(b.used).toBeCloseTo(parts[1].qty);
  });

  it('ignores drawers and parts that no longer exist', () => {
    const s = setupOf({ A1: [pocket('a', ['b1', 'gone'])] });
    s.drawers['no-such-drawer'] = [pocket('x', ['b2'])];
    const placed = placePockets(s, comps, parts, 1);
    expect(placed).toHaveLength(1);
    expect(placed[0].parts.map((x) => x.part.partNum)).toEqual(['b1']);
  });
});

describe('the review', () => {
  it('tracks what has been recorded, and what has not', () => {
    const a = analyse(setupOf({ A1: [pocket('a', ['b1', 'b2'])] }));
    expect(a.drawersRecorded).toBe(1);
    expect(a.partsPlaced).toBe(2);
    expect(a.unplaced.map((p) => p.partNum)).toEqual(['p2', 'p1', 'b3', 'p3']);
    expect(a.volumePlaced).toBeCloseTo(0.5 / 1.35, 1);
  });

  it('compares real fills with the estimates, by family and by drawer', () => {
    const { check } = analyse(setupOf({ A1: [pocket('a', ['p1', 'p2'], 0.35)], A2: [pocket('b', ['b1'], 0.3)], A3: [pocket('c', ['b2'])] }));
    expect(check.pockets).toBe(2);
    expect(check.total.real).toBeCloseTo(0.65 * volume);
    const plates = check.families.find((f) => f.label === 'Plates')!;
    expect(plates.real / plates.estimate).toBeCloseTo(0.5, 1);
    expect(check.worst[0].label).toBe('A1');
  });

  const kinds = (s: Setup) => analyse(s).findings.map((f) => f.kind);

  it('flags a pocket over the practical limit, going by its real fill', () => {
    expect(kinds(setupOf({ A1: [pocket('a', ['b1'], 0.95)] }))).toContain('overfull');
    expect(kinds(setupOf({ A1: [pocket('a', ['b1'], 0.6)] }))).not.toContain('overfull');
  });

  it('only doubts an estimate that says more than full, rather than calling it overfull', () => {
    const big = analyseSetup(setupOf({ A1: [pocket('a', ['b1', 'b2', 'b3', 'p1', 'p2'])] }), comps, parts, settings, tree);
    expect(big.findings.map((f) => f.kind)).toContain('unsure');
    expect(big.findings.map((f) => f.kind)).not.toContain('overfull');
  });

  it('flags parts and similar groups spread across drawers that are not neighbours', () => {
    const apart = kinds(setupOf({ A1: [pocket('a', ['b1', 'b2'])], A5: [pocket('b', ['b1'])] }));
    expect(apart).toContain('split');
    const neighbours = kinds(setupOf({ A1: [pocket('a', ['b1'])], A2: [pocket('b', ['b1'])] }));
    expect(neighbours).not.toContain('split');
  });

  it('flags mixed pockets, but not a stray piece or two', () => {
    expect(kinds(setupOf({ A1: [pocket('a', ['b1', 'p1'])] }))).toContain('mixed');
    const many = [...parts, part('x', 'Plate Tiny', 1, PLATES, 0.1)];
    expect(analyseSetup(setupOf({ A1: [pocket('a', ['b1', 'x'])] }), comps, many, settings, tree).findings.map((f) => f.kind)).not.toContain('mixed');
  });

  it('flags pockets with half or more free', () => {
    expect(kinds(setupOf({ A1: [pocket('a', ['p1'], 0.3)] }))).toContain('roomy');
  });
});

describe('suggested moves', () => {
  it('combines two pockets of similar parts that fit in one, like two long plates', () => {
    const s = setupOf({ A1: [pocket('a', ['p1'], 0.25)], A2: [pocket('b', ['p2'], 0.35)] });
    const [first] = analyse(s).suggestions;
    expect(first.kind).toBe('combine');
    expect(first.title).toBe('Combine A1 into A2');
    expect(first.moves.map((m) => m.part)).toEqual(['p1']);
    expect(first.why).toContain('all of A1');
    expect(first.estimated).toBe(false);
  });

  it('leaves similar pockets alone if they would not fit together', () => {
    const s = setupOf({ A1: [pocket('a', ['p1'], 0.6)], A2: [pocket('b', ['p2'], 0.6)] });
    expect(analyse(s).suggestions.filter((x) => x.kind === 'combine')).toEqual([]);
  });

  it('brings a part together when one place can take it all', () => {
    const s = setupOf({ A1: [pocket('a', ['b1'], 0.5)], A4: [pocket('b', ['b1'], 0.1)] });
    const [first] = analyse(s).suggestions;
    expect(first.kind).toBe('join');
    expect(first.moves[0]).toMatchObject({ part: 'b1', from: 'b', to: 'a' });
  });

  it('brings it together in the smaller pile if only that one has room', () => {
    const s = setupOf({ A1: [pocket('a', ['b1', 'b2', 'b3'], 0.8)], A4: [pocket('b', ['b1'], 0.2)] });
    const join = analyse(s).suggestions.find((x) => x.kind === 'join')!;
    expect(join.moves[0]).toMatchObject({ part: 'b1', from: 'a', to: 'b' });
  });

  it('moves a part out of another family’s pocket', () => {
    const s = setupOf({ A1: [pocket('a', ['b1', 'p3'], 0.4)], A4: [pocket('b', ['p2'], 0.4)] });
    const stray = analyse(s).suggestions.find((x) => x.kind === 'stray')!;
    expect(stray.moves[0]).toMatchObject({ part: 'p3', from: 'a', to: 'b' });
  });

  it('eases an overfull pocket first of all', () => {
    const s = setupOf({ A1: [pocket('a', ['b1', 'b2', 'b3'], 0.97)], A4: [pocket('b', ['b1'], 0.1)] });
    expect(analyse(s).suggestions[0].kind).toBe('ease');
  });

  it('prefers a same-kind pocket and says when it is working from estimates', () => {
    const s = setupOf({ A1: [pocket('a', ['p3'])], A2: [pocket('b', ['p1'])] });
    expect(analyse(s).suggestions[0].estimated).toBe(true);
  });

  it('does not suggest the same pocket twice, or anything skipped', () => {
    const drawers = { A1: [pocket('a', ['p3'], 0.03)], A2: [pocket('b', ['p1'], 0.2)], A3: [pocket('c', ['p2'], 0.2)] };
    const { suggestions } = analyse(setupOf(drawers));
    const touched = suggestions.flatMap((x) => [x.moves[0].from, x.moves[0].to]);
    expect(new Set(touched).size).toBe(touched.length);
    const again = analyse({ ...setupOf(drawers), skipped: [suggestions[0].id] }).suggestions;
    expect(again.map((x) => x.id)).not.toContain(suggestions[0].id);
  });

  it('accepting moves the part and its real volume, and can be undone', () => {
    const s = setupOf({ A1: [pocket('a', ['p1'], 0.25)], A2: [pocket('b', ['p2'], 0.35)] });
    const a = analyse(s);
    const done = acceptSuggestion(s, a.suggestions[0], a.pockets);
    expect(done.drawers[key('A1')][0].parts).toEqual([]);
    expect(done.drawers[key('A2')][0].parts).toEqual(['p2', 'p1']);
    expect(done.drawers[key('A2')][0].fill).toBeCloseTo(0.6);
    expect(done.accepted[0].text).toBe('Combine A1 into A2');
    const back = undoLastAccepted(done);
    expect(back.drawers).toEqual(s.drawers);
    expect(back.accepted).toEqual([]);
  });

  it('takes a moved part’s room out of a pocket it leaves behind', () => {
    const s = setupOf({ A1: [pocket('a', ['b1', 'p3'], 0.35)], A4: [pocket('b', ['p2'], 0.4)] });
    const a = analyse(s);
    const stray = a.suggestions.find((x) => x.kind === 'stray')!;
    const done = acceptSuggestion(s, stray, a.pockets);
    expect(done.drawers[key('A1')][0].fill).toBeCloseTo(0.3, 1);
    expect(done.drawers[key('A4')][0].fill).toBeCloseTo(0.45, 1);
  });
});

describe('learning from the setup', () => {
  it('turns pockets with a real fill into measurements', () => {
    const s = setupOf({ A1: [pocket('a', ['p1', 'p2'], 0.35)], A2: [pocket('b', ['b1'])] });
    const ms = setupMeasurements(s, comps, parts);
    expect(ms).toHaveLength(1);
    expect(ms[0].where).toContain('A1');
    expect(ms[0].parts.p1).toBeCloseTo(parts[3].qty);
    expect(ms[0].families.plates).toBeCloseTo(parts[3].qty + parts[4].qty);
    expect(calibrationFrom(ms)!.measured).toBeCloseTo(0.5, 1);
  });

  it('skips pockets with no parts or no fill', () => {
    expect(setupMeasurements(setupOf({ A1: [pocket('a', [], 0.5)], A2: [pocket('b', ['b1'])] }), comps, parts)).toEqual([]);
  });
});

describe('finding parts to add', () => {
  it('matches words in any order', () => {
    expect(searchParts(tree, '4 x 2 brick', new Set()).parts.map((p) => p.partNum)).toEqual(['b3']);
  });

  it('puts the part you typed ahead of ones that merely share its numbers', () => {
    const similar = [part('s', 'Plate Special 16 x 16 x 2/3 with Recessed Edges', 500, PLATES), part('e', 'Plate 2 x 16', 1, PLATES), part('n', 'Plate 12 x 16', 500, PLATES)];
    const found = searchParts(buildTree(similar, {}), 'plate 2 x 16', new Set(['e'])).parts.map((p) => p.partNum);
    expect(found[0]).toBe('e');
    expect(found).not.toContain('n');
  });

  it('finds a part by number', () => {
    expect(searchParts(tree, 'p2', new Set()).parts.map((p) => p.partNum)).toContain('p2');
  });

  it('offers whole groups, and counts what is not placed yet', () => {
    const { groups } = searchParts(tree, 'plates', new Set(['p1']));
    expect(groups[0].parts).toHaveLength(3);
    expect(groups[0].unplaced).toBe(2);
  });

  it('lists parts not yet placed first', () => {
    const { parts: found } = searchParts(tree, 'brick', new Set(['b1']));
    expect(found[found.length - 1].partNum).toBe('b1');
  });

  it('suggests the rest of a part’s group', () => {
    const next = unplacedNeighbours(tree, 'p1', new Set(['p1', 'p3']));
    expect(next.map((p) => p.partNum)).toEqual(['p2']);
  });
});

describe('codes', () => {
  it('match the plan’s lettering', () => {
    expect(comps.map((c) => c.code)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    expect(unitLetter(27)).toBe('AB');
  });
});

describe('changing how a unit is laid out', () => {
  let n = 0;
  const id = () => `id${n++}`;
  const tub: StorageUnit = {
    id: 't',
    name: 'Eazystorage 2.5l',
    accessibility: 2,
    compartments: [
      { id: 'l', label: 'Large', w: 125, d: 125, h: 50, qty: 1 },
      { id: 's', label: 'Small', w: 60, d: 60, h: 50, qty: 4 },
    ],
  };
  const box: StorageUnit = { id: 'b', name: 'Boxsweden 4 section, 6L', accessibility: 2, compartments: [{ id: 's', label: 'Section', w: 90, d: 225, h: 80, qty: 4 }] };
  const plain: StorageUnit = { id: 'p', name: 'Plain Box', accessibility: 2, compartments: [{ id: 's', label: 'Section', w: 100, d: 100, h: 50, qty: 2 }] };
  const drawers: StorageUnit = { id: 'd', name: 'Sterilite', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] };
  const base = expandCompartments([drawers, tub, box, plain], settings);
  const sections = (unitId: string) => base.filter((c) => c.unitId === unitId);
  const codes = (open: Setup['open']) => setupComps(base, open).map((c) => c.code);

  it('offers it for units in sections, not chests of drawers', () => {
    expect([...openableUnits(base).keys()]).toEqual(['t', 'b', 'p']);
  });

  it('makes an opened unit one space, without changing any other codes', () => {
    expect(codes({})).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2']);
    expect(codes({ b: { how: 'dividers' } })).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'B5', 'C', 'D1', 'D2']);
  });

  it('sizes it from the name, then from a correction, then from its sections', () => {
    const whole = (open: Setup['open'], unit: string) => setupComps(base, open).find((c) => c.unitId === unit)!;
    expect(litresInName('Boxsweden 6 section compartment storer, 10L #2')).toBe(10);
    expect(litresInName('Plain Box')).toBeNull();
    expect(whole({ t: { how: 'containers' } }, 't').volume).toBeCloseTo(2500);
    expect(whole({ t: { how: 'containers', litres: 2.2 } }, 't').volume).toBeCloseTo(2200);
    expect(whole({ p: { how: 'dividers' } }, 'p').volume).toBeCloseTo(1000);
    expect(whole({ p: { how: 'dividers' } }, 'p').sections).toBe(2);
  });

  it('keeps neighbouring drawers as neighbours either side of it', () => {
    const list = setupComps(base, { t: { how: 'dividers' } });
    expect(list.map((c) => c.physOrder)).toEqual(list.map((_, i) => i));
  });

  it('carries what was recorded into the whole box, and back again', () => {
    const start: Setup = { ...EMPTY_SETUP, drawers: { [sections('b')[0].key]: [pocket('a', ['p1'], 0.5)], [sections('b')[1].key]: [pocket('b', ['p2', 'p1'])] } };
    const opened = openUnit(start, sections('b'), 'dividers', id);
    expect(opened.drawers[wholeKey('b')][0].parts).toEqual(['p1', 'p2']);
    expect(opened.drawers[wholeKey('b')][0].fill).toBeUndefined();
    const closed = closeUnit(opened, sections('b'));
    expect(closed.open).toEqual({});
    expect(closed.drawers[sections('b')[0].key]).toEqual(start.drawers[sections('b')[0].key]);
  });

  it('puts a box recorded only as a whole into its first section if the sections go back', () => {
    const opened = { ...openUnit(EMPTY_SETUP, sections('b'), 'dividers', id) };
    opened.drawers = { [wholeKey('b')]: [pocket('w', ['p1'])] };
    const closed = closeUnit(opened, sections('b'));
    expect(closed.drawers[sections('b')[0].key][0].parts).toEqual(['p1']);
    expect(closed.drawers[wholeKey('b')]).toBeUndefined();
  });

  it('lists lifted-out containers with how many are left, and any added by hand', () => {
    const large = { name: 'Eazystorage 2.5l, Large', w: 125, d: 125, h: 50 };
    const small = { name: 'Eazystorage 2.5l, Small', w: 60, d: 60, h: 50 };
    const own = { name: 'Bead box', w: 40, d: 40, h: 20 };
    const s: Setup = {
      ...EMPTY_SETUP,
      open: { t: { how: 'containers' }, b: { how: 'dividers' } },
      containers: [own],
      drawers: { x: [{ ...pocket('a', []), container: small }, { ...pocket('b', []), container: small }, { ...pocket('c', []), container: own }] },
    };
    const choices = containerChoices(s, base);
    expect(choices.map((c) => c.container)).toEqual([large, small, own]);
    expect(choices.map((c) => [c.total, c.used])).toEqual([[1, 0], [4, 2], [null, 1]]);
  });

  it('works out how many fit, turning them if that helps', () => {
    expect(howManyFit({ name: 'x', w: 60, d: 60, h: 50 }, { w: 220, d: 290, h: 70 })).toBe(12);
    expect(howManyFit({ name: 'x', w: 125, d: 60, h: 50 }, { w: 130, d: 300, h: 70 })).toBe(5);
    expect(howManyFit({ name: 'x', w: 125, d: 60, h: 50 }, { w: 300, d: 130, h: 70 })).toBe(5);
    expect(howManyFit({ name: 'x', w: 60, d: 60, h: 50 }, { w: 220, d: 300, h: 30 })).toBe(0);
  });

  const small = { name: 'Small', w: 50, d: 50, h: 50 };

  it('counts a container’s own size, and shares what’s left of the floor among ordinary pockets', () => {
    const s = setupOf({ A1: [{ ...pocket('c', ['p3']), container: small }, pocket('rest', ['b1'])] });
    const [c, rest] = placePockets(s, comps, parts, 1);
    expect(c.capacity).toBeCloseTo(125);
    expect(rest.capacity).toBeCloseTo(volume * 0.75);
  });

  it('reports the floor left, or overcrowding', () => {
    const four = addContainers([], small, 4, id);
    expect(floorLeft({ w: 100, d: 100 }, four)).toBeCloseTo(0);
    expect(floorLeft({ w: 100, d: 100 }, addContainers(four, small, 1, id))).toBeLessThan(0);
  });

  it('replaces the blank pocket a drawer starts with, but not one in use', () => {
    expect(addContainers([pocket('a', [])], small, 2, id).map((p) => !!p.container)).toEqual([true, true]);
    expect(addContainers([pocket('a', ['p1'])], small, 1, id).map((p) => !!p.container)).toEqual([false, true]);
  });

  it('leaves containers alone when changing the number of pockets', () => {
    const start = addContainers([pocket('a', ['p1'])], small, 2, id);
    const more = resizePockets(start, 2, id);
    expect(more.filter((p) => p.container)).toHaveLength(2);
    expect(more.filter((p) => !p.container).map((p) => p.share)).toEqual([0.5, 0.5]);
    expect(resizePockets(addContainers([pocket('a', [])], small, 1, id), 1, id)).toHaveLength(2);
  });

  it('can leave only containers, unless a pocket still holds something', () => {
    const empty = [pocket('a', []), { ...pocket('b', []), container: small }];
    expect(resizePockets(empty, 0, id).map((p) => p.id)).toEqual(['b']);
    const inUse = [pocket('a', ['p1']), { ...pocket('b', []), container: small }];
    expect(resizePockets(inUse, 0, id)).toEqual(inUse);
  });

  it('moves a removed pocket’s contents to a neighbour', () => {
    const list = [pocket('a', ['p1'], 0.5), { ...pocket('b', ['p2']), container: small }];
    const after = removePocket(list, 1, id);
    expect(after).toHaveLength(1);
    expect(after[0].parts).toEqual(['p1', 'p2']);
    expect(after[0].fill).toBeUndefined();
    expect(removePocket([{ ...pocket('b', ['p2']), container: small }], 0, id)[0]).toMatchObject({ parts: ['p2'] });
    expect(removePocket([{ ...pocket('b', ['p2']), container: small }], 0, id)[0].container).toBeUndefined();
  });

  it('flags a part too long for its container', () => {
    const s = setupOf({ A1: [{ ...pocket('c', ['p1']), container: small }] });
    expect(analyse(s).findings.map((f) => f.kind)).toContain('tooBig');
    expect(analyse(setupOf({ A1: [pocket('c', ['p3'])] })).findings.map((f) => f.kind)).not.toContain('tooBig');
  });

  it('leaves a pocket that is mixed on purpose out of the tidying', () => {
    const drawers2 = { A1: [{ ...pocket('a', ['b1', 'p3'], 0.4), mixed: true }], A4: [pocket('b', ['p2'], 0.4)], A6: [pocket('c', ['p1'], 0.1)] };
    const a = analyse(setupOf(drawers2));
    expect(a.findings.map((f) => f.kind)).not.toContain('mixed');
    expect(a.suggestions.filter((x) => x.moves.some((m) => m.from === 'a' || m.to === 'a'))).toEqual([]);
  });
});

describe('loading drafts', () => {
  let n = 0;
  const id = () => `draft${n++}`;
  const box: StorageUnit = { id: 'b', name: 'Boxsweden, 10L', accessibility: 2, compartments: [{ id: 's', label: 'Section', w: 90, d: 225, h: 80, qty: 6 }] };
  const base = expandCompartments([unit, box], settings);
  const first = base[0].key;
  const draft = {
    drawers: [
      { code: 'A1', pockets: [{ share: 0.25, fill: 0.4, parts: ['b1'] }, { share: 0.75, parts: ['p1', 'gone'] }] },
      { code: 'B', open: 'dividers' as const, pockets: [{ fill: 0.7, parts: ['b2'] }] },
      { code: 'Q9', pockets: [{ parts: ['b3'] }] },
    ],
  };

  it('fills in drawers with pockets, sizes and fills', () => {
    const { setup, loaded } = loadDraft(EMPTY_SETUP, draft, base, parts, id);
    expect(loaded).toEqual(['A1', 'B']);
    expect(setup.drawers[first].map((p) => [p.share, p.fill, p.parts])).toEqual([[0.25, 0.4, ['b1']], [0.75, undefined, ['p1']]]);
  });

  it('opens up a unit that the draft treats as one space', () => {
    const { setup } = loadDraft(EMPTY_SETUP, draft, base, parts, id);
    expect(setup.open.b.how).toBe('dividers');
    expect(setup.drawers[wholeKey('b')][0]).toMatchObject({ fill: 0.7, parts: ['b2'], share: 1 });
  });

  it('stands containers in a drawer, including empty ones', () => {
    const small = { name: 'Small', w: 60, d: 60, h: 50 };
    const { setup } = loadDraft(EMPTY_SETUP, { drawers: [{ code: 'A2', pockets: [{ container: small, fill: 0.5, parts: ['b1'] }, { container: small, parts: [] }] }] }, base, parts, id);
    expect(setup.drawers[base[1].key].map((p) => [p.container, p.parts])).toEqual([[small, ['b1']], [small, []]]);
    expect(placePockets(setup, setupComps(base), parts, 1)[0].capacity).toBeCloseTo(180);
  });

  it('carries a box’s label', () => {
    const { setup } = loadDraft(EMPTY_SETUP, { drawers: [{ code: 'A2', pockets: [{ label: 'Fences', parts: ['b1'] }] }] }, base, parts, id);
    expect(setup.drawers[base[1].key][0].label).toBe('Fences');
    expect(placePockets(setup, setupComps(base), parts, 1)[0].label).toBe('Fences');
  });

  it('reports what it could not place, without failing', () => {
    const { noDrawer, noPart } = loadDraft(EMPTY_SETUP, draft, base, parts, id);
    expect(noDrawer).toEqual(['Q9']);
    expect(noPart).toEqual(['gone']);
  });

  it('says which recorded drawers it would replace, and leaves others alone', () => {
    const other = base[3].key;
    const start: Setup = { ...EMPTY_SETUP, drawers: { [first]: [pocket('old', ['b3'])], [other]: [pocket('keep', ['p3'])] } };
    const { setup, replaced } = loadDraft(start, draft, base, parts, id);
    expect(replaced).toEqual(['A1']);
    expect(setup.drawers[other][0].id).toBe('keep');
    expect(start.drawers[first][0].id).toBe('old');
  });
});

describe('what hasn’t been sorted', () => {
  it('groups parts with no drawer by family, biggest first', async () => {
    const { unsortedByFamily } = await import('./setup');
    const list = [part('3001', 'Brick 2 x 4', 10, 11, 2), part('3023', 'Plate 1 x 2', 500, 14, 1), part('3003', 'Brick 2 x 2', 40, 11, 1), part('3020', 'Plate 2 x 4', 5, 14, 2)];
    const out = unsortedByFamily(list);
    expect(out.map((f) => [f.label, f.pieces, f.volume])).toEqual([['Plates', 505, 510], ['Bricks', 50, 60]]);
    expect(out[1].parts.map((p) => p.partNum)).toEqual(['3003', '3001']);
    expect(unsortedByFamily([])).toEqual([]);
  });
});
