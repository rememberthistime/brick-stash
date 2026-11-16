// How a cupboard or shelf is being used: which units stand in it, how much of it they take, and roughly what else
// would still fit. Units are taken as boxes by their outside size; one without an outside size can't be counted.
import { stem } from './storageList';
import type { Dims, Space, StorageUnit } from './types';

const volumeOf = (d: Dims) => d.w * d.d * d.h;

/** How many boxes of one size stand in an empty space, in rows and stacks, turned whichever way round fits more */
export function howManyFitIn(space: Dims, box: Dims): number {
  const along = (a: number, b: number) => (b > 0 ? Math.floor(a / b) : 0);
  const upright = along(space.h, box.h);
  return upright * Math.max(along(space.w, box.w) * along(space.d, box.d), along(space.w, box.d) * along(space.d, box.w));
}

export interface SpaceUse {
  space: Space;
  units: StorageUnit[];
  /** units in it without an outside size, so not counted */
  unsized: number;
  /** share of the space the units take, by volume */
  used: number;
  /** roughly how many more of each kind of unit you have would fit */
  more: { name: string; count: number }[];
}

export function spaceUse(space: Space, all: StorageUnit[]): SpaceUse {
  const units = all.filter((u) => u.spaceId === space.id);
  const sized = units.filter((u) => u.external);
  const capacity = volumeOf(space);
  const usedVolume = sized.reduce((t, u) => t + volumeOf(u.external!), 0);
  const used = capacity ? usedVolume / capacity : 0;
  // Every kind of unit you own, once each, by its outside size
  const kinds = new Map<string, { name: string; external: Dims }>();
  for (const u of all) if (u.external) kinds.set(`${stem(u.name)}|${u.external.w}x${u.external.d}x${u.external.h}`, { name: stem(u.name), external: u.external });
  const more = [...kinds.values()]
    .map((k) => {
      // What fits in the empty space, less what the units already there take up, by volume
      const empty = howManyFitIn(space, k.external);
      const taken = Math.ceil(usedVolume / volumeOf(k.external));
      return { name: k.name, count: Math.max(0, empty - taken) };
    })
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count);
  return { space, units, unsized: units.length - sized.length, used, more };
}
