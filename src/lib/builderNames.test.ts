import { describe, expect, it } from 'vitest';
import { bothNames, builderKind, plainName, tightSizes } from './builderNames';

describe('plain names', () => {
  it('uses the nickname a builder would', () => {
    expect(plainName('Brick Sloped 30° 1 x 1 x 2/3 (Cheese Slope)', '54200')).toBe('Cheese slope 1×1');
    expect(plainName('Plate Special 1 x 2 with 1 Stud with Groove and Inside Stud Holder (Jumper)', '3794a')).toBe('Jumper 1×2');
    expect(plainName('Brick Special 1 x 2 Palisade [aka Log]', '30136')).toBe('Log brick 1×2');
    expect(plainName('Plate Special 2 x 2 with 1 Stud with Groove (Jumper)', 'x123')).toBe('Jumper 2×2');
  });

  it('turns catalogue headings round and leaves mould details to the official name', () => {
    expect(plainName('Brick Sloped Inverted 45° 2 x 2 [Ovoid Bottom Pin, Bar-sized Stud Holes]', '3660')).toBe('Inverted slope 45° 2×2');
    expect(plainName('Brick Special 1 x 1 with Stud on 1 Side', 'x1')).toBe('Brick 1×1 with stud on 1 side');
    expect(plainName('Plate Special 1 x 2 with Clip Vertical [Thick U Clip]', 'x2')).toBe('Plate 1×2 with clip vertical');
    expect(plainName('Brick Wedged, Sloped Inverted 6 x 6 x 1 Boat Bow', 'x3')).toBe('Wedge brick, sloped inverted 6×6×1 boat bow');
    expect(plainName('Technic Beam 2 x 4 L-Shape Thick', 'x4')).toBe('Technic beam 2×4 L-Shape thick');
  });

  it('keeps plain names as they are', () => {
    expect(plainName('Brick 2 x 4', '3001')).toBe('Brick 2×4');
    expect(bothNames({ partNum: 'x', name: 'Plate 2 x 4' })).toEqual({ plain: 'Plate 2×4' });
    expect(bothNames({ partNum: '54200', name: 'Brick Sloped 30° 1 x 1 x 2/3 (Cheese Slope)' }).official).toBe('Brick Sloped 30° 1 x 1 x 2/3 (Cheese Slope)');
    expect(bothNames({ partNum: 'x', name: 'Equipment Lantern' }).official).toBeUndefined();
    expect(bothNames({ partNum: 'x', name: 'Lantern' })).toEqual({ plain: 'Lantern' });
  });

  it('writes sizes tightly, fractions included', () => {
    expect(tightSizes('Brick 1 x 2 x 1 1/3')).toBe('Brick 1×2×1 1/3');
  });
});

describe('kinds', () => {
  it('splits a catalogue heading the way builders sort', () => {
    expect(builderKind({ partNum: '44728', name: 'Bracket 1 x 2 - 2 x 2' })?.label).toBe('Brackets');
    expect(builderKind({ partNum: '4085', name: 'Plate Special 1 x 1 with Clip Vertical [Thick U Clip]' })?.label).toBe('Plates with clips');
    expect(builderKind({ partNum: '3794a', name: 'Plate Special 1 x 2 with 1 Stud with Groove (Jumper)' })?.label).toBe('Jumpers');
    expect(builderKind({ partNum: '87087', name: 'Brick Special 1 x 1 with Stud on 1 Side' })?.label).toBe('Bricks with studs on the side');
    expect(builderKind({ partNum: '3001', name: 'Brick 2 x 4' })).toBeNull();
  });
});
