// Ticking parts as really in a drawer, and moves leaving them unticked
import { describe, expect, it } from 'vitest';
import { moveParts } from './move';
import { checkEverything, isChecked, removeFromPocket, setChecked } from './setup';
import { EMPTY_SETUP, type Setup, type SetupPocket } from './types';

const pocket = (id: string, parts: string[], checked?: string[]): SetupPocket => ({ id, share: 1, parts, ...(checked ? { checked } : {}) });

describe('parts ticked as there', () => {
  it('ticks and unticks only parts in the pocket', () => {
    const p = setChecked(pocket('a', ['3001', '3003']), ['3001', '9999'], true);
    expect(p.checked).toEqual(['3001']);
    expect(isChecked(p, '3001')).toBe(true);
    expect(isChecked(p, '3003')).toBe(false);
    expect(setChecked(p, ['3001'], false).checked).toBeUndefined();
  });

  it('drops a tick when the part leaves, and a moved part arrives unticked', () => {
    const setup: Setup = { ...EMPTY_SETUP, drawers: { A: [pocket('a', ['3001', '3003'], ['3001', '3003'])], B: [pocket('b', ['3020'], ['3020'])] } };
    const after = moveParts(setup, [{ part: '3001', from: { key: 'A', pocket: 0 } }], { key: 'B', pocket: 0 }, () => 'n').setup;
    expect(after.drawers.A[0].checked).toEqual(['3003']);
    expect(isChecked(after.drawers.B[0], '3001')).toBe(false);
    expect(isChecked(after.drawers.B[0], '3020')).toBe(true);
    expect(removeFromPocket(after.drawers.A, 0, '3003')[0].checked).toBeUndefined();
  });

  it('can tick everything recorded at once', () => {
    const setup: Setup = { ...EMPTY_SETUP, drawers: { A: [pocket('a', ['3001']), pocket('b', [])] } };
    const all = checkEverything(setup);
    expect(all.drawers.A[0].checked).toEqual(['3001']);
    expect(all.drawers.A[1].checked).toBeUndefined();
  });
});
