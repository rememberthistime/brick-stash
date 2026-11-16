import { useEffect, useMemo, useRef, useState } from 'react';
import { download, useCatalog, useProject, withDefaults } from './state';
import { mergeToParts, partVolume, subtractParts } from './lib/collection';
import { splitKeptOut, summariseKept } from './lib/keepOut';
import { calibrationFrom, withCalibration } from './lib/measure';
import { setupComps, setupMeasurements } from './lib/setup';
import { buildTree, expandCompartments } from './lib/planner';
import type { Project } from './lib/types';
import CollectionTab from './components/CollectionTab';
import StorageTab from './components/StorageTab';
import StorageView from './components/storage/StorageView';
import Versions from './components/Versions';

type Tab = 'collection' | 'storage' | 'drawers';

export default function App() {
  const { catalog, error } = useCatalog();
  const { project, update, replace, sync, takeServerCopy } = useProject();
  const [tab, setTabState] = useState<Tab>('collection');
  // Most visits are to put parts away, so the app shows My storage once there's a project to show, unless a tab has
  // been chosen by then. The project can arrive from the server a moment after the first draw.
  const chosen = useRef(false);
  const setTab = (t: Tab) => {
    chosen.current = true;
    setTabState(t);
  };
  const ready = project.units.length > 0 && project.rows.length > 0;
  useEffect(() => {
    if (ready && !chosen.current) {
      chosen.current = true;
      setTabState('drawers');
    }
  }, [ready]);
  const [versions, setVersions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const owned = useMemo(() => mergeToParts(project.rows, catalog, project.volumeOverrides), [project.rows, catalog, project.volumeOverrides]);
  const subtraction = useMemo(
    () => subtractParts(owned, project.excluded.filter((e) => e.enabled).flatMap((e) => e.rows), catalog),
    [owned, project.excluded, catalog],
  );
  // With "Use these fills" on, how full your recorded drawers really are corrects every part's estimated size
  const calibration = useMemo(() => {
    if (!project.setup.useFills) return null;
    const spaces = setupComps(expandCompartments(project.units, project.settings), project.setup.open);
    return calibrationFrom(setupMeasurements(project.setup, spaces, subtraction.parts), project.settings.volumeScale);
  }, [project.setup, project.units, project.settings, subtraction.parts]);
  const calibrated = useMemo(() => withCalibration(subtraction.parts, calibration), [subtraction.parts, calibration]);
  const { planned: parts, kept } = useMemo(() => splitKeptOut(calibrated, project.keepOut, project.units), [calibrated, project.keepOut, project.units]);
  const keptSummary = useMemo(() => summariseKept(kept, project.keepOut, project.settings.volumeScale), [kept, project.keepOut, project.settings.volumeScale]);
  // The Collection tab lists everything, kept out or not, so any of it can be switched back
  const everything = useMemo(() => buildTree(calibrated, catalog?.categories ?? {}, project.settings.volumeScale), [calibrated, catalog, project.settings.volumeScale]);
  const totals = useMemo(() => ({ pieces: parts.reduce((t, p) => t + p.qty, 0), volume: parts.reduce((t, p) => t + partVolume(p, project.settings.volumeScale), 0) }), [parts, project.settings.volumeScale]);

  const importProject = async (f: File) => {
    try {
      const p = JSON.parse(await f.text()) as Project;
      if (p.version !== 1 || !Array.isArray(p.rows)) throw new Error('not a Brick Stash project');
      // Opening a file replaces the project on every device, so it shouldn't happen on a stray click
      const has = project.rows.length || project.units.length;
      if (has && !confirm(`Replace your project with ${f.name}? What's here now goes, on every device. Earlier versions lists what can be brought back.`)) return;
      replace(withDefaults(p));
    } catch (e) {
      alert(`Couldn't open that file: ${(e as Error).message}`);
    }
  };

  const recorded = Object.values(project.setup.drawers).filter((d) => d.length).length;
  const counts: Record<Tab, string> = {
    collection: parts.length ? `${totals.pieces.toLocaleString()} pcs` : '',
    storage: project.units.length ? `${project.units.length} units` : '',
    drawers: recorded ? `${recorded} recorded` : '',
  };

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="logo" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <div>
            <h1>Brick Stash</h1>
            <p>Storage planner for LEGO® collections — by type, with room to grow</p>
          </div>
        </div>
        <nav className="tabs">
          {(['collection', 'storage', 'drawers'] as Tab[]).map((t, i) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              <span className="step">{i + 1}</span>
              {t === 'collection' ? 'Collection' : t === 'storage' ? 'Storage' : 'My storage'}
              {counts[t] && <span className="badge">{counts[t]}</span>}
            </button>
          ))}
        </nav>
        <div className="project-actions">
          <button className="ghost" onClick={() => download('brick-stash-project.json', JSON.stringify(project, null, 2), 'application/json')}>
            Save project
          </button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>
            Open…
          </button>
          <button className="ghost" onClick={() => setVersions((v) => !v)}>
            Earlier versions…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Cleared so choosing the same file again still counts as a change
              e.target.value = '';
              if (f) void importProject(f);
            }}
          />
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {sync === 'offline' && <div className="banner warn no-print sync-banner">Can’t reach the Brick Stash server. Your changes are safe in this browser and will be sent when it’s back.</div>}
      {sync === 'conflict' && (
        <div className="banner error no-print">
          This project was changed on another device, so changes here aren’t being saved. <b>Save project</b> keeps a copy of what’s on this screen.{' '}
          <button className="link" onClick={takeServerCopy}>
            Load the latest version
          </button>
        </div>
      )}

      {versions && <Versions restore={replace} close={() => setVersions(false)} />}

      <main>
        {tab === 'collection' && <CollectionTab project={project} update={update} catalog={catalog} parts={parts} totals={totals} everything={everything} subtraction={subtraction} kept={kept} keptSummary={keptSummary} />}
        {tab === 'storage' && <StorageTab project={project} update={update} />}
        {tab === 'drawers' && <StorageView project={project} update={update} parts={parts} keptOut={kept.map((k) => k.part)} catalog={catalog} goTo={setTab} />}
      </main>

      <footer className="no-print">
        Part data from <a href="https://rebrickable.com/downloads/">Rebrickable</a>
        {catalog ? ` (catalogue ${catalog.built})` : ''}. Volumes are estimates. LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this tool.
      </footer>
    </div>
  );
}
