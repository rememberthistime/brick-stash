// What goes on each label, from the plan or from the user's own setup, in one shape that both the tape labels and
// the printed sheet draw from.
import { leaves, sectionLabel, type PlannedCompartment } from './planner';
import type { PlacedPocket, SetupComp } from './setup';
import { stem } from './storageList';
import { labelSpec, shortName, type LabelCell } from './tapeLabel';

export interface SheetCell extends LabelCell {
  /** colours the sheet label's edge */
  family?: string;
  /** every part number in it, most first */
  parts: string[];
  /** the full name, for sheet labels, which have room for it */
  sheetTitle?: string;
}

export interface LabelEntry {
  /** printed on the label: "A3", or "A3.2" for one box */
  code: string;
  /** where it goes, in words */
  where: string;
  /** storage kind, to print one kind at a time */
  kind: string;
  cells: SheetCell[];
  /** parts to link to Brick Architect */
  links: { partNum: string; name: string }[];
}

/** One label per planned compartment in use */
export function planLabels(located: (PlannedCompartment & { code: string })[]): LabelEntry[] {
  return located
    .filter((c) => c.status === 'used')
    .map((c) => {
      const spec = labelSpec(c);
      const sectionParts = c.sections.map((s) => leaves(s.node).flatMap((l) => (l.part ? [l.part] : [])).sort((a, b) => b.qty - a.qty));
      return {
        code: c.code,
        where: `${c.comp.unitName} › ${c.comp.label}`,
        kind: stem(c.comp.unitName),
        cells: spec.cells.map((cell, i) => ({ ...cell, family: c.sections[i].node.familyKey, parts: sectionParts[i].map((p) => p.partNum), sheetTitle: sectionLabel(c.sections[i]) })),
        links: sectionParts.flat().map((p) => ({ partNum: p.partNum, name: p.name })),
      };
    });
}

/**
 * Labels for the drawers as they really are. A box with a name ("Fences") says that, with a picture or two of what's
 * most in it, instead of listing every part. Boxes with nothing recorded and no name are left off.
 */
export function setupLabels(pockets: PlacedPocket[], comps: SetupComp[], perBox: boolean): LabelEntry[] {
  const out: LabelEntry[] = [];
  for (const comp of comps) {
    const inDrawer = pockets.filter((p) => p.comp.key === comp.key);
    const cells = inDrawer.map((p) => {
      const parts = [...p.parts].sort((a, b) => b.used - a.used);
      const name = p.label?.trim();
      const cell: SheetCell = {
        title: name || (parts.length === 1 ? shortName(parts[0].part.name) : shortName(p.groupLabel)),
        detail: name && parts.length !== 1 ? (parts.length ? `${parts.length} types` : '') : parts.length === 1 ? parts[0].part.partNum : `${parts.length} types`,
        images: parts.slice(0, parts.length === 1 ? 1 : 2).map((x) => x.part.partNum),
        family: p.family || undefined,
        parts: parts.map((x) => x.part.partNum),
        sheetTitle: name || (parts.length === 1 ? parts[0].part.name : p.groupLabel),
      };
      return { cell, show: !!name || parts.length > 0, links: parts.map((x) => ({ partNum: x.part.partNum, name: x.part.name })) };
    });
    const where = `${comp.unitName} › ${comp.label}`;
    const kind = stem(comp.unitName);
    if (perBox) {
      cells.forEach((c, i) => {
        if (c.show) out.push({ code: inDrawer.length > 1 ? `${comp.code}.${i + 1}` : comp.code, where: inDrawer.length > 1 ? `${where}, box ${i + 1}` : where, kind, cells: [c.cell], links: c.links });
      });
    } else if (cells.some((c) => c.show)) {
      const shown = cells.filter((c) => c.show);
      out.push({ code: comp.code, where, kind, cells: shown.map((c) => c.cell), links: shown.flatMap((c) => c.links) });
    }
  }
  return out;
}
