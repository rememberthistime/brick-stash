import type { Part, Space, StorageUnit } from './types';
import { PRESETS, type Preset } from './presets';
import { compartmentVolume, solidVolume } from './volume';
import { cuttingList, dividerLayout } from './dividers';
import { noFitTest } from './keepOut';
import { targetFill, type Plan } from './planner';

export interface Recommendation {
  level: 'action' | 'suggest' | 'info';
  title: string;
  detail: string;
}

const L = (cm3: number) => `${(cm3 / 1000).toFixed(1)} L`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A compartment holding this few pieces on their own is worth pointing out */
const FEW_PIECES = 5;
/** Share of the storage which, as a bare minimum, means the part list deserves a second look */
const ONLY_JUST_POSSIBLE = 0.75;
/** Loose parts never settle tighter than this multiple of their solid-built volume */
const LOOSE_OVER_SOLID = 1.2;
/** Floor for parts without a solid figure, as a share of our estimate (estimates run ~2× solid for plain parts) */
const OTHER_FLOOR = 0.5;

/**
 * The least storage a part list could possibly need: plain bricks/plates/tiles at 1.2× their
 * solid-built volume, everything else at half our estimate. Deliberately generous — if even this
 * exceeds the storage, the inputs are wrong, not the estimates.
 */
export function looseMinimum(parts: Part[]) {
  let solid = 0;
  let plainPieces = 0;
  let plainEstimate = 0;
  let others = 0;
  for (const p of parts) {
    const v = solidVolume(p.name, p.catId);
    if (v == null) {
      others += p.unitVolume * p.qty;
      continue;
    }
    solid += v * p.qty;
    plainPieces += p.qty;
    plainEstimate += p.unitVolume * p.qty;
  }
  return { volume: solid * LOOSE_OVER_SOLID + others * OTHER_FLOOR, solid, plainPieces, plainEstimate, others };
}

export const presetCapacity =(p: Preset, plan: Plan) =>
  p.compartments.reduce((t, c) => t + compartmentVolume(c) * c.qty, 0) * targetFill(plan.settings);

export function recommend(plan: Plan, parts: Part[], units: StorageUnit[], spaces: Space[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const s = plan.stats;

  if (!units.length) {
    recs.push({ level: 'action', title: 'Add your storage', detail: 'Add the drawers, boxes and cabinets you have on the Storage tab so the planner has somewhere to put things.' });
    return recs;
  }

  // 0. Reality check: can this part list physically be in this storage at all?
  const min = looseMinimum(parts);
  if (min.volume > s.physicalCapacity) {
    recs.push({
      level: 'action',
      title: `Check your part list — it can't physically fit this storage`,
      detail:
        `Even packed as tightly as loose parts can go, this list needs at least ${L(min.volume)}; your storage holds ${L(s.physicalCapacity)}. ` +
        `For scale: your ${min.plainPieces.toLocaleString()} plain bricks, plates and tiles alone would take ${L(min.solid)} built into one solid block with no air. ` +
        `If everything really fits today, the part list probably includes parts that aren't in these boxes (sets kept built, sets counted in more than one list, spares), or some storage isn't listed yet.`,
    });
  }

  // 0b. Possible, but only just: worth checking the inputs before buying anything
  else if (min.volume > s.physicalCapacity * ONLY_JUST_POSSIBLE && s.overflowVolume > 0) {
    recs.push({
      level: 'action',
      title: `Check your part list — it only just fits this storage in theory`,
      detail:
        `Packed as tightly as loose parts can go, this list needs ${L(min.volume)} of your ${L(s.physicalCapacity)}. At normal loose packing the estimate is ${L(s.volume)}. ` +
        `If it all fits comfortably today, the list probably still counts parts that aren't in these boxes, or the estimates run high for your parts. ` +
        `To find out which, fill one drawer with parts you can count, compare it with the plan, and set the volume scale from that.`,
    });
  }

  // 1. Not enough room
  if (s.overflowVolume > 0) {
    const smallShare = plan.overflow.filter((o) => o.volume < 300).length / Math.max(1, plan.overflow.length);
    const kinds: Preset['kind'][] = smallShare > 0.6 ? ['small-drawers', 'drawers'] : ['drawers', 'box', 'small-drawers'];
    const options = PRESETS.filter((p) => kinds.includes(p.kind))
      .map((p) => {
        const n = Math.ceil(s.overflowVolume / presetCapacity(p, plan));
        return { p, n, cost: (p.price ?? 0) * n };
      })
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 3);
    recs.push({
      level: 'action',
      title: `About ${L(s.overflowVolume)} of parts don't fit`,
      detail:
        (plan.notes.length
          ? `${plan.overflow.length} group(s) couldn't be placed even with compartments filled to ${pct(plan.settings.practicalFill)} and no growth headroom. `
          : `${plan.overflow.length} group(s) couldn't be placed with ${pct(1 - targetFill(plan.settings) / plan.settings.practicalFill)} growth headroom kept. `) +
        `Options: ${options.map((o) => `${o.n}× ${o.p.name} (~A$${Math.round(o.cost)})`).join('; ')}. ` +
        (plan.notes.length
          ? `Or, if your drawers really take more than that today, raise "Practical max fill" or calibrate the volume scale.`
          : `Or lower the growth allowance / spare compartments in Settings if you don't expect the collection to grow.`),
    });
  }

  // 1a. Parts no compartment can physically hold
  const fitsNowhere = noFitTest(units);
  const tooBig = parts.filter(fitsNowhere);
  if (tooBig.length) {
    recs.push({
      level: 'suggest',
      title: `${tooBig.length} part type(s) are too big for any of your compartments`,
      detail: `${tooBig.slice(0, 5).map((p) => p.name).join(', ')}${tooBig.length > 5 ? '…' : ''}. The plan only counts their volume, so keep them out on the Collection tab (bulky one-offs) and store them elsewhere.`,
    });
  }

  // 1b. Families forced to share
  if (s.mixed > 0) {
    recs.push({
      level: 'suggest',
      title: `${s.mixed} compartment(s) hold unrelated groups`,
      detail: `Storage is too full to give every group its own compartments, so where one group ends and the next begins they share a drawer (divided). About ${L(Math.max(s.overflowVolume, s.volume * 0.05))} more storage, or a higher "Practical max fill", would separate them.`,
    });
  }

  // 2. Big containers holding very little
  const wasted = plan.compartments.filter((c) => c.status === 'used' && c.comp.volume > 3000 && c.fill < 0.15);
  if (wasted.length) {
    recs.push({
      level: 'suggest',
      title: `${wasted.length} large compartment(s) are under 15% full`,
      detail:
        wasted
          .slice(0, 4)
          .map((c) => {
            const free = dividerLayout(c, targetFill(plan.settings))?.free;
            const where = `${c.comp.unitName} › ${c.comp.label} (${pct(c.fill)})`;
            return free ? `${where}: a pocket holds it all, leaving ${free.w} × ${free.d} mm free` : where;
          })
          .join('; ') +
        `${wasted.length > 4 ? '…' : ''}. Open the compartment for the divider layout. The free part can take new parts, or a small-parts tray if you'd rather use it now.`,
    });
  }

  // 2b. A whole compartment for a handful of pieces
  const lonely = plan.compartments.filter((c) => c.status === 'used' && c.sections.length === 1 && !c.sections[0].span && c.sections[0].pieces <= FEW_PIECES);
  if (lonely.length) {
    recs.push({
      level: 'suggest',
      title: `${lonely.length} compartment(s) hold ${FEW_PIECES} pieces or fewer`,
      detail: `${lonely.slice(0, 4).map((c) => `${c.sections[0].node.label} (${c.sections[0].pieces}) in ${c.comp.unitName} › ${c.comp.label}`).join('; ')}${lonely.length > 4 ? '…' : ''}. Open the compartment and use Move to put them with something similar.`,
    });
  }

  // 3. Tiny parts in deep containers are hard to find
  const deep = plan.compartments.filter((c) => {
    if (c.status !== 'used' || c.comp.h < 120) return false;
    const pieces = c.sections.reduce((t, x) => t + x.pieces, 0);
    const vol = c.sections.reduce((t, x) => t + x.volume, 0);
    return pieces > 0 && vol / pieces < 1;
  });
  if (deep.length) {
    recs.push({
      level: 'suggest',
      title: `Small parts in ${deep.length} deep container(s)`,
      detail: `Tiny parts sink to the bottom of deep tubs (${deep.slice(0, 3).map((c) => c.comp.unitName + ' › ' + c.comp.label).join(', ')}). ` +
        `Add a lift-out tray, decant into shallow trays/takeaway tubs inside, or move them to a small-drawer cabinet.`,
    });
  }

  // 4. Shared compartments need dividers
  const shared = plan.compartments.filter((c) => c.sections.length > 1);
  if (shared.length) {
    const fill = targetFill(plan.settings);
    const dividers = cuttingList(plan.compartments, fill).reduce((t, l) => t + l.count, 0);
    recs.push({
      level: 'action',
      title: `Add ${dividers} divider(s) across ${shared.length} shared compartment(s)`,
      detail: 'Cut-to-fit plastic or foam-board dividers, food tubs or zip bags all work. Keeping related groups in one drawer, separated, is what lets the plan stay compact without losing findability.',
    });
  }

  // 5. Plenty of room
  if (!s.overflowVolume && s.plannedCapacity > s.volume * 3 && plan.settings.granularity !== 'fine') {
    recs.push({
      level: 'info',
      title: 'You have lots of room',
      detail: `Your collection uses ~${pct(s.volume / s.physicalCapacity)} of your storage. Try granularity "Fine" for more separation, or retire a unit.`,
    });
  }

  // 6. Free space in cupboards
  for (const sp of spaces) {
    const inSpace = units.filter((u) => u.spaceId === sp.id);
    const usedVol = inSpace.reduce((t, u) => t + (u.external ? compartmentVolume(u.external) : 0), 0);
    const free = compartmentVolume(sp) - usedVol;
    if (free < 20000) continue;
    const fits = PRESETS.filter((p) => {
      const e = p.external;
      return e.h <= sp.h && ((e.w <= sp.w && e.d <= sp.d) || (e.d <= sp.w && e.w <= sp.d));
    })
      .map((p) => ({ p, n: Math.floor((free * 0.7) / compartmentVolume(p.external)) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => presetCapacity(b.p, plan) * b.n - presetCapacity(a.p, plan) * a.n)
      .slice(0, 3);
    if (fits.length) {
      recs.push({
        level: s.overflowVolume ? 'action' : 'info',
        title: `${sp.name}: ~${L(free)} unused`,
        detail: `Roughly fits ${fits.map((f) => `${f.n}× ${f.p.name}`).join(', or ')} (by volume — check the layout).`,
      });
    }
  }

  // 7. Unknown moulds
  const unknown = parts.filter((p) => !p.known);
  if (unknown.length) {
    recs.push({
      level: 'suggest',
      title: `${unknown.length} part number(s) not recognised`,
      detail: `${unknown.slice(0, 6).map((p) => p.partNum).join(', ')}${unknown.length > 6 ? '…' : ''} — they're filed under "Uncategorised". BrickLink and Rebrickable numbers occasionally differ; Rebrickable's part search resolves BrickLink ids.`,
    });
  }

  recs.push({
    level: 'info',
    title: 'Calibrate the volume estimates',
    detail: 'Estimates come from part sizes, so they can be well off. Once you\'ve filled a compartment, open it here and enter how full it really is. Each one improves the plan the next time you re-plan.',
  });
  return recs;
}
