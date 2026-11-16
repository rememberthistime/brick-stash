// Recording one drawer as it really is: its pockets, how full each is, and what's in them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { familyLabel, type TreeNode } from '../../lib/planner';
import {
  addContainers,
  addToPocket,
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
} from '../../lib/setup';
import type { LooseContainer, OpenedUnit, Part, SetupPocket } from '../../lib/types';
import { uid } from '../../state';
import NameInput from '../NameInput';
import PartImage from '../PartImage';
import { L, pct } from './format';

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
}) {
  const [first] = useState(uid);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = pockets ?? [newPocket(first)];
  const activeIndex = Math.min(active, current.length - 1);
  const inDrawers = useMemo(() => new Set(whereIs.keys()), [whereIs]);
  const results = useMemo(() => searchParts(tree, query, inDrawers), [tree, query, inDrawers]);
  const nextUp = useMemo(() => (lastAdded && !query ? unplacedNeighbours(tree, lastAdded, inDrawers) : []), [tree, lastAdded, query, inDrawers]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const add = (nums: string[]) => {
    if (!nums.length) return;
    onChange(addToPocket(current, activeIndex, nums));
    setLastAdded(nums[nums.length - 1]);
    setQuery('');
    searchRef.current?.focus();
  };
  // Enter takes the closest single part. A whole group is a bigger step, so that's always a click.
  const addFirst = () => results.parts[0] && add([results.parts[0].partNum]);
  const plain = current.filter((p) => !p.container);
  const totalShare = plain.reduce((t, p) => t + p.share, 0);
  const hasContainers = plain.length < current.length;
  const left = floorLeft(comp, current);
  // A drawer needs a pocket of some sort, and an ordinary pocket with something in it can't just vanish
  const minPockets = hasContainers && plain.every((p) => !p.parts.length) ? 0 : 1;

  return (
    <div className="move-backdrop" onClick={onClose}>
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
            placeholder={comp.sections ? 'Name this box' : comp.unitTitle ? `Name this drawer (or it shows “${comp.unitTitle}”)` : 'Name this drawer, e.g. Technic'}
            label={`Name for ${comp.code}`}
            onChange={onName}
          />
        </label>
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
            onRemove={(part) => onChange(removeFromPocket(current, i, part))}
            onRemovePocket={pocket.container ? () => onChange(removePocket(current, i, uid)) : undefined}
          />
        ))}

        <h4>Add to {current.length > 1 ? `pocket ${activeIndex + 1}` : 'this drawer'}</h4>
        <input
          ref={searchRef}
          className="search keep-search"
          placeholder="Search parts or groups, e.g. plate 2 x 4, technic pins"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addFirst()}
        />
        <div className="move-list setup-results">
          {results.groups.map((g) => (
            <button key={g.id} className="move-choice" disabled={!g.unplaced} onClick={() => add(g.parts.filter((p) => !inDrawers.has(p.partNum)).map((p) => p.partNum))}>
              <span className={`setup-group-mark fam-border-${g.family}`} />
              <span className="move-name">
                <b>{g.label}</b> <span className="muted small">{familyLabel(g.family)}</span>
              </span>
              <span className="muted small nowrap">{g.unplaced ? `add ${g.unplaced} of ${g.parts.length} parts` : 'all placed'}</span>
            </button>
          ))}
          {results.parts.map((p) => (
            <PartChoice key={p.partNum} part={p} whereIs={whereIs} onAdd={() => add([p.partNum])} />
          ))}
          {nextUp.length > 0 && <p className="muted small">Next in that group, not in a drawer yet:</p>}
          {nextUp.map((p) => (
            <PartChoice key={p.partNum} part={p} whereIs={whereIs} onAdd={() => add([p.partNum])} />
          ))}
          {query && !results.groups.length && !results.parts.length && <p className="muted small">No match. It may be kept out of the plan, or built into a set.</p>}
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

function PartChoice({ part, whereIs, onAdd }: { part: Part; whereIs: Map<string, string[]>; onAdd: () => void }) {
  const where = whereIs.get(part.partNum);
  return (
    <button className="move-choice" onClick={onAdd}>
      <PartImage partNum={part.partNum} size={26} title={part.name} />
      <span className="move-name">{part.name}</span>
      <span className="muted small nowrap">{where ? `also in ${[...new Set(where)].slice(0, 2).join(', ')}` : `× ${part.qty.toLocaleString()}`}</span>
    </button>
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
}) {
  const fillPercent = pocket.fill === undefined ? '' : String(Math.round(pocket.fill * 100));
  const estimated = placed && placed.parts.length ? placed.estimate / placed.capacity : null;
  // In a drawer of several pockets only the one being worked on is opened out, so the list stays short enough to
  // see the search box below it. The rest are a line each: click one to work on it.
  if (divided && !active) {
    const names = (placed?.parts ?? []).map((x) => x.part.name);
    return (
      <button className="setup-pocket folded" aria-expanded={false} onClick={onActivate}>
        <span className="fold-caret">▸</span>
        <b>Pocket {index + 1}</b>
        {pocket.label && <span>{pocket.label}</span>}
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
        <input
          className="setup-label-input"
          list={`${pocket.id}-names`}
          placeholder="Label, e.g. Fences"
          aria-label={`Label for ${divided ? `pocket ${index + 1}` : 'this drawer'}`}
          value={pocket.label ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
        />
        <datalist id={`${pocket.id}-names`}>
          {LABEL_IDEAS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
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
                <PartImage partNum={x.part.partNum} size={22} title={x.part.name} />
                <span>
                  {x.part.name}
                  {elsewhere.length > 0 && <span className="muted small"> · also {elsewhere.slice(0, 2).join(', ')}</span>}
                  {x.tooBig && <span className="warn-text small"> · looks too big for this</span>}
                </span>
                <button className="icon" aria-label={`Remove ${x.part.name}`} onClick={() => onRemove(x.part.partNum)}>
                  ✕
                </button>
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

