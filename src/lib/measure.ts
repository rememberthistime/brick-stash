// Real-world corrections: "this drawer is actually 40% full". Each measurement shows straight away on its
// own compartment, and together they work out how far the volume estimates are off, by part, by family and
// overall. That calibration only reaches the plan as a whole when the user re-plans.
import type { Calibration, Measurement, Part } from './types';
import { countStats, leaves, type Plan, type PlannedCompartment } from './planner';
import { familyFor } from './taxonomy';

/** Estimates can't be trusted to be off by more than this, whatever a typo says */
const MIN_FACTOR = 0.1;
const MAX_FACTOR = 2;
/**
 * How much measured volume (cm³) a family needs before its own figure counts as much as the overall one.
 * With a litre or so measured, a family is mostly going on its own evidence.
 */
const FAMILY_PRIOR = 1000;
/**
 * The same for the collection as a whole: until about this much has been measured, parts nobody has measured
 * stay closer to the existing scale. One drawer of long plates says little about minifig accessories.
 */
const OVERALL_PRIOR = 5000;

const clamp = (f: number) => Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, f));
const round = (f: number) => Math.round(f * 1000) / 1000;
const sum = (r: Record<string, number>) => Object.values(r).reduce((t, v) => t + v, 0);

/** The estimated volume of each part in a compartment, before any scale or calibration */
function rawVolumes(c: PlannedCompartment) {
  const parts: Record<string, number> = {};
  const families: Record<string, number> = {};
  for (const s of c.sections) {
    for (const { part } of leaves(s.node)) {
      if (!part) continue;
      const v = (s.span ? s.pieces : part.qty) * (part.volumeOverride ?? part.unitVolume);
      parts[part.partNum] = (parts[part.partNum] ?? 0) + v;
      const family = familyFor(part.catId).key;
      families[family] = (families[family] ?? 0) + v;
    }
  }
  return { parts, families };
}

const contents = (parts: Record<string, number>) => Object.keys(parts).sort().join();

export function measureCompartment(c: PlannedCompartment, fill: number, id: string): Measurement | null {
  const { parts, families } = rawVolumes(c);
  if (!sum(parts)) return null;
  return { id, compKey: c.comp.key, where: `${c.comp.unitName} › ${c.comp.label}`, volume: c.comp.volume, fill, parts, families };
}

/** Real volume as a share of the raw estimate, for this measurement */
export const measuredFactor = (m: Measurement) => clamp((m.fill * m.volume) / sum(m.parts));

/** Add a measurement, replacing any earlier one of the same compartment holding the same parts */
export const withMeasurement = (all: Measurement[], m: Measurement): Measurement[] => [
  ...all.filter((x) => !(x.compKey === m.compKey && contents(x.parts) === contents(m.parts))),
  m,
];

export function calibrationFrom(measurements: Measurement[], currentScale = 1): Calibration | null {
  if (!measurements.length) return null;
  const add = (map: Map<string, { real: number; raw: number }>, key: string, raw: number, factor: number) => {
    const e = map.get(key) ?? { real: 0, raw: 0 };
    e.real += raw * factor;
    e.raw += raw;
    map.set(key, e);
  };
  const parts = new Map<string, { real: number; raw: number }>();
  const families = new Map<string, { real: number; raw: number }>();
  let real = 0;
  let raw = 0;
  for (const m of measurements) {
    const factor = measuredFactor(m);
    for (const [k, v] of Object.entries(m.parts)) add(parts, k, v, factor);
    for (const [k, v] of Object.entries(m.families)) add(families, k, v, factor);
    real += sum(m.parts) * factor;
    raw += sum(m.parts);
  }
  const overall = clamp((real + OVERALL_PRIOR * currentScale) / (raw + OVERALL_PRIOR));
  const finish = <T,>(map: Map<string, T>, f: (e: T) => number) => Object.fromEntries([...map].map(([k, e]) => [k, round(clamp(f(e)))]));
  return {
    measured: round(clamp(real / raw)),
    overall: round(overall),
    count: measurements.length,
    // Few measurements in a family lean on the overall figure, and more lean on the family's own
    families: finish(families, (e) => (e.real + FAMILY_PRIOR * overall) / (e.raw + FAMILY_PRIOR)),
    parts: finish(parts, (e) => e.real / e.raw),
  };
}

const factorFor = (p: Part, c: Calibration) => c.parts[p.partNum] ?? c.families[familyFor(p.catId).key] ?? c.overall;

/** Parts with their volume corrected: their own measurement if they have one, else their family's, else overall */
export function withCalibration(parts: Part[], c: Calibration | null | undefined): Part[] {
  return c ? parts.map((p) => ({ ...p, scaleFactor: factorFor(p, c) })) : parts;
}

/** What the collection would come to if a calibration were used */
export const calibratedVolume = (parts: Part[], c: Calibration) => parts.reduce((t, p) => t + (p.volumeOverride ?? p.unitVolume * factorFor(p, c)) * p.qty, 0);

/** Show measured fills on the compartments they describe, while those still hold the same parts */
export function applyMeasured(plan: Plan, measurements: Measurement[]): Plan {
  if (!measurements.length) return plan;
  let volume = plan.stats.volume;
  const compartments = plan.compartments.map((c) => {
    const here = contents(rawVolumes(c).parts);
    const m = [...measurements].reverse().find((x) => x.compKey === c.comp.key && contents(x.parts) === here);
    if (!m || !c.sections.length) return c;
    // Sections shrink or grow with the measurement, so pockets and dividers are sized for what's really there
    const ratio = m.fill / (c.fill || 1);
    volume += (m.fill - c.fill) * c.comp.volume;
    return { ...c, fill: m.fill, measured: { estimated: c.fill }, sections: c.sections.map((s) => ({ ...s, volume: s.volume * ratio })) };
  });
  return { ...plan, compartments, stats: { ...plan.stats, ...countStats(compartments, plan.stats.overflowVolume, plan.settings), volume } };
}

/** Whether a measurement still describes what's in its compartment */
export const isCurrent = (m: Measurement, plan: Plan) => plan.compartments.some((c) => c.comp.key === m.compKey && contents(rawVolumes(c).parts) === contents(m.parts));
