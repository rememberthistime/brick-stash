// Parts that aren't in any recorded drawer, by family: where the plan would put each, and ways to put them away now.
import { useState } from 'react';
import { codeWithName } from '../../lib/codes';
import type { RecordedHome } from '../../lib/gaps';
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
  comps: SetupComp[];
  setup: Setup;
  setSetup: (f: (s: Setup) => Setup) => void;
  pockets: PlacedPocket[];
  /** part → the drawer with nothing recorded that the plan suggests for it */
  homeOf: Map<string, string>;
  /** part → room for it beside the same sort of parts in a recorded drawer */
  recordedHomes: Map<string, RecordedHome>;
  scale: number;
  query: string;
  folds: Folds;
  onShowDrawer: (key: string) => void;
}

export default function NotSorted({ unsorted, comps, setup, setSetup, pockets, homeOf, recordedHomes, scale, query, folds, onShowDrawer }: Props) {
  const [order, setOrder] = useState<UnsortedOrder>(rememberedOrder);
  /** one drawer to put many parts in, a click each */
  const [target, setTarget] = useState<{ key: string; pocket: number } | null>(null);
  /** what was just put away, to undo: one part, or every part with room in a recorded drawer at once */
  const [lastPut, setLastPut] = useState<{ text: string; items: { partNum: string; key: string; pocket: number }[] } | null>(null);
  const families = unsortedByFamily(unsorted, scale, order);
  const q = query.trim().toLowerCase();
  const matches = (p: Part) => p.partNum.toLowerCase() === q || p.name.toLowerCase().includes(q);
  const hit = !!q && unsorted.some(matches);
  const byKey = new Map(comps.map((c) => [c.key, c]));
  const noRoom = unsorted.filter((p) => !homeOf.has(p.partNum) && !recordedHomes.has(p.partNum)).length;
  const withRoom = unsorted.filter((p) => recordedHomes.has(p.partNum));

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
    setLastPut({ text: `Added ${p.name} to ${pocketCode(comp, index)}.`, items: [{ partNum: p.partNum, key, pocket: index }] });
  };
  /** Every part that has room beside its own sort in a recorded drawer, into that pocket */
  const putAllWithRoom = () => {
    const items = withRoom.map((p) => ({ partNum: p.partNum, key: recordedHomes.get(p.partNum)!.key, pocket: recordedHomes.get(p.partNum)!.pocket }));
    setSetup((s) => {
      const drawers = { ...s.drawers };
      for (const it of items) if (drawers[it.key]) drawers[it.key] = addToPocket(drawers[it.key], it.pocket, [it.partNum]);
      return { ...s, drawers };
    });
    setLastPut({ text: `Added ${items.length} parts to ${new Set(items.map((i) => i.key)).size} drawers.`, items });
  };
  const undoPut = () => {
    if (!lastPut) return;
    setSetup((s) => {
      const drawers = { ...s.drawers };
      for (const it of lastPut.items) if (drawers[it.key]) drawers[it.key] = removeFromPocket(drawers[it.key], it.pocket, it.partNum);
      return { ...s, drawers };
    });
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
    <>
      {!unsorted.length && <div className="card empty-state">Every part is in a recorded drawer.</div>}
      {unsorted.length > 0 && (
        <>
          <p className="muted small page-note">
            <b>Put in</b> adds a part beside the same sort of parts in a recorded drawer. <b>Suggested</b> shows the whole plan for an empty drawer. <b>Put in…</b> chooses any drawer.
            {noRoom > 0 && ` ${noRoom} ${noRoom === 1 ? 'has' : 'have'} no room anywhere.`}
          </p>
          {withRoom.length > 0 && (
            <p className="small">
              <button className="small-btn" onClick={putAllWithRoom}>
                Put all {withRoom.length} beside their own sort
              </button>{' '}
              <span className="muted">into the recorded pockets offered below. It can be undone.</span>
            </p>
          )}
          <div className="unsorted-tools card">
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
                {lastPut.text}{' '}
                <button className="link small" onClick={undoPut}>
                  Undo
                </button>
              </span>
            )}
          </div>
        </>
      )}
      {families.map((f, fi) => {
        const shown = q ? f.parts.filter(matches) : f.parts;
        if (!shown.length) return null;
        return (
          <Fold key={f.family} id={`storage:unsorted:${f.family}`} folds={folds} defaultOpen={fi === 0} force={hit} title={<><span className={`swatch fam-${f.family}`} /> {f.label}</>} summary={`${f.parts.length} part types, ${f.pieces.toLocaleString()} pieces, ${L(f.volume)}`}>
            <ul className="unsorted-list">
              {shown.slice(0, SHOWN).map((p) => {
                const home = homeOf.get(p.partNum);
                const homeComp = home ? byKey.get(home) : undefined;
                const there = recordedHomes.get(p.partNum);
                const thereComp = there ? byKey.get(there.key) : undefined;
                return (
                  <li key={p.partNum}>
                    <PartImage partNum={p.partNum} size={56} title={p.name} />
                    <span className="unsorted-name">
                      <a href={`https://rebrickable.com/parts/${encodeURIComponent(p.partNum)}/`} target="_blank" rel="noreferrer" title={`${p.partNum} on Rebrickable`}>
                        {p.name}
                      </a>
                      <span className="part-meta">
                        <span className="mono">{p.partNum}</span> · <span className="qty">{p.qty.toLocaleString()} pcs</span>
                      </span>
                    </span>
                    <span className="unsorted-actions">
                      {there && thereComp ? (
                        <button className="small-btn" title={`Room beside ${there.sameGroup ? 'the same group of parts' : 'parts of the same family'} in ${codeWithName(there.code, thereComp)}`} onClick={() => putIn(p, there.key, there.pocket)}>
                          Put in {codeWithName(there.code, thereComp)}
                        </button>
                      ) : homeComp ? (
                        <button className="link small" title="See everything the plan suggests for that drawer" onClick={() => onShowDrawer(homeComp.key)}>
                          suggested: {codeWithName(homeComp.code, homeComp)}
                        </button>
                      ) : (
                        <span className="muted small">no room anywhere</span>
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
    </>
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
