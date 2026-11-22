// Moves to make: what you've accepted, set out as the work to do in the real drawers. Parts are grouped by the drawer
// they come out of, so one trip does it; swaps of whole drawers are shown as where each drawer ends up.
import { useState } from 'react';
import { codeWithName, placeName } from '../../lib/codes';
import type { SetupAnalysis, SetupComp } from '../../lib/setup';
import { markDone, todoList, unmarkDone, type DoneStep } from '../../lib/todo';
import type { Setup } from '../../lib/types';
import { PartStrip, partsOf } from './Improvements';

interface Props {
  setup: Setup;
  setSetup: (f: (s: Setup) => Setup) => void;
  comps: SetupComp[];
  analysis: SetupAnalysis;
  goTo: (page: 'moves') => void;
}

export default function MovesToMake({ setup, setSetup, comps, analysis, goTo }: Props) {
  const [undo, setUndo] = useState<{ text: string; step: DoneStep } | null>(null);
  const byKey = new Map(comps.map((c) => [c.key, c]));
  const code = (key: string | null) => {
    const c = key ? byKey.get(key) : undefined;
    return c ? codeWithName(c.code, c) : 'another drawer';
  };
  const shortCode = (key: string) => byKey.get(key)?.code ?? '?';
  const byNum = partsOf(analysis);
  const list = todoList(setup.accepted);
  const done = (indices: number[], text: string) => {
    // What undoing needs is worked out from the list as shown, the same moves the change takes off
    setUndo({ text, step: markDone(setup, indices).step });
    setSetup((s) => markDone(s, indices).setup);
  };

  if (!setup.accepted.length)
    return (
      <section className="card">
        <p className="muted">
          Nothing to do in the drawers. When you accept a suggestion or a swap on{' '}
          <button className="link" onClick={() => goTo('moves')}>
            Suggestions
          </button>
          , it’s recorded here straight away and listed on this page until you’ve done it for real.
        </p>
        {undo && <UndoLine text={undo.text} onUndo={() => (setSetup((s) => unmarkDone(s, undo.step)), setUndo(null))} />}
      </section>
    );

  const all = setup.accepted.map((_, i) => i);
  return (
    <>
      <div className="page-tools no-print">
        <button className="ghost" onClick={() => done(all, `Marked all ${all.length} done`)}>
          Mark everything done
        </button>
        {undo && <UndoLine text={undo.text} onUndo={() => (setSetup((s) => unmarkDone(s, undo.step)), setUndo(null))} />}
      </div>

      {list.rings.length > 0 && (
        <section className="card">
          <h3 className="card-title">Drawers to move</h3>
          <p className="muted small">Each drawer takes the code of the slot it goes to, so its label needs reprinting.</p>
          {list.rings.map((r) => (
            <div key={r.indices.join(',')} className="todo-group">
              <div className="todo-group-head">
                <b>{r.shifts.length ? `${r.shifts.length} drawers change places` : 'These swaps cancel each other out'}</b>
                <button className="small-btn" onClick={() => done(r.indices, r.shifts.length ? `Moved ${r.shifts.length} drawers` : 'Cleared swaps that cancel out')}>
                  Done
                </button>
              </div>
              {r.shifts.length > 0 && (
                <ul className="todo-shifts">
                  {r.shifts.map((s) => {
                    const c = byKey.get(s.to);
                    return (
                      <li key={s.to}>
                        Take the drawer out of <span className="code">{shortCode(s.from)}</span> and put it in <span className="code">{shortCode(s.to)}</span>
                        {c && placeName(c) ? <span className="muted"> · {placeName(c)}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {list.trips.length > 0 && (
        <section className="card">
          <h3 className="card-title">Parts to move</h3>
          <p className="muted small">Grouped by the drawer they come out of. Done ticks the parts as there in their new drawer.</p>
          {list.trips.map((t) => (
            <div key={t.from ?? 'other'} className="todo-group">
              <div className="todo-group-head">
                <b>Out of {code(t.from)}</b>
                <span className="muted small">
                  {t.indices.length} {t.indices.length === 1 ? 'move' : 'moves'}
                </span>
                {t.indices.length > 1 && (
                  <button className="small-btn" onClick={() => done(t.indices, `Done everything out of ${t.from ? shortCode(t.from) : 'other drawers'}`)}>
                    All done
                  </button>
                )}
              </div>
              <ul className="change-list">
                {t.indices.map((i) => {
                  const m = setup.accepted[i];
                  return (
                    <li key={`${m.id}-${i}`}>
                      <span className="todo-move">
                        {m.text}{' '}
                        <button className="link small" onClick={() => done([i], `Done: ${m.text}`)}>
                          Done
                        </button>
                      </span>
                      {m.parts && <PartStrip nums={m.parts} byNum={byNum} max={4} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function UndoLine({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <span className="small todo-undo" role="status">
      {text}.{' '}
      <button className="link small" onClick={onUndo}>
        Undo
      </button>
    </span>
  );
}
