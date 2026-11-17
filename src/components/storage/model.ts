// Everything the storage pages work out from the project, once, for whichever page is showing: the drawers as
// recorded, the review of them, room for unsorted parts beside their own sort, the plan for the rest, and the layout swaps.
import { useMemo } from 'react';
import { baseMould } from '../../lib/collection';
import { homesInRecorded, planGaps, type RecordedHome } from '../../lib/gaps';
import { buildTree, expandCompartments } from '../../lib/planner';
import { rearrangements } from '../../lib/rearrange';
import { analyseSetup, containerChoices, groupsOf, openableUnits, setupComps, type Suggestion } from '../../lib/setup';
import type { Catalog, Part, Project } from '../../lib/types';

const NO_CATEGORIES: Record<string, string> = {};

export function useStorageModel(project: Project, parts: Part[], catalog: Catalog | null) {
  const setup = project.setup;
  const scale = project.settings.volumeScale;
  const categories = catalog?.categories ?? NO_CATEGORIES;
  const tree = useMemo(() => buildTree(parts, categories, scale), [parts, categories, scale]);
  const base = useMemo(() => expandCompartments(project.units, project.settings), [project.units, project.settings]);
  const spaces = useMemo(() => setupComps(base, setup.open), [base, setup.open]);
  const analysis = useMemo(() => analyseSetup(setup, spaces, parts, project.settings, tree), [setup, spaces, parts, project.settings, tree]);
  // Room beside the same sort of parts in recorded drawers comes first; only what's left is planned into empty drawers
  const recordedHomes = useMemo(() => {
    const groups = groupsOf(tree);
    return homesInRecorded(analysis.unplaced, analysis.pockets, setup, (n) => groups.get(n)?.key, project.settings);
  }, [analysis, setup, tree, project.settings]);
  const forGaps = useMemo(() => analysis.unplaced.filter((p) => !recordedHomes.has(p.partNum)), [analysis.unplaced, recordedHomes]);
  const gaps = useMemo(() => planGaps(project.units, setup, forGaps, categories, project.settings), [project.units, setup, forGaps, categories, project.settings]);
  const comps = gaps.comps;
  const openable = useMemo(() => openableUnits(base), [base]);
  const choices = useMemo(() => containerChoices(setup, base), [setup, base]);
  const placed = useMemo(() => new Map(comps.map((c) => [c.key, analysis.pockets.filter((p) => p.comp.key === c.key)])), [comps, analysis.pockets]);
  const layoutMoves = useMemo(() => rearrangements(comps, placed), [comps, placed]);
  const whereIs = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const p of analysis.pockets) for (const x of p.parts) out.set(x.part.partNum, [...(out.get(x.part.partNum) ?? []), p.comp.code]);
    return out;
  }, [analysis.pockets]);
  // What's waiting for each recorded drawer: parts with room beside their own sort, and moves in or out of it
  const homesIn = useMemo(() => {
    const byNum = new Map(analysis.unplaced.map((p) => [p.partNum, p]));
    const out = new Map<string, (RecordedHome & { part: Part })[]>();
    for (const [num, h] of recordedHomes) out.set(h.key, [...(out.get(h.key) ?? []), { ...h, part: byNum.get(num)! }]);
    return out;
  }, [recordedHomes, analysis.unplaced]);
  const movesIn = useMemo(() => {
    const drawerOf = new Map(analysis.pockets.map((p) => [p.id, p.comp.key]));
    const out = new Map<string, Suggestion[]>();
    for (const s of analysis.allSuggestions) {
      const keys = new Set(s.moves.flatMap((m) => [drawerOf.get(m.from), drawerOf.get(m.to)]));
      for (const k of keys) if (k) out.set(k, [...(out.get(k) ?? []), s]);
    }
    return out;
  }, [analysis]);
  // The moves the Suggested moves page lists, by drawer: the best ones, no two touching the same pocket
  const topMovesIn = useMemo(() => {
    const drawerOf = new Map(analysis.pockets.map((p) => [p.id, p.comp.key]));
    const out = new Map<string, number>();
    for (const s of analysis.suggestions) for (const k of new Set(s.moves.flatMap((m) => [drawerOf.get(m.from), drawerOf.get(m.to)]))) if (k) out.set(k, (out.get(k) ?? 0) + 1);
    return out;
  }, [analysis]);
  /** a part number as typed or pasted, as the collection files it */
  const resolvePart = useMemo(() => (n: string) => baseMould(n, catalog), [catalog]);
  return { tree, base, analysis, recordedHomes, gaps, comps, openable, choices, placed, layoutMoves, whereIs, homesIn, movesIn, topMovesIn, resolvePart };
}

export type StorageModel = ReturnType<typeof useStorageModel>;
