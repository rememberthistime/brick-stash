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

// ─── Kind, then size ─────────────────────────────────────────────────────────
// The way a builder hunts for a part: what kind of thing it is (windscreens, bricks, clips), then roughly how big
// (small, long or large) or, for the fiddly connecting pieces, what it's on (a plate, a brick, a tile), then its exact
// size. Colour comes last, by eye, inside the smallest group, so it isn't a level of storage.

export interface Kind {
  key: string;
  label: string;
}

/** Kinds in the order they're laid out */
const KIND_LIST: [string, string][] = [
  ['bricks', 'Bricks'],
  ['modified-bricks', 'Modified bricks'],
  ['plates', 'Plates'],
  ['modified-plates', 'Modified plates'],
  ['jumpers', 'Jumpers'],
  ['tiles', 'Tiles'],
  ['modified-tiles', 'Modified tiles'],
  ['slopes', 'Slopes'],
  ['inverted-slopes', 'Inverted slopes'],
  ['curved-slopes', 'Curved slopes'],
  ['inverted-curves', 'Inverted curves'],
  ['wedge-bricks', 'Wedge bricks'],
  ['wedge-plates', 'Wedge plates'],
  ['arches', 'Arches'],
  ['round-bricks', 'Round bricks'],
  ['cones', 'Cones and domes'],
  ['round-plates', 'Round plates'],
  ['round-tiles', 'Round tiles'],
  ['dishes', 'Dishes'],
  ['side-studs', 'Side-stud bricks'],
  ['brackets', 'Brackets'],
  ['clips', 'Clips'],
  ['bars', 'Bars and handles'],
  ['hinges', 'Hinges'],
  ['ball-joints', 'Ball joints'],
  ['turntables', 'Turntables'],
  ['windscreens', 'Windscreens'],
  ['windows', 'Windows and glass'],
  ['doors', 'Doors'],
  ['panels', 'Panels and walls'],
  ['fences', 'Fences and railings'],
  ['ladders', 'Ladders'],
  ['supports', 'Supports and columns'],
  ['containers', 'Boxes and containers'],
  ['technic-beams', 'Technic beams'],
  ['technic-bricks', 'Technic bricks'],
  ['technic-pins', 'Technic pins'],
  ['technic-axles', 'Technic axles'],
  ['technic-bushes', 'Technic bushes'],
  ['technic-connectors', 'Technic connectors'],
  ['gears', 'Gears'],
  ['technic-other', 'Other Technic'],
  ['wheels', 'Wheels'],
  ['tyres', 'Tyres'],
  ['vehicle', 'Other vehicle parts'],
  ['baseplates', 'Baseplates'],
  ['minifig', 'Minifigure parts'],
  ['minifig-acc', 'Minifigure accessories'],
  ['plants', 'Plants'],
  ['animals', 'Animals'],
  ['rocks', 'Rocks'],
  ['other-systems', 'Duplo and other systems'],
  ['other', 'Other parts'],
];
export const KINDS: Kind[] = KIND_LIST.map(([k, label]) => ({ key: `kind-${k}`, label }));
const kindByKey = new Map(KINDS.map((k) => [k.key, k]));
export const kindInfo = (key: string) => kindByKey.get(key);
const KIND_GROUP: Record<string, string> = { bricks: 'bricks', plates: 'plates', technic: 'technic', vehicles: 'vehicles', figures: 'figures' };

/** Kinds sorted by what they're on rather than by size */
const BY_BASE = new Set(['side-studs', 'clips', 'bars', 'hinges', 'ball-joints']);
/** Kinds with no useful size */
const UNSIZED = new Set(['minifig', 'minifig-acc', 'plants', 'animals', 'rocks', 'other-systems', 'other', 'technic-pins', 'technic-bushes', 'technic-connectors', 'technic-other', 'gears', 'wheels', 'tyres', 'turntables']);
/** Kinds whose parts have no size to go by, so they're split by catalogue heading instead (heads, torsos, legs…) */
export const kindByHeading = (key: string) => UNSIZED.has(key.replace(/^kind-/, ''));

function kindKey(name: string, catId: number | null): string {
  const fam = familyFor(catId).key;
  const lead = leadOf(name);
  const rest = name.slice(lead.length).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ');
  if (fam === 'minifig') return 'minifig';
  if (fam === 'minifig-acc' || /^Minifig\b/i.test(lead)) return 'minifig-acc';
  if (fam === 'other-systems' || /\bDuplo\b/i.test(name)) return 'other-systems';
  if (/^Baseplate\b/i.test(lead) || fam === 'large') return 'baseplates';
  if (any(lead, 'Tyre|Tire|Tread')) return 'tyres';
  if (any(lead, 'Gear|Worm|Differential')) return 'gears';
  if (any(lead, 'Turntable')) return 'turntables';
  if (fam.startsWith('technic') || /^Technic\b/i.test(lead)) {
    if (any(lead, 'Beam|Liftarm')) return 'technic-beams';
    if (any(lead, 'Technic Brick')) return 'technic-bricks';
    if (any(lead, 'Axle and Pin Connector|Connector|Pin Joiner|Steering')) return 'technic-connectors';
    if (any(lead, 'Pin')) return 'technic-pins';
    if (any(lead, 'Axle')) return 'technic-axles';
    if (any(lead, 'Bush')) return 'technic-bushes';
    if (any(lead, 'Wheel|Rim|Hub')) return 'wheels';
    return 'technic-other';
  }
  if (any(lead, 'Wheel|Rim|Hub')) return 'wheels';
  if (any(lead, 'Windscreen|Canopy|Cockpit')) return 'windscreens';
  if (any(lead, 'Window|Glass|Shutter|Pane')) return 'windows';
  if (any(lead, 'Door')) return 'doors';
  if (any(lead, 'Fence|Railing|Lattice|Gate')) return 'fences';
  if (any(lead, 'Ladder|Stairs|Staircase')) return 'ladders';
  if (any(lead, 'Support|Pillar|Column|Girder|Crane')) return 'supports';
  if (any(lead, 'Container|Box|Cupboard|Barrel|Chest|Crate|Bucket')) return 'containers';
  if (any(lead, 'Panel|Wall')) return 'panels';
  if (fam === 'nature' || any(lead, 'Plant|Leaf|Leaves|Flower|Stem|Tree|Vine|Grass')) return any(lead, 'Animal|Creature') ? 'animals' : any(lead, 'Rock') ? 'rocks' : 'plants';
  if (any(lead, 'Animal|Creature')) return 'animals';
  if (any(lead, 'Bracket')) return 'brackets';
  if (any(lead, 'Hinge')) return 'hinges';
  if (any(lead, 'Ball|Socket')) return 'ball-joints';
  if (any(lead, 'Bar\\b|Bars\\b|Antenna|Lightsaber|Handle')) return 'bars';
  if (any(lead, 'Clip')) return 'clips';
  const flat = /^(?:Plate|Tile)\b/i.test(lead);
  const brick = /^Brick\b/i.test(lead);
  if (flat || brick || /Special/i.test(lead)) {
    if (any(rest, 'Clips?\\b')) return 'clips';
    if (any(rest, 'Handles?|Bar\\b|Towball')) return 'bars';
    if (any(rest, 'Hinge')) return 'hinges';
    if (any(rest, 'Ball|Socket')) return 'ball-joints';
  }
  if ((flat || brick) && (any(rest, 'Studs? on (?:Side|\\d Sides?)|Side Studs?') || /\bHeadlight\b/i.test(name))) return 'side-studs';
  if (any(lead, 'Arch')) return 'arches';
  if (/\bJumper\b/i.test(name)) return 'jumpers';
  if (any(lead, 'Wedge Plate') || (flat && /\bWedge/i.test(lead))) return 'wedge-plates';
  if (any(lead, 'Brick Curved Inverted|Slope Curved Inverted')) return 'inverted-curves';
  if (any(lead, 'Brick Curved|Slope Curved|Curved')) return 'curved-slopes';
  if (any(lead, 'Brick Sloped Inverted|Slope Inverted')) return 'inverted-slopes';
  if (any(lead, 'Brick Wedged|Wedge')) return 'wedge-bricks';
  if (any(lead, 'Slope|Sloped|Roof')) return 'slopes';
  if (any(lead, 'Dish|Radar')) return 'dishes';
  if (/^Tile\b/i.test(lead) && any(name, 'Round|Quarter|Macaroni|Circle')) return 'round-tiles';
  if (/^Plate\b/i.test(lead) && any(lead, 'Round')) return 'round-plates';
  if (any(lead, 'Brick Round|Cylinder')) return 'round-bricks';
  if (any(lead, 'Cone|Dome|Hemisphere')) return 'cones';
  if (/^Tile\b/i.test(lead)) return /Special/i.test(lead) ? 'modified-tiles' : 'tiles';
  if (/^Plate\b/i.test(lead)) return /Special|Angled/i.test(lead) ? 'modified-plates' : 'plates';
  if (brick) return /Special/i.test(lead) ? 'modified-bricks' : 'bricks';
  if (fam === 'wheels') return 'vehicle';
  if (fam === 'building') return 'panels';
  if (fam === 'bricks') return 'bricks';
  if (fam === 'plates') return 'plates';
  if (fam === 'tiles') return 'tiles';
  if (fam === 'slopes') return 'slopes';
  if (fam === 'snot') return 'clips';
  return 'other';
}

/** The size as it's written: "2×4", "1×6×3" */
function exactSize(name: string): string | null {
  const m = name.match(/(\d+(?:\.\d+)?(?: \d+\/\d+)?|\d+\/\d+)\s*x\s*(\d+(?:\.\d+)?(?: \d+\/\d+)?)(?:\s*x\s*(\d+(?: \d+\/\d+)?|\d+\/\d+|\d+(?:\.\d+)?))?/i);
  if (m) return [m[1], m[2], m[3]].filter(Boolean).join('×');
  const l = name.match(/\b(?:Axle|Beam|Liftarm|Bar|Hose|Tube)\s+(\d+(?:\.\d+)?)L?\b/i);
  return l ? `${l[1]}L` : null;
}

export interface KindPlace {
  kind: Kind;
  /** small, long or large; or what it's on; or short, medium or long for Technic */
  band?: { id: string; label: string; order: number };
  size?: string;
}

const BANDS = { small: ['Small', 0], long: ['Long', 1], large: ['Large', 2], short: ['Short', 0], medium: ['Medium', 1], longT: ['Long', 2], plate: ['On a plate', 0], brick: ['On a brick', 1], tile: ['On a tile', 2], other: ['Other', 3] } as const;

export function kindPlace(part: Pick<Part, 'name' | 'catId'>): KindPlace {
  const k = kindKey(part.name, part.catId);
  const kind = kindInfo(`kind-${k}`)!;
  const s = parseSize(part.name);
  const size = UNSIZED.has(k) ? undefined : exactSize(part.name) ?? undefined;
  const band = (b: keyof typeof BANDS) => ({ id: b, label: BANDS[b][0], order: BANDS[b][1] });
  if (BY_BASE.has(k)) {
    const lead = leadOf(part.name);
    const on = /\bPlate\b/i.test(lead) ? 'plate' : /\bBrick\b/i.test(lead) ? 'brick' : /\bTile\b/i.test(lead) ? 'tile' : 'other';
    return { kind, band: band(on), ...(size ? { size } : {}) };
  }
  if (!s || UNSIZED.has(k)) return { kind, ...(size ? { size } : {}) };
  if (k === 'technic-beams' || k === 'technic-axles') return { kind, band: band(s.b <= 4 ? 'short' : s.b <= 8 ? 'medium' : 'longT'), ...(size ? { size } : {}) };
  const b = s.a <= 2 && s.b >= 6 ? 'long' : (s.a >= 3 && s.b >= 3) || s.a * s.b >= 12 ? 'large' : 'small';
  return { kind, band: band(b), ...(size ? { size } : {}) };
}

KINDS.forEach((k, i) => {
  const g = /plate|tile|jumper|clip|bar|hinge|ball|bracket|side|turntable/.test(k.key) ? 'plates' : /technic|gear/.test(k.key) ? 'technic' : /wind|door|panel|fence|ladder|support|container|wheel|tyre|vehicle|baseplate/.test(k.key) ? 'vehicles' : /minifig|plant|animal|rock|other/.test(k.key) ? 'figures' : 'bricks';
  registerSortKey(k.key, k.label, KIND_GROUP[g], 400 + i);
});
