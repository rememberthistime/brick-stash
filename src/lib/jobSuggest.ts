// Suggested jobs for units: what each unit should be for, read from what's already in it, or failing that from what the
// suggestions would put there, and from the shape of its drawers. Suggestions only: a unit's job changes when you
// press Use. The jobs read from recorded drawers also steer the suggestions for the drawers not yet recorded.
import type { PlannedCompartment } from './planner';
import { leaves } from './planner';
import type { PlacedPocket } from './setup';
import { FAMILIES, GROUPS, familyGroup, sizeClass } from './taxonomy';
import type { Part, SizeClass, StorageUnit, UnitJob } from './types';
import { jobLabel, sizeClassLabel, unitShape } from './unitJobs';

export interface JobHint {
  job: UnitJob;
  /** why, in a few words: "73% of what's in it is Bricks & Slopes; its shallow drawers suit flat parts" */
  why: string;
}

interface Item {
  family: string;
  volume: number;
  part?: Pick<Part, 'name' | 'catId'>;
}

/** One family this share of a unit makes it that family's unit */
const FAMILY_SHARE = 0.7;
/** One group this share of a unit makes it that group's unit */
const GROUP_SHARE = 0.4;
/** Failing a clear majority, the biggest group with this share is the unit's job */
const WEAK_SHARE = 0.25;
/** This share of a unit's parts suiting its shape makes them the job; less, and the shape's own job is suggested */
const SHAPE_SHARE = 0.3;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const groupName = (g: string) => GROUPS.find((x) => x.key === g)?.label ?? g;
const familyName = (f: string) => FAMILIES.find((x) => x.key === f)?.label ?? f;

function top(m: Map<string, number>): [string, number] | undefined {
  return [...m].sort((a, b) => b[1] - a[1])[0];
}

/** What a unit should hold, going by the parts given: a family that has most of it, or the group that has the most */
function whatOf(items: Item[]): { what: string; label: string; share: number } | null {
  const total = items.reduce((t, x) => t + x.volume, 0);
  if (!total) return null;
  const fams = new Map<string, number>();
  const groups = new Map<string, number>();
  for (const x of items) {
    if (x.family === 'unknown') continue;
    fams.set(x.family, (fams.get(x.family) ?? 0) + x.volume);
    const g = familyGroup(x.family);
    groups.set(g, (groups.get(g) ?? 0) + x.volume);
  }
  const [f, fv] = top(fams) ?? ['', 0];
  const [g, gv] = top(groups) ?? ['', 0];
  // A family takes the whole unit only when its group has other families that would then go elsewhere
  const siblings = FAMILIES.filter((x) => x.group === familyGroup(f) && x.key !== 'unknown').length;
  if (f && fv / total >= FAMILY_SHARE && siblings > 1) return { what: f, label: familyName(f), share: fv / total };
  if (g && gv / total >= WEAK_SHARE) return { what: `group:${g}`, label: groupName(g), share: gv / total };
  return null;
}

/** Shapes that decide a unit's job even when what's in it doesn't suit them */
const STRONG = new Set<SizeClass>(['flat', 'long']);

/** What a shape holds when nothing in the unit suits it: shallow drawers are for plates and tiles */
const NATURAL: Partial<Record<SizeClass, string>> = { flat: 'group:plates' };

/**
 * A job from what's in a unit (or would be), and the shape of its drawers. A shaped unit (shallow, long, tiny cups,
 * big) is for the parts that shape suits; what's in it decides which of those, and if little in it suits the shape,
 * the job is the shape's own and the rest is better off elsewhere. An ordinary unit is for whatever has most of it.
 */
function jobFrom(items: Item[], shape: SizeClass | null, source: 'recorded' | 'planned' | 'none'): JobHint | null {
  const said = source === 'recorded' ? "what's in it" : 'what the suggestions put here';
  const vol = (xs: Item[]) => xs.reduce((t, x) => t + x.volume, 0);
  const sentence = (t: string) => ({ why: t.charAt(0).toUpperCase() + t.slice(1) });
  if (shape && shape !== 'ordinary') {
    const sizeName = sizeClassLabel(shape).toLowerCase();
    const sized = items.filter((x) => x.part);
    const suiting = sized.filter((x) => sizeClass(x.part!.name, x.part!.catId) === shape);
    const natural = NATURAL[shape];
    if (!vol(sized)) return { job: { ...(natural ? { what: natural } : {}), size: shape }, ...sentence(`its drawers suit ${sizeName}`) };
    const share = vol(suiting) / vol(sized);
    if (share >= SHAPE_SHARE) {
      const w = whatOf(suiting);
      return { job: { ...(w ? { what: w.what } : {}), size: shape }, ...sentence(`its drawers suit ${sizeName}, and ${pct(share)} of ${said} is ${sizeName}${w ? `, mostly ${w.label}` : ''}`) };
    }
    const now = whatOf(items);
    const little = share < 0.01 ? `none of ${said} is` : `only ${pct(share)} of ${said} is`;
    // Shallow drawers and long sections are wasted on other parts; cups and big drawers hold most things well enough
    if (STRONG.has(shape))
      return {
        job: { ...(natural ? { what: natural } : {}), size: shape },
        ...sentence(`its drawers suit ${sizeName}, but ${little}${now && now.what !== natural ? `: the ${now.label} would be easier to find in a unit that suits them` : ''}`),
      };
    if (now) return { job: { what: now.what }, ...sentence(`${pct(now.share)} of ${said} is ${now.label}`) };
    return null;
  }
  const w = whatOf(items);
  if (!w) return null;
  return { job: { what: w.what }, ...sentence(w.share >= GROUP_SHARE || w.what.indexOf('group:') ? `${pct(w.share)} of ${said} is ${w.label}` : `${w.label} is the biggest share of ${said} (${pct(w.share)})`) };
}

const recordedItems = (pockets: PlacedPocket[]): Item[] => pockets.flatMap((p) => p.parts.map((x) => ({ family: x.family, volume: x.used, part: x.part })));

/** The jobs units' recorded drawers point to, for units with none of their own: these steer the suggestions */
export function recordedJobs(units: StorageUnit[], pockets: PlacedPocket[]): Map<string, UnitJob> {
  const out = new Map<string, UnitJob>();
  for (const u of units) {
    if (jobLabel(u.job)) continue;
    const mine = pockets.filter((p) => p.comp.unitId === u.id);
    if (!mine.some((p) => p.parts.length)) continue;
    const hint = jobFrom(recordedItems(mine), unitShape(u), 'recorded');
    if (hint?.job.what) out.set(u.id, hint.job);
  }
  return out;
}

/** Units with the jobs above filled in where they have none of their own */
export function withRecordedJobs(units: StorageUnit[], jobs: Map<string, UnitJob>): StorageUnit[] {
  if (!jobs.size) return units;
  return units.map((u) => (!jobLabel(u.job) && jobs.has(u.id) ? { ...u, job: jobs.get(u.id) } : u));
}

/**
 * A suggested job for each unit whose job it would change: from its recorded drawers if any, otherwise from what the
 * suggestions put in it, and from its drawers' shape.
 */
export function suggestJobs(units: StorageUnit[], pockets: PlacedPocket[], suggested: Map<string, PlannedCompartment> = new Map()): Map<string, JobHint> {
  const out = new Map<string, JobHint>();
  for (const u of units) {
    const mine = pockets.filter((p) => p.comp.unitId === u.id && p.parts.length);
    let hint: JobHint | null;
    if (mine.length) hint = jobFrom(recordedItems(mine), unitShape(u), 'recorded');
    else {
      const planned: Item[] = [...suggested.values()]
        .filter((c) => c.comp.unitId === u.id)
        .flatMap((c) => c.sections.flatMap((s) => leaves(s.node).map((l) => ({ family: l.familyKey ?? s.node.familyKey, volume: l.volume, part: l.part }))));
      hint = jobFrom(planned, unitShape(u), planned.length ? 'planned' : 'none');
    }
    if (!hint || jobLabel(hint.job) === jobLabel(u.job)) continue;
    out.set(u.id, hint);
  }
  return out;
}
