import { useState } from 'react';
import type { Catalog, InventoryRow, Part, Project } from '../lib/types';
import { TEMPLATE_CSV, onePieceVolume, parseInventory, partVolume, type SubtractResult } from '../lib/collection';
import type { TreeNode } from '../lib/planner';
import { familyLabel, leaves } from '../lib/planner';
import { formatSetLines, parseSetLines, parseSetList, pause, resolveBrickLinkId, setParts } from '../lib/rebrickable';
import { pickPart, toggleFamily, type KeptPart, type KeptSummary } from '../lib/keepOut';
import { download } from '../state';
import BuiltSets from './BuiltSets';
import KeepOutCard from './KeepOutCard';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  catalog: Catalog | null;
  parts: Part[];
  /** what's in the plan */
  totals: { pieces: number; volume: number };
  /** every part after built sets are subtracted, including those kept out of the plan */
  everything: TreeNode;
  subtraction: SubtractResult;
  kept: KeptPart[];
  keptSummary: KeptSummary;
}

type PartSortKey = 'num' | 'name' | 'qty' | 'colours' | 'each' | 'total';
interface PartSort {
  key: PartSortKey;
  descending: boolean;
}

/** cm³ up to a litre, then litres */
const formatVolume = (cm3: number) => (cm3 < 1000 ? `${Math.round(cm3)} cm³` : `${(cm3 / 1000).toFixed(2)} L`);

const KEY_STORE = 'brick-stash-rb-key';
const readKey = () => {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
};

export default function CollectionTab({ project, update, catalog, parts, totals, everything, subtraction, kept, keptSummary }: Props) {
  const [mode, setMode] = useState<'append' | 'replace'>('replace');
  const [messages, setMessages] = useState<string[]>([]);
  const [paste, setPaste] = useState('');
  const [drag, setDrag] = useState(false);
  const [apiKey, setApiKey] = useState(readKey);
  const [sets, setSets] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [partSort, setPartSort] = useState<PartSort>({ key: 'qty', descending: true });

  const addRows = (rows: InventoryRow[], warnings: string[], source: string) => {
    if (!rows.length) {
      setMessages(warnings.length ? warnings : [`Nothing found in ${source}.`]);
      return;
    }
    update((p) => ({ rows: mode === 'append' ? [...p.rows, ...rows] : rows }));
    const pieces = rows.reduce((t, r) => t + r.qty, 0);
    setMessages([`${mode === 'append' ? 'Added' : 'Loaded'} ${rows.length} rows (${pieces.toLocaleString()} pieces) from ${source}.`, ...warnings]);
  };

  const importText = (text: string, source: string) => {
    if (parseSetList(text)) {
      setMessages([`${source} is a set list, not a parts list. Use "Add whole sets from Rebrickable" for sets you want to add, or "Sets you keep built" for sets to take off.`]);
      return;
    }
    const r = parseInventory(text);
    addRows(r.rows, r.warnings, source);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) importText(await f.text(), f.name);
  };

  const loadSample = async () => importText(await (await fetch('/samples/sample-collection.csv')).text(), 'the sample collection');

  const saveKey = (k: string) => {
    setApiKey(k);
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      /* ignore */
    }
  };

  const importSets = async () => {
    const wanted = parseSetLines(sets);
    const rows: InventoryRow[] = [];
    const warnings: string[] = [];
    for (const [i, { setNum, copies }] of wanted.entries()) {
      setBusy(`Fetching ${setNum} (${i + 1}/${wanted.length})…`);
      try {
        rows.push(...(await setParts(setNum, apiKey, copies)));
      } catch (e) {
        warnings.push(`${setNum}: ${(e as Error).message}`);
      }
      await pause(1100); // Rebrickable allows ~1 request/second
    }
    setBusy('');
    addRows(rows, warnings, `${wanted.length} set(s) on Rebrickable`);
  };

  const keyInput = (
    <input type="password" className="api-key" placeholder="Rebrickable API key (rebrickable.com → Profile → Settings → API)" value={apiKey} onChange={(e) => saveKey(e.target.value)} autoComplete="off" />
  );

  const unknown = parts.filter((p) => !p.known);
  const resolveUnknown = async () => {
    const map = new Map<string, string>();
    for (const [i, p] of unknown.entries()) {
      setBusy(`Looking up ${p.partNum} (${i + 1}/${unknown.length})…`);
      try {
        const rb = await resolveBrickLinkId(p.partNum, apiKey);
        if (rb && rb !== p.partNum) map.set(p.partNum, rb);
      } catch {
        /* keep as unknown */
      }
      await pause(1100);
    }
    setBusy('');
    if (map.size) update((pr) => ({ rows: pr.rows.map((r) => ({ ...r, partNum: map.get(r.partNum) ?? r.partNum })) }));
    setMessages([`Resolved ${map.size} of ${unknown.length} unrecognised part numbers via Rebrickable.`]);
  };

  const setOverride = (partNum: string, v: string) =>
    update((p) => {
      const o = { ...p.volumeOverrides };
      if (v === '' || !(Number(v) > 0)) delete o[partNum];
      else o[partNum] = Number(v);
      return { volumeOverrides: o };
    });

  const scale = project.settings.volumeScale;
  const allParts = leaves(everything).flatMap((l) => (l.part ? [l.part] : []));
  const keptNums = new Set(kept.map((x) => x.part.partNum));
  const keepOut = project.keepOut;

  return (
    <div className="grid-2">
      <div>
        <section className="card">
          <h2>Import your collection</h2>
          <p className="muted">
            Any spreadsheet saved as CSV works — it needs a <b>part number</b> column and ideally a <b>quantity</b> column. Colour is optional (we store by type, not colour).
            Exports from <b>Rebrickable</b> (My Parts → Export), <b>BrickLink</b> (wanted list / inventory XML) and <b>Brickset</b> are recognised.
          </p>

          <div className="seg">
            <label>
              <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace collection
            </label>
            <label>
              <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} /> Add to collection
            </label>
          </div>

          <label
            className={`dropzone ${drag ? 'drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onFiles(e.dataTransfer.files);
            }}
          >
            <input type="file" accept=".csv,.tsv,.txt,.xml" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            <strong>Drop CSV / XML files here</strong>
            <span>or click to choose</span>
          </label>

          <details>
            <summary>…or paste from a spreadsheet</summary>
            <textarea rows={6} placeholder={'Part\tQuantity\n3001\t24\n3023\t60'} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button disabled={!paste.trim()} onClick={() => importText(paste, 'pasted text')}>
              Import pasted rows
            </button>
          </details>

          <div className="row">
            <button className="ghost" onClick={() => download('brick-stash-template.csv', TEMPLATE_CSV, 'text/csv')}>
              Download template
            </button>
            <button className="ghost" onClick={loadSample}>
              Try the sample collection
            </button>
            {project.rows.length > 0 && (
              <button className="ghost danger" onClick={() => confirm('Clear the whole collection?') && update({ rows: [] })}>
                Clear
              </button>
            )}
          </div>

          <details className="rb">
            <summary>Add whole sets from Rebrickable</summary>
            <p className="muted small">
              Uses your own free API key (rebrickable.com → Profile → Settings → API). It's stored only in this browser. One set number per line; add a count for duplicates, e.g. <code>10294 x2</code>.
            </p>
            {keyInput}
            <textarea rows={4} placeholder={'10294\n42115-1\n75192 x2'} value={sets} onChange={(e) => setSets(e.target.value)} />
            <button disabled={!apiKey || !sets.trim() || !!busy} onClick={importSets}>
              Fetch set inventories
            </button>
            <label className="ghost-file set-upload">
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  const list = f && parseSetList(await f.text());
                  if (list) setSets(formatSetLines(list));
                  else if (f) setMessages([`${f.name} has no Set Number column.`]);
                }}
              />
              <span className="link">…or upload a Rebrickable set list</span>
            </label>
          </details>

          {busy && <div className="banner">{busy}</div>}
          {messages.map((m, i) => (
            <div key={i} className={`banner ${i === 0 ? '' : 'warn'}`}>
              {m}
            </div>
          ))}
        </section>

        <BuiltSets project={project} update={update} apiKey={apiKey} apiKeyInput={keyInput} subtraction={subtraction} />
      </div>

      <div>
        <section className="card">
          <h2>What you have</h2>
          {!allParts.length ? (
            <p className="muted">No parts yet. Import a file or try the sample.</p>
          ) : (
            <>
              <div className="stats">
                <Stat
                  label="Pieces in the plan"
                  value={totals.pieces.toLocaleString()}
                  hint={
                    [subtraction.removed ? `${subtraction.removed.toLocaleString()} in built sets` : '', keptSummary.pieces ? `${keptSummary.pieces.toLocaleString()} kept out` : ''].filter(Boolean).join(', ') || undefined
                  }
                />
                <Stat label="Part types" value={parts.length.toLocaleString()} hint="colours merged" />
                <Stat label="Est. loose volume" value={`${(totals.volume / 1000).toFixed(1)} L`} />
              </div>
              {!catalog && <p className="muted">Loading part catalogue…</p>}
              {catalog && unknown.length > 0 && (
                <div className="banner warn">
                  {unknown.length} part number(s) not in the Rebrickable catalogue (filed as Uncategorised).
                  {apiKey ? (
                    <button className="link" disabled={!!busy} onClick={resolveUnknown}>
                      Look them up as BrickLink ids
                    </button>
                  ) : (
                    ' Add a Rebrickable API key (left) to look them up as BrickLink ids.'
                  )}
                </div>
              )}
              <table className="families">
                <thead>
                  <tr>
                    <th title="Untick to keep a family out of the plan">In plan</th>
                    <th>Family</th>
                    <th className="num">Types</th>
                    <th className="num">Pieces</th>
                    <th className="num">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {everything.children.map((f) => {
                    const ls = leaves(f).filter((l) => l.part);
                    return (
                      <FamilyRows
                        key={f.id}
                        node={f}
                        leaves={ls}
                        open={open === f.id}
                        toggle={() => setOpen(open === f.id ? null : f.id)}
                        scale={scale}
                        setOverride={setOverride}
                        familyOut={keepOut.families.includes(f.familyKey)}
                        toggleFamily={() => update({ keepOut: toggleFamily(keepOut, f.familyKey) })}
                        keptNums={keptNums}
                        pick={(p, keep) => update({ keepOut: pickPart(keepOut, p, keep, project.units) })}
                      sort={partSort}
                      setSort={setPartSort}
                      />
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
        {allParts.length > 0 && <KeepOutCard project={project} update={update} parts={allParts} kept={kept} summary={keptSummary} />}
      </div>
    </div>
  );
}

function FamilyRows({
  node,
  leaves,
  open,
  toggle,
  scale,
  setOverride,
  familyOut,
  toggleFamily,
  keptNums,
  pick,
  sort,
  setSort,
}: {
  node: TreeNode;
  leaves: TreeNode[];
  open: boolean;
  toggle: () => void;
  scale: number;
  setOverride: (p: string, v: string) => void;
  familyOut: boolean;
  toggleFamily: () => void;
  keptNums: Set<string>;
  pick: (p: Part, keep: boolean) => void;
  sort: PartSort;
  setSort: (s: PartSort) => void;
}) {
  const fam = node.familyKey;
  const keptHere = leaves.filter((l) => keptNums.has(l.part!.partNum)).length;
  const onePiece = (p: Part) => onePieceVolume(p, scale);
  const value = (p: Part): number | string => ({ num: p.partNum, name: p.name, qty: p.qty, colours: p.colours, each: onePiece(p), total: onePiece(p) * p.qty })[sort.key];
  const sorted = [...leaves].sort((a, b) => {
    const [x, y] = [value(a.part!), value(b.part!)];
    const order = typeof x === 'number' ? x - (y as number) : x.localeCompare(y as string, undefined, { numeric: true });
    return sort.descending ? -order : order;
  });
  const header = (key: PartSortKey, label: string, title?: string, numeric = true) => (
    <th className={numeric ? 'num' : ''} title={title} aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : undefined}>
      {/* Numbers read best biggest first, names from the start of the alphabet */}
      <button className="sort-head" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : numeric })}>
        {label}
        {sort.key === key && (sort.descending ? ' ▾' : ' ▴')}
      </button>
    </th>
  );
  return (
    <>
      <tr className={`fam-row ${familyOut ? 'kept-out' : ''}`} onClick={toggle}>
        <td className="center" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={!familyOut} onChange={toggleFamily} title={familyOut ? 'Put this family back in the plan' : 'Keep this family out of the plan'} />
        </td>
        <td>
          <span className={`swatch fam-${fam}`} /> {open ? '▾' : '▸'} {familyLabel(fam)}
          {!familyOut && keptHere > 0 && <small className="muted"> · {keptHere} kept out</small>}
        </td>
        <td className="num">{leaves.length}</td>
        <td className="num">{node.pieces.toLocaleString()}</td>
        <td className="num">{(node.volume / 1000).toFixed(2)} L</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="parts-cell">
            <table className="parts">
              <thead>
                <tr>
                  <th title="Untick to keep a part out of the plan">In plan</th>
                  {header('num', 'Part', undefined, false)}
                  {header('name', 'Name', undefined, false)}
                  {header('qty', 'Qty')}
                  {header('colours', 'Colours')}
                  {header('each', 'cm³/pc', 'Estimated loose volume per piece, cm³. Edit to override')}
                  {header('total', 'Total', 'Estimated loose volume of all of them')}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 300).map((l) => {
                    const p = l.part!;
                    return (
                      <tr key={p.partNum} className={keptNums.has(p.partNum) ? 'kept-out' : ''}>
                        <td className="center">
                          <input type="checkbox" checked={!keptNums.has(p.partNum)} onChange={(e) => pick(p, !e.target.checked)} />
                        </td>
                        <td>
                          <a href={`https://rebrickable.com/parts/${encodeURIComponent(p.partNum)}/`} target="_blank" rel="noreferrer">
                            {p.partNum}
                          </a>
                        </td>
                        <td>{p.name}</td>
                        <td className="num">{p.qty}</td>
                        <td className="num">{p.colours}</td>
                        <td className="num">
                          <input
                            className={`vol ${p.volumeOverride ? 'overridden' : ''}`}
                            type="number"
                            step="0.1"
                            min="0"
                            defaultValue={Number(onePiece(p).toFixed(2))}
                            onBlur={(e) => setOverride(p.partNum, !p.volumeOverride && e.target.value === String(Number(onePiece(p).toFixed(2))) ? '' : e.target.value)}
                          />
                        </td>
                        <td className="num nowrap">{formatVolume(onePiece(p) * p.qty)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {leaves.length > 300 && <p className="muted small">Showing the first 300 of {leaves.length}, in this order.</p>}
            <p className="muted small">Volume for this family: {(leaves.reduce((t, l) => t + partVolume(l.part!, scale), 0) / 1000).toFixed(2)} L</p>
          </td>
        </tr>
      )}
    </>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
