// A drawer you haven't recorded, with what the plan suggests for it: the parts that would go there, how to divide it,
// and a button to record it that way.
import { dividerLayout, type Divider, type DividerLayout, type Rect } from '../../lib/dividers';
import { leaves, sectionLabel, targetFill, type PlannedCompartment, type Section } from '../../lib/planner';
import { codeWithName } from '../../lib/codes';
import type { SetupComp } from '../../lib/setup';
import type { Settings } from '../../lib/types';
import PartImage from '../PartImage';
import { L, pct } from './format';

type Suggestion = PlannedCompartment & { code: string };

const sectionParts = (s: Section) => leaves(s.node).flatMap((l) => (l.part ? [l.part] : []));

export default function SuggestedDrawer({ c, comp, settings, onRecord, onRecordByHand, onClose }: { c: Suggestion; comp: SetupComp; settings: Settings; onRecord: () => void; onRecordByHand: () => void; onClose: () => void }) {
  const layout = dividerLayout(c, targetFill(settings));
  return (
    <div className="move-backdrop" onClick={onClose}>
      <div className="move-picker card setup-editor" role="dialog" aria-label={`Suggestion for ${c.code}`} onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h3>
            <span className="code">{c.code}</span> {codeWithName(c.code, comp) !== c.code && <span className="place-name">{codeWithName(c.code, comp).slice(c.code.length + 2)} · </span>}
            {comp.unitName} › {comp.label}
          </h3>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small">
          Nothing’s recorded here yet. This is where the plan would put parts that aren’t in any drawer: {pct(c.fill)} full, in {comp.w}×{comp.d}×{comp.h} mm ({L(comp.volume)}).
        </p>
        <div className="row">
          <button onClick={onRecord}>Record it like this</button>
          <button className="ghost" onClick={onRecordByHand}>
            Record it by hand
          </button>
        </div>
        {layout && <DividerPlan c={c} layout={layout} />}
        {c.sections.map((sec, i) => (
          <div key={i} className="detail-sec">
            <h4>
              <span className={`swatch fam-${sec.node.familyKey}`} /> {c.sections.length > 1 && `${i + 1}. `}
              {sectionLabel(sec)}
              <span className="muted small"> · {sec.pieces.toLocaleString()} pcs · {L(sec.volume)}</span>
            </h4>
            <table className="parts">
              <tbody>
                {sectionParts(sec)
                  .sort((a, b) => b.qty - a.qty)
                  .map((p) => (
                    <tr key={p.partNum}>
                      <td className="img-cell">
                        <PartImage partNum={p.partNum} size={36} title={p.name} />
                      </td>
                      <td>
                        <a href={`https://rebrickable.com/parts/${encodeURIComponent(p.partNum)}/`} target="_blank" rel="noreferrer">
                          {p.name}
                        </a>{' '}
                        <span className="muted small">{p.partNum}</span>
                      </td>
                      <td className="num">{p.qty.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "at 90 mm from the front" or, for a short divider, where along the row it sits */
function whereDivider(v: Divider): string {
  if (v.y1 === v.y2) return v.short ? `${v.y1} mm from the front, from ${v.x1} to ${v.x2} mm across` : `${v.y1} mm from the front`;
  return v.short ? `${v.x1} mm from the left, from ${v.y1} to ${v.y2} mm back` : `${v.x1} mm from the left`;
}

function DividerPlan({ c, layout }: { c: Suggestion; layout: DividerLayout }) {
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

