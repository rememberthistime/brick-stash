// What My storage makes of the drawers as recorded: moves worth making, how the estimates compare, and what to look at.
import { acceptSuggestion, undoLastAccepted, type EstimateRow, type Finding, type FindingKind, type SetupAnalysis } from '../../lib/setup';
import type { Setup } from '../../lib/types';
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

export function Suggestions({ setup, setSetup, analysis }: { setup: Setup; setSetup: (f: (s: Setup) => Setup) => void; analysis: SetupAnalysis }) {
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
        Reaches the Plan tab when you click Re-plan there. It’s best once most of the collection is recorded ({pct(analysis.volumePlaced)} so far), because a part with some still in an unrecorded drawer will look smaller than it really is.
      </p>
    </>
  );
}

export function Findings({ findings }: { findings: Finding[] }) {
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
