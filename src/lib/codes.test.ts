import { describe, expect, it } from 'vitest';
import { codeWithName, drawerKeyOf, setPlaceName, setUnitCode, withUnitCodes } from './codes';
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

describe('names for units and drawers', () => {
  it('shows a drawer’s own name beside its code, else its unit’s, and works through to the drawer codes', () => {
    let units = withUnitCodes([unit('a', 2, 3), unit('b', 2, 1)]);
    units = setPlaceName(units, 'a', null, '  Technic cabinet ');
    units = setPlaceName(units, 'a', drawerKeyOf('a:ac:1'), 'Gears');
    const named = Object.fromEntries(setupComps(expandCompartments(units, DEFAULT_SETTINGS)).map((c) => [c.code, codeWithName(c.code, c)]));
    expect(named).toMatchObject({ A1: 'A1: Technic cabinet', A2: 'A2: Gears', A3: 'A3: Technic cabinet', B1: 'B1' });
  });

  it('takes a name off when it’s cleared, leaving nothing behind', () => {
    let units = withUnitCodes([unit('a', 2, 3)]);
    units = setPlaceName(setPlaceName(units, 'a', 'ac:0', 'Plates'), 'a', null, 'Cabinet');
    expect(units[0]).toMatchObject({ title: 'Cabinet', drawerNames: { 'ac:0': 'Plates' } });
    units = setPlaceName(setPlaceName(units, 'a', 'ac:0', ' '), 'a', null, '');
    expect(units[0]).not.toHaveProperty('title');
    expect(units[0]).not.toHaveProperty('drawerNames');
  });

  it('names an opened-up box after its unit, not its first drawer', () => {
    const units = setPlaceName(setPlaceName(withUnitCodes([unit('a', 2, 3)]), 'a', 'ac:0', 'First'), 'a', null, 'Tub');
    const [whole] = setupComps(expandCompartments(units, DEFAULT_SETTINGS), { a: { how: 'dividers' } });
    expect(codeWithName(whole.code, whole)).toBe('A: Tub');
  });
});
