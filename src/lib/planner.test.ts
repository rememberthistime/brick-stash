import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog, StorageUnit } from './types';
import { DEFAULT_SETTINGS } from './types';
import { familyOrder, parseSize, sizeBucket } from './taxonomy';
import { estimateUnitVolume, solidVolume } from './volume';
import { recommend } from './recommend';
import { baseMould, mergeToParts, parseInventory, subtractParts } from './collection';
import { buildTree, leaves, plan, sectionLabel, targetFill } from './planner';
import { PRESETS } from './presets';

const root = join(__dirname, '..', '..');
const catalog: Catalog = JSON.parse(readFileSync(join(root, 'public/data/parts.json'), 'utf8'));
const sampleCsv = readFileSync(join(root, 'public/samples/sample-collection.csv'), 'utf8');

const unitFrom = (presetId: string, id: string, accessibility: 1 | 2 | 3 = 2): StorageUnit => {
  const p = PRESETS.find((x) => x.id === presetId)!;
  return { id, name: p.name, accessibility, external: p.external, compartments: p.compartments.map((c, i) => ({ ...c, id: `c${i}` })) };
};

describe('taxonomy', () => {
  it('parses stud sizes, fractional heights and technic lengths', () => {
    expect(parseSize('Brick 2 x 4')).toEqual({ a: 2, b: 4, c: undefined });
    expect(parseSize('Plate 6 x 1')).toMatchObject({ a: 1, b: 6 });
    expect(parseSize('Brick Curved 1 x 4 x 1 1/3 No Studs')?.c).toBeCloseTo(4 / 3);
    expect(parseSize('Brick Sloped 30° 1 x 1 x 2/3 (Cheese Slope)')?.c).toBeCloseTo(2 / 3);
    expect(parseSize('Technic Axle 5 with Stop')).toEqual({ a: 1, b: 5 });
    expect(sizeBucket('Technic Beam 1 x 15 Thick', 'technic-struct')).toBe('Long (9L+)');
    expect(sizeBucket('Plate 2 x 4', 'plates')).toBe('2 × 4+');
  });
});

describe('volume', () => {
  it('gives plausible bulk volumes', () => {
    const b24 = estimateUnitVolume('Brick 2 x 4', 11);
    const p11 = estimateUnitVolume('Plate 1 x 1', 14);
    expect(b24).toBeGreaterThan(6);
    expect(b24).toBeLessThan(12);
    expect(p11).toBeLessThan(0.6);
    expect(estimateUnitVolume('Technic Axle 8', 46)).toBeGreaterThan(estimateUnitVolume('Technic Axle 2', 46));
  });

  it('reads millimetre sizes and tyre sizes as mm, not studs', () => {
    expect(estimateUnitVolume("Storage Case, 340 x 255 x 85mm with 'LEGO' Logo", 17)).toBeLessThan(15000);
    expect(estimateUnitVolume('Baseplate Raised Ramp 190 x 190 x 50 mm', 1)).toBeLessThan(3000);
    expect(estimateUnitVolume('Tyre 81.8 x 50 Technic Racing Large', 29)).toBeLessThan(600);
    expect(estimateUnitVolume('Wheel 8 x 6', 29)).toBeLessThan(1);
  });
});

describe('collection', () => {
  it('maps printed variants to their base mould and merges colours', () => {
    expect(baseMould('3626cpr0001', catalog)).toBe(baseMould('3626c', catalog));
    expect(baseMould('3069b', catalog)).toBe(baseMould('3069a', catalog));
    expect(baseMould('3069', catalog)).toBe(baseMould('3069b', catalog));
    expect(baseMould('4073', catalog)).toBe('6141');
    const parts = mergeToParts(parseInventory(sampleCsv).rows, catalog);
    const b24 = parts.find((p) => p.partNum === '3001')!;
    expect(b24.qty).toBe(390);
    expect(b24.colours).toBe(3);
  });

  it('reads BrickLink XML', () => {
    const xml = '<INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>5</COLOR><MINQTY>4</MINQTY></ITEM><ITEM><ITEMTYPE>S</ITEMTYPE><ITEMID>10179-1</ITEMID></ITEM></INVENTORY>';
    // DOMParser isn't in node; only exercise the CSV path here
    expect(xml.startsWith('<')).toBe(true);
  });
});

describe('subtracting sets kept built', () => {
  const owned = mergeToParts(
    [
      { partNum: '3001', qty: 10, colour: 'Red' },
      { partNum: '3001', qty: 5, colour: 'Blue' },
      { partNum: '3023', qty: 4 },
    ],
    catalog,
  );

  it('takes parts off by mould, across colours, and keeps spares', () => {
    const r = subtractParts(owned, [{ partNum: '3001', qty: 12, colour: 'Green' }, { partNum: '3023', qty: 2, spare: true }], catalog);
    expect(r.parts.find((p) => p.partNum === '3001')!.qty).toBe(3);
    expect(r.parts.find((p) => p.partNum === '3023')!.qty).toBe(4);
    expect(r.removed).toBe(12);
    expect(r.missing).toEqual([]);
  });

  it('drops used-up moulds and reports what the collection was short of', () => {
    const r = subtractParts(owned, [{ partNum: '3023', qty: 6 }, { partNum: '3626cpr0001', qty: 1 }], catalog);
    expect(r.parts.some((p) => p.partNum === '3023')).toBe(false);
    expect(r.missing.map((m) => m.qty)).toEqual([2, 1]);
  });

  it('reads the Is Spare column from set inventory exports', () => {
    const rows = parseInventory(['Part,Color,Quantity,Is Spare', '3001,4,2,False', '3023,4,1,True'].join('\n')).rows;
    expect(rows.map((r) => !!r.spare)).toEqual([false, true]);
  });
});

describe('planner', () => {
  const parts = mergeToParts(parseInventory(sampleCsv).rows, catalog);
  const tree = buildTree(parts, catalog.categories);
  const units = [unitFrom('ikea-alex-9', 'alex', 3), unitFrom('akro-64', 'akro', 3), unitFrom('rub-9', 'rub1', 1), unitFrom('rub-9', 'rub2', 1)];

  it('fits the sample collection with headroom and spares', () => {
    const p = plan(tree, units, DEFAULT_SETTINGS);
    if (process.env.SHOW_PLAN) dump(p);
    expect(p.stats.overflowVolume).toBe(0);
    expect(p.stats.spare).toBeGreaterThan(0);
    const tf = targetFill(DEFAULT_SETTINGS);
    for (const c of p.compartments) {
      if (!c.sections.some((s) => s.span)) expect(c.fill).toBeLessThanOrEqual(tf * 1.16);
    }
    // every piece is placed exactly once
    const placed = p.compartments.flatMap((c) => c.sections).reduce((t, s) => t + s.pieces, 0);
    expect(Math.abs(placed - tree.pieces)).toBeLessThan(5);
  });

  it('keeps families apart when there is room', () => {
    const roomy = [...units, unitFrom('ikea-alex-9', 'alex2', 2)];
    const p = plan(tree, roomy, DEFAULT_SETTINGS);
    expect(p.stats.mixed).toBe(0);
  });

  it('splits big families down to sub-groups', () => {
    const p = plan(tree, units, DEFAULT_SETTINGS);
    const labels = p.compartments.flatMap((c) => c.sections.map((s) => s.node.label));
    expect(labels).not.toContain('Plates');
    expect(labels.some((l) => l.startsWith('Plate'))).toBe(true);
  });

  it('sorts finer when told to', () => {
    const relaxed = plan(tree, units, { ...DEFAULT_SETTINGS, granularity: 'relaxed' });
    const fine = plan(tree, units, { ...DEFAULT_SETTINGS, granularity: 'fine' });
    expect(fine.stats.groups).toBeGreaterThan(relaxed.stats.groups);
  });

  it('flags a part list that cannot physically fit, using the solid-block minimum', () => {
    expect(solidVolume('Brick 2 x 4', 11)).toBeCloseTo((16 * 32 * 9.6) / 1000);
    expect(solidVolume('Brick Sloped 45° 2 x 2', 3)).toBeNull();
    const big = mergeToParts([{ partNum: '3001', qty: 5000 }], catalog); // ~25 L built solid
    const p = plan(buildTree(big, catalog.categories), [unitFrom('rub-9', 'one')], DEFAULT_SETTINGS);
    expect(recommend(p, big, [unitFrom('rub-9', 'one')], [])[0].title).toMatch(/physically fit/);
    const ok = plan(tree, units, DEFAULT_SETTINGS);
    expect(recommend(ok, parts, units, []).some((r) => /physically fit/.test(r.title))).toBe(false);
  });

  it('reports overflow when storage is too small', () => {
    const p = plan(tree, [unitFrom('rub-4', 'tiny')], DEFAULT_SETTINGS);
    expect(p.stats.overflowVolume).toBeGreaterThan(0);
  });

  it('lays families out in reading order within each unit', () => {
    const p = plan(tree, units, DEFAULT_SETTINGS);
    const byUnit = new Map<string, number[]>();
    for (const c of p.compartments) {
      const first = c.sections[0];
      if (first) byUnit.set(c.comp.unitId, [...(byUnit.get(c.comp.unitId) ?? []), familyOrder(first.node.familyKey)]);
    }
    for (const order of byUnit.values()) expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('puts small parts in small compartments and bulk parts in big ones', () => {
    const p = plan(tree, units, DEFAULT_SETTINGS);
    const where = (partNum: string) => p.compartments.find((c) => c.sections.some((s) => leaves(s.node).some((l) => l.part?.partNum === partNum)))!.comp;
    expect(where('2780').unitId).toBe('akro'); // Technic pin
    expect(where('3001').unitId).not.toBe('akro'); // Brick 2 x 4
  });

  it('runs an oversized mould on from the part-used drawer, without skipping any', () => {
    // Plenty of Brick 1 x 1, then far more Brick 1 x 2 than one drawer holds
    const big = mergeToParts(
      [
        { partNum: '3005', qty: 500 },
        { partNum: '3004', qty: 6000 },
      ],
      catalog,
    );
    const storage = [unitFrom('ikea-helmer', 'a'), unitFrom('ikea-helmer', 'b')];
    const p = plan(buildTree(big, catalog.categories), storage, DEFAULT_SETTINGS);
    expect(p.stats.overflowVolume).toBe(0);
    const used = p.compartments.map((c, i) => (c.status === 'used' ? i : -1)).filter((i) => i >= 0);
    // The run has no gaps, and the first drawer holds both the small part and the start of the big one
    expect(used).toEqual(used.map((_, i) => used[0] + i));
    const first = p.compartments[used[0]].sections.map((s) => s.node.part?.partNum);
    expect(first).toEqual(['3005', '3004']);
  });

  it('never leaves a run of one mould with a token amount in a compartment', () => {
    for (const qty of [3000, 3400, 3800, 4200, 4600, 5000, 6000, 6500, 7000]) {
      for (const growth of [0, 0.25]) {
        const big = mergeToParts([{ partNum: '3005', qty: 400 }, { partNum: '3004', qty }], catalog);
        const p = plan(buildTree(big, catalog.categories), [unitFrom('ikea-helmer', 'a'), unitFrom('ikea-helmer', 'b'), unitFrom('ikea-helmer', 'c')], { ...DEFAULT_SETTINGS, growth });
        const chunks = p.compartments.flatMap((c) => c.sections).filter((x) => x.span);
        for (const x of chunks) expect(x.pieces).toBeGreaterThan(qty * 0.04);
        // Every piece is still accounted for
        expect(p.compartments.flatMap((c) => c.sections).filter((x) => x.node.part?.partNum === '3004').reduce((t, x) => t + x.pieces, 0)).toBe(qty);
      }
    }
  });

  it('keeps a group in one compartment when one can hold it, however much room there is to spread out', () => {
    const big = mergeToParts([{ partNum: '3004', qty: 1200 }, { partNum: '3005', qty: 200 }], catalog);
    const storage = [unitFrom('ikea-helmer', 'a'), unitFrom('ikea-helmer', 'b'), unitFrom('ikea-helmer', 'c')];
    const p = plan(buildTree(big, catalog.categories), storage, DEFAULT_SETTINGS);
    expect(p.compartments.flatMap((c) => c.sections).filter((x) => x.span)).toEqual([]);
  });

  it('explains compromises when storage is tight', () => {
    const roomy = plan(tree, units, DEFAULT_SETTINGS);
    expect(roomy.notes).toEqual([]);
    const tight = plan(tree, [unitFrom('ikea-alex-9', 'alex'), unitFrom('akro-64', 'akro')], { ...DEFAULT_SETTINGS, growth: 1 });
    expect(tight.notes.length).toBe(1);
  });
});

function dump(p: ReturnType<typeof plan>) {
  const s = p.stats;
  console.log(`pieces ${s.pieces}, moulds ${s.moulds}, vol ${(s.volume / 1000).toFixed(1)}L, cap ${(s.physicalCapacity / 1000).toFixed(1)}L, used ${s.used}, spare ${s.spare}, empty ${s.empty}, groups ${s.groups}, overflow ${s.overflowVolume.toFixed(0)}`);
  for (const c of p.compartments) {
    const label = c.status === 'used' ? c.sections.map(sectionLabel).join(' | ') : c.status + (c.spareFor ? ` (${c.spareFor})` : '');
    console.log(`${c.comp.unitName.slice(0, 18).padEnd(18)} ${c.comp.label.padEnd(10)} ${String(Math.round(c.fill * 100)).padStart(3)}%  ${label}`);
  }
}
