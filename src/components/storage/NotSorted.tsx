// Parts that aren't in any recorded drawer, by family: where the plan would put each, and ways to put them away now.
import { useState } from 'react';
import { codeWithName } from '../../lib/codes';
import { homeSkipId, type RecordedHome } from '../../lib/gaps';
import type { MoveItem, Spot } from '../../lib/move';
import { partMatcher, unsortedByFamily, type PlacedPocket, type SetupComp, type UnsortedOrder } from '../../lib/setup';
import type { Part, Setup } from '../../lib/types';
import Fold, { type Folds } from '../Fold';
import PartImage from '../PartImage';
import { L } from './format';
import PlacePicker from './PlacePicker';
import { spotTitle, type PlaceOption } from './places';

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
  /** a part number as typed, as the collection files it */
  resolve: (n: string) => string;
  folds: Folds;
  onShowDrawer: (key: string) => void;
  /** every place a part could go, those beside similar parts marked */
  places: (forParts: Part[]) => PlaceOption[];
  /** put parts in a pocket, as a step that can be undone */
  onMove: (items: MoveItem[], to: Spot, text?: string) => void;
  /** several moves as one step */
  onMoveGroups: (groups: { items: MoveItem[]; to: Spot }[], text: string) => void;
}

export default function NotSorted({ unsorted, comps, setup, setSetup, pockets, homeOf, recordedHomes, scale, query, resolve, folds, onShowDrawer, places, onMove, onMoveGroups }: Props) {
  const [order, setOrder] = useState<UnsortedOrder>(rememberedOrder);
  /** one drawer to put many parts in, a click each */
  const [target, setTarget] = useState<{ key: string; pocket: number } | null>(null);
  /** parts ticked, to put in one place together */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const families = unsortedByFamily(unsorted, scale, order);
  const q = query.trim().toLowerCase();
  const matcher = partMatcher(query, resolve);
  const matches = (p: Part) => matcher.test(p) || p.name.toLowerCase().includes(q);
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
  const pocketCode = (c: SetupComp, i: number) => spotTitle(c, i, setup, pockets);
  const describe = pocketCode;
  const putIn = (p: Part, key: string, pocket: number) => onMove([{ part: p.partNum }], { key, pocket });
  /** Every part that has room beside its own sort in a recorded drawer, into that pocket: one step, undone as one */
  const putAllWithRoom = () => {
    const byPocket = new Map<string, { to: Spot; parts: string[] }>();
    for (const p of withRoom) {
      const h = recordedHomes.get(p.partNum)!;
      const id = `${h.key}|${h.pocket}`;
      byPocket.set(id, { to: { key: h.key, pocket: h.pocket }, parts: [...(byPocket.get(id)?.parts ?? []), p.partNum] });
    }
    onMoveGroups(
      [...byPocket.values()].map(({ to, parts }) => ({ to, items: parts.map((part) => ({ part })) })),
      `Put ${withRoom.length} ${withRoom.length === 1 ? 'part' : 'parts'} beside their own sort`,
    );
  };
  const pickedParts = unsorted.filter((p) => picked.has(p.partNum));
  const toggle = (num: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  const putPicked = (o: PlaceOption) => {
    onMove(pickedParts.map((p) => ({ part: p.partNum })), o);
    setPicked(new Set());
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
            <b>Put in…</b> chooses any drawer, typing its code or name; tick several parts to put them in one place together. <b>Put in A3.2</b> takes the suggestion of room beside the same sort of parts. Ctrl+Z undoes, a step at a time.
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
            {setup.skipped.some((id) => id.startsWith('home:')) && (
              <button className="link small" onClick={() => setSetup((s) => ({ ...s, skipped: s.skipped.filter((id) => !id.startsWith('home:')) }))}>
                Bring back {setup.skipped.filter((id) => id.startsWith('home:')).length} turned down
              </button>
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
                  <li key={p.partNum} className={picked.has(p.partNum) ? 'picked' : ''}>
                    <input type="checkbox" className="pick-box" checked={picked.has(p.partNum)} onChange={() => toggle(p.partNum)} aria-label={`Pick ${p.name}, to put several in one place`} />
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
                        <span className="put-suggested">
                          <button className="small-btn" title={`Room beside ${there.sameGroup ? 'the same group of parts' : 'parts of the same family'} in ${pocketCode(thereComp, there.pocket)}`} onClick={() => putIn(p, there.key, there.pocket)}>
                            Put in {pocketCode(thereComp, there.pocket)}
                          </button>
                          <button
                            className="icon"
                            title="Not there: suggest somewhere else"
                            aria-label={`Not in ${there.code}`}
                            onClick={() => {
                              const id = setup.drawers[there.key]?.[there.pocket]?.id;
                              if (id) setSetup((s) => ({ ...s, skipped: [...s.skipped, homeSkipId(p.partNum, id)] }));
                            }}
                          >
                            ✕
                          </button>
                        </span>
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
                      <PlacePicker label="Put in…" title={`Put ${p.name} in…`} options={() => places([p])} onPick={(o) => putIn(p, o.key, o.pocket)} />
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="small">
              <button className="link small" onClick={() => setPicked((s) => new Set([...s, ...shown.slice(0, SHOWN).map((p) => p.partNum)]))}>
                Pick all {Math.min(shown.length, SHOWN)} {f.label.toLowerCase()}
              </button>
            </p>
            {shown.length > SHOWN && <p className="muted small">The {SHOWN} {order === 'pieces' ? 'with the most pieces' : 'biggest by volume'}, of {shown.length}. Search above to find a particular part.</p>}
          </Fold>
        );
      })}
      {pickedParts.length > 0 && (
        <div className="selection-bar">
          <b>
            {pickedParts.length === 1 ? pickedParts[0].name : `${pickedParts.length} parts`} picked
          </b>
          <PlacePicker label="Put in…" className="small-btn" title={`Put ${pickedParts.length === 1 ? pickedParts[0].name : `these ${pickedParts.length} parts`} in…`} options={() => places(pickedParts)} onPick={putPicked} />
          <button className="link small" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}
    </>
  );
}
