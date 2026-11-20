// A map of the storage, to stick on a cupboard door: each cupboard or shelf with its units, shelf by shelf, and
// each unit's drawers with what's in them, so anyone can see where to look before opening anything.
import type { Space, StorageUnit } from './types';

/** Shelves are counted from the top */
export const MAX_SHELVES = 8;

export interface MapDrawer {
  code: string;
  /** the user's own name for the drawer, or what's in it */
  title: string;
  recorded: boolean;
}

export interface MapUnit {
  unit: StorageUnit;
  drawers: MapDrawer[];
  /** share of its shelf's width, from the units' outside widths where known */
  width: number;
}

export interface MapSpace {
  /** null: units not put in any cupboard or shelf */
  space: Space | null;
  /** from the top */
  shelves: MapUnit[][];
}

/**
 * Units go on the shelf they're set to (the top one if none), left to right in the order of the units list.
 * `drawersOf` describes each unit's drawers.
 */
export function storageMap(spaces: Space[], units: StorageUnit[], drawersOf: (u: StorageUnit) => MapDrawer[]): MapSpace[] {
  const groups: MapSpace[] = [...spaces.map((space) => ({ space, shelves: [] as MapUnit[][] })), { space: null, shelves: [] }];
  const known = new Set(spaces.map((s) => s.id));
  for (const g of groups) {
    const here = units.filter((u) => (g.space ? u.spaceId === g.space.id : !u.spaceId || !known.has(u.spaceId)));
    const count = Math.max(0, ...here.map((u) => u.shelf ?? 1));
    for (let s = 1; s <= count; s++) {
      const row = here.filter((u) => (u.shelf ?? 1) === s);
      const widths = row.map((u) => u.external?.w ?? 0);
      const fallback = widths.some((w) => w > 0) ? widths.filter((w) => w > 0).reduce((a, b) => a + b, 0) / widths.filter((w) => w > 0).length : 1;
      const total = widths.reduce((t, w) => t + (w || fallback), 0);
      g.shelves.push(row.map((unit, i) => ({ unit, drawers: drawersOf(unit), width: (widths[i] || fallback) / total })));
    }
  }
  return groups.filter((g) => g.space || g.shelves.some((s) => s.length));
}

/** Move a unit one place left (-1) or right (+1) among the units on the same shelf of the same space */
export function nudgeUnit(units: StorageUnit[], id: string, by: -1 | 1): StorageUnit[] {
  const u = units.find((x) => x.id === id);
  if (!u) return units;
  const sameRow = (x: StorageUnit) => x.spaceId === u.spaceId && (x.shelf ?? 1) === (u.shelf ?? 1);
  const row = units.map((x, i) => [x, i] as const).filter(([x]) => sameRow(x));
  const at = row.findIndex(([x]) => x.id === id);
  const other = row[at + by];
  if (!other) return units;
  const out = [...units];
  [out[row[at][1]], out[other[1]]] = [out[other[1]], out[row[at][1]]];
  return out;
}
