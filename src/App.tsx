import { useMemo, useRef, useState } from 'react';
import { download, useCatalog, useProject, withDefaults } from './state';
import { mergeToParts, subtractParts } from './lib/collection';
import { splitKeptOut, summariseKept } from './lib/keepOut';
import { applyMeasured, calibrationFrom, withCalibration } from './lib/measure';
import { lockedPlan, suggestHomes } from './lib/lock';
import { applyMoves, basisChanges, basisOf } from './lib/moves';
import { setupComps, setupMeasurements } from './lib/setup';
import { buildTree, leaves, plan as runPlan } from './lib/planner';
import type { Project } from './lib/types';
import CollectionTab from './components/CollectionTab';
import StorageTab from './components/StorageTab';
import PlanTab from './components/PlanTab';
import SetupTab from './components/SetupTab';
import Versions from './components/Versions';

type Tab = 'collection' | 'storage' | 'plan' | 'setup';

const NO_CATEGORIES: Record<string, string> = {};

export default function App() {
  const { catalog, error } = useCatalog();
  const { project, update, replace, sync, takeServerCopy } = useProject();
  const [tab, setTab] = useState<Tab>('collection');
  const [versions, setVersions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const owned = useMemo(() => mergeToParts(project.rows, catalog, project.volumeOverrides), [project.rows, catalog, project.volumeOverrides]);
  const subtraction = useMemo(
    () => subtractParts(owned, project.excluded.filter((e) => e.enabled).flatMap((e) => e.rows), catalog),
    [owned, project.excluded, catalog],
  );
  // Volumes use the calibration the plan was last re-planned with, so measuring a drawer doesn't reshuffle anything
  const calibrated = useMemo(() => withCalibration(subtraction.parts, project.basis.calibration), [subtraction.parts, JSON.stringify(project.basis.calibration)]);
  const { planned: parts, kept, picked, forPlanning } = useMemo(() => splitKeptOut(calibrated, project.keepOut, project.units), [calibrated, project.keepOut, project.units]);
  const keptSummary = useMemo(() => summariseKept(kept, project.keepOut, project.settings.volumeScale), [kept, project.keepOut, project.settings.volumeScale]);
  // The Collection tab lists everything, kept out or not, so any of it can be switched back
  const everything = useMemo(() => buildTree(calibrated, catalog?.categories ?? {}, project.settings.volumeScale), [calibrated, catalog, project.settings.volumeScale]);
  // Manual changes only reshape the plan through a re-plan, so making one needn't run the planner again
  const basis = project.basis;
  const basisKey = JSON.stringify(basis);
  const leftOut = useMemo(() => new Set([...basis.out, ...Object.keys(basis.pins)]), [basisKey]);
  const planningKey = forPlanning.map((p) => p.partNum).join();
  const tree = useMemo(
    () => buildTree(forPlanning.filter((p) => !leftOut.has(p.partNum)), catalog?.categories ?? {}, project.settings.volumeScale, basis.together),
    [planningKey, basisKey, calibrated, catalog, project.settings.volumeScale],
  );
  const detached = useMemo(
    () => leaves(buildTree(forPlanning.filter((p) => leftOut.has(p.partNum)), catalog?.categories ?? {}, project.settings.volumeScale)).filter((l) => l.part),
    [planningKey, basisKey, calibrated, catalog, project.settings.volumeScale],
  );
  // A locked plan is read back from where everything was when it was locked, and the planner isn't run at all
  const lock = project.lock ?? null;
  const lockTree = useMemo(
    () => (lock ? buildTree(forPlanning, catalog?.categories ?? {}, project.settings.volumeScale) : null),
    [!!lock, planningKey, calibrated, catalog, project.settings.volumeScale],
  );
  const basePlan = useMemo(
    () => (lock && lockTree ? lockedPlan(lock, lockTree, project.units, project.settings) : runPlan(tree, project.units, project.settings, new Set(Object.values(basis.pins)))),
    [lock, lockTree, tree, project.units, project.settings, basisKey],
  );
  const { plan: movedPlan, stale: staleMoves, expanded } = useMemo(() => applyMoves(basePlan, project.moves, picked, lock ? [] : detached), [basePlan, project.moves, picked, detached, !!lock]);
  const homes = useMemo(() => (lock && lockTree ? suggestHomes(movedPlan, lockTree, project.settings) : []), [!!lock, lockTree, movedPlan, project.settings]);
  const plan = useMemo(() => applyMeasured(movedPlan, project.measurements), [movedPlan, project.measurements]);
  // A recorded setup only teaches the planner if the user has said it should
  const fromSetup = useMemo(() => (project.setup.useFills ? setupMeasurements(project.setup, setupComps(plan.compartments.map((c) => c.comp), project.setup.open), parts) : []), [project.setup, plan.compartments, parts]);
  const measuredCalibration = useMemo(() => calibrationFrom([...project.measurements, ...fromSetup], project.settings.volumeScale), [project.measurements, fromSetup, project.settings.volumeScale]);
  const currentBasis = useMemo(() => basisOf(expanded, picked, measuredCalibration), [expanded, picked, measuredCalibration]);
  // Re-planning is what a lock holds off, so there's nothing pending while one is on
  const pendingChanges = lock ? 0 : basisChanges(basis, currentBasis);

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

  const counts = {
    collection: parts.length ? `${plan.stats.pieces.toLocaleString()} pcs` : '',
    storage: project.units.length ? `${plan.compartments.length} spaces` : '',
    plan: plan.stats.overflowVolume > 0 ? '⚠' : '',
    setup: Object.keys(project.setup.drawers).length ? `${Object.keys(project.setup.drawers).length} recorded` : '',
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
          {(['collection', 'storage', 'plan', 'setup'] as Tab[]).map((t, i) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              <span className="step">{i + 1}</span>
              {t === 'collection' ? 'Collection' : t === 'storage' ? 'Storage' : t === 'plan' ? 'Plan' : 'My setup'}
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
        {tab === 'collection' && <CollectionTab project={project} update={update} catalog={catalog} parts={parts} totals={plan.stats} everything={everything} subtraction={subtraction} kept={kept} keptSummary={keptSummary} />}
        {tab === 'storage' && <StorageTab project={project} update={update} plan={plan} />}
        {tab === 'setup' && <SetupTab project={project} update={update} plan={plan} parts={parts} categories={catalog?.categories ?? NO_CATEGORIES} goTo={setTab} />}
        {tab === 'plan' && <PlanTab project={project} update={update} plan={plan} parts={parts} goTo={setTab} keptSummary={keptSummary} staleMoves={staleMoves} kept={kept} pendingChanges={pendingChanges} currentBasis={currentBasis} expandedMoves={expanded} homes={homes} catalog={catalog} />}
      </main>

      <footer className="no-print">
        Part data from <a href="https://rebrickable.com/downloads/">Rebrickable</a>
        {catalog ? ` (catalogue ${catalog.built})` : ''}. Volumes are estimates. LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this tool.
      </footer>
    </div>
  );
}
