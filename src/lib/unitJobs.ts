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

/** Set or clear what one drawer is for; cleared, it's for whatever its unit is for */
export function setDrawerJob(units: StorageUnit[], unitId: string, drawer: string, job: UnitJob | undefined | null): StorageUnit[] {
  return units.map((u) => {
    if (u.id !== unitId) return u;
    const { [drawer]: _old, ...others } = u.drawerJobs ?? {};
    const clean: UnitJob = { ...(job?.what ? { what: job.what } : {}), ...(job?.size ? { size: job.size } : {}) };
    const drawerJobs = clean.what || clean.size ? { ...others, [drawer]: clean } : others;
    const { drawerJobs: _was, ...rest } = u;
    return Object.keys(drawerJobs).length ? { ...rest, drawerJobs } : rest;
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

// ─── A drawer's use, read from the name you gave it ───

/** Words in a drawer's name that point to a family. Checked all at once; the rules below settle overlaps. */
const NAME_WORDS: [RegExp, string][] = [
  [/\bslop(e|es|ed)\b|\bwedges?\b|\bcheese\b|\bcurved\b|\barch(es)?\b/, 'slopes'],
  [/\btiles?\b/, 'tiles'],
  [/\bplates?\b/, 'plates'],
  [/\bbricks?\b/, 'bricks'],
  [/\bbrackets?\b/, 'plate-special'],
  [/\bhinges?\b|\bclips?\b|\bbars?\b|\bjoints?\b/, 'snot'],
  [/\bpins?\b|\baxles?\b|\baxels?\b|\bconnectors?\b/, 'technic-conn'],
  [/\bbeams?\b|\bliftarms?\b/, 'technic-struct'],
  [/\bgears?\b/, 'technic-mech'],
  [/\bwheels?\b|\btyres?\b|\btires?\b|\bvehicles?\b|\bwindscreens?\b|\bmudguards?\b/, 'wheels'],
  [/\bwindows?\b|\bdoors?\b|\bpanels?\b|\bfences?\b|\bcolumns?\b/, 'building'],
  [/\bbaseplates?\b/, 'large'],
  [/\bminifig(ure)?s?\b/, 'minifig'],
  [/\baccess?or(y|ies)\b|\bweapons?\b|\btools?\b/, 'minifig-acc'],
  [/\bplants?\b|\bflowers?\b|\banimals?\b|\btrees?\b|\bleaf\b|\bleaves\b|\brocks?\b/, 'nature'],
];
/** Words that say the parts are the unusual sort of their kind (round, printed, modified), so only the group is sure */
const SPECIAL_WORDS = /\bcircles?\b|\bround\b|\bstuds?\b|\bmodified\b|\bspecial\b|\bpatterns?\b|\bheadlights?\b/;

function familiesNamed(text: string): Set<string> {
  const found = new Set(NAME_WORDS.filter(([re]) => re.test(text)).map(([, fam]) => fam));
  // "Bricks sloped", "Curved bricks": the slope says more than the brick. Cheese slopes are slopes whatever else is said.
  if (found.has('slopes')) found.delete('bricks');
  if (/\bcheese\b/.test(text)) return new Set(['slopes']);
  // "Technic bricks", "Technic pins": Technic first
  if (/\btechnic\b/.test(text)) {
    found.delete('bricks');
    found.delete('plates');
    if (![...found].some((f) => f.startsWith('technic'))) found.add('technic-struct');
  }
  // "Minifigure accessories" are accessories; "Accessory clips" are still accessories
  if (found.has('minifig-acc')) {
    found.delete('minifig');
    found.delete('snot');
  }
  return found;
}

/**
 * What a drawer's name says it's for: one family where the name is clear ("Plates 2x6 and longer" is for long plates,
 * "Technic pins" for Technic connectors), the group where it names several families of one group or the unusual sort
 * of one ("Bricks: Studs"), and nothing where it names parts of different groups or none at all. Before a colon is
 * what the drawer is; after it, which of those.
 */
export function useFromName(name: string | undefined): UnitJob | null {
  const text = name?.trim().toLowerCase();
  if (!text) return null;
  const groupsOf = (fams: Set<string>) => new Set([...fams].map((f) => familyGroup(f)));
  let fams = familiesNamed(text);
  if (groupsOf(fams).size > 1 && text.includes(':')) fams = familiesNamed(text.slice(0, text.indexOf(':')));
  if (!fams.size) return null;
  const groups = groupsOf(fams);
  if (groups.size > 1) return null;
  const what = fams.size === 1 && !SPECIAL_WORDS.test(text) ? [...fams][0] : `group:${[...groups][0]}`;
  const long = /\blonger\b|\blong\b/.test(text);
  return { what, ...(long ? { size: 'long' as SizeClass } : {}) };
}
