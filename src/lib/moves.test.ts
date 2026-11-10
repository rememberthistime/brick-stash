import { describe, expect, it } from 'vitest';
import { applyMoves, basisChanges, basisOf, latestMoves, withMove } from './moves';
import { buildTree, leaves, plan } from './planner';
import { DEFAULT_SETTINGS, EMPTY_BASIS, type Part, type PartMove, type StorageUnit } from './types';

const part = (partNum: string, name: string, qty: number, unitVolume = 5): Part => ({ partNum, name, catId: 11, qty, colours: 1, unitVolume, known: true });
const unit: StorageUnit = { id: 'u', name: 'Drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 6 }] };
const settings = { ...DEFAULT_SETTINGS, spareFraction: 0, granularity: 'fine' as const };

const parts = [part('a', 'Brick 2 x 2', 300), part('b', 'Brick 2 x 4', 300), part('c', 'Brick 4 x 6', 1, 60), part('d', 'Brick 1 x 1', 300)];
const base = plan(buildTree(parts, {}), [unit], settings);

const where = (p: typeof base, num: string) => p.compartments.filter((c) => c.sections.some((s) => leaves(s.node).some((l) => l.part?.partNum === num)));
const allPieces = (p: typeof base) => p.compartments.flatMap((c) => c.sections).reduce((t, s) => t + s.pieces, 0) + p.overflow.reduce((t, s) => t + s.pieces, 0);

describe('a part moved more than once', () => {
  it('counts only where it was last put', () => {
    const moves: PartMove[] = [
      { part: 'a', whole: false, to: { part: 'b' } },
      { part: 'b', whole: false, to: { comp: 'k' } },
      { part: 'a', whole: false, to: { comp: 'k' } },
    ];
    expect(latestMoves(moves)).toEqual(moves.slice(1));
    expect(basisOf(moves, new Set())).toEqual({ out: [], together: {}, pins: { a: 'k', b: 'k' }, calibration: null });
  });
});

describe('applyMoves', () => {
  it('returns the plan untouched when there are no moves', () => {
    expect(applyMoves(base, []).plan).toBe(base);
  });

  it('moves a part into another section without adding a divider', () => {
    const before = where(base, 'b')[0].sections.length;
    const { plan: p, stale } = applyMoves(base, [{ part: 'c', whole: false, to: { part: 'b' } }]);
    expect(stale).toEqual([]);
    const home = where(p, 'b')[0];
    expect(where(p, 'c')[0].comp.key).toBe(home.comp.key);
    expect(home.sections.length).toBe(before);
    expect(home.sections.some((s) => /Brick 2 x 4 \+ Brick 4 x 6/.test(s.node.label))).toBe(true);
    expect(allPieces(p)).toBe(allPieces(base));
  });

  it('leaves every other compartment exactly as it was', () => {
    const { plan: p } = applyMoves(base, [{ part: 'c', whole: false, to: { part: 'b' } }]);
    const touched = new Set([where(base, 'c')[0].comp.key, where(base, 'b')[0].comp.key]);
    p.compartments.forEach((c, i) => {
      if (!touched.has(c.comp.key)) {
        expect(c.sections.map((s) => s.node.id)).toEqual(base.compartments[i].sections.map((s) => s.node.id));
        expect(c.fill).toBe(base.compartments[i].fill);
      }
    });
    expect(base.compartments.flatMap((c) => c.sections).some((s) => s.node.label.includes('+'))).toBe(false); // the base plan isn't altered
  });

  it('frees a compartment when its only contents move out', () => {
    const source = where(base, 'c')[0];
    if (source.sections.length > 1) return;
    const { plan: p } = applyMoves(base, [{ part: 'c', whole: false, to: { part: 'b' } }]);
    const after = p.compartments.find((c) => c.comp.key === source.comp.key)!;
    expect(after.status).toBe('empty');
    expect(after.fill).toBe(0);
    expect(p.stats.used).toBeLessThan(base.stats.used);
  });

  it('moves a whole section to a compartment of its choosing', () => {
    const empty = base.compartments.find((c) => c.status === 'empty')!;
    const { plan: p } = applyMoves(base, [{ part: 'd', whole: true, to: { comp: empty.comp.key } }]);
    expect(where(p, 'd')[0].comp.key).toBe(empty.comp.key);
    expect(allPieces(p)).toBe(allPieces(base));
  });

  it('takes a part out of a mixed section, leaving the rest', () => {
    const mixed = [part('m', 'Brick 1 x 3', 2), part('n', 'Brick 1 x 4', 2), part('o', 'Brick 1 x 6', 2), part('z', 'Brick 2 x 8', 400)];
    const p0 = plan(buildTree(mixed, {}), [unit], { ...settings, granularity: 'relaxed' });
    const { plan: p } = applyMoves(p0, [{ part: 'm', whole: false, to: { part: 'z' } }]);
    expect(where(p, 'm')[0].comp.key).toBe(where(p, 'z')[0].comp.key);
    expect(where(p, 'n')).toHaveLength(1);
    expect(allPieces(p)).toBe(allPieces(p0));
  });

  it('can place parts that did not fit', () => {
    const tiny: StorageUnit = { ...unit, compartments: [{ id: 'c', label: 'Drawer', w: 100, d: 100, h: 30, qty: 1 }] };
    const p0 = plan(buildTree(parts, {}), [tiny], settings);
    expect(p0.overflow.length).toBeGreaterThan(0);
    const num = leaves(p0.overflow[0].node)[0].part!.partNum;
    const { plan: p } = applyMoves(p0, [{ part: num, whole: true, to: { comp: p0.compartments[0].comp.key } }]);
    expect(p.overflow.some((s) => leaves(s.node).some((l) => l.part?.partNum === num))).toBe(false);
    expect(p.stats.overflowVolume).toBeLessThan(p0.stats.overflowVolume);
  });

  it('flags moves that no longer apply, and carries on', () => {
    const moves: PartMove[] = [
      { part: 'gone', whole: false, to: { part: 'b' } },
      { part: 'c', whole: false, to: { part: 'gone' } },
      { part: 'a', whole: false, to: { comp: 'no-such-drawer' } },
      { part: 'c', whole: false, to: { part: 'b' } },
    ];
    const { plan: p, stale } = applyMoves(base, moves);
    expect(stale).toEqual([0, 1, 2]);
    expect(where(p, 'c')[0].comp.key).toBe(where(p, 'b')[0].comp.key);
  });

  describe('parts picked out of the plan', () => {
    it('removes them, freeing the compartment and leaving everything else alone', () => {
      const source = where(base, 'c')[0];
      const { plan: p } = applyMoves(base, [], new Set(['c']));
      expect(where(p, 'c')).toEqual([]);
      expect(p.stats.pieces).toBe(base.stats.pieces - 1);
      expect(p.stats.moulds).toBe(base.stats.moulds - 1);
      p.compartments.forEach((c, i) => {
        if (c.comp.key !== source.comp.key) expect(c.sections.map((s) => s.node.id)).toEqual(base.compartments[i].sections.map((s) => s.node.id));
      });
    });

    it('takes one part out of a mixed section', () => {
      const mixed = [part('m', 'Brick 1 x 3', 2), part('n', 'Brick 1 x 4', 2), part('o', 'Brick 1 x 6', 2), part('z', 'Brick 2 x 8', 400)];
      const p0 = plan(buildTree(mixed, {}), [unit], { ...settings, granularity: 'relaxed' });
      const { plan: p } = applyMoves(p0, [], new Set(['m']));
      expect(where(p, 'm')).toEqual([]);
      expect(where(p, 'n')).toHaveLength(1);
      expect(allPieces(p)).toBe(allPieces(p0) - 2);
    });

    it('removes every part of a split-up mould, and overflow too', () => {
      const big = [part('r', 'Brick 2 x 4', 3000), part('s', 'Brick 2 x 6', 3000, 500)];
      const p0 = plan(buildTree(big, {}), [unit], settings);
      expect(p0.compartments.flatMap((c) => c.sections).some((x) => x.span) || p0.overflow.length > 0).toBe(true);
      const { plan: p } = applyMoves(p0, [], new Set(['r', 's']));
      expect(p.compartments.every((c) => c.status === 'empty')).toBe(true);
      expect(p.overflow).toEqual([]);
      expect(p.stats.overflowVolume).toBe(0);
    });

    it('makes a move to or from a removed part stale', () => {
      const { stale } = applyMoves(base, [{ part: 'c', whole: false, to: { part: 'b' } }, { part: 'a', whole: false, to: { part: 'c' } }], new Set(['c']));
      expect(stale).toEqual([0, 1]);
    });

    it('does not alter the original plan', () => {
      const before = JSON.stringify(base.compartments.map((c) => c.sections.map((s) => s.node.id)));
      applyMoves(base, [], new Set(['c', 'a']));
      expect(JSON.stringify(base.compartments.map((c) => c.sections.map((s) => s.node.id)))).toBe(before);
    });
  });

  describe('re-planning around changes', () => {
    const noteIds = (p: typeof base) => p.compartments.map((c) => c.sections.map((s) => s.node.id));

    it('records a whole section as one change per part', () => {
      const mixed = [part('m', 'Brick 1 x 3', 2), part('n', 'Brick 1 x 4', 2), part('o', 'Brick 1 x 6', 2), part('z', 'Brick 2 x 8', 400)];
      const p0 = plan(buildTree(mixed, {}), [unit], { ...settings, granularity: 'relaxed' });
      const lumpMember = leaves(where(p0, 'm')[0].sections.find((s) => leaves(s.node).some((l) => l.part?.partNum === 'm'))!.node).map((l) => l.part!.partNum);
      const { expanded } = applyMoves(p0, [{ part: 'm', whole: true, to: { part: 'z' } }]);
      expect(expanded.map((e) => e.part).sort()).toEqual([...lumpMember].sort());
      expect(expanded.every((e) => !e.whole)).toBe(true);
    });

    it('counts how far the plan is from the changes in force', () => {
      const basis = basisOf([{ part: 'c', whole: false, to: { part: 'b' } }, { part: 'a', whole: false, to: { comp: 'k' } }], new Set(['d']));
      expect(basis).toEqual({ out: ['d'], together: { c: 'b' }, pins: { a: 'k' }, calibration: null });
      expect(basisChanges(EMPTY_BASIS, basis)).toBe(3);
      expect(basisChanges(basis, basis)).toBe(0);
      expect(basisChanges(basis, EMPTY_BASIS)).toBe(3);
    });

    it('lets parts stored together plan as one group', () => {
      const tree = buildTree(parts, {}, 1, { c: 'b' });
      const p = plan(tree, [unit], settings);
      expect(where(p, 'c').map((x) => x.comp.key)).toEqual(where(p, 'b').map((x) => x.comp.key));
      expect(p.compartments.flatMap((c) => c.sections).some((s) => s.node.label === 'Brick 2 x 4 + Brick 4 x 6')).toBe(true);
      expect(tree.pieces).toBe(parts.reduce((t, x) => t + x.qty, 0));
    });

    it('survives a loop of moves', () => {
      const tree = buildTree(parts, {}, 1, { a: 'b', b: 'a' });
      expect(leaves(tree).map((l) => l.part!.partNum).sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('uses the space freed by parts left out', () => {
      const small: StorageUnit = { ...unit, compartments: [{ id: 'c', label: 'Drawer', w: 220, d: 290, h: 70, qty: 2 }] };
      const many = [part('p', 'Brick 2 x 4', 500, 8), part('q', 'Brick 2 x 6', 500, 8), part('r', 'Brick 2 x 8', 500, 8)];
      const before = plan(buildTree(many, {}), [small], settings);
      expect(before.stats.overflowVolume).toBeGreaterThan(0);
      const after = plan(buildTree(many.slice(0, 2), {}), [small], settings);
      expect(after.stats.overflowVolume).toBeLessThan(before.stats.overflowVolume);
    });

    it('leaves a drawer alone once something has been placed in it', () => {
      const key = base.compartments[0].comp.key;
      const placed = leaves(buildTree([part('c', 'Brick 4 x 6', 1, 60)], {})).filter((l) => l.part);
      const p0 = plan(buildTree(parts.filter((x) => x.partNum !== 'c'), {}), [unit], settings, new Set([key]));
      expect(p0.compartments[0].sections).toEqual([]);
      const { plan: p, stale } = applyMoves(p0, [{ part: 'c', whole: false, to: { comp: key } }], new Set(), placed);
      expect(stale).toEqual([]);
      expect(p.compartments[0].sections.map((s) => s.node.part?.partNum)).toEqual(['c']);
      expect(p.overflow).toEqual([]);
      expect(p.stats.pieces).toBe(parts.reduce((t, x) => t + x.qty, 0));
    });

    it('shows a part put back after a re-plan among those that need placing', () => {
      const back = leaves(buildTree([part('c', 'Brick 4 x 6', 1, 60)], {})).filter((l) => l.part);
      const p0 = plan(buildTree(parts.filter((x) => x.partNum !== 'c'), {}), [unit], settings);
      const { plan: p } = applyMoves(p0, [], new Set(), back);
      expect(p.overflow.map((s) => s.node.part?.partNum)).toEqual(['c']);
      expect(noteIds(p)).toEqual(noteIds(p0));
      expect(p.stats.pieces).toBe(p0.stats.pieces + 1);
    });

    it('takes a part kept out by the last re-plan off the count', () => {
      const out = leaves(buildTree([part('c', 'Brick 4 x 6', 1, 60)], {})).filter((l) => l.part);
      const p0 = plan(buildTree(parts.filter((x) => x.partNum !== 'c'), {}), [unit], settings);
      const { plan: p } = applyMoves(p0, [], new Set(['c']), out);
      expect(p.overflow).toEqual([]);
      expect(p.stats.pieces).toBe(p0.stats.pieces);
    });
  });

  it('keeps only the latest move for a part', () => {
    const first: PartMove = { part: 'c', whole: false, to: { part: 'a' } };
    const second: PartMove = { part: 'c', whole: false, to: { part: 'b' } };
    expect(withMove([first], second)).toEqual([second]);
  });
});
