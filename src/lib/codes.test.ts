import { describe, expect, it } from 'vitest';
import { setUnitCode, withUnitCodes } from './codes';
import { expandCompartments } from './planner';
import { setupComps } from './setup';
import { DEFAULT_SETTINGS, type StorageUnit } from './types';

const unit = (id: string, accessibility: 1 | 2 | 3, qty = 2, code?: string): StorageUnit => ({ id, name: id, accessibility, ...(code ? { code } : {}), compartments: [{ id: `${id}c`, label: 'Drawer', w: 200, d: 280, h: 70, qty }] });
const codes = (units: StorageUnit[]) => Object.fromEntries(setupComps(expandCompartments(units, DEFAULT_SETTINGS)).map((c) => [c.key, c.code]));
const letters = (units: StorageUnit[]) => Object.fromEntries(withUnitCodes(units).map((u) => [u.id, u.code]));

describe('unit letters', () => {
  it('gives a project saved without them the letters it always had: by reach, then as listed', () => {
    expect(letters([unit('low', 1), unit('high', 3), unit('mid', 2), unit('high2', 3)])).toEqual({ high: 'A', high2: 'B', mid: 'C', low: 'D' });
  });

  it('keeps every drawer’s code when storage is added, reordered or made easier to reach', () => {
    const before = withUnitCodes([unit('a', 3), unit('b', 2), unit('c', 1)]);
    const was = codes(before);
    const [a, b, c] = before;
    const after = withUnitCodes([unit('new', 3), { ...c, accessibility: 3 }, a, b]);
    expect(codes(after)).toMatchObject(was);
    expect(letters(after).new).toBe('D');
    // Without stored letters, the same change would have refiled every drawer
    expect(codes([unit('new', 3), unit('c', 3), unit('a', 3), unit('b', 2)])).not.toMatchObject(was);
  });

  it('gives a copy of a unit its own letter, and reuses a letter once its unit has gone', () => {
    const [a, b, c] = withUnitCodes([unit('a', 2), unit('b', 2), unit('c', 2)]);
    expect(letters([a, { ...a, id: 'copy' }, b, c])).toEqual({ a: 'A', copy: 'D', b: 'B', c: 'C' });
    expect(letters([a, c, unit('later', 2)])).toEqual({ a: 'A', c: 'C', later: 'B' });
  });

  it('replaces letters that could be misread, and leaves a settled list alone', () => {
    expect(letters([unit('a', 2, 2, 'A1'), unit('b', 2, 2, 'b')])).toEqual({ a: 'A', b: 'B' });
    const settled = withUnitCodes([unit('a', 2), unit('b', 2)]);
    expect(withUnitCodes(settled)).toBe(settled);
  });

  it('swaps two units’ letters rather than letting them share one', () => {
    const units = withUnitCodes([unit('a', 2), unit('b', 2), unit('c', 2)]);
    expect(letters(setUnitCode(units, 'a', 'C'))).toEqual({ a: 'C', b: 'B', c: 'A' });
    expect(letters(setUnitCode(units, 'a', 'Q'))).toEqual({ a: 'Q', b: 'B', c: 'C' });
    expect(letters(setUnitCode(units, 'a', '7'))).toEqual({ a: 'A', b: 'B', c: 'C' });
  });
});
