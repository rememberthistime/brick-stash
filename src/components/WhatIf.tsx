// Now, next to what it would be with a change: the same project planned twice, the differences picked out. Used
// wherever a change can be tried before it's kept: a new sorting, a part put in a group by hand, or anything at all
// in Try a change.
import { useMemo, useState } from 'react';
import { plainName } from '../lib/builderNames';
import { compare, summarise, type PlanSummary } from '../lib/whatIf';
import type { Catalog, Project } from '../lib/types';
import { L } from './storage/format';

const SHOWN = 12;

const where = (x: string | null) => (x === null ? 'not in the collection' : x === '' ? 'no room' : x);

export default function WhatIf({ now, after, catalog, title = 'What would change' }: { now: Project; after: Project; catalog: Catalog | null; title?: string }) {
  const before = useMemo(() => summarise(now, catalog), [now, catalog]);
  const then = useMemo(() => summarise(after, catalog), [after, catalog]);
  const c = useMemo(() => compare(before, then), [before, then]);
  const [allMoves, setAllMoves] = useState(false);
  const [allDrawers, setAllDrawers] = useState(false);

  const rows: { label: string; get: (s: PlanSummary) => number; fmt?: (n: number) => string; better: 'more' | 'less' | null }[] = [
    { label: 'Part types to store', get: (s) => s.partTypes, better: null },
    { label: 'Groups (top level / all)', get: (s) => s.topGroups, better: null },
    { label: 'Part types not in a drawer yet', get: (s) => s.unsorted, better: null },
    { label: '… with room beside their own group', get: (s) => s.besideOwn, better: 'more' },
    { label: 'Empty drawers the plan would use', get: (s) => s.drawersUsed, better: null },
    { label: 'Empty drawers left free', get: (s) => s.drawersFree, better: 'more' },
    { label: 'Part types with no room', get: (s) => s.noRoom, better: 'less' },
    { label: 'Volume with no room', get: (s) => s.overflow, fmt: (n) => (n ? L(n) : '0'), better: 'less' },
  ];
  const same = !c.moved.length && !c.drawers.length && rows.every((r) => r.get(before) === r.get(then));
  const moves = allMoves ? c.moved : c.moved.slice(0, SHOWN);
  const drawers = allDrawers ? c.drawers : c.drawers.slice(0, SHOWN);

  return (
    <div className="what-if">
      <h4>{title}</h4>
      {same ? (
        <p className="muted small">Nothing in the plan would change.</p>
      ) : (
        <>
          <table className="what-if-table">
            <thead>
              <tr>
                <th />
                <th>Now</th>
                <th>With the change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = r.get(before);
                const b = r.get(then);
                const fmt = r.fmt ?? ((n: number) => n.toLocaleString());
                const tone = a === b || !r.better ? '' : (r.better === 'more') === b > a ? 'better' : 'worse';
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{r.label.startsWith('Groups') ? `${a} / ${before.allGroups}` : fmt(a)}</td>
                    <td className={tone}>{r.label.startsWith('Groups') ? `${b} / ${then.allGroups}` : fmt(b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {c.drawers.length > 0 && (
            <>
              <h5>Empty drawers whose suggestion would change ({c.drawers.length})</h5>
              <ul className="what-if-list">
                {drawers.map((d) => (
                  <li key={d.code}>
                    <b>{d.code}</b>: {d.now.length ? d.now.join(', ') : 'nothing'} <span className="muted">→</span> {d.after.length ? d.after.join(', ') : 'nothing'}
                  </li>
                ))}
              </ul>
              {c.drawers.length > SHOWN && (
                <button className="link small" onClick={() => setAllDrawers(!allDrawers)}>
                  {allDrawers ? 'Fewer' : `All ${c.drawers.length}`}
                </button>
              )}
            </>
          )}
          {c.moved.length > 0 && (
            <>
              <h5>Parts that would be suggested somewhere else ({c.moved.length})</h5>
              <ul className="what-if-list">
                {moves.map((m) => (
                  <li key={m.partNum}>
                    {plainName(m.name, m.partNum)}: {where(m.from)} <span className="muted">→</span> {where(m.to)}
                  </li>
                ))}
              </ul>
              {c.moved.length > SHOWN && (
                <button className="link small" onClick={() => setAllMoves(!allMoves)}>
                  {allMoves ? 'Fewer' : `All ${c.moved.length}`}
                </button>
              )}
            </>
          )}
        </>
      )}
      <p className="muted small">Drawers you’ve recorded stay as they are either way: this only changes what’s suggested for the rest.</p>
    </div>
  );
}
