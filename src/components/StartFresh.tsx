// Start fresh: clear the parts list, drawers and anything else chosen, to begin again. Try it first on a copy (the
// Try a change bar compares it with now), or do it straight away; either way Undo puts the project back as it was.
import { useState } from 'react';
import { FRESH_OPTIONS, freshProject, usualFresh, type FreshPart } from '../lib/fresh';
import type { Project } from '../lib/types';
import { PROFILE } from '../state';

const BEFORE_KEY = PROFILE === 'main' ? 'brick-stash-before-fresh' : `brick-stash-before-fresh:${PROFILE}`;
const recall = (): { at: string; project: Project } | null => {
  try {
    const raw = localStorage.getItem(BEFORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const remember = (v: { at: string; project: Project } | null) => {
  try {
    if (v) localStorage.setItem(BEFORE_KEY, JSON.stringify(v));
    else localStorage.removeItem(BEFORE_KEY);
  } catch {
    /* without storage, Project versions are the way back */
  }
};

export default function StartFresh({ project, trying, tryIt, apply }: { project: Project; trying: boolean; tryIt: (p: Project) => void; apply: (p: Project) => void }) {
  const [what, setWhat] = useState<Set<FreshPart>>(usualFresh);
  const [before, setBefore] = useState(recall);
  const flip = (k: FreshPart) => setWhat((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const clears = (k: FreshPart) => what.has(k) || (k === 'drawers' && what.has('storage'));
  const chosen = FRESH_OPTIONS.filter((o) => clears(o.k));
  const go = () => {
    if (!confirm(`Start fresh? This clears ${chosen.map((o) => o.label.toLowerCase()).join(', ')} on every device. Undo here puts it all back.`)) return;
    const saved = { at: new Date().toISOString(), project };
    remember(saved);
    setBefore(saved);
    apply(freshProject(project, what));
  };
  const undo = () => {
    if (!before || !confirm('Put the project back as it was before you started fresh? Anything done since is replaced.')) return;
    apply(before.project);
    remember(null);
    setBefore(null);
  };
  return (
    <section className="card start-fresh">
      <h3 className="card-title">Start fresh</h3>
      <p className="muted small">
        Import’s <b>Replace collection</b> only swaps the parts list: your drawers, sets kept built and parts added by hand stay. To begin again in this profile, choose what to clear (or make a new profile under Profiles, to keep this one as it is). Try it first to look round the app with it cleared, and keep it or throw it away.
      </p>
      <ul className="fresh-options">
        {FRESH_OPTIONS.map((o) => {
          const count = o.count(project);
          const forced = o.k === 'drawers' && what.has('storage');
          return (
            <li key={o.k}>
              <label>
                <input type="checkbox" checked={clears(o.k)} disabled={forced} onChange={() => flip(o.k)} /> <b>{o.label}</b>
                {count && <span className="muted"> · {count}</span>}
                <br />
                <small className="muted">{o.hint}</small>
              </label>
            </li>
          );
        })}
      </ul>
      {trying ? (
        <p className="muted small">You’re trying a change already. Keep it or throw it away first.</p>
      ) : (
        <div className="row">
          <button className="ghost" disabled={!chosen.length} onClick={() => tryIt(freshProject(project, what))}>
            Try it first
          </button>
          <button className="ghost danger" disabled={!chosen.length} onClick={go}>
            Start fresh
          </button>
        </div>
      )}
      {before && !trying && (
        <div className="banner warn">
          <div className="row">
            <span>
              You started fresh at {new Date(before.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.
            </span>
            <button className="ghost" onClick={undo}>
              Undo start fresh
            </button>
            <button
              className="link small"
              onClick={() => {
                remember(null);
                setBefore(null);
              }}
            >
              Forget it
            </button>
          </div>
        </div>
      )}
      <p className="muted small">Undo works on this device. On any device, Versions below has the project as it was at the start of each day.</p>
    </section>
  );
}
