// Planning around the drawers as they really are. Drawers recorded on My storage stay exactly as recorded; the planner
// only works out where the parts that aren't in any of them could go, in the drawers that haven't been recorded. So
// with nothing recorded it's a fresh plan, and as more is recorded it's a smaller and smaller job of filling the gaps.
import { buildTree, leaves, plan, targetFill, type Plan, type PlannedCompartment } from './planner';
import { newPocket, setupComps, type SetupComp } from './setup';
import type { Part, Settings, Setup, SetupPocket, StorageUnit } from './types';
import { expandCompartments } from './planner';

export interface GapPlan {
  /** every space, as My storage shows them: opened-up units are one space */
  comps: SetupComp[];
  /** the plan for the parts with no drawer, laid out in the drawers with nothing recorded */
  plan: Plan;
  /** what the plan would put in each drawer with nothing recorded, by compartment key */
  suggested: Map<string, PlannedCompartment & { code: string }>;
  /** part → the drawer the plan suggests for it */
  homeOf: Map<string, string>;
}

/**
 * `unsorted` are the parts in no recorded drawer. A unit that's been opened up into one space is planned as that one
 * space, with as many sections as its floor and the settings allow.
 */
export function planGaps(units: StorageUnit[], setup: Setup, unsorted: Part[], categories: Record<string, string>, s: Settings): GapPlan {
  const comps = setupComps(expandCompartments(units, s), setup.open);
  const forPlanning = comps.map((c) =>
    c.sections ? { ...c, cap: c.volume * targetFill(s), maxSections: Math.max(1, Math.min(s.maxSections, Math.floor(c.w / 45) * Math.floor(c.d / 45))), classKey: `whole:${c.unitId}` } : c,
  );
  const recorded = new Set(comps.filter((c) => setup.drawers[c.key]?.length).map((c) => c.key));
  const result = plan(buildTree(unsorted, categories, 1), units, s, recorded, forPlanning);
  const codeOf = new Map(comps.map((c) => [c.key, c.code]));
  const suggested = new Map<string, PlannedCompartment & { code: string }>();
  const homeOf = new Map<string, string>();
  for (const c of result.compartments) {
    if (recorded.has(c.comp.key) || c.status !== 'used') continue;
    suggested.set(c.comp.key, { ...c, code: codeOf.get(c.comp.key) ?? '?' });
    for (const sec of c.sections) for (const l of leaves(sec.node)) if (l.part && !homeOf.has(l.part.partNum)) homeOf.set(l.part.partNum, c.comp.key);
  }
  return { comps, plan: result, suggested, homeOf };
}

/** A suggested drawer as pockets to record: one per section, sized by how much room each takes */
export function pocketsFromSuggestion(c: PlannedCompartment, newId: () => string): SetupPocket[] {
  const total = c.sections.reduce((t, x) => t + x.volume, 0) || 1;
  return c.sections.map((sec) => ({
    ...newPocket(newId(), Math.round((sec.volume / total) * 100) / 100),
    parts: leaves(sec.node).flatMap((l) => (l.part ? [l.part.partNum] : [])),
    // Only a section of several sorts of part needs a name; one part type is named by its part
    ...(leaves(sec.node).length > 1 ? { label: sec.node.label } : {}),
  }));
}
