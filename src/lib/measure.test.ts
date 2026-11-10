import { describe, expect, it } from 'vitest';
import { applyMeasured, calibratedVolume, calibrationFrom, isCurrent, measureCompartment, measuredFactor, withCalibration, withMeasurement } from './measure';
import { applyMoves, basisChanges, basisOf } from './moves';
import { buildTree, leaves, plan } from './planner';
import { DEFAULT_SETTINGS, EMPTY_BASIS, type Measurement, type Part, type StorageUnit } from './types';

const part = (partNum: string, name: string, qty: number, catId = 11, unitVolume = 5): Part => ({ partNum, name, catId, qty, colours: 1, unitVolume, known: true });
const unit: StorageUnit = { id: 'u', name: 'Drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 6 }] };
const settings = { ...DEFAULT_SETTINGS, spareFraction: 0, granularity: 'fine' as const };
const parts = [part('a', 'Brick 2 x 2', 300), part('b', 'Brick 2 x 4', 300), part('p', 'Plate 2 x 4', 300, 14)];
const base = plan(buildTree(parts, {}), [unit], settings);
const holding = (p: typeof base, num: string) => p.compartments.find((c) => c.sections.some((s) => leaves(s.node).some((l) => l.part?.partNum === num)))!;

const measurement = (over: Partial<Measurement>): Measurement => ({ id: 'm', compKey: 'k', where: 'Drawer', volume: 4000, fill: 0.5, parts: { a: 2000 }, families: { bricks: 2000 }, ...over });

describe('measuring a compartment', () => {
  it('records what was estimated to be in it, before any scale', () => {
    const c = holding(base, 'a');
    const m = measureCompartment(c, 0.2, 'id')!;
    expect(m.parts.a).toBe(1500);
    expect(m.families.bricks).toBeGreaterThanOrEqual(1500);
    expect(m.where).toBe('Drawers › Drawer 1');
  });

  it('works out how far off the estimate was', () => {
    expect(measuredFactor(measurement({ fill: 0.25 }))).toBeCloseTo(0.5); // 1 L measured against 2 L estimated
  });

  it('keeps silly entries within reason', () => {
    expect(measuredFactor(measurement({ fill: 0.001 }))).toBe(0.1);
    expect(measuredFactor(measurement({ fill: 1, volume: 100000 }))).toBe(2);
  });

  it('replaces a re-measurement of the same contents, but not of different ones', () => {
    const first = measurement({ id: '1' });
    expect(withMeasurement([first], measurement({ id: '2', fill: 0.3 })).map((m) => m.id)).toEqual(['2']);
    expect(withMeasurement([first], measurement({ id: '3', parts: { z: 100 } })).map((m) => m.id)).toEqual(['1', '3']);
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

  it('feeds through to planned volumes, and can be forecast first', () => {
    const c = { overall: 0.5, measured: 0.5, count: 1, families: {}, parts: {} };
    const tree = buildTree(withCalibration(parts, c), {}, 1);
    expect(tree.volume).toBeCloseTo(4500 * 0.5);
    expect(calibratedVolume(parts, c)).toBeCloseTo(4500 * 0.5);
  });

  it('wins over the manual volume scale, and leaves part overrides alone', () => {
    const c = { overall: 0.5, measured: 0.5, count: 1, families: {}, parts: {} };
    const custom = [{ ...part('o', 'Brick 1 x 1', 100), volumeOverride: 2 }];
    expect(buildTree(withCalibration(custom, c), {}, 3).volume).toBeCloseTo(200);
    expect(buildTree(withCalibration(parts, c), {}, 3).volume).toBeCloseTo(2250);
  });

  it('counts as a change waiting on a re-plan', () => {
    const cal = { overall: 0.5, measured: 0.5, count: 1, families: {}, parts: {} };
    const basis = basisOf([], new Set(), cal);
    expect(basisChanges(EMPTY_BASIS, basis)).toBe(1);
    expect(basisChanges(basis, basis)).toBe(0);
    expect(basisChanges(basis, basisOf([], new Set(), { ...cal, overall: 0.6 }))).toBe(1);
    expect(basisChanges({ out: [], together: {}, pins: {} }, EMPTY_BASIS)).toBe(0); // a project saved before calibration existed
  });
});

describe('showing measurements on the plan', () => {
  it('changes only the compartment measured, straight away', () => {
    const c = holding(base, 'a');
    const m = measureCompartment(c, 0.1, 'id')!;
    const p = applyMeasured(base, [m]);
    const after = holding(p, 'a');
    expect(after.fill).toBe(0.1);
    expect(after.measured?.estimated).toBeCloseTo(c.fill);
    p.compartments.forEach((x, i) => {
      if (x.comp.key !== c.comp.key) expect(x).toBe(base.compartments[i]);
    });
    expect(p.stats.headroom).toBeGreaterThan(base.stats.headroom);
    expect(p.stats.volume).toBeCloseTo(base.stats.volume - (c.fill - 0.1) * c.comp.volume);
    expect(base.compartments.find((x) => x.comp.key === c.comp.key)!.fill).toBe(c.fill); // the plan underneath isn't altered
  });

  it('scales sections with it, so divider layouts match what is really there', () => {
    const c = holding(base, 'a');
    const p = applyMeasured(base, [measureCompartment(c, c.fill / 2, 'id')!]);
    expect(holding(p, 'a').sections[0].volume).toBeCloseTo(c.sections[0].volume / 2);
  });

  it('stops applying once the compartment holds something else, but still informs calibration', () => {
    const c = holding(base, 'a');
    const m = measureCompartment(c, 0.1, 'id')!;
    expect(isCurrent(m, base)).toBe(true);
    const { plan: moved } = applyMoves(base, [{ part: 'b', whole: false, to: { part: 'a' } }]);
    expect(isCurrent(m, moved)).toBe(false);
    expect(holding(applyMeasured(moved, [m]), 'a').measured).toBeUndefined();
    expect(calibrationFrom([m])).not.toBeNull();
  });

  it('handles two drawers’ worth fitting in one', () => {
    // Move everything from one compartment into another, then measure the result
    const a = holding(base, 'a');
    const { plan: moved } = applyMoves(base, [{ part: 'b', whole: true, to: { part: 'a' } }]);
    const together = holding(moved, 'a');
    expect(together.fill).toBeGreaterThan(a.fill);
    const m = measureCompartment(together, 0.3, 'id')!;
    expect(Object.keys(m.parts).sort()).toEqual(['a', 'b']);
    const p = applyMeasured(moved, [m]);
    expect(holding(p, 'a').fill).toBe(0.3);
    expect(holding(p, 'b').comp.key).toBe(together.comp.key);
    expect(calibrationFrom([m])!.overall).toBeLessThan(1);
  });
});
