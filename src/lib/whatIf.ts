// "If I change this, what happens?" Works out the whole plan for a project as it is and for the same project with a
// change made (a different sorting, a part put in a group by hand, new storage, a set added or kept built, anything),
// so the two can be shown side by side before anything is kept. Nothing here changes a project.
import { collectionRows, mergeToParts, subtractParts } from './collection';
import { homesInRecorded, planGaps } from './gaps';
import { recordedJobs } from './jobSuggest';
import { splitKeptOut } from './keepOut';
import { calibrationFrom, withCalibration } from './measure';
import { buildTree, expandCompartments, leaves, sectionLabel } from './planner';
import { analyseSetup, groupsOf, setupComps, setupMeasurements } from './setup';
import type { Catalog, Part, Project } from './types';

export interface PlanSummary {
  partTypes: number;
  pieces: number;
  /** groups at the top of the sorting, and all the groups under them */
  topGroups: number;
  allGroups: number;
  /** part types in a recorded drawer, and the rest */
  inDrawers: number;
  unsorted: number;
  /** of those, ones with room beside their own group in a recorded drawer */
  besideOwn: number;
  /** drawers not recorded yet that the plan would use, and ones it leaves free */
  drawersUsed: number;
  drawersFree: number;
  /** cm³ with no room anywhere, and how many part types that is */
  overflow: number;
  noRoom: number;
  /** where each part type would be: a drawer or pocket code, or '' for no room */
  place: Map<string, string>;
  /** what the plan puts in each drawer not recorded yet, by its code */
  drawers: Map<string, string[]>;
  names: Map<string, string>;
}

/** The same steps the app takes from a project to its plan, without the screens */
export function summarise(project: Project, catalog: Catalog | null): PlanSummary {
  const s = project.settings;
  const owned = mergeToParts(collectionRows(project), catalog, project.volumeOverrides);
  const subtraction = subtractParts(
    owned,
    project.excluded.filter((e) => e.enabled).flatMap((e) => e.rows),
    catalog,
  );
  const base = expandCompartments(project.units, s);
  const spaces = setupComps(base, project.setup.open);
  const calibration = project.setup.useFills ? calibrationFrom(setupMeasurements(project.setup, spaces, subtraction.parts), s.volumeScale) : null;
  const { planned: parts } = splitKeptOut(withCalibration(subtraction.parts, calibration), project.keepOut, project.units);
  const categories = catalog?.categories ?? {};
  const tree = buildTree(parts, categories, s.volumeScale, {}, project.sorting);
  const analysis = analyseSetup(project.setup, spaces, parts, s, tree);
  const groups = groupsOf(tree);
  const homes = homesInRecorded(analysis.unplaced, analysis.pockets, project.setup, (n) => groups.get(n)?.key, s);
  const forGaps = analysis.unplaced.filter((p) => !homes.has(p.partNum));
  const gaps = planGaps(project.units, project.setup, forGaps, categories, s, recordedJobs(project.units, analysis.pockets), project.sorting);

  const place = new Map<string, string>();
  for (const p of analysis.pockets) for (const x of p.parts) if (!place.has(x.part.partNum)) place.set(x.part.partNum, p.comp.code);
  for (const [num, h] of homes) place.set(num, h.code);
  for (const [num, key] of gaps.homeOf) if (!place.has(num)) place.set(num, gaps.suggested.get(key)?.code ?? '?');
  const overflowParts = new Set(gaps.plan.overflow.flatMap((sec) => leaves(sec.node).flatMap((l) => (l.part ? [l.part.partNum] : []))));
  for (const p of forGaps) if (!place.has(p.partNum) || overflowParts.has(p.partNum)) place.set(p.partNum, '');

  const drawers = new Map<string, string[]>();
  for (const c of gaps.suggested.values()) drawers.set(c.code, c.sections.map(sectionLabel));
  const recorded = new Set(Object.entries(project.setup.drawers).filter(([, v]) => v.length).map(([k]) => k));
  const count = (n: { children: unknown[] }): number => (n.children as (typeof tree)[]).reduce((t, c) => t + (c.part ? 0 : 1 + count(c)), 0);
  return {
    partTypes: parts.length,
    pieces: parts.reduce((t, p) => t + p.qty, 0),
    topGroups: tree.children.length,
    allGroups: count(tree),
    inDrawers: parts.length - analysis.unplaced.length,
    unsorted: analysis.unplaced.length,
    besideOwn: homes.size,
    drawersUsed: gaps.suggested.size,
    drawersFree: gaps.comps.filter((c) => !recorded.has(c.key) && !gaps.suggested.has(c.key)).length,
    overflow: gaps.plan.stats.overflowVolume,
    noRoom: [...place.values()].filter((x) => x === '').length,
    place,
    drawers,
    names: new Map(parts.map((p: Part) => [p.partNum, p.name])),
  };
}

export interface Comparison {
  now: PlanSummary;
  after: PlanSummary;
  /** part types that would be somewhere else ('' is no room; null is not in the collection) */
  moved: { partNum: string; name: string; from: string | null; to: string | null }[];
  /** drawers not recorded yet whose suggested contents would change */
  drawers: { code: string; now: string[]; after: string[] }[];
}

export function compare(now: PlanSummary, after: PlanSummary): Comparison {
  const moved: Comparison['moved'] = [];
  for (const num of new Set([...now.place.keys(), ...after.place.keys()])) {
    const from = now.place.has(num) ? now.place.get(num)! : null;
    const to = after.place.has(num) ? after.place.get(num)! : null;
    if (from !== to) moved.push({ partNum: num, name: after.names.get(num) ?? now.names.get(num) ?? num, from, to });
  }
  const drawers: Comparison['drawers'] = [];
  for (const code of new Set([...now.drawers.keys(), ...after.drawers.keys()])) {
    const a = now.drawers.get(code) ?? [];
    const b = after.drawers.get(code) ?? [];
    if (a.join('|') !== b.join('|')) drawers.push({ code, now: a, after: b });
  }
  drawers.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
  return { now, after, moved, drawers };
}
