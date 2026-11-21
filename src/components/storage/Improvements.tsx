// What the app makes of the drawers as recorded: moves worth making, how the estimates compare, and what to look at.
import { nameTitle } from '../../lib/builderNames';
import PartName from '../PartName';
import type { DrawerUse } from '../../lib/jobSuggest';
import { jobLabel } from '../../lib/unitJobs';
import { acceptSuggestion, type EstimateRow, type Finding, type FindingKind, type SetupAnalysis } from '../../lib/setup';
import type { Part, Setup } from '../../lib/types';
import type { LayoutFinding, LayoutKind } from '../../lib/layoutCheck';
import PartImage from '../PartImage';
import { useState } from 'react';
import { L, pct } from './format';

export const times = (r: EstimateRow) => `×${(r.estimate ? r.real / r.estimate : 0).toFixed(2)}`;

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

/** Every part recorded in a drawer, by number, so a move or finding can show the parts it's about */
const partsOf = (analysis: SetupAnalysis) => new Map(analysis.pockets.flatMap((p) => p.parts.map((x) => [x.part.partNum, x.part] as const)));

/** The parts something is about: a picture, the name linking to Rebrickable, the part number and how many you have */
export function PartStrip({ nums, byNum, max = 8 }: { nums: string[]; byNum: Map<string, Part>; max?: number }) {
  const parts = [...new Set(nums)].map((n) => byNum.get(n) ?? ({ partNum: n, name: n, qty: 0 } as Part));
  if (!parts.length) return null;
  return (
    <ul className="part-strip">
      {parts.slice(0, max).map((p) => (
        <li key={p.partNum}>
          <PartImage partNum={p.partNum} size={48} title={nameTitle(p)} />
          <span>
            <a href={`https://rebrickable.com/parts/${encodeURIComponent(p.partNum)}/`} target="_blank" rel="noreferrer" title={`${p.partNum} on Rebrickable`}>
              <PartName part={p} />
            </a>
            <span className="muted small">
              {' '}
              {p.partNum}
              {p.qty ? ` · × ${p.qty.toLocaleString()}` : ''}
            </span>
          </span>
        </li>
      ))}
      {parts.length > max && <li className="muted small">and {parts.length - max} more</li>}
    </ul>
  );
}

export function Suggestions({ setup, setSetup, analysis, onUndo, onUse }: { setup: Setup; setSetup: (f: (s: Setup) => Setup) => void; analysis: SetupAnalysis; onUndo: () => void; onUse?: (uses: DrawerUse[]) => void }) {
  const byNum = partsOf(analysis);
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
                  <button className="link small" onClick={onUndo}>
                    Undo
                  </button>
                )}
                {a.parts && <PartStrip nums={a.parts} byNum={byNum} max={4} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {onUse && analysis.drawerUses.length > 0 && (
        <div className="drawer-uses">
          <h4>Drawers to give a new use</h4>
          <p className="muted small">These are mostly one sort of part that isn’t what they’re for. Rather than moving it all out, the drawer can be for what’s in it. Similar drawers can then be brought together on Tidy the layout.</p>
          <ul className="change-list">
            {analysis.drawerUses.map((d) => (
              <li key={d.key}>
                <b>
                  <span className="code">{d.code}</span> for {jobLabel(d.job)}
                </b>{' '}
                <span className="muted small">{d.why}.</span>{' '}
                <button className="small-btn" onClick={() => onUse([d])}>
                  Use
                </button>
              </li>
            ))}
          </ul>
          {analysis.drawerUses.length > 1 && (
            <button className="link small" onClick={() => onUse(analysis.drawerUses)}>
              Use all {analysis.drawerUses.length}
            </button>
          )}
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
              <PartStrip nums={s.moves.map((m) => m.part)} byNum={byNum} />
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
        {analysis.suggestions.length > 1 && (
          <>
            <button className="link small" onClick={() => setSetup((x) => analysis.suggestions.reduce((acc, s) => acceptSuggestion(acc, s, analysis.pockets), x))}>
              Accept all {analysis.suggestions.length}
            </button>{' '}
          </>
        )}
        {analysis.suggestions.length > 0 && 'Accepting updates your record here and adds it to Moves to make. '}
        {analysis.moreSuggestions > 0 && `${analysis.moreSuggestions} more possible, shown as you work through these. `}
        {setup.skipped.some((id) => !id.startsWith('home:')) && (
          <button className="link small" onClick={() => setSetup((s) => ({ ...s, skipped: s.skipped.filter((id) => id.startsWith('home:')) }))}>
            Bring back {setup.skipped.filter((id) => !id.startsWith('home:')).length} skipped
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

export function EstimateCheck({ setup, setSetup, analysis }: { setup: Setup; setSetup: (f: (s: Setup) => Setup) => void; analysis: SetupAnalysis }) {
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
        Corrects every part’s size, so the suggestions for empty drawers follow. It’s best once most of the collection is recorded ({pct(analysis.volumePlaced)} so far), because a part with some still in an unrecorded drawer will look smaller than it really is.
      </p>
    </>
  );
}

export function Findings({ findings, analysis }: { findings: Finding[]; analysis: SetupAnalysis }) {
  const [all, setAll] = useState<FindingKind | null>(null);
  const byNum = partsOf(analysis);
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
                <li key={f.text}>
                  {f.text}
                  {f.parts && <PartStrip nums={f.parts} byNum={byNum} max={3} />}
                </li>
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

const LAYOUT: { kind: LayoutKind; title: string; hint: string }[] = [
  { kind: 'againstJob', title: 'Parts in another unit’s job', hint: 'Parts that don’t fit the job you gave their unit on Units.' },
  { kind: 'spread', title: 'Families in many units', hint: 'The more units a family is in, the more places there are to look.' },
  { kind: 'catchAll', title: 'Catch-all drawers', hint: 'Drawers holding parts from three or more groups, or a dozen pockets or more. Tick “Mixed on purpose” on a pocket to leave it out.' },
  { kind: 'unnamed', title: 'Drawers without a name', hint: 'A name says what belongs there, including what isn’t in yet. Without one, the label lists what’s inside.' },
];

/** Could someone else find things? What the layout check found, most important first */
export function LayoutCheck({ findings, analysis }: { findings: LayoutFinding[]; analysis: SetupAnalysis }) {
  const [all, setAll] = useState<LayoutKind | null>(null);
  const byNum = partsOf(analysis);
  if (!findings.length) return <p className="muted small">{analysis.drawersRecorded ? 'Each unit does one job and every drawer says what it’s for. Someone else should find their way round.' : 'Record a few drawers and this checks whether someone else could find their way round them.'}</p>;
  return (
    <div className="setup-findings">
      {LAYOUT.map(({ kind, title, hint }) => {
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
                <li key={f.text}>
                  {f.text}
                  {f.parts && <PartStrip nums={f.parts} byNum={byNum} max={3} />}
                </li>
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
