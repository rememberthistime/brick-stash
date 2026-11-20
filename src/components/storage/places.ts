// Every place a part can go, for the Move to… picker: each pocket of each drawer, named the same way everywhere, with
// the pockets already holding the same sort of parts first.
import { codeWithName, placeName } from '../../lib/codes';
import type { Spot } from '../../lib/move';
import { contentsName, type PlacedPocket, type SetupComp } from '../../lib/setup';
import { familyFor, familyGroup } from '../../lib/taxonomy';
import type { Part, Setup } from '../../lib/types';
import { pct } from './format';

export interface PlaceOption extends Spot {
  /** "A3.2" */
  code: string;
  /** "A3.2: Fences" */
  title: string;
  /** what's there and how full, in a few words */
  detail: string;
  /** holds the same family (2) or group of families (1) as the parts being moved, or neither (0) */
  similar: number;
  /** the drawer's own name and unit, for searching */
  words: string;
}

/** "A1.2: Fences": a pocket's code and what it's called, the same everywhere */
export function spotTitle(c: SetupComp, i: number, setup: Setup, pockets: PlacedPocket[]): string {
  const list = setup.drawers[c.key] ?? [];
  const code = list.length > 1 ? `${c.code}.${i + 1}` : c.code;
  const named = list[i]?.label?.trim() || (list.length > 1 ? '' : placeName(c));
  const pp = pockets.find((x) => x.id === list[i]?.id);
  const title = named || (pp?.parts.length ? contentsName(pp) : '');
  return title ? `${code}: ${title}` : code;
}

/** Where a part sits now: each pocket holding it */
export function spotsOf(partNum: string, setup: Setup): Spot[] {
  const out: Spot[] = [];
  for (const [key, list] of Object.entries(setup.drawers)) list.forEach((p, pocket) => p.parts.includes(partNum) && out.push({ key, pocket }));
  return out;
}

/**
 * The places to offer: every pocket of every recorded drawer, and each drawer with nothing recorded, in drawer order.
 * Pockets holding the same family as the parts (or the same group of families) are marked, to list first.
 */
export function placeOptions(comps: SetupComp[], setup: Setup, pockets: PlacedPocket[], forParts: Part[] = []): PlaceOption[] {
  const fams = new Set(forParts.map((p) => familyFor(p.catId).key));
  const grps = new Set([...fams].map(familyGroup));
  const byId = new Map(pockets.map((p) => [p.id, p]));
  return comps.flatMap((c) => {
    const list = setup.drawers[c.key] ?? [];
    const words = `${c.code} ${placeName(c)} ${c.unitName} ${c.label}`.toLowerCase();
    if (!list.length) return [{ key: c.key, pocket: 0, code: c.code, title: codeWithName(c.code, c), detail: 'nothing recorded', similar: 0, words }];
    return list.map((p, i) => {
      const pp = byId.get(p.id);
      const used = pp && pp.capacity ? pp.used / pp.capacity : 0;
      const similar = !pp?.parts.length ? 0 : fams.has(pp.family) ? 2 : grps.has(familyGroup(pp.family)) ? 1 : 0;
      return {
        key: c.key,
        pocket: i,
        code: list.length > 1 ? `${c.code}.${i + 1}` : c.code,
        title: spotTitle(c, i, setup, pockets),
        detail: pp?.parts.length ? `${pp.parts.length} ${pp.parts.length === 1 ? 'part' : 'parts'}, ${pp.fill === undefined ? '~' : ''}${pct(used)} full` : 'empty',
        similar,
        words: `${words} ${p.label ?? ''} ${pp ? contentsName(pp) : ''}`.toLowerCase(),
      };
    });
  });
}

/** Drawers only, for swapping one drawer with another */
export function drawerOptions(comps: SetupComp[], setup: Setup, pockets: PlacedPocket[]): PlaceOption[] {
  return comps.map((c) => {
    const list = setup.drawers[c.key] ?? [];
    const inUse = pockets.filter((p) => p.comp.key === c.key && p.parts.length);
    const what = [...new Set(inUse.map((p) => p.label?.trim() || contentsName(p)))];
    return {
      key: c.key,
      pocket: 0,
      code: c.code,
      title: codeWithName(c.code, c),
      detail: !list.length ? 'nothing recorded' : what.length ? what.slice(0, 2).join(', ') + (what.length > 2 ? ` + ${what.length - 2}` : '') : 'empty',
      similar: 0,
      words: `${c.code} ${placeName(c)} ${c.unitName} ${c.label} ${what.join(' ')}`.toLowerCase(),
    };
  });
}

/** Options matching what's typed: a drawer code typed whole ("a3", "a3.2") comes first, then any word in its name */
export function filterPlaces(options: PlaceOption[], query: string): PlaceOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options.filter((o) => o.similar === 2), ...options.filter((o) => o.similar === 1), ...options.filter((o) => !o.similar)];
  const code = options.filter((o) => o.code.toLowerCase().startsWith(q));
  const rest = options.filter((o) => !code.includes(o) && q.split(/\s+/).every((w) => o.words.includes(w) || o.title.toLowerCase().includes(w)));
  return [...code, ...rest];
}
