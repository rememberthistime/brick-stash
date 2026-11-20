// A pick list for a build: given the parts a set or model needs, which drawers to open and how many of each part to
// take, in the order the drawers come, plus what there isn't enough of. Storage is by type, so a part is found by
// its mould whatever its colour; the colours wanted are listed beside it for picking them out.
import { baseMould } from './collection';
import { colourName } from './colours';
import { placeName } from './codes';
import { leaves, sectionLabel, type PlannedCompartment } from './planner';
import type { SetupComp } from './setup';
import type { Catalog, ColourTable, InventoryRow, Part, Setup } from './types';

export interface Place {
  /** "A3", or "A3.2" for one section or box of several */
  code: string;
  /** the drawer itself, which lines are grouped by */
  drawer: string;
  /** where that is, in words */
  where: string;
  /** the user's own name for the drawer, if it has one */
  name?: string;
  /** what the section or box is called, when the part shares it */
  section?: string;
  /** drawers come in this order */
  order: number;
}

export type Places = Map<string, Place[]>;

/** Where the plan puts each part */
export function planPlaces(located: (PlannedCompartment & { code: string })[]): Places {
  const out: Places = new Map();
  located.forEach((c, order) => {
    c.sections.forEach((sec, i) => {
      const parts = leaves(sec.node).flatMap((l) => (l.part ? [l.part.partNum] : []));
      const place: Place = { code: c.sections.length > 1 ? `${c.code}.${i + 1}` : c.code, drawer: c.code, where: `${c.comp.unitName} › ${c.comp.label}`, order, ...(placeName(c.comp) ? { name: placeName(c.comp) } : {}), ...(parts.length > 1 ? { section: sectionLabel(sec) } : {}) };
      for (const n of parts) out.set(n, [...(out.get(n) ?? []), place]);
    });
  });
  return out;
}

/** Where each part really is, for the drawers recorded on My setup */
export function setupPlaces(setup: Setup, comps: SetupComp[]): Places {
  const out: Places = new Map();
  comps.forEach((comp, order) => {
    const pockets = setup.drawers[comp.key] ?? [];
    pockets.forEach((p, i) => {
      const place: Place = { code: pockets.length > 1 ? `${comp.code}.${i + 1}` : comp.code, drawer: comp.code, where: `${comp.unitName} › ${comp.label}`, order, ...(placeName(comp) ? { name: placeName(comp) } : {}), ...(p.label?.trim() ? { section: p.label.trim() } : {}) };
      for (const n of p.parts) out.set(n, [...(out.get(n) ?? []), place]);
    });
  });
  return out;
}

/** The first list's places, and the second's for any part the first doesn't have */
export const placesWithFallback = (first: Places, second: Places): Places => new Map([...second, ...first]);

export interface PickLine {
  partNum: string;
  name: string;
  /** pieces the build needs */
  want: number;
  /** pieces in the collection, of any colour, once built sets are taken off */
  have: number;
  /** the colours the build needs them in, most first, with how many of each you have when that's known */
  colours: PickColour[];
  /** everywhere it's kept; the first is the drawer it's listed under */
  places: Place[];
}

export interface PickColour {
  name: string;
  qty: number;
  /** pieces of this part in this colour in the collection, when colours are known */
  have?: number;
}

/** The tick for one colour of one part: "3001|Red" */
export const pickKey = (partNum: string, colour: string) => `${partNum}|${colour}`;

export interface ColourShort {
  partNum: string;
  name: string;
  colour: string;
  need: number;
  have: number;
}

export interface PickList {
  drawers: { code: string; where: string; name?: string; lines: PickLine[] }[];
  /** owned, but with no drawer to send you to: no home in the plan yet, or not recorded */
  unplaced: PickLine[];
  /** owned, but kept out of the plan, so stored somewhere else */
  elsewhere: PickLine[];
  /** not in the collection at all */
  missing: PickLine[];
  /** lines with fewer in the collection than the build needs (they're also listed wherever the part is) */
  short: PickLine[];
  pieces: number;
  types: number;
  /** pieces the collection can't supply */
  piecesShort: number;
  /** colours you have too few of, though you may have the part in others: a shopping list */
  colourShort: ColourShort[];
}

export interface ColourOptions {
  /** pieces of each part in each colour: see colourStock() */
  stock?: Map<string, Map<string, number>>;
  table?: ColourTable | null;
}

/**
 * `owned` is everything in the collection, kept out of the plan or not. `keptOut` are the parts stored elsewhere.
 * Spares in a set's inventory aren't needed to build it, so they're left off.
 */
export function pickList(wanted: InventoryRow[], catalog: Catalog | null, owned: Part[], places: Places, keptOut: ReadonlySet<string> = new Set(), colour: ColourOptions = {}): PickList {
  const byMould = new Map<string, { want: number; colours: Map<string, number>; name?: string }>();
  for (const r of wanted) {
    if (r.spare) continue;
    const key = baseMould(r.partNum, catalog);
    const e = byMould.get(key) ?? { want: 0, colours: new Map<string, number>(), name: r.name };
    e.want += r.qty;
    const c = colourName(r.colour, colour.table);
    e.colours.set(c, (e.colours.get(c) ?? 0) + r.qty);
    byMould.set(key, e);
  }
  const have = new Map(owned.map((p) => [p.partNum, p]));
  const lines = [...byMould].map(([partNum, e]): PickLine => {
    const mine = have.get(partNum);
    return {
      partNum,
      name: mine?.name ?? catalog?.parts[partNum]?.[0] ?? e.name ?? partNum,
      want: e.want,
      have: mine?.qty ?? 0,
      colours: [...e.colours]
        .map(([name, qty]): PickColour => {
          const known = name && colour.stock;
          return { name, qty, ...(known ? { have: colour.stock!.get(partNum)?.get(name) ?? 0 } : {}) };
        })
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
      places: places.get(partNum) ?? [],
    };
  });

  const list: PickList = { drawers: [], unplaced: [], elsewhere: [], missing: [], short: [], pieces: 0, types: lines.length, piecesShort: 0, colourShort: [] };
  const drawers = new Map<string, { code: string; where: string; name?: string; order: number; lines: PickLine[] }>();
  for (const line of lines) {
    list.pieces += line.want;
    if (line.have < line.want) {
      list.piecesShort += line.want - line.have;
      if (line.have) list.short.push(line);
    }
    for (const c of line.colours) if (c.have !== undefined && c.have < c.qty) list.colourShort.push({ partNum: line.partNum, name: line.name, colour: c.name, need: c.qty, have: c.have });
    if (!line.have) list.missing.push(line);
    else if (keptOut.has(line.partNum) && !line.places.length) list.elsewhere.push(line);
    else if (!line.places.length) list.unplaced.push(line);
    else {
      const at = line.places[0];
      const d = drawers.get(at.drawer) ?? { code: at.drawer, where: at.where, ...(at.name ? { name: at.name } : {}), order: at.order, lines: [] };
      d.lines.push(line);
      drawers.set(at.drawer, d);
    }
  }
  const byName = (a: PickLine, b: PickLine) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const bySection = (a: PickLine, b: PickLine) => a.places[0].code.localeCompare(b.places[0].code, undefined, { numeric: true }) || byName(a, b);
  list.drawers = [...drawers.values()].sort((a, b) => a.order - b.order).map(({ code, where, name, lines }) => ({ code, where, ...(name ? { name } : {}), lines: lines.sort(bySection) }));
  for (const group of [list.unplaced, list.elsewhere, list.missing, list.short]) group.sort(byName);
  list.colourShort.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.colour.localeCompare(b.colour));
  return list;
}

/** A shopping list for what's short, as Rebrickable's parts-list CSV (Part,Color,Quantity), with Rebrickable's colour numbers where known */
export function shortCsv(short: ColourShort[], table?: ColourTable | null): string {
  const ids = new Map(Object.entries(table?.byId ?? {}).map(([id, [name]]) => [name, id]));
  const cell = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ['Part,Color,Quantity', ...short.map((s) => `${cell(s.partNum)},${cell(ids.get(s.colour) ?? s.colour)},${s.need - s.have}`)].join('\n') + '\n';
}
