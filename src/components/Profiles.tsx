// Profiles: more than one setup on the same server, each with its own parts, storage, drawers and daily versions.
// Each device picks the one it uses; the main profile is the project as it always was.
import { useEffect, useState } from 'react';
import { freshProject, usualFresh } from '../lib/fresh';
import type { Project } from '../lib/types';
import { PROFILE, emptyProject, switchProfile } from '../state';

export interface Profile {
  id: string;
  name: string;
}

/** The profiles on the server, or just the main one while they load or if the server can't be reached */
export function useProfiles(): [Profile[], () => void] {
  const [list, setList] = useState<Profile[]>([{ id: 'main', name: 'My stash' }]);
  const [n, setN] = useState(0);
  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((l: Profile[]) => Array.isArray(l) && l.length && setList(l))
      .catch(() => {});
  }, [n]);
  return [list, () => setN((x) => x + 1)];
}

type Start = 'empty' | 'storage' | 'copy';
const STARTS: { k: Start; label: string; hint: string }[] = [
  { k: 'storage', label: 'Same storage, nothing in it', hint: 'Your units, spaces and plan settings, with no parts and no drawers recorded' },
  { k: 'empty', label: 'Completely empty', hint: 'Start from nothing' },
  { k: 'copy', label: 'A copy of this profile', hint: 'Everything as it is now, to change without touching this one' },
];

export default function Profiles({ project, profiles, reload }: { project: Project; profiles: Profile[]; reload: () => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState<Start>('storage');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = profiles.find((p) => p.id === PROFILE);

  const call = async (url: string, init: RequestInit) => {
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
    return body;
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const { id } = await call('/api/profiles', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      const first = start === 'copy' ? project : start === 'storage' ? freshProject(project, new Set([...usualFresh(), 'choices'])) : emptyProject();
      await call(`/api/project?profile=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(first) });
      switchProfile(id);
    } catch (e) {
      setError(`Couldn’t make the profile: ${(e as Error).message}`);
      setBusy(false);
    }
  };
  const rename = async (p: Profile) => {
    const to = prompt('A new name for this profile', p.name)?.trim();
    if (!to || to === p.name) return;
    try {
      await call(`/api/profiles/${p.id}`, { method: 'PATCH', body: JSON.stringify({ name: to }) });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (p: Profile) => {
    if (!confirm(`Remove the profile “${p.name}”? It disappears from every device. It’s moved aside on the server (in removed-profiles), not deleted.`)) return;
    try {
      await call(`/api/profiles/${p.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card profiles">
      <h3 className="card-title">Profiles</h3>
      <p className="muted small">
        Separate setups side by side, each with its own parts, storage, drawers and versions: a fresh start without losing what you have, or someone else’s collection. Each device chooses the one it uses.
      </p>
      <ul className="profile-list">
        {profiles.map((p) => (
          <li key={p.id} className={p.id === PROFILE ? 'on' : ''}>
            <b>{p.name}</b>
            {p.id === PROFILE ? (
              <span className="muted small"> · this device is using it</span>
            ) : (
              <button className="ghost" onClick={() => switchProfile(p.id)}>
                Use this one
              </button>
            )}
            <button className="link small" onClick={() => rename(p)}>
              Rename
            </button>
            {p.id !== 'main' && p.id !== PROFILE && (
              <button className="link small danger" onClick={() => remove(p)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <h4>New profile</h4>
      <div className="row">
        <input placeholder="Name, such as “Second go”" value={name} onChange={(e) => setName(e.target.value)} aria-label="Profile name" />
      </div>
      <div className="fresh-options">
        {STARTS.map((s) => (
          <label key={s.k}>
            <input type="radio" name="profile-start" checked={start === s.k} onChange={() => setStart(s.k)} /> <b>{s.label}</b>
            <br />
            <small className="muted">{s.k === 'copy' && current ? `Everything in “${current.name}” as it is now, to change without touching it` : s.hint}</small>
          </label>
        ))}
      </div>
      <div className="row">
        <button disabled={!name.trim() || busy} onClick={create}>
          {busy ? 'Making it…' : 'Make it and use it here'}
        </button>
      </div>
      {error && <p className="banner error">{error}</p>}
    </section>
  );
}
