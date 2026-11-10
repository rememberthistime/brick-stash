// Helpers for entering storage quickly: units from catalogue products, pasted lists like
// "8x https://www.officeworks.com.au/...", and showing identical units as one row with a quantity.
import type { StorageUnit } from './types';
import { PRESETS, type Preset } from './presets';

export const stem = (name: string) => name.replace(/\s*#\d+$/, '');

/** `count` new units of a product, numbered on from any already in `existing` */
export function unitsFromPreset(p: Preset, count: number, existing: StorageUnit[], makeId: () => string): StorageUnit[] {
  const numbers = existing.filter((u) => stem(u.name) === p.name).map((u) => Number(u.name.match(/#(\d+)$/)?.[1] ?? 1));
  let next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return Array.from({ length: count }, () => {
    const n = next++;
    return {
      id: makeId(),
      name: n > 1 ? `${p.name} #${n}` : p.name,
      accessibility: 2 as const,
      external: { ...p.external },
      compartments: p.compartments.map((c) => ({ ...c, id: makeId() })),
    };
  });
}

export interface ListMatch {
  preset: Preset;
  count: number;
}

/** Find the product a line refers to: by product code, link or name */
function findPreset(line: string): Preset | undefined {
  const lower = line.toLowerCase();
  return PRESETS.find((p) => p.match?.some((m) => lower.includes(m)) || lower.includes(p.name.toLowerCase()));
}

/** Read one product per line, with a count like "8x …", "8 × …", "… x8" or "…, 8". Lines it can't place are returned as they are. */
export function parseStorageList(text: string): { matched: ListMatch[]; unmatched: string[] } {
  const counts = new Map<Preset, number>();
  const unmatched: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const preset = findPreset(line);
    if (!preset) {
      unmatched.push(line);
      continue;
    }
    const m = line.match(/^(\d+)\s*[x×]?\s+/i) ?? line.match(/^(\d+)\s*[x×]/i) ?? line.match(/[\s,]x?(\d+)$/i);
    counts.set(preset, (counts.get(preset) ?? 0) + (m ? Number(m[1]) : 1));
  }
  return { matched: [...counts].map(([preset, count]) => ({ preset, count })), unmatched };
}

export interface UnitGroup {
  units: StorageUnit[];
  name: string;
}

const shapeOf = (u: StorageUnit) => u.compartments.map((c) => `${c.label}:${c.w}x${c.d}x${c.h}x${c.qty}${c.noDividers ? 'n' : ''}`).join('|');

/** Identical units (same name stem, compartments, reach and space) shown as one row */
export function groupUnits(units: StorageUnit[]): UnitGroup[] {
  const groups = new Map<string, UnitGroup>();
  for (const u of units) {
    const key = [stem(u.name), shapeOf(u), u.accessibility, u.spaceId ?? ''].join('~');
    const g = groups.get(key) ?? { units: [], name: stem(u.name) };
    g.units.push(u);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** "1× 125×125×50, 4× 60×60×50" */
export const describeCompartments = (u: StorageUnit) => u.compartments.map((c) => `${c.qty}× ${c.w}×${c.d}×${c.h}`).join(', ');
