import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeToParts, parseInventory } from './collection';
import { lockOf, lockedPlan, movesFor, suggestHomes, withHomes } from './lock';
import { applyMoves } from './moves';
import { buildTree, leaves, plan as runPlan, type Plan } from './planner';
import { PRESETS } from './presets';
import { unitsFromPreset } from './storageList';
import { familyGroup } from './taxonomy';
import { DEFAULT_SETTINGS, type Catalog, type Part, type StorageUnit } from './types';

const catalog = JSON.parse(fs.readFileSync('public/data/parts.json', 'utf8')) as Catalog;
const all = mergeToParts(parseInventory(fs.readFileSync('public/samples/sample-collection.csv', 'utf8')).rows, catalog);
let n = 0;
const id = () => `u${n++}`;
const storage = (...pairs: [number, number][]) => pairs.reduce<StorageUnit[]>((units, [preset, count]) => [...units, ...unitsFromPreset(PRESETS[preset], count, units, id)], []);
const treeOf = (parts: Part[]) => buildTree(parts, catalog.categories, 1);
const s = DEFAULT_SETTINGS;

/** part → the compartments it's in */
const homes = (p: Plan) => {
  const out: Record<string, string[]> = {};
  for (const c of p.compartments) for (const sec of c.sections) for (const l of leaves(sec.node)) (out[l.part!.partNum] ??= []).push(c.comp.key);
  return out;
};
const piecesIn = (p: Plan) => [...p.compartments.flatMap((c) => c.sections), ...p.overflow].reduce((t, sec) => t + sec.pieces, 0);

describe('a locked plan', () => {
  const units = storage([0, 6], [2, 2]);
  const roomy = storage([0, 10], [2, 6], [3, 2]);
  // Leave some parts out, to arrive later
  const later = all.filter((_, i) => i % 9 === 4);
  const first = all.filter((p) => !later.includes(p));
  const fresh = runPlan(treeOf(first), units, s);
  const lock = lockOf(fresh, [], 1);

  it('reads back as the plan it was taken from', () => {
    const back = lockedPlan(lock, treeOf(first), units, s);
    expect(homes(back)).toEqual(homes(fresh));
    expect(back.compartments.map((c) => c.sections.map((x) => [x.node.label, x.pieces, x.span]))).toEqual(fresh.compartments.map((c) => c.sections.map((x) => [x.node.label, x.pieces, x.span])));
    back.compartments.forEach((c, i) => expect(c.fill).toBeCloseTo(fresh.compartments[i].fill, 6));
    expect(back.overflow.map((x) => x.node.label)).toEqual(fresh.overflow.flatMap((x) => leaves(x.node).map((l) => l.label)));
    expect(back.stats.pieces).toBe(fresh.stats.pieces);
  });

  it('survives being saved', () => {
    const back = lockedPlan(JSON.parse(JSON.stringify(lock)), treeOf(first), units, s);
    expect(homes(back)).toEqual(homes(fresh));
  });

  it('keeps every part where it is when parts are added, where a fresh plan would move some', () => {
    const grown = first.map((p, i) => (i % 3 ? p : { ...p, qty: p.qty * 2 }));
    const now = [...grown, ...later];
    const locked = lockedPlan(lock, treeOf(now), units, s);
    expect(homes(locked)).toEqual(homes(fresh));
    const unplaced = fresh.overflow.flatMap((x) => leaves(x.node).map((l) => l.part!.partNum));
    expect(locked.overflow.map((x) => x.node.part!.partNum).sort()).toEqual([...later.map((p) => p.partNum), ...unplaced].sort());
    expect(piecesIn(locked)).toBe(now.reduce((t, p) => t + p.qty, 0));
    expect(homes(runPlan(treeOf(now), units, s))).not.toMatchObject(homes(fresh));
  });

  it('drops a part that’s gone, and gives it its place back if it returns', () => {
    const gone = first[0].partNum;
    const without = lockedPlan(lock, treeOf(first.filter((p) => p.partNum !== gone)), units, s);
    expect(homes(without)[gone]).toBeUndefined();
    expect(homes(lockedPlan(lock, treeOf(first), units, s))[gone]).toEqual(homes(fresh)[gone]);
  });

  it('leaves what was in a unit that’s gone without a home, and everything else alone', () => {
    const fewer = units.slice(1);
    const locked = lockedPlan(lock, treeOf(first), fewer, s);
    const was = homes(fresh);
    const stillThere = Object.fromEntries(Object.entries(was).filter(([, keys]) => keys.every((k) => !k.startsWith(`${units[0].id}:`))));
    expect(homes(locked)).toMatchObject(stillThere);
    expect(locked.overflow.length).toBeGreaterThan(0);
    expect(piecesIn(locked)).toBe(first.reduce((t, p) => t + p.qty, 0));
  });

  it('keeps manual moves as part of what’s locked', () => {
    const [a, b] = fresh.compartments.filter((c) => c.sections.length);
    const part = leaves(a.sections[0].node)[0].part!.partNum;
    const moved = applyMoves(fresh, [{ part, whole: false, to: { comp: b.comp.key } }]).plan;
    const back = lockedPlan(lockOf(moved, [], 1), treeOf(first), units, s);
    expect(homes(back)[part]).toEqual([b.comp.key]);
  });

  it('suggests a home for each new part beside related ones, without overfilling anything', () => {
    const tree = treeOf([...first, ...later]);
    const locked = lockedPlan(lock, tree, units, s);
    const suggestions = suggestHomes(locked, tree, s);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((x) => x.needs)).toBe(true);
    // The route the app takes: on top of a move already made, and with some suggestions depending on others
    const accepted = applyMoves(locked, withHomes([{ part: suggestions[0].part, whole: false, to: { comp: 'gone' } }], suggestions, suggestions));
    expect(accepted.stale).toEqual([]);
    const after = accepted.plan;
    expect(suggestHomes(after, tree, s)).toEqual([]);
    const before = homes(locked);
    expect(homes(after)).toMatchObject(before);
    for (const x of suggestions) expect(homes(after)[x.part]).toEqual([x.compKey]);
    for (const c of after.compartments) {
      expect(c.fill).toBeLessThanOrEqual(Math.max(s.practicalFill, locked.compartments.find((o) => o.comp.key === c.comp.key)!.fill) + 1e-6);
      // Nothing joins a compartment of unrelated parts
      const groups = new Set(c.sections.map((x) => familyGroup(x.node.familyKey)));
      const groupsBefore = new Set(locked.compartments.find((o) => o.comp.key === c.comp.key)!.sections.map((x) => familyGroup(x.node.familyKey)));
      if (groupsBefore.size) expect([...groups].every((g) => groupsBefore.has(g))).toBe(true);
    }
  });

  it('finds every new part a home when there’s room', () => {
    const base = runPlan(treeOf(first), roomy, s);
    expect(base.overflow).toEqual([]);
    const tree = treeOf([...first, ...later]);
    const locked = lockedPlan(lockOf(base, [], 1), tree, roomy, s);
    const suggestions = suggestHomes(locked, tree, s);
    expect(suggestions.map((x) => x.part).sort()).toEqual(later.map((p) => p.partNum).sort());
    expect(applyMoves(locked, suggestions.flatMap((x) => movesFor(x, suggestions))).plan.overflow).toEqual([]);
  });

  it('can take up one suggestion by itself', () => {
    const tree = treeOf([...first, ...later]);
    const locked = lockedPlan(lock, tree, units, s);
    const suggestions = suggestHomes(locked, tree, s);
    for (const x of suggestions) {
      const r = applyMoves(locked, movesFor(x, suggestions));
      expect(r.stale).toEqual([]);
      expect(homes(r.plan)[x.part]).toEqual([x.compKey]);
    }
  });

  it('holds a part that runs through several compartments together', () => {
    const big = [{ ...all[0], qty: 3000 }];
    const drawers = storage([2, 4]);
    const p = runPlan(treeOf(big), drawers, s);
    const spans = p.compartments.filter((c) => c.sections.some((x) => x.span)).length;
    expect(spans).toBeGreaterThan(1);
    const back = lockedPlan(lockOf(p, [], 1), treeOf(big), drawers, s);
    expect(back.compartments.map((c) => c.sections.map((x) => x.pieces))).toEqual(p.compartments.map((c) => c.sections.map((x) => x.pieces)));
    expect(piecesIn(back)).toBe(3000);
    // With one of its drawers gone, the rest of the run stays put and only what was in that drawer is homeless
    const key = p.compartments.find((c) => c.sections.some((x) => x.span))!.comp.key;
    const cut = lockOf(p, [], 1);
    delete cut.comps[key];
    const short = lockedPlan(cut, treeOf(big), drawers, s);
    expect(short.overflow).toHaveLength(1);
    expect(piecesIn(short)).toBe(3000);
    expect(suggestHomes(short, treeOf(big), s)).toEqual([]);
  });
});
