// How the planner fills the drawers you haven't recorded yet, and the key to its family colours.
import { familyLabel, targetFill } from '../../lib/planner';
import { FAMILIES } from '../../lib/taxonomy';
import { DEFAULT_SETTINGS, type Granularity, type Settings } from '../../lib/types';
import Fold, { type Folds } from '../Fold';
import { pct } from './format';

export function PlanSettings({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const gran: { k: Granularity; label: string; hint: string }[] = [
    { k: 'relaxed', label: 'Relaxed', hint: 'Broad groups, fewer containers' },
    { k: 'balanced', label: 'Balanced', hint: 'Separate common parts, lump the rest' },
    { k: 'fine', label: 'Fine', hint: 'Most part types get their own space' },
  ];
  return (
    <div className="plan-settings">
      <p className="muted small">These shape the suggestions for drawers you haven’t recorded. Recorded drawers stay as they are.</p>
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
      <fieldset>
        <legend>Free drawers</legend>
        <label className="radio">
          <input type="radio" checked={!settings.spread} onChange={() => set('spread', false)} />
          <span>
            <b>Fill them in turn</b>
            <small>Each drawer is filled to its planned fill before the next is used, and any left over stay empty at the end</small>
          </span>
        </label>
        <label className="radio">
          <input type="radio" checked={!!settings.spread} onChange={() => set('spread', true)} />
          <span>
            <b>Spread across all of them</b>
            <small>Every free drawer gets something, each less full</small>
          </span>
        </label>
      </fieldset>
      <Slider label="Expected growth" value={settings.growth} min={0} max={1} step={0.05} fmt={(v) => `+${pct(v)}`} hint="Room left in every compartment so new parts slot in" onChange={(v) => set('growth', v)} />
      <Slider label="Practical max fill" value={settings.practicalFill} min={0.5} max={0.95} step={0.05} fmt={pct} hint="Fuller than this and rummaging gets hard" onChange={(v) => set('practicalFill', v)} />
      <Slider label="Spare compartments" value={settings.spareFraction} min={0} max={0.3} step={0.05} fmt={pct} hint="Left empty next to the largest families, for new categories" onChange={(v) => set('spareFraction', v)} />
      <Slider label="Max sections per compartment" value={settings.maxSections} min={1} max={8} step={1} fmt={String} hint="How many dividers you're willing to fit" onChange={(v) => set('maxSections', v)} />
      <p className="muted small">
        Each compartment is planned to {pct(targetFill(settings))} full ({pct(settings.practicalFill)} ÷ {(1 + settings.growth).toFixed(2)}).{' '}
        <button className="link small" onClick={() => onChange({ ...DEFAULT_SETTINGS, volumeScale: settings.volumeScale })}>
          Reset to defaults
        </button>
      </p>
    </div>
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

/** Each colour is a family of part types; click one to highlight the drawers holding it */
export function ColourKey({ counts, highlight, setHighlight, folds }: { counts: Map<string, number>; highlight: string | null; setHighlight: (k: string | null) => void; folds: Folds }) {
  const present = FAMILIES.filter((f) => counts.has(f.key));
  return (
    <Fold id="storage:key" folds={folds} className="key" title="Colour key" summary={highlight ? `Showing ${familyLabel(highlight)}` : `${present.length} families`} force={!!highlight}>
      <p className="muted small">Each colour is a family of part types (not a brick colour). Click one to highlight the drawers holding it.</p>
      <div className="key-items">
        {present.map((f) => (
          <button key={f.key} className={`key-item ${highlight === f.key ? 'on' : ''} ${highlight && highlight !== f.key ? 'off' : ''}`} onClick={() => setHighlight(highlight === f.key ? null : f.key)}>
            <span className={`swatch fam-${f.key}`} /> {f.label} <span className="muted">· {counts.get(f.key)}</span>
          </button>
        ))}
      </div>
    </Fold>
  );
}
