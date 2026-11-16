import { describe, expect, it } from 'vitest';
import { categoryName, mixedName, otherName, sizeGroupName } from './taxonomy';
import { buildTree, leaves } from './planner';
import type { Part } from './types';

describe('names people would use', () => {
  it('turns catalogue headings into ordinary words', () => {
    expect(categoryName('Bricks Sloped')).toBe('Slopes');
    expect(categoryName('Plates Special')).toBe('Modified plates');
    expect(categoryName('Technic Beams Special')).toBe('Technic beams special');
    expect(categoryName('Windscreens and Fuselage')).toBe('Windscreens and fuselage');
  });

  it('says sizes the way you would', () => {
    expect(sizeGroupName('Plates', '2 × 4+')).toBe('Plates 2×4 and bigger');
    expect(sizeGroupName('Slopes', '1 × 1–2')).toBe('Slopes 1×1 and 1×2');
    expect(sizeGroupName('Slopes', 'Large (3+ wide)')).toBe('Large slopes');
    expect(sizeGroupName('Technic beams', 'Short (≤4L)')).toBe('Short Technic beams');
  });

  it('names leftovers and mixes without stacking words up', () => {
    expect(otherName('Windows and doors')).toBe('Other windows and doors');
    expect(mixedName('Other modified bricks')).toBe('Mixed modified bricks');
    expect(mixedName('Technic pins')).toBe('Mixed Technic pins');
    expect(mixedName('Windows, Doors & Panels')).toBe('Mixed windows, doors & panels');
    expect(otherName('Technic Gears & Mechanical')).toBe('Other Technic gears & mechanical');
  });

  it('reaches the groups the planner makes', () => {
    const part = (partNum: string, name: string, catId: number): Part => ({ partNum, name, catId, qty: 10, colours: 1, unitVolume: 1, known: true });
    const tree = buildTree([part('a', 'Plate 1 x 1', 14), part('b', 'Plate 1 x 2', 14), part('c', 'Plate 2 x 4', 14), part('d', 'Plate 2 x 6', 14)], { 14: 'Plates' });
    const labels = leaves(tree).map((l) => l.parent?.label);
    expect(labels).toEqual(['Plates 1×1 and 1×2', 'Plates 1×1 and 1×2', 'Plates 2×4 and bigger', 'Plates 2×4 and bigger']);
  });
});
