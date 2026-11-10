import { describe, expect, it } from 'vitest';
import { isBulky, noFitTest, pickPart, splitKeptOut, summariseKept, toggleFamily } from './keepOut';
import { DEFAULT_KEEP_OUT, type KeepOut, type Part, type StorageUnit } from './types';
import { estimateUnitVolume, partSizeMm } from './volume';

const part = (partNum: string, name: string, catId: number, qty: number): Part => ({ partNum, name, catId, qty, colours: 1, unitVolume: estimateUnitVolume(name, catId), known: true });

const brick = part('3001', 'Brick 2 x 4', 11, 500);
const head = part('3626c', 'Minifig Head', 59, 40);
const hull = part('92710', 'Boat Hull 8 x 28 x 3', 35, 1);
const bigPlate = part('91405', 'Plate 16 x 16', 14, 28);
const giant = part('57789', 'Boat Hull 74 x 18 x 7', 35, 1);
const all = [brick, head, hull, bigPlate, giant];

const drawer: StorageUnit = { id: 'u', name: 'Drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 3 }] };
const rule = (over: Partial<KeepOut>): KeepOut => ({ ...DEFAULT_KEEP_OUT, ...over });
const names = (ps: Part[]) => ps.map((p) => p.partNum);

describe('keeping parts out of the plan', () => {
  it('plans everything by default', () => {
    const { planned, kept } = splitKeptOut(all, DEFAULT_KEEP_OUT, [drawer]);
    expect(planned).toHaveLength(all.length);
    expect(kept).toEqual([]);
  });

  it('keeps a whole family out', () => {
    const { planned, kept } = splitKeptOut(all, rule({ families: ['minifig'] }), [drawer]);
    expect(names(planned)).not.toContain('3626c');
    expect(kept[0]).toEqual({ part: head, reason: 'family' });
  });

  it('treats big one-offs as bulky, but not big parts you have plenty of', () => {
    const k = rule({ bulky: true });
    expect(isBulky(hull, k)).toBe(true);
    expect(isBulky(bigPlate, k)).toBe(false);
    expect(isBulky(brick, k)).toBe(false);
    const { kept } = splitKeptOut(all, k, [drawer]);
    expect(kept.map((x) => x.part.partNum)).toEqual(['92710', '57789']);
    expect(kept.every((x) => x.reason === 'bulky')).toBe(true);
  });

  it('lets one part be set against the rules, and forgets the choice when it matches them again', () => {
    let k = rule({ bulky: true });
    k = pickPart(k, hull, false, [drawer]);
    expect(k.parts).toEqual({ '92710': 'in' });
    expect(names(splitKeptOut(all, k, [drawer]).planned)).toContain('92710');
    k = pickPart(k, hull, true, [drawer]);
    expect(k.parts).toEqual({});
  });

  it('keeps out anything picked by hand, even with no rules on', () => {
    const k = pickPart(DEFAULT_KEEP_OUT, brick, true, [drawer]);
    const { kept } = splitKeptOut(all, k, [drawer]);
    expect(kept).toEqual([{ part: brick, reason: 'picked' }]);
  });

  it('plans around rules, but leaves parts picked by hand in the plan to come off afterwards', () => {
    const k = pickPart(rule({ families: ['minifig'] }), brick, true, [drawer]);
    const { forPlanning, picked, planned } = splitKeptOut(all, k, [drawer]);
    expect(names(forPlanning)).toContain('3001');
    expect(names(forPlanning)).not.toContain('3626c');
    expect([...picked]).toEqual(['3001']);
    expect(names(planned)).not.toContain('3001');
  });

  it('toggles families on and off', () => {
    const k = toggleFamily(DEFAULT_KEEP_OUT, 'minifig');
    expect(k.families).toEqual(['minifig']);
    expect(toggleFamily(k, 'minifig').families).toEqual([]);
  });

  it('summarises what is kept out', () => {
    const k = pickPart(rule({ families: ['minifig'], bulky: true }), brick, true, [drawer]);
    const { kept } = splitKeptOut(all, k, [drawer]);
    const s = summariseKept(kept, k, 1);
    expect(s.pieces).toBe(500 + 40 + 1 + 1);
    expect(s.labels).toEqual(['Minifigures', '2 bulky parts', '1 part picked by hand']);
  });
});

describe('parts too big for any compartment', () => {
  it('reads real sizes, not stud counts, including millimetre names', () => {
    expect(partSizeMm('Brick 2 x 4', 11)).toEqual([15.8, 31.8, 11.3]);
    expect(partSizeMm('Storage Case, 340 x 255 x 85mm', 17)).toEqual([255, 340, 85]);
    expect(partSizeMm('Tyre 81.8 x 50', 29)).toEqual([81.8, 81.8, 50]);
    expect(partSizeMm('Minifig Head', 59)).toBeNull();
  });

  it('spots them, trying every way round', () => {
    const fits = noFitTest([drawer]);
    expect(fits(giant)).toBe(true); // 592 mm long
    expect(fits(hull)).toBe(false); // 224 mm long fits a 290 mm drawer
    expect(fits(head)).toBe(false); // no size known
    expect(noFitTest([])(giant)).toBe(false);
  });
});
