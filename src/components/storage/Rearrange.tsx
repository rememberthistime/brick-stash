// "Tidy the layout": swaps of whole drawers between slots that take the same drawer, so each family sits in one run.
import { codeWithName } from '../../lib/codes';
import { familyLabel } from '../../lib/planner';
import type { DrawerCycle, Rearrangement } from '../../lib/rearrange';
import type { SetupComp } from '../../lib/setup';

interface Props {
  plans: Rearrangement[];
  comps: SetupComp[];
  /** do these swaps, in order */
  onSwap: (swaps: { cycle: DrawerCycle; text: string }[]) => void;
}

const familyName = (f: string | null) => (f ? familyLabel(f) : 'empty');

export default function Rearrange({ plans, comps, onSwap }: Props) {
  const byKey = new Map(comps.map((c) => [c.key, c]));
  if (!plans.length) return <p className="muted small">Each family’s drawers are already together, for every kind of drawer you’ve recorded.</p>;
  return (
    <>
      <p className="muted small">
        Drawers that slot into each other’s places (the same product and size) can be moved round, within a unit or between units, so each family sits in one run. Only recorded drawers are moved, each with its pockets and name. A drawer takes the code of the slot it moves to, so reprint its label.
      </p>
      {plans.map((r) => {
        // Each swap changes what's in its two slots, so describe each from the layout as it will be by then
        const now = [...r.now];
        const swaps = r.cycles.map((cycle) => {
          const [a, b] = [r.slots.indexOf(cycle.steps[0].from), r.slots.indexOf(cycle.steps[0].to)];
          const code = (i: number) => {
            const c = byKey.get(r.slots[i]);
            return c ? codeWithName(c.code, c) : '?';
          };
          const text = `Swap drawers ${code(a)} (${familyName(now[a])}) and ${code(b)} (${familyName(now[b])})`;
          [now[a], now[b]] = [now[b], now[a]];
          return { cycle, text };
        });
        return (
          <div key={r.kind} className="rearrange">
            <h4>
              {r.kind}{' '}
              <span className="muted small">
                {r.before + 1} runs of families now, {r.after + 1} after {swaps.length} {swaps.length === 1 ? 'swap' : 'swaps'}
              </span>
            </h4>
            <Strip label="Now" slots={r.slots} families={r.now} byKey={byKey} />
            <Strip label="After" slots={r.slots} families={r.then} byKey={byKey} />
            <div className="row">
              <button className="small-btn" onClick={() => onSwap(swaps.slice(0, 1))} title="Do the first swap; the rest are worked out again from there">
                {swaps[0].text}
              </button>
              {swaps.length > 1 && (
                <button className="ghost small-btn" onClick={() => onSwap(swaps)}>
                  Do all {swaps.length}
                </button>
              )}
            </div>
            {swaps.length > 1 && (
              <details>
                <summary className="small">All {swaps.length} swaps, in order</summary>
                <ol className="small rearrange-list">
                  {swaps.map((s) => (
                    <li key={s.cycle.id}>{s.text}</li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        );
      })}
    </>
  );
}

/** A row of the slots, each coloured by the family in it */
function Strip({ label, slots, families, byKey }: { label: string; slots: string[]; families: (string | null)[]; byKey: Map<string, SetupComp> }) {
  return (
    <div className="rearrange-strip">
      <span className="muted small">{label}</span>
      {slots.map((key, i) => (
        <span key={key} className={`rearrange-slot ${families[i] ? `fam-${families[i]}` : 'empty'}`} title={`${byKey.get(key)?.code ?? '?'}: ${familyName(families[i])}`}>
          {byKey.get(key)?.code}
        </span>
      ))}
    </div>
  );
}
