import { describe, expect, it } from 'vitest';
import { groupUnits, parseStorageList, stem, unitsFromPreset } from './storageList';
import { PRESETS } from './presets';
import { compartmentVolume } from './volume';
import type { StorageUnit } from './types';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
let n = 0;
const id = () => `id${n++}`;

const MY_LIST = `8x https://www.officeworks.com.au/shop/officeworks/p/ezy-storage-sort-it-2-5l-6-compartment-storage-container-sort6comp

2x https://www.officeworks.com.au/shop/officeworks/p/ezy-storage-4-8l-a4-clip-lock-storage-container-clear-ezya4clip

5x https://www.officeworks.com.au/shop/officeworks/p/j-burrows-desktop-file-organiser-5-drawer-black-jb5drwdkbk

7x https://www.hsw.com.au/sterilite-clearview-3-drawer-unit/

2x https://www.hsw.com.au/sterilite-clearview-scrapbook-organiser-with-3-drawers/

2x https://www.spotlightstores.com/en-au/p/boxsweden-6-section-compartment-storer/BP80615345-clear

1x https://www.spotlightstores.com/en-au/p/boxsweden-4-section-compartment-storer/BP80615344-clear`;

describe('parseStorageList', () => {
  it('reads a pasted list of product links with counts', () => {
    const { matched, unmatched } = parseStorageList(MY_LIST);
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => [m.preset.id, m.count])).toEqual([
      ['ezy-sort-it-2-5', 8],
      ['ezy-a4-clip-4-8', 2],
      ['jburrows-5-drawer', 5],
      ['sterilite-3-drawer', 7],
      ['sterilite-scrapbook-3-drawer', 2],
      ['boxsweden-6-section', 2],
      ['boxsweden-4-section', 1],
    ]);
  });

  it('accepts names and other ways of writing a count', () => {
    const { matched } = parseStorageList(['3 × IKEA ALEX drawer unit, 9 drawers', 'IKEA HELMER drawer unit, 6 drawers x2', 'sort6comp, 4', 'ezya4clip'].join('\n'));
    expect(matched.map((m) => m.count)).toEqual([3, 2, 4, 1]);
  });

  it('adds up repeats and reports what it does not know', () => {
    const { matched, unmatched } = parseStorageList(['2x sort6comp', '3x sort6comp', '4x Some shelf from the garage'].join('\n'));
    expect(matched).toHaveLength(1);
    expect(matched[0].count).toBe(5);
    expect(unmatched).toEqual(['4x Some shelf from the garage']);
  });
});

describe('unitsFromPreset', () => {
  it('numbers copies on from those already there, with fresh ids', () => {
    const first = unitsFromPreset(preset('sterilite-3-drawer'), 2, [], id);
    expect(first.map((u) => u.name)).toEqual(['Sterilite Clearview 3 drawer unit', 'Sterilite Clearview 3 drawer unit #2']);
    const more = unitsFromPreset(preset('sterilite-3-drawer'), 1, first, id);
    expect(more[0].name).toBe('Sterilite Clearview 3 drawer unit #3');
    const ids = [...first, ...more].flatMap((u) => [u.id, ...u.compartments.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('groupUnits', () => {
  const list = parseStorageList(MY_LIST).matched;
  const units = list.reduce<StorageUnit[]>((all, m) => [...all, ...unitsFromPreset(m.preset, m.count, all, id)], []);

  it('shows identical units as one row', () => {
    const groups = groupUnits(units);
    expect(groups).toHaveLength(7);
    expect(groups.map((g) => g.units.length)).toEqual([8, 2, 5, 7, 2, 2, 1]);
    expect(groups[0].name).toBe(stem(units[0].name));
  });

  it('keeps units apart once they differ', () => {
    const changed = units.map((u, i) => (i === 0 ? { ...u, accessibility: 3 as const } : u));
    expect(groupUnits(changed)).toHaveLength(8);
  });

  it('adds up to the expected storage', () => {
    const litres = units.flatMap((u) => u.compartments).reduce((t, c) => t + (compartmentVolume(c) * c.qty) / 1000, 0);
    expect(litres).toBeGreaterThan(220);
    expect(litres).toBeLessThan(235);
    expect(units.flatMap((u) => u.compartments).reduce((t, c) => t + c.qty, 0)).toBe(48 + 2 + 25 + 21 + 6 + 12 + 4);
  });
});
