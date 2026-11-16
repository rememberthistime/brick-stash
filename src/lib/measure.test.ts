import { describe, expect, it } from 'vitest';
import { calibrationFrom, measuredFactor, withCalibration } from './measure';
import { buildTree } from './planner';
import type { Measurement, Part } from './types';

const part = (partNum: string, name: string, qty: number, catId = 11, unitVolume = 5): Part => ({ partNum, name, catId, qty, colours: 1, unitVolume, known: true });
const parts = [part('a', 'Brick 2 x 2', 300), part('b', 'Brick 2 x 4', 300), part('p', 'Plate 2 x 4', 300, 14)];
const measurement = (over: Partial<Measurement>): Measurement => ({ id: 'm', compKey: 'k', where: 'Drawer', volume: 4000, fill: 0.5, parts: { a: 2000 }, families: { bricks: 2000 }, ...over });

describe('measuring', () => {
  it('works out how far off the estimate was', () => {
    expect(measuredFactor(measurement({ fill: 0.5, volume: 4000, parts: { a: 1000 } }))).toBe(2);
  });

  it('keeps silly entries within reason', () => {
    expect(measuredFactor(measurement({ fill: 1, volume: 100000, parts: { a: 10 } }))).toBe(2);
    expect(measuredFactor(measurement({ fill: 0.01, volume: 100, parts: { a: 10000 } }))).toBe(0.1);
  });
});

describe('calibration', () => {
  it('has nothing to say with no measurements', () => {
    expect(calibrationFrom([])).toBeNull();
  });

  it('weights the overall figure by how much was measured', () => {
    const c = calibrationFrom([
      measurement({ id: '1', volume: 1000, fill: 0.5, parts: { a: 1000 }, families: { bricks: 1000 } }), // ×0.5
      measurement({ id: '2', volume: 3000, fill: 1, parts: { b: 3000 }, families: { plates: 3000 } }), // ×1
    ])!;
    expect(c.measured).toBeCloseTo(0.875);
    expect(c.count).toBe(2);
    expect(c.parts).toEqual({ a: 0.5, b: 1 });
  });

  it('only nudges parts nobody has measured, until there is plenty of evidence', () => {
    const one = measurement({ volume: 2000, fill: 0.4, parts: { a: 2000 }, families: { bricks: 2000 } }); // ×0.4
    const c = calibrationFrom([one])!;
    expect(c.measured).toBeCloseTo(0.4);
    expect(c.parts.a).toBeCloseTo(0.4);
    expect(c.overall).toBeGreaterThan(0.8);
    const lots = calibrationFrom([{ ...one, parts: { a: 200000 }, families: { bricks: 200000 }, volume: 200000 }])!;
    expect(lots.overall).toBeLessThan(0.45);
  });

  it('starts from the volume scale already in use', () => {
    const one = measurement({ volume: 2000, fill: 0.5, parts: { a: 2000 }, families: { bricks: 2000 } });
    expect(calibrationFrom([one], 0.5)!.overall).toBeCloseTo(0.5);
  });

  it('leans on the overall figure until a family has enough evidence', () => {
    const little = calibrationFrom([
      measurement({ id: '1', volume: 100, fill: 0.5, parts: { a: 100 }, families: { bricks: 100 } }),
      measurement({ id: '2', volume: 9000, fill: 1, parts: { b: 9000 }, families: { plates: 9000 } }),
    ])!;
    expect(little.families.bricks).toBeGreaterThan(0.9);
    const lots = calibrationFrom([
      measurement({ id: '1', volume: 9000, fill: 0.5, parts: { a: 9000 }, families: { bricks: 9000 } }),
      measurement({ id: '2', volume: 9000, fill: 1, parts: { b: 9000 }, families: { plates: 9000 } }),
    ])!;
    expect(lots.families.bricks).toBeLessThan(0.6);
  });

  it('uses a part’s own figure first, then its family’s, then overall', () => {
    const c = { overall: 0.8, measured: 0.5, count: 1, families: { bricks: 0.6 }, parts: { a: 0.5 } };
    const [a, b, p] = withCalibration(parts, c);
    expect([a.scaleFactor, b.scaleFactor, p.scaleFactor]).toEqual([0.5, 0.6, 0.8]);
    expect(withCalibration(parts, null)).toBe(parts);
  });


  it('wins over the manual volume scale, and leaves part overrides alone', () => {
    const c = { overall: 0.5, measured: 0.5, count: 1, families: {}, parts: {} };
    const custom = [{ ...part('o', 'Brick 1 x 1', 100), volumeOverride: 2 }];
    expect(buildTree(withCalibration(custom, c), {}, 3).volume).toBeCloseTo(200);
    expect(buildTree(withCalibration(parts, c), {}, 3).volume).toBeCloseTo(2250);
  });

});
