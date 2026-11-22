import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog, Part } from './types';
import { leadOf, traitsOf, usedFor } from './traits';
import { buildTree, leaves, plan } from './planner';
import { summarise, compare } from './whatIf';
import { DEFAULT_SETTINGS, DEFAULT_KEEP_OUT, EMPTY_SETUP, type Project } from './types';

const catalog: Catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public/data/parts.json'), 'utf8'));
const part = (partNum: string, qty = 10): Part => {
  const [name, catId] = catalog.parts[partNum];
  return { partNum, name, catId, qty, colours: 1, unitVolume: 1, known: true };
};
const look = (n: string) => traitsOf(part(n)).look;

describe('what a part looks like', () => {
  it('reads the name lead first', () => {
    expect(leadOf('Brick Sloped Inverted 45° 2 x 2 [Ovoid Bottom Pin]')).toBe('Brick Sloped Inverted');
    expect(leadOf('Plate Special 1 x 2 with Clip')).toBe('Plate Special');
    expect(leadOf('Wedge Plate 2 x 2 Left')).toBe('Wedge Plate');
  });
  it('puts round plates, round tiles, round bricks and cones together, whatever their catalogue heading', () => {
    for (const n of ['6141', '98138', '3062a', '4589']) expect(look(n)).toBe('look-rounds');
    expect(traitsOf(part('6141')).outline).toBe('1×1');
  });
  it('keeps plates and tiles together as flat pieces, studded or smooth', () => {
    expect(traitsOf(part('3023'))).toMatchObject({ look: 'look-flat', outline: '1×2', top: 'studded', height: 'plate' });
    expect(traitsOf(part('3069b'))).toMatchObject({ look: 'look-flat', outline: '1×2', top: 'smooth' });
  });
  it('sees a clip or a side stud before the plate it is on', () => {
    expect(look('4085c')).toBe('look-clips');
    expect(look('87087')).toBe('look-brackets');
    expect(look('99781')).toBe('look-brackets');
  });
  it("isn't fooled by notes in brackets", () => {
    const n = Object.keys(catalog.parts).find((k) => catalog.parts[k][0].startsWith('Brick Sloped Inverted 45° 2 x 2 [Ovoid Bottom Pin'));
    if (n) expect(look(n)).toBe('look-slopes');
  });
  it('guesses what a part is used for', () => {
    expect(usedFor(part('3001'))).toBe('use-general');
    expect(usedFor(part('2780'))).toBe('use-technic');
  });
});

const parts = ['6141', '98138', '3062a', '3023', '3069b', '3001', '3004', '2780', '4085c'].map((n) => part(n, 200));

describe('sorting by lenses', () => {
  it('leaves the catalogue tree as it was when nothing else is chosen', () => {
    const a = buildTree(parts, catalog.categories);
    const b = buildTree(parts, catalog.categories, 1, {}, { levels: ['catalogue'] });
    expect(JSON.stringify(b, (k, v) => (k === 'parent' ? undefined : v))).toBe(JSON.stringify(a, (k, v) => (k === 'parent' ? undefined : v)));
  });
  it('groups by looks first, then by catalogue heading within', () => {
    const t = buildTree(parts, catalog.categories, 1, {}, { levels: ['looks', 'catalogue'] });
    const rounds = t.children.find((c) => c.familyKey === 'look-rounds')!;
    expect(leaves(rounds).map((l) => l.part!.partNum).sort()).toEqual(['3062a', '6141', '98138']);
    // Every group under it plans with it
    expect(leaves(rounds).every((l) => l.familyKey === 'look-rounds')).toBe(true);
  });
  it('puts a part where you say: a group the lenses make, or one of your own', () => {
    const t = buildTree(parts, catalog.categories, 1, {}, { levels: ['looks'], parts: { '4085c': 'Round 1×1', '3001': 'Big bricks' } });
    const round = leaves(t).find((l) => l.part?.partNum === '4085c')!;
    expect(round.familyKey).toBe('look-rounds');
    expect(leaves(t).find((l) => l.part?.partNum === '3001')!.familyKey).toBe('own-big-bricks');
  });
  it('plans a looks tree into drawers', () => {
    const t = buildTree(parts, catalog.categories, 1, {}, { levels: ['looks', 'catalogue'] });
    const units = [{ id: 'u', name: 'Drawers', accessibility: 3 as const, compartments: [{ id: 'c', label: 'Drawer', w: 120, d: 150, h: 50, qty: 12 }] }];
    const p = plan(t, units, DEFAULT_SETTINGS);
    expect(p.stats.overflowVolume).toBe(0);
    expect(p.compartments.some((c) => c.sections.some((s) => s.node.familyKey === 'look-rounds'))).toBe(true);
  });
});

describe('what if', () => {
  const project: Project = {
    version: 1,
    rows: parts.map((p) => ({ partNum: p.partNum, qty: p.qty })),
    units: [{ id: 'u', name: 'Drawers', code: 'A', accessibility: 3, compartments: [{ id: 'c', label: 'Drawer', w: 120, d: 150, h: 50, qty: 12 }] }],
    spaces: [],
    settings: DEFAULT_SETTINGS,
    volumeOverrides: {},
    excluded: [],
    keepOut: DEFAULT_KEEP_OUT,
    setup: EMPTY_SETUP,
  };
  it('shows nothing changing for the same project', () => {
    const c = compare(summarise(project, catalog), summarise(project, catalog));
    expect(c.moved).toEqual([]);
    expect(c.drawers).toEqual([]);
  });
  it('shows what another sorting would do, without changing the project', () => {
    const after = { ...project, sorting: { levels: ['looks' as const] } };
    const c = compare(summarise(project, catalog), summarise(after, catalog));
    expect(c.after.topGroups).not.toBe(c.now.topGroups);
    expect(project.sorting).toBeUndefined();
  });
  it('shows what more storage would do', () => {
    const tight = { ...project, units: [{ ...project.units[0], compartments: [{ ...project.units[0].compartments[0], qty: 1 }] }] };
    const c = compare(summarise(tight, catalog), summarise(project, catalog));
    expect(c.after.noRoom).toBeLessThanOrEqual(c.now.noRoom);
    expect(c.after.drawersFree).toBeGreaterThan(c.now.drawersFree);
  });
});
