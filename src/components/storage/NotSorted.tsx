// Parts that aren't in any recorded drawer, by family: where the plan would put each, and ways to put them away now.
import { useState } from 'react';
import { codeWithName } from '../../lib/codes';
import { addToPocket, newPocket, removeFromPocket, unsortedByFamily, type PlacedPocket, type SetupComp, type UnsortedOrder } from '../../lib/setup';
import { familyFor, familyGroup } from '../../lib/taxonomy';
import type { Part, Setup } from '../../lib/types';
import { uid } from '../../state';
import Fold, { type Folds } from '../Fold';
import PartImage from '../PartImage';
import { L, pct } from './format';

/** Parts listed per family */
const SHOWN = 150;
/** How this browser last ordered the list */
const ORDER_STORE = 'brick-stash-unsorted-order';
const rememberedOrder = (): UnsortedOrder => {
  try {
    return localStorage.getItem(ORDER_STORE) === 'pieces' ? 'pieces' : 'volume';
  } catch {
    return 'volume';
  }
};

interface Props {
  unsorted: Part[];
  /** share of the collection, by volume, in recorded drawers */
  volumePlaced: number;
  comps: SetupComp[];
  setup: Setup;
  setSetup: (f: (s: Setup) => Setup) => void;
  pockets: PlacedPocket[];
  /** part → the drawer with nothing recorded that the plan suggests for it */
  homeOf: Map<string, string>;
  scale: number;
  query: string;
  folds: Folds;
  onShowDrawer: (key: string) => void;
}

export default function NotSorted({ unsorted, volumePlaced, comps, setup, setSetup, pockets, homeOf, scale, query, folds, onShowDrawer }: Props) {
  const [order, setOrder] = useState<UnsortedOrder>(rememberedOrder);
  /** one drawer to put many parts in, a click each */
  const [target, setTarget] = useState<{ key: string; pocket: number } | null>(null);
  const [lastPut, setLastPut] = useState<{ partNum: string; name: string; key: string; pocket: number; code: string } | null>(null);
  const families = unsortedByFamily(unsorted, scale, order);
  const pieces = families.reduce((t, f) => t + f.pieces, 0);
  const volume = families.reduce((t, f) => t + f.volume, 0);
  const q = query.trim().toLowerCase();
  const matches = (p: Part) => p.partNum.toLowerCase() === q || p.name.toLowerCase().includes(q);
  const hit = !!q && unsorted.some(matches);
  const byKey = new Map(comps.map((c) => [c.key, c]));
  const noRoom = unsorted.filter((p) => !homeOf.has(p.partNum)).length;

  const chooseOrder = (next: UnsortedOrder) => {
    setOrder(next);
    try {
      localStorage.setItem(ORDER_STORE, next);
    } catch {
      /* only a convenience */
    }
  };
  /** "A1.2: Technic": a pocket's code, with the drawer's name */
  const pocketCode = (c: SetupComp, i: number) => codeWithName((setup.drawers[c.key]?.length ?? 0) > 1 ? `${c.code}.${i + 1}` : c.code, c);
  const describe = (c: SetupComp, i: number) => {
    const p = (setup.drawers[c.key] ?? [])[i];
    const names = pockets.find((x) => x.id === p?.id)?.parts.map((x) => x.part.name) ?? [];
    return `${pocketCode(c, i)}${p?.label ? ` · ${p.label}` : names.length ? ` · ${names.slice(0, 2).join(', ')}${names.length > 2 ? '…' : ''}` : ''}`;
  };
  const putIn = (p: Part, key: string, pocket: number) => {
    const comp = byKey.get(key);
    if (!comp) return;
    const index = Math.max(0, Math.min(pocket, (setup.drawers[key]?.length ?? 1) - 1));
    setSetup((s) => {
      const list = s.drawers[key] ?? [newPocket(uid())];
      return { ...s, drawers: { ...s.drawers, [key]: addToPocket(list, Math.min(index, list.length - 1), [p.partNum]) } };
    });
    setLastPut({ partNum: p.partNum, name: p.name, key, pocket: index, code: pocketCode(comp, index) });
  };
  const undoPut = () => {
    if (!lastPut) return;
    setSetup((s) => (s.drawers[lastPut.key] ? { ...s, drawers: { ...s.drawers, [lastPut.key]: removeFromPocket(s.drawers[lastPut.key], lastPut.pocket, lastPut.partNum) } } : s));
    setLastPut(null);
  };
  /** Where a part could go: pockets already holding its family or group first, roomiest first, then every drawer */
  const placesFor = (p: Part) => {
    const fam = familyFor(p.catId).key;
    const grp = familyGroup(fam);
    const indexOf = (pp: PlacedPocket) => Math.max(0, (setup.drawers[pp.comp.key] ?? []).findIndex((x) => x.id === pp.id));
    const free = (pp: PlacedPocket) => (pp.capacity ? 1 - pp.used / pp.capacity : 0);
    const similar = pockets
      .filter((pp) => pp.parts.length && (pp.family === fam || familyGroup(pp.family) === grp))
      .sort((a, b) => Number(b.family === fam) - Number(a.family === fam) || free(b) - free(a))
      .slice(0, 12)
      .map((pp) => ({ value: `${pp.comp.key}|${indexOf(pp)}`, text: `${pocketCode(pp.comp, indexOf(pp))} — ${pp.label || pp.groupLabel}, ${pct(pp.used / Math.max(1, pp.capacity))} full` }));
    const every = comps.flatMap((c) => {
      const list = setup.drawers[c.key] ?? [];
      if (list.length < 2) return [{ value: `${c.key}|0`, text: `${codeWithName(c.code, c)}${list.length ? '' : ' (nothing recorded)'}` }];
      return list.map((_, i) => ({ value: `${c.key}|${i}`, text: describe(c, i) }));
    });
    return { similar, every };
  };

  const targetComp = target ? byKey.get(target.key) : undefined;
  const targetPockets = targetComp ? setup.drawers[targetComp.key] ?? [] : [];
  const targetIndex = Math.min(target?.pocket ?? 0, Math.max(0, targetPockets.length - 1));
  const targetCode = targetComp ? ((setup.drawers[targetComp.key]?.length ?? 0) > 1 ? `${targetComp.code}.${targetIndex + 1}` : targetComp.code) : '';

  return (
    <Fold
      id="storage:unsorted"
      folds={folds}
      defaultOpen
      force={hit}
      title="Not sorted yet"
      summary={unsorted.length ? `${unsorted.length.toLocaleString()} part types, ${pieces.toLocaleString()} pieces, ${L(volume)} (${pct(1 - volumePlaced)} of the collection)` : 'every part is in a drawer'}
    >
      {unsorted.length > 0 && (
        <>
          <p className="muted small">
            Parts that aren’t in any drawer you’ve recorded. Each shows where the plan would put it, among the drawers you haven’t recorded: click that to see the whole suggestion. Or put a part straight into any drawer.
            {noRoom > 0 && ` ${noRoom} ${noRoom === 1 ? 'has' : 'have'} no room anywhere unrecorded.`}
          </p>
          <div className="unsorted-tools">
            <label className="small">
              Biggest first by{' '}
              <select value={order} onChange={(e) => chooseOrder(e.target.value as UnsortedOrder)}>
                <option value="volume">room they take</option>
                <option value="pieces">number of pieces</option>
              </select>
            </label>
            <label className="small">
              Put many into{' '}
              <select value={target?.key ?? ''} onChange={(e) => setTarget(e.target.value ? { key: e.target.value, pocket: 0 } : null)}>
                <option value="">one drawer… (optional)</option>
                {comps.map((c) => (
                  <option key={c.key} value={c.key}>
                    {codeWithName(c.code, c)}
                    {setup.drawers[c.key]?.length ? '' : ' (nothing recorded)'}
                  </option>
                ))}
              </select>
            </label>
            {targetComp && targetPockets.length > 1 && (
              <select className="small" aria-label="Which pocket" value={targetIndex} onChange={(e) => setTarget({ key: targetComp.key, pocket: Number(e.target.value) })}>
                {targetPockets.map((p, i) => (
                  <option key={p.id} value={i}>
                    {describe(targetComp, i)}
                  </option>
                ))}
              </select>
            )}
            {lastPut && (
              <span className="small" aria-live="polite">
                Added {lastPut.name} to {lastPut.code}.{' '}
                <button className="link small" onClick={undoPut}>
                  Undo
                </button>
              </span>
            )}
          </div>
        </>
      )}
      {families.map((f) => {
        const shown = q ? f.parts.filter(matches) : f.parts;
        if (!shown.length) return null;
        return (
          <Fold key={f.family} id={`storage:unsorted:${f.family}`} folds={folds} inner force={hit} title={<><span className={`swatch fam-${f.family}`} /> {f.label}</>} summary={`${f.parts.length} part types, ${f.pieces.toLocaleString()} pieces, ${L(f.volume)}`}>
            <ul className="unsorted-list">
              {shown.slice(0, SHOWN).map((p) => {
                const home = homeOf.get(p.partNum);
                const homeComp = home ? byKey.get(home) : undefined;
                return (
                  <li key={p.partNum}>
                    <PartImage partNum={p.partNum} size={36} title={p.name} />
                    <span className="unsorted-name">
                      <a href={`https://rebrickable.com/parts/${encodeURIComponent(p.partNum)}/`} target="_blank" rel="noreferrer" title={`${p.partNum} on Rebrickable`}>
                        {p.name}
                      </a>
                      <span className="muted small">
                        {' '}
                        {p.partNum} · × {p.qty.toLocaleString()}
                      </span>
                    </span>
                    <span className="unsorted-actions">
                      {homeComp ? (
                        <button className="link small" title="See everything the plan suggests for that drawer" onClick={() => onShowDrawer(homeComp.key)}>
                          suggested: {codeWithName(homeComp.code, homeComp)}
                        </button>
                      ) : (
                        <span className="muted small">no room unrecorded</span>
                      )}
                      {targetComp && (
                        <button className="ghost small-btn" title={`Put ${p.name} in ${codeWithName(targetCode, targetComp)}`} onClick={() => putIn(p, targetComp.key, targetIndex)}>
                          + {targetCode}
                        </button>
                      )}
                      <PutIn part={p} places={() => placesFor(p)} onPut={(key, pocket) => putIn(p, key, pocket)} />
                    </span>
                  </li>
                );
              })}
            </ul>
            {shown.length > SHOWN && <p className="muted small">The {SHOWN} {order === 'pieces' ? 'with the most pieces' : 'biggest by volume'}, of {shown.length}. Search above to find a particular part.</p>}
          </Fold>
        );
      })}
    </Fold>
  );
}

/** "Put in…": choose the drawer one part goes in. The list is only made when it's opened, as there's one per part. */
function PutIn({ part, places, onPut }: { part: Part; places: () => { similar: { value: string; text: string }[]; every: { value: string; text: string }[] }; onPut: (key: string, pocket: number) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="link small" title={`Choose where ${part.name} goes`} onClick={() => setOpen(true)}>
        Put in…
      </button>
    );
  const { similar, every } = places();
  return (
    <select
      autoFocus
      className="put-select"
      aria-label={`Drawer for ${part.name}`}
      value=""
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      onChange={(e) => {
        const [key, pocket] = e.target.value.split('|');
        setOpen(false);
        if (key) onPut(key, Number(pocket));
      }}
    >
      <option value="">Put {part.name} in…</option>
      {similar.length > 0 && (
        <optgroup label="Beside similar parts">
          {similar.map((o) => (
            <option key={`s-${o.value}`} value={o.value}>
              {o.text}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Any drawer">
        {every.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
