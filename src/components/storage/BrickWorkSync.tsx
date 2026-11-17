// "File in Brick Work": make Brick Work's storages match the drawers recorded here, and file its loose stock in them,
// after showing exactly what would change.
import { useEffect, useState } from 'react';
import { planSync, type BwLine, type BwStorage, type SyncPlan } from '../../lib/brickworkSync';
import type { PlacedPocket, SetupComp } from '../../lib/setup';
import type { Catalog, Setup, StorageUnit } from '../../lib/types';

interface Props {
  units: StorageUnit[];
  comps: SetupComp[];
  setup: Setup;
  pockets: PlacedPocket[];
  catalog: Catalog | null;
}

interface Status {
  configured: boolean;
  ok?: boolean;
  url?: string;
  scopes?: string[];
  error?: string;
}

interface Result {
  created: number;
  updated: number;
  moved: number;
  errors: string[];
}

const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString()} ${x === 1 ? one : many}`;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}.`);
  return body as T;
}

export function useBrickWorkStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    fetch('/api/brickwork')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  return status;
}

export default function BrickWorkSync({ units, comps, setup, pockets, catalog, status }: Props & { status: Status }) {
  const [data, setData] = useState<{ stock: BwLine[]; storages: BwStorage[] } | null>(null);
  const [includeTheirs, setIncludeTheirs] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const canWrite = !!status.scopes?.some((s) => s === 'write' || s === 'admin');
  const plan: SyncPlan | null = data ? planSync(units, comps, setup, pockets, catalog, data.stock, data.storages, includeTheirs) : null;

  /** Read Brick Work afresh. After applying, the result of that stays on show. */
  const look = async (keepResult = false) => {
    setBusy('Reading Brick Work…');
    setError('');
    if (!keepResult) setResult(null);
    try {
      const [stock, storages] = await Promise.all([getJson<{ lines: BwLine[] }>('/api/brickwork/stock'), getJson<{ storages: BwStorage[] }>('/api/brickwork/storages')]);
      setData({ stock: stock.lines, storages: storages.storages });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  };

  const apply = async () => {
    if (!plan) return;
    const moving = plan.moves.reduce((t, m) => t + m.stockIds.length, 0);
    const making = plan.storages.filter((s) => s.change !== 'none').length;
    if (!confirm(`In Brick Work: ${n(making, 'storage')} made or updated, and ${n(moving, 'stock line')} filed in them. Each change can be undone in Brick Work. Go ahead?`)) return;
    setBusy('Writing to Brick Work…');
    setError('');
    try {
      const body = { storages: plan.storages.map(({ key, name, type, parentKey }) => ({ key, name, type, parentKey })), moves: plan.moves };
      setResult(await getJson<Result>('/api/brickwork/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      await look(true);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  };

  if (!status.ok) return <p className="small warn-text">Brick Work is set up but not answering: {status.error}</p>;
  const moving = plan ? plan.moves.reduce((t, m) => t + m.stockIds.length, 0) : 0;
  const changes = plan ? plan.storages.filter((s) => s.change !== 'none') : [];

  return (
    <div className="bw-sync">
      <p className="muted small">
        Makes Brick Work’s storage match the drawers recorded here (units as cabinets, drawers as drawers, and a bin for each pocket of a divided drawer), then files Brick Work’s loose parts in them, so its Part Runner walks your drawers in order. It only changes storages it made, and only moves parts that aren’t stored or are in one of those. Nothing is written until you say so, and each change can be undone in Brick Work.
      </p>
      {!canWrite && <p className="small warn-text">The Brick Work token can only read. Filing parts needs a token with the write scope.</p>}
      <div className="row">
        <button className="ghost small-btn" disabled={!!busy} onClick={() => void look()}>
          {data ? 'Look again' : 'See what would change'}
        </button>
        {plan && canWrite && (moving > 0 || changes.length > 0) && (
          <button className="small-btn" disabled={!!busy} onClick={() => void apply()}>
            Apply in Brick Work
          </button>
        )}
        {busy && <span className="muted small">{busy}</span>}
      </div>
      {error && <p className="small warn-text">{error}</p>}
      {result && (
        <p className="small" aria-live="polite">
          Done: {n(result.created, 'storage')} made, {n(result.updated, 'updated', 'updated')}, {n(result.moved, 'stock line')} filed.
          {result.errors.length > 0 && <span className="warn-text"> {n(result.errors.length, 'problem')}: {result.errors.slice(0, 3).join('; ')}</span>}
        </p>
      )}
      {plan && (
        <ul className="small bw-plan">
          <li>
            <b>Storages:</b> {plan.storages.length} for your recorded drawers. {changes.length ? `${changes.filter((s) => s.change === 'create').length.toLocaleString()} to make, ${changes.filter((s) => s.change === 'update').length.toLocaleString()} to rename or move.` : 'All already match.'}
            {plan.unused.length > 0 && ` ${n(plan.unused.length, 'storage')} made earlier no longer match a drawer and are left as they are (${plan.unused.slice(0, 4).map((s) => s.name).join(', ')}${plan.unused.length > 4 ? '…' : ''}).`}
          </li>
          <li>
            <b>Loose parts:</b> of {n(plan.lines, 'stock line')}, {moving.toLocaleString()} would be filed ({plan.fromUnstored.toLocaleString()} not stored now, {plan.fromOurs.toLocaleString()} in another drawer{includeTheirs ? `, ${plan.fromTheirs.toLocaleString()} from your own places` : ''}), and {plan.alreadyFiled.toLocaleString()} are already in the right place.
          </li>
          <li>
            <b>Left alone:</b> {n(plan.notInDrawers, 'line')} whose part isn’t in a recorded drawer, {n(plan.inLots, 'line')} in a lot
            {!includeTheirs && `, and ${n(plan.inTheirPlaces, 'line')} filed in places you made in Brick Work`}.
          </li>
          {plan.splitParts > 0 && (
            <li>
              <b>Split parts:</b> {n(plan.splitParts, 'part')} recorded in more than one pocket. Brick Work files each part’s lines in one place, so they go to the pocket holding most of it.
            </li>
          )}
          {(plan.inTheirPlaces > 0 || includeTheirs) && (
            <li>
              <label>
                <input type="checkbox" checked={includeTheirs} onChange={(e) => setIncludeTheirs(e.target.checked)} /> Also move parts filed in places you made in Brick Work
              </label>
            </li>
          )}
        </ul>
      )}
      <p className="muted small">The parts of sets you own stay with their sets in Brick Work: only loose parts are filed.</p>
    </div>
  );
}
