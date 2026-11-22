// A pick list for a build, kept as a checklist: which drawers to open, and how many of each part to take in each
// colour. Every list is saved with the project, so its ticks last and every device sees them.
import { nameTitle, partPlainName } from '../lib/builderNames';
import PartName from './PartName';
import { useEffect, useMemo, useState } from 'react';
import { collectionRows, parseInventory } from '../lib/collection';
import { colourRgb, colourStock, colourTable, needsColourNames } from '../lib/colours';
import { pickKey, pickList, placesWithFallback, shortCsv, type PickLine, type Places } from '../lib/pickList';
import { BadKeyError, fetchColours, parseSetLines, pause, savedApiKey, setName, setParts } from '../lib/rebrickable';
import type { Build, Catalog, InventoryRow, Part, Project } from '../lib/types';
import { download, uid } from '../state';
import PartImage from './PartImage';

interface Props {
  catalog: Catalog | null;
  /** everything in the collection, kept out of the plan or not */
  owned: Part[];
  keptOut: ReadonlySet<string>;
  fromPlan: Places;
  /** where parts really are, if any drawers have been recorded on My setup */
  fromSetup: Places | null;
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const OPEN_STORE = 'brick-stash-build-open';
const HIDE_STORE = 'brick-stash-build-hide-ticked';
const recall = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const remember = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};
/** Builds kept with the project; older ones go once there are more than this */
const MAX_BUILDS = 30;

export default function PickListView({ catalog, owned, keptOut, fromPlan, fromSetup, project, update }: Props) {
  const [sets, setSets] = useState('');
  const [pasted, setPasted] = useState('');
  const [openId, setOpenId] = useState<string | null>(() => recall(OPEN_STORE));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [look, setLook] = useState<'real' | 'plan'>(fromSetup?.size ? 'real' : 'plan');
  const [hideTicked, setHideTicked] = useState(() => recall(HIDE_STORE) === '1');
  const [colourError, setColourError] = useState('');
  const apiKey = savedApiKey() || project.rebrickableKey || '';
  const builds = project.builds ?? [];
  const build = builds.find((b) => b.id === openId) ?? null;
  const table = project.colours ?? null;

  const open = (id: string | null) => {
    setOpenId(id);
    remember(OPEN_STORE, id);
  };

  // Colour numbers from a Rebrickable export are named from Rebrickable's own list, fetched once with the key
  const mine = useMemo(() => collectionRows(project), [project.rows, project.extraParts]);
  const unnamed = useMemo(() => needsColourNames([...mine, ...(build?.rows ?? [])], table), [mine, build, table]);
  const getColours = async () => {
    setColourError('');
    try {
      const list = await fetchColours(apiKey);
      update({ colours: colourTable(list) });
    } catch (e) {
      setColourError(e instanceof BadKeyError ? 'Rebrickable turned the key down. Check it on Import, under Add whole sets.' : `Couldn’t fetch the colour names: ${(e as Error).message}`);
    }
  };
  useEffect(() => {
    if (unnamed && apiKey && !table) void getColours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unnamed, apiKey, table]);

  const built = useMemo(() => project.excluded.filter((x) => x.enabled).flatMap((x) => x.rows), [project.excluded]);
  const stock = useMemo(() => colourStock(mine, built, catalog, table), [mine, built, catalog, table]);
  const coloursKnown = mine.some((r) => r.colour);
  const places = look === 'real' && fromSetup ? placesWithFallback(fromSetup, fromPlan) : fromPlan;
  const list = useMemo(() => (build ? pickList(build.rows, catalog, owned, places, keptOut, coloursKnown ? { stock, table } : { table }) : null), [build, catalog, owned, places, keptOut, stock, table, coloursKnown]);

  const changeBuild = (id: string, f: (b: Build) => Build) => update((p) => ({ builds: (p.builds ?? []).map((b) => (b.id === id ? f(b) : b)) }));
  const save = (title: string, rows: InventoryRow[], warnings: string[] = []) => {
    setNotes(warnings);
    if (!rows.length) return setError(warnings[0] ?? 'There were no parts in that.');
    setError('');
    const b: Build = { id: uid(), title, rows, picked: [], made: new Date().toISOString() };
    update((p) => ({ builds: [b, ...(p.builds ?? [])].slice(0, MAX_BUILDS) }));
    open(b.id);
  };

  const lookUp = async () => {
    const wanted = parseSetLines(sets);
    if (!wanted.length) return setError('Enter a set number, such as 10294.');
    setError('');
    const rows: InventoryRow[] = [];
    const names: string[] = [];
    try {
      for (const [i, set] of wanted.entries()) {
        setBusy(`Fetching ${set.setNum} (${i + 1} of ${wanted.length})…`);
        if (i) await pause(1100);
        const name = await setName(set.setNum, apiKey).catch((e) => (e instanceof BadKeyError ? Promise.reject(e) : ''));
        await pause(1100);
        rows.push(...(await setParts(set.setNum, apiKey, set.copies)));
        names.push(`${set.setNum}${name ? ` ${name}` : ''}${set.copies > 1 ? ` ×${set.copies}` : ''}`);
      }
      save(names.join(', '), rows);
      setSets('');
    } catch (e) {
      setError(e instanceof BadKeyError ? 'Rebrickable turned the key down. Check it on Import, under Add whole sets.' : `Couldn’t fetch that: ${(e as Error).message}`);
    }
    setBusy('');
  };

  const readFile = async (f: File) => {
    const r = parseInventory(await f.text());
    save(f.name.replace(/\.(csv|xml|txt)$/i, ''), r.rows, r.warnings);
  };

  const picked = new Set(build?.picked ?? []);
  const toggle = (keys: string[]) => {
    if (!build) return;
    const all = keys.every((k) => picked.has(k));
    changeBuild(build.id, (b) => {
      const next = new Set(b.picked);
      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return { ...b, picked: [...next] };
    });
  };
  const keysOf = (l: PickLine) => l.colours.map((c) => pickKey(l.partNum, c.name));
  const lineDone = (l: PickLine) => keysOf(l).every((k) => picked.has(k));
  const allLines = list ? [...list.drawers.flatMap((d) => d.lines), ...list.elsewhere, ...list.unplaced] : [];
  const piecesTotal = allLines.reduce((t, l) => t + l.want, 0);
  const piecesDone = allLines.reduce((t, l) => t + l.colours.reduce((s, c) => s + (picked.has(pickKey(l.partNum, c.name)) ? c.qty : 0), 0), 0);

  const swatch = (name: string) => {
    const rgb = colourRgb(name, table);
    return rgb ? <span className="swatch" style={{ background: rgb }} aria-hidden /> : null;
  };

  const row = (l: PickLine, showPlace: boolean) => {
    const done = lineDone(l);
    if (done && hideTicked) return null;
    const one = l.colours.length === 1;
    return (
      <li key={l.partNum} className={`pick-line ${done ? 'picked' : ''}`}>
        <input type="checkbox" className="pick-box" checked={done} onChange={() => toggle(keysOf(l))} aria-label={`Picked all of ${partPlainName(l)}`} />
        <PartImage partNum={l.partNum} size={44} title={nameTitle(l)} />
        <span className="pick-name">
          <span className="pick-title">
            <b className="pick-qty-inline">{l.want.toLocaleString()}×</b> <PartName part={l} /> <small className="muted mono">{l.partNum}</small>
          </span>
          <small className="pick-detail">
            {showPlace && l.places.length > 0 && (
              <b>
                {l.places[0].code}
                {l.places[0].name ? `: ${l.places[0].name}` : ''}
                {l.places[0].section ? ` · ${l.places[0].section}` : ''}
              </b>
            )}
            {showPlace && l.places.length > 1 && <span> (also {[...new Set(l.places.slice(1).map((p) => p.code))].join(', ')})</span>}
            {l.have > 0 && l.have < l.want && <span className="pick-short"> you have {l.have} in all colours</span>}
          </small>
          {!(one && !l.colours[0].name) && (
            <span className="pick-colours">
              {l.colours.map((c) => {
                const k = pickKey(l.partNum, c.name);
                const short = c.have !== undefined && c.have < c.qty;
                return (
                  <label key={k} className={`pick-colour ${picked.has(k) ? 'ticked' : ''} ${short ? 'short' : ''}`}>
                    {!one && <input type="checkbox" checked={picked.has(k)} onChange={() => toggle([k])} aria-label={`Picked ${c.qty} ${c.name || 'any colour'} ${partPlainName(l)}`} />}
                    {swatch(c.name)}
                    <span>
                      <b>{c.qty}</b> {c.name || 'any colour'}
                    </span>
                    {c.have !== undefined && <span className="muted small">{short ? `only ${c.have}` : `of ${c.have}`}</span>}
                  </label>
                );
              })}
            </span>
          )}
        </span>
      </li>
    );
  };

  const group = (title: string, hint: string, lines: PickLine[], showPlace = false) =>
    lines.length > 0 && (
      <section className="card pick-drawer">
        <h3>
          {title} <small className="muted">{hint}</small>
        </h3>
        <ul className="pick-lines">{lines.map((l) => row(l, showPlace))}</ul>
      </section>
    );

  const drawerLeft = (lines: PickLine[]) => lines.filter((l) => !lineDone(l)).length;

  return (
    <div className="pick-view">
      <section className="card no-print">
        <h2>Build a set from your drawers</h2>
        <p className="muted">Choose a set and get a checklist of the drawers to open and the parts to take, colour by colour. Ticks are saved with the project, so you can pick on your phone and carry on later on any device.</p>
        <div className="row">
          <input className="search" placeholder="Set number, e.g. 10294 or 75192 x2" value={sets} onChange={(e) => setSets(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apiKey && !busy && void lookUp()} />
          <button disabled={!apiKey || !sets.trim() || !!busy} onClick={() => void lookUp()}>
            Make a checklist
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
        {!apiKey && <p className="muted small">Looking a set up by number uses your Rebrickable key, which this browser doesn’t have yet: add it on Import, under Add whole sets, and tick Keep it with the project to use it on every device. A parts file needs no key: on Rebrickable, open the set’s Inventory and export it as CSV, or use a BrickLink wanted list (XML).</p>}
        <details>
          <summary>…or paste a parts list</summary>
          <textarea rows={5} placeholder={'Part,Color,Quantity\n3001,Red,4'} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button
            className="ghost"
            disabled={!pasted.trim()}
            onClick={() => {
              const r = parseInventory(pasted);
              save('Pasted list', r.rows, r.warnings);
              setPasted('');
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

      {builds.length > 0 && (
        <section className="card no-print">
          <h3 className="card-title">Your checklists</h3>
          <ul className="build-list">
            {builds.map((b) => {
              return (
                <li key={b.id} className={b.id === build?.id ? 'open' : ''}>
                  <button className="link build-open" onClick={() => open(b.id === build?.id ? null : b.id)}>
                    {b.title}
                  </button>
                  <span className="muted small">
                    {new Date(b.made).toLocaleDateString()} · {b.picked.length ? `${b.picked.length} ticked` : 'not started'}
                  </span>
                  <button
                    className="icon"
                    title="Remove this checklist"
                    aria-label={`Remove ${b.title}`}
                    onClick={() => {
                      update((p) => ({ builds: (p.builds ?? []).filter((x) => x.id !== b.id) }));
                      if (b.id === build?.id) open(null);
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {list && build && (
        <>
          <section className="card pick-summary">
            <div className="pick-summary-head">
              <h2>{build.title}</h2>
              <div className="row no-print">
                <label className="small">
                  <input
                    type="checkbox"
                    checked={hideTicked}
                    onChange={(e) => {
                      setHideTicked(e.target.checked);
                      remember(HIDE_STORE, e.target.checked ? '1' : '0');
                    }}
                  />{' '}
                  Hide ticked
                </label>
                {build.picked.length > 0 && (
                  <button className="ghost small-btn" onClick={() => changeBuild(build.id, (b) => ({ ...b, picked: [] }))}>
                    Untick all
                  </button>
                )}
                <button className="ghost small-btn" onClick={() => window.print()}>
                  Print
                </button>
              </div>
            </div>
            <div className="pick-progress" role="progressbar" aria-valuemin={0} aria-valuemax={piecesTotal} aria-valuenow={piecesDone}>
              <span style={{ width: `${piecesTotal ? (100 * piecesDone) / piecesTotal : 0}%` }} />
            </div>
            <p>
              {piecesDone ? `${plural(piecesDone, 'piece')} of ${piecesTotal.toLocaleString()} picked. ` : ''}
              {plural(list.pieces, 'piece')} of {plural(list.types, 'part type')}, from {plural(list.drawers.length, 'drawer')}.{' '}
              {list.colourShort.length ? (
                <b className="pick-short">{plural(list.colourShort.reduce((t, s) => t + s.need - s.have, 0), 'piece')} short in the colours needed.</b>
              ) : list.piecesShort ? (
                <b className="pick-short">
                  {plural(list.piecesShort, 'piece')} short ({plural(list.missing.length, 'type')} you don’t have, {list.short.length} you have too few of).
                </b>
              ) : (
                <b>You have everything{coloursKnown ? ', in the right colours' : ''}.</b>
              )}
            </p>
            {!coloursKnown && <p className="muted small">Your collection was imported without colours, so how many you have counts every colour together. Import a Rebrickable export to see each colour.</p>}
            {unnamed && (
              <p className="muted small no-print">
                Some colours are still numbers.{' '}
                {apiKey ? (
                  <button className="link small" onClick={() => void getColours()}>
                    Get colour names from Rebrickable
                  </button>
                ) : (
                  'Add your Rebrickable key on Import to turn them into names.'
                )}
                {colourError && <span className="pick-short"> {colourError}</span>}
              </p>
            )}
            {fromSetup && fromSetup.size > 0 && (
              <label className="small no-print">
                Look in{' '}
                <select value={look} onChange={(e) => setLook(e.target.value as 'real' | 'plan')}>
                  <option value="real">my drawers as recorded, then the suggestions</option>
                  <option value="plan">the suggestions only</option>
                </select>
              </label>
            )}
          </section>
          {list.drawers.map((d) => {
            const left = drawerLeft(d.lines);
            if (!left && hideTicked) return null;
            return (
              <section key={d.code} className={`card pick-drawer ${left ? '' : 'done'}`}>
                <h3>
                  <span className="code">{d.code}</span> {d.name && <span className="place-name">{d.name}</span>} <small className="muted">{d.where}</small>
                  <small className="muted pick-left">{left ? `${left} to pick` : 'done'}</small>
                </h3>
                <ul className="pick-lines">{d.lines.map((l) => row(l, true))}</ul>
              </section>
            );
          })}
          {group('Stored elsewhere', 'kept out of storage', list.elsewhere)}
          {group('No drawer yet', look === 'real' ? 'in your collection, but not in a recorded or suggested drawer' : 'in your collection, but with no drawer yet', list.unplaced)}
          {list.colourShort.length > 0 ? (
            <section className="card pick-drawer">
              <h3>
                To find or buy <small className="muted">{plural(list.colourShort.reduce((t, s) => t + s.need - s.have, 0), 'piece')}</small>
              </h3>
              <ul className="pick-lines">
                {list.colourShort.map((s) => (
                  <li key={pickKey(s.partNum, s.colour)}>
                    <PartImage partNum={s.partNum} size={36} title={s.name} />
                    <span className="pick-name">
                      <b>{s.need - s.have}×</b> {swatch(s.colour)} {s.colour || 'any colour'} {s.name} <small className="muted mono">{s.partNum}</small>
                      <small className="pick-detail">
                        needs {s.need}, you have {s.have}
                        {s.colour ? ` in ${s.colour}` : ''}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <button className="ghost small-btn no-print" onClick={() => download(`${build.title.slice(0, 40)} - to buy.csv`, shortCsv(list.colourShort, table), 'text/csv')}>
                Download as a Rebrickable parts list (CSV)
              </button>
            </section>
          ) : (
            group('Not in your collection', `${plural(list.missing.reduce((t, l) => t + l.want, 0), 'piece')} to find`, list.missing)
          )}
        </>
      )}
    </div>
  );
}
