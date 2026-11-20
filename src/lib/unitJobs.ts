// What each unit is for. A unit's job is what makes a layout readable without help: the cabinet of bricks, the
// shallow drawers of flat parts, the long boxes of long parts. Moves offer the units whose job fits first, and the
// layout check points out parts that are somewhere else's job.
import { FAMILIES, GROUPS, familyFor, familyGroup, sizeClass } from './taxonomy';
import type { Part, SizeClass, StorageUnit, UnitJob } from './types';

export const SIZE_CLASSES: { key: SizeClass; label: string; hint: string }[] = [
  { key: 'ordinary', label: 'Ordinary sizes', hint: 'Everyday parts up to about 2×4' },
  { key: 'flat', label: 'Flat parts', hint: 'Plates and tiles, which are easiest to see in shallow drawers' },
  { key: 'long', label: 'Long parts', hint: '6 or more long and no more than 2 wide: long bricks and plates, axles, beams' },
  { key: 'tiny', label: 'Tiny parts', hint: 'Technic pins and connectors, minifig accessories, 1×1s' },
  { key: 'big', label: 'Big parts', hint: '3 wide or more both ways, and large one-off parts' },
];

const sizeLabel = (s: SizeClass) => SIZE_CLASSES.find((x) => x.key === s)?.label ?? s;

/** "Bricks & Slopes" for "group:bricks", "Plates" for "plates" */
export function whatLabel(what: string): string {
  if (what.startsWith('group:')) return GROUPS.find((g) => g.key === what.slice(6))?.label ?? what;
  return FAMILIES.find((f) => f.key === what)?.label ?? what;
}

/** "Plates & Tiles: long parts", "Technic", "Big parts", or '' for no job */
export function jobLabel(job: UnitJob | undefined): string {
  if (!job || (!job.what && !job.size)) return '';
  if (job.what && job.size) return `${whatLabel(job.what)}: ${sizeLabel(job.size).toLowerCase()}`;
  return job.what ? whatLabel(job.what) : sizeLabel(job.size!);
}

/** The choices for what a unit holds: each group, then its families */
export function whatChoices(): { value: string; label: string; indent: boolean }[] {
  return GROUPS.flatMap((g) => [
    { value: `group:${g.key}`, label: g.label, indent: false },
    ...FAMILIES.filter((f) => f.group === g.key && f.key !== 'unknown').map((f) => ({ value: f.key, label: f.label, indent: true })),
  ]);
}

/** Whether a part is this job's: null where the unit has no job */
export function fitsJob(job: UnitJob | undefined, part: Pick<Part, 'name' | 'catId'>): boolean | null {
  if (!job || (!job.what && !job.size)) return null;
  const fam = familyFor(part.catId).key;
  if (job.what && !(job.what.startsWith('group:') ? familyGroup(fam) === job.what.slice(6) : fam === job.what)) return false;
  if (job.size && sizeClass(part.name, part.catId) !== job.size) return false;
  return true;
}

/** Set or clear a unit's job */
export function setJob(units: StorageUnit[], unitId: string, job: UnitJob): StorageUnit[] {
  return units.map((u) => {
    if (u.id !== unitId) return u;
    const { job: _old, ...rest } = u;
    const clean: UnitJob = { ...(job.what ? { what: job.what } : {}), ...(job.size ? { size: job.size } : {}) };
    return clean.what || clean.size ? { ...rest, job: clean } : rest;
  });
}

/** Units with a job and no name of their own are named for their job. Returns the same list if none needed it. */
export function nameFromJobs(units: StorageUnit[]): StorageUnit[] {
  if (!units.some((u) => !u.title?.trim() && jobLabel(u.job))) return units;
  return units.map((u) => (!u.title?.trim() && jobLabel(u.job) ? { ...u, title: jobLabel(u.job) } : u));
}

/**
 * What a compartment's shape suits: shallow drawers (35 mm or less) flat parts, long narrow sections long parts,
 * small cups tiny parts, and big drawers big parts.
 */
export function shapeOf(c: { w: number; d: number; h: number }): SizeClass {
  const short = Math.min(c.w, c.d);
  const long = Math.max(c.w, c.d);
  const litres = (c.w * c.d * c.h) / 1e6;
  if (c.h <= 35) return 'flat';
  if (short <= 100 && long >= 150 && long / short >= 2) return 'long';
  if (litres <= 0.4) return 'tiny';
  if (short >= 250 && litres >= 5) return 'big';
  return 'ordinary';
}

/** What a unit's shape suits, going by the compartments it has most of */
export function unitShape(u: Pick<StorageUnit, 'compartments'>): SizeClass | null {
  const most = [...u.compartments].sort((a, b) => b.qty - a.qty)[0];
  return most ? shapeOf(most) : null;
}

export const sizeClassLabel = sizeLabel;
