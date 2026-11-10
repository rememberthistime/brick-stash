import { useMemo, useState } from 'react';
import type { Calibration, Granularity, Measurement, Part, PartMove, PlanBasis, Project, Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import type { Plan, PlannedCompartment, Section } from '../lib/planner';
import { familyLabel, leaves, sectionLabel, targetFill } from '../lib/planner';
import { looseMinimum, recommend } from '../lib/recommend';
import { cuttingList, dividerLayout, type Divider, type DividerLayout, type Rect } from '../lib/dividers';
import { FAMILIES } from '../lib/taxonomy';
import { pickPart, type KeptPart, type KeptSummary } from '../lib/keepOut';
import { download, uid } from '../state';
import { Stat } from './CollectionTab';
import { calibratedVolume, isCurrent, measureCompartment, measuredFactor, withMeasurement } from '../lib/measure';
import { latestMoves, withMove } from '../lib/moves';
import { unitLetter } from '../lib/setup';
import { stem } from '../lib/storageList';
import Fold, { useFolds, type Folds } from './Fold';
import MovePicker, { type MoveRequest } from './MovePicker';
import PartImage from './PartImage';
import Labels from './Labels';
import { planLabels } from '../lib/labels';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  plan: Plan;
  parts: Part[];
  goTo: (t: 'collection' | 'storage') => void;
  keptSummary: KeptSummary;
  staleMoves: number[];
  kept: KeptPart[];
  /** manual changes the plan hasn't been rebuilt around yet */
  pendingChanges: number;
  currentBasis: PlanBasis;
  expandedMoves: PartMove[];
}

/** A compartment with at least this much of it free is worth pointing out */
const ROOMY_FREE = 0.5;

interface Located extends PlannedCompartment {
  code: string;
}

const L = (cm3: number) => `${(cm3 / 1000).toFixed(1)} L`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export { unitLetter };

/** A1, A2… B1 — letter per unit in layout order, number per compartment */
function locate(plan: Plan): Located[] {
  const letters = new Map<string, string>();
  const counters = new Map<string, number>();
  return plan.compartments.map((c) => {
    if (!letters.has(c.comp.unitId)) letters.set(c.comp.unitId, unitLetter(letters.size));
    const n = (counters.get(c.comp.unitId) ?? 0) + 1;
    counters.set(c.comp.unitId, n);
    return { ...c, code: `${letters.get(c.comp.unitId)}${n}` };
  });
}

const sectionParts = (s: Section) => leaves(s.node).filter((l) => l.part).map((l) => l.part!);
const topParts = (s: Section, n: number) => sectionParts(s).sort((a, b) => b.qty - a.qty).slice(0, n);

export default function PlanTab({ project, update, plan, parts, goTo, keptSummary, staleMoves, kept, pendingChanges, currentBasis, expandedMoves }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [labels, setLabels] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [moving, setMoving] = useState<MoveRequest | null>(null);
  const [onlyRoomy, setOnlyRoomy] = useState(false);
  const [beforeReplan, setBeforeReplan] = useState<Pick<Project, 'basis' | 'moves'> | null>(null);
  const folds = useFolds();
  const located = useMemo(() => locate(plan), [plan]);
  const recs = useMemo(() => recommend(plan, parts, project.units, project.spaces), [plan, parts, project.units, project.spaces]);
  const s = plan.stats;
  const avgPiece = s.pieces ? s.volume / s.pieces : 1;

  if (!parts.length || !project.units.length) {
    return (
      <div className="card empty-state big">
        <h2>Nearly there</h2>
        {!parts.length && (
          <p>
            Add your collection first. <button className="link" onClick={() => goTo('collection')}>Go to Collection →</button>
          </p>
        )}
        {!project.units.length && (
          <p>
            Tell the planner what storage you have. <button className="link" onClick={() => goTo('storage')}>Go to Storage →</button>
          </p>
        )}
      </div>
    );
  }

  const byUnit = new Map<string, Located[]>();
  for (const c of located) byUnit.set(c.comp.unitId, [...(byUnit.get(c.comp.unitId) ?? []), c]);

  const q = query.trim().toLowerCase();
  const hits = q
    ? located.flatMap((c) =>
        c.sections.flatMap((sec) =>
          sectionParts(sec)
            .filter((p) => p.partNum.toLowerCase() === q || p.name.toLowerCase().includes(q))
            .map((p) => ({ c, p })),
        ),
      )
    : [];
  const hitCodes = new Set(hits.map((h) => h.c.code));
  const sel = located.find((c) => c.code === selected);

  const exportCsv = () => {
    const rows = [['Location', 'Unit', 'Compartment', 'Group', 'Part', 'Name', 'Quantity']];
    for (const c of located)
      for (const sec of c.sections) for (const p of sectionParts(sec)) rows.push([c.code, c.comp.unitName, c.comp.label, sectionLabel(sec), p.partNum, p.name, String(sec.span ? sec.pieces : p.qty)]);
    download('brick-stash-plan.csv', rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };

  if (labels) return <Labels entries={planLabels(located)} close={() => setLabels(false)} backLabel="Back to plan" note="Section numbers (A3.2) match the divider plan." />;

  const target = targetFill(plan.settings);
  const groupsByKind = new Map<string, [string, Located[]][]>();
  for (const entry of byUnit) {
    const kind = stem(entry[1][0].comp.unitName);
    groupsByKind.set(kind, [...(groupsByKind.get(kind) ?? []), entry]);
  }
  const roomy = (c: Located) => 1 - c.fill >= ROOMY_FREE;
  const roomyCount = located.filter(roomy).length;
  const shows = (c: Located) => hitCodes.has(c.code) || c.sections.some((x) => x.node.familyKey === highlight) || c.spareFor === highlight || (onlyRoomy && roomy(c));
  const keepOutParts = (ps: Part[], keep: boolean) => update((p) => ({ keepOut: ps.reduce((k, part) => pickPart(k, part, keep, p.units), p.keepOut) }));
  const picked = kept.filter((x) => x.reason === 'picked').map((x) => x.part);
  const replan = () => {
    if (!confirm('Re-plan around your changes? Other compartments may change, so any labels you\'ve printed or drawers you\'ve already sorted may no longer match.')) return;
    setBeforeReplan({ basis: project.basis, moves: project.moves });
    update((p) => ({ basis: currentBasis, moves: [...latestMoves(expandedMoves), ...p.moves.filter((_, i) => staleMoves.includes(i))] }));
  };
  const foldIds = [...groupsByKind].flatMap(([kind, units]) => [`kind:${kind}`, ...units.map(([id]) => `unit:${id}`)]);

  const unitTiles = (comps: Located[]) => (
    <div className={`tiles ${comps.length > 24 ? 'compact' : ''}`}>
      {comps.map((c) => (
        <Tile
          key={c.code}
          c={c}
          target={target}
          active={selected === c.code}
          hit={hitCodes.has(c.code)}
          dim={(!!highlight && !c.sections.some((x) => x.node.familyKey === highlight) && c.spareFor !== highlight) || (onlyRoomy && !roomy(c))}
          roomy={c.status === 'used' && roomy(c)}
          onClick={() => setSelected(selected === c.code ? null : c.code)}
        />
      ))}
    </div>
  );

  const requestMove = (sec: Section, from: string | null, single?: Part) => {
    const anchor = single ?? [...sectionParts(sec)].sort((a, b) => b.qty * b.unitVolume - a.qty * a.unitVolume)[0];
    setMoving({ part: anchor.partNum, whole: !single, label: single ? single.name : `the whole of ${sectionLabel(sec)}`, familyKey: sec.node.familyKey, seq: sec.node.seq, from });
  };

  return (
    <div className="plan-layout">
      <aside className="settings no-print">
        <Fold id="settings" folds={folds} title="Settings" summary={`${project.settings.granularity}, +${pct(project.settings.growth)} growth, ${pct(project.settings.practicalFill)} fill`}>
          <SettingsPanel settings={project.settings} onChange={(settings) => update({ settings })} plan={plan} parts={parts} calibration={project.basis.calibration ?? null} />
        </Fold>
      </aside>

      <div className="plan-main">
        <section className="card">
          <div className="stats">
            <Stat label="Pieces placed" value={s.pieces.toLocaleString()} hint={`${s.moulds} part types in ${s.groups} groups`} />
            <Stat label="Compartments used" value={`${s.used} / ${located.length}`} hint={`${s.spare} spare, ${s.empty} empty`} />
            <Stat label="Storage filled" value={pct(s.volume / s.physicalCapacity)} hint={`${L(s.volume)} of ${L(s.physicalCapacity)}`} tone={s.volume / s.physicalCapacity > 0.75 ? 'warn' : 'good'} />
            <Stat
              label="Room to grow"
              value={s.overflowVolume ? 'None' : `~${Math.round(s.headroom / avgPiece).toLocaleString()} pcs`}
              hint={s.overflowVolume ? `${L(s.overflowVolume)} doesn't fit` : 'at your current mix, before anything needs moving'}
              tone={s.overflowVolume ? 'bad' : 'good'}
            />
          </div>
          <div className="row">
            <input className="search" placeholder="Where is…? part number or name" value={query} onChange={(e) => setQuery(e.target.value)} />
            {pendingChanges > 0 && (
              <button onClick={replan} title="Rebuild the plan around your changes, using any space they free up">
                Re-plan ({pendingChanges} {pendingChanges === 1 ? 'change' : 'changes'})
              </button>
            )}
            {/* Only while nothing has changed since, or undoing would silently drop those later changes */}
            {beforeReplan && pendingChanges === 0 && (
              <button
                className="link"
                onClick={() => {
                  update(beforeReplan);
                  setBeforeReplan(null);
                }}
              >
                Undo re-plan
              </button>
            )}
            <button className="ghost" onClick={() => setLabels(true)}>
              Print labels
            </button>
            <button className="ghost" onClick={exportCsv}>
              Export plan (CSV)
            </button>
          </div>
          {q && (
            <div className="hits">
              {hits.length === 0 ? (
                <span className="muted">No match.</span>
              ) : (
                hits.slice(0, 12).map((h, i) => (
                  <button key={i} className="hit" onClick={() => setSelected(h.c.code)}>
                    <b>{h.c.code}</b> {h.p.name} <span className="muted">({h.p.partNum}) — {h.c.comp.unitName}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        {project.moves.length + picked.length + pendingChanges > 0 && (
          <Fold
            id="changes"
            folds={folds}
            defaultOpen
            title="Your changes"
            summary={[
              project.moves.length ? `${project.moves.length} move${project.moves.length === 1 ? '' : 's'}` : '',
              picked.length ? `${picked.length} kept out` : '',
              staleMoves.length ? `${staleMoves.length} no longer apply` : '',
              pendingChanges ? 'not re-planned yet' : '',
            ]
              .filter(Boolean)
              .join(', ')}
          >
            <YourChanges
              moves={project.moves}
              stale={staleMoves}
              parts={parts}
              located={located}
              picked={picked}
              pending={pendingChanges > 0}
              onPutBack={(part) => keepOutParts([part], false)}
              onUndo={(i) => update((p) => ({ moves: p.moves.filter((_, k) => k !== i) }))}
              onUndoAll={() => confirm('Undo all your moves?') && update({ moves: [] })}
            />
          </Fold>
        )}

        {currentBasis.calibration && (
          <Fold
            id="measured"
            folds={folds}
            defaultOpen
            title="Measured drawers"
            summary={`${currentBasis.calibration.count} measured · ×${currentBasis.calibration.measured.toFixed(2)} of the estimate in those`}
          >
            <MeasuredDrawers
              plan={plan}
              parts={parts}
              located={located}
              calibration={currentBasis.calibration}
              applied={JSON.stringify(project.basis.calibration ?? null) === JSON.stringify(currentBasis.calibration)}
              measurements={project.measurements}
              onRemove={(id) => update((p) => ({ measurements: p.measurements.filter((m) => m.id !== id) }))}
            />
          </Fold>
        )}

        <LayoutExplained plan={plan} located={located} keptSummary={keptSummary} folds={folds} />

        <ColourKey located={located} highlight={highlight} setHighlight={setHighlight} folds={folds} />

        <Fold id="recs" folds={folds} className="recs" title="Recommendations" summary={recs[0]?.title}>
          {recs.map((r, i) => (
            <div key={i} className={`rec ${r.level}`}>
              <b>{r.title}</b>
              <p>{r.detail}</p>
            </div>
          ))}
        </Fold>

        {plan.overflow.length > 0 && (
          <Fold id="overflow" folds={folds} className="overflow" title="Doesn't fit yet" summary={`${plan.overflow.length} groups, ${L(plan.stats.overflowVolume)}`}>
            <ul className="overflow-list">
              {plan.overflow.slice(0, 200).map((o, i) => (
                <li key={i}>
                  <span className="sec-imgs">
                    {topParts(o, o.node.part ? 1 : 2).map((p) => (
                      <PartImage key={p.partNum} partNum={p.partNum} size={32} title={p.name} />
                    ))}
                  </span>
                  <span className="overflow-name">
                    <span className={`swatch fam-${o.node.familyKey}`} /> {sectionLabel(o)}
                    <small className="muted"> {o.pieces.toLocaleString()} pcs, {L(o.volume)}</small>
                  </span>
                  <button className="link small" onClick={() => requestMove(o, null)}>
                    Place…
                  </button>
                  <button className="link small" onClick={() => keepOutParts(sectionParts(o), true)}>
                    Keep out
                  </button>
                </li>
              ))}
            </ul>
            {plan.overflow.length > 200 && <p className="muted small">Showing the first 200.</p>}
          </Fold>
        )}

        <CuttingList located={located} fill={target} folds={folds} />

        <div className="storage-head">
          <h2>Your storage</h2>
          <span className="row">
            {roomyCount > 0 && (
              <button className={`key-item ${onlyRoomy ? 'on' : ''}`} title={`Compartments with at least ${pct(ROOMY_FREE)} free`} onClick={() => setOnlyRoomy(!onlyRoomy)}>
                <span className="swatch roomy-swatch" /> {pct(ROOMY_FREE)}+ free · {roomyCount}
              </button>
            )}
            <button className="link" onClick={() => folds.setAll(foldIds, true)}>
              Open all
            </button>
            <button className="link" onClick={() => folds.setAll(foldIds, false)}>
              Close all
            </button>
          </span>
        </div>
        {[...groupsByKind].map(([kind, units]) => {
          const all = units.flatMap(([, comps]) => comps);
          const letters = units.map(([, comps]) => comps[0].code.replace(/\d+$/, ''));
          return (
            <Fold
              key={kind}
              id={`kind:${kind}`}
              folds={folds}
              force={all.some(shows)}
              className="unit-plan"
              title={
                <>
                  <span className="code">{letters.length > 1 ? `${letters[0]}–${letters[letters.length - 1]}` : letters[0]}</span> {kind}
                  {units.length > 1 && <span className="muted"> × {units.length}</span>}
                </>
              }
              summary={`${all.filter((c) => c.status === 'used').length} of ${all.length} in use · ${all.filter(roomy).length} with ${pct(ROOMY_FREE)}+ free · ${contentsRange(all)}`}
            >
              {units.length === 1
                ? unitTiles(units[0][1])
                : units.map(([unitId, comps]) => (
                    <Fold
                      key={unitId}
                      id={`unit:${unitId}`}
                      folds={folds}
                      inner
                      force={comps.some(shows)}
                      title={
                        <>
                          <span className="code">{comps[0].code.replace(/\d+$/, '')}</span> {comps[0].comp.unitName.match(/#\d+$/)?.[0] ?? '#1'}
                        </>
                      }
                      summary={contentsRange(comps)}
                    >
                      {unitTiles(comps)}
                    </Fold>
                  ))}
            </Fold>
          );
        })}
      </div>

      {sel && (
        <Detail
          key={sel.code}
          c={sel}
          close={() => setSelected(null)}
          target={target}
          onMove={requestMove}
          onKeepOut={(ps) => keepOutParts(ps, true)}
          onMeasure={(fill) => {
            const m = measureCompartment(sel, fill, uid());
            if (m) update((p) => ({ measurements: withMeasurement(p.measurements, m) }));
          }}
          onClearMeasure={() => update((p) => ({ measurements: p.measurements.filter((m) => !(m.compKey === sel.comp.key && isCurrent(m, plan))) }))}
        />
      )}
      {moving && (
        <MovePicker
          request={moving}
          located={located}
          onClose={() => setMoving(null)}
          onChoose={(to) => {
            update((p) => ({ moves: withMove(p.moves, { part: moving.part, whole: moving.whole, to }) }));
            setMoving(null);
          }}
        />
      )}
    </div>
  );
}

function Tile({ c, target, active, hit, dim, roomy, onClick }: { c: Located; target: number; active: boolean; hit: boolean; dim: boolean; roomy: boolean; onClick: () => void }) {
  const fam = c.sections[0]?.node.familyKey ?? c.spareFor ?? '';
  const pieces = c.sections.reduce((t, x) => t + x.pieces, 0);
  return (
    <button className={`tile ${c.status} ${active ? 'active' : ''} ${hit ? 'hit' : ''} ${dim ? 'dim' : ''} ${roomy ? 'roomy' : ''} fam-border-${fam}`} onClick={onClick} title={`${c.comp.label} — ${c.comp.w}×${c.comp.d}×${c.comp.h} mm`}>
      <div className="tile-head">
        <span className="code">{c.code}</span>
        {c.sections.length > 1 && <span className="divs" title={`${c.sections.length} sections — add dividers`}>⊞{c.sections.length}</span>}
      </div>
      <div className="tile-body">
        {c.status === 'used' ? (
          c.sections.map((sec, i) => (
            <div key={i} className="sec">
              <span className="sec-imgs">
                {topParts(sec, sec.node.part ? 1 : 2).map((p) => (
                  <PartImage key={p.partNum} partNum={p.partNum} size={26} title={p.name} />
                ))}
              </span>
              <span className="sec-label">
                {c.sections.length > 1 && <b>{i + 1}</b>} {sectionLabel(sec)}
              </span>
            </div>
          ))
        ) : c.status === 'spare' ? (
          <span className="muted">Spare — for {familyLabel(c.spareFor!)}</span>
        ) : (
          <span className="muted">Empty</span>
        )}
      </div>
      {c.status === 'used' && (
        <div className="tile-foot">
          <div className="bar" title={`${pct(c.fill)} full now · plan fills to ${pct(target)}`}>
            <div className={`bar-fill ${c.fill > 1 ? 'over' : ''}`} style={{ width: pct(Math.min(1, c.fill)) }} />
            <div className="bar-target" style={{ left: pct(target) }} />
          </div>
          <span className="muted small">
            {pieces.toLocaleString()} pcs · {pct(c.fill)}
            {c.measured && <b className="measured-badge"> measured</b>}
            {roomy && <b className="free-badge"> {pct(1 - c.fill)} free</b>}
          </span>
        </div>
      )}
    </button>
  );
}

/** "How full is it really?" for a compartment that's been filled for real */
function ActualFill({ c, onSave, onClear }: { c: Located; onSave: (fill: number) => void; onClear: () => void }) {
  const [value, setValue] = useState(c.measured ? String(Math.round(c.fill * 100)) : '');
  const percent = Number(value);
  const valid = percent > 0 && percent <= 100;
  return (
    <div className="actual-fill">
      <label>
        <b>Actually</b> <input type="number" min={1} max={100} placeholder="%" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && onSave(percent / 100)} /> % full
      </label>
      <button className="ghost small-btn" disabled={!valid} onClick={() => onSave(percent / 100)}>
        Save
      </button>
      {c.measured ? (
        <span className="muted small">
          The plan estimated {pct(c.measured.estimated)}.{' '}
          <button className="link small" onClick={onClear}>
            Clear
          </button>
        </span>
      ) : (
        <span className="muted small">Filled this one? A rough figure improves the rest of the plan.</span>
      )}
    </div>
  );
}

function Detail({
  c,
  close,
  target,
  onMove,
  onKeepOut,
  onMeasure,
  onClearMeasure,
}: {
  c: Located;
  close: () => void;
  target: number;
  onMove: (s: Section, from: string, single?: Part) => void;
  onKeepOut: (parts: Part[]) => void;
  onMeasure: (fill: number) => void;
  onClearMeasure: () => void;
}) {
  const layout = dividerLayout(c, target);
  return (
    <aside className="detail card">
      <div className="detail-head">
        <h3>
          <span className="code">{c.code}</span> {c.comp.unitName} › {c.comp.label}
        </h3>
        <button className="icon" onClick={close}>
          ✕
        </button>
      </div>
      <p className="muted small">
        {c.comp.w}×{c.comp.d}×{c.comp.h} mm · {L(c.comp.volume)} · {pct(c.fill)} full{c.measured ? ' (measured)' : ''} (plan target {pct(target)})
      </p>
      {c.status === 'used' && <ActualFill c={c} onSave={onMeasure} onClear={onClearMeasure} />}
      {layout && <DividerPlan c={c} layout={layout} />}
      {c.status !== 'used' && <p className="muted">{c.status === 'spare' ? `Kept free so ${familyLabel(c.spareFor!)} can expand without reshuffling.` : 'Free.'}</p>}
      {c.sections.map((sec, i) => (
        <div key={i} className="detail-sec">
          <h4>
            <span className={`swatch fam-${sec.node.familyKey}`} /> {c.sections.length > 1 && `${i + 1}. `}
            {sectionLabel(sec)}
            <span className="muted small"> · {sec.pieces.toLocaleString()} pcs · {L(sec.volume)}</span>{' '}
            <button className="link small" onClick={() => onMove(sec, c.code)}>
              Move all
            </button>{' '}
            <button className="link small" onClick={() => onKeepOut(sectionParts(sec))}>
              Keep all out
            </button>
          </h4>
          <table className="parts">
            <tbody>
              {sectionParts(sec)
                .sort((a, b) => b.qty - a.qty)
                .map((p) => (
                  <tr key={p.partNum}>
                    <td className="img-cell">
                      <PartImage partNum={p.partNum} size={40} title={p.name} />
                    </td>
                    <td>
                      <a href={`https://rebrickable.com/parts/${encodeURIComponent(p.partNum)}/`} target="_blank" rel="noreferrer">
                        {p.partNum}
                      </a>
                    </td>
                    <td>{p.name}</td>
                    <td className="num">{p.qty}</td>
                    <td className="nowrap">
                      <button className="link small" onClick={() => onMove(sec, c.code, p)}>
                        Move
                      </button>
                      <button className="link small" title="Keep this part out of the plan: it's stored elsewhere" onClick={() => onKeepOut([p])}>
                        Keep out
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </aside>
  );
}

/** Set the volume scale from "everything fits in my storage today, about N% full" — refusing scales that would be physically impossible */
function Calibrate({ plan, parts, onScale }: { plan: Plan; parts: Part[]; onScale: (v: number) => void }) {
  const [fill, setFill] = useState(85);
  const [note, setNote] = useState<{ text: string; scale?: number } | null>(null);
  const s = plan.settings;

  const run = () => {
    const base = plan.stats.volume / s.volumeScale;
    const scale = Math.round(((fill / 100) * plan.stats.physicalCapacity * 100) / base) / 100;
    // The smallest scale that's physically possible, from the same floor the reality check uses
    const min = looseMinimum(parts);
    const floor = min.volume / (min.plainEstimate + min.others || 1);
    if (scale < floor) {
      setNote({
        text: `That would need a scale of ×${scale.toFixed(2)}, but loose parts can't pack below about ×${floor.toFixed(2)} — your plain bricks, plates and tiles alone take ${(min.solid / 1000).toFixed(0)} L built solid. Check the part list (built sets, duplicate set lists) and that all your storage is listed first.`,
        scale,
      });
      return;
    }
    onScale(scale);
    setNote({ text: `Volume scale set to ×${scale.toFixed(2)}.` });
  };

  return (
    <div className="calibrate">
      <span className="slider-head">Calibrate from today</span>
      <small className="muted">If everything in the Collection tab fits in this storage now, how full is it?</small>
      <div className="row">
        <input type="number" min={10} max={100} value={fill} onChange={(e) => setFill(Number(e.target.value) || 0)} /> % full
        <button className="ghost small-btn" onClick={run}>
          Calibrate
        </button>
      </div>
      {note && (
        <p className={`small ${note.scale ? 'warn-text' : 'muted'}`}>
          {note.text}{' '}
          {note.scale && (
            <button className="link" onClick={() => (onScale(Math.max(0.25, note.scale!)), setNote({ text: `Volume scale set to ×${Math.max(0.25, note.scale!).toFixed(2)} anyway.` }))}>
              Apply anyway
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onChange, plan, parts, calibration }: { settings: Settings; onChange: (s: Settings) => void; plan: Plan; parts: Part[]; calibration: Calibration | null }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const gran: { k: Granularity; label: string; hint: string }[] = [
    { k: 'relaxed', label: 'Relaxed', hint: 'Broad groups, fewer containers' },
    { k: 'balanced', label: 'Balanced', hint: 'Separate common parts, lump the rest' },
    { k: 'fine', label: 'Fine', hint: 'Most part types get their own space' },
  ];
  return (
    <>
      <fieldset>
        <legend>How finely to sort</legend>
        {gran.map((g) => (
          <label key={g.k} className="radio">
            <input type="radio" checked={settings.granularity === g.k} onChange={() => set('granularity', g.k)} />
            <span>
              <b>{g.label}</b>
              <small>{g.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <Slider label="Expected growth" value={settings.growth} min={0} max={1} step={0.05} fmt={(v) => `+${pct(v)}`} hint="Room left in every compartment so new parts slot in without a rebuild" onChange={(v) => set('growth', v)} />
      <Slider label="Practical max fill" value={settings.practicalFill} min={0.5} max={0.95} step={0.05} fmt={pct} hint="Fuller than this and rummaging gets hard" onChange={(v) => set('practicalFill', v)} />
      <Slider label="Spare compartments" value={settings.spareFraction} min={0} max={0.3} step={0.05} fmt={pct} hint="Left empty next to the largest families, for new categories" onChange={(v) => set('spareFraction', v)} />
      <Slider label="Max sections per compartment" value={settings.maxSections} min={1} max={8} step={1} fmt={String} hint="How many dividers you're willing to fit" onChange={(v) => set('maxSections', v)} />
      {calibration ? (
        <p className="muted small">
          <b>Volume scale:</b> set by your {calibration.count} measured {calibration.count === 1 ? 'drawer' : 'drawers'}, ×{calibration.overall.toFixed(2)} for parts not yet measured.
        </p>
      ) : (
        <>
          <Slider label="Volume scale" value={settings.volumeScale} min={0.25} max={2} step={0.05} fmt={(v) => `×${v.toFixed(2)}`} hint="Calibrate: if a box predicted 50% is really 70% full, set ×1.4" onChange={(v) => set('volumeScale', v)} />
          <Calibrate plan={plan} parts={parts} onScale={(v) => set('volumeScale', v)} />
        </>
      )}
      <p className="muted small">
        Each compartment is planned to {pct(targetFill(settings))} full ({pct(settings.practicalFill)} ÷ {(1 + settings.growth).toFixed(2)}).
      </p>
      <button className="link" onClick={() => onChange(DEFAULT_SETTINGS)}>
        Reset to defaults
      </button>
    </>
  );
}

function Slider({ label, value, min, max, step, fmt, hint, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; hint: string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-head">
        {label} <b>{fmt(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <small className="muted">{hint}</small>
    </label>
  );
}

function ColourKey({ located, highlight, setHighlight, folds }: { located: Located[]; highlight: string | null; setHighlight: (k: string | null) => void; folds: Folds }) {
  const counts = new Map<string, number>();
  for (const c of located) for (const k of new Set(c.sections.map((x) => x.node.familyKey))) counts.set(k, (counts.get(k) ?? 0) + 1);
  const present = FAMILIES.filter((f) => counts.has(f.key));
  return (
    <Fold id="key" folds={folds} className="key" title="Colour key" summary={highlight ? `Showing ${familyLabel(highlight)}` : `${present.length} families`} force={!!highlight}>
      <p className="muted small">Each colour is a family of part types (not a brick colour). Click one to highlight where it lives.</p>
      <div className="key-items">
        {present.map((f) => (
          <button key={f.key} className={`key-item ${highlight === f.key ? 'on' : ''} ${highlight && highlight !== f.key ? 'off' : ''}`} onClick={() => setHighlight(highlight === f.key ? null : f.key)}>
            <span className={`swatch fam-${f.key}`} /> {f.label} <span className="muted">· {counts.get(f.key)}</span>
          </button>
        ))}
        <span className="key-item static">
          <span className="swatch spare-swatch" /> Spare (kept free)
        </span>
      </div>
    </Fold>
  );
}

/** "at 90 mm from the front" or, for a short divider, where along the row it sits */
function whereDivider(v: Divider): string {
  if (v.y1 === v.y2) return v.short ? `${v.y1} mm from the front, from ${v.x1} to ${v.x2} mm across` : `${v.y1} mm from the front`;
  return v.short ? `${v.x1} mm from the left, from ${v.y1} to ${v.y2} mm back` : `${v.x1} mm from the left`;
}

function DividerPlan({ c, layout }: { c: Located; layout: DividerLayout }) {
  const { w, d } = c.comp;
  // Top-down drawing with the front at the bottom, scaled to fit the panel
  const scale = Math.min(360 / w, 220 / d);
  const sw = w * scale;
  const sd = d * scale;
  const rect = (r: Rect) => ({ x: r.x * scale, y: sd - (r.y + r.d) * scale, width: r.w * scale, height: r.d * scale });
  const long = layout.dividers.filter((v) => !v.short);
  const short = layout.dividers.filter((v) => v.short);
  const count = (vs: Divider[], name: string) => {
    const sizes = new Map<number, number>();
    for (const v of vs) sizes.set(v.length, (sizes.get(v.length) ?? 0) + 1);
    return [...sizes].map(([len, n]) => `${n} ${name} ${len} × ${layout.height} mm`);
  };
  return (
    <div className="divider-plan">
      {layout.optional && <p className="muted small">Optional: this one group doesn't need a divider, but a pocket keeps it deep enough to pick from and leaves the rest of the drawer clear.</p>}
      <p>
        <b>{[...count(long, 'long'), ...count(short, 'short')].join(', ')}</b>
      </p>
      <svg viewBox={`-2 -2 ${sw + 4} ${sd + 18}`} width="100%" style={{ maxWidth: sw + 4 }} role="img" aria-label="Divider layout, top view">
        <rect x={0} y={0} width={sw} height={sd} className="dp-box" />
        {layout.free && <rect {...rect(layout.free)} className="dp-free" />}
        {layout.free && (
          <text x={rect(layout.free).x + rect(layout.free).width / 2} y={rect(layout.free).y + rect(layout.free).height / 2} className="dp-free-label">
            free
          </text>
        )}
        {layout.pockets.map((p, i) => {
          const r = rect(p);
          return (
            <g key={i} className={`fam-${p.section.node.familyKey}`}>
              <rect {...r} className="dp-sec" />
              <text x={r.x + r.width / 2} y={r.y + r.height / 2} className="dp-num">
                {i + 1}
              </text>
            </g>
          );
        })}
        {layout.dividers.map((v, i) => (
          <line key={i} x1={v.x1 * scale} x2={v.x2 * scale} y1={sd - v.y1 * scale} y2={sd - v.y2 * scale} className={v.short ? 'dp-cut short' : 'dp-cut'} />
        ))}
        <text x={sw / 2} y={sd + 13} className="dp-front">
          front
        </text>
      </svg>
      <ol className="dp-list">
        {layout.pockets.map((p, i) => (
          <li key={i}>
            {sectionLabel(p.section)} — {p.w} × {p.d} mm
          </li>
        ))}
      </ol>
      <p className="muted small dp-where">
        Place: {[...long, ...short].map(whereDivider).join('; ')}.
        {layout.free && ` That leaves ${layout.free.w} × ${layout.free.d} mm free for new parts.`}
        {short.length > 0 && ' Short dividers sit between the long ones: notch them together, or use foam board and a dab of glue.'}
      </p>
    </div>
  );
}

function CuttingList({ located, fill, folds }: { located: Located[]; fill: number; folds: Folds }) {
  const lines = cuttingList(located, fill);
  if (!lines.length) return null;
  const total = lines.reduce((t, l) => t + l.count, 0);
  const required = located.map((c) => ({ c, layout: dividerLayout(c, fill) })).filter((x) => x.layout && !x.layout.optional);
  return (
    <Fold id="cuts" folds={folds} title="Divider cutting list" summary={`${total} dividers in ${lines.length} sizes`}>
      <p className="muted small">
        {total} dividers across {required.length} compartments. Sizes are length × height in mm — trim a couple of mm off the height if the drawer above catches. Foam board, corrugated plastic or
        acrylic all work. Open a compartment to see where each divider goes.
      </p>
      <table className="cut-list">
        <thead>
          <tr>
            <th className="num">Qty</th>
            <th>Size (mm)</th>
            <th>Compartments (dividers each)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.length}x${l.height}`}>
              <td className="num">
                <b>{l.count}</b>
              </td>
              <td className="nowrap">
                {l.length} × {l.height}
              </td>
              <td className="muted small">
                {required
                  .filter((x) => x.layout!.height === l.height && x.layout!.dividers.some((v) => v.length === l.length))
                  .map((x) => `${x.c.code} (${x.layout!.dividers.filter((v) => v.length === l.length).length})`)
                  .join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Fold>
  );
}

/** "Bricks → Modified & Round Bricks → Slopes & Curves", in the order families appear in a unit */
function contentsRange(comps: Located[]): string {
  const fams = new Set(comps.flatMap((c) => c.sections.map((s) => s.node.familyKey)));
  const ordered = FAMILIES.filter((f) => fams.has(f.key));
  return ordered.length ? ordered.map((f) => f.label).join(' → ') : 'Nothing planned here yet';
}

/** Why things are where they are: zones by compartment size, reading order, and any compromises */
function LayoutExplained({ plan, located, keptSummary, folds }: { plan: Plan; located: Located[]; keptSummary: KeptSummary; folds: Folds }) {
  const letter = new Map(located.map((c) => [c.comp.unitId, c.code.replace(/\d+$/, '')]));
  const zones = plan.zones.filter((z) => z.families.length);
  return (
    <Fold id="explain" folds={folds} className="explain" title="How it's laid out" summary={plan.notes.length ? 'Storage is tight' : undefined}>
      <ol className="explain-steps">
        <li>
          <b>Similar parts stay together.</b> Part types are grouped into families (bricks, plates, Technic…), and related families into five groups. Unrelated groups never share a
          compartment unless space forces it.
        </li>
        <li>
          <b>Each family goes where its parts fit best.</b> Small-part families go to the units with the smallest compartments, bulky ones to the largest:
        </li>
      </ol>
      <ul className="explain-zones">
        {zones.map((z) => (
          <li key={z.label}>
            <b>
              {z.label} ({z.unitIds.map((id) => letter.get(id)).filter(Boolean).join(', ')})
            </b>
            : {z.families.map(familyLabel).join(', ')}
          </li>
        ))}
      </ul>
      <ol className="explain-steps" start={3}>
        <li>
          <b>Then in reading order.</b> Within each unit, families run in a fixed order (bricks → plates → tiles → … → minifigs) and, inside a family, from small sizes to large — so the
          next drawer along is always the next kind of part. Spare compartments sit right after the biggest families.
        </li>
      </ol>
      {keptSummary.pieces > 0 && (
        <p className="muted small">
          Not in this plan: {keptSummary.labels.join(', ')} ({keptSummary.pieces.toLocaleString()} pieces, about {(keptSummary.volume / 1000).toFixed(1)} L). Change this on the Collection tab.
        </p>
      )}
      {plan.notes.map((n, i) => (
        <div key={i} className="banner warn">
          {n}
        </div>
      ))}
    </Fold>
  );
}

function MeasuredDrawers({
  plan,
  parts,
  located,
  calibration,
  applied,
  measurements,
  onRemove,
}: {
  plan: Plan;
  parts: Part[];
  located: Located[];
  calibration: Calibration;
  applied: boolean;
  measurements: Measurement[];
  onRemove: (id: string) => void;
}) {
  const forecast = calibratedVolume(parts, calibration);
  const scale = (m: Measurement) => `×${measuredFactor(m).toFixed(2)}`;
  return (
    <>
      <p className="muted small">
        {applied
          ? `The plan is using these. Your collection comes to about ${L(forecast)} of ${L(plan.stats.physicalCapacity)}.`
          : `Used across the whole plan, these would bring your collection to about ${L(forecast)} of ${L(plan.stats.physicalCapacity)}. Each measured drawer already shows its real fill; use Re-plan above when you want the rest of the plan to follow.`}
        {calibration.count > measurements.length && ` Includes ${calibration.count - measurements.length} pockets from My setup.`}
        {calibration.overall - calibration.measured > 0.1 && ` Parts you haven't measured only move part of the way (×${calibration.overall.toFixed(2)} for now), and follow more closely as you measure more drawers, across different kinds of part.`}
      </p>
      <ul className="change-list">
        {measurements.map((m) => {
          const here = isCurrent(m, plan) ? located.find((c) => c.comp.key === m.compKey) : null;
          return (
            <li key={m.id}>
              {here ? <span className="code">{here.code}</span> : <span className="muted small">was in {m.where}:</span>} {pct(m.fill)} full, {Object.keys(m.parts).length} part type{Object.keys(m.parts).length === 1 ? '' : 's'}, really {scale(m)} of the estimate{' '}
              <button className="link small" onClick={() => onRemove(m.id)}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function YourChanges({
  moves,
  stale,
  parts,
  located,
  picked,
  pending,
  onPutBack,
  onUndo,
  onUndoAll,
}: {
  moves: PartMove[];
  stale: number[];
  parts: Part[];
  located: Located[];
  picked: Part[];
  pending: boolean;
  onPutBack: (p: Part) => void;
  onUndo: (i: number) => void;
  onUndoAll: () => void;
}) {
  const name = (num: string) => parts.find((p) => p.partNum === num)?.name ?? num;
  const codeOfComp = (key: string) => located.find((c) => c.comp.key === key);
  const whereIs = (num: string) => located.find((c) => c.sections.some((s) => leaves(s.node).some((l) => l.part?.partNum === num)))?.code;
  return (
    <>
      <p className="muted small">
        {pending
          ? 'These sit on top of the plan, so everything else stays where it is and any space they free up stays free. Use Re-plan above when you want the plan rebuilt around them. If you undo something that was already re-planned, that also waits for the next re-plan.'
          : 'The plan has been built around these. Parts you moved stay with their new group, and drawers you placed something in are left for those parts.'}
      </p>
      <ul className="change-list">
        {moves.map((m, i) => {
          const dest = 'part' in m.to ? `with ${name(m.to.part)}` : `to ${codeOfComp(m.to.comp)?.code ?? 'a compartment that no longer exists'}`;
          const at = stale.includes(i) ? null : whereIs(m.part);
          return (
            <li key={i} className={stale.includes(i) ? 'stale' : ''}>
              {at && <span className="code">{at}</span>} {m.whole ? 'Section with ' : ''}
              {name(m.part)} {dest}
              {stale.includes(i) && <span className="warn-text small"> (no longer applies)</span>}{' '}
              <button className="link small" onClick={() => onUndo(i)}>
                Undo
              </button>
            </li>
          );
        })}
      </ul>
      {moves.length > 1 && (
        <button className="link small" onClick={onUndoAll}>
          Undo all moves
        </button>
      )}
      {picked.length > 0 && (
        <>
          <h4>Kept out of the plan</h4>
          <ul className="change-list">
            {picked.slice(0, 100).map((p) => (
              <li key={p.partNum}>
                {p.name} <small className="muted">{p.partNum}</small>{' '}
                <button className="link small" onClick={() => onPutBack(p)}>
                  Put back
                </button>
              </li>
            ))}
          </ul>
          {picked.length > 100 && <p className="muted small">Showing the first 100.</p>}
        </>
      )}
    </>
  );
}
