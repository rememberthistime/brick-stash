// My storage: every drawer, as recorded where you've recorded it, and as the plan suggests where you haven't. The plan
// only ever fills the gaps: parts already in a recorded drawer stay there, and the rest are laid out in the drawers
// with nothing recorded.
import { useMemo, useState } from 'react';
import { codeWithName, drawerKeyOf, placeName, setPlaceName } from '../../lib/codes';
import { homesInRecorded, planGaps, pocketsFromSuggestion } from '../../lib/gaps';
import { applyCycle, rearrangements, undoLast } from '../../lib/rearrange';
import { setupLabels } from '../../lib/labels';
import { planPlaces, setupPlaces } from '../../lib/pickList';
import { buildTree, expandCompartments, leaves, sectionLabel, type PlannedCompartment } from '../../lib/planner';
import { analyseSetup, closeUnit, containerChoices, groupsOf, howManyFit, openableUnits, openUnit, setupComps, wholeKey, type PlacedPocket, type SetupComp } from '../../lib/setup';
import { stem } from '../../lib/storageList';
import { shortName } from '../../lib/tapeLabel';
import type { Catalog, OpenedUnit, Part, Project, Setup } from '../../lib/types';
import { download, uid } from '../../state';
import { Stat } from '../CollectionTab';
import Fold, { useFolds } from '../Fold';
import Labels from '../Labels';
import PickListView from '../PickList';
import DrawerEditor from './DrawerEditor';
import { EstimateCheck, Findings, Suggestions, times } from './Improvements';
import NotSorted from './NotSorted';
import Rearrange from './Rearrange';
import { ColourKey, PlanSettings } from './PlanSettings';
import SuggestedDrawer from './Suggested';
import { L, pct } from './format';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  /** the parts to store: the collection less built sets and anything kept out */
  parts: Part[];
  /** parts kept out of storage, for the pick list */
  keptOut: Part[];
  catalog: Catalog | null;
  goTo: (t: 'collection' | 'storage') => void;
}

type Suggestion = PlannedCompartment & { code: string };

const NO_CATEGORIES: Record<string, string> = {};

export default function StorageView({ project, update, parts, keptOut, catalog, goTo }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [printing, setPrinting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [perBox, setPerBox] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const folds = useFolds();
  const setup = project.setup;
  const setSetup = (f: (s: Setup) => Setup) => update((p) => ({ setup: f(p.setup) }));
  const scale = project.settings.volumeScale;
  const categories = catalog?.categories ?? NO_CATEGORIES;

  const tree = useMemo(() => buildTree(parts, categories, scale), [parts, categories, scale]);
  // The recorded drawers first, then a plan for what's left, around them
  const base = useMemo(() => expandCompartments(project.units, project.settings), [project.units, project.settings]);
  const spaces = useMemo(() => setupComps(base, setup.open), [base, setup.open]);
  const analysis = useMemo(() => analyseSetup(setup, spaces, parts, project.settings, tree), [setup, spaces, parts, project.settings, tree]);
  // Room beside the same sort of parts in recorded drawers comes first; only what's left is planned into empty drawers
  const recordedHomes = useMemo(() => {
    const groups = groupsOf(tree);
    return homesInRecorded(analysis.unplaced, analysis.pockets, setup, (n) => groups.get(n)?.key, project.settings);
  }, [analysis, setup, tree, project.settings]);
  const forGaps = useMemo(() => analysis.unplaced.filter((p) => !recordedHomes.has(p.partNum)), [analysis.unplaced, recordedHomes]);
  const gaps = useMemo(() => planGaps(project.units, setup, forGaps, categories, project.settings), [project.units, setup, forGaps, categories, project.settings]);
  const comps = gaps.comps;
  const openable = useMemo(() => openableUnits(base), [base]);
  const choices = useMemo(() => containerChoices(setup, base), [setup, base]);
  const placed = useMemo(() => new Map(comps.map((c) => [c.key, analysis.pockets.filter((p) => p.comp.key === c.key)])), [comps, analysis.pockets]);
  const layoutMoves = useMemo(() => rearrangements(comps, placed), [comps, placed]);
  const whereIs = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const p of analysis.pockets) for (const x of p.parts) out.set(x.part.partNum, [...(out.get(x.part.partNum) ?? []), p.comp.code]);
    return out;
  }, [analysis.pockets]);

  if (!parts.length || !project.units.length) {
    return (
      <div className="card empty-state big">
        <h2>Add your parts and storage first</h2>
        <p>
          This tab shows what’s in your drawers and suggests where the rest could go.{' '}
          <button className="link" onClick={() => goTo(!parts.length ? 'collection' : 'storage')}>
            Go to {!parts.length ? 'Collection' : 'Storage'} →
          </button>
        </p>
      </div>
    );
  }

  const suggestedList = [...gaps.suggested.values()];
  if (printing)
    return (
      <Labels
        entries={setupLabels(analysis.pockets, comps, perBox)}
        close={() => setPrinting(false)}
        backLabel="Back to My storage"
        note="Labels are for recorded drawers. Labelled pockets print their label; others print their main part or group."
        options={
          <label className="small">
            <input type="checkbox" checked={perBox} onChange={(e) => setPerBox(e.target.checked)} /> A label for each pocket
          </label>
        }
      />
    );
  if (picking)
    return (
      <PickListView
        catalog={catalog}
        owned={[...parts, ...keptOut]}
        keptOut={new Set(keptOut.map((p) => p.partNum))}
        fromPlan={planPlaces(suggestedList)}
        fromSetup={analysis.drawersRecorded ? setupPlaces(setup, comps) : null}
        close={() => setPicking(false)}
      />
    );

  const kinds = new Map<string, SetupComp[]>();
  for (const c of comps) kinds.set(stem(c.unitName), [...(kinds.get(stem(c.unitName)) ?? []), c]);
  const q = filter.trim().toLowerCase();
  const matchesPart = (p: Part) => p.partNum.toLowerCase() === q || p.name.toLowerCase().includes(q);
  const suggestionParts = (s: Suggestion) => s.sections.flatMap((sec) => leaves(sec.node).flatMap((l) => (l.part ? [l.part] : [])));
  const matchesFilter = (c: SetupComp) => {
    if (!q) return true;
    if (c.code.toLowerCase() === q || placeName(c).toLowerCase().includes(q)) return true;
    const s = gaps.suggested.get(c.key);
    if (s) return suggestionParts(s).some(matchesPart) || s.sections.some((sec) => sectionLabel(sec).toLowerCase().includes(q));
    return (placed.get(c.key) ?? []).some((p) => p.label?.toLowerCase().includes(q) || p.parts.some((x) => matchesPart(x.part) || x.groupLabel.toLowerCase().includes(q)));
  };
  const familiesIn = (c: SetupComp) => {
    const s = gaps.suggested.get(c.key);
    return s ? s.sections.map((x) => x.node.familyKey) : (placed.get(c.key) ?? []).filter((p) => p.parts.length).map((p) => p.family);
  };
  const familyCounts = new Map<string, number>();
  for (const c of comps) for (const f of new Set(familiesIn(c))) familyCounts.set(f, (familyCounts.get(f) ?? 0) + 1);

  const kindsOpen = kinds.size <= 2;
  const foldIds = [...[...kinds.keys()].map((k) => `storage:${k}`), 'storage:unsorted', 'storage:moves', 'storage:layout', 'storage:estimates', 'storage:review', 'storage:key', 'storage:settings'];
  const index = comps.findIndex((c) => c.key === editing);
  const current = index >= 0 ? comps[index] : null;
  const shown = showing ? gaps.suggested.get(showing) : undefined;
  const shownComp = showing ? comps.find((c) => c.key === showing) : undefined;
  const { check } = analysis;
  const stepTo = (d: number) => setEditing(comps[(index + d + comps.length) % comps.length].key);
  const lifted = choices.filter((c) => c.total !== null);
  const openMany = (unitIds: string[], how: OpenedUnit['how']) => setSetup((s) => unitIds.reduce((x, id) => openUnit(x, openable.get(id)!, how, uid), s));
  const closeMany = (unitIds: string[]) => setSetup((s) => unitIds.reduce((x, id) => closeUnit(x, openable.get(id)!), s));
  const recordSuggestion = (key: string) => {
    const s = gaps.suggested.get(key);
    if (!s) return;
    setSetup((x) => ({ ...x, drawers: { ...x.drawers, [key]: pocketsFromSuggestion(s, uid) } }));
    setShowing(null);
  };
  const unrecorded = comps.filter((c) => !setup.drawers[c.key]?.length);
  const overflow = gaps.plan.stats.overflowVolume;

  const exportCsv = () => {
    const rows = [['Location', 'Your name for it', 'Recorded or suggested', 'Unit', 'Compartment', 'Pocket or group', 'Part', 'Name', 'Quantity']];
    for (const c of comps) {
      for (const [i, p] of (placed.get(c.key) ?? []).entries())
        for (const x of p.parts) rows.push([(placed.get(c.key)?.length ?? 0) > 1 ? `${c.code}.${i + 1}` : c.code, placeName(c), 'recorded', c.unitName, c.label, p.label || p.groupLabel, x.part.partNum, x.part.name, String(x.part.qty)]);
      const s = gaps.suggested.get(c.key);
      if (s) for (const sec of s.sections) for (const l of leaves(sec.node)) if (l.part) rows.push([c.code, placeName(c), 'suggested', c.unitName, c.label, sectionLabel(sec), l.part.partNum, l.part.name, String(sec.span ? sec.pieces : l.part.qty)]);
    }
    download('brick-stash-storage.csv', rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };

  return (
    <div className="setup">
      <section className="card">
        <h2>My storage</h2>
        <p className="muted small">
          Each drawer as you’ve recorded it. Where you haven’t recorded one, it shows what the plan suggests for it, from the parts that aren’t in any drawer yet: <b>Record it like this</b> takes the suggestion, or record it however it really is. Nothing changes until you do.
        </p>
        <div className="stats">
          <Stat label="Drawers recorded" value={`${analysis.drawersRecorded} / ${analysis.drawersTotal}`} hint={`${analysis.pockets.length} pockets`} />
          <Stat label="Parts in a drawer" value={pct(analysis.volumePlaced)} hint={`${analysis.partsPlaced.toLocaleString()} of ${analysis.partsTotal.toLocaleString()} part types, by volume`} />
          <Stat label="Recorded drawers filled" value={analysis.capacity ? pct(analysis.used / analysis.capacity) : '–'} hint={`${L(analysis.used)} of ${L(analysis.capacity)}`} tone={analysis.capacity && analysis.used / analysis.capacity > project.settings.practicalFill ? 'warn' : undefined} />
          <Stat label="Room for the rest" value={overflow ? `${L(overflow)} short` : analysis.unplaced.length ? 'Enough' : '–'} hint={analysis.unplaced.length ? `${gaps.suggested.size} of ${unrecorded.length} unrecorded drawers suggested` : 'everything is in a drawer'} tone={overflow ? 'bad' : 'good'} />
        </div>
        <div className="row">
          <input className="search" placeholder="Where is…? part, number, group, name or drawer code" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="ghost small-btn" disabled={!analysis.drawersRecorded} onClick={() => setPrinting(true)}>
            Print labels…
          </button>
          <button className="ghost small-btn" onClick={() => setPicking(true)} title="Which drawers to open, and how many of each part to take, for a set or any parts list">
            Pick list for a build
          </button>
          <button className="ghost small-btn" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="link" onClick={() => folds.setAll(foldIds, true)}>
            Open all
          </button>
          <button className="link" onClick={() => folds.setAll(foldIds, false)}>
            Close all
          </button>
        </div>
        {lifted.length > 0 && (
          <p className="muted small setup-lifted">
            <b>Loose containers in use:</b> {lifted.map((c) => `${c.used} ${c.container.name}${c.used > (c.total ?? 0) ? `, more than the ${c.total} lifted out` : ''}`).join(' · ')}
          </p>
        )}
      </section>

      {[...kinds].map(([kind, list]) => {
        const recorded = list.filter((c) => setup.drawers[c.key]?.length).length;
        const suggested = list.filter((c) => gaps.suggested.has(c.key)).length;
        const hits = !!q && list.some(matchesFilter);
        const unitIds = [...new Set(list.map((c) => c.unitId))].filter((id) => openable.has(id));
        const opened = unitIds.filter((id) => setup.open[id]);
        const closed = unitIds.filter((id) => !setup.open[id]);
        const each = (ids: string[]) => (ids.length > 1 ? ` of all ${ids.length}` : '');
        const range = list[0].code === list[list.length - 1].code ? list[0].code : `${list[0].code}–${list[list.length - 1].code}`;
        return (
          <Fold key={kind} id={`storage:${kind}`} folds={folds} defaultOpen={kindsOpen} force={hits} title={`${range} ${kind}`} summary={[`${recorded} of ${list.length} recorded`, suggested ? `${suggested} suggested` : ''].filter(Boolean).join(', ')}>
            {unitIds.length > 0 && (
              <div className="setup-layout small">
                {closed.length > 0 && (
                  <>
                    <span className="muted">Not using these as sections?</span>
                    <button className="ghost small-btn" onClick={() => openMany(closed, 'dividers')}>
                      Take the dividers out{each(closed)}
                    </button>
                    <button className="ghost small-btn" onClick={() => openMany(closed, 'containers')}>
                      Lift the containers out{each(closed)}
                    </button>
                  </>
                )}
                {opened.length > 0 && (
                  <button className="link small" onClick={() => closeMany(opened)}>
                    Put the sections back{opened.length > 1 ? ` in all ${opened.length}` : ''}
                  </button>
                )}
              </div>
            )}
            <div className="setup-tiles">
              {list.map((c) => {
                const dim = (!!q && !matchesFilter(c)) || (!!highlight && !familiesIn(c).includes(highlight));
                const s = gaps.suggested.get(c.key);
                return setup.drawers[c.key]?.length || !s ? (
                  <DrawerTile key={c.key} comp={c} recorded={!!setup.drawers[c.key]?.length} pockets={placed.get(c.key) ?? []} dim={dim} onClick={() => setEditing(c.key)} />
                ) : (
                  <SuggestedTile key={c.key} comp={c} s={s} dim={dim} onClick={() => setShowing(c.key)} />
                );
              })}
            </div>
          </Fold>
        );
      })}

      <NotSorted
        unsorted={analysis.unplaced}
        volumePlaced={analysis.volumePlaced}
        comps={comps}
        setup={setup}
        setSetup={setSetup}
        pockets={analysis.pockets}
        homeOf={gaps.homeOf}
        recordedHomes={recordedHomes}
        scale={scale}
        query={filter}
        folds={folds}
        onShowDrawer={setShowing}
      />

      <Fold id="storage:moves" folds={folds} title="Suggested moves" summary={analysis.suggestions.length ? `${analysis.suggestions.length}${analysis.moreSuggestions ? '+' : ''} to look at` : analysis.drawersRecorded ? 'none right now' : 'record some drawers first'}>
        <Suggestions setup={setup} setSetup={setSetup} analysis={analysis} onUndo={() => update(undoLast)} />
      </Fold>

      <Fold id="storage:layout" folds={folds} title="Tidy the layout" summary={layoutMoves.length ? layoutMoves.map((r) => `${r.kind}: ${r.cycles.length} ${r.cycles.length === 1 ? 'swap' : 'swaps'}`).join(', ') : 'each family is together'}>
        <Rearrange plans={layoutMoves} comps={comps} onSwap={(swaps) => update((p) => swaps.reduce<Partial<Project>>((acc, { cycle, text }) => applyCycle({ ...p, ...acc } as Project, cycle, text), {}))} />
      </Fold>

      <Fold id="storage:estimates" folds={folds} title="Estimates against your drawers" summary={check.pockets ? `real size ${times(check.total)} of the estimate` : 'enter a fill to compare'}>
        <EstimateCheck setup={setup} setSetup={setSetup} analysis={analysis} />
      </Fold>

      <Fold id="storage:review" folds={folds} title="What the review found" summary={analysis.findings.length ? `${analysis.findings.length} things to look at` : 'nothing yet'}>
        <Findings findings={analysis.findings} analysis={analysis} />
      </Fold>

      <ColourKey counts={familyCounts} highlight={highlight} setHighlight={setHighlight} folds={folds} />

      <Fold id="storage:settings" folds={folds} title="Plan settings" summary={`${project.settings.granularity}, +${pct(project.settings.growth)} growth, ${pct(project.settings.practicalFill)} fill`}>
        <PlanSettings settings={project.settings} onChange={(settings) => update({ settings })} />
      </Fold>

      {shown && shownComp && (
        <SuggestedDrawer
          c={shown}
          comp={shownComp}
          settings={project.settings}
          onRecord={() => recordSuggestion(shownComp.key)}
          onRecordByHand={() => {
            setShowing(null);
            setEditing(shownComp.key);
          }}
          onClose={() => setShowing(null)}
        />
      )}

      {current && (
        <DrawerEditor
          key={current.key}
          comp={current}
          pockets={setup.drawers[current.key] ?? null}
          placed={placed.get(current.key) ?? []}
          tree={tree}
          whereIs={whereIs}
          choices={choices.filter((c) => howManyFit(c.container, current) > 0)}
          canOpen={openable.has(current.unitId)}
          onOpen={(how) => {
            openMany([current.unitId], how);
            setEditing(wholeKey(current.unitId));
          }}
          onPutBack={() => {
            const firstSection = openable.get(current.unitId)![0];
            closeMany([current.unitId]);
            setEditing(firstSection.key);
          }}
          onLitres={(litres) => setSetup((s) => ({ ...s, open: { ...s.open, [current.unitId]: { ...s.open[current.unitId], litres } } }))}
          onNewContainer={(c) => setSetup((s) => ({ ...s, containers: [...s.containers, c] }))}
          onChange={(next) => setSetup((s) => ({ ...s, drawers: { ...s.drawers, [current.key]: next } }))}
          onForget={() =>
            setSetup((s) => {
              const { [current.key]: _gone, ...drawers } = s.drawers;
              return { ...s, drawers };
            })
          }
          onPrev={() => stepTo(-1)}
          onNext={() => stepTo(1)}
          onClose={() => setEditing(null)}
          onName={(name) => update((p) => ({ units: setPlaceName(p.units, current.unitId, current.sections ? null : drawerKeyOf(current.key), name) }))}
        />
      )}
    </div>
  );
}

function DrawerTile({ comp, recorded, pockets, dim, onClick }: { comp: SetupComp; recorded: boolean; pockets: PlacedPocket[]; dim: boolean; onClick: () => void }) {
  const capacity = pockets.reduce((t, p) => t + p.capacity, 0);
  const used = pockets.reduce((t, p) => t + p.used, 0);
  const inUse = pockets.filter((p) => p.parts.length);
  const family = [...inUse].sort((a, b) => b.used - a.used)[0]?.family;
  const measured = inUse.length > 0 && inUse.every((p) => p.fill !== undefined);
  // One part on its own is named by the part, shortened; anything else by its label or group
  const names = [...new Set(inUse.map((p) => p.label || (p.mixed ? 'Mixed on purpose' : p.parts.length === 1 ? shortName(p.parts[0].part.name) : p.groupLabel)))];
  return (
    <button className={`setup-tile ${recorded ? '' : 'todo'} ${dim ? 'dim' : ''} ${family ? `fam-border-${family}` : ''}`} onClick={onClick} title={comp.sections ? `${comp.unitName}, whole box` : `${comp.unitName} › ${comp.label} — ${comp.w}×${comp.d}×${comp.h} mm`}>
      <span className="setup-tile-head">
        <span className="code">{comp.code}</span>
        {placeName(comp) && <span className="small place-name setup-tile-title">{placeName(comp)}</span>}
        {pockets.length > 1 && <span className="muted small">{pockets.length} pockets</span>}
        {inUse.length > 0 && (
          <span className={`small setup-tile-fill ${measured ? '' : 'muted'}`}>
            {measured ? '' : '~'}
            {pct(used / capacity)}
          </span>
        )}
      </span>
      <span className="small setup-tile-names">{recorded ? (names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` + ${names.length - 2}` : '') : 'Empty') : 'Not recorded, nothing suggested'}</span>
    </button>
  );
}

/** A drawer with nothing recorded, showing what the plan suggests for it */
function SuggestedTile({ comp, s, dim, onClick }: { comp: SetupComp; s: Suggestion; dim: boolean; onClick: () => void }) {
  const names = s.sections.map((x) => shortName(sectionLabel(x)));
  return (
    <button className={`setup-tile suggested ${dim ? 'dim' : ''} fam-border-${s.sections[0]?.node.familyKey ?? ''}`} onClick={onClick} title={`${codeWithName(comp.code, comp)} — not recorded; click to see the suggestion`}>
      <span className="setup-tile-head">
        <span className="code">{comp.code}</span>
        {placeName(comp) && <span className="small place-name setup-tile-title">{placeName(comp)}</span>}
        <span className="small muted setup-tile-fill">~{pct(s.fill)}</span>
      </span>
      <span className="small setup-tile-names">
        <i>Suggested:</i> {names.slice(0, 2).join(', ')}
        {names.length > 2 ? ` + ${names.length - 2}` : ''}
      </span>
    </button>
  );
}
