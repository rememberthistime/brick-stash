import { useCallback, useEffect, useRef, useState } from 'react';
import { startupAction } from './lib/sync';
import type { Catalog, Project } from './lib/types';
import { DEFAULT_KEEP_OUT, DEFAULT_SETTINGS, EMPTY_BASIS, EMPTY_SETUP } from './lib/types';

const KEY = 'brick-stash-project';
/** The server version this browser last agreed with */
const KEY_REV = 'brick-stash-rev';
/** Set while this browser holds edits the server hasn't confirmed */
const KEY_DIRTY = 'brick-stash-dirty';

export const emptyProject = (): Project => ({ version: 1, rows: [], units: [], spaces: [], settings: DEFAULT_SETTINGS, volumeOverrides: {}, excluded: [], keepOut: DEFAULT_KEEP_OUT, moves: [], basis: EMPTY_BASIS, measurements: [], setup: EMPTY_SETUP });

/** A project as saved by any version, with anything added since filled in */
export const withDefaults = (p: Project): Project => ({ ...emptyProject(), ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings }, setup: { ...EMPTY_SETUP, ...p.setup } });

function load(): Project {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      return withDefaults(JSON.parse(raw) as Project);
    }
  } catch {
    /* storage unavailable or corrupt — start fresh */
  }
  return emptyProject();
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function recall(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export type SyncStatus = 'ok' | 'offline' | 'conflict';

const SAVE_AFTER_MS = 800;
const RETRY_EVERY_MS = 15000;

/**
 * The server holds the project, so every device sees the same one. This browser keeps a copy too, so nothing is
 * lost if the server is off: edits it hasn't confirmed are sent once it's back. Saving stops rather than overwrite
 * a newer version from another device.
 */
export function useProject() {
  const [project, setProject] = useState<Project>(load);
  const [sync, setSync] = useState<SyncStatus>('ok');
  const latest = useRef(project);
  latest.current = project;
  /** the version the server is known to hold */
  const confirmed = useRef<Project | null>(null);
  const rev = useRef(recall(KEY_REV));
  const ready = useRef(false);
  const blocked = useRef(false);
  const started = useRef(false);
  const saving = useRef(Promise.resolve());

  const push = useCallback(() => {
    saving.current = saving.current.then(async () => {
      const sending = latest.current;
      if (blocked.current || sending === confirmed.current) return;
      try {
        const r = await fetch('/api/project', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Base-Rev': rev.current ?? '' }, body: JSON.stringify(sending) });
        if (r.status === 409) {
          blocked.current = true;
          setSync('conflict');
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        rev.current = (await r.json()).rev as string;
        remember(KEY_REV, rev.current);
        confirmed.current = sending;
        if (latest.current === sending) remember(KEY_DIRTY, null);
        setSync('ok');
      } catch {
        setSync('offline');
      }
    });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const r = await fetch('/api/project');
        if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
        const serverRev = r.ok ? r.headers.get('X-Rev') : null;
        const local = latest.current;
        const action = startupAction({ hasLocal: local.rows.length > 0 || local.units.length > 0, dirty: recall(KEY_DIRTY) !== null, savedRev: rev.current, serverRev });
        if (action === 'conflict') {
          blocked.current = true;
          setSync('conflict');
        } else if (action === 'useServer') {
          const fromServer = withDefaults((await r.json()) as Project);
          confirmed.current = fromServer;
          rev.current = serverRev;
          remember(KEY_REV, serverRev);
          setProject(fromServer);
        } else {
          rev.current = serverRev;
          if (action === 'pushLocal') push();
          else confirmed.current = local;
        }
      } catch {
        setSync('offline');
      }
      ready.current = true;
    })();
  }, [push]);

  useEffect(() => {
    remember(KEY, JSON.stringify(project));
    if (!ready.current || project === confirmed.current) return;
    remember(KEY_DIRTY, '1');
    const timer = setTimeout(push, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [project, push]);

  useEffect(() => {
    if (sync !== 'offline') return;
    const timer = setInterval(push, RETRY_EVERY_MS);
    return () => clearInterval(timer);
  }, [sync, push]);

  /** Give up this browser's unsent edits for the version on the server */
  const takeServerCopy = () => {
    remember(KEY_DIRTY, null);
    location.reload();
  };

  const update = (patch: Partial<Project> | ((p: Project) => Partial<Project>)) =>
    setProject((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));
  return { project, update, replace: setProject, sync, takeServerCopy };
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/data/parts.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setCatalog)
      .catch((e) => setError(`Couldn't load the parts catalogue (${e.message}). Run "npm run fetch-data".`));
  }, []);
  return { catalog, error };
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export function download(filename: string, data: string | Uint8Array, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
