// When a search on Put away & move finds nothing in the list, say where the part is instead: already in a drawer,
// kept out of storage, all in sets kept built, or not in the collection at all (with catalogue parts to add).
import { findInCatalog } from '../../lib/collection';
import type { KeptPart, KeptReason } from '../../lib/keepOut';
import type { Spot } from '../../lib/move';
import { partMatcher } from '../../lib/setup';
import type { Catalog, Part, Setup } from '../../lib/types';
import { spotsOf } from './places';

export interface Elsewhere {
  /** in your drawers already */
  inDrawers: { part: Part; spots: Spot[] }[];
  /** kept out of storage, and why */
  kept: { part: Part; reason: KeptReason }[];
  /** in the collection, but every one is in a set kept built */
  built: Part[];
  /** not in the collection: catalogue parts that match, to add */
  catalog: { partNum: string; name: string }[];
}

const MAX = 6;

export function findElsewhere(query: string, opts: { owned: Part[]; toStore: Part[]; kept: KeptPart[]; setup: Setup; catalog: Catalog | null; resolve?: (n: string) => string }): Elsewhere {
  const q = query.trim().toLowerCase();
  const none: Elsewhere = { inDrawers: [], kept: [], built: [], catalog: [] };
  if (q.length < 2) return none;
  const m = partMatcher(query, opts.resolve);
  const hit = (p: Part) => m.test(p) || p.name.toLowerCase().includes(q);
  const stored = new Set(opts.toStore.map((p) => p.partNum));
  const keptNums = new Set(opts.kept.map((k) => k.part.partNum));
  const owned = opts.owned.filter(hit);
  const inDrawers = opts.toStore
    .filter(hit)
    .map((part) => ({ part, spots: spotsOf(part.partNum, opts.setup) }))
    .filter((x) => x.spots.length)
    .slice(0, MAX);
  const kept = opts.kept.filter((k) => hit(k.part)).slice(0, MAX);
  const built = owned.filter((p) => !stored.has(p.partNum) && !keptNums.has(p.partNum)).slice(0, MAX);
  const ownedNums = new Set(opts.owned.map((p) => p.partNum));
  const catalog = owned.length ? [] : findInCatalog(opts.catalog, query, MAX).filter((c) => !ownedNums.has(c.partNum));
  return { inDrawers, kept, built, catalog };
}
