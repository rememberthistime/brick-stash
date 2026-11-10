// Parts kept out of the plan because they live somewhere else: whole families (minifigs in their own
// display, baseplates on a shelf), bulky one-offs that don't suit trays, and anything picked by hand.
import type { KeepOut, Part, StorageUnit } from './types';
import { FAMILIES, familyFor } from './taxonomy';
import { partVolume } from './collection';
import { partSizeMm } from './volume';

export type KeptReason = 'family' | 'bulky' | 'picked';

export interface KeptPart {
  part: Part;
  reason: KeptReason;
}

export const pieceVolume = (p: Part) => p.volumeOverride ?? p.unitVolume;

/** Big for its kind and only a few of them: a boat hull, not a stack of 16 x 16 plates */
export const isBulky = (p: Part, k: KeepOut) => pieceVolume(p) >= k.bulkyOver && p.qty <= k.bulkyMaxQty;

/** A test for parts too big to go in any compartment, whichever way round they're put */
export function noFitTest(units: StorageUnit[]): (p: Part) => boolean {
  const spaces = units.flatMap((u) => u.compartments.map((c) => [c.w, c.d, c.h].sort((a, b) => a - b)));
  return (p) => {
    const size = partSizeMm(p.name, p.catId);
    if (!size || !spaces.length) return false;
    const s = [...size].sort((a, b) => a - b);
    return !spaces.some((c) => s[0] <= c[0] && s[1] <= c[1] && s[2] <= c[2]);
  };
}

/** Why the rules (ignoring anything picked by hand) keep a part out */
function ruleReason(p: Part, k: KeepOut, fitsNowhere: (p: Part) => boolean): KeptReason | null {
  if (k.families.includes(familyFor(p.catId).key)) return 'family';
  if (k.bulky && (isBulky(p, k) || fitsNowhere(p))) return 'bulky';
  return null;
}

export function splitKeptOut(parts: Part[], k: KeepOut, units: StorageUnit[]) {
  const fitsNowhere = noFitTest(units);
  const planned: Part[] = [];
  const kept: KeptPart[] = [];
  for (const part of parts) {
    const pick = k.parts[part.partNum];
    const rule = ruleReason(part, k, fitsNowhere);
    if (pick === 'in' || (!pick && !rule)) planned.push(part);
    else kept.push({ part, reason: pick === 'out' ? 'picked' : rule! });
  }
  // Rules reshape the plan; parts picked by hand come off the finished plan, so nothing else moves
  const picked = new Set(kept.filter((x) => x.reason === 'picked').map((x) => x.part.partNum));
  const byRule = new Set(kept.filter((x) => x.reason !== 'picked').map((x) => x.part.partNum));
  return { planned, kept, picked, forPlanning: parts.filter((p) => !byRule.has(p.partNum)) };
}

/** Set one part in or out, recording a choice only when it differs from what the rules would do */
export function pickPart(k: KeepOut, p: Part, keep: boolean, units: StorageUnit[]): KeepOut {
  const parts = { ...k.parts };
  const ruleSays = ruleReason(p, k, noFitTest(units)) != null;
  if (keep === ruleSays) delete parts[p.partNum];
  else parts[p.partNum] = keep ? 'out' : 'in';
  return { ...k, parts };
}

export const toggleFamily = (k: KeepOut, family: string): KeepOut => ({
  ...k,
  families: k.families.includes(family) ? k.families.filter((f) => f !== family) : [...k.families, family],
});

export interface KeptSummary {
  pieces: number;
  volume: number;
  /** e.g. ["Minifigures", "12 bulky parts", "3 picked parts"] */
  labels: string[];
}

export function summariseKept(kept: KeptPart[], k: KeepOut, volumeScale: number): KeptSummary {
  const count = (r: KeptReason) => kept.filter((x) => x.reason === r).length;
  const families = FAMILIES.filter((f) => k.families.includes(f.key) && kept.some((x) => x.reason === 'family' && familyFor(x.part.catId).key === f.key)).map((f) => f.label);
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
  return {
    pieces: kept.reduce((t, x) => t + x.part.qty, 0),
    volume: kept.reduce((t, x) => t + partVolume(x.part, volumeScale), 0),
    labels: [...families, ...(count('bulky') ? [plural(count('bulky'), 'bulky part')] : []), ...(count('picked') ? [plural(count('picked'), 'part') + ' picked by hand'] : [])],
  };
}
