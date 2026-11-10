// Manual changes to a plan: parts moved, and parts picked out of it. They're applied on top of the
// finished plan rather than fed into the planner, so changing one brick leaves every other compartment
// exactly where it was.
import type { Calibration, PartMove, PlanBasis } from './types';
import { countStats, leaves, plusLabel, SHARE_OVERHEAD, type Plan, type PlannedCompartment, type Section, type TreeNode } from './planner';

const holds = (s: Section, partNum: string) => leaves(s.node).some((l) => l.part?.partNum === partNum);

const sum = (nodes: TreeNode[], key: 'pieces' | 'volume') => nodes.reduce((t, n) => t + n[key], 0);

/** A section's contents with moved-in parts added, labelled for what it started as */
function joined(node: TreeNode, extra: TreeNode[]): TreeNode {
  const base = node.plus?.base ?? node.label;
  const added = [...(node.plus?.added ?? []), ...extra];
  const members = [...leaves(node), ...extra];
  return {
    ...node,
    id: `${node.id}+moved`,
    label: plusLabel(base, added),
    part: undefined,
    children: members,
    pieces: sum(members, 'pieces'),
    volume: sum(members, 'volume'),
    lump: true,
    plus: { base, added },
  };
}

/** A section's contents with one part taken out */
function without(node: TreeNode, partNum: string): TreeNode {
  const rest = leaves(node).filter((l) => l.part?.partNum !== partNum);
  if (rest.length === 1) return rest[0];
  const added = node.plus?.added.filter((l) => l.part?.partNum !== partNum);
  return {
    ...node,
    children: rest,
    pieces: sum(rest, 'pieces'),
    volume: sum(rest, 'volume'),
    ...(node.plus ? { label: plusLabel(node.plus.base, added!), plus: { base: node.plus.base, added: added! } } : {}),
  };
}

/** How full a compartment is with these sections: dividers cost a little room once there are several */
const usedBy = (sections: Section[]) => sections.reduce((t, s, i) => t + s.volume * (i ? SHARE_OVERHEAD : 1), 0);

export interface MovedPlan {
  plan: Plan;
  /** indexes of moves that no longer apply (the part or compartment has gone) */
  stale: number[];
  /** what was actually done, part by part: a move of a whole section becomes one per part in it */
  expanded: PartMove[];
}

/**
 * `removed` parts come off the plan. `detached` parts were left out of planning by the last re-plan:
 * they start among the parts that don't fit, so a move can place them, and any that are no longer
 * kept out or moved anywhere show up there until the next re-plan.
 */
export function applyMoves(base: Plan, moves: PartMove[], removed: ReadonlySet<string> = new Set(), detached: TreeNode[] = []): MovedPlan {
  if (!moves.length && !removed.size && !detached.length) return { plan: base, stale: [], expanded: [] };
  const compartments: PlannedCompartment[] = base.compartments.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s })) }));
  let overflow: Section[] = [...base.overflow.map((s) => ({ ...s })), ...detached.map((l) => ({ node: l, volume: l.volume, pieces: l.pieces }))];
  const expanded: PartMove[] = [];
  const changed = new Set<PlannedCompartment>();
  const stale: number[] = [];

  // Parts picked out of the plan go first, so moves can't send them anywhere
  const gonePieces = new Map<string, TreeNode>();
  const takeOut = (s: Section): Section | null => {
    let section = s;
    for (const l of leaves(s.node)) {
      const num = l.part?.partNum;
      if (!num || !removed.has(num)) continue;
      gonePieces.set(num, l);
      if (leaves(section.node).length === 1) return null;
      section = { ...section, node: without(section.node, num), volume: section.volume - l.volume, pieces: section.pieces - l.pieces };
    }
    return section;
  };
  if (removed.size) {
    for (const c of compartments) {
      const kept = c.sections.map(takeOut).filter((s): s is Section => !!s);
      if (kept.length !== c.sections.length || kept.some((s, i) => s !== c.sections[i])) changed.add(c);
      c.sections = kept;
    }
    overflow = overflow.map(takeOut).filter((s): s is Section => !!s);
  }

  moves.forEach((move, index) => {
    const sources = [...compartments.flatMap((c) => c.sections), ...overflow].filter((s) => holds(s, move.part));
    const toPart = 'part' in move.to ? move.to.part : null;
    const toComp = 'comp' in move.to ? compartments.find((c) => c.comp.key === (move.to as { comp: string }).comp) : null;
    const hostComp = toPart ? [...compartments].reverse().find((c) => c.sections.some((s) => holds(s, toPart))) : null;
    const host = toPart && hostComp ? [...hostComp.sections].reverse().find((s) => holds(s, toPart)) : null;
    if (!sources.length || (toPart ? !host || toPart === move.part : !toComp) || (host && move.whole && sources.includes(host))) {
      stale.push(index);
      return;
    }
    if (host && sources.includes(host) && leaves(host.node).length > 1 && sources.length === 1) {
      expanded.push({ part: move.part, whole: false, to: move.to }); // already together
      return;
    }

    // Take it out of wherever it is now
    const leaf = leaves(sources[0].node).find((l) => l.part?.partNum === move.part)!;
    const moved = move.whole ? leaves(sources[0].node) : [leaf];
    const wholeNode = move.whole && !sources[0].span ? sources[0].node : null;
    for (const l of moved) expanded.push({ part: l.part!.partNum, whole: false, to: move.to });
    const gone = new Set<Section>();
    for (const s of sources) {
      if (move.whole || leaves(s.node).length === 1) gone.add(s);
      else {
        s.node = without(s.node, move.part);
        s.volume -= leaf.volume;
        s.pieces -= leaf.pieces;
      }
    }
    for (const c of compartments) {
      if (c.sections.some((s) => sources.includes(s))) changed.add(c);
      c.sections = c.sections.filter((s) => !gone.has(s));
    }
    overflow = overflow.filter((s) => !gone.has(s));

    // And put it where it's going
    const volume = sum(moved, 'volume');
    const pieces = sum(moved, 'pieces');
    if (host) {
      host.node = joined(host.node, moved);
      host.volume += volume;
      host.pieces += pieces;
      changed.add(hostComp!);
    } else {
      toComp!.sections.push({ node: wholeNode ?? (moved.length === 1 ? moved[0] : joined(moved[0], moved.slice(1))), volume, pieces });
      changed.add(toComp!);
    }
  });

  for (const c of changed) {
    c.fill = usedBy(c.sections) / c.comp.volume;
    c.status = c.sections.length ? 'used' : c.spareFor ? 'spare' : 'empty';
  }
  const unplaced = overflow.reduce((t, s) => t + s.volume, 0);
  const gone = [...gonePieces.values()];
  const stats = {
    ...base.stats,
    pieces: base.stats.pieces + sum(detached, 'pieces') - sum(gone, 'pieces'),
    volume: base.stats.volume + sum(detached, 'volume') - sum(gone, 'volume'),
    moulds: base.stats.moulds + detached.length - gone.length,
    ...countStats(compartments, unplaced, base.settings),
  };
  return { plan: { ...base, compartments, overflow, stats }, stale, expanded };
}

/** Add a move, replacing any earlier one for the same part */
export const withMove = (moves: PartMove[], move: PartMove): PartMove[] => [...moves.filter((m) => m.part !== move.part), move];

/** A part moved more than once (a "move all", then moved on its own) belongs where it was last put */
export const latestMoves = (moves: PartMove[]) => moves.filter((m, i) => !moves.slice(i + 1).some((later) => later.part === m.part));

/** What a re-plan would build around, given the changes in force now */
export function basisOf(expanded: PartMove[], picked: ReadonlySet<string>, calibration: Calibration | null = null): PlanBasis {
  const basis: PlanBasis = { out: [...picked].sort(), together: {}, pins: {}, calibration };
  for (const m of latestMoves(expanded)) {
    if ('part' in m.to) basis.together[m.part] = m.to.part;
    else basis.pins[m.part] = m.to.comp;
  }
  return basis;
}

/** How many changes separate the plan's basis from the changes in force: zero means nothing to re-plan */
export function basisChanges(a: PlanBasis, b: PlanBasis): number {
  const inOne = (x: string[], y: string[]) => x.filter((v) => !y.includes(v)).length;
  const mapDiff = (x: Record<string, string>, y: Record<string, string>) => new Set([...Object.keys(x), ...Object.keys(y)].filter((k) => x[k] !== y[k])).size;
  const calibrationDiff = JSON.stringify(a.calibration ?? null) === JSON.stringify(b.calibration ?? null) ? 0 : 1;
  return inOne(a.out, b.out) + inOne(b.out, a.out) + mapDiff(a.together, b.together) + mapDiff(a.pins, b.pins) + calibrationDiff;
}
