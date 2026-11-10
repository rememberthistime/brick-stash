// Estimates the loose ("bulk") volume one piece occupies in a tub — bounding box × a packing factor.
// Deliberately rough: calibrate with Settings.volumeScale or per-part overrides.
import { parseSize, type ParsedSize } from './taxonomy';

const STUD = 8; // mm pitch
const BRICK_H = 9.6;
const PLATE_H = 3.2;
const STUD_H = 1.7;

const BRICK_LIKE = new Set([11, 3, 5, 6, 20, 37, 8, 16, 23]);
const PLATE_LIKE = new Set([14, 9, 49, 21, 18]);
const TILE_LIKE = new Set([19, 15, 67, 1]);

/** Loose random packing of mixed parts leaves roughly a third to half of a tub as air */
const PACK = 1.5;
/** Long thin parts (axles, long plates, beams) tangle and pack worse */
const PACK_ELONGATED = 2.2;

/** Fallback bulk cm³ per piece when the name gives no dimensions */
const CATEGORY_DEFAULT: Record<number, number> = {
  13: 12, // assembled minifig
  59: 1, 60: 3, 61: 3, 65: 2.5, 70: 1, 71: 1.5, 72: 1, 62: 1.5, 63: 3, 64: 4,
  27: 1.2, 73: 1.5, 56: 1, 68: 3, 69: 2,
  53: 0.5, 54: 0.4, 12: 1.2, 46: 1,
  52: 4, 17: 6, 25: 10, 26: 4, 22: 6, 44: 10, 30: 4, 45: 60,
  29: 8, 36: 15, 35: 15, 47: 30,
  16: 12, 23: 10, 34: 15, 7: 25,
  76: 3, 28: 8, 74: 2, 75: 3, 33: 20,
  38: 3, 31: 5, 39: 3, 24: 4,
  41: 40, 4: 20, 42: 10, 57: 30,
};
const DEFAULT = 2;
const MIN = 0.2;

/** A part's bounding box in mm from its name, and whether the name gave millimetres rather than studs */
function partBox(s: ParsedSize, name: string, catId: number | null): { dims: [number, number, number]; mm: boolean } {
  // Some names give millimetres, not studs: "Storage Case 340 x 255 x 85mm", and every wheel/tyre
  // ("Wheel 8 x 6", "Tyre 81.8 x 50" — diameter × width)
  if (catId === 29) return { dims: [s.b, s.b, s.a], mm: true };
  if (/\d\s*mm\b/i.test(name)) return { dims: [s.a, s.b, s.c ?? 10], mm: true };

  let w = s.a * STUD - 0.2;
  const l = s.b * STUD - 0.2;
  let h: number;

  if (catId === 46) {
    // Technic axle "Axle 5" → parsed a=1,b=5
    w = 4.8;
    h = 4.8;
  } else if (catId === 51 || catId === 55) {
    w = s.a * STUD - 0.8;
    h = /thin/i.test(name) ? 3.6 : 7.2;
  } else if (catId != null && TILE_LIKE.has(catId)) {
    h = (s.c ?? 1) * PLATE_H;
  } else if (catId != null && PLATE_LIKE.has(catId)) {
    h = (s.c ?? 1) * PLATE_H + STUD_H;
  } else if (catId != null && BRICK_LIKE.has(catId)) {
    h = (s.c ?? 1) * BRICK_H + STUD_H;
  } else {
    h = (s.c ?? 1) * BRICK_H;
  }
  return { dims: [round(w), round(l), round(h)], mm: false };
}

/** A part's bounding box in mm, or null if its name gives no size */
export function partSizeMm(name: string, catId: number | null): [number, number, number] | null {
  const s = parseSize(name);
  return s ? partBox(s, name, catId).dims : null;
}

export function estimateUnitVolume(name: string, catId: number | null): number {
  const s = parseSize(name);
  if (!s || catId === 13) return catId != null && CATEGORY_DEFAULT[catId] ? CATEGORY_DEFAULT[catId] : DEFAULT;

  const { dims, mm } = partBox(s, name, catId);
  const bbox = (dims[0] * dims[1] * dims[2]) / 1000;
  if (mm) return Math.max(MIN, round(bbox * PACK));
  const sorted = [...dims].sort((x, y) => x - y);
  // Stick-shaped (long side much longer than the middle one), not merely flat like a 2 x 4 plate
  const pack = sorted[2] / sorted[1] > 4 ? PACK_ELONGATED : PACK;
  return Math.max(MIN, round(bbox * pack));
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Plain bricks, plates and tiles: the parts whose built volume is exactly footprint × height */
const SOLID_HEIGHT: Record<number, number> = { 11: BRICK_H, 14: PLATE_H, 19: PLATE_H };

/**
 * Volume (cm³) a plain brick/plate/tile takes when built into a solid block — studs sunk into the part
 * above, no air. Loose parts in a drawer can't pack tighter, so summed over a collection this is a hard
 * lower bound on the storage it needs. Null for everything else.
 */
export function solidVolume(name: string, catId: number | null): number | null {
  const h = catId == null ? undefined : SOLID_HEIGHT[catId];
  const s = h ? parseSize(name) : null;
  if (!h || !s || s.b > 32) return null;
  return (s.a * STUD * s.b * STUD * (s.c ?? 1) * h) / 1000;
}

export const compartmentVolume =(d: { w: number; d: number; h: number }) => (d.w * d.d * d.h) / 1000; // cm³

export const litres = (cm3: number) => cm3 / 1000;
