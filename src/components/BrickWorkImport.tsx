// Importing the collection from Brick Work, the collection manager, when the server has been given its address and
// a token. The token stays on the server; this only asks the server to fetch.
import { useEffect, useState } from 'react';
import type { InventoryRow } from '../lib/types';

interface Status {
  configured: boolean;
  ok?: boolean;
  url?: string;
  token?: string | null;
  scopes?: string[];
  error?: string;
}

interface Collection {
  rows: InventoryRow[];
  looseLines: number;
  sets: number;
  setLines: number;
  unnamed: number;
}

export default function BrickWorkImport({ hasRows, onImport }: { hasRows: boolean; onImport: (rows: InventoryRow[], note: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/brickwork')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // A server from before this, or one with no Brick Work set up, shows nothing
  if (!status?.configured) return null;

  const importNow = async () => {
    if (hasRows && !confirm('Replace your collection with what’s in Brick Work? Sets you keep built, parts kept out and your drawers are kept.')) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/brickwork/collection');
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}.`);
      const c = body as Collection;
      const pieces = c.rows.reduce((t, x) => t + x.qty, 0);
      onImport(
        c.rows,
        `Loaded ${pieces.toLocaleString()} pieces from Brick Work: ${c.looseLines.toLocaleString()} loose lines and the parts of ${c.sets.toLocaleString()} ${c.sets === 1 ? 'set' : 'sets'}.${c.unnamed ? ` ${c.unnamed} lines had no Rebrickable or BrickLink number, so were left out.` : ''} Sets you keep built come off as before.`,
      );
    } catch (e) {
      setError(e instanceof TypeError ? 'Couldn’t reach the Brick Stash server.' : (e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="brickwork">
      <h3>From Brick Work</h3>
      {status.ok ? (
        <>
          <p className="muted small">
            Connected to {status.url} as <b>{status.token ?? 'a token'}</b>. Importing takes your loose parts and the parts of every set you own there; sets you keep built come off below, as with a Rebrickable export.
          </p>
          <button disabled={busy} onClick={() => void importNow()}>
            {busy ? 'Reading Brick Work…' : 'Import my collection from Brick Work'}
          </button>
        </>
      ) : (
        <p className="small warn-text">Brick Work is set up but not answering: {status.error}</p>
      )}
      {error && <p className="small warn-text">{error}</p>}
    </div>
  );
}
