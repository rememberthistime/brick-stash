// Real-world corrections from the fills entered on My storage ("this pocket is about 40% full"). Together they work
// out how far the volume estimates are off, by part, by family and overall, and with "Use these fills" on that
// corrects every part's estimated size.
import type { Calibration, Measurement, Part } from './types';
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

/** Real volume as a share of the raw estimate, for this measurement */
export const measuredFactor = (m: Measurement) => clamp((m.fill * m.volume) / sum(m.parts));

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
