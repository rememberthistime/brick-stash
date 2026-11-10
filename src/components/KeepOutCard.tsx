import { useMemo, useState } from 'react';
import type { KeepOut, Part, Project } from '../lib/types';
import { familyLabel } from '../lib/planner';
import { isBulky, noFitTest, pickPart, pieceVolume, toggleFamily, type KeptPart, type KeptSummary } from '../lib/keepOut';
import PartImage from './PartImage';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  /** every part after built sets are subtracted, kept out or not */
  parts: Part[];
  kept: KeptPart[];
  summary: KeptSummary;
}

const MAX_LISTED = 60;
const MAX_FOUND = 12;

export default function KeepOutCard({ project, update, parts, kept, summary }: Props) {
  const k = project.keepOut;
  const [query, setQuery] = useState('');
  const set = (keepOut: KeepOut) => update({ keepOut });
  const keptNums = useMemo(() => new Set(kept.map((x) => x.part.partNum)), [kept]);
  const pick = (p: Part, keep: boolean) => set(pickPart(k, p, keep, project.units));

  const fitsNowhere = useMemo(() => noFitTest(project.units), [project.units]);
  const bulky = useMemo(() => parts.filter((p) => isBulky(p, k) || fitsNowhere(p)).sort((a, b) => pieceVolume(b) - pieceVolume(a)), [parts, k, fitsNowhere]);
  const bulkyVolume = bulky.reduce((t, p) => t + pieceVolume(p) * p.qty, 0);

  const q = query.trim().toLowerCase();
  const found = q ? parts.filter((p) => p.partNum.toLowerCase() === q || p.name.toLowerCase().includes(q)).slice(0, MAX_FOUND) : [];
  const picked = kept.filter((x) => x.reason === 'picked');

  const row = (p: Part) => (
    <label key={p.partNum} className={`keep-row ${keptNums.has(p.partNum) ? 'out' : ''}`}>
      <input type="checkbox" checked={keptNums.has(p.partNum)} onChange={(e) => pick(p, e.target.checked)} title="Keep out of the plan" />
      <PartImage partNum={p.partNum} size={32} title={p.name} />
      <span className="keep-name">
        {p.name}
        <small className="muted">
          {' '}
          {p.partNum}
          {fitsNowhere(p) ? ' · too big for any of your compartments' : ''}
        </small>
      </span>
      <span className="muted small nowrap">
        {p.qty} × {Math.round(pieceVolume(p))} cm³
      </span>
    </label>
  );

  return (
    <section className="card">
      <h2>Kept out of the plan</h2>
      <p className="muted">For parts that live somewhere else, so they don't take up room in the plan.</p>
      {summary.pieces > 0 ? (
        <div className="banner">
          <b>
            {summary.pieces.toLocaleString()} pieces, about {(summary.volume / 1000).toFixed(1)} L
          </b>{' '}
          kept out: {summary.labels.join(', ')}.
        </div>
      ) : (
        <p className="muted small">Nothing yet. Untick a whole family in the list above, or use the options below.</p>
      )}
      {k.families.length > 0 && (
        <div className="keep-chips">
          {k.families.map((f) => (
            <button key={f} className="key-item" title="Put back in the plan" onClick={() => set(toggleFamily(k, f))}>
              {familyLabel(f)} ✕
            </button>
          ))}
        </div>
      )}

      <h3>Bulky one-offs</h3>
      <p className="muted small">Moulded hulls, fuselages, train bases and the like, which don't sit neatly in a tray.</p>
      <label className="keep-rule">
        <input type="checkbox" checked={k.bulky} onChange={(e) => set({ ...k, bulky: e.target.checked })} /> <b>Keep them out</b>
      </label>
      <div className="keep-rule">
        Parts of at least
        <input type="number" min={5} step={10} value={k.bulkyOver} onChange={(e) => set({ ...k, bulkyOver: Math.max(5, Number(e.target.value) || 5) })} /> cm³ each, when I have no more than
        <input type="number" min={1} value={k.bulkyMaxQty} onChange={(e) => set({ ...k, bulkyMaxQty: Math.max(1, Number(e.target.value) || 1) })} /> of them.
      </div>
      <details>
        <summary>
          {bulky.length} parts match ({(bulkyVolume / 1000).toFixed(1)} L)
        </summary>
        <p className="muted small">Tick or untick any of them to overrule the setting above.</p>
        <div className="keep-list">{bulky.slice(0, MAX_LISTED).map(row)}</div>
        {bulky.length > MAX_LISTED && <p className="muted small">Showing the largest {MAX_LISTED}. Raise the size above to narrow the list.</p>}
      </details>

      <h3>Anything else</h3>
      <input className="search keep-search" placeholder="Find a part by name or number, e.g. train or 3811" value={query} onChange={(e) => setQuery(e.target.value)} />
      {q && (found.length ? <div className="keep-list">{found.map(row)}</div> : <p className="muted small">No match in your collection.</p>)}
      {picked.length > 0 && (
        <details>
          <summary>{picked.length} picked by hand</summary>
          <div className="keep-list">{picked.slice(0, MAX_LISTED).map((x) => row(x.part))}</div>
        </details>
      )}
      <p className="muted small keep-foot">You can also open a family in the list above and untick single parts.</p>
    </section>
  );
}
