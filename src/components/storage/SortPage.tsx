// Put away & move: the parts not in a drawer down one side, your drawers on the other, and the drawer you're working
// on open beside them. Drag a part onto a drawer or a pocket, between pockets, or back to the list to take it out; or
// tick parts and choose Move to…, which works on a phone too. Every step can be undone.
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { RecordedHome } from '../../lib/gaps';
import { homeSkipId } from '../../lib/gaps';
import type { MoveItem, Spot } from '../../lib/move';
import { partMatcher, unsortedByFamily, contentsName, type PlacedPocket, type SetupComp, type UnsortedOrder } from '../../lib/setup';
import { codeWithName, placeName } from '../../lib/codes';
import { stem } from '../../lib/storageList';
import type { Part, Setup } from '../../lib/types';
import PartImage from '../PartImage';
import { L, pct } from './format';
import PlacePicker from './PlacePicker';
import { spotTitle, type PlaceOption } from './places';

/** Parts listed per family */
const SHOWN = 150;
const DRAG_TYPE = 'application/x-brick-stash-parts';
const OPEN_STORE = 'brick-stash-sort-open';
const ORDER_STORE = 'brick-stash-unsorted-order';
const FOLD_STORE = 'brick-stash-sort-folded';
const recall = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const remember = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* only a convenience */
  }
};

/** A part picked or dragged: from the list (no pocket), or from a pocket */
type Pick = MoveItem;
const pickId = (it: Pick) => (it.from ? `${it.from.key}|${it.from.pocket}|${it.part}` : `|${it.part}`);

interface Props {
  unsorted: Part[];
  comps: SetupComp[];
  setup: Setup;
  setSetup: (f: (s: Setup) => Setup) => void;
  pockets: PlacedPocket[];
  placed: Map<string, PlacedPocket[]>;
  /** part → room for it beside the same sort of parts in a recorded drawer */
  recordedHomes: Map<string, RecordedHome>;
  /** part → the drawer with nothing recorded that the plan suggests for it */
  homeOf: Map<string, string>;
  scale: number;
  query: string;
  resolve: (n: string) => string;
  places: (forParts: Part[]) => PlaceOption[];
  onMove: (items: MoveItem[], to: Spot, text?: string) => void;
  onMoveGroups: (groups: { items: MoveItem[]; to: Spot }[], text: string) => void;
  onMovePocket: (from: Spot, to: Spot) => void;
  onTakeOut: (items: Required<MoveItem>[]) => void;
  /** open the full drawer editor: pockets, sizes, fills, names, searching to add */
  onEdit: (key: string) => void;
  /** show what the plan suggests for a drawer with nothing recorded */
  onShowSuggested: (key: string) => void;
  hasSuggestion: (key: string) => boolean;
  /** show the app's suggestions beside your own layout */
  suggest: boolean;
}

export default function SortPage(props: Props) {
  const { unsorted, comps, setup, setSetup, pockets, placed, recordedHomes, homeOf, scale, query, resolve, places, onMove, onMoveGroups, onMovePocket, onTakeOut, onEdit, onShowSuggested, hasSuggestion, suggest } = props;
  const [order, setOrder] = useState<UnsortedOrder>(() => (recall(ORDER_STORE) === 'pieces' ? 'pieces' : 'volume'));
  const [openKey, setOpenKey] = useState<string | null>(() => recall(OPEN_STORE));
  const [activePocket, setActivePocket] = useState(0);
  /** The drawer tiles fold away once a drawer is opened, so its contents sit at the top */
  const [folded, setFoldedState] = useState(() => recall(FOLD_STORE) === '1' && !!recall(OPEN_STORE));
  const setFolded = (f: boolean) => {
    setFoldedState(f);
    remember(FOLD_STORE, f ? '1' : '0');
  };
  const panelRef = useRef<HTMLElement>(null);
  const [picked, setPicked] = useState<Map<string, Pick>>(new Map());
  const [closedFams, setClosedFams] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);

  const byKey = new Map(comps.map((c) => [c.key, c]));
  const byNum = new Map([...unsorted, ...pockets.flatMap((p) => p.parts.map((x) => x.part))].map((p) => [p.partNum, p]));
  const open = (openKey && byKey.get(openKey)) || comps.find((c) => setup.drawers[c.key]?.length) || comps[0];
  const openList = setup.drawers[open.key] ?? [];
  const active = Math.min(activePocket, Math.max(0, openList.length - 1));
  const openDrawer = (key: string) => {
    setOpenKey(key);
    setActivePocket(0);
    remember(OPEN_STORE, key);
  };
  /** Open a drawer from the tiles: fold them away and bring its contents into view */
  const chooseDrawer = (key: string) => {
    openDrawer(key);
    setFolded(true);
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  const title = (key: string, pocket: number) => {
    const c = byKey.get(key);
    return c ? spotTitle(c, pocket, setup, pockets) : key;
  };
  const shortCode = (key: string, pocket: number) => {
    const c = byKey.get(key);
    return c ? ((setup.drawers[key]?.length ?? 0) > 1 ? `${c.code}.${pocket + 1}` : c.code) : key;
  };

  // ─── picking ───
  const isPicked = (it: Pick) => picked.has(pickId(it));
  const toggle = (it: Pick) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(pickId(it))) next.delete(pickId(it));
      else next.set(pickId(it), it);
      return next;
    });
  const pickedList = [...picked.values()];
  const pickedParts = pickedList.map((it) => byNum.get(it.part)).filter((p): p is Part => !!p);
  const clear = () => setPicked(new Map());
  const moveTo = (items: Pick[], to: Spot) => {
    onMove(items, to);
    clear();
  };
  const takeOut = (items: Pick[]) => {
    const inDrawers = items.filter((it): it is Required<MoveItem> => !!it.from);
    if (inDrawers.length) onTakeOut(inDrawers);
    clear();
  };

  // ─── dragging ───
  /** What a drag carries: the part dragged, or every part picked if it's one of them */
  const dragStart = (e: DragEvent, it: Pick | null, all?: Pick[]) => {
    const items = all ?? (it && isPicked(it) ? pickedList : it ? [it] : []);
    if (!items.length) return e.preventDefault();
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(items));
    e.dataTransfer.setData('text/plain', items.map((x) => byNum.get(x.part)?.name ?? x.part).join(', '));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dragItems = (e: DragEvent): Pick[] => {
    try {
      return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as Pick[];
    } catch {
      return [];
    }
  };
  /** Props that make something a place to drop parts */
  const dropTarget = (id: string, onDrop: (items: Pick[]) => void) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== id) setOver(id);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver((o) => (o === id ? null : o));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const items = dragItems(e);
      if (items.length) onDrop(items);
    },
  });

  // ─── the list of parts not in a drawer ───
  const q = query.trim().toLowerCase();
  const matcher = partMatcher(query, resolve);
  const matches = (p: Part) => !q || matcher.test(p) || p.name.toLowerCase().includes(q);
  const families = unsortedByFamily(unsorted, scale, order);
  const withRoom = unsorted.filter((p) => recordedHomes.has(p.partNum));
  const putAllWithRoom = () => {
    const byPocket = new Map<string, { to: Spot; items: MoveItem[] }>();
    for (const p of withRoom) {
      const h = recordedHomes.get(p.partNum)!;
      const id = `${h.key}|${h.pocket}`;
      byPocket.set(id, { to: { key: h.key, pocket: h.pocket }, items: [...(byPocket.get(id)?.items ?? []), { part: p.partNum }] });
    }
    onMoveGroups([...byPocket.values()], `Put ${withRoom.length} ${withRoom.length === 1 ? 'part' : 'parts'} beside their own sort`);
  };
  const turnedDown = setup.skipped.filter((id) => id.startsWith('home:')).length;
  const openTarget: Spot = { key: open.key, pocket: active };

  const tray = (
    <section className={`sort-tray card ${over === 'tray' ? 'drop-over' : ''}`} {...dropTarget('tray', takeOut)} aria-label="Parts not in a drawer">
      <div className="sort-tray-head">
        <h3 className="card-title">Not in a drawer</h3>
        <span className="muted small">{unsorted.length.toLocaleString()} part types</span>
        <label className="small sort-order">
          Biggest first by{' '}
          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value as UnsortedOrder);
              remember(ORDER_STORE, e.target.value);
            }}
          >
            <option value="volume">room</option>
            <option value="pieces">pieces</option>
          </select>
        </label>
      </div>
      {suggest && withRoom.length > 0 && (
        <p className="small sort-tray-note">
          <button className="ghost small-btn" onClick={putAllWithRoom}>
            Put {withRoom.length} beside their own sort
          </button>{' '}
          <span className="muted">where there’s room in your drawers</span>
          {turnedDown > 0 && (
            <>
              {' · '}
              <button className="link small" onClick={() => setSetup((s) => ({ ...s, skipped: s.skipped.filter((id) => !id.startsWith('home:')) }))}>
                bring back {turnedDown} turned down
              </button>
            </>
          )}
        </p>
      )}
      {!unsorted.length && <p className="muted small">Every part is in a drawer. Drag a part here to take it out of its drawer.</p>}
      {unsorted.length > 0 && <p className="muted small sort-tray-note">Drag a part by its row onto a drawer or pocket, or tick several and use Move to…. Drag a pocket’s or drawer’s name to move everything in it. Drag a part here to take it out of its drawer.</p>}
      {families.map((f) => {
        const shown = f.parts.filter(matches);
        if (!shown.length) return null;
        const closed = closedFams.has(f.family) && !q;
        return (
          <div key={f.family} className="sort-family">
            <button className="sort-family-head" aria-expanded={!closed} onClick={() => setClosedFams((s) => (s.has(f.family) ? new Set([...s].filter((x) => x !== f.family)) : new Set([...s, f.family])))}>
              <span className="fold-caret">{closed ? '▸' : '▾'}</span>
              <span className={`swatch fam-${f.family}`} /> <b>{f.label}</b>
              <span className="muted small">
                {shown.length}
                {shown.length < f.parts.length ? ` of ${f.parts.length}` : ''} · {L(f.volume)}
              </span>
            </button>
            {!closed && (
              <ul className="sort-parts">
                {shown.slice(0, SHOWN).map((p) => {
                  const it: Pick = { part: p.partNum };
                  const there = suggest ? recordedHomes.get(p.partNum) : undefined;
                  const home = suggest ? homeOf.get(p.partNum) : undefined;
                  return (
                    <li key={p.partNum} draggable onDragStart={(e) => dragStart(e, it)} className={isPicked(it) ? 'picked' : ''}>
                      <span className="grip" aria-hidden title="Drag to a drawer">⠿</span>
                      <input type="checkbox" className="pick-box" checked={isPicked(it)} onChange={() => toggle(it)} aria-label={`Pick ${p.name}`} />
                      <PartImage partNum={p.partNum} size={48} title={p.name} />
                      <span className="sort-part-name">
                        <a href={`https://rebrickable.com/parts/${encodeURIComponent(p.partNum)}/`} target="_blank" rel="noreferrer" draggable={false} title={`${p.partNum} on Rebrickable`}>
                          {p.name}
                        </a>
                        <span className="part-meta">
                          <span className="mono">{p.partNum}</span> · {p.qty.toLocaleString()} pcs
                        </span>
                        {there ? (
                          <span className="sort-hint small">
                            <button className="link small" title="Room beside the same sort of parts" onClick={() => onMove([it], { key: there.key, pocket: there.pocket })}>
                              → {title(there.key, there.pocket)}
                            </button>
                            <button
                              className="icon small"
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
                        ) : home && byKey.get(home) ? (
                          <span className="sort-hint small">
                            <button className="link small muted-link" title="What the plan suggests for that empty drawer" onClick={() => onShowSuggested(home)}>
                              suggested for {codeWithName(byKey.get(home)!.code, byKey.get(home)!)}
                            </button>
                          </span>
                        ) : null}
                      </span>
                      <span className="sort-part-actions">
                        <button className="ghost small-btn" title={`Put ${p.name} in ${title(open.key, active)}, the drawer open beside the list`} onClick={() => onMove([it], openTarget)}>
                          + {shortCode(open.key, active)}
                        </button>
                        <PlacePicker label="Put in…" title={`Put ${p.name} in…`} options={() => places([p])} onPick={(o) => onMove([it], o)} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {!closed && shown.length > SHOWN && <p className="muted small">The first {SHOWN} of {shown.length}. Search to find a particular part.</p>}
          </div>
        );
      })}
    </section>
  );

  // ─── your drawers, as small tiles to drop on or open ───
  const kinds = new Map<string, SetupComp[]>();
  for (const c of comps) kinds.set(stem(c.unitName), [...(kinds.get(stem(c.unitName)) ?? []), c]);
  const at = comps.findIndex((c) => c.key === open.key);
  const step = (d: number) => comps[(at + d + comps.length) % comps.length];
  const foldedBar = (
    <section
      className="card sort-drawers folded"
      aria-label="Your drawers, folded away"
      onDragOver={(e) => {
        // dragging parts over the folded list opens it, so they can go in any drawer
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setFolded(false);
      }}
    >
      <button className="ghost small-btn" title={`Previous drawer: ${step(-1).code}`} aria-label="Previous drawer" onClick={() => openDrawer(step(-1).key)}>
        ‹
      </button>
      <span className="small">
        Showing <span className="code">{open.code}</span> <span className="muted">of {comps.length} drawers</span>
      </span>
      <button className="ghost small-btn" title={`Next drawer: ${step(1).code}`} aria-label="Next drawer" onClick={() => openDrawer(step(1).key)}>
        ›
      </button>
      <button className="small-btn fold-toggle" onClick={() => setFolded(false)} aria-expanded={false}>
        Choose another drawer ▾
      </button>
    </section>
  );
  const tiles = folded ? (
    foldedBar
  ) : (
    <section className="card sort-drawers" aria-label="Your drawers">
      <div className="sort-drawers-head">
        <span className="small muted">Click a drawer to open it, or drop parts on one to put them in.</span>
        <button className="ghost small-btn fold-toggle" onClick={() => setFolded(true)} aria-expanded>
          Fold away ▴
        </button>
      </div>
      {[...kinds].map(([kind, list]) => (
        <div key={kind} className="sort-unit">
          <div className="sort-unit-name small">
            <b>{kind}</b> <span className="muted">{list[0].code === list[list.length - 1].code ? list[0].code : `${list[0].code}–${list[list.length - 1].code}`}</span>
          </div>
          <div className="sort-tiles">
            {list.map((c) => {
              const ps = placed.get(c.key) ?? [];
              const recorded = !!setup.drawers[c.key]?.length;
              const inUse = ps.filter((p) => p.parts.length);
              const cap = ps.reduce((t, p) => t + p.capacity, 0);
              const used = ps.reduce((t, p) => t + p.used, 0);
              const family = [...inUse].sort((a, b) => b.used - a.used)[0]?.family;
              const pics = inUse.flatMap((p) => p.parts.map((x) => x.part)).sort((a, b) => b.qty - a.qty);
              const id = `tile:${c.key}`;
              const name = placeName(c) || [...new Set(inUse.map((p) => p.label?.trim() || contentsName(p)))].slice(0, 1).join('');
              return (
                <button
                  key={c.key}
                  className={`sort-tile ${recorded ? '' : 'todo'} ${c.key === open.key ? 'open' : ''} ${over === id ? 'drop-over' : ''} ${family ? `fam-border-${family}` : ''}`}
                  title={`${codeWithName(c.code, c)}: ${recorded ? 'click to open it beside the list' : 'nothing recorded yet'}. Drop parts here to put them in.`}
                  onClick={() => chooseDrawer(c.key)}
                  {...dropTarget(id, (items) => moveTo(items, { key: c.key, pocket: c.key === open.key ? active : 0 }))}
                >
                  <span className="sort-tile-head">
                    <span className="code">{c.code}</span>
                    {inUse.length > 0 && <span className="small muted">{pct(used / Math.max(1, cap))}</span>}
                  </span>
                  <span className="sort-tile-pics">
                    {[...new Map(pics.map((p) => [p.partNum, p])).values()].slice(0, 3).map((p) => (
                      <PartImage key={p.partNum} partNum={p.partNum} size={26} title={p.name} />
                    ))}
                  </span>
                  <span className="small sort-tile-name">{name || (recorded ? 'Empty' : 'Not recorded')}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );

  // ─── the drawer open beside the list ───
  const openPlaced = placed.get(open.key) ?? [];
  /** Every part in the open drawer, to drag all of it by the drawer's name */
  const allInOpen: Pick[] = openList.flatMap((sp, i) => sp.parts.map((part) => ({ part, from: { key: open.key, pocket: i } })));
  const panel = (
    <section ref={panelRef} className="card sort-open" aria-label={`Drawer ${open.code}`}>
      <div className="sort-open-head">
        <h3
          className={allInOpen.length ? 'drag-all' : ''}
          draggable={allInOpen.length > 0}
          title={allInOpen.length ? 'Drag the name to move everything in this drawer' : undefined}
          onDragStart={(e) => dragStart(e, null, allInOpen)}
        >
          {allInOpen.length > 0 && <span className="grip" aria-hidden>⠿</span>}
          <span className="code">{open.code}</span> {placeName(open) || open.unitName} <span className="muted small">{open.sections ? 'whole box' : open.label}</span>
        </h3>
        <button className="ghost small-btn" onClick={() => onEdit(open.key)}>
          {openList.length ? 'Edit drawer…' : 'Record this drawer…'}
        </button>
      </div>
      {!openList.length && (
        <div className={`sort-pocket empty-drawer ${over === `pocket:${open.key}|0` ? 'drop-over' : ''}`} {...dropTarget(`pocket:${open.key}|0`, (items) => moveTo(items, { key: open.key, pocket: 0 }))}>
          <p className="muted small">
            Nothing recorded here yet. Drop parts here, or use <b>Record this drawer…</b> to set its pockets.
            {suggest && hasSuggestion(open.key) && (
              <>
                {' '}
                <button className="link small" onClick={() => onShowSuggested(open.key)}>
                  See what the plan suggests
                </button>
              </>
            )}
          </p>
        </div>
      )}
      <div className="sort-pockets">
        {openList.map((sp, i) => {
          const pp = openPlaced.find((x) => x.id === sp.id);
          const id = `pocket:${open.key}|${i}`;
          const here: Spot = { key: open.key, pocket: i };
          const used = pp && pp.capacity ? pp.used / pp.capacity : 0;
          return (
            <div key={sp.id} className={`sort-pocket ${i === active && openList.length > 1 ? 'active' : ''} ${over === id ? 'drop-over' : ''}`} onClick={() => setActivePocket(i)} {...dropTarget(id, (items) => moveTo(items, here))}>
              <div
                className={`sort-pocket-head ${sp.parts.length ? 'drag-all' : ''}`}
                draggable={sp.parts.length > 0}
                title={sp.parts.length ? 'Drag the name to move everything in this pocket' : undefined}
                onDragStart={(e) => dragStart(e, null, sp.parts.map((part) => ({ part, from: here })))}
              >
                {sp.parts.length > 0 && <span className="grip" aria-hidden>⠿</span>}
                <b className="small">{title(open.key, i)}</b>
                <span className="muted small">{pp?.parts.length ? `${sp.fill === undefined ? '~' : ''}${pct(used)} full` : 'empty'}</span>
                {sp.parts.length > 0 && <PlacePicker label="Move all…" title={`Move everything in ${shortCode(open.key, i)} to…`} options={() => places((pp?.parts ?? []).map((x) => x.part))} exclude={here} onPick={(o) => onMovePocket(here, o)} />}
              </div>
              <ul className="sort-pocket-parts">
                {(pp?.parts ?? []).map((x) => {
                  const it: Pick = { part: x.part.partNum, from: here };
                  return (
                    <li key={x.part.partNum} draggable onDragStart={(e) => (e.stopPropagation(), dragStart(e, it))} className={isPicked(it) ? 'picked' : ''}>
                      <span className="grip" aria-hidden title="Drag to another pocket or drawer">⠿</span>
                      <input type="checkbox" className="pick-box" checked={isPicked(it)} onChange={() => toggle(it)} onClick={(e) => e.stopPropagation()} aria-label={`Pick ${x.part.name}`} />
                      <PartImage partNum={x.part.partNum} size={40} title={x.part.name} />
                      <span className="sort-part-name small">
                        {x.part.name}
                        <span className="part-meta">
                          <span className="mono">{x.part.partNum}</span> · {x.part.qty.toLocaleString()} pcs
                        </span>
                      </span>
                      <span className="part-actions">
                        <PlacePicker label="Move…" title={`Move ${x.part.name} to…`} options={() => places([x.part])} exclude={here} onPick={(o) => onMove([it], o)} />
                        <button className="icon" title="Take it out: back to the list" aria-label={`Take out ${x.part.name}`} onClick={(e) => (e.stopPropagation(), onTakeOut([{ part: x.part.partNum, from: here }]))}>
                          ✕
                        </button>
                      </span>
                    </li>
                  );
                })}
                {!sp.parts.length && <li className="muted small sort-drop-hint">Drop parts here</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="sort-page">
      <div className="sort-left">{tray}</div>
      <div className="sort-right">
        {tiles}
        {panel}
      </div>
      {pickedList.length > 0 && (
        <SelectionBar>
          <b>{pickedList.length === 1 ? (pickedParts[0]?.name ?? '1 part') : `${pickedList.length} parts`} picked</b>
          <button className="ghost small-btn" onClick={() => moveTo(pickedList, openTarget)}>
            Into {shortCode(open.key, active)}
          </button>
          <PlacePicker label="Move to…" className="small-btn" title={`Move ${pickedList.length === 1 ? (pickedParts[0]?.name ?? 'it') : `these ${pickedList.length} parts`} to…`} options={() => places(pickedParts)} onPick={(o) => moveTo(pickedList, o)} />
          {pickedList.some((it) => it.from) && (
            <button className="ghost small-btn" onClick={() => takeOut(pickedList)}>
              Take out
            </button>
          )}
          <button className="link small" onClick={clear}>
            Clear
          </button>
        </SelectionBar>
      )}
    </div>
  );
}

function SelectionBar({ children }: { children: ReactNode }) {
  return <div className="selection-bar sort-selection">{children}</div>;
}
