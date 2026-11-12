import { useEffect, useMemo, useRef, useState } from 'react';
import { BOX_NAME_IDEAS, changePhoto, deletePhoto, photoUrl, saveBoxNames, topPhotoOf, useBoxNames, usePhotos, type BoxNames, type Photo } from '../lib/photos';
import { buildTree, familyLabel, type Plan, type TreeNode } from '../lib/planner';
import {
  acceptSuggestion,
  addContainers,
  addToPocket,
  analyseSetup,
  closeUnit,
  containerChoices,
  floorLeft,
  howManyFit,
  loadDraft,
  newPocket,
  openableUnits,
  openUnit,
  removeFromPocket,
  removePocket,
  resizePockets,
  searchParts,
  setPocket,
  setupComps,
  undoLastAccepted,
  unplacedNeighbours,
  unsortedByFamily,
  wholeKey,
  type ContainerChoice,
  type EstimateRow,
  type Finding,
  type FindingKind,
  type PlacedPocket,
  type SetupDraft,
  type SetupAnalysis,
  type SetupComp,
} from '../lib/setup';
import { setupLabels } from '../lib/labels';
import { fetchDrafts, reviewedDrafts, scoreOf } from '../lib/review';
import { stem } from '../lib/storageList';
import type { LooseContainer, OpenedUnit, Part, Project, Setup, SetupPocket } from '../lib/types';
import { uid } from '../state';
import { Stat } from './CollectionTab';
import Fold, { useFolds } from './Fold';
import Labels from './Labels';
import PartImage from './PartImage';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  plan: Plan;
  parts: Part[];
  categories: Record<string, string>;
  goTo: (t: 'collection' | 'storage' | 'plan') => void;
}

const L = (cm3: number) => `${(cm3 / 1000).toFixed(1)} L`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (r: EstimateRow) => `×${(r.estimate ? r.real / r.estimate : 0).toFixed(2)}`;

const FINDINGS: { kind: FindingKind; title: string; hint: string }[] = [
  { kind: 'overfull', title: 'Too full', hint: 'Over your practical fill in Settings, going by the fill you entered.' },
  { kind: 'tooBig', title: 'May not fit', hint: 'Going by the size in the part’s name, and the size of the space it’s in.' },
  { kind: 'split', title: 'Same part in separate places', hint: 'Drawers next to each other don’t count.' },
  { kind: 'scattered', title: 'Similar parts spread out', hint: 'Parts of one group in drawers that aren’t next to each other.' },
  { kind: 'mixed', title: 'Mixed pockets', hint: 'If it’s how you like it, tick “Mixed on purpose” on that pocket and the review will leave it alone.' },
  { kind: 'roomy', title: 'Half empty or more', hint: 'Room to take something else, or to combine with a neighbour.' },
  { kind: 'unsure', title: 'Worth checking', hint: 'No real fill entered, and the estimate can’t be right.' },
];
const SHOWN_FINDINGS = 6;
/** Parts listed per family under "Not sorted yet" */
const UNSORTED_SHOWN = 150;

export default function SetupTab({ project, update, plan, parts, categories, goTo }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [printing, setPrinting] = useState(false);
  const [perBox, setPerBox] = useState(false);
  /** the box that parts under "Not sorted yet" are put into */
  const [target, setTarget] = useState<{ key: string; pocket: number } | null>(null);
  const [lastPut, setLastPut] = useState<{ partNum: string; name: string; key: string; pocket: number; code: string } | null>(null);
  const draftRef = useRef<HTMLInputElement>(null);
  const folds = useFolds();
  const { photos, refresh: refreshPhotos } = usePhotos();
  const { boxes, refresh: refreshBoxes } = useBoxNames();
  const setup = project.setup;
  const setSetup = (f: (s: Setup) => Setup) => update((p) => ({ setup: f(p.setup) }));
  const scale = project.settings.volumeScale;
  const tree = useMemo(() => buildTree(parts, categories, scale), [parts, categories, scale]);
  const base = useMemo(() => plan.compartments.map((c) => c.comp), [plan.compartments]);
  const comps = useMemo(() => setupComps(base, setup.open), [base, setup.open]);
  const openable = useMemo(() => openableUnits(base), [base]);
  const choices = useMemo(() => containerChoices(setup, base), [setup, base]);
  const analysis = useMemo(() => analyseSetup(setup, comps, parts, project.settings, tree), [setup, comps, parts, project.settings, tree]);

  const placed = useMemo(() => new Map(comps.map((c) => [c.key, analysis.pockets.filter((p) => p.comp.key === c.key)])), [comps, analysis.pockets]);
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
          This tab records what’s in your {!parts.length ? 'collection' : 'storage'} today.{' '}
          <button className="link" onClick={() => goTo(!parts.length ? 'collection' : 'storage')}>
            Go to {!parts.length ? 'Collection' : 'Storage'} →
          </button>
        </p>
      </div>
    );
  }

  if (printing)
    return (
      <Labels
        entries={setupLabels(analysis.pockets, comps, perBox)}
        close={() => setPrinting(false)}
        backLabel="Back to My setup"
        note="Named boxes print their name; others print their main part or group."
        options={
          <label className="small">
            <input type="checkbox" checked={perBox} onChange={(e) => setPerBox(e.target.checked)} /> A label for each box
          </label>
        }
      />
    );

  const kinds = new Map<string, SetupComp[]>();
  for (const c of comps) kinds.set(stem(c.unitName), [...(kinds.get(stem(c.unitName)) ?? []), c]);
  const q = filter.trim().toLowerCase();
  // What's left to do: drawers with nothing recorded, and parts that aren't in any recorded drawer
  const emptyDrawers = comps.filter((c) => !setup.drawers[c.key]?.length);
  const unsorted = unsortedByFamily(analysis.unplaced, scale);
  const unsortedPieces = unsorted.reduce((t, f) => t + f.pieces, 0);
  const unsortedVolume = unsorted.reduce((t, f) => t + f.volume, 0);
  const partMatches = (p: Part) => p.partNum.toLowerCase() === q || p.name.toLowerCase().includes(q);
  const unsortedHit = !!q && analysis.unplaced.some(partMatches);
  // Putting unsorted parts straight into a box: choose the box once, then each part is one click
  const targetComp = comps.find((c) => c.key === target?.key);
  const targetPockets = targetComp ? setup.drawers[targetComp.key] ?? [] : [];
  const targetIndex = Math.min(target?.pocket ?? 0, Math.max(0, targetPockets.length - 1));
  const targetCode = targetComp ? (targetPockets.length > 1 ? `${targetComp.code}.${targetIndex + 1}` : targetComp.code) : '';
  const pocketName = (key: string, i: number) => {
    const p = (setup.drawers[key] ?? [])[i];
    const names = (placed.get(key) ?? []).find((x) => x.id === p?.id)?.parts.map((x) => x.part.name) ?? [];
    return `Pocket ${i + 1}${p?.label ? ` · ${p.label}` : names.length ? ` · ${names.slice(0, 2).join(', ')}${names.length > 2 ? '…' : ''}` : ' · empty'}`;
  };
  const putInTarget = (p: Part) => {
    if (!targetComp) return;
    const key = targetComp.key;
    setSetup((s) => {
      const pockets = s.drawers[key] ?? [newPocket(uid())];
      return { ...s, drawers: { ...s.drawers, [key]: addToPocket(pockets, Math.min(targetIndex, pockets.length - 1), [p.partNum]) } };
    });
    setLastPut({ partNum: p.partNum, name: p.name, key, pocket: targetIndex, code: targetCode });
  };
  const undoPut = () => {
    if (!lastPut) return;
    setSetup((s) => (s.drawers[lastPut.key] ? { ...s, drawers: { ...s.drawers, [lastPut.key]: removeFromPocket(s.drawers[lastPut.key], lastPut.pocket, lastPut.partNum) } } : s));
    setLastPut(null);
  };
  // With more than a few kinds of storage the page runs long, so they start folded to a line each
  const kindsOpen = kinds.size <= 2;
  const foldIds = [...[...kinds.keys()].map((k) => `setup:${k}`), 'setup:unsorted', ...unsorted.map((f) => `setup:unsorted:${f.family}`), 'setup:moves', 'setup:estimates', 'setup:review'];
  const matchesFilter = (c: SetupComp) => !q || c.code.toLowerCase() === q || (placed.get(c.key) ?? []).some((p) => p.parts.some((x) => x.part.partNum === q || x.part.name.toLowerCase().includes(q) || x.groupLabel.toLowerCase().includes(q)));

  const index = comps.findIndex((c) => c.key === editing);
  const current = index >= 0 ? comps[index] : null;
  const { check } = analysis;
  const stepTo = (d: number) => setEditing(comps[(index + d + comps.length) % comps.length].key);
  const lifted = choices.filter((c) => c.total !== null);
  const applyDraft = (draft: SetupDraft, notes: string[] = []) => {
    // Codes still to be confirmed ("A3?") can't be loaded until they are, so they're left out quietly
    const result = loadDraft(setup, { drawers: draft.drawers.filter((d) => !d.code.endsWith('?')) }, base, parts, uid);
    if (result.replaced.length && !confirm(`This replaces what you've recorded for ${result.replaced.join(', ')}. Your other drawers aren't affected. Carry on?`)) return;
    setSetup(() => result.setup);
    setDraftNote(
      [
        result.loaded.length ? `Loaded ${result.loaded.join(', ')}. Check them over, as drafts can be wrong.` : 'Nothing was loaded.',
        result.noDrawer.length ? `No drawer called ${result.noDrawer.join(', ')}.` : '',
        result.noPart.length ? `Not in your planned collection, so left out: ${result.noPart.join(', ')}.` : '',
        ...notes,
      ]
        .filter(Boolean)
        .join(' '),
    );
  };
  const openDraft = async (file: File) => {
    try {
      const draft = JSON.parse(await file.text()) as SetupDraft;
      if (!Array.isArray(draft.drawers)) throw new Error('it has no list of drawers');
      applyDraft(draft);
    } catch (e) {
      setDraftNote(`Couldn't load that file: ${(e as Error).message}`);
    }
  };
  /** Drafts whose every box has been checked, with the answers applied */
  const loadChecked = async () => {
    try {
      const { drafts, reviews } = await fetchDrafts();
      // Drafts marked as finished on the review page are done with, so they're neither loaded nor waited for
      const open = drafts.drawers.filter((d) => !reviews[d.code]?.closed);
      const finished = open.filter((d) => {
        const s = scoreOf(d, reviews[d.code]);
        return s.boxes > 0 && s.checked === s.boxes;
      });
      const waiting = open.filter((d) => !finished.includes(d)).map((d) => reviews[d.code]?.code ?? d.code);
      applyDraft(reviewedDrafts({ drawers: finished }, reviews), waiting.length ? [`Still to finish checking: ${waiting.join(', ')}.`] : []);
    } catch (e) {
      setDraftNote(`Couldn't load the drafts: ${e instanceof TypeError ? 'the server can’t be reached' : (e as Error).message}`);
    }
  };
  const openMany = (unitIds: string[], how: OpenedUnit['how']) => setSetup((s) => unitIds.reduce((x, id) => openUnit(x, openable.get(id)!, how, uid), s));
  const closeMany = (unitIds: string[]) => setSetup((s) => unitIds.reduce((x, id) => closeUnit(x, openable.get(id)!), s));

  return (
    <div className="setup">
      <section className="card">
        <h2>My current setup</h2>
        <p className="muted small">
          Record what’s in your drawers today, roughly. Then the review works from what you really have, rather than from a fresh plan. It’s all optional and saved as you go, so do a few drawers at a time. Nothing here changes the Plan tab unless you ask it to.
        </p>
        <div className="stats">
          <Stat label="Drawers recorded" value={`${analysis.drawersRecorded} / ${analysis.drawersTotal}`} hint={`${analysis.pockets.length} pockets`} />
          <Stat label="Part types placed" value={`${analysis.partsPlaced} / ${analysis.partsTotal}`} hint={`${pct(analysis.volumePlaced)} of the collection by volume`} />
          <Stat label="Recorded drawers filled" value={analysis.capacity ? pct(analysis.used / analysis.capacity) : '–'} hint={`${L(analysis.used)} of ${L(analysis.capacity)}`} />
          <Stat label="Real size vs estimate" value={check.pockets ? times(check.total) : '–'} hint={check.pockets ? `from ${check.pockets} pockets with a fill entered` : 'enter a fill to compare'} />
        </div>
        <div className="row">
          <input className="search" placeholder="Where is…? part, number, group or drawer code" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="link" onClick={() => folds.setAll(foldIds, true)}>
            Open all
          </button>
          <button className="link" onClick={() => folds.setAll(foldIds, false)}>
            Close all
          </button>
        </div>
        <div className="setup-layout small setup-drafts">
          <button className="ghost small-btn" disabled={!analysis.drawersRecorded} onClick={() => setPrinting(true)}>
            Print labels…
          </button>
          <a className="small-btn" href="/review" target="_blank" rel="noreferrer">
            Check drafts
          </a>
          <button className="ghost small-btn" onClick={loadChecked} title="Drafts read from your photos that you’ve finished checking, with your answers applied">
            Load checked drafts
          </button>
          <button className="link small" onClick={() => draftRef.current?.click()}>
            or from a file…
          </button>
          <input
            ref={draftRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) openDraft(e.target.files[0]);
              e.target.value = '';
            }}
          />
          {draftNote && <span className="muted">{draftNote}</span>}
          <PhoneLink />
        </div>
        {lifted.length > 0 && (
          <p className="muted small setup-lifted">
            <b>Containers lifted out:</b> {lifted.map((c) => `${c.container.name}, ${c.used} of ${c.total} placed`).join(' · ')}
          </p>
        )}
      </section>

      {[...kinds].map(([kind, list]) => {
        const recorded = list.filter((c) => setup.drawers[c.key]?.length).length;
        const hits = !!q && list.some(matchesFilter);
        const unitIds = [...new Set(list.map((c) => c.unitId))].filter((id) => openable.has(id));
        const opened = unitIds.filter((id) => setup.open[id]);
        const closed = unitIds.filter((id) => !setup.open[id]);
        const each = (ids: string[]) => (ids.length > 1 ? ` of all ${ids.length}` : '');
        return (
          <Fold key={kind} id={`setup:${kind}`} folds={folds} defaultOpen={kindsOpen} force={hits} title={`${list[0].code === list[list.length - 1].code ? list[0].code : `${list[0].code}–${list[list.length - 1].code}`} ${kind}`} summary={`${recorded} of ${list.length} recorded`}>
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
              {list.map((c) => (
                <DrawerTile key={c.key} comp={c} recorded={!!setup.drawers[c.key]?.length} pockets={placed.get(c.key) ?? []} photos={photos.filter((p) => p.code === c.code).length} dim={!!q && !matchesFilter(c)} onClick={() => setEditing(c.key)} />
              ))}
            </div>
          </Fold>
        );
      })}

      <Fold
        id="setup:unsorted"
        folds={folds}
        force={unsortedHit}
        title="Not sorted yet"
        summary={
          analysis.unplaced.length || emptyDrawers.length
            ? [
                analysis.unplaced.length ? `${analysis.unplaced.length.toLocaleString()} part types, ${unsortedPieces.toLocaleString()} pieces, ${L(unsortedVolume)} (${pct(1 - analysis.volumePlaced)} of the collection)` : 'every part is in a drawer',
                emptyDrawers.length ? `${emptyDrawers.length} ${emptyDrawers.length === 1 ? 'drawer' : 'drawers'} not recorded` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : 'everything is recorded'
        }
      >
        {emptyDrawers.length > 0 && (
          <>
            <h4 className="setup-sub">
              Drawers with nothing recorded <span className="muted small">click one to record it</span>
            </h4>
            <div className="setup-chips">
              {emptyDrawers.slice(0, 120).map((c) => (
                <button key={c.key} className="ghost small-btn" title={`${c.unitName} › ${c.label}`} onClick={() => setEditing(c.key)}>
                  {c.code}
                </button>
              ))}
              {emptyDrawers.length > 120 && <span className="muted small">and {emptyDrawers.length - 120} more</span>}
            </div>
          </>
        )}
        {unsorted.length > 0 && (
          <>
            <h4 className="setup-sub">
              Parts not in any recorded drawer <span className="muted small">by family, biggest first</span>
            </h4>
            <div className="unsorted-target">
              <label>
                Put parts straight into{' '}
                <select value={target?.key ?? ''} onChange={(e) => setTarget(e.target.value ? { key: e.target.value, pocket: 0 } : null)}>
                  <option value="">choose a drawer…</option>
                  {comps.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.code} · {c.unitName} › {c.label}
                      {setup.drawers[c.key]?.length ? '' : ' (nothing recorded)'}
                    </option>
                  ))}
                </select>
              </label>
              {targetComp && targetPockets.length > 1 && (
                <select aria-label="Which pocket" value={targetIndex} onChange={(e) => setTarget({ key: targetComp.key, pocket: Number(e.target.value) })}>
                  {targetPockets.map((p, i) => (
                    <option key={p.id} value={i}>
                      {pocketName(targetComp.key, i)}
                    </option>
                  ))}
                </select>
              )}
              {targetComp ? (
                <>
                  <span className="muted">
                    then click <b>+ {targetCode}</b> beside a part.
                  </span>
                  <button className="link small" onClick={() => setEditing(targetComp.key)}>
                    Open {targetComp.code}
                  </button>
                </>
              ) : (
                <span className="muted">and each part below gets a button to add it there.</span>
              )}
              {lastPut && (
                <span aria-live="polite">
                  Added {lastPut.name} to {lastPut.code}.{' '}
                  <button className="link small" onClick={undoPut}>
                    Undo
                  </button>
                </span>
              )}
            </div>
          </>
        )}
        {unsorted.map((f) => {
          const shown = q ? f.parts.filter(partMatches) : f.parts;
          if (!shown.length) return null;
          return (
            <Fold key={f.family} id={`setup:unsorted:${f.family}`} folds={folds} inner force={unsortedHit} title={<><span className={`swatch fam-${f.family}`} /> {f.label}</>} summary={`${f.parts.length} part types, ${f.pieces.toLocaleString()} pieces, ${L(f.volume)}`}>
              <ul className="setup-unplaced">
                {shown.slice(0, UNSORTED_SHOWN).map((p) => (
                  <li key={p.partNum}>
                    <PartImage partNum={p.partNum} size={26} title={p.name} /> {p.name} <span className="muted small">× {p.qty.toLocaleString()}</span>
                    {targetComp && (
                      <button className="ghost small-btn put" title={`Put ${p.name} in ${targetCode}`} onClick={() => putInTarget(p)}>
                        + {targetCode}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {shown.length > UNSORTED_SHOWN && <p className="muted small">The {UNSORTED_SHOWN} biggest by volume, of {shown.length}. Search above to find a particular part.</p>}
            </Fold>
          );
        })}
      </Fold>

      <Fold id="setup:moves" folds={folds} defaultOpen title="Suggested moves" summary={analysis.suggestions.length ? `${analysis.suggestions.length}${analysis.moreSuggestions ? '+' : ''} to look at` : analysis.drawersRecorded ? 'none right now' : 'record some drawers first'}>
        <Suggestions setup={setup} setSetup={setSetup} analysis={analysis} />
      </Fold>

      <Fold id="setup:estimates" folds={folds} title="Estimates against your drawers" summary={check.pockets ? `real size ${times(check.total)} of the estimate` : 'enter a fill to compare'}>
        <EstimateCheck setup={setup} setSetup={setSetup} analysis={analysis} />
      </Fold>

      <Fold id="setup:review" folds={folds} title="What the review found" summary={analysis.findings.length ? `${analysis.findings.length} things to look at` : 'nothing yet'}>
        <Findings findings={analysis.findings} />
      </Fold>


      {current && (
        <DrawerEditor
          key={current.key}
          comp={current}
          pockets={setup.drawers[current.key] ?? null}
          placed={placed.get(current.key) ?? []}
          photos={photos.filter((p) => p.code === current.code)}
          codes={comps.map((c) => c.code)}
          boxes={boxes}
          onPhotosChanged={() => {
            refreshPhotos();
            refreshBoxes();
          }}
          tree={tree}
          whereIs={whereIs}
          choices={choices.filter((c) => howManyFit(c.container, current) > 0)}
          canOpen={openable.has(current.unitId)}
          onOpen={(how) => {
            openMany([current.unitId], how);
            setEditing(wholeKey(current.unitId));
          }}
          onPutBack={() => {
            const first = openable.get(current.unitId)![0];
            closeMany([current.unitId]);
            setEditing(first.key);
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
        />
      )}
    </div>
  );
}

/** Where to point a phone. On this computer "localhost" means nothing to the phone, so ask the server for its address. */
function PhoneLink() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const [urls, setUrls] = useState<string[]>(local ? [] : [`${location.origin}/snap`]);
  useEffect(() => {
    if (!local) return;
    fetch('/api/info')
      .then((r) => (r.ok ? r.json() : { urls: [] }))
      .then((info: { urls: string[] }) => setUrls(info.urls))
      .catch(() => {
        /* no server to ask, so no link to show */
      });
  }, [local]);
  if (!urls.length) return null;
  return (
    <span className="muted setup-phone">
      Photos from your phone: open <b>{urls.join(' or ')}</b>
    </span>
  );
}

/** The drawer's photos: the top photo with a numbered dot for each marked piece or close-up, marking a box
 * afterwards by clicking it, and refiling everything under another drawer when units move around. */
function DrawerPhotos({ photos, codes, boxes, onChanged }: { photos: Photo[]; codes: string[]; boxes: BoxNames; onChanged: () => void }) {
  const [marking, setMarking] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  if (!photos.length) return null;
  const code = photos[0].code;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      alert(`Couldn't do that: ${(e as Error).message}`);
    }
    setBusy(false);
    onChanged();
  };
  const remove = (p: Photo) => confirm(`Delete ${p.name}?`) && run(() => deletePhoto(p.name));
  const top = topPhotoOf(photos, code);
  const markable = photos.filter((p) => p.view === 'piece' || p.view === 'closeup');
  const marked = markable.filter((p) => p.spot);
  const number = (p: Photo) => marked.indexOf(p) + 1;
  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!marking) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = (v: number, size: number) => Math.min(99, Math.max(0, Math.floor((v / size) * 100)));
    const spot = { x: at(e.clientX - r.left, r.width), y: at(e.clientY - r.top, r.height) };
    const name = marking;
    setMarking(null);
    void run(() => changePhoto(name, { spot }));
  };
  const others = codes.filter((c) => c !== code);
  const moveAll = () => {
    if (!moveTo || !confirm(`Move all ${photos.length} photos from ${code} to ${moveTo}? Their box marks go with them.`)) return;
    // Oldest first, so they keep their order in the new drawer
    void run(async () => {
      for (const p of [...photos].sort((a, b) => a.mtime - b.mtime)) await changePhoto(p.name, { code: moveTo });
      // Box names are places on the top photo, so they go where it goes
      if (boxes[code]?.length) {
        await saveBoxNames(moveTo, [...(boxes[moveTo] ?? []), ...boxes[code]]);
        await saveBoxNames(code, []);
      }
    });
    setMoveTo('');
  };
  return (
    <>
      {top && markable.length > 0 && (
        <div className={`setup-photo-map ${marking ? 'marking' : ''}`}>
          <img src={photoUrl(top)} alt={`${top.name}, with where each piece and close-up came from`} onClick={pick} />
          {(boxes[code] ?? []).map((b) => (
            <span key={`${b.x}-${b.y}`} className="setup-box-name" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
              {b.name}
            </span>
          ))}
          {marked.map((p) => (
            <a key={p.name} className="setup-photo-dot" href={photoUrl(p)} target="_blank" rel="noreferrer" title={p.name} style={{ left: `${p.spot!.x}%`, top: `${p.spot!.y}%` }}>
              {number(p)}
            </a>
          ))}
        </div>
      )}
      {marking && (
        <p className="small setup-marking">
          Click the box on the top photo that {marking} came from.{' '}
          <button className="link small" onClick={() => setMarking(null)}>
            Cancel
          </button>
        </p>
      )}
      <div className="setup-photos">
        {photos.map((p) => (
          <figure key={p.name} className={`setup-photo ${marking === p.name ? 'selected' : ''}`}>
            <a href={photoUrl(p)} target="_blank" rel="noreferrer" title={p.name}>
              <img src={photoUrl(p)} alt={p.name} loading="lazy" />
            </a>
            {p.spot && <span className="setup-photo-number">{number(p)}</span>}
            <button className="icon" aria-label={`Delete ${p.name}`} disabled={busy} onClick={() => remove(p)}>
              ✕
            </button>
            {top && (p.view === 'piece' || p.view === 'closeup') && (
              <figcaption>
                <button className="link small" disabled={busy} onClick={() => setMarking(p.name)}>
                  {p.spot ? 'Move mark' : 'Mark box'}
                </button>
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {others.length > 0 && (
        <div className="setup-layout small">
          <span className="muted">Taken for a different drawer?</span>
          <select aria-label="Drawer to move these photos to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">Move all to…</option>
            {others.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="ghost small-btn" disabled={!moveTo || busy} onClick={moveAll}>
            Move
          </button>
        </div>
      )}
    </>
  );
}

function DrawerTile({ comp, recorded, pockets, photos, dim, onClick }: { comp: SetupComp; recorded: boolean; pockets: PlacedPocket[]; photos: number; dim: boolean; onClick: () => void }) {
  const capacity = pockets.reduce((t, p) => t + p.capacity, 0);
  const used = pockets.reduce((t, p) => t + p.used, 0);
  const inUse = pockets.filter((p) => p.parts.length);
  const family = [...inUse].sort((a, b) => b.used - a.used)[0]?.family;
  const measured = inUse.length > 0 && inUse.every((p) => p.fill !== undefined);
  const names = [...new Set(inUse.map((p) => p.label || (p.mixed ? 'Mixed' : p.groupLabel)))];
  return (
    <button className={`setup-tile ${recorded ? '' : 'todo'} ${dim ? 'dim' : ''} ${family ? `fam-border-${family}` : ''}`} onClick={onClick} title={comp.sections ? `${comp.unitName}, whole box` : `${comp.unitName} › ${comp.label} — ${comp.w}×${comp.d}×${comp.h} mm`}>
      <span className="setup-tile-head">
        <span className="code">{comp.code}</span>
        {pockets.length > 1 && <span className="muted small">{pockets.length} pockets</span>}
        {photos > 0 && <span className="muted small">{photos} {photos === 1 ? 'photo' : 'photos'}</span>}
        {inUse.length > 0 && (
          <span className={`small setup-tile-fill ${measured ? '' : 'muted'}`}>
            {measured ? '' : '~'}
            {pct(used / capacity)}
          </span>
        )}
      </span>
      <span className="small setup-tile-names">{recorded ? (names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` + ${names.length - 2}` : '') : 'Empty') : 'Not recorded'}</span>
    </button>
  );
}

function DrawerEditor({
  comp,
  pockets,
  placed,
  photos,
  codes,
  boxes,
  onPhotosChanged,
  tree,
  whereIs,
  choices,
  canOpen,
  onOpen,
  onPutBack,
  onLitres,
  onNewContainer,
  onChange,
  onForget,
  onPrev,
  onNext,
  onClose,
}: {
  comp: SetupComp;
  pockets: SetupPocket[] | null;
  placed: PlacedPocket[];
  photos: Photo[];
  codes: string[];
  boxes: BoxNames;
  onPhotosChanged: () => void;
  tree: TreeNode;
  whereIs: Map<string, string[]>;
  /** containers that fit in here */
  choices: ContainerChoice[];
  canOpen: boolean;
  onOpen: (how: OpenedUnit['how']) => void;
  onPutBack: () => void;
  onLitres: (litres: number) => void;
  onNewContainer: (c: LooseContainer) => void;
  onChange: (next: SetupPocket[]) => void;
  onForget: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [first] = useState(uid);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  // The photos take a lot of room, so they start folded away once the drawer has pockets recorded to work on
  const [showPhotos, setShowPhotos] = useState(() => !pockets || pockets.length < 2);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = pockets ?? [newPocket(first)];
  const activeIndex = Math.min(active, current.length - 1);
  const inDrawers = useMemo(() => new Set(whereIs.keys()), [whereIs]);
  const results = useMemo(() => searchParts(tree, query, inDrawers), [tree, query, inDrawers]);
  const nextUp = useMemo(() => (lastAdded && !query ? unplacedNeighbours(tree, lastAdded, inDrawers) : []), [tree, lastAdded, query, inDrawers]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const add = (nums: string[]) => {
    if (!nums.length) return;
    onChange(addToPocket(current, activeIndex, nums));
    setLastAdded(nums[nums.length - 1]);
    setQuery('');
    searchRef.current?.focus();
  };
  // Enter takes the closest single part. A whole group is a bigger step, so that's always a click.
  const addFirst = () => results.parts[0] && add([results.parts[0].partNum]);
  const plain = current.filter((p) => !p.container);
  const totalShare = plain.reduce((t, p) => t + p.share, 0);
  const hasContainers = plain.length < current.length;
  const left = floorLeft(comp, current);
  // A drawer needs a pocket of some sort, and an ordinary pocket with something in it can't just vanish
  const minPockets = hasContainers && plain.every((p) => !p.parts.length) ? 0 : 1;

  return (
    <div className="move-backdrop" onClick={onClose}>
      <div className="move-picker card setup-editor" role="dialog" aria-label={`Drawer ${comp.code}`} onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h3>
            <span className="code">{comp.code}</span> {comp.unitName} › {comp.label}
          </h3>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {comp.sections ? (
          <div className="setup-layout small">
            <label>
              Holds{' '}
              <input
                type="number"
                min={0.1}
                step={0.1}
                defaultValue={Number((comp.volume / 1000).toFixed(2))}
                aria-label="What the whole box holds, litres"
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v > 0) onLitres(v);
                }}
              />{' '}
              L
            </label>
            <span className="muted">Whole box, without its {comp.sections} sections</span>
            <button className="link small" onClick={onPutBack}>
              Put the sections back
            </button>
          </div>
        ) : (
          <>
            <p className="muted small">
              {comp.w}×{comp.d}×{comp.h} mm · {L(comp.volume)}
            </p>
            {canOpen && (
              <div className="setup-layout small">
                <span className="muted">Not using this box’s sections?</span>
                <button className="ghost small-btn" onClick={() => onOpen('dividers')}>
                  Take the dividers out
                </button>
                <button className="ghost small-btn" onClick={() => onOpen('containers')}>
                  Lift the containers out
                </button>
              </div>
            )}
          </>
        )}

        {photos.length > 0 ? (
          <details className="setup-fold" open={showPhotos} onToggle={(e) => setShowPhotos((e.target as HTMLDetailsElement).open)}>
            <summary>
              Photos <span className="muted small">{photos.length}</span>
            </summary>
            <DrawerPhotos photos={photos} codes={codes} boxes={boxes} onChanged={onPhotosChanged} />
          </details>
        ) : (
          <DrawerPhotos photos={photos} codes={codes} boxes={boxes} onChanged={onPhotosChanged} />
        )}

        <div className="setup-count">
          <span>Pockets</span>
          <button className="ghost small-btn" aria-label="Fewer pockets" disabled={plain.length <= minPockets} onClick={() => onChange(resizePockets(current, plain.length - 1, uid))}>
            −
          </button>
          <b>{plain.length}</b>
          <button className="ghost small-btn" aria-label="More pockets" onClick={() => onChange(resizePockets(current, plain.length + 1, uid))}>
            +
          </button>
          {plain.length > 0 && Math.abs(totalShare - 1) > 0.02 && <span className="muted small">Sizes add up to {pct(totalShare)}, and will be scaled to fit.</span>}
        </div>

        <ContainerAdder comp={comp} current={current} choices={choices} onAdd={(c, n) => onChange(addContainers(current, c, n, uid))} onNew={onNewContainer} />
        {hasContainers && (
          <p className={`muted small ${left < 0 ? 'warn-text' : ''}`}>
            {left < 0 ? `These containers need ${pct(1 - left)} of the floor, so they won’t all stand in here.` : plain.length ? `Containers take ${pct(1 - left)} of the floor, and the pockets share the rest.` : `Containers take ${pct(1 - left)} of the floor. Add a pocket if you use the rest.`}
          </p>
        )}

        {current.map((pocket, i) => (
          <PocketRow
            key={`${pocket.id}-${current.length}`}
            pocket={pocket}
            index={i}
            sized={plain.length > 1 && !pocket.container}
            divided={current.length > 1}
            active={i === activeIndex}
            placed={placed.find((p) => p.id === pocket.id)}
            whereIs={whereIs}
            code={comp.code}
            onActivate={() => setActive(i)}
            onChange={(change) => onChange(setPocket(current, i, change))}
            onRemove={(part) => onChange(removeFromPocket(current, i, part))}
            onRemovePocket={pocket.container ? () => onChange(removePocket(current, i, uid)) : undefined}
            boxNames={(boxes[comp.code] ?? []).map((b) => b.name)}
          />
        ))}

        <h4>Add to {current.length > 1 ? `pocket ${activeIndex + 1}` : 'this drawer'}</h4>
        <input
          ref={searchRef}
          className="search keep-search"
          placeholder="Search parts or groups, e.g. plate 2 x 4, technic pins"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addFirst()}
        />
        <div className="move-list setup-results">
          {results.groups.map((g) => (
            <button key={g.id} className="move-choice" disabled={!g.unplaced} onClick={() => add(g.parts.filter((p) => !inDrawers.has(p.partNum)).map((p) => p.partNum))}>
              <span className={`setup-group-mark fam-border-${g.family}`} />
              <span className="move-name">
                <b>{g.label}</b> <span className="muted small">{familyLabel(g.family)}</span>
              </span>
              <span className="muted small nowrap">{g.unplaced ? `add ${g.unplaced} of ${g.parts.length} parts` : 'all placed'}</span>
            </button>
          ))}
          {results.parts.map((p) => (
            <PartChoice key={p.partNum} part={p} whereIs={whereIs} onAdd={() => add([p.partNum])} />
          ))}
          {nextUp.length > 0 && <p className="muted small">Next in that group, not in a drawer yet:</p>}
          {nextUp.map((p) => (
            <PartChoice key={p.partNum} part={p} whereIs={whereIs} onAdd={() => add([p.partNum])} />
          ))}
          {query && !results.groups.length && !results.parts.length && <p className="muted small">No match. It may be kept out of the plan, or built into a set.</p>}
        </div>

        <div className="setup-editor-foot">
          <button className="ghost small-btn" onClick={onPrev}>
            ‹ Previous
          </button>
          <button className="small-btn" onClick={onNext}>
            Next drawer ›
          </button>
          {!pockets && (
            <button className="ghost small-btn" onClick={() => onChange(current)}>
              It’s empty
            </button>
          )}
          {pockets && (
            <button
              className="link small"
              onClick={() => {
                if (confirm(`Forget what you’ve recorded for ${comp.code}? Your other drawers aren’t affected.`)) onForget();
              }}
            >
              Forget this drawer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Stand containers in a drawer: one at a time, as many as fit, or a size of the user's own */
function ContainerAdder({ comp, current, choices, onAdd, onNew }: { comp: SetupComp; current: SetupPocket[]; choices: ContainerChoice[]; onAdd: (c: LooseContainer, count: number) => void; onNew: (c: LooseContainer) => void }) {
  const [picked, setPicked] = useState('');
  const [adding, setAdding] = useState(false);
  const [size, setSize] = useState({ name: '', w: '', d: '', h: '' });
  const choice = choices.find((c) => c.key === picked) ?? choices[0];
  const free = choice && choice.total !== null ? choice.total - choice.used : null;
  // How many more will stand on the floor that's left, and that there are spare
  const fit = choice ? Math.min(Math.floor((howManyFit(choice.container, comp) * Math.max(0, floorLeft(comp, current))) + 0.001), free ?? Infinity) : 0;
  const ready = size.name.trim() && Number(size.w) > 0 && Number(size.d) > 0 && Number(size.h) > 0;
  return (
    <div className="setup-layout small">
      {choices.length > 0 && (
        <>
          <select aria-label="Container" value={choice?.key ?? ''} onChange={(e) => setPicked(e.target.value)}>
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.container.name}, {c.container.w}×{c.container.d}×{c.container.h}
                {c.total !== null ? ` (${Math.max(0, c.total - c.used)} of ${c.total} left)` : ''}
              </option>
            ))}
          </select>
          <button className="ghost small-btn" onClick={() => choice && onAdd(choice.container, 1)}>
            Add one
          </button>
          {fit > 1 && (
            <button className="ghost small-btn" onClick={() => choice && onAdd(choice.container, fit)}>
              Add {fit}, as many as fit
            </button>
          )}
        </>
      )}
      <button className="link small" onClick={() => setAdding(!adding)}>
        {choices.length ? 'Other size…' : 'Add a loose container…'}
      </button>
      {adding && (
        <span className="setup-new-container">
          <input placeholder="Name" aria-label="Container name" value={size.name} onChange={(e) => setSize({ ...size, name: e.target.value })} />
          {(['w', 'd', 'h'] as const).map((k) => (
            <input key={k} type="number" min={1} placeholder={`${k} mm`} aria-label={`Container ${k}, mm`} value={size[k]} onChange={(e) => setSize({ ...size, [k]: e.target.value })} />
          ))}
          <button
            className="ghost small-btn"
            disabled={!ready}
            onClick={() => {
              const c = { name: size.name.trim(), w: Number(size.w), d: Number(size.d), h: Number(size.h) };
              onNew(c);
              onAdd(c, 1);
              setAdding(false);
              setSize({ name: '', w: '', d: '', h: '' });
            }}
          >
            Add
          </button>
        </span>
      )}
    </div>
  );
}

function PartChoice({ part, whereIs, onAdd }: { part: Part; whereIs: Map<string, string[]>; onAdd: () => void }) {
  const where = whereIs.get(part.partNum);
  return (
    <button className="move-choice" onClick={onAdd}>
      <PartImage partNum={part.partNum} size={26} title={part.name} />
      <span className="move-name">{part.name}</span>
      <span className="muted small nowrap">{where ? `also in ${[...new Set(where)].slice(0, 2).join(', ')}` : `× ${part.qty.toLocaleString()}`}</span>
    </button>
  );
}

const QUICK_FILLS = [25, 50, 75, 100];

function PocketRow({
  pocket,
  index,
  sized,
  divided,
  active,
  placed,
  whereIs,
  code,
  onActivate,
  onChange,
  onRemove,
  onRemovePocket,
  boxNames,
}: {
  pocket: SetupPocket;
  index: number;
  /** its size is a share of the drawer */
  sized: boolean;
  divided: boolean;
  active: boolean;
  placed?: PlacedPocket;
  whereIs: Map<string, string[]>;
  code: string;
  onActivate: () => void;
  onChange: (change: Partial<SetupPocket>) => void;
  onRemove: (part: string) => void;
  onRemovePocket?: () => void;
  /** names given to boxes in this drawer on the phone */
  boxNames: string[];
}) {
  const fillPercent = pocket.fill === undefined ? '' : String(Math.round(pocket.fill * 100));
  const estimated = placed && placed.parts.length ? placed.estimate / placed.capacity : null;
  // In a drawer of several pockets only the one being worked on is opened out, so the list stays short enough to
  // see the search box below it. The rest are a line each: click one to work on it.
  if (divided && !active) {
    const names = (placed?.parts ?? []).map((x) => x.part.name);
    return (
      <button className="setup-pocket folded" aria-expanded={false} onClick={onActivate}>
        <span className="fold-caret">▸</span>
        <b>Pocket {index + 1}</b>
        {pocket.label && <span>{pocket.label}</span>}
        {pocket.container && <span className="muted small">{pocket.container.name}</span>}
        <span className="muted small setup-pocket-summary">
          {pocket.parts.length ? `${pocket.parts.length} ${pocket.parts.length === 1 ? 'part' : 'parts'}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` : 'nothing yet'}
        </span>
        <span className="muted small nowrap">{pocket.fill === undefined ? '' : `${fillPercent}% full`}</span>
      </button>
    );
  }
  return (
    <div className={`setup-pocket ${active ? 'active' : ''}`} onClick={onActivate}>
      <div className="setup-pocket-head">
        {divided && (
          <b>
            <span className="fold-caret">▾</span> Pocket {index + 1}
          </b>
        )}
        {pocket.container && (
          <span className="small">
            {pocket.container.name} <span className="muted">{pocket.container.w}×{pocket.container.d}×{pocket.container.h}</span>
          </span>
        )}
        {sized && (
          <label className="small">
            <input
              type="number"
              min={1}
              max={100}
              defaultValue={Math.round(pocket.share * 100)}
              aria-label={`Size of pocket ${index + 1}, % of the drawer`}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0) onChange({ share: v / 100 });
              }}
            />{' '}
            % of drawer
          </label>
        )}
        <label className="small">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="?"
            value={fillPercent}
            aria-label={`How full${divided ? ` pocket ${index + 1}` : ''} is, %`}
            onChange={(e) => onChange({ fill: e.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(e.target.value))) / 100 })}
          />{' '}
          % full
        </label>
        <span className="setup-quick">
          {QUICK_FILLS.map((v) => (
            <button key={v} className={`ghost small-btn ${fillPercent === String(v) ? 'on' : ''}`} onClick={() => onChange({ fill: v / 100 })}>
              {v}
            </button>
          ))}
        </span>
        {estimated !== null && <span className={`muted small ${estimated > 1 ? 'warn-text' : ''}`}>estimate {pct(estimated)}</span>}
        <label className="small setup-mixed">
          <input type="checkbox" checked={!!pocket.mixed} onChange={(e) => onChange({ mixed: e.target.checked || undefined })} /> Mixed on purpose
        </label>
        <input
          className="setup-label-input"
          list={`${pocket.id}-names`}
          placeholder="Label, e.g. Fences"
          aria-label={`Label for ${divided ? `pocket ${index + 1}` : 'this drawer'}`}
          value={pocket.label ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
        />
        <datalist id={`${pocket.id}-names`}>
          {[...new Set([...boxNames, ...BOX_NAME_IDEAS])].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {onRemovePocket && (
          <button className="link small" onClick={onRemovePocket}>
            Remove
          </button>
        )}
      </div>
      {pocket.parts.length > 0 ? (
        <ul className="setup-parts">
          {(placed?.parts ?? []).map((x) => {
            const elsewhere = [...new Set(whereIs.get(x.part.partNum) ?? [])].filter((c) => c !== code);
            return (
              <li key={x.part.partNum}>
                <PartImage partNum={x.part.partNum} size={22} title={x.part.name} />
                <span>
                  {x.part.name}
                  {elsewhere.length > 0 && <span className="muted small"> · also {elsewhere.slice(0, 2).join(', ')}</span>}
                  {x.tooBig && <span className="warn-text small"> · looks too big for this</span>}
                </span>
                <button className="icon" aria-label={`Remove ${x.part.name}`} onClick={() => onRemove(x.part.partNum)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">Nothing yet. {active ? 'Search below to add parts.' : 'Click here, then search below.'}</p>
      )}
    </div>
  );
}

function Suggestions({ setup, setSetup, analysis }: { setup: Setup; setSetup: (f: (s: Setup) => Setup) => void; analysis: SetupAnalysis }) {
  return (
    <>
      {setup.accepted.length > 0 && (
        <div className="setup-todo">
          <h4>Moves to make</h4>
          <ul className="change-list">
            {setup.accepted.map((a, i) => (
              <li key={`${a.id}-${i}`}>
                {a.text}{' '}
                <button className="link small" onClick={() => setSetup((s) => ({ ...s, accepted: s.accepted.filter((_, n) => n !== i) }))}>
                  Done
                </button>{' '}
                {i === setup.accepted.length - 1 && (
                  <button className="link small" onClick={() => setSetup(undoLastAccepted)}>
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {analysis.suggestions.length === 0 && <p className="muted small">{analysis.drawersRecorded ? 'Nothing to suggest from what’s recorded so far. More drawers, with fills entered, give it more to work with.' : 'Record a few drawers above and suggestions will appear here.'}</p>}
      <ul className="setup-suggestions">
        {analysis.suggestions.map((s) => (
          <li key={s.id}>
            <div>
              <b>{s.title}</b>
              <p className="muted small">
                {s.why}
                {s.estimated && <span className="warn-text"> Based on an estimated fill, so check it fits.</span>}
              </p>
            </div>
            <div className="setup-suggestion-actions">
              <button className="small-btn" onClick={() => setSetup((x) => acceptSuggestion(x, s, analysis.pockets))}>
                Accept
              </button>
              <button className="ghost small-btn" onClick={() => setSetup((x) => ({ ...x, skipped: [...x.skipped, s.id] }))}>
                Skip
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">
        {analysis.suggestions.length > 0 && 'Accepting updates your record here and adds it to Moves to make. '}
        {analysis.moreSuggestions > 0 && `${analysis.moreSuggestions} more possible, shown as you work through these. `}
        {setup.skipped.length > 0 && (
          <button className="link small" onClick={() => setSetup((s) => ({ ...s, skipped: [] }))}>
            Bring back {setup.skipped.length} skipped
          </button>
        )}
      </p>
    </>
  );
}

function EstimateTable({ rows, heading }: { rows: EstimateRow[]; heading: string }) {
  return (
    <table className="setup-estimates">
      <thead>
        <tr>
          <th>{heading}</th>
          <th>Estimate</th>
          <th>Real</th>
          <th>Real ÷ estimate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{L(r.estimate)}</td>
            <td>{L(r.real)}</td>
            <td>{times(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EstimateCheck({ setup, setSetup, analysis }: { setup: Setup; setSetup: (f: (s: Setup) => Setup) => void; analysis: SetupAnalysis }) {
  const { check } = analysis;
  if (!check.pockets) return <p className="muted small">Enter how full a few pockets are, and this will show where the volume estimates are off.</p>;
  return (
    <>
      <p className="muted small">
        Pockets with a fill entered hold about {L(check.total.real)}. The estimates say {L(check.total.estimate)} for the same parts.
      </p>
      <div className="setup-estimate-tables">
        <EstimateTable rows={check.families} heading="By family" />
        <EstimateTable rows={check.worst} heading="Furthest off" />
      </div>
      <label className="setup-usefills">
        <input type="checkbox" checked={setup.useFills} onChange={(e) => setSetup((s) => ({ ...s, useFills: e.target.checked }))} /> Use these fills to correct the volume estimates
      </label>
      <p className="muted small">
        Reaches the Plan tab when you click Re-plan there. It’s best once most of the collection is recorded ({pct(analysis.volumePlaced)} so far), because a part with some still in an unrecorded drawer will look smaller than it really is.
      </p>
    </>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  const [all, setAll] = useState<FindingKind | null>(null);
  if (!findings.length) return <p className="muted small">Nothing to report yet.</p>;
  return (
    <div className="setup-findings">
      {FINDINGS.map(({ kind, title, hint }) => {
        const list = findings.filter((f) => f.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <h4>
              {title} <span className="muted small">({list.length})</span>
            </h4>
            <p className="muted small">{hint}</p>
            <ul className="change-list">
              {(all === kind ? list : list.slice(0, SHOWN_FINDINGS)).map((f) => (
                <li key={f.text}>{f.text}</li>
              ))}
            </ul>
            {list.length > SHOWN_FINDINGS && (
              <button className="link small" onClick={() => setAll(all === kind ? null : kind)}>
                {all === kind ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
