import { describe, expect, it } from 'vitest';
import { cuttingList, dividerLayout, type DividerLayout, type Rect } from './dividers';
import type { Compartment, PlannedCompartment, Section, TreeNode } from './planner';

const FILL = 0.7;

const comp = (w: number, d: number, h: number, maxSections = 6): Compartment => ({
  key: 'k',
  unitId: 'u',
  unitName: 'Unit',
  label: 'Drawer',
  w,
  d,
  h,
  volume: (w * d * h) / 1000,
  cap: 0,
  maxSections,
  classKey: '',
  physOrder: 0,
  accessibility: 2,
});
const sec = (volume: number): Section => ({ node: { id: String(volume), label: `S${volume}`, familyKey: 'bricks', children: [], pieces: 1, volume, seq: 0 } as TreeNode, volume, pieces: 1 });
const planned = (c: Compartment, vols: number[]): PlannedCompartment => ({ comp: c, sections: vols.map(sec), fill: 0, status: 'used' });
const layout = (c: Compartment, vols: number[]) => dividerLayout(planned(c, vols), FILL);

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
const area = (r: Rect) => r.w * r.d;

function expectSound(l: DividerLayout, c: Compartment) {
  const rects: Rect[] = [...l.pockets, ...(l.free ? [l.free] : [])];
  // Pockets and free bay tile the compartment exactly
  expect(rects.reduce((t, r) => t + area(r), 0)).toBe(c.w * c.d);
  for (const [i, a] of rects.entries()) {
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(c.w);
    expect(a.y + a.d).toBeLessThanOrEqual(c.d);
    for (const b of rects.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
  }
  for (const p of l.pockets) expect(Math.min(p.w, p.d)).toBeGreaterThanOrEqual(40);
  for (const v of l.dividers) {
    expect(v.length).toBe(Math.abs(v.x2 - v.x1) + Math.abs(v.y2 - v.y1));
    expect(v.x1 === v.x2 || v.y1 === v.y2).toBe(true);
  }
}

describe('dividerLayout', () => {
  it('leaves a well-filled single group alone', () => {
    expect(layout(comp(220, 290, 70), [2500])).toBeNull();
  });

  it('never divides a compartment that cannot take dividers', () => {
    expect(layout(comp(220, 290, 70, 1), [200])).toBeNull();
  });

  it('offers a pocket and a free bay for a nearly empty drawer, as an option', () => {
    const c = comp(220, 290, 70);
    const l = layout(c, [245])!;
    expect(l.optional).toBe(true);
    expect(l.free!.d).toBeGreaterThan(200);
    expect(l.dividers).toHaveLength(1);
    expectSound(l, c);
  });

  it('uses n−1 dividers when the sections fill the compartment', () => {
    const c = comp(220, 290, 70);
    const l = layout(c, [1500, 1000, 800, 500])!;
    expect(l.free).toBeNull();
    expect(l.dividers).toHaveLength(3);
    expectSound(l, c);
  });

  it('uses short dividers rather than long thin pockets', () => {
    const c = comp(220, 290, 70);
    const l = layout(c, [2000, 200, 200, 200, 200])!;
    expect(l.dividers.some((v) => v.short)).toBe(true);
    expectSound(l, c);
  });

  it('keeps every pocket wide enough for fingers, however uneven the contents', () => {
    const c = comp(115, 300, 50);
    const l = layout(c, [1000, 1, 1])!;
    expectSound(l, c);
  });

  it('adds a free bay when several small groups share a big drawer', () => {
    const c = comp(310, 310, 60);
    const l = layout(c, [100, 80, 60])!;
    expect(l.free).not.toBeNull();
    expect(l.optional).toBe(false);
    expectSound(l, c);
  });

  it('makes each pocket big enough for the parts in it', () => {
    const c = comp(220, 290, 70);
    const long = sec(50);
    long.node = { ...long.node, children: [], part: { partNum: 'x', name: 'Plate 1 x 16', catId: 14, qty: 1, colours: 1, unitVolume: 1, known: true } };
    const small = () => sec(1500);
    const l = dividerLayout({ comp: c, sections: [small(), small(), long], fill: 0, status: 'used' }, FILL)!;
    const pocket = l.pockets[2];
    expect(Math.max(pocket.w, pocket.d)).toBeGreaterThanOrEqual(128);
    expectSound(l, c);
  });

  it('copes with wide compartments', () => {
    const c = comp(400, 150, 60);
    expectSound(layout(c, [800, 800, 400])!, c);
  });
});

describe('cuttingList', () => {
  it('groups dividers by size and counts each one', () => {
    const c = comp(220, 290, 70);
    const compartments = [planned(c, [2200, 2200]), planned(c, [2200, 2200]), planned(comp(310, 310, 60), [3000, 3000])];
    expect(cuttingList(compartments, FILL)).toEqual([
      { length: 220, height: 70, count: 2 },
      { length: 310, height: 60, count: 1 },
    ]);
  });

  it('leaves optional pockets off the list', () => {
    expect(cuttingList([planned(comp(220, 290, 70), [245])], FILL)).toEqual([]);
  });
});
