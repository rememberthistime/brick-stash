// Start fresh: a copy of the project with the chosen things cleared, to try first or to keep. Nothing here changes a
// project; the screens decide whether the copy is tried, kept or thrown away.
import { DEFAULT_KEEP_OUT, DEFAULT_SETTINGS, EMPTY_SETUP, type Project } from './types';

export type FreshPart = 'collection' | 'built' | 'drawers' | 'picks' | 'storage' | 'choices' | 'settings';

export interface FreshOption {
  k: FreshPart;
  label: string;
  hint: string;
  /** cleared unless unticked */
  usual: boolean;
  /** how much there is now, in words, or '' for nothing */
  count: (p: Project) => string;
}

const n = (x: number, one: string, many = `${one}s`) => (x ? `${x.toLocaleString()} ${x === 1 ? one : many}` : '');
const recorded = (p: Project) => Object.values(p.setup.drawers).filter((d) => d.length).length;

export const FRESH_OPTIONS: FreshOption[] = [
  { k: 'collection', label: 'Your parts', hint: 'The imported parts list, parts added by hand and your own volume figures', usual: true, count: (p) => [n(p.rows.length, 'row'), n(p.extraParts?.length ?? 0, 'part added by hand', 'parts added by hand')].filter(Boolean).join(', ') },
  { k: 'built', label: 'Sets kept built', hint: 'Sets taken off the collection', usual: true, count: (p) => n(p.excluded.length, 'set') },
  { k: 'drawers', label: 'What’s in your drawers', hint: 'Every recorded drawer, moves still to make and suggestions turned down. Drawer names, uses and units stay.', usual: true, count: (p) => [n(recorded(p), 'drawer recorded', 'drawers recorded'), n(p.setup.accepted.length, 'move to make', 'moves to make')].filter(Boolean).join(', ') },
  { k: 'picks', label: 'Pick lists', hint: 'Sets you’ve been building from your drawers, with their ticks', usual: true, count: (p) => n(p.builds?.length ?? 0, 'pick list') },
  { k: 'storage', label: 'Storage units and spaces', hint: 'The drawers and boxes you own and the cupboards they sit in. Clearing these clears what’s in the drawers too.', usual: false, count: (p) => [n(p.units.length, 'unit'), n(p.spaces.length, 'space')].filter(Boolean).join(', ') },
  { k: 'choices', label: 'Grouping and kept-out choices', hint: 'How parts are grouped, parts put in a group by hand, and what’s kept out of storage', usual: false, count: (p) => [p.sorting ? 'your own grouping' : '', n(Object.keys(p.sorting?.parts ?? {}).length, 'part placed by hand', 'parts placed by hand')].filter(Boolean).join(', ') },
  { k: 'settings', label: 'Plan settings', hint: 'Room to grow, how full drawers get, and the rest of the plan settings', usual: false, count: () => '' },
];

export const usualFresh = () => new Set(FRESH_OPTIONS.filter((o) => o.usual).map((o) => o.k));

/** The project with the chosen things cleared. Colour names and a Rebrickable key kept with the project always stay. */
export function freshProject(p: Project, what: Set<FreshPart>): Project {
  const out: Project = { ...p, setup: { ...p.setup } };
  if (what.has('collection')) Object.assign(out, { rows: [], extraParts: [], volumeOverrides: {} });
  if (what.has('built')) out.excluded = [];
  if (what.has('drawers') || what.has('storage')) out.setup = { ...out.setup, drawers: {}, accepted: [], skipped: [] };
  if (what.has('picks')) out.builds = [];
  if (what.has('storage')) {
    out.units = [];
    out.spaces = [];
    out.setup = { ...EMPTY_SETUP, containers: p.setup.containers };
  }
  if (what.has('choices')) {
    out.sorting = undefined;
    out.keepOut = DEFAULT_KEEP_OUT;
  }
  if (what.has('settings')) out.settings = DEFAULT_SETTINGS;
  return out;
}
