// Filing parts in Brick Work by drawer: what Brick Work's storages and stock should look like for the drawers recorded
// here, as a preview before anything is written. Units become cabinets, drawers become drawers (an opened-up unit a
// box), and a drawer of several pockets gets a bin for each. Each loose stock line goes in the place holding its part.
// Lines filed in places the user made in Brick Work, or held in a lot, are left alone unless asked.
import { baseMould } from './collection';
import type { PlacedPocket, SetupComp } from './setup';
import { stem } from './storageList';
import type { Catalog, Setup, StorageUnit } from './types';

export interface BwLine {
  id: string;
  partNum: string | null;
  name: string;
  colour: string;
  qty: number;
  storageId: string | null;
  lotId: string | null;
}

export interface BwStorage {
  id: string;
  name: string;
  type: string | null;
  parentId: string | null;
  /** the Brick Stash key, for a storage Brick Stash made */
  mark: string | null;
}

export interface WantedStorage {
  key: string;
  name: string;
  type: 'Cabinet' | 'Drawer' | 'Box' | 'Bin';
  parentKey: string | null;
  /** what applying would do to it */
  change: 'create' | 'update' | 'none';
}

export interface SyncPlan {
  storages: WantedStorage[];
  moves: { key: string; stockIds: string[] }[];
  lines: number;
  /** lines that would move, by where they are now */
  fromUnstored: number;
  fromOurs: number;
  fromTheirs: number;
  alreadyFiled: number;
  /** left where they are: filed in the user's own Brick Work places (when those aren't included), or in a lot */
  inTheirPlaces: number;
  inLots: number;
  /** lines whose part isn't in any recorded drawer here, or that have no part number */
  notInDrawers: number;
  /** parts in Brick Work's stock that are recorded in more than one pocket: their lines go to the pocket holding most */
  splitParts: number;
  /** storages Brick Stash made that no longer match a drawer: left as they are */
  unused: BwStorage[];
}

const unitKey = (id: string) => `unit:${id}`;
const spaceKey = (c: SetupComp) => `space:${c.key}`;
const pocketKey = (id: string) => `pocket:${id}`;

export function planSync(
  units: StorageUnit[],
  comps: SetupComp[],
  setup: Setup,
  pockets: PlacedPocket[],
  catalog: Catalog | null,
  stock: BwLine[],
  storages: BwStorage[],
  includeTheirPlaces = false,
): SyncPlan {
  const wanted: Omit<WantedStorage, 'change'>[] = [];
  const homeOf = new Map<string, { key: string; used: number }>();
  const splitParts = new Set<string>();
  const unitsWithDrawers = new Set<string>();
  const byUnit = new Map(units.map((u) => [u.id, u]));
  const pocketsIn = new Map<string, PlacedPocket[]>();
  for (const p of pockets) pocketsIn.set(p.comp.key, [...(pocketsIn.get(p.comp.key) ?? []), p]);

  // Drawers first, to know which units are needed; units are added in front afterwards so parents come first
  const drawerStorages: Omit<WantedStorage, 'change'>[] = [];
  for (const c of [...comps].sort((a, b) => a.physOrder - b.physOrder)) {
    const list = setup.drawers[c.key] ?? [];
    const placed = pocketsIn.get(c.key) ?? [];
    if (!placed.some((p) => p.parts.length)) continue;
    const name = (c.sections ? c.unitTitle : c.name)?.trim();
    const space = { key: spaceKey(c), name: name ? `${c.code}: ${name}` : c.code, type: c.sections ? ('Box' as const) : ('Drawer' as const), parentKey: c.sections ? null : unitKey(c.unitId) };
    drawerStorages.push(space);
    if (!c.sections) unitsWithDrawers.add(c.unitId);
    for (const [i, pocket] of list.entries()) {
      const p = placed.find((x) => x.id === pocket.id);
      if (!p?.parts.length) continue;
      let key = space.key;
      if (list.length > 1) {
        key = pocketKey(pocket.id);
        const label = pocket.label?.trim() || (p.parts.length === 1 ? p.parts[0].part.name : p.groupLabel);
        drawerStorages.push({ key, name: `${c.code}.${i + 1}${label ? `: ${label}` : ''}`, type: 'Bin', parentKey: space.key });
      }
      for (const x of p.parts) {
        const had = homeOf.get(x.part.partNum);
        if (had) splitParts.add(x.part.partNum);
        if (!had || x.used > had.used) homeOf.set(x.part.partNum, { key, used: x.used });
      }
    }
  }
  for (const id of unitsWithDrawers) {
    const u = byUnit.get(id);
    if (u) wanted.push({ key: unitKey(id), name: `${u.code ?? '?'}: ${u.title?.trim() || stem(u.name)}`, type: 'Cabinet', parentKey: null });
  }
  wanted.push(...drawerStorages);

  const ours = new Map(storages.filter((s) => s.mark).map((s) => [s.mark!, s]));
  const keyOfId = new Map(storages.filter((s) => s.mark).map((s) => [s.id, s.mark!]));
  const wantedKeys = new Set(wanted.map((w) => w.key));
  const withChange: WantedStorage[] = wanted.map((w) => {
    const have = ours.get(w.key);
    if (!have) return { ...w, change: 'create' };
    const parentNow = have.parentId ? keyOfId.get(have.parentId) ?? have.parentId : null;
    return { ...w, change: have.name !== w.name || have.type !== w.type || parentNow !== w.parentKey ? 'update' : 'none' };
  });

  const plan: SyncPlan = { storages: withChange, moves: [], lines: stock.length, fromUnstored: 0, fromOurs: 0, fromTheirs: 0, alreadyFiled: 0, inTheirPlaces: 0, inLots: 0, notInDrawers: 0, splitParts: 0, unused: storages.filter((s) => s.mark && !wantedKeys.has(s.mark)) };
  const moves = new Map<string, string[]>();
  const usedSplit = new Set<string>();
  for (const line of stock) {
    const part = line.partNum ? baseMould(line.partNum, catalog) : null;
    const home = part ? homeOf.get(part) : undefined;
    if (!home) {
      plan.notInDrawers++;
      continue;
    }
    if (splitParts.has(part!)) usedSplit.add(part!);
    if (line.lotId) {
      plan.inLots++;
      continue;
    }
    const nowKey = line.storageId ? keyOfId.get(line.storageId) ?? null : null;
    if (nowKey === home.key) {
      plan.alreadyFiled++;
      continue;
    }
    const theirs = !!line.storageId && !nowKey;
    if (theirs && !includeTheirPlaces) {
      plan.inTheirPlaces++;
      continue;
    }
    if (!line.storageId) plan.fromUnstored++;
    else if (theirs) plan.fromTheirs++;
    else plan.fromOurs++;
    moves.set(home.key, [...(moves.get(home.key) ?? []), line.id]);
  }
  plan.moves = [...moves].map(([key, stockIds]) => ({ key, stockIds }));
  plan.splitParts = usedSplit.size;
  return plan;
}
