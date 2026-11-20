import { useMemo, useRef, useState, type ReactNode } from 'react';
import { download, useCatalog, useProject, withDefaults } from './state';
import { collectionRows, mergeToParts, partVolume, subtractParts } from './lib/collection';
import { splitKeptOut, summariseKept } from './lib/keepOut';
import { calibrationFrom, withCalibration } from './lib/measure';
import { setupComps, setupMeasurements } from './lib/setup';
import { buildTree, expandCompartments } from './lib/planner';
import type { Project } from './lib/types';
import CollectionTab, { type CollectionPage } from './components/CollectionTab';
import StorageTab from './components/StorageTab';
import StorageView, { STORAGE_PAGES, type StoragePage } from './components/storage/StorageView';
import { useStorageModel } from './components/storage/model';
import { useSuggestions } from './components/storage/suggestionsSwitch';
import { LOOKS, setLook, useLook, type Look } from './look';
import { PlanSettings } from './components/storage/PlanSettings';
import { L, pct } from './components/storage/format';
import { PageHead, Sidebar, usePage, type Page } from './components/Shell';
import Versions from './components/Versions';
import { PartZoom } from './components/PartImage';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function App() {
  const { catalog, error } = useCatalog();
  const { project, update, replace, sync, takeServerCopy } = useProject();
  const ready = project.units.length > 0 && collectionRows(project).length > 0;
  const [page, setPage] = usePage(ready);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const owned = useMemo(() => mergeToParts(collectionRows(project), catalog, project.volumeOverrides), [project.rows, project.extraParts, catalog, project.volumeOverrides]);
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
  // The Parts page lists everything, kept out or not, so any of it can be switched back
  const everything = useMemo(() => buildTree(calibrated, catalog?.categories ?? {}, project.settings.volumeScale), [calibrated, catalog, project.settings.volumeScale]);
  const totals = useMemo(() => ({ pieces: parts.reduce((t, p) => t + p.qty, 0), volume: parts.reduce((t, p) => t + partVolume(p, project.settings.volumeScale), 0) }), [parts, project.settings.volumeScale]);
  const model = useStorageModel(project, parts, catalog);
  const { analysis, gaps, recordedHomes, layoutMoves } = model;
  const suggest = useSuggestions();
  const look = useLook();

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

  const storageReady = parts.length > 0 && project.units.length > 0;
  const built = project.excluded.filter((e) => e.enabled).length;
  const unsorted = analysis.unplaced.length;
  const withRoom = analysis.unplaced.filter((p) => recordedHomes.has(p.partNum)).length;
  const swaps = layoutMoves.reduce((t, r) => t + r.cycles.length, 0);
  const moves = analysis.suggestions.length;
  const overflow = gaps.plan.stats.overflowVolume;
  const n = (x: number) => (x ? x.toLocaleString() : '');
  const counts: Partial<Record<Page, ReactNode>> = {
    parts: n(parts.length),
    built: n(built),
    kept: n(kept.length),
    units: n(project.units.length),
    spaces: n(project.spaces.length),
    drawers: storageReady ? `${analysis.drawersRecorded}/${analysis.drawersTotal}` : '',
    'put-away': storageReady ? n(unsorted) : '',
    // Suggestions are counted only with the switch on, so with it off nothing nags
    moves: storageReady && suggest ? `${n(moves)}${moves && analysis.moreSuggestions ? '+' : ''}` : '',
    tidy: storageReady && suggest ? n(swaps) : '',
    review: storageReady && suggest ? n(analysis.findings.length) : '',
  };

  const heads: Record<Page, { headline: ReactNode; sub?: ReactNode }> = {
    parts: parts.length
      ? { headline: `${plural(parts.length, 'part type')}, ${totals.pieces.toLocaleString()} pieces`, sub: `About ${(totals.volume / 1000).toFixed(1)} L loose. Colours are merged, as parts are stored by type. Untick a family or part to keep it out of storage; click a family to see its parts.` }
      : { headline: 'No parts yet' },
    import: project.rows.length
      ? { headline: `${plural(project.rows.length, 'row')} loaded`, sub: 'Load a parts list from Rebrickable, BrickLink, Brickset or any spreadsheet, or add whole sets. Replace swaps the collection for the new list; Add puts it on top.' }
      : { headline: 'Start with your parts list', sub: 'Any spreadsheet saved as CSV works, as do Rebrickable, BrickLink and Brickset exports.' },
    built: built
      ? { headline: `${plural(built, 'set')} kept built`, sub: `${subtraction.removed.toLocaleString()} pieces are taken off the collection, as they don't need a drawer.` }
      : { headline: 'No sets kept built', sub: 'Sets you keep built are taken off the collection, so their parts don’t need a drawer.' },
    kept: kept.length
      ? { headline: `${plural(keptSummary.pieces, 'piece')} kept out of storage`, sub: `${keptSummary.labels.join(', ')}. About ${L(keptSummary.volume)}. They’re still in the pick list.` }
      : { headline: 'Nothing kept out', sub: 'Minifigures, bulky parts or anything else you don’t keep in drawers can be left out of the plan.' },
    units: project.units.length ? { headline: `${plural(project.units.length, 'storage unit')}`, sub: 'Pick each product you own and how many. The most-used parts go in the units marked easiest to reach.' } : { headline: 'No storage yet', sub: 'Add the drawers and boxes you have, or plan to buy.' },
    spaces: project.spaces.length
      ? { headline: plural(project.spaces.length, 'space'), sub: 'Cupboards, shelves or the space under them, inside size in mm. Put units in a space (on Units, expand a unit, then In) to see how much of it they take and what else would fit.' }
      : { headline: 'No spaces yet', sub: 'Optional: the cupboards and shelves your units sit in, to see what else would fit.' },
    drawers: storageReady
      ? {
          headline: `${analysis.drawersRecorded} of ${plural(analysis.drawersTotal, 'drawer')} recorded`,
          sub: (
            <>
              {pct(analysis.volumePlaced)} of the collection, by volume, is in a recorded drawer{analysis.capacity ? `, and those drawers are ${pct(analysis.used / analysis.capacity)} full` : ''}. Click a drawer to record what’s in it, or to move parts out of it. {suggest ? 'Dashed ones aren’t recorded: they show what the plan suggests, and nothing changes unless you take it.' : 'Turn Suggestions on to see what the app would put in the drawers you haven’t recorded.'}
            </>
          ),
        }
      : { headline: 'Drawers' },
    'put-away': storageReady
      ? unsorted
        ? {
            headline: `${plural(unsorted, 'part type')} ${unsorted === 1 ? 'isn’t' : 'aren’t'} in a drawer`,
            sub: suggest
              ? [withRoom ? `${withRoom.toLocaleString()} have room beside their own sort in a recorded drawer.` : '', gaps.suggested.size ? `The rest are suggested for ${plural(gaps.suggested.size, 'empty drawer')}.` : '', overflow ? `${L(overflow)} has no room anywhere.` : ''].filter(Boolean).join(' ')
              : 'Drag them onto your drawers, or tick several and choose where they go. Turn Suggestions on for the app’s ideas.',
          }
        : { headline: 'Everything is in a drawer' }
      : { headline: 'Put away & move' },
    moves: storageReady
      ? { headline: moves ? `${moves}${analysis.moreSuggestions ? '+' : ''} ${moves === 1 && !analysis.moreSuggestions ? 'move' : 'moves'} worth making` : analysis.drawersRecorded ? 'No moves to suggest' : 'Record some drawers first', sub: 'Each is optional. Accepting one only changes what’s recorded here, and adds it to a list of moves to make.' }
      : { headline: 'Suggested moves' },
    tidy: storageReady ? { headline: swaps ? `${plural(swaps, 'swap')} would bring each family together` : 'Each family is together', sub: 'Whole drawers swapped between units of the same kind, so similar parts sit side by side. Optional, and can be undone.' } : { headline: 'Tidy the layout' },
    review: storageReady ? { headline: analysis.findings.length ? `${plural(analysis.findings.length, 'thing')} to look at` : 'Nothing to look at', sub: 'What stands out in the drawers as recorded, and how the size estimates compare with the fills you’ve entered.' } : { headline: 'Review' },
    labels: { headline: 'Labels for your drawers', sub: 'Brother tape labels, or a sheet of sticky labels, for every recorded drawer.' },
    map: { headline: 'Where everything is', sub: 'Each cupboard with its units shelf by shelf, and what’s in every drawer. Print it and stick it on the door.' },
    pick: { headline: 'Build a set from your drawers', sub: 'A checklist of the drawers to open and the parts to take, colour by colour, kept until you’re done.' },
    export: { headline: 'Your storage as a spreadsheet' },
    settings: { headline: 'How the plan works', sub: `${project.settings.granularity[0].toUpperCase()}${project.settings.granularity.slice(1)} grouping, ${pct(project.settings.growth)} room to grow, drawers filled to ${pct(project.settings.practicalFill)}.` },
    project: { headline: 'Your project is saved on the server', sub: 'Every device on the network sees the same project. A copy is kept from the start of each day it changes, for 30 days.' },
  };
  const head = heads[page];

  let body: ReactNode;
  if (page === 'parts' || page === 'import' || page === 'built' || page === 'kept')
    body = <CollectionTab view={page as CollectionPage} goTo={setPage} project={project} update={update} catalog={catalog} parts={parts} everything={everything} subtraction={subtraction} kept={kept} keptSummary={keptSummary} />;
  else if (page === 'units' || page === 'spaces') body = <StorageTab view={page} project={project} update={update} />;
  else if (STORAGE_PAGES.has(page)) body = <StorageView page={page as StoragePage} model={model} project={project} update={update} parts={parts} keptOut={kept.map((k) => k.part)} catalog={catalog} goTo={setPage} />;
  else if (page === 'settings')
    body = (
      <section className="card page-narrow">
        <PlanSettings settings={project.settings} onChange={(settings) => update({ settings })} />
      </section>
    );
  else
    body = (
      <div className="page-narrow">
        <section className="card">
          <h3 className="card-title">A copy of your own</h3>
          <p className="muted small">Save project downloads the whole project as one file. Open… replaces the project with one you saved, on every device.</p>
          <div className="row">
            <button onClick={() => download('brick-stash-project.json', JSON.stringify(project, null, 2), 'application/json')}>Save project</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>
              Open…
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
        </section>
        <Versions restore={replace} />
      </div>
    );

  return (
    <div className="app">
      <header className="topbar no-print">
        <button className="ghost menu-btn" aria-label="Pages" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          ☰
        </button>
        <div className="brand">
          <span className="logo" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <h1>Brick Stash</h1>
        </div>
        <span className="topbar-note muted small">
          {parts.length ? `${totals.pieces.toLocaleString()} pieces · ${plural(project.units.length, 'unit')}` : 'Storage planner for LEGO® collections'}
        </span>
        <label className="look-pick no-print">
          Look
          <select value={look} onChange={(e) => setLook(e.target.value as Look)} aria-label="How the app looks on this device">
            {LOOKS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && <div className="banner error">{error}</div>}
      {sync === 'offline' && <div className="banner warn no-print sync-banner">Can’t reach the Brick Stash server. Your changes are safe in this browser and will be sent when it’s back.</div>}
      {sync === 'conflict' && (
        <div className="banner error no-print">
          This project was changed on another device, so changes here aren’t being saved. <b>Save project</b> (in Project &amp; versions) keeps a copy of what’s on this screen.{' '}
          <button className="link" onClick={takeServerCopy}>
            Load the latest version
          </button>
        </div>
      )}

      <PartZoom />
      <div className="shell">
        <Sidebar page={page} setPage={setPage} counts={counts} open={menu} setOpen={setMenu} />
        <main className={page === 'put-away' || page === 'drawers' ? 'wide' : ''}>
          <PageHead page={page} headline={head.headline}>
            {head.sub}
          </PageHead>
          {body}
          <footer className="no-print">
            Part data from <a href="https://rebrickable.com/downloads/">Rebrickable</a>
            {catalog ? ` (catalogue ${catalog.built})` : ''}. Volumes are estimates. LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this tool.
          </footer>
        </main>
      </div>
    </div>
  );
}
