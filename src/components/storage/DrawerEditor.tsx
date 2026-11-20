// Recording one drawer as it really is: its pockets, how full each is, and what's in them.
import { nameTitle, partPlainName } from '../../lib/builderNames';
import PartName from '../PartName';
import { useEffect, useMemo, useRef, useState } from 'react';
import { homeSkipId, type RecordedHome } from '../../lib/gaps';
import { familyFor } from '../../lib/taxonomy';
import { familyLabel, leaves, type TreeNode } from '../../lib/planner';
import { PartStrip } from './Improvements';
import {
  addContainers,
  addToPocket,
  contentsName,
  groupsOf,
  floorLeft,
  howManyFit,
  newPocket,
  removeFromPocket,
  removePocket,
  resizePockets,
  searchParts,
  setPocket,
  unplacedNeighbours,
  type ContainerChoice,
  type PlacedPocket,
  type SetupComp,
  type Suggestion,
} from '../../lib/setup';
import type { LooseContainer, OpenedUnit, Part, SetupPocket } from '../../lib/types';
import { uid } from '../../state';
import NameInput from '../NameInput';
import PartImage from '../PartImage';
import { L, pct } from './format';
import type { MoveItem, Spot } from '../../lib/move';
import PlacePicker from './PlacePicker';
import type { PlaceOption } from './places';

/** Common names for boxes of mixed small parts, offered when labelling one */
const LABEL_IDEAS = ['Fences', 'Minifig accessories', 'Food', 'Animal parts', 'Flags', 'Plants', 'Technic connectors', 'Technic pins', 'Hinges', 'Clips and bars', 'Mixed'];

export default function DrawerEditor({
  comp,
  pockets,
  placed,
  tree,
  whereIs,
  choices,
  canOpen,
  onOpen,
  onPutBack,
  onLitres,
  onNewContainer,
  onChange,
  onForget,
  onPrev,
  onNext,
  onClose,
  onName,
  homes,
  moves,
  resolve,
  onAccept,
  onSkip,
  places,
  drawers,
  onMove,
  onMovePocket,
  onSwap,
  onMoveHere,
  onTakeOut,
}: {
  comp: SetupComp;
  pockets: SetupPocket[] | null;
  placed: PlacedPocket[];
  tree: TreeNode;
  whereIs: Map<string, string[]>;
  /** containers that fit in here */
  choices: ContainerChoice[];
  canOpen: boolean;
  onOpen: (how: OpenedUnit['how']) => void;
  onPutBack: () => void;
  onLitres: (litres: number) => void;
  onNewContainer: (c: LooseContainer) => void;
  onChange: (next: SetupPocket[]) => void;
  onForget: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onName: (name: string) => void;
  /** unsorted parts with room beside their own sort in this drawer */
  homes: (RecordedHome & { part: Part })[];
  /** suggested moves into or out of this drawer */
  moves: Suggestion[];
  /** a part number as typed, as the collection files it */
  resolve: (n: string) => string;
  onAccept: (s: Suggestion) => void;
  /** turn down a suggestion, by its id */
  onSkip: (id: string) => void;
  /** every place parts could go, those beside similar parts marked */
  places: (forParts: Part[]) => PlaceOption[];
  /** every drawer, to swap this one with */
  drawers: () => PlaceOption[];
  onMove: (items: MoveItem[], to: Spot) => void;
  onMovePocket: (from: Spot, to: Spot) => void;
  /** swap this drawer with another, by its key */
  onSwap: (other: string) => void;
  /** move a part here from wherever else it is */
  onMoveHere: (part: string, to: Spot) => void;
  onTakeOut: (part: string, from: Spot) => void;
}) {
  const [first] = useState(uid);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  /** parts ticked here, as "pocket|part", to move together */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const current = pockets ?? [newPocket(first)];
  const activeIndex = Math.min(active, current.length - 1);
  const inDrawers = useMemo(() => new Set(whereIs.keys()), [whereIs]);
  // Ranked by what was in a drawer when the search was typed, so adding a part doesn't reshuffle the list under you
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rankedBy = useMemo(() => inDrawers, [query]);
  const results = useMemo(() => searchParts(tree, query, rankedBy, resolve), [tree, query, rankedBy, resolve]);
  const groupOf = useMemo(() => groupsOf(tree), [tree]);
  const byNum = useMemo(() => new Map(leaves(tree).flatMap((l) => (l.part ? [[l.part.partNum, l.part] as const] : []))), [tree]);
  const nextUp = useMemo(() => (lastAdded && !query ? unplacedNeighbours(tree, lastAdded, inDrawers) : []), [tree, lastAdded, query, inDrawers]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  /** The search stays as typed, so several of what it found can be added one after another */
  const add = (nums: string[], pocket = activeIndex) => {
    if (!nums.length) return;
    onChange(addToPocket(current, pocket, nums));
    setLastAdded(nums[nums.length - 1]);
    searchRef.current?.focus();
  };
  const titleOf = (i: number) => {
    const p = current[i];
    const pp = placed.find((x) => x.id === p?.id);
    return p?.label?.trim() || (pp ? contentsName(pp) : 'empty');
  };
  /** The pocket here that best suits a part: one holding its own group, then its own family */
  const bestPocket = (part: Part): number | null => {
    const group = groupOf.get(part.partNum)?.key;
    const fam = familyFor(part.catId).key;
    const at = (f: (pp: PlacedPocket) => boolean) => current.findIndex((p) => placed.some((pp) => pp.id === p.id && pp.parts.length > 0 && f(pp)));
    const i = group ? at((pp) => pp.parts.some((x) => x.group === group)) : -1;
    const j = i >= 0 ? i : at((pp) => pp.family === fam);
    return j >= 0 ? j : null;
  };
  const inPocket = (num: string) => current.findIndex((p) => p.parts.includes(num));
  // Enter takes the closest single part. A whole group is a bigger step, so that's always a click.
  const addFirst = () => results.parts[0] && add([results.parts[0].partNum]);
  const pickedItems = [...picked].flatMap((id) => {
    const [pocket, part] = [Number(id.slice(0, id.indexOf('|'))), id.slice(id.indexOf('|') + 1)];
    return current[pocket]?.parts.includes(part) ? [{ part, from: { key: comp.key, pocket } }] : [];
  });
  const pickedParts = pickedItems.map((it) => byNum.get(it.part)).filter((p): p is Part => !!p);
  const togglePick = (pocket: number, part: string) =>
    setPicked((s) => {
      const id = `${pocket}|${part}`;
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const plain = current.filter((p) => !p.container);
  const totalShare = plain.reduce((t, p) => t + p.share, 0);
  const hasContainers = plain.length < current.length;
  const left = floorLeft(comp, current);
  // A drawer needs a pocket of some sort, and an ordinary pocket with something in it can't just vanish
  const minPockets = hasContainers && plain.every((p) => !p.parts.length) ? 0 : 1;

  return (
    <div className="move-backdrop" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="move-picker card setup-editor" role="dialog" aria-label={`Drawer ${comp.code}`} onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h3>
            <span className="code">{comp.code}</span> {comp.unitName} › {comp.label}
          </h3>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <label className="setup-editor-name small">
          Name
          <NameInput
            className="setup-editor-name-input"
            value={(comp.sections ? comp.unitTitle : comp.name) ?? ''}
            placeholder={comp.sections ? 'Name this box' : comp.unitTitle ? `Name this drawer (or it shows “${comp.unitTitle}”)` : placed.length === 1 && placed[0].parts.length ? `Name this drawer (now shown as “${contentsName(placed[0])}”)` : 'Name this drawer, e.g. Technic'}
            label={`Name for ${comp.code}`}
            onChange={onName}
          />
        </label>
        {pockets && (
          <div className="drawer-tools small">
            <PlacePicker label="Swap with another drawer…" title={`Swap ${comp.code} with…`} options={drawers} exclude={{ key: comp.key }} onPick={(o) => onSwap(o.key)} />
            <span className="muted">Its pockets and name change places with the other drawer’s.</span>
          </div>
        )}
        {comp.sections ? (
          <div className="setup-layout small">
            <label>
              Holds{' '}
              <input
                type="number"
                min={0.1}
                step={0.1}
                defaultValue={Number((comp.volume / 1000).toFixed(2))}
                aria-label="What the whole box holds, litres"
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v > 0) onLitres(v);
                }}
              />{' '}
              L
            </label>
            <span className="muted">Whole box, without its {comp.sections} sections</span>
            <button className="link small" onClick={onPutBack}>
              Put the sections back
            </button>
          </div>
        ) : (
          <>
            <p className="muted small">
              {comp.w}×{comp.d}×{comp.h} mm · {L(comp.volume)}
            </p>
            {canOpen && (
              <div className="setup-layout small">
                <span className="muted">Not using this box’s sections?</span>
                <button className="ghost small-btn" onClick={() => onOpen('dividers')}>
                  Take the dividers out
                </button>
                <button className="ghost small-btn" onClick={() => onOpen('containers')}>
                  Lift the containers out
                </button>
              </div>
            )}
          </>
        )}



        <div className="setup-count">
          <span>Pockets</span>
          <button className="ghost small-btn" aria-label="Fewer pockets" disabled={plain.length <= minPockets} onClick={() => onChange(resizePockets(current, plain.length - 1, uid))}>
            −
          </button>
          <b>{plain.length}</b>
          <button className="ghost small-btn" aria-label="More pockets" onClick={() => onChange(resizePockets(current, plain.length + 1, uid))}>
            +
          </button>
          {plain.length > 0 && Math.abs(totalShare - 1) > 0.02 && <span className="muted small">Sizes add up to {pct(totalShare)}, and will be scaled to fit.</span>}
        </div>

        <ContainerAdder comp={comp} current={current} choices={choices} onAdd={(c, n) => onChange(addContainers(current, c, n, uid))} onNew={onNewContainer} />
        {hasContainers && (
          <p className={`muted small ${left < 0 ? 'warn-text' : ''}`}>
            {left < 0 ? `These containers need ${pct(1 - left)} of the floor, so they won’t all stand in here.` : plain.length ? `Containers take ${pct(1 - left)} of the floor, and the pockets share the rest.` : `Containers take ${pct(1 - left)} of the floor. Add a pocket if you use the rest.`}
          </p>
        )}

        {current.map((pocket, i) => (
          <PocketRow
            key={`${pocket.id}-${current.length}`}
            pocket={pocket}
            index={i}
            sized={plain.length > 1 && !pocket.container}
            divided={current.length > 1}
            active={i === activeIndex}
            placed={placed.find((p) => p.id === pocket.id)}
            whereIs={whereIs}
            code={comp.code}
            onActivate={() => setActive(i)}
            onChange={(change) => onChange(setPocket(current, i, change))}
            onRemove={(part) => (pockets ? onTakeOut(part, { key: comp.key, pocket: i }) : onChange(removeFromPocket(current, i, part)))}
            picked={picked}
            onPick={(part) => togglePick(i, part)}
            places={places}
            onMove={(part, to) => onMove([{ part, from: { key: comp.key, pocket: i } }], to)}
            onMoveAll={(to) => onMovePocket({ key: comp.key, pocket: i }, to)}
            here={{ key: comp.key, pocket: i }}
            onRemovePocket={pocket.container ? () => onChange(removePocket(current, i, uid)) : undefined}
          />
        ))}

        {(homes.length > 0 || moves.length > 0) && pockets && (
          <Waiting
            homes={homes}
            moves={moves}
            divided={current.length > 1}
            titleOf={titleOf}
            byNum={byNum}
            onAdd={(items) => onChange(items.reduce((list, h) => addToPocket(list, Math.min(h.pocket, list.length - 1), [h.part.partNum]), current))}
            onNotHere={(h) => current[h.pocket] && onSkip(homeSkipId(h.part.partNum, current[h.pocket].id))}
            onAccept={onAccept}
            onSkip={onSkip}
          />
        )}

        {pickedItems.length > 0 && (
          <div className="selection-bar">
            <b>{pickedItems.length === 1 ? (pickedParts[0] ? partPlainName(pickedParts[0]) : '1 part') : `${pickedItems.length} parts`} picked</b>
            <PlacePicker
              label="Move to…"
              className="small-btn"
              title={`Move ${pickedItems.length === 1 ? (pickedParts[0] ? partPlainName(pickedParts[0]) : 'it') : `these ${pickedItems.length} parts`} to…`}
              options={() => places(pickedParts)}
              onPick={(o) => {
                onMove(pickedItems, o);
                setPicked(new Set());
              }}
            />
            <button className="link small" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          </div>
        )}

        <h4>Add to {current.length > 1 ? `pocket ${activeIndex + 1} (${titleOf(activeIndex)})` : 'this drawer'}</h4>
        <div className="setup-search">
          <input
            ref={searchRef}
            type="search"
            className="search keep-search"
            placeholder="Search by name or part number, e.g. plate 2 x 4, 3023, technic pins"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addFirst();
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
        </div>
        <div className="move-list setup-results">
          {results.groups.map((g) => (
            <GroupChoice key={g.id} g={g} unplaced={g.parts.filter((p) => !inDrawers.has(p.partNum)).map((p) => p.partNum)} onAdd={(nums) => add(nums)} />
          ))}
          {results.parts.map((p) => (
            <PartChoice key={p.partNum} part={p} whereIs={whereIs} here={inPocket(p.partNum)} pockets={current.length} active={activeIndex} best={bestPocket(p)} titleOf={titleOf} code={comp.code} onAdd={(i) => add([p.partNum], i)} onMoveHere={() => onMoveHere(p.partNum, { key: comp.key, pocket: activeIndex })} />
          ))}
          {nextUp.length > 0 && <p className="muted small">Next in that group, not in a drawer yet:</p>}
          {nextUp.map((p) => (
            <PartChoice key={p.partNum} part={p} whereIs={whereIs} here={inPocket(p.partNum)} pockets={current.length} active={activeIndex} best={bestPocket(p)} titleOf={titleOf} code={comp.code} onAdd={(i) => add([p.partNum], i)} />
          ))}
          {query && !results.groups.length && !results.parts.length && <p className="muted small">Nothing in your collection matches. It may be kept out of storage, in a set you keep built, or not in your parts list.</p>}
        </div>

        <div className="setup-editor-foot">
          <button className="ghost small-btn" onClick={onPrev}>
            ‹ Previous
          </button>
          <button className="small-btn" onClick={onNext}>
            Next drawer ›
          </button>
          {!pockets && (
            <button className="ghost small-btn" onClick={() => onChange(current)}>
              It’s empty
            </button>
          )}
          {pockets && (
            <button
              className="link small"
              onClick={() => {
                if (confirm(`Forget what you’ve recorded for ${comp.code}? Your other drawers aren’t affected.`)) onForget();
              }}
            >
              Forget this drawer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Stand containers in a drawer: one at a time, as many as fit, or a size of the user's own */
function ContainerAdder({ comp, current, choices, onAdd, onNew }: { comp: SetupComp; current: SetupPocket[]; choices: ContainerChoice[]; onAdd: (c: LooseContainer, count: number) => void; onNew: (c: LooseContainer) => void }) {
  const [picked, setPicked] = useState('');
  const [adding, setAdding] = useState(false);
  const [size, setSize] = useState({ name: '', w: '', d: '', h: '' });
  const choice = choices.find((c) => c.key === picked) ?? choices[0];
  const free = choice && choice.total !== null ? choice.total - choice.used : null;
  // How many more will stand on the floor that's left, and that there are spare
  const fit = choice ? Math.min(Math.floor((howManyFit(choice.container, comp) * Math.max(0, floorLeft(comp, current))) + 0.001), free ?? Infinity) : 0;
  const ready = size.name.trim() && Number(size.w) > 0 && Number(size.d) > 0 && Number(size.h) > 0;
  return (
    <div className="setup-layout small">
      {choices.length > 0 && (
        <>
          <select aria-label="Container" value={choice?.key ?? ''} onChange={(e) => setPicked(e.target.value)}>
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.container.name}, {c.container.w}×{c.container.d}×{c.container.h}
                {c.total !== null ? ` (${Math.max(0, c.total - c.used)} of ${c.total} left)` : ''}
              </option>
            ))}
          </select>
          <button className="ghost small-btn" onClick={() => choice && onAdd(choice.container, 1)}>
            Add one
          </button>
          {fit > 1 && (
            <button className="ghost small-btn" onClick={() => choice && onAdd(choice.container, fit)}>
              Add {fit}, as many as fit
            </button>
          )}
        </>
      )}
      <button className="link small" onClick={() => setAdding(!adding)}>
        {choices.length ? 'Other size…' : 'Add a loose container…'}
      </button>
      {adding && (
        <span className="setup-new-container">
          <input placeholder="Name" aria-label="Container name" value={size.name} onChange={(e) => setSize({ ...size, name: e.target.value })} />
          {(['w', 'd', 'h'] as const).map((k) => (
            <input key={k} type="number" min={1} placeholder={`${k} mm`} aria-label={`Container ${k}, mm`} value={size[k]} onChange={(e) => setSize({ ...size, [k]: e.target.value })} />
          ))}
          <button
            className="ghost small-btn"
            disabled={!ready}
            onClick={() => {
              const c = { name: size.name.trim(), w: Number(size.w), d: Number(size.d), h: Number(size.h) };
              onNew(c);
              onAdd(c, 1);
              setAdding(false);
              setSize({ name: '', w: '', d: '', h: '' });
            }}
          >
            Add
          </button>
        </span>
      )}
    </div>
  );
}

function GroupChoice({ g, unplaced, onAdd }: { g: { id: string; label: string; family: string; parts: Part[] }; unplaced: string[]; onAdd: (nums: string[]) => void }) {
  return (
    <button className="move-choice" disabled={!unplaced.length} onClick={() => onAdd(unplaced)}>
      <span className={`setup-group-mark fam-border-${g.family}`} />
      <span className="move-name">
        <b>{g.label}</b> <span className="muted small">{familyLabel(g.family)}, a group</span>
      </span>
      <span className="muted small nowrap">{unplaced.length ? `add the ${unplaced.length} of ${g.parts.length} not in a drawer` : 'all in a drawer'}</span>
    </button>
  );
}

/** A part the search found: click to add it to the pocket being worked on, or a pocket number to put it in that one */
function PartChoice({
  part,
  whereIs,
  here,
  pockets,
  active,
  best,
  titleOf,
  code,
  onAdd,
  onMoveHere,
}: {
  part: Part;
  whereIs: Map<string, string[]>;
  /** the pocket here it's already in, or -1 */
  here: number;
  pockets: number;
  active: number;
  /** the pocket here holding its own sort, if any */
  best: number | null;
  titleOf: (i: number) => string;
  code: string;
  onAdd: (pocket: number) => void;
  /** take it out of the other drawers it's in, and put it here */
  onMoveHere?: () => void;
}) {
  const elsewhere = [...new Set(whereIs.get(part.partNum) ?? [])].filter((c) => c !== code);
  const suggest = best !== null && best !== active && here < 0 ? best : null;
  return (
    <div className={`part-choice ${here >= 0 ? 'added' : ''}`}>
      <button className="part-choice-main" onClick={() => onAdd(active)} title={pockets > 1 ? `Add to pocket ${active + 1}` : 'Add to this drawer'}>
        <PartImage partNum={part.partNum} size={44} title={nameTitle(part)} />
        <span className="move-name">
          <PartName part={part} />
          <span className="part-meta">
            <span className="mono">{part.partNum}</span> · {part.qty.toLocaleString()} pcs
            {here >= 0 && <b className="good-text"> · ✓ in {pockets > 1 ? `pocket ${here + 1}` : 'this drawer'}</b>}
            {elsewhere.length > 0 && ` · also in ${elsewhere.slice(0, 2).join(', ')}`}
          </span>
        </span>
        <span className="part-choice-add">{here >= 0 ? '' : pockets > 1 ? `+ ${active + 1}` : '+ Add'}</span>
      </button>
      {onMoveHere && here < 0 && elsewhere.length > 0 && (
        <span className="pocket-chips">
          <button className="small-btn chip-best" title={`Take it out of ${elsewhere.join(', ')} and put it ${pockets > 1 ? `in pocket ${active + 1}` : 'here'}`} onClick={onMoveHere}>
            Move here from {elsewhere.slice(0, 2).join(', ')}
          </button>
        </span>
      )}
      {pockets > 1 && (
        <span className="pocket-chips" aria-label={`Other pockets for ${partPlainName(part)}`}>
          {suggest !== null && (
            <button className="small-btn chip-best" title={`Add to pocket ${suggest + 1}, which holds the same sort of parts`} onClick={() => onAdd(suggest)}>
              + {suggest + 1}: {titleOf(suggest)}
            </button>
          )}
          {pockets <= 12 &&
            Array.from({ length: pockets }, (_, i) => i)
              .filter((i) => i !== active && i !== suggest)
              .map((i) => (
                <button key={i} className={`ghost chip ${i === here ? 'on' : ''}`} title={`Add to pocket ${i + 1}: ${titleOf(i)}`} onClick={() => onAdd(i)}>
                  {i + 1}
                </button>
              ))}
        </span>
      )}
    </div>
  );
}

const MOVES_SHOWN = 3;

/** A part's name, opening its Rebrickable page (pictures from every side, sets it's in) in a new tab */
function PartLink({ part }: { part: Part }) {
  return (
    <a className="part-link" href={`https://rebrickable.com/parts/${encodeURIComponent(part.partNum)}/`} target="_blank" rel="noreferrer" title={`${part.partNum} on Rebrickable`} onClick={(e) => e.stopPropagation()}>
      <PartName part={part} />
    </a>
  );
}

/** What's waiting for this drawer: parts not in a drawer that suit a pocket here, and suggested moves */
function Waiting({
  homes,
  moves,
  divided,
  titleOf,
  byNum,
  onAdd,
  onNotHere,
  onAccept,
  onSkip,
}: {
  homes: (RecordedHome & { part: Part })[];
  moves: Suggestion[];
  divided: boolean;
  titleOf: (i: number) => string;
  byNum: Map<string, Part>;
  onAdd: (items: (RecordedHome & { part: Part })[]) => void;
  onNotHere: (h: RecordedHome & { part: Part }) => void;
  onAccept: (s: Suggestion) => void;
  onSkip: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const SHOWN = 12;
  return (
    <section className="waiting">
      <button className="waiting-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fold-caret">{open ? '▾' : '▸'}</span>
        <b>Suggested for this drawer</b>
        <span className="muted small">
          {[homes.length ? `${homes.length} ${homes.length === 1 ? 'part' : 'parts'} to put in` : '', moves.length ? (moves.length === 1 ? '1 move' : `${Math.min(moves.length, MOVES_SHOWN)} best moves`) : ''].filter(Boolean).join(' · ')}
        </span>
      </button>
      {open && (
        <>
          {homes.length > 0 && (
            <>
              <div className="waiting-sub">
                <span className="muted small">Not in a drawer yet, with room here beside the same sort of parts.</span>
                {homes.length > 1 && (
                  <button className="small-btn" onClick={() => onAdd(homes)}>
                    Add all {homes.length}
                  </button>
                )}
              </div>
              <ul className="waiting-list">
                {homes.slice(0, SHOWN).map((h) => (
                  <li key={h.part.partNum}>
                    <PartImage partNum={h.part.partNum} size={48} title={nameTitle(h.part)} />
                    <span className="move-name">
                      <PartLink part={h.part} />
                      <span className="part-meta">
                        <span className="mono">{h.part.partNum}</span> · {h.part.qty.toLocaleString()} pcs{divided ? ` · pocket ${h.pocket + 1}: ${titleOf(h.pocket)}` : ''}
                      </span>
                    </span>
                    <button className="small-btn accept-btn" title="Put it here" onClick={() => onAdd([h])}>
                      Add
                    </button>
                    <button className="icon" title="Not here: don't suggest this pocket for it again" aria-label={`Not here: ${partPlainName(h.part)}`} onClick={() => onNotHere(h)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {homes.length > SHOWN && <p className="muted small">and {homes.length - SHOWN} more, added with Add all.</p>}
            </>
          )}
          {moves.slice(0, MOVES_SHOWN).map((m) => (
            <div key={m.id} className="waiting-move">
              <span className="move-name">
                <b className="small">{m.title}</b>
                <span className="muted small">
                  {' '}
                  {m.why}
                  {m.estimated && <span className="warn-text"> Based on an estimated fill.</span>}
                </span>
                <PartStrip nums={m.moves.map((x) => x.part)} byNum={byNum} max={4} />
              </span>
              <button className="small-btn accept-btn" onClick={() => onAccept(m)}>
                Accept
              </button>
              <button className="ghost small-btn" onClick={() => onSkip(m.id)}>
                Skip
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

const QUICK_FILLS = [25, 50, 75, 100];

function PocketRow({
  pocket,
  index,
  sized,
  divided,
  active,
  placed,
  whereIs,
  code,
  onActivate,
  onChange,
  onRemove,
  onRemovePocket,
  picked,
  onPick,
  places,
  onMove,
  onMoveAll,
  here,
}: {
  pocket: SetupPocket;
  index: number;
  /** its size is a share of the drawer */
  sized: boolean;
  divided: boolean;
  active: boolean;
  placed?: PlacedPocket;
  whereIs: Map<string, string[]>;
  code: string;
  onActivate: () => void;
  onChange: (change: Partial<SetupPocket>) => void;
  onRemove: (part: string) => void;
  onRemovePocket?: () => void;
  picked: Set<string>;
  onPick: (part: string) => void;
  places: (forParts: Part[]) => PlaceOption[];
  onMove: (part: string, to: Spot) => void;
  onMoveAll: (to: Spot) => void;
  here: Spot;
}) {
  const fillPercent = pocket.fill === undefined ? '' : String(Math.round(pocket.fill * 100));
  const estimated = placed && placed.parts.length ? placed.estimate / placed.capacity : null;
  // In a drawer of several pockets only the one being worked on is opened out, so the list stays short enough to
  // see the search box below it. The rest are a line each: click one to work on it.
  if (divided && !active) {
    const names = (placed?.parts ?? []).map((x) => partPlainName(x.part));
    return (
      <button className="setup-pocket folded" aria-expanded={false} onClick={onActivate}>
        <span className="fold-caret">▸</span>
        <b>Pocket {index + 1}</b>
        <span className={pocket.label ? '' : 'muted'}>{pocket.label || (placed ? contentsName(placed) : '')}</span>
        {pocket.container && <span className="muted small">{pocket.container.name}</span>}
        <span className="muted small setup-pocket-summary">
          {pocket.parts.length ? `${pocket.parts.length} ${pocket.parts.length === 1 ? 'part' : 'parts'}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` : 'nothing yet'}
        </span>
        <span className="muted small nowrap">{pocket.fill === undefined ? '' : `${fillPercent}% full`}</span>
      </button>
    );
  }
  return (
    <div className={`setup-pocket ${active ? 'active' : ''}`} onClick={onActivate}>
      <div className="setup-pocket-head">
        {divided && (
          <b>
            <span className="fold-caret">▾</span> Pocket {index + 1}
          </b>
        )}
        {pocket.container && (
          <span className="small">
            {pocket.container.name} <span className="muted">{pocket.container.w}×{pocket.container.d}×{pocket.container.h}</span>
          </span>
        )}
        {sized && (
          <label className="small">
            <input
              type="number"
              min={1}
              max={100}
              defaultValue={Math.round(pocket.share * 100)}
              aria-label={`Size of pocket ${index + 1}, % of the drawer`}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0) onChange({ share: v / 100 });
              }}
            />{' '}
            % of drawer
          </label>
        )}
        <label className="small">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="?"
            value={fillPercent}
            aria-label={`How full${divided ? ` pocket ${index + 1}` : ''} is, %`}
            onChange={(e) => onChange({ fill: e.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(e.target.value))) / 100 })}
          />{' '}
          % full
        </label>
        <span className="setup-quick">
          {QUICK_FILLS.map((v) => (
            <button key={v} className={`ghost small-btn ${fillPercent === String(v) ? 'on' : ''}`} onClick={() => onChange({ fill: v / 100 })}>
              {v}
            </button>
          ))}
        </span>
        {estimated !== null && <span className={`muted small ${estimated > 1 ? 'warn-text' : ''}`}>estimate {pct(estimated)}</span>}
        <label className="small setup-mixed">
          <input type="checkbox" checked={!!pocket.mixed} onChange={(e) => onChange({ mixed: e.target.checked || undefined })} /> Mixed on purpose
        </label>
        {divided && (
        <input
          className="setup-label-input"
          list={`${pocket.id}-names`}
          placeholder={placed?.parts.length ? `Name it (now “${contentsName(placed)}”)` : 'Name it, e.g. Fences'}
          aria-label={`Name for pocket ${index + 1}`}
          value={pocket.label ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
        />
        )}
        {divided && (
          <datalist id={`${pocket.id}-names`}>
            {LABEL_IDEAS.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
        {pocket.parts.length > 0 && (
          <PlacePicker
            label="Move everything…"
            title={`Move everything in ${divided ? `pocket ${index + 1}` : code} to…`}
            options={() => places((placed?.parts ?? []).map((x) => x.part))}
            exclude={here}
            onPick={onMoveAll}
          />
        )}
        {onRemovePocket && (
          <button className="link small" onClick={onRemovePocket}>
            Remove
          </button>
        )}
      </div>
      {pocket.parts.length > 0 ? (
        <ul className="setup-parts">
          {(placed?.parts ?? []).map((x) => {
            const elsewhere = [...new Set(whereIs.get(x.part.partNum) ?? [])].filter((c) => c !== code);
            return (
              <li key={x.part.partNum}>
                <input type="checkbox" className="pick-box" checked={picked.has(`${index}|${x.part.partNum}`)} onChange={() => onPick(x.part.partNum)} onClick={(e) => e.stopPropagation()} aria-label={`Pick ${partPlainName(x.part)}, to move several together`} />
                <PartImage partNum={x.part.partNum} size={40} title={nameTitle(x.part)} />
                <span>
                  <PartLink part={x.part} />
                  {elsewhere.length > 0 && <span className="muted small"> · also {elsewhere.slice(0, 2).join(', ')}</span>}
                  {x.tooBig && <span className="warn-text small"> · looks too big for this</span>}
                </span>
                <span className="part-actions">
                  <PlacePicker label="Move…" title={`Move ${partPlainName(x.part)} to…`} options={() => places([x.part])} exclude={here} onPick={(o) => onMove(x.part.partNum, o)} />
                  <button className="icon" title="Take it out: it goes back to Put away & move" aria-label={`Take out ${partPlainName(x.part)}`} onClick={() => onRemove(x.part.partNum)}>
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">Nothing yet. {active ? 'Search below to add parts.' : 'Click here, then search below.'}</p>
      )}
    </div>
  );
}

