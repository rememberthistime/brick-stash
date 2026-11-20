// Colours: storage is by type, so the planner merges them, but a build needs the right colour. Rebrickable's own
// exports name colours by number (4 is Red), set inventories by name, and BrickLink by its own numbers, so every
// colour is turned into one name before it's compared. The names come from Rebrickable, once, with the user's key.
import { baseMould } from './collection';
import type { Catalog, ColourTable, InventoryRow } from './types';

/** BrickLink's colour numbers are kept as "BL 11", so they never mix with Rebrickable's */
export const BL_PREFIX = 'BL ';

/** The colour's name: a Rebrickable or BrickLink number turned into its name where the table knows it */
export function colourName(raw: string | undefined, table?: ColourTable | null): string {
  const c = (raw ?? '').trim();
  if (!c) return '';
  if (c.startsWith(BL_PREFIX)) {
    const n = table?.bl[c.slice(BL_PREFIX.length)];
    return n ?? `BrickLink colour ${c.slice(BL_PREFIX.length)}`;
  }
  if (/^-?\d+$/.test(c)) return table?.byId[c]?.[0] ?? `Colour ${c}`;
  return c;
}

/** The colour's swatch, "#c91a09", where known */
export function colourRgb(name: string, table?: ColourTable | null, extra?: ReadonlyMap<string, string>): string | undefined {
  if (extra?.has(name)) return extra.get(name);
  if (!table) return undefined;
  for (const [n, rgb] of Object.values(table.byId)) if (n === name) return rgb ? `#${rgb}` : undefined;
  return undefined;
}

/** True when some colours are still numbers the table can't name */
export const needsColourNames = (rows: InventoryRow[], table?: ColourTable | null) => rows.some((r) => r.colour && colourName(r.colour, table).match(/^(BrickLink colour|Colour) /));

/** How many of each part you have in each colour, with the sets kept built taken off (their spares stay in) */
export function colourStock(rows: InventoryRow[], built: InventoryRow[], catalog: Catalog | null, table?: ColourTable | null): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const add = (r: InventoryRow, sign: number) => {
    const key = baseMould(r.partNum, catalog);
    const m = out.get(key) ?? new Map<string, number>();
    const c = colourName(r.colour, table);
    m.set(c, (m.get(c) ?? 0) + sign * r.qty);
    out.set(key, m);
  };
  for (const r of rows) add(r, 1);
  for (const r of built) if (!r.spare) add(r, -1);
  for (const m of out.values()) for (const [c, n] of m) if (n <= 0) m.delete(c);
  return out;
}

interface RbColour {
  id: number;
  name: string;
  rgb: string;
  external_ids?: { BrickLink?: { ext_ids: number[] } };
}

/** Rebrickable's colour list, as a table of names by Rebrickable and BrickLink number */
export function colourTable(list: RbColour[], fetched = new Date().toISOString()): ColourTable {
  const byId: ColourTable['byId'] = {};
  const bl: ColourTable['bl'] = {};
  for (const c of list) {
    byId[String(c.id)] = [c.name, c.rgb];
    for (const b of c.external_ids?.BrickLink?.ext_ids ?? []) bl[String(b)] ??= c.name;
  }
  return { fetched, byId, bl };
}
