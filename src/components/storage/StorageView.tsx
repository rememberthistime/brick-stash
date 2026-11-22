// The storage pages: the drawers as recorded, with the plan's suggestion where nothing is recorded, the parts not in a
// drawer yet, moves worth making, tidying the layout, the review, labels, the pick list and the export. The plan only
// ever fills the gaps: parts already in a recorded drawer stay there, and the rest are laid out in the drawers with
// nothing recorded. The drawer editor and the suggested drawer open over whichever page asked for them.
import { nameTitle, partPlainName, searchName } from '../../lib/builderNames';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { baseMould, collectionRows, mergeToParts } from '../../lib/collection';
import { colourName } from '../../lib/colours';
import { pickPart, type KeptPart } from '../../lib/keepOut';
import { findElsewhere } from './find';
import NotInList, { type NewPart } from './NotInList';
import { moveParts, movePocket, swapDrawers, takeOut, undoStep, type MoveItem, type Spot } from '../../lib/move';
import { codeWithName, drawerKeyOf, placeName, setPlaceName } from '../../lib/codes';
import { setDrawerJob } from '../../lib/unitJobs';
import { pocketsFromSuggestion } from '../../lib/gaps';
import { applyCycle, undoLast } from '../../lib/rearrange';
import { mainGroup, setupLabels } from '../../lib/labels';
import { GroupDot } from '../GroupDot';
import { planPlaces, setupPlaces } from '../../lib/pickList';
import { leaves, sectionLabel, type PlannedCompartment } from '../../lib/planner';
import { acceptSuggestion, checkEverything, setChecked, closeUnit, contentsName, partMatcher, howManyFit, openUnit, wholeKey, type PlacedPocket, type SetupComp } from '../../lib/setup';
import { stem } from '../../lib/storageList';
import { shortName } from '../../lib/tapeLabel';
import type { Catalog, ExtraPart, OpenedUnit, Part, Project, Setup, SetupPocket } from '../../lib/types';
import { download, uid } from '../../state';
import Fold, { useFolds } from '../Fold';
import Labels from '../Labels';
import PartImage from '../PartImage';
import PickListView from '../PickList';
import StorageMap from './StorageMap';
import type { Page } from '../Shell';
import DrawerEditor from './DrawerEditor';
import { EstimateCheck, Findings, LayoutCheck, Suggestions } from './Improvements';
import type { StorageModel } from './model';
import SortPage from './SortPage';
import MovesToMake from './MovesToMake';
import Rearrange from './Rearrange';
import { ColourKey } from './PlanSettings';
import SuggestedDrawer from './Suggested';
import { pct } from './format';
import { history, useHistory } from './history';
import { SuggestionsSwitch, useSuggestions } from './suggestionsSwitch';
import { drawerOptions, placeOptions, spotTitle, spotsOf } from './places';

export type StoragePage = 'drawers' | 'put-away' | 'todo' | 'moves' | 'tidy' | 'review' | 'labels' | 'map' | 'pick' | 'export';
export const STORAGE_PAGES = new Set<Page>(['drawers', 'put-away', 'todo', 'moves', 'tidy', 'review', 'labels', 'map', 'pick', 'export']);

interface Props {
  page: StoragePage;
  model: StorageModel;
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  /** the parts to store: the collection less built sets and anything kept out */
  parts: Part[];
  /** parts kept out of storage, for the pick list */
  keptOut: Part[];
  /** the same, with why each is kept out */
  kept: KeptPart[];
  /** the whole collection, before sets kept built come off */
  owned: Part[];
  catalog: Catalog | null;
  goTo: (p: Page) => void;
}

type Suggestion = PlannedCompartment & { code: string };

export default function StorageView({ page, model, project, update, parts, keptOut, kept, owned, catalog, goTo }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [perBox, setPerBox] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const folds = useFolds();
  const steps = useHistory();
  const suggest = useSuggestions();
  const [undoHidden, setUndoHidden] = useState(-1);
  // A drawer opened on one page doesn't stay open over the next
  useEffect(() => {
    setEditing(null);
    setShowing(null);
  }, [page]);
  const setup = project.setup;
  const setSetup = (f: (s: Setup) => Setup) => update((p) => ({ setup: f(p.setup) }));
  const scale = project.settings.volumeScale;
  const { tree, analysis, recordedHomes, gaps, comps, openable, choices, placed, layoutMoves, whereIs, homesIn, movesIn, topMovesIn, resolvePart } = model;

  // ─── Steps taken by hand: each one can be undone ───
  const nameOf = (num: string) => parts.find((p) => p.partNum === num)?.name ?? num;
  const titleAt = (spot: Spot) => {
    const c = comps.find((x) => x.key === spot.key);
    return c ? spotTitle(c, spot.pocket, setup, analysis.pockets) : spot.key;
  };
  const describeMove = (items: MoveItem[], to: Spot) => {
    const verb = items.every((it) => !it.from) ? 'Put' : 'Moved';
    const what = items.length === 1 ? nameOf(items[0].part) : `${items.length} parts`;
    return `${verb} ${what} ${verb === 'Put' ? 'in' : 'to'} ${titleAt(to)}`;
  };
  const move = (items: MoveItem[], to: Spot, text = describeMove(items, to)) => {
    const r = moveParts(setup, items, to, uid);
    if (r.setup === setup) return;
    update({ setup: r.setup });
    history.push({ text, drawers: r.before });
  };
  /** Several moves as one step, undone together */
  const moveGroups = (groups: { items: MoveItem[]; to: Spot }[], text: string) => {
    let next = setup;
    const before: Record<string, SetupPocket[] | undefined> = {};
    for (const g of groups) {
      const r = moveParts(next, g.items, g.to, uid);
      for (const [k, v] of Object.entries(r.before)) if (!(k in before)) before[k] = v;
      next = r.setup;
    }
    if (next === setup) return;
    update({ setup: next });
    history.push({ text, drawers: before });
  };
  const movePocketTo = (from: Spot, to: Spot) => {
    const r = movePocket(setup, from, to, uid);
    if (r.setup === setup) return;
    update({ setup: r.setup });
    history.push({ text: `Moved everything in ${titleAt(from)} to ${titleAt(to)}`, drawers: r.before });
  };
  const swap = (a: string, b: string) => {
    const r = swapDrawers(project, a, b);
    update({ setup: r.setup, units: r.units });
    const code = (k: string) => comps.find((c) => c.key === k)?.code ?? k;
    history.push({ text: `Swapped ${code(a)} and ${code(b)}`, drawers: r.before, names: r.names, jobs: r.jobs });
  };
  /** Move a part here from every other pocket it's in */
  const moveHere = (num: string, to: Spot) =>
    move(
      spotsOf(num, setup).map((from) => ({ part: num, from })),
      to,
    );
  const takeOutMany = (items: Required<MoveItem>[]) => {
    if (!items.length) return;
    const r = takeOut(setup, items);
    update({ setup: r.setup });
    history.push({ text: items.length === 1 ? `Took ${nameOf(items[0].part)} out of ${titleAt(items[0].from)}` : `Took ${items.length} parts out`, drawers: r.before });
  };
  const takeOutOf = (num: string, from: Spot) => takeOutMany([{ part: num, from }]);
  /** A part added from the Put away & move search, to the list or straight into a drawer */
  const addPart = (np: NewPart, to?: Spot) => {
    const taken = new Set([...Object.keys(catalog?.parts ?? {}), ...(project.extraParts ?? []).map((e) => e.partNum)]);
    let partNum = np.partNum.trim();
    if (!partNum) {
      let i = 1;
      while (taken.has(`own-${i}`)) i++;
      partNum = `own-${i}`;
    }
    const row: ExtraPart = { ...np, partNum, id: uid() };
    // Put straight in a drawer, it's stored, even if its kind or size would otherwise keep it out
    const stored = to ? partFor({ ...np, partNum }) : null;
    update((p) => ({ extraParts: [...(p.extraParts ?? []), row], ...(stored ? { keepOut: pickPart(p.keepOut, { ...stored, partNum: baseMould(partNum, catalog) }, false, p.units) } : {}) }));
    if (to) move([{ part: baseMould(partNum, catalog) }], to, `Added ${np.name ?? partNum} and put it in ${titleAt(to)}`);
  };
  /** A part kept out of storage, brought back to be stored, and put in a drawer if one is given */
  const keepIn = (part: Part, to?: Spot) => {
    update((p) => ({ keepOut: pickPart(p.keepOut, part, false, p.units) }));
    if (to) move([{ part: part.partNum }], to);
  };
  const partFor = (np: NewPart): Part => mergeToParts([{ ...np, partNum: np.partNum || 'own' }], catalog)[0];
  const colourChoices = useMemo(() => {
    const names = new Set<string>();
    for (const r of collectionRows(project)) {
      const c = colourName(r.colour, project.colours);
      if (c && !/^(BrickLink colour|Colour) /.test(c)) names.add(c);
    }
    return [...names].sort();
  }, [project]);
  const categoryChoices = useMemo(() => Object.entries(catalog?.categories ?? {}).sort((a, b) => a[1].localeCompare(b[1])), [catalog]);
  /** Parts a search finds that aren't in the list to put away: where they are, and a way to add them */
  const notInList = ({ listHasMatches, onOpen, query = filter, here, addNew }: { listHasMatches: boolean; onOpen: (key: string) => void; query?: string; here?: { spot: Spot; label: string }; addNew?: boolean }) => (
    <NotInList
      query={query}
      found={findElsewhere(query, { owned, toStore: parts, kept, setup, catalog, resolve: resolvePart })}
      listHasMatches={listHasMatches}
      codeOf={(spot) => {
        const c = comps.find((x) => x.key === spot.key);
        return c ? ((setup.drawers[spot.key]?.length ?? 0) > 1 ? `${c.code}.${spot.pocket + 1}` : c.code) : spot.key;
      }}
      onOpen={onOpen}
      places={places}
      partFor={partFor}
      onKeepIn={keepIn}
      onAdd={addPart}
      categories={categoryChoices}
      colours={colourChoices}
      here={here}
      addNew={addNew}
    />
  );
  const undo = () => {
    const last = history.pop();
    if (last) update((p) => undoStep(p, last));
  };
  const places = (forParts: Part[]) => placeOptions(comps, setup, analysis.pockets, forParts);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && steps.length) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!parts.length || !project.units.length) {
    return (
      <div className="card empty-state big">
        <h2>Add your parts and storage first</h2>
        <p>
          This page works from your parts and the storage you have.{' '}
          <button className="link" onClick={() => goTo(!parts.length ? 'import' : 'units')}>
            Go to {!parts.length ? 'Import' : 'Units'} →
          </button>
        </p>
      </div>
    );
  }

  const suggestedList = [...gaps.suggested.values()];
  const kinds = new Map<string, SetupComp[]>();
  for (const c of comps) kinds.set(stem(c.unitName), [...(kinds.get(stem(c.unitName)) ?? []), c]);
  const q = filter.trim().toLowerCase();
  const matcher = partMatcher(filter, resolvePart);
  const matchesPart = (p: Part) => matcher.test(p) || searchName(p).toLowerCase().includes(q);
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

    const foldIds = [...kinds.keys()].map((k) => `storage:${k}`);
  const index = comps.findIndex((c) => c.key === editing);
  const current = index >= 0 ? comps[index] : null;
  const shown = showing ? gaps.suggested.get(showing) : undefined;
  const shownComp = showing ? comps.find((c) => c.key === showing) : undefined;
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

  const search = (placeholder: string) => (
    <div className="page-tools no-print">
      <input className="search" type="search" placeholder={placeholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <SuggestionsSwitch />
    </div>
  );

  let body: ReactNode = null;
  if (page === 'labels')
    body = (
      <Labels
        entries={setupLabels(analysis.pockets, comps, perBox)}
        note="Labels are for recorded drawers. Labelled pockets print their label; others print their main part or group."
        options={
          <label className="small">
            <input type="checkbox" checked={perBox} onChange={(e) => setPerBox(e.target.checked)} /> A label for each pocket
          </label>
        }
      />
    );
  else if (page === 'map') body = <StorageMap project={project} update={update} comps={comps} placed={placed} />;
  else if (page === 'pick')
    body = (
      <PickListView
        catalog={catalog}
        owned={[...parts, ...keptOut]}
        keptOut={new Set(keptOut.map((p) => p.partNum))}
        fromPlan={planPlaces(suggestedList)}
        fromSetup={analysis.drawersRecorded ? setupPlaces(setup, comps) : null}
        project={project}
        update={update}
      />
    );
  else if (page === 'export')
    body = (
      <section className="card">
        <p>
          A spreadsheet with a row for every part in every drawer: the drawer’s code and your name for it, the pocket, and whether it’s recorded or only suggested. It opens in Excel, Numbers or Google Sheets.
        </p>
        <button onClick={exportCsv}>Download brick-stash-storage.csv</button>
        <p className="muted small">To keep a copy of the whole project, use Project &amp; versions.</p>
      </section>
    );
  else if (page === 'drawers')
    body = (
      <>
        <div className="page-tools no-print">
          <input className="search" type="search" placeholder="Where is…? part, number, group, name or drawer code" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="link" onClick={() => folds.setAll(foldIds, true)}>
            Open all
          </button>
          <button className="link" onClick={() => folds.setAll(foldIds, false)}>
            Close all
          </button>
          <SuggestionsSwitch />
        </div>
        {(() => {
          const all = analysis.pockets.flatMap((p) => p.parts.map((x) => p.checked.has(x.part.partNum)));
          const ticked = all.filter(Boolean).length;
          if (!all.length) return null;
          return (
            <p className="muted small setup-checked no-print">
              {ticked === all.length ? (
                <>
                  <span className="good-text">✓ Every recorded part is ticked as there.</span>{' '}
                  <button className="link small" onClick={() => setSetup((s) => ({ ...s, drawers: Object.fromEntries(Object.entries(s.drawers).map(([k, ps]) => [k, ps.map((x) => setChecked(x, x.parts, false))])) }))}>
                    Untick everything
                  </button>
                </>
              ) : (
                <>
                  {ticked.toLocaleString()} of {all.length.toLocaleString()} recorded parts ticked as there. Open a drawer and tick each part once you’ve seen it; a part moved or put away comes unticked until you do.{' '}
                  <button className="link small" onClick={() => setSetup((s) => checkEverything(s))}>
                    Tick everything recorded so far
                  </button>
                </>
              )}
            </p>
          );
        })()}
        {(() => {
          // More loose containers recorded in drawers than are lifted out of their units: one quiet line, as they may be spare cups
          const over = lifted.filter((c) => c.used > (c.total ?? 0));
          if (!over.length) return null;
          const same = (x: { name: string; w: number; d: number; h: number } | undefined, c: (typeof over)[number]) => !!x && x.name === c.container.name && x.w === c.container.w && x.d === c.container.d && x.h === c.container.h;
          const where = comps.filter((x) => setup.drawers[x.key]?.some((p) => over.some((c) => same(p.container, c)))).map((x) => x.code);
          return (
            <p className="muted small setup-lifted">
              Drawers {where.join(', ')} hold more loose containers than are lifted out of their units ({over.map((c) => `${c.container.name}: ${c.used} in use, ${c.total} lifted out`).join('; ')}). If they’re spare containers, that’s fine; otherwise lift more out of a unit below.
            </p>
          );
        })()}
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
            <Fold key={kind} id={`storage:${kind}`} folds={folds} defaultOpen force={hits} title={<><span className="code">{range}</span> {kind}</>} summary={[`${recorded} of ${list.length} recorded`, suggest && suggested ? `${suggested} suggested` : ''].filter(Boolean).join(', ')}>
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
                  return setup.drawers[c.key]?.length || !s || !suggest ? (
                    <DrawerTile key={c.key} comp={c} recorded={!!setup.drawers[c.key]?.length} pockets={placed.get(c.key) ?? []} toAdd={suggest ? homesIn.get(c.key)?.length ?? 0 : 0} moves={suggest ? topMovesIn.get(c.key) ?? 0 : 0} dim={dim} suggest={suggest} onClick={() => setEditing(c.key)} />
                  ) : (
                    <SuggestedTile key={c.key} comp={c} s={s} dim={dim} onClick={() => setShowing(c.key)} />
                  );
                })}
              </div>
            </Fold>
          );
        })}
        <ColourKey counts={familyCounts} highlight={highlight} setHighlight={setHighlight} folds={folds} />
      </>
    );
  else if (page === 'put-away')
    body = (
      <>
        {search('Find a part not in a drawer: name or number')}
        {q && !analysis.unplaced.some(matchesPart) && (
          <p className="banner">
            Nothing that isn’t in a drawer matches “{filter}”.
            {(() => {
              const hits = analysis.pockets.flatMap((p) => p.parts.filter((x) => matchesPart(x.part)).map((x) => ({ part: x.part, where: p.name })));
              const shown = [...new Map(hits.map((h) => [h.part.partNum, h])).values()].slice(0, 4);
              return shown.length ? <> Already in a drawer: {shown.map((h) => `${partPlainName(h.part)} (${h.part.partNum}) in ${hits.filter((x) => x.part.partNum === h.part.partNum).map((x) => x.where).join(', ')}`).join('; ')}.</> : ' It may be kept out of storage, in a set kept built, or not in your parts list.';
            })()}
          </p>
        )}
        <SortPage
          unsorted={analysis.unplaced}
          comps={comps}
          setup={setup}
          setSetup={setSetup}
          pockets={analysis.pockets}
          placed={placed}
          recordedHomes={recordedHomes}
          homeOf={gaps.homeOf}
          scale={scale}
          query={filter}
          resolve={resolvePart}
          places={places}
          onMove={move}
          onMoveGroups={moveGroups}
          onMovePocket={movePocketTo}
          onTakeOut={takeOutMany}
          onEdit={setEditing}
          onShowSuggested={setShowing}
          hasSuggestion={(key) => gaps.suggested.has(key)}
          suggest={suggest}
          notInList={({ listHasMatches, onOpen }) => notInList({ listHasMatches, onOpen })}
        />
      </>
    );
  else if (page === 'todo') body = (
      <MovesToMake
        setup={setup}
        setSetup={setSetup}
        comps={comps}
        analysis={analysis}
        goTo={goTo}
        titleOf={(key) => {
          const c = comps.find((x) => x.key === key);
          const inUse = (placed.get(key) ?? []).filter((p) => p.parts.length);
          return (c && placeName(c)) || [...new Set(inUse.map((p) => p.label?.trim() || contentsName(p)))].slice(0, 2).join(', ');
        }}
      />
    );
  else if (page === 'moves')
    body = (
      <section className="card">
        <Suggestions
          goTo={goTo}
          setup={setup}
          setSetup={setSetup}
          analysis={analysis}
          onUndo={() => update(undoLast)}
          onUse={(uses) =>
            update((p) => ({
              units: uses.reduce((us, d) => {
                const drawer = drawerKeyOf(d.key);
                return drawer ? setDrawerJob(us, d.unitId, drawer, d.job) : us;
              }, p.units),
            }))
          }
        />
      </section>
    );
  else if (page === 'tidy')
    body = (
      <section className="card">
        <Rearrange plans={layoutMoves} comps={comps} onSwap={(swaps) => update((p) => swaps.reduce<Partial<Project>>((acc, { cycle, text }) => applyCycle({ ...p, ...acc } as Project, cycle, text), {}))} />
      </section>
    );
  else if (page === 'review')
    body = (
      <>
        <section className="card">
          <h3 className="card-title">Could someone else find things?</h3>
          <LayoutCheck findings={analysis.layout} analysis={analysis} />
        </section>
        <section className="card">
          <h3 className="card-title">What the review found</h3>
          <Findings findings={analysis.findings} analysis={analysis} />
        </section>
        <section className="card">
          <h3 className="card-title">Estimates against your drawers</h3>
          <EstimateCheck setup={setup} setSetup={setSetup} analysis={analysis} />
        </section>
      </>
    );

  const tabs = (
    <div className="sub-tabs no-print" role="tablist">
      {(
        [
          ['moves', 'Moves worth making', analysis.suggestions.length + analysis.drawerUses.length],
          ['tidy', 'Tidy the layout', layoutMoves.reduce((t, r) => t + r.cycles.length, 0)],
          ['review', 'Review', new Set([...analysis.findings.map((f) => f.kind), ...analysis.layout.map((f) => f.kind)]).size],
        ] as const
      ).map(([id, label, count]) => (
        <button key={id} role="tab" aria-selected={page === id} className={page === id ? 'on' : ''} onClick={() => goTo(id)}>
          {label}
          {count > 0 && <span className="nav-count">{count}</span>}
        </button>
      ))}
    </div>
  );
  if (page === 'moves' || page === 'tidy' || page === 'review')
    body = (
      <>
        {tabs}
        {body}
      </>
    );
  const last = steps[steps.length - 1];
  return (
    <div className="setup">
      {body}

      {last && undoHidden !== steps.length && (page === 'drawers' || page === 'put-away') && (
        <div className="undo-bar no-print" role="status" aria-live="polite">
          <span>{last.text}</span>
          <button className="small-btn" onClick={undo} title="Ctrl+Z">
            Undo{steps.length > 1 ? ` (${steps.length})` : ''}
          </button>
          <button className="icon" aria-label="Hide" onClick={() => setUndoHidden(steps.length)}>
            ✕
          </button>
        </div>
      )}

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
          homes={suggest ? homesIn.get(current.key) ?? [] : []}
          moves={suggest ? movesIn.get(current.key) ?? [] : []}
          resolve={resolvePart}
          places={places}
          drawers={() => drawerOptions(comps, setup, analysis.pockets)}
          onMove={move}
          onMovePocket={movePocketTo}
          onSwap={(other) => {
            swap(current.key, other);
            setEditing(other);
          }}
          onMoveHere={moveHere}
          onTakeOut={takeOutOf}
          onJob={(job) => {
            const drawer = drawerKeyOf(current.key);
            if (drawer) update((p) => ({ units: setDrawerJob(p.units, current.unitId, drawer, job) }));
          }}
          useHint={analysis.drawerUses.find((d) => d.key === current.key)}
          notInList={({ query, listHasMatches, addNew, here, hereLabel }) => notInList({ query, listHasMatches, addNew, onOpen: setEditing, here: { spot: here, label: hereLabel } })}
          onAccept={(s) => setSetup((x) => acceptSuggestion(x, s, analysis.pockets))}
          onSkip={(id) => setSetup((x) => ({ ...x, skipped: [...x.skipped, id] }))}
        />
      )}
    </div>
  );
}

function DrawerTile({ comp, recorded, pockets, toAdd, moves, dim, suggest, onClick }: { comp: SetupComp; recorded: boolean; pockets: PlacedPocket[]; toAdd: number; moves: number; dim: boolean; suggest: boolean; onClick: () => void }) {
  const capacity = pockets.reduce((t, p) => t + p.capacity, 0);
  const used = pockets.reduce((t, p) => t + p.used, 0);
  const inUse = pockets.filter((p) => p.parts.length);
  const family = [...inUse].sort((a, b) => b.used - a.used)[0]?.family;
  const measured = inUse.length > 0 && inUse.every((p) => p.fill !== undefined);
  // One part on its own is named by the part, shortened; anything else by its label or group
  const names = [...new Set(inUse.map((p) => p.label?.trim() || contentsName(p)))];
  // The parts with the most pieces, so the pictures show what you'd see opening it
  const pics = inUse.flatMap((p) => p.parts.map((x) => x.part)).sort((a, b) => b.qty - a.qty);
  // Ticked as really there: all of it, or how many are left to check once checking has started here
  const all = inUse.flatMap((p) => p.parts.map((x) => x.part.partNum).filter(Boolean).map((n) => p.checked.has(n)));
  const ticked = all.filter(Boolean).length;
  // Your own name heads the tile, in full. Without one, what's in it does, in grey, and isn't repeated below.
  const own = placeName(comp);
  const title = own || names[0] || '';
  const rest = own ? names : names.slice(1);
  return (
    <button className={`setup-tile ${recorded ? '' : 'todo'} ${dim ? 'dim' : ''} ${family ? `fam-border-${family}` : ''}`} onClick={onClick} title={`${comp.sections ? `${comp.unitName}, whole box` : `${comp.unitName} › ${comp.label} — ${comp.w}×${comp.d}×${comp.h} mm`}${pockets.length > 1 ? ` · ${pockets.length} pockets` : ''}`}>
      <span className="setup-tile-head">
        <GroupDot group={mainGroup(inUse)} />
        <span className="code">{comp.code}</span>
        {inUse.length > 0 && (
          <span className={`small setup-tile-fill ${measured ? '' : 'muted'}`} title={measured ? 'How full you said it is' : 'Estimated from what’s in it (~). Enter how full each pocket is for a real figure.'}>
            {measured ? '' : '~'}
            {pct(used / capacity)}
          </span>
        )}
      </span>
      {title && <span className={`small setup-tile-title ${own ? 'place-name' : 'muted'}`}>{title}</span>}
      {pics.length > 0 && <TilePics parts={pics} />}
      {(rest.length > 0 || !recorded || !names.length) && (
        <span className="small setup-tile-names">{recorded ? (rest.length ? rest.slice(0, 2).join(', ') + (rest.length > 2 ? ` + ${rest.length - 2}` : '') : 'Empty') : suggest ? 'Not recorded, nothing suggested' : 'Not recorded'}</span>
      )}
      {all.length > 0 && ticked === all.length && <span className="tile-checked small">✓ checked</span>}
      {ticked > 0 && ticked < all.length && <span className="tile-check small">{all.length - ticked} to check</span>}
      {(toAdd > 0 || moves > 0) && (
        <span className="tile-todo small">
          {toAdd > 0 && <span>+{toAdd} to put in</span>}
          {moves > 0 && <span>{moves} {moves === 1 ? 'move' : 'moves'}</span>}
        </span>
      )}
    </button>
  );
}

/** A drawer with nothing recorded, showing what the plan suggests for it */
function SuggestedTile({ comp, s, dim, onClick }: { comp: SetupComp; s: Suggestion; dim: boolean; onClick: () => void }) {
  const names = s.sections.map((x) => shortName(sectionLabel(x)));
  const pics = s.sections.flatMap((sec) => leaves(sec.node).flatMap((l) => (l.part ? [l.part] : []))).sort((a, b) => b.qty - a.qty);
  return (
    <button className={`setup-tile suggested ${dim ? 'dim' : ''} fam-border-${s.sections[0]?.node.familyKey ?? ''}`} onClick={onClick} title={`${codeWithName(comp.code, comp)} — not recorded; click to see the suggestion`}>
      <span className="setup-tile-head">
        <span className="code">{comp.code}</span>
        {placeName(comp) && <span className="small place-name setup-tile-title">{placeName(comp)}</span>}
        <span className="small muted setup-tile-fill">~{pct(s.fill)}</span>
      </span>
      <TilePics parts={pics} />
      <span className="small setup-tile-names">
        <i>Suggested:</i> {names.slice(0, 2).join(', ')}
        {names.length > 2 ? ` + ${names.length - 2}` : ''}
      </span>
    </button>
  );
}

function TilePics({ parts }: { parts: Part[] }) {
  return (
    <span className="tile-pics">
      {[...new Map(parts.map((p) => [p.partNum, p])).values()].slice(0, 4).map((p) => (
        <PartImage key={p.partNum} partNum={p.partNum} size={34} title={nameTitle(p)} />
      ))}
    </span>
  );
}
