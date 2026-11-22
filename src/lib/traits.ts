// What a part looks like, as a builder sees it, worked out from its name and category alone: its silhouette (flat,
// round, curved, a clip…), its outline (1×2, 2×6+…) and what's on it. These drive the "Looks like" way of sorting,
// which groups parts by appearance rather than by Rebrickable's catalogue headings, so a 1×1 round plate, a 1×1
// round tile and a 1×1 cone can end up together.
//
// The name is read lead first: "Brick Sloped Inverted 45° 2 x 2 [Ovoid Bottom Pin]" is a slope because of what it
// starts with, whatever its notes in brackets say. Features after "with" (a clip, a bar, studs on the side) can still
// make it a clip or a bracket, since that's what you'd see first.
import type { Part } from './types';
import { familyFor, parseSize, registerSortKey } from './taxonomy';

export interface LookGroup {
  key: string;
  label: string;
  /** what a size group of it is called: "Round" → "Round 1×1" */
  noun: string;
  /** the colour group its drawers take, as in GROUP_COLOURS */
  group: string;
  /** size groups are worth having */
  sized: boolean;
}

/** In the order they're laid out: most reached-for first */
export const LOOK_GROUPS: LookGroup[] = [
  { key: 'look-bricks', label: 'Bricks', noun: 'Bricks', group: 'bricks', sized: true },
  { key: 'look-flat', label: 'Flat pieces', noun: 'Flat', group: 'plates', sized: true },
  { key: 'look-rounds', label: 'Rounds & cones', noun: 'Round', group: 'bricks', sized: true },
  { key: 'look-slopes', label: 'Slopes & wedges', noun: 'Slopes', group: 'bricks', sized: true },
  { key: 'look-curves', label: 'Curves', noun: 'Curves', group: 'bricks', sized: true },
  { key: 'look-arches', label: 'Arches', noun: 'Arches', group: 'bricks', sized: true },
  { key: 'look-brackets', label: 'Brackets & side studs', noun: 'Brackets', group: 'plates', sized: true },
  { key: 'look-clips', label: 'Clips, bars & hinges', noun: 'Clips and bars', group: 'plates', sized: true },
  { key: 'look-panels', label: 'Walls, windows & doors', noun: 'Panels', group: 'vehicles', sized: true },
  { key: 'look-technic-beams', label: 'Technic beams & bricks', noun: 'Technic beams', group: 'technic', sized: true },
  { key: 'look-technic-small', label: 'Technic pins, axles & bits', noun: 'Technic', group: 'technic', sized: false },
  { key: 'look-gears', label: 'Gears & turntables', noun: 'Gears', group: 'technic', sized: false },
  { key: 'look-wheels', label: 'Wheels & vehicle parts', noun: 'Wheels', group: 'vehicles', sized: false },
  { key: 'look-large', label: 'Baseplates & big parts', noun: 'Large', group: 'vehicles', sized: false },
  { key: 'look-figures', label: 'Minifigures', noun: 'Minifigures', group: 'figures', sized: false },
  { key: 'look-figure-kit', label: 'Minifig accessories', noun: 'Accessories', group: 'figures', sized: false },
  { key: 'look-organic', label: 'Plants, animals & rock', noun: 'Plants', group: 'figures', sized: false },
  { key: 'look-other-systems', label: 'Duplo & other systems', noun: 'Other', group: 'figures', sized: false },
  { key: 'look-odd', label: 'Odd shapes', noun: 'Odd shapes', group: 'figures', sized: false },
];

const byKey = new Map(LOOK_GROUPS.map((g) => [g.key, g]));
export const lookGroup = (key: string) => byKey.get(key);

/** The words before the first size, note or feature: "Brick Sloped Inverted" from "Brick Sloped Inverted 45° 2 x 2 [...]" */
export function leadOf(name: string): string {
  const m = name.match(/^(.*?)(?=\s*(?:\d|\bwith\b|\[|\(|,|-\s|$))/i);
  return (m?.[1] ?? name).trim();
}

const any = (s: string, words: string) => new RegExp(`\\b(?:${words})`, 'i').test(s);

export type Outline = '1×1' | '1×2' | '1×3–4' | '1×6+' | '2×2' | '2×3–4' | '2×6+' | '3+ wide' | 'Short' | 'Medium' | 'Long' | 'Wedges';
export const OUTLINE_ORDER: Outline[] = ['1×1', '1×2', '1×3–4', '1×6+', '2×2', '2×3–4', '2×6+', '3+ wide', 'Wedges', 'Short', 'Medium', 'Long'];

export interface Traits {
  /** a LOOK_GROUPS key */
  look: string;
  outline?: Outline;
  height?: 'plate' | 'brick' | 'tall';
  top?: 'studded' | 'smooth';
  /** what it connects with, besides ordinary studs */
  connects: string[];
}

const cache = new Map<string, Traits>();

export function traitsOf(part: Pick<Part, 'partNum' | 'name' | 'catId'>): Traits {
  const hit = cache.get(part.partNum + '|' + part.name);
  if (hit) return hit;
  const t = work(part.name, part.catId);
  cache.set(part.partNum + '|' + part.name, t);
  return t;
}

function work(name: string, catId: number | null): Traits {
  const fam = familyFor(catId).key;
  const lead = leadOf(name);
  // Notes in brackets are about the mould ("[Bar-sized Stud Holes]"), not what you see
  const rest = name.slice(lead.length).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ');
  const connects: string[] = [];
  if (any(rest, 'Clips?|Bar|Handles?|Hinge|Ball|Socket|Towball')) connects.push('clip-bar');
  if (any(rest, 'Studs? on (?:Side|\\d Sides?)|Side Studs?|Studs on 2|Studs on 4')) connects.push('side-studs');
  if (any(rest, 'Pin Holes?|Axle Holes?|Pins?\\b|Axle')) connects.push('technic');
  const flatLead = /^(?:Plate|Tile)\b/i.test(lead) || /^Wedge Plate\b/i.test(lead) || /\bJumper\b/i.test(name);
  const brickLead = /^Brick\b/i.test(lead);

  let look: string;
  if (fam === 'minifig') look = 'look-figures';
  else if (fam === 'minifig-acc' || /^Minifig\b/i.test(lead)) look = 'look-figure-kit';
  else if (fam === 'other-systems' || /\bDuplo\b/i.test(name)) look = 'look-other-systems';
  else if (fam === 'large' || /^Baseplate\b/i.test(lead)) look = 'look-large';
  else if (any(lead, 'Gear|Turntable|Worm|Differential')) look = 'look-gears';
  else if (fam === 'technic-struct' || any(lead, 'Technic Beam|Technic Liftarm|Liftarm|Technic Brick|Technic Panel|Technic Frame')) look = 'look-technic-beams';
  else if (fam === 'technic-conn' || (fam === 'technic-mech' && !any(lead, 'Tyre|Tire|Wheel|Rim|Tread'))) look = 'look-technic-small';
  else if (any(lead, 'Tyre|Tire|Wheel|Rim|Hub|Tread')) look = 'look-wheels';
  else if (any(lead, 'Technic|Pin\\b|Axle|Bush')) look = 'look-technic-small';
  else if (fam === 'nature' || any(lead, 'Plant|Leaf|Leaves|Flower|Animal|Creature|Rock|Bone|Tree')) look = 'look-organic';
  else if (any(lead, 'Window|Door|Glass|Windscreen|Fence|Panel|Wall|Shutter|Lattice|Support|Pillar|Column|Container|Cupboard|Frame')) look = 'look-panels';
  else if (any(lead, 'Bracket')) look = 'look-brackets';
  else if (any(lead, 'Hinge|Bar\\b|Bars\\b|Clip|Handle|Ball|Socket|Lever|Arm\\b|Antenna|Ladder')) look = 'look-clips';
  else if ((flatLead || brickLead || /Special/i.test(lead)) && connects.includes('clip-bar')) look = 'look-clips';
  else if ((flatLead || brickLead) && (connects.includes('side-studs') || /\bHeadlight\b/i.test(name))) look = 'look-brackets';
  else if (any(lead, 'Arch')) look = 'look-arches';
  else if (flatLead && any(name, 'Round|Curved|Macaroni|Quarter|Dish|Circle|Radar')) look = 'look-rounds';
  else if (any(lead, 'Brick Curved|Curved|Bow\\b|Macaroni')) look = 'look-curves';
  else if (/^Wedge Plate\b/i.test(lead) || (flatLead && /\bWedge/i.test(lead))) look = 'look-flat';
  else if (any(lead, 'Slope|Sloped|Brick Wedged|Wedge|Roof')) look = 'look-slopes';
  else if (any(lead, 'Round|Cone|Cylinder|Dome|Dish|Hemisphere|Radar')) look = 'look-rounds';
  else if (flatLead || fam === 'plates' || fam === 'plate-special' || fam === 'tiles') look = 'look-flat';
  else if (brickLead || fam === 'bricks' || fam === 'brick-special') look = 'look-bricks';
  else if (fam === 'wheels') look = 'look-wheels';
  else if (fam === 'building') look = 'look-panels';
  else if (fam === 'snot') look = 'look-clips';
  else if (fam === 'slopes') look = 'look-slopes';
  else look = 'look-odd';

  const s = parseSize(name);
  let outline: Outline | undefined;
  if (look === 'look-flat' && /\bWedge|Angled\b/i.test(lead)) outline = 'Wedges';
  else if (s && look === 'look-technic-beams' && s.a <= 1) outline = s.b <= 4 ? 'Short' : s.b <= 8 ? 'Medium' : 'Long';
  else if (s) {
    if (s.a >= 3 && s.b >= 3) outline = '3+ wide';
    else if (s.a <= 1) outline = s.b <= 1 ? '1×1' : s.b <= 2 ? '1×2' : s.b <= 4 ? '1×3–4' : '1×6+';
    else outline = s.b <= 2 ? '2×2' : s.b <= 4 ? '2×3–4' : '2×6+';
  }
  if (!lookGroup(look)!.sized) outline = undefined;

  const flat = look === 'look-flat' || (look === 'look-rounds' && flatLead);
  const height = flat ? 'plate' : s?.c != null ? (s.c < 1 ? 'plate' : s.c <= 1 ? 'brick' : 'tall') : brickLead ? 'brick' : undefined;
  const top = flat ? (/^Tile\b/i.test(lead) && !/\bJumper\b/i.test(name) ? 'smooth' : 'studded') : undefined;
  return { look, ...(outline ? { outline } : {}), ...(height ? { height } : {}), ...(top ? { top } : {}), connects };
}

/** "Round 1×1", "Flat 2×6+", "Short Technic beams" */
export function outlineLabel(look: LookGroup, outline: Outline) {
  if (outline === 'Short' || outline === 'Medium' || outline === 'Long') return `${outline} ${look.noun.toLowerCase()}`;
  if (outline === 'Wedges') return `${look.noun} wedges and angled`;
  return `${look.noun} ${outline}`;
}

// ─── Used for ────────────────────────────────────────────────────────────────
// A rough guess at what a part is mostly for, from its family and name: worth having for builders who keep their
// vehicle parts apart from scenery, say. Parts used everywhere are General building.

export interface UseGroup {
  key: string;
  label: string;
  group: string;
}

export const USE_GROUPS: UseGroup[] = [
  { key: 'use-general', label: 'General building', group: 'bricks' },
  { key: 'use-structure', label: 'Walls, windows & doors', group: 'vehicles' },
  { key: 'use-vehicles', label: 'Vehicles', group: 'vehicles' },
  { key: 'use-technic', label: 'Technic & mechanisms', group: 'technic' },
  { key: 'use-scenery', label: 'Decoration & scenery', group: 'figures' },
  { key: 'use-figures', label: 'Figures', group: 'figures' },
];
const useByKey = new Map(USE_GROUPS.map((g) => [g.key, g]));
export const useGroup = (key: string) => useByKey.get(key);

export function usedFor(part: Pick<Part, 'name' | 'catId'>): string {
  const fam = familyFor(part.catId).key;
  const lead = leadOf(part.name);
  if (fam === 'minifig' || fam === 'minifig-acc') return 'use-figures';
  if (fam.startsWith('technic')) return 'use-technic';
  if (fam === 'wheels' || any(part.name, 'Windscreen|Mudguard|Wheel Arch|Steering|Vehicle|Train|Boat|Hull|Propeller|Exhaust|Car\\b|Tread|Engine|Wing\\b|Tail Fin')) return 'use-vehicles';
  if (fam === 'nature' || fam === 'misc' || any(lead, 'Flower|Plant|Leaf|Fence|Lamp|Flag|Sign|Barrel|Food|Cupboard|Chair|Table|Bed|Box|Container|Treasure|Cup|Bottle|Torch|Rock')) return 'use-scenery';
  if (fam === 'building') return 'use-structure';
  return 'use-general';
}

LOOK_GROUPS.forEach((g, i) => registerSortKey(g.key, g.label, g.group, 100 + i));
USE_GROUPS.forEach((g, i) => registerSortKey(g.key, g.label, g.group, 200 + i));
