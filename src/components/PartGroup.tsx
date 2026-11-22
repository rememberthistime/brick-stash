// A part's group, shown beside its name wherever the part appears, and changed right there: click it, pick another
// group (or type a new name), and see where the part would go before putting it there. What the groups are comes from
// the sorting on Settings; this only puts single parts where you want them.
import { createContext, useContext, useDeferredValue, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { summarise } from '../lib/whatIf';
import { DEFAULT_SORTING, type Catalog, type Project } from '../lib/types';

export interface PartGroupInfo {
  /** the group it's in, nearest first: ["Round 1×1", "Rounds & cones"] */
  path: string[];
  /** put there by hand */
  own: boolean;
}

export interface PartGroups {
  groupOf: (partNum: string) => PartGroupInfo | null;
  names: string[];
  set: (partNum: string, group: string | null) => void;
  project: Project;
  catalog: Catalog | null;
}

export const PartGroupContext = createContext<PartGroups | null>(null);

const where = (x: string | undefined) => (x === undefined ? 'not stored' : x === '' ? 'no room' : x);

export default function PartGroup({ partNum, name }: { partNum: string; name?: string }) {
  const ctx = useContext(PartGroupContext);
  const [at, setAt] = useState<DOMRect | null>(null);
  const info = ctx?.groupOf(partNum);
  if (!ctx || !info) return null;
  const open = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setAt(e.currentTarget.getBoundingClientRect());
  };
  return (
    <>
      <button
        type="button"
        className={`part-group no-print ${info.own ? 'own' : ''}`}
        title={`Group: ${[...info.path].reverse().join(' › ')}${info.own ? ' (put there by you)' : ''}. Click to change.`}
        onClick={open}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
      >
        {info.own ? '✎ ' : ''}
        {info.path[0]}
      </button>
      {at && createPortal(<GroupPicker ctx={ctx} partNum={partNum} name={name} info={info} at={at} close={() => setAt(null)} />, document.body)}
    </>
  );
}

function GroupPicker({ ctx, partNum, name, info, at, close }: { ctx: PartGroups; partNum: string; name?: string; info: PartGroupInfo; at: DOMRect; close: () => void }) {
  const [text, setText] = useState('');
  const want = useDeferredValue(text.trim());
  const isNew = !!want && !ctx.names.some((n) => n.toLowerCase() === want.toLowerCase());
  // Now, next to with the part in the group typed
  const now = useMemo(() => summarise(ctx.project, ctx.catalog), [ctx.project, ctx.catalog]);
  const then = useMemo(() => {
    if (!want) return null;
    const s = ctx.project.sorting ?? DEFAULT_SORTING;
    return summarise({ ...ctx.project, sorting: { ...s, parts: { ...(s.parts ?? {}), [partNum]: want } } }, ctx.catalog);
  }, [want, ctx.project, ctx.catalog, partNum]);
  const others = then ? [...then.place.keys()].filter((k) => k !== partNum && then.place.get(k) !== now.place.get(k)).length : 0;
  const width = 320;
  const left = Math.min(Math.max(8, at.left), window.innerWidth - width - 8);
  const below = at.bottom + 300 < window.innerHeight;
  const style = below ? { left, top: at.bottom + 6, width } : { left, bottom: window.innerHeight - at.top + 6, width };
  const put = (g: string | null) => {
    ctx.set(partNum, g);
    close();
  };
  return (
    <div className="group-picker-back no-print" onClick={close} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="group-picker" style={style} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Change the part's group">
        <div className="small muted">{name ?? partNum} is in</div>
        <div className="group-picker-path">{[...info.path].reverse().join(' › ')}</div>
        {info.own && <div className="small muted">You put it there yourself.</div>}
        <label className="small">
          Put it in
          <input autoFocus list="part-group-names" placeholder="A group, or a new name" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && put(text.trim())} />
        </label>
        <datalist id="part-group-names">
          {ctx.names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {then && (
          <div className="group-picker-preview small">
            {isNew && <div>A new group of its own, called “{want}”.</div>}
            <div>
              Where it goes: <b>{where(now.place.get(partNum))}</b> now, <b>{where(then.place.get(partNum))}</b> then.
            </div>
            {others > 0 && <div className="muted">{others.toLocaleString()} other part type{others === 1 ? '' : 's'} would be suggested somewhere else too.</div>}
            <div className="muted">Recorded drawers stay as they are; this changes suggestions, and Re-sort everything on Settings.</div>
          </div>
        )}
        <div className="row">
          <button disabled={!text.trim()} onClick={() => put(text.trim())}>
            Put it there
          </button>
          {info.own && (
            <button className="ghost" onClick={() => put(null)}>
              Back to its own group
            </button>
          )}
          <button className="ghost" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
