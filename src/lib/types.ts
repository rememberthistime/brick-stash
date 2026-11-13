export interface Catalog {
  built: string;
  categories: Record<string, string>;
  /** part_num → [name, Rebrickable part_cat_id] */
  parts: Record<string, [string, number]>;
  /** variant part_num → canonical part_num (mould revisions, alternates, prints) */
  aliases: Record<string, string>;
}

/** One row as imported (part + colour + quantity). Colour is kept for reference only — we store by type. */
export interface InventoryRow {
  partNum: string;
  qty: number;
  colour?: string;
  name?: string;
  /** Spare part from a set inventory — when a set is kept built, its spares are still loose in storage */
  spare?: boolean;
}

/** Parts to take off the collection — typically a set kept built, so its parts aren't in storage */
export interface Exclusion {
  id: string;
  label: string;
  rows: InventoryRow[];
  enabled: boolean;
}

/** A mould with all colours merged — the unit the planner works with. */
export interface Part {
  partNum: string;
  name: string;
  catId: number | null;
  qty: number;
  colours: number;
  /** Estimated loose ("bulk") volume of one piece, cm³ */
  unitVolume: number;
  /** Correction from real measurements, used in place of the manual volume scale */
  scaleFactor?: number;
  /** User override of unitVolume */
  volumeOverride?: number;
  known: boolean;
}

export interface Dims {
  w: number;
  d: number;
  h: number;
}

/** A type of compartment within a unit, repeated `qty` times (e.g. 9 identical drawers). Internal mm. */
export interface CompartmentSpec extends Dims {
  id: string;
  label: string;
  qty: number;
  /** Compartment can't take dividers/bags, so it can only hold one group */
  noDividers?: boolean;
}

export interface StorageUnit {
  id: string;
  name: string;
  /** The letter its compartments are known by: the A in A1. Kept here so it never shifts when storage is added to or reordered. */
  code?: string;
  /** The user's own name for it, such as "Technic cabinet", shown beside its code */
  title?: string;
  /** The user's own names for its drawers, by drawerKey (compartment spec id and number, from 0) */
  drawerNames?: Record<string, string>;
  /** 3 = eye/hand level, 1 = awkward (floor, top shelf, back of cupboard) */
  accessibility: 1 | 2 | 3;
  compartments: CompartmentSpec[];
  /** External footprint, mm — optional, used for space recommendations */
  external?: Dims;
  spaceId?: string;
}

/** A cupboard / shelf / area units live in. Internal mm. */
export interface Space extends Dims {
  id: string;
  name: string;
}

export type Granularity = 'relaxed' | 'balanced' | 'fine';

export interface Settings {
  /** Fraction of a compartment you can realistically fill before it becomes hard to rummage (0–1) */
  practicalFill: number;
  /** Expected growth of the collection (0.25 = 25% more pieces) that the plan should absorb without a rebuild */
  growth: number;
  granularity: Granularity;
  /** Fraction of compartments kept completely empty, spread through the layout, for new categories */
  spareFraction: number;
  /** Max sections (dividers/bags) a shared compartment may be split into */
  maxSections: number;
  /** Multiplier on all volume estimates — calibrate against a container you know */
  volumeScale: number;
}

export const DEFAULT_SETTINGS: Settings = {
  practicalFill: 0.85,
  growth: 0.25,
  granularity: 'balanced',
  spareFraction: 0.1,
  maxSections: 4,
  volumeScale: 1,
};

/** What stays out of the plan because it's stored elsewhere */
export interface KeepOut {
  /** Whole families, by key */
  families: string[];
  /** Keep out bulky one-offs: at least bulkyOver cm³ a piece, and no more than bulkyMaxQty of them */
  bulky: boolean;
  bulkyOver: number;
  bulkyMaxQty: number;
  /** Single parts set against what the rules above would do */
  parts: Record<string, 'out' | 'in'>;
}

export const DEFAULT_KEEP_OUT: KeepOut = { families: [], bulky: false, bulkyOver: 50, bulkyMaxQty: 5, parts: {} };

/** A manual change to the plan: a part, or the whole section it's in, goes with another part or to a compartment */
export interface PartMove {
  part: string;
  whole: boolean;
  to: { part: string } | { comp: string };
}

/** Manual changes the plan was last built around. Changes made since sit on top until the next re-plan. */
export interface PlanBasis {
  /** parts left out of planning */
  out: string[];
  /** part → the part it's stored with */
  together: Record<string, string>;
  /** part → the compartment it was placed in, which is then left for parts placed there */
  pins: Record<string, string>;
  /** volume corrections from real measurements */
  calibration?: Calibration | null;
}

export const EMPTY_BASIS: PlanBasis = { out: [], together: {}, pins: {}, calibration: null };

/** One section of a compartment in a locked plan */
export interface LockedSection {
  parts: string[];
  /** what a section of several parts is called */
  label?: string;
  /** for a part that runs through several compartments: which of how many this is, and the share of the part held here */
  span?: [number, number];
  share?: number;
}

/**
 * The plan as it stood when it was locked: where every part lives. While it's there the planner isn't run, so new
 * parts, storage changes and updates to the planner leave every part where it is.
 */
export interface PlanLock {
  /** when it was locked, ms */
  at: number;
  /** compartment key → what's in it. Compartments left out were empty. */
  comps: Record<string, { sections: LockedSection[]; spareFor?: string }>;
  /** the moves in force when it was locked. They're part of the locked plan, and come back if it's unlocked. */
  movesBefore: PartMove[];
}

/** "This compartment, holding these parts, is really this full" */
export interface Measurement {
  id: string;
  compKey: string;
  /** where it was, in words, in case the compartment later goes */
  where: string;
  /** the compartment's volume, cm³ */
  volume: number;
  /** how full it really is, 0–1 */
  fill: number;
  /** estimated volume in cm³ before any scale, per part and per family */
  parts: Record<string, number>;
  families: Record<string, number>;
}

/** Real volume as a share of the estimate, worked out from measurements */
export interface Calibration {
  /** real volume against the estimate in the drawers measured so far */
  measured: number;
  /** what to assume for parts and families with no measurement of their own */
  overall: number;
  count: number;
  families: Record<string, number>;
  parts: Record<string, number>;
}

/** Part of a drawer as it really is today. An undivided drawer has one pocket. */
export interface SetupPocket {
  id: string;
  /** rough share of the drawer; scaled if a drawer's shares don't add up to 1 */
  share: number;
  /** how full it really is, 0–1, if known */
  fill?: number;
  parts: string[];
  /** a loose container standing in the drawer. Its own size counts, and share doesn't apply. */
  container?: LooseContainer;
  /** holds a mix deliberately, so the review leaves that alone */
  mixed?: boolean;
  /** what its label should say, such as "Fences", instead of listing every part */
  label?: string;
}

/** A small tub or insert that can go in any drawer it fits. Internal mm. */
export interface LooseContainer {
  name: string;
  w: number;
  d: number;
  h: number;
}

/** A unit not used the way it's listed in Storage */
export interface OpenedUnit {
  /** dividers: taken out, leaving one space. containers: lifted out, leaving one space and containers to use elsewhere. */
  how: 'dividers' | 'containers';
  /** size of the emptied unit, if it's been corrected by hand */
  litres?: number;
}

/** A suggested move that's been accepted, with what's needed to undo it */
export interface AcceptedMove {
  id: string;
  text: string;
  before: Record<string, SetupPocket[]>;
}

/** The user's storage as it stands today, separate from anything the planner suggests */
export interface Setup {
  /** compartment key → its pockets. A drawer with no entry hasn't been recorded yet. */
  drawers: Record<string, SetupPocket[]>;
  /** suggestions turned down */
  skipped: string[];
  accepted: AcceptedMove[];
  /** let the real fills here correct volume estimates at the next re-plan */
  useFills: boolean;
  /** unit id → how it's been opened up */
  open: Record<string, OpenedUnit>;
  /** other container sizes the user has added */
  containers: LooseContainer[];
}

export const EMPTY_SETUP: Setup = { drawers: {}, skipped: [], accepted: [], useFills: false, open: {}, containers: [] };

export interface Project {
  version: 1;
  rows: InventoryRow[];
  units: StorageUnit[];
  spaces: Space[];
  settings: Settings;
  volumeOverrides: Record<string, number>;
  /** Kept separate from rows so a fresh full export can be re-imported and the same sets still come off */
  excluded: Exclusion[];
  keepOut: KeepOut;
  moves: PartMove[];
  basis: PlanBasis;
  measurements: Measurement[];
  setup: Setup;
  lock?: PlanLock | null;
}
