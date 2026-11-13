// Drawer codes: a letter for each unit and a number for each of its compartments, as in A1 or C12. Photos, box names,
// drafts, reviews and printed labels are all filed under them, so a unit keeps its letter for good: it's stored on
// the unit rather than worked out from where the unit sits in the list.
import type { StorageUnit } from './types';

/** A–Z, then AA, AB… A digit here would make codes ambiguous: unit "A1" section 4 would read as unit A, compartment 14. */
export function unitLetter(n: number): string {
  const letter = String.fromCharCode(65 + (n % 26));
  return n < 26 ? letter : unitLetter(Math.floor(n / 26) - 1) + letter;
}

export const validUnitCode = (code: string) => /^[A-Z]{1,3}$/.test(code);

/** The order units are shown and planned in: easiest to reach first, then as listed */
export const inReachOrder = (units: StorageUnit[]): StorageUnit[] =>
  units
    .map((u, i) => ({ u, i }))
    .sort((a, b) => b.u.accessibility - a.u.accessibility || a.i - b.i)
    .map((x) => x.u);

/**
 * Every unit with a letter of its own. Units that have one keep it. The rest take the first letters not in use, in
 * reach order, which is how every letter was worked out before they were stored: so a project saved before then
 * keeps exactly the codes it had. A copy of a unit arrives with its original's letter, and is given a new one.
 * Returns the same list if nothing needed doing.
 */
export function withUnitCodes(units: StorageUnit[]): StorageUnit[] {
  const taken = new Set<string>();
  const settled = new Set<StorageUnit>();
  for (const u of units) {
    if (u.code && validUnitCode(u.code) && !taken.has(u.code)) {
      taken.add(u.code);
      settled.add(u);
    }
  }
  if (settled.size === units.length) return units;
  let n = 0;
  const next = () => {
    let letter = unitLetter(n++);
    while (taken.has(letter)) letter = unitLetter(n++);
    taken.add(letter);
    return letter;
  };
  const fresh = new Map<StorageUnit, string>();
  for (const u of inReachOrder(units)) if (!settled.has(u)) fresh.set(u, next());
  return units.map((u) => (fresh.has(u) ? { ...u, code: fresh.get(u)! } : u));
}

/** Give a unit a letter chosen by hand. If another unit has it, the two swap, so no two ever share one. */
export function setUnitCode(units: StorageUnit[], unitId: string, code: string): StorageUnit[] {
  const all = withUnitCodes(units);
  const unit = all.find((u) => u.id === unitId);
  if (!unit || !validUnitCode(code) || unit.code === code) return all;
  return all.map((u) => (u.id === unitId ? { ...u, code } : u.code === code ? { ...u, code: unit.code } : u));
}

/** The letter for each unit among some compartments, for lists of compartments put together without their units */
export function lettersFor(comps: { unitId: string; unitCode?: string }[]): Map<string, string> {
  const letters = new Map<string, string>();
  const taken = new Set(comps.flatMap((c) => (c.unitCode ? [c.unitCode] : [])));
  let n = 0;
  for (const c of comps) {
    if (letters.has(c.unitId)) continue;
    if (c.unitCode) letters.set(c.unitId, c.unitCode);
    else {
      let letter = unitLetter(n++);
      while (taken.has(letter)) letter = unitLetter(n++);
      letters.set(c.unitId, letter);
    }
  }
  return letters;
}

/** Where a drawer's own name is kept on its unit: its compartment spec and number within that spec, from 0 */
export const drawerKey = (specId: string, index: number) => `${specId}:${index}`;

/** What a drawer is called by the user: its own name, or failing that its unit's. Empty if neither is named. */
export const placeName = (c: { name?: string; unitTitle?: string }) => c.name?.trim() || c.unitTitle?.trim() || '';

/** "A1: Technic" where the drawer or its unit has a name, otherwise just "A1" */
export const codeWithName = (code: string, c: { name?: string; unitTitle?: string } | null | undefined) => {
  const name = c ? placeName(c) : '';
  return name ? `${code}: ${name}` : code;
};

/** Name, or with an empty name un-name, one drawer of a unit, or with no drawer the unit itself */
export function setPlaceName(units: StorageUnit[], unitId: string, drawer: string | null, name: string): StorageUnit[] {
  const clean = name.trim().slice(0, 60);
  return units.map((u) => {
    if (u.id !== unitId) return u;
    if (drawer === null) {
      const { title: _old, ...rest } = u;
      return clean ? { ...rest, title: clean } : rest;
    }
    const { [drawer]: _gone, ...others } = u.drawerNames ?? {};
    const drawerNames = clean ? { ...others, [drawer]: clean } : others;
    const { drawerNames: _was, ...rest } = u;
    return Object.keys(drawerNames).length ? { ...rest, drawerNames } : rest;
  });
}

/** The compartment spec and number a compartment key ("unit:spec:2") stands for, as a drawerKey */
export const drawerKeyOf = (compKey: string) => {
  const [, spec, n] = compKey.split(':');
  return spec !== undefined && n !== undefined ? drawerKey(spec, Number(n)) : null;
};
