import { useEffect, useState } from 'react';
import { withDefaults } from '../state';
import type { Project } from '../lib/types';

interface Version {
  name: string;
  /** 2026-11-10 */
  date: string;
  size: number;
}

const dayOf = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** The versions the server keeps: the project as it stood before the first change of each day, for 30 days */
export default function Versions({ restore, close }: { restore: (p: Project) => void; close: () => void }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/versions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'The server needs updating before it keeps earlier versions.' : `The server said ${r.status}.`))))
      .then(setVersions)
      .catch((e) => setError(e instanceof TypeError ? 'Can’t reach the Brick Stash server.' : e.message));
  }, []);

  const bringBack = async (v: Version) => {
    if (!confirm(`Go back to the project as it was at the start of ${dayOf(v.date)}? Everything changed since then is replaced, on every device. Use Save project first if you might want today’s changes back.`)) return;
    try {
      const r = await fetch(`/api/versions/${v.name}`);
      if (!r.ok) throw new Error(`The server said ${r.status}.`);
      const p = (await r.json()) as Project;
      if (p.version !== 1 || !Array.isArray(p.rows)) throw new Error('That isn’t a Brick Stash project.');
      restore(withDefaults(p));
      close();
    } catch (e) {
      setError(`Couldn’t load that version: ${(e as Error).message}`);
    }
  };

  return (
    <section className="card versions no-print">
      <div className="versions-head">
        <h2>Earlier versions</h2>
        <button className="ghost" onClick={close}>
          Close
        </button>
      </div>
      <p className="muted small">The server keeps the project as it stood before the first change of each day, for 30 days.</p>
      {error && <div className="banner warn">{error}</div>}
      {versions && !versions.length && <p className="muted">None yet. The first is kept the next time the project changes.</p>}
      {versions?.map((v) => (
        <div key={v.name} className="versions-row">
          <span>
            Start of <b>{dayOf(v.date)}</b>
          </span>
          <span className="muted small">{Math.max(1, Math.round(v.size / 1024)).toLocaleString()} KB</span>
          <button className="link" onClick={() => bringBack(v)}>
            Go back to this
          </button>
        </div>
      ))}
    </section>
  );
}
