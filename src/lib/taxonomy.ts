// Storage taxonomy: Group → Family → Rebrickable category → size bucket → mould.
// Families are ordered roughly by how often builders reach for them, which drives physical layout
// (earlier families get the most accessible compartments). Families in the same group are related
// enough to share a divided compartment; unrelated groups only share when storage is too tight.

export interface Family {
  key: string;
  label: string;
  cats: number[];
  group: string;
}

export const GROUPS: { key: string; label: string }[] = [
  { key: 'bricks', label: 'Bricks & Slopes' },
  { key: 'plates', label: 'Plates & Tiles' },
  { key: 'technic', label: 'Technic' },
  { key: 'vehicles', label: 'Vehicles & Building' },
  { key: 'figures', label: 'Figures, Nature & Misc' },
];

export const FAMILIES: Family[] = [
  { key: 'bricks', label: 'Bricks', cats: [11], group: 'bricks' },
  { key: 'brick-special', label: 'Modified & Round Bricks', cats: [5, 20], group: 'bricks' },
  { key: 'slopes', label: 'Slopes & Curves', cats: [3, 37, 6], group: 'bricks' },
  { key: 'plates', label: 'Plates', cats: [14, 49], group: 'plates' },
  { key: 'plate-special', label: 'Modified Plates & Tiles', cats: [9, 15, 21], group: 'plates' },
  { key: 'tiles', label: 'Tiles', cats: [19, 67], group: 'plates' },
  { key: 'snot', label: 'Hinges, Bars & Clips', cats: [18, 32], group: 'plates' },
  { key: 'technic-struct', label: 'Technic Beams & Panels', cats: [51, 55, 8, 40], group: 'technic' },
  { key: 'technic-conn', label: 'Technic Pins, Axles & Connectors', cats: [53, 46, 12, 54], group: 'technic' },
  { key: 'technic-mech', label: 'Technic Gears & Mechanical', cats: [52, 17, 25, 26, 22, 44, 30, 45], group: 'technic' },
  { key: 'wheels', label: 'Wheels & Vehicle Parts', cats: [29, 36, 35, 47], group: 'vehicles' },
  { key: 'building', label: 'Windows, Doors & Panels', cats: [16, 23, 34, 7], group: 'vehicles' },
  { key: 'large', label: 'Baseplates & Large Parts', cats: [1, 41], group: 'vehicles' },
  { key: 'minifig', label: 'Minifigures', cats: [13, 59, 60, 61, 65, 70, 71, 72, 62, 63, 64], group: 'figures' },
  { key: 'minifig-acc', label: 'Minifig Accessories', cats: [27, 73, 56, 68, 69], group: 'figures' },
  { key: 'nature', label: 'Plants, Animals & Rock', cats: [76, 28, 74, 75, 33], group: 'figures' },
  { key: 'misc', label: 'Decorative & Miscellaneous', cats: [38, 31, 39, 24, 78, 77], group: 'figures' },
  { key: 'other-systems', label: 'Duplo & Other Systems', cats: [4, 42, 43, 48, 50, 57, 66], group: 'figures' },
  { key: 'unknown', label: 'Uncategorised', cats: [], group: 'figures' },
];

const groupOf = new Map(FAMILIES.map((f) => [f.key, f.group]));
/** The group a family belongs to */
export const familyGroup = (familyKey: string) => groupOf.get(familyKey) ?? 'figures';
export const groupLabel = (key: string) => GROUPS.find((g) => g.key === key)?.label ?? key;

const familyByCat = new Map<number, Family>();
for (const f of FAMILIES) for (const c of f.cats) familyByCat.set(c, f);

export const familyFor = (catId: number | null): Family =>
  (catId != null && familyByCat.get(catId)) || FAMILIES[FAMILIES.length - 1];

export const familyOrder = (key: string) => FAMILIES.findIndex((f) => f.key === key);

/** Order of categories within their family, as listed above */
export const catOrder = (catId: number | null) => {
  const f = familyFor(catId);
  const i = catId == null ? -1 : f.cats.indexOf(catId);
  return i < 0 ? 99 : i;
};

const num = (s: string) => {
  // "1 1/3" | "2/3" | "11.5" | "4"
  const parts = s.trim().split(/\s+/);
  return parts.reduce((t, p) => {
    const [a, b] = p.split('/');
    return t + (b ? Number(a) / Number(b) : Number(a));
  }, 0);
};

export interface ParsedSize {
  /** studs (or holes) — short side */
  a: number;
  /** studs (or holes) — long side */
  b: number;
  /** height in bricks (or plates for plate-like parts) if given as a third dimension */
  c?: number;
}

// Height alternatives longest-first so "2/3" isn't read as "2" and "1 1/3" isn't read as "1"
const SIZE_RE = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))?/i;
const LENGTH_RE = /\b(?:Axle|Beam|Liftarm|Bar|Hose|Tube)\s+(\d+(?:\.\d+)?)L?\b/i;

export function parseSize(name: string): ParsedSize | null {
  const m = name.match(SIZE_RE);
  if (m) {
    const x = num(m[1]);
    const y = num(m[2]);
    return { a: Math.min(x, y), b: Math.max(x, y), c: m[3] ? num(m[3]) : undefined };
  }
  const l = name.match(LENGTH_RE);
  if (l) return { a: 1, b: num(l[1]) };
  return null;
}

const TECHNIC_FAMILIES = new Set(['technic-struct', 'technic-conn']);

/** Size bucket used as the level between category and individual mould */
export function sizeBucket(name: string, familyKey: string): string | null {
  const s = parseSize(name);
  if (!s) return null;
  if (TECHNIC_FAMILIES.has(familyKey) && s.a <= 1) {
    if (s.b <= 4) return 'Short (≤4L)';
    if (s.b <= 8) return 'Medium (5–8L)';
    return 'Long (9L+)';
  }
  if (familyKey === 'large') return null;
  if (s.a <= 1) return s.b <= 2 ? '1 × 1–2' : '1 × 3+';
  if (s.a <= 2) return s.b <= 3 ? '2 × 2–3' : '2 × 4+';
  return 'Large (3+ wide)';
}

const BUCKET_ORDER = ['1 × 1–2', '1 × 3+', '2 × 2–3', '2 × 4+', 'Large (3+ wide)', 'Short (≤4L)', 'Medium (5–8L)', 'Long (9L+)'];
export const bucketOrder = (b: string | null) => (b == null ? 99 : BUCKET_ORDER.indexOf(b));
