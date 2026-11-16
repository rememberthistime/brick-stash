// Planning around the drawers as they really are. Drawers recorded on My storage stay exactly as recorded; the planner
// only works out where the parts that aren't in any of them could go: first where there's room beside the same sort of
// parts in a recorded drawer (offered, never done), then laid out in the drawers that haven't been recorded. So with
// nothing recorded it's a fresh plan, and as more is recorded it's a smaller and smaller job of filling the gaps.
import { partVolume } from './collection';
import { buildTree, expandCompartments, leaves, plan, SHARE_OVERHEAD, targetFill, type Plan, type PlannedCompartment } from './planner';
import { newPocket, setupComps, type PlacedPocket, type SetupComp } from './setup';
import { familyFor, familyGroup } from './taxonomy';
import type { Part, Settings, Setup, SetupPocket, StorageUnit } from './types';

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
  const used = result.compartments.filter((c) => !recorded.has(c.comp.key) && c.status === 'used');
  // Asked to spread across every free drawer, they're left spread; otherwise as few drawers as will hold them
  for (const c of s.spread ? used : consolidate(used, s)) {
    suggested.set(c.comp.key, { ...c, code: codeOf.get(c.comp.key) ?? '?' });
    for (const sec of c.sections) for (const l of leaves(sec.node)) if (l.part && !homeOf.has(l.part.partNum)) homeOf.set(l.part.partNum, c.comp.key);
  }
  return { comps, plan: result, suggested, homeOf };
}

/**
 * Fewer, fuller drawers: the planner picks a kind of storage for each family on its own, so two related families can
 * each end up alone in a near-empty drawer. The emptiest suggested drawers are tipped into another holding the same
 * group of parts, where everything fits within the planned fill and the dividers allowed, leaving the first empty.
 */
function consolidate(drawers: PlannedCompartment[], s: Settings): PlannedCompartment[] {
  const used = (c: PlannedCompartment) => c.sections.reduce((t, x, i) => t + x.volume * (i ? SHARE_OVERHEAD : 1), 0);
  const groupsOf = (c: PlannedCompartment) => new Set(c.sections.map((x) => familyGroup(x.node.familyKey)));
  // A part run through several drawers stays as it was laid out
  const movable = (c: PlannedCompartment) => !c.sections.some((x) => x.span);
  let list = drawers.map((c) => ({ ...c, sections: [...c.sections] }));
  for (const from of [...list].sort((a, b) => a.fill - b.fill)) {
    if (!list.includes(from) || !movable(from)) continue;
    const mine = groupsOf(from);
    const into = list
      .filter((c) => c !== from && movable(c) && [...mine].every((g) => groupsOf(c).has(g)))
      .filter((c) => c.sections.length + from.sections.length <= c.comp.maxSections && used(c) + used(from) * SHARE_OVERHEAD <= c.comp.volume * targetFill(s))
      .sort((a, b) => b.fill - a.fill)[0];
    if (!into) continue;
    into.sections.push(...from.sections);
    into.fill = used(into) / into.comp.volume;
    list = list.filter((c) => c !== from);
  }
  return list;
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

export interface RecordedHome {
  /** the drawer, and which of its pockets */
  key: string;
  pocket: number;
  /** the pocket's code, as in "A3.2" */
  code: string;
  /** true when the pocket already holds the part's own group, rather than just its family */
  sameGroup: boolean;
}

/**
 * Room for parts with no drawer among the same sort of parts in drawers already recorded. A part goes in with its own
 * group where there's room, or failing that with its family, but not into a pocket labelled for something else. Each
 * pocket is only filled to the practical fill, allowing for what earlier parts took. Nothing is changed: these are
 * offered on Not sorted yet, and the parts without a place here are planned into the drawers with nothing recorded.
 */
export function homesInRecorded(unsorted: Part[], pockets: PlacedPocket[], setup: Setup, groupOf: (partNum: string) => string | undefined, s: Settings): Map<string, RecordedHome> {
  const out = new Map<string, RecordedHome>();
  const room = new Map(pockets.map((p) => [p.id, p.capacity * s.practicalFill - p.used]));
  const groupsIn = new Map(pockets.map((p) => [p.id, new Set(p.parts.map((x) => x.group))]));
  const byVolume = [...unsorted].sort((a, b) => partVolume(b, s.volumeScale) - partVolume(a, s.volumeScale));
  for (const part of byVolume) {
    const fam = familyFor(part.catId).key;
    const group = groupOf(part.partNum);
    const need = partVolume(part, s.volumeScale) * SHARE_OVERHEAD;
    let best: { p: PlacedPocket; sameGroup: boolean; free: number } | null = null;
    for (const p of pockets) {
      if (!p.parts.length || p.family !== fam) continue;
      const sameGroup = !!group && groupsIn.get(p.id)!.has(group);
      // A pocket labelled "Fences" is for fences, not any part of its family
      if (!sameGroup && p.label?.trim()) continue;
      const free = room.get(p.id)! - need;
      if (free < 0) continue;
      if (!best || Number(sameGroup) > Number(best.sameGroup) || (sameGroup === best.sameGroup && free > best.free)) best = { p, sameGroup, free };
    }
    if (!best) continue;
    room.set(best.p.id, best.free);
    const list = setup.drawers[best.p.comp.key] ?? [];
    const pocket = Math.max(0, list.findIndex((x) => x.id === best!.p.id));
    out.set(part.partNum, { key: best.p.comp.key, pocket, code: list.length > 1 ? `${best.p.comp.code}.${pocket + 1}` : best.p.comp.code, sameGroup: best.sameGroup });
  }
  return out;
}
