// A pick list for a build: which drawers to open, and how many of each part to take from them.
import { useMemo, useState } from 'react';
import { parseInventory } from '../lib/collection';
import { pickList, placesWithFallback, type PickLine, type Places } from '../lib/pickList';
import { BadKeyError, parseSetLines, pause, savedApiKey, setName, setParts } from '../lib/rebrickable';
import type { Catalog, InventoryRow, Part } from '../lib/types';
import PartImage from './PartImage';

interface Props {
  catalog: Catalog | null;
  /** everything in the collection, kept out of the plan or not */
  owned: Part[];
  keptOut: ReadonlySet<string>;
  fromPlan: Places;
  /** where parts really are, if any drawers have been recorded on My setup */
  fromSetup: Places | null;
  close: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function PickListView({ catalog, owned, keptOut, fromPlan, fromSetup, close }: Props) {
  const [sets, setSets] = useState('');
  const [pasted, setPasted] = useState('');
  const [wanted, setWanted] = useState<{ title: string; rows: InventoryRow[] } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [look, setLook] = useState<'real' | 'plan'>(fromSetup?.size ? 'real' : 'plan');
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const apiKey = savedApiKey();

  const places = look === 'real' && fromSetup ? placesWithFallback(fromSetup, fromPlan) : fromPlan;
  const list = useMemo(() => (wanted ? pickList(wanted.rows, catalog, owned, places, keptOut) : null), [wanted, catalog, owned, places, keptOut]);

  const use = (title: string, rows: InventoryRow[], warnings: string[] = []) => {
    setNotes(warnings);
    setDone(new Set());
    if (rows.length) {
      setError('');
      setWanted({ title, rows });
    } else setError(warnings[0] ?? 'There were no parts in that.');
  };

  const lookUp = async () => {
    const list = parseSetLines(sets);
    if (!list.length) return setError('Enter a set number, such as 10294.');
    setError('');
    const rows: InventoryRow[] = [];
    const names: string[] = [];
    try {
      for (const [i, set] of list.entries()) {
        setBusy(`Fetching ${set.setNum} (${i + 1} of ${list.length})…`);
        if (i) await pause(1100);
        const name = await setName(set.setNum, apiKey).catch((e) => (e instanceof BadKeyError ? Promise.reject(e) : ''));
        await pause(1100);
        rows.push(...(await setParts(set.setNum, apiKey, set.copies)));
        names.push(`${set.setNum}${name ? ` ${name}` : ''}${set.copies > 1 ? ` ×${set.copies}` : ''}`);
      }
      use(names.join(', '), rows);
    } catch (e) {
      setError(e instanceof BadKeyError ? 'Rebrickable turned the key down. Check it on the Collection tab, under Add whole sets.' : `Couldn’t fetch that: ${(e as Error).message}`);
    }
    setBusy('');
  };

  const readFile = async (f: File) => {
    const r = parseInventory(await f.text());
    use(f.name, r.rows, r.warnings);
  };

  const toggle = (partNum: string) =>
    setDone((d) => {
      const next = new Set(d);
      if (!next.delete(partNum)) next.add(partNum);
      return next;
    });

  const row = (l: PickLine, showPlace: boolean) => (
    <li key={l.partNum} className={done.has(l.partNum) ? 'picked' : ''}>
      <input type="checkbox" checked={done.has(l.partNum)} onChange={() => toggle(l.partNum)} aria-label={`Picked ${l.name}`} />
      <PartImage partNum={l.partNum} size={36} title={l.name} />
      <span className="pick-qty">{Math.min(l.want, l.have || l.want).toLocaleString()}×</span>
      <span className="pick-name">
        {l.name} <small className="muted">{l.partNum}</small>
        <small className="pick-detail">
          {showPlace && l.places.length > 0 && (
            <b>
              {l.places[0].code}
              {l.places[0].section ? ` · ${l.places[0].section}` : ''}
            </b>
          )}
          {showPlace && l.places.length > 1 && <span> (also {[...new Set(l.places.slice(1).map((p) => p.code))].join(', ')})</span>}
          {l.colours.length > 0 && <span> {l.colours.map((c) => `${c.qty} ${c.name}`).join(', ')}</span>}
          {l.have > 0 && l.have < l.want && (
            <span className="pick-short">
              {' '}
              needs {l.want}, you have {l.have} in any colour
            </span>
          )}
        </small>
      </span>
    </li>
  );

  const group = (title: string, hint: string, lines: PickLine[], showPlace = false) =>
    lines.length > 0 && (
      <section className="card pick-drawer">
        <h3>
          {title} <small className="muted">{hint}</small>
        </h3>
        <ul className="pick-lines">{lines.map((l) => row(l, showPlace))}</ul>
      </section>
    );

  return (
    <div className="pick-view">
      <div className="row no-print">
        <button className="ghost" onClick={close}>
          Back to plan
        </button>
        {list && <button onClick={() => window.print()}>Print</button>}
        {fromSetup && fromSetup.size > 0 && (
          <label>
            Look in{' '}
            <select value={look} onChange={(e) => setLook(e.target.value as 'real' | 'plan')}>
              <option value="real">my drawers as recorded, then the plan</option>
              <option value="plan">the plan only</option>
            </select>
          </label>
        )}
      </div>

      <section className="card no-print">
        <h2>Pick list for a build</h2>
        <p className="muted">Say what you’re building, and this lists the drawers to open and how many of each part to take. Parts are found by type, whatever their colour; the colours the build needs are shown beside each.</p>
        <div className="row">
          <input className="search" placeholder="Set number, e.g. 10294 or 75192 x2" value={sets} onChange={(e) => setSets(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apiKey && !busy && void lookUp()} />
          <button disabled={!apiKey || !sets.trim() || !!busy} onClick={() => void lookUp()}>
            Look up on Rebrickable
          </button>
          <label className="pick-file">
            or choose a parts file…
            <input
              type="file"
              accept=".csv,.xml,.txt"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void readFile(f);
              }}
            />
          </label>
        </div>
        {!apiKey && <p className="muted small">Looking a set up by number uses your Rebrickable key, which this browser doesn’t have yet: add it on the Collection tab, under Add whole sets. A parts file needs no key: on Rebrickable, open the set’s Inventory and export it as CSV, or use a BrickLink wanted list (XML).</p>}
        <details>
          <summary>…or paste a parts list</summary>
          <textarea rows={5} placeholder={'Part,Color,Quantity\n3001,Red,4'} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button
            className="ghost"
            disabled={!pasted.trim()}
            onClick={() => {
              const r = parseInventory(pasted);
              use('Pasted list', r.rows, r.warnings);
            }}
          >
            Use this list
          </button>
        </details>
        {busy && <p className="muted">{busy}</p>}
        {error && <div className="banner warn">{error}</div>}
        {notes.map((n) => (
          <p key={n} className="muted small">
            {n}
          </p>
        ))}
      </section>

      {list && wanted && (
        <>
          <section className="card pick-summary">
            <h2>{wanted.title}</h2>
            <p>
              {plural(list.pieces, 'piece')} of {plural(list.types, 'part type')}, from {plural(list.drawers.length, 'drawer')}.{' '}
              {list.piecesShort ? (
                <b className="pick-short">
                  {plural(list.piecesShort, 'piece')} short ({plural(list.missing.length, 'type')} you don’t have, {list.short.length} you have too few of).
                </b>
              ) : (
                <b>You have everything.</b>
              )}{' '}
              <span className="muted small">Quantities count every colour of a part together, so check the colours as you pick.</span>
            </p>
          </section>
          {list.drawers.map((d) => (
            <section key={d.code} className="card pick-drawer">
              <h3>
                <span className="code">{d.code}</span> <small className="muted">{d.where}</small>
              </h3>
              <ul className="pick-lines">{d.lines.map((l) => row(l, true))}</ul>
            </section>
          ))}
          {group('Stored elsewhere', 'kept out of the plan', list.elsewhere)}
          {group('No drawer yet', look === 'real' ? 'in your collection, but not in a recorded drawer or the plan' : 'in your collection, but with no home in the plan', list.unplaced)}
          {group('Not in your collection', `${plural(list.missing.reduce((t, l) => t + l.want, 0), 'piece')} to find`, list.missing)}
        </>
      )}
    </div>
  );
}
