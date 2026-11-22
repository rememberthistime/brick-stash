import { describe, expect, it } from 'vitest';
import { emptyProject } from '../state';
import { FRESH_OPTIONS, freshProject, usualFresh } from './fresh';
import type { Project } from './types';

const full = (): Project => ({
  ...emptyProject(),
  rows: [{ partNum: '3001', qty: 10 } as Project['rows'][number]],
  extraParts: [{ partNum: 'x1' } as NonNullable<Project['extraParts']>[number]],
  volumeOverrides: { '3001': 2 },
  excluded: [{ id: 's', enabled: true, rows: [] } as unknown as Project['excluded'][number]],
  units: [{ id: 'u' } as Project['units'][number]],
  spaces: [{ id: 'sp' } as Project['spaces'][number]],
  setup: { ...emptyProject().setup, drawers: { 'u:c:0': [{ id: 'p', share: 1, parts: ['3001'] }] }, accepted: [{} as Project['setup']['accepted'][number]], open: { u: {} as Project['setup']['open'][string] } },
  builds: [{ id: 'b', title: 'x', rows: [], picked: [], made: '' }],
  sorting: { levels: ['kind'], parts: { '3001': 'Mine' } },
  settings: { ...emptyProject().settings, growth: 0.9 },
  rebrickableKey: 'kept',
});

describe('start fresh', () => {
  it('clears parts, sets, drawers and pick lists by default, and keeps storage, choices, settings and the key', () => {
    const p = full();
    const f = freshProject(p, usualFresh());
    expect(f).toMatchObject({ rows: [], extraParts: [], volumeOverrides: {}, excluded: [], builds: [] });
    expect(f.setup.drawers).toEqual({});
    expect(f.setup.accepted).toEqual([]);
    expect(f.units).toBe(p.units);
    expect(f.setup.open).toBe(p.setup.open);
    expect(f.sorting).toBe(p.sorting);
    expect(f.settings.growth).toBe(0.9);
    expect(f.rebrickableKey).toBe('kept');
    // Nothing changes in the project it was made from
    expect(p.rows.length).toBe(1);
    expect(Object.keys(p.setup.drawers)).toEqual(['u:c:0']);
  });
  it('clearing storage clears what’s in the drawers too', () => {
    const f = freshProject(full(), new Set(['storage']));
    expect(f.units).toEqual([]);
    expect(f.spaces).toEqual([]);
    expect(f.setup.drawers).toEqual({});
    expect(f.setup.open).toEqual({});
    expect(f.rows.length).toBe(1);
  });
  it('says how much of each there is', () => {
    const p = full();
    const said = Object.fromEntries(FRESH_OPTIONS.map((o) => [o.k, o.count(p)]));
    expect(said.collection).toBe('1 row, 1 part added by hand');
    expect(said.drawers).toBe('1 drawer recorded, 1 move to make');
    expect(freshProject(p, new Set(['choices'])).sorting).toBeUndefined();
  });
});
