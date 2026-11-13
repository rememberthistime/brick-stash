import { placeName } from '../lib/codes';
import { useState } from 'react';
import type { PartMove } from '../lib/types';
import { leaves, sectionLabel, type PlannedCompartment, type Section } from '../lib/planner';
import PartImage from './PartImage';

export interface MoveRequest {
  /** the part being moved or, for a whole section, its largest part */
  part: string;
  whole: boolean;
  label: string;
  familyKey: string;
  seq: number;
  from: string | null;
}

type Located = PlannedCompartment & { code: string };

const MAX_SUGGESTED = 6;
const MAX_LISTED = 30;

/** A section is pointed at by its largest part, which stays put if the plan changes */
const anchorOf = (s: Section) => [...leaves(s.node)].sort((a, b) => b.volume - a.volume)[0].part!;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function MovePicker({ request, located, onChoose, onClose }: { request: MoveRequest; located: Located[]; onChoose: (to: PartMove['to']) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  // Anywhere but where it already is. A part split across compartments only takes more in its last one.
  const canJoin = (s: Section) => !leaves(s.node).some((l) => l.part?.partNum === request.part) && (!s.span || s.span[0] === s.span[1]);
  const sections = located.flatMap((c) => c.sections.map((section) => ({ c, section }))).filter(({ section }) => canJoin(section));
  const distance = (s: Section) => (s.node.familyKey === request.familyKey ? 0 : 100000) + Math.abs(s.node.seq - request.seq);
  const suggested = [...sections].sort((a, b) => distance(a.section) - distance(b.section)).slice(0, MAX_SUGGESTED);

  const q = query.trim().toLowerCase();
  const matches = q
    ? located.filter((c) => c.code.toLowerCase() === q || c.comp.unitName.toLowerCase().includes(q) || placeName(c.comp).toLowerCase().includes(q) || c.sections.some((s) => sectionLabel(s).toLowerCase().includes(q) || leaves(s.node).some((l) => l.part?.partNum === q)))
    : located;

  const joinButton = (c: Located, s: Section) => {
    const anchor = anchorOf(s);
    return (
      <button key={`${c.code}-${s.node.id}-${s.span?.[0] ?? 0}`} className="move-choice" onClick={() => onChoose({ part: anchor.partNum })}>
        <PartImage partNum={anchor.partNum} size={26} title={anchor.name} />
        <span className="code">{c.code}</span>
        <span className="move-name">
          {placeName(c.comp) && <span className="place-name">{placeName(c.comp)} · </span>}
          {sectionLabel(s)}
        </span>
        <span className={`muted small nowrap ${c.fill > 0.95 ? 'warn-text' : ''}`}>{pct(c.fill)} full</span>
      </button>
    );
  };

  return (
    <div className="move-backdrop" onClick={onClose}>
      <div className="move-picker card" role="dialog" aria-label="Move parts" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h3>Move {request.label}</h3>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <h4>Put it with a similar group</h4>
        <div className="move-list">{suggested.map(({ c, section }) => joinButton(c, section))}</div>
        <h4>Or choose any compartment</h4>
        <input className="search keep-search" autoFocus placeholder="Search by code, part or storage, e.g. A12 or tile" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="move-list tall">
          {matches.slice(0, MAX_LISTED).map((c) => (
            <div key={c.code} className="move-comp">
              <div className="move-comp-head">
                <span className="code">{c.code}</span>
                <span className="muted small move-name">
                  {placeName(c.comp) && <span className="place-name">{placeName(c.comp)} · </span>}
                  {c.comp.unitName} › {c.comp.label} · {pct(c.fill)} full
                </span>
                {c.sections.length < c.comp.maxSections || !c.sections.length ? (
                  <button className="link" onClick={() => onChoose({ comp: c.comp.key })}>
                    {c.sections.length ? 'New section here' : 'Put it here'}
                  </button>
                ) : (
                  <span className="muted small">no room for another divider</span>
                )}
              </div>
              {c.sections.filter(canJoin).map((s) => joinButton(c, s))}
            </div>
          ))}
          {matches.length > MAX_LISTED && <p className="muted small">Showing the first {MAX_LISTED}. Search to narrow it down.</p>}
          {!matches.length && <p className="muted small">No match.</p>}
        </div>
      </div>
    </div>
  );
}
