// Parts added by hand: ones the imported list doesn't have, or that aren't in Rebrickable's catalogue at all.
// They're kept apart from the imported rows, so replacing the collection with a fresh export leaves them alone.
import { useMemo, useState } from 'react';
import { findInCatalog } from '../lib/collection';
import { colourName } from '../lib/colours';
import type { Catalog, ExtraPart, Project } from '../lib/types';
import { uid } from '../state';
import PartImage from './PartImage';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  catalog: Catalog | null;
}

export default function ExtraParts({ project, update, catalog }: Props) {
  const extras = project.extraParts ?? [];
  const [mode, setMode] = useState<'catalog' | 'own'>('catalog');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<{ partNum: string; name: string } | null>(null);
  const [qty, setQty] = useState('1');
  const [colour, setColour] = useState('');
  const [own, setOwn] = useState({ partNum: '', name: '', catId: '', size: '' });
  const [note, setNote] = useState('');

  const results = useMemo(() => (chosen ? [] : findInCatalog(catalog, query)), [catalog, query, chosen]);
  const colours = useMemo(() => {
    const names = new Set<string>();
    for (const r of [...project.rows, ...extras]) {
      const c = colourName(r.colour, project.colours);
      if (c && !/^(BrickLink colour|Colour) /.test(c)) names.add(c);
    }
    for (const [name] of Object.values(project.colours?.byId ?? {})) names.add(name);
    return [...names].sort();
  }, [project.rows, extras, project.colours]);
  const categories = useMemo(() => Object.entries(catalog?.categories ?? {}).sort((a, b) => a[1].localeCompare(b[1])), [catalog]);

  const n = Math.max(0, Math.round(Number(qty) || 0));
  const add = (part: Omit<ExtraPart, 'id' | 'qty'>, size?: number) => {
    const row: ExtraPart = { id: uid(), qty: n, ...part, ...(colour.trim() ? { colour: colour.trim() } : {}) };
    update((p) => ({ extraParts: [...(p.extraParts ?? []), row], ...(size ? { volumeOverrides: { ...p.volumeOverrides, [row.partNum]: size } } : {}) }));
    setNote(`Added ${n} × ${part.name ?? part.partNum}${colour.trim() ? ` in ${colour.trim()}` : ''}. It's on Put away & move, ready for a drawer.`);
    setChosen(null);
    setQuery('');
    setQty('1');
    setOwn({ partNum: '', name: '', catId: '', size: '' });
  };
  const addOwn = () => {
    const taken = new Set([...Object.keys(catalog?.parts ?? {}), ...extras.map((e) => e.partNum)]);
    let partNum = own.partNum.trim();
    if (!partNum) {
      let i = 1;
      while (taken.has(`own-${i}`)) i++;
      partNum = `own-${i}`;
    }
    const size = Number(own.size);
    add({ partNum, name: own.name.trim(), ...(own.catId ? { catId: Number(own.catId) } : {}) }, size > 0 ? size : undefined);
  };
  const change = (id: string, f: (e: ExtraPart) => ExtraPart | null) => update((p) => ({ extraParts: (p.extraParts ?? []).flatMap((e) => (e.id === id ? (f(e) ? [f(e)!] : []) : [e])) }));

  const colourInput = (
    <label>
      Colour{' '}
      <input list="extra-colours" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="optional" className="extra-colour" />
      <datalist id="extra-colours">
        {colours.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </label>
  );
  const qtyInput = (
    <label>
      How many <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="extra-qty" />
    </label>
  );

  return (
    <section className="card">
      <h3 className="card-title">Add parts by hand</h3>
      <p className="muted small">For parts your imported list doesn’t have, or that Rebrickable doesn’t list at all. They’re kept separately, so importing a fresh list (even with Replace) leaves them here.</p>
      <div className="seg">
        <label>
          <input type="radio" checked={mode === 'catalog'} onChange={() => setMode('catalog')} /> A part Rebrickable lists
        </label>
        <label>
          <input type="radio" checked={mode === 'own'} onChange={() => setMode('own')} /> A part it doesn’t
        </label>
      </div>

      {mode === 'catalog' ? (
        <div className="extra-form">
          {chosen ? (
            <div className="extra-chosen">
              <PartImage partNum={chosen.partNum} size={48} title={chosen.name} />
              <span>
                {chosen.name} <small className="muted mono">{chosen.partNum}</small>
              </span>
              <button className="link small" onClick={() => setChosen(null)}>
                change
              </button>
            </div>
          ) : (
            <>
              <input className="search" type="search" placeholder="Part number or name, e.g. 3001 or brick 2 x 4" value={query} onChange={(e) => setQuery(e.target.value)} />
              {results.length > 0 && (
                <ul className="extra-results">
                  {results.map((r) => (
                    <li key={r.partNum}>
                      <button className="ghost extra-pick" onClick={() => setChosen(r)}>
                        <PartImage partNum={r.partNum} size={36} title={r.name} />
                        <span>
                          {r.name} <small className="muted mono">{r.partNum}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim().length >= 2 && !results.length && (
                <p className="muted small">
                  Nothing in the catalogue matches.{' '}
                  <button className="link small" onClick={() => (setMode('own'), setOwn((o) => ({ ...o, partNum: /\s/.test(query.trim()) ? '' : query.trim(), name: /\s/.test(query.trim()) ? query.trim() : '' })))}>
                    Add it as your own part
                  </button>
                </p>
              )}
            </>
          )}
          <div className="row">
            {qtyInput}
            {colourInput}
            <button disabled={!chosen || !n} onClick={() => chosen && add({ partNum: chosen.partNum, name: chosen.name })}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <div className="extra-form">
          <div className="row">
            <label>
              Name <input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} placeholder="e.g. Clip-on lamp, 3D printed" className="extra-name" />
            </label>
            <label>
              Number <input value={own.partNum} onChange={(e) => setOwn({ ...own, partNum: e.target.value })} placeholder="optional" className="extra-num" />
            </label>
          </div>
          <div className="row">
            <label>
              Most like{' '}
              <select value={own.catId} onChange={(e) => setOwn({ ...own, catId: e.target.value })}>
                <option value="">choose a kind of part…</option>
                {categories.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Size of one, cm³ <input type="number" min={0} step="0.1" value={own.size} onChange={(e) => setOwn({ ...own, size: e.target.value })} placeholder="optional" className="extra-qty" />
            </label>
          </div>
          <p className="muted small">The kind decides which family it’s stored with. Without a size, it’s estimated from the kind.</p>
          <div className="row">
            {qtyInput}
            {colourInput}
            <button disabled={!own.name.trim() || !n} onClick={addOwn}>
              Add
            </button>
          </div>
        </div>
      )}
      {note && <div className="banner">{note}</div>}

      {extras.length > 0 && (
        <>
          <h4 className="extra-head">Added by hand ({extras.length})</h4>
          <ul className="extra-list">
            {extras.map((e) => (
              <li key={e.id}>
                <PartImage partNum={e.partNum} size={36} title={e.name ?? e.partNum} />
                <span className="extra-what">
                  {e.name ?? catalog?.parts[e.partNum]?.[0] ?? e.partNum} <small className="muted mono">{e.partNum}</small>
                  {e.colour && <small className="muted"> · {colourName(e.colour, project.colours)}</small>}
                  {e.catId !== undefined && catalog?.categories[e.catId] && <small className="muted"> · like {catalog.categories[e.catId]}</small>}
                </span>
                <input type="number" min={1} value={e.qty} aria-label={`How many ${e.name ?? e.partNum}`} className="extra-qty" onChange={(ev) => change(e.id, (x) => ({ ...x, qty: Math.max(1, Math.round(Number(ev.target.value) || 1)) }))} />
                <button className="icon" title="Remove" aria-label={`Remove ${e.name ?? e.partNum}`} onClick={() => change(e.id, () => null)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
