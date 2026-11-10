// A locked plan. Once drawers are sorted and labelled, the plan shouldn't move just because parts were added,
// storage was edited or the planner itself changed. Locking records where every part lives; from then on the plan
// is read back from that record instead of being worked out afresh. Parts with no home yet (new ones, or ones whose
// compartment has gone) wait in "Doesn't fit yet", each with a suggested home beside the parts most like it, which
// is only ever taken up when the user accepts it.
import { applyMoves, usedBy } from './moves';
import { buildZones, countStats, expandCompartments, leaves, plusLabel, SHARE_OVERHEAD, targetFill, type Plan, type PlannedCompartment, type Section, type TreeNode } from './planner';
import { familyGroup } from './taxonomy';
import type { LockedSection, PartMove, PlanLock, Settings, StorageUnit } from './types';

const partsOf = (node: TreeNode) => leaves(node).flatMap((l) => (l.part ? [l.part.partNum] : []));

/** Record the plan as it's shown now, manual moves included */
export function lockOf(plan: Plan, moves: PartMove[], at: number): PlanLock {
  const comps: PlanLock['comps'] = {};
  for (const c of plan.compartments) {
    if (!c.sections.length && !c.spareFor) continue;
    const sections = c.sections.map((sec): LockedSection => {
      const parts = partsOf(sec.node);
      return {
        parts,
        ...(parts.length > 1 ? { label: sec.node.label } : {}),
        ...(sec.span ? { span: sec.span, share: sec.node.volume ? sec.volume / sec.node.volume : 0 } : {}),
      };
    });
    comps[c.comp.key] = { sections, ...(c.spareFor ? { spareFor: c.spareFor } : {}) };
  }
  return { at, comps, movesBefore: moves };
}

/**
 * The plan read back from a lock, for the collection and storage as they are now. `tree` holds every part to be
 * stored. A part keeps its home whatever its quantity has become; a part that's gone from the collection drops
 * out, and comes back to the same place if it returns; a part with no home is listed as not fitting yet.
 */
export function lockedPlan(lock: PlanLock, tree: TreeNode, units: StorageUnit[], s: Settings): Plan {
  const comps = expandCompartments(units, s);
  const byNum = new Map(leaves(tree).flatMap((l) => (l.part ? [[l.part.partNum, l] as const] : [])));
  const placed = new Set<string>();
  /** parts running through several compartments, and how much of each has been given a place */
  const spanned = new Map<string, { share: number; pieces: number; last: Section }>();

  const compartments: PlannedCompartment[] = comps.map((comp) => {
    const saved = lock.comps[comp.key];
    const sections: Section[] = [];
    saved?.sections.forEach((ls, i) => {
      if (ls.span && ls.share !== undefined && ls.parts.length === 1) {
        const leaf = byNum.get(ls.parts[0]);
        if (!leaf || placed.has(ls.parts[0])) return;
        const sec: Section = { node: leaf, volume: leaf.volume * ls.share, pieces: Math.round(leaf.pieces * ls.share), span: ls.span };
        const so = spanned.get(ls.parts[0]) ?? { share: 0, pieces: 0, last: sec };
        spanned.set(ls.parts[0], { share: so.share + ls.share, pieces: so.pieces + sec.pieces, last: sec });
        sections.push(sec);
        return;
      }
      const here = ls.parts.flatMap((n) => (placed.has(n) || spanned.has(n) ? [] : byNum.get(n) ?? []));
      if (!here.length) return;
      for (const l of here) placed.add(l.part!.partNum);
      const node: TreeNode =
        here.length === 1
          ? here[0]
          : {
              id: `lock:${comp.key}:${i}`,
              label: ls.label ?? plusLabel(here[0].label, here.slice(1)),
              familyKey: here[0].familyKey,
              children: here,
              pieces: here.reduce((t, l) => t + l.pieces, 0),
              volume: here.reduce((t, l) => t + l.volume, 0),
              seq: Math.min(...here.map((l) => l.seq)),
              lump: true,
            };
      sections.push({ node, volume: node.volume, pieces: node.pieces });
    });
    const spareFor = saved?.spareFor;
    return {
      comp,
      sections,
      fill: usedBy(sections) / comp.volume,
      status: sections.length ? 'used' : spareFor ? 'spare' : 'empty',
      ...(spareFor && !sections.length ? { spareFor } : {}),
    };
  });

  const overflow: Section[] = [];
  for (const [num, so] of spanned) {
    const leaf = byNum.get(num)!;
    // Rounding can leave a run a piece out; and if one of its compartments has gone, what was in it has no home
    if (so.share > 0.999) so.last.pieces += leaf.pieces - so.pieces;
    else overflow.push({ node: leaf, volume: leaf.volume * (1 - so.share), pieces: Math.max(0, leaf.pieces - so.pieces) });
  }
  for (const [num, leaf] of byNum) if (!placed.has(num) && !spanned.has(num)) overflow.push({ node: leaf, volume: leaf.volume, pieces: leaf.pieces });
  overflow.sort((a, b) => a.node.seq - b.node.seq);

  const zones = buildZones(comps).map((z) => {
    const ids = new Set(z.unitIds);
    const families: string[] = [];
    for (const c of compartments) if (ids.has(c.comp.unitId)) for (const sec of c.sections) if (!families.includes(sec.node.familyKey)) families.push(sec.node.familyKey);
    return { label: z.label, unitIds: z.unitIds, families };
  });
  const stats = {
    pieces: tree.pieces,
    moulds: byNum.size,
    volume: tree.volume,
    physicalCapacity: comps.reduce((t, c) => t + c.volume, 0),
    plannedCapacity: comps.reduce((t, c) => t + c.cap, 0),
    ...countStats(compartments, overflow.reduce((t, x) => t + x.volume, 0), s),
  };
  return { compartments, overflow, stats, settings: s, zones, notes: [] };
}

export interface HomeSuggestion {
  part: string;
  name: string;
  to: PartMove['to'];
  /** the compartment it would go in */
  compKey: string;
  /** the section it would join, if it wouldn't get one of its own */
  joins?: string;
  /** how alike its new neighbours are */
  why: 'same kind' | 'same family' | 'related' | 'empty';
  /** another suggestion that has to be taken up first, because this one joins the part it places */
  needs?: string;
}

/** The most suggestions worked out at once: each is checked against the ones before it */
const MAX_SUGGESTIONS = 300;

/**
 * A home for each part that has none, beside the parts most like it that have the room: the same sub-group first,
 * then its family, then a related family, and failing those an empty compartment near its family. Unrelated parts
 * are never put together. Each suggestion allows for the ones before it, so taking them all up can't overfill anything.
 */
export function suggestHomes(plan: Plan, tree: TreeNode, s: Settings): HomeSuggestion[] {
  const ancestors = new Map<string, string[]>();
  for (const l of leaves(tree)) {
    if (!l.part) continue;
    const ids: string[] = [];
    for (let n = l.parent; n && n !== tree; n = n.parent) ids.push(n.id);
    ancestors.set(l.part.partNum, ids);
  }
  /** 0 for the same immediate group, rising with distance; 100 for a related family; Infinity for unrelated parts */
  const distance = (a: TreeNode, b: TreeNode) => {
    const mine = ancestors.get(a.part!.partNum) ?? [];
    for (const id of ancestors.get(b.part!.partNum) ?? []) {
      const at = mine.indexOf(id);
      if (at >= 0) return at;
    }
    return a.familyKey === b.familyKey ? 50 : familyGroup(a.familyKey) === familyGroup(b.familyKey) ? 100 : Infinity;
  };

  const out: HomeSuggestion[] = [];
  const pending = new Set<string>();
  let current = plan;
  const homeless = plan.overflow.flatMap((sec) => leaves(sec.node).filter((l) => l.part).map((l) => ({ leaf: l, volume: sec.span || leaves(sec.node).length === 1 ? sec.volume : l.volume })));
  const housed = new Set(plan.compartments.flatMap((c) => c.sections.flatMap((sec) => partsOf(sec.node))));
  for (const { leaf, volume } of homeless.slice(0, MAX_SUGGESTIONS)) {
    const num = leaf.part!.partNum;
    // What's left of a run that lost a compartment: moving it would pull the rest of the run out with it
    if (housed.has(num)) continue;
    let best: { c: PlannedCompartment; sec: Section; host: TreeNode; d: number; free: number } | null = null;
    for (const c of current.compartments) {
      if (!c.sections.length) continue;
      const free = c.comp.volume * s.practicalFill - usedBy(c.sections) - volume * SHARE_OVERHEAD;
      if (free < 0) continue;
      const roomForOwn = c.sections.length < c.comp.maxSections;
      for (const sec of c.sections) {
        // A part running through several compartments has those to itself
        if (sec.span && !roomForOwn) continue;
        for (const host of leaves(sec.node)) {
          if (!host.part || host.part.partNum === num) continue;
          const d = distance(leaf, host);
          if (d === Infinity) continue;
          if (!best || d < best.d || (d === best.d && free > best.free)) best = { c, sec, host, d, free };
        }
      }
    }
    let suggestion: HomeSuggestion | null = null;
    if (best) {
      const { c, sec, host, d } = best;
      const tiny = volume < (c.comp.volume * targetFill(s)) / (2 * c.comp.maxSections);
      const ownSection = c.sections.length < c.comp.maxSections && (sec.span || (leaves(sec.node).length === 1 && !tiny));
      suggestion = {
        part: num,
        name: leaf.part!.name,
        to: ownSection ? { comp: c.comp.key } : { part: host.part!.partNum },
        compKey: c.comp.key,
        ...(ownSection ? {} : { joins: sec.node.label, ...(pending.has(host.part!.partNum) ? { needs: host.part!.partNum } : {}) }),
        why: d <= 1 ? 'same kind' : d <= 50 ? 'same family' : 'related',
      };
    } else {
      // Nothing alike has room: an empty compartment, one kept spare for its family if there is one, else the nearest to it
      const near = current.compartments.filter((c) => c.sections.some((x) => x.node.familyKey === leaf.familyKey)).map((c) => c.comp.physOrder);
      const group = current.compartments.filter((c) => c.sections.some((x) => familyGroup(x.node.familyKey) === familyGroup(leaf.familyKey))).map((c) => c.comp.physOrder);
      const anchor = near.length ? near : group;
      const far = (c: PlannedCompartment) => (anchor.length ? Math.min(...anchor.map((o) => Math.abs(o - c.comp.physOrder))) : 0);
      const empty = current.compartments
        .filter((c) => !c.sections.length && volume <= c.comp.volume * targetFill(s))
        .sort((a, b) => Number(b.spareFor === leaf.familyKey) - Number(a.spareFor === leaf.familyKey) || far(a) - far(b) || a.comp.volume - b.comp.volume)[0];
      if (empty) suggestion = { part: num, name: leaf.part!.name, to: { comp: empty.comp.key }, compKey: empty.comp.key, why: 'empty' };
    }
    if (!suggestion) continue;
    out.push(suggestion);
    pending.add(num);
    current = applyMoves(current, [{ part: num, whole: false, to: suggestion.to }]).plan;
  }
  return out;
}

/** The user's moves with some suggestions taken up: each once, after anything it depends on */
export function withHomes(moves: PartMove[], accepted: HomeSuggestion[], all: HomeSuggestion[]): PartMove[] {
  const added: PartMove[] = [];
  for (const m of accepted.flatMap((x) => movesFor(x, all))) if (!added.some((a) => a.part === m.part)) added.push(m);
  return [...moves.filter((m) => !added.some((a) => a.part === m.part)), ...added];
}

/** The moves that take up a suggestion, with any it depends on first */
export function movesFor(suggestion: HomeSuggestion, all: HomeSuggestion[]): PartMove[] {
  const first = suggestion.needs ? all.find((x) => x.part === suggestion.needs) : undefined;
  return [...(first ? movesFor(first, all) : []), { part: suggestion.part, whole: false, to: suggestion.to }];
}
