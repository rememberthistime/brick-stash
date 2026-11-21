// Could someone else find things? The layout check reads the drawers as recorded the way a stranger would: a family
// should live in few units, a drawer shouldn't be a catch-all, every drawer should say
// what it's for, and parts should be in a unit whose job they fit. It only points things out; nothing moves.
import { partPlainName } from './builderNames';
import { placeName } from './codes';
import { familyLabel } from './planner';
import type { PlacedPocket } from './setup';
import { familyGroup, groupLabel } from './taxonomy';
import { fitsJob, jobLabel } from './unitJobs';

export type LayoutKind = 'spread' | 'catchAll' | 'againstJob' | 'unnamed';

export interface LayoutFinding {
  kind: LayoutKind;
  text: string;
  /** the parts it's about, to show with it */
  parts?: string[];
}

/** A family in this many units or more is spread out */
const SPREAD_UNITS = 3;
/** A drawer holding this many groups, or this many pockets, is a catch-all */
const CATCH_ALL_GROUPS = 3;
const CATCH_ALL_POCKETS = 12;
/** A group needs this share of a drawer to count towards it being a catch-all */
const CATCH_ALL_SHARE = 0.1;

const listOf = (xs: string[]) => (xs.length > 6 ? `${xs.slice(0, 6).join(', ')} and ${xs.length - 6} more` : xs.join(', '));
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const byCode = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

/** The letter of a pocket's unit, or failing that its code without the drawer number */
const unitCode = (p: PlacedPocket) => p.comp.unitCode ?? p.comp.code.replace(/\d+$/, '');

export function layoutCheck(pockets: PlacedPocket[]): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  const inUse = pockets.filter((p) => p.parts.length);

  // A family whose drawers are in many units
  const families = new Map<string, Set<string>>();
  for (const p of inUse) if (!p.mixed && p.family) families.set(p.family, (families.get(p.family) ?? new Set()).add(unitCode(p)));
  for (const [family, codes] of [...families].sort((a, b) => b[1].size - a[1].size))
    if (codes.size >= SPREAD_UNITS) out.push({ kind: 'spread', text: `${familyLabel(family)} are in ${codes.size} units: ${listOf([...codes].sort(byCode))}` });

  // A drawer holding a bit of everything
  const drawers = new Map<string, PlacedPocket[]>();
  for (const p of pockets) drawers.set(p.comp.key, [...(drawers.get(p.comp.key) ?? []), p]);
  for (const list of drawers.values()) {
    const used = list.filter((p) => p.parts.length && !p.mixed);
    if (!used.length) continue;
    const groups = new Map<string, number>();
    let total = 0;
    for (const p of used)
      for (const x of p.parts) {
        const g = familyGroup(x.family);
        groups.set(g, (groups.get(g) ?? 0) + x.used);
        total += x.used;
      }
    const big = [...groups].filter(([, v]) => total > 0 && v / total >= CATCH_ALL_SHARE).sort((a, b) => b[1] - a[1]);
    const types = used.reduce((t, p) => t + p.parts.length, 0);
    if (big.length >= CATCH_ALL_GROUPS || list.length >= CATCH_ALL_POCKETS)
      out.push({ kind: 'catchAll', text: `${list[0].comp.code} holds ${types} part types in ${list.length} ${list.length === 1 ? 'pocket' : 'pockets'}, from ${and(big.map(([g]) => groupLabel(g)))}` });
  }

  // Parts in a drawer whose use (its own, or its unit's job) they don't fit
  const against = new Map<string, { code: string; job: string; parts: string[] }>();
  for (const p of inUse) {
    if (p.mixed) continue;
    const job = p.comp.unitJob;
    const holder = p.comp.drawerJob ? p.comp.key : p.comp.unitId;
    for (const x of p.parts) {
      if (fitsJob(job, x.part) !== false) continue;
      const e = against.get(holder) ?? { code: p.comp.drawerJob ? p.comp.code : unitCode(p), job: jobLabel(job), parts: [] };
      if (!e.parts.includes(x.part.partNum)) e.parts.push(x.part.partNum);
      against.set(holder, e);
    }
  }
  const nameOf = new Map(inUse.flatMap((p) => p.parts.map((x) => [x.part.partNum, partPlainName(x.part)] as const)));
  for (const e of [...against.values()].sort((a, b) => byCode(a.code, b.code)))
    out.push({ kind: 'againstJob', text: `${e.code} is for ${e.job}, but holds ${e.parts.length === 1 ? nameOf.get(e.parts[0]) : `${e.parts.length} part types that aren't: ${listOf(e.parts.map((n) => nameOf.get(n) ?? n))}`}`, parts: e.parts });

  // Drawers that don't say what they're for
  const unnamed = [...drawers.values()].filter((list) => list.some((p) => p.parts.length) && !placeName(list[0].comp) && !list.some((p) => p.label?.trim())).map((list) => list[0].comp.code);
  if (unnamed.length) out.push({ kind: 'unnamed', text: `${unnamed.length} recorded ${unnamed.length === 1 ? 'drawer has' : 'drawers have'} no name: ${listOf(unnamed.sort(byCode))}` });
  return out;
}

