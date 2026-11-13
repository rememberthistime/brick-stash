import { useState } from 'react';
import type { CompartmentSpec, Project, Space, StorageUnit } from '../lib/types';
import { PRESETS } from '../lib/presets';
import { drawerKey, setPlaceName, setUnitCode, validUnitCode } from '../lib/codes';
import NameInput from './NameInput';
import { compartmentVolume } from '../lib/volume';
import type { Plan } from '../lib/planner';
import { describeCompartments, groupUnits, parseStorageList, stem, unitsFromPreset, type UnitGroup } from '../lib/storageList';
import { uid } from '../state';
import { Stat } from './CollectionTab';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  plan: Plan;
}

const unitVolume = (u: StorageUnit) => u.compartments.reduce((t, c) => t + compartmentVolume(c) * c.qty, 0);

export default function StorageTab({ project, update, plan }: Props) {
  const [preset, setPreset] = useState(PRESETS[0].id);
  const [count, setCount] = useState(1);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { units, spaces } = project;

  const setUnits = (fn: (u: StorageUnit[]) => StorageUnit[]) => update((p) => ({ units: fn(p.units) }));
  const patchGroup = (g: UnitGroup, fn: (u: StorageUnit) => StorageUnit) => {
    const ids = new Set(g.units.map((u) => u.id));
    setUnits((us) => us.map((u) => (ids.has(u.id) ? fn(u) : u)));
  };

  const addPreset = () => setUnits((us) => [...us, ...unitsFromPreset(PRESETS.find((x) => x.id === preset)!, Math.max(1, count), us, uid)]);
  const addCustom = () => {
    const unit: StorageUnit = { id: uid(), name: 'My storage unit', accessibility: 2, compartments: [{ id: uid(), label: 'Drawer', w: 250, d: 350, h: 80, qty: 4 }] };
    setUnits((us) => [...us, unit]);
    setOpen(unit.id);
  };

  const addCopy = (g: UnitGroup) => {
    const last = g.units[g.units.length - 1];
    setUnits((us) => {
      const numbers = us.filter((x) => stem(x.name) === g.name).map((x) => Number(x.name.match(/#(\d+)$/)?.[1] ?? 1));
      const copy: StorageUnit = {
        ...last,
        // A copy is another unit, so it takes a letter of its own
        code: undefined,
        // Its own name and drawer names are for the user to give it
        title: undefined,
        drawerNames: undefined,
        id: uid(),
        name: `${g.name} #${Math.max(...numbers) + 1}`,
        external: last.external && { ...last.external },
        compartments: last.compartments.map((c) => ({ ...c, id: uid() })),
      };
      const i = us.findIndex((x) => x.id === last.id);
      return [...us.slice(0, i + 1), copy, ...us.slice(i + 1)];
    });
  };
  const removeCopies = (g: UnitGroup, n: number) => {
    const gone = new Set(g.units.slice(-n).map((u) => u.id));
    setUnits((us) => us.filter((u) => !gone.has(u.id)));
  };

  const importList = (replace: boolean) => {
    const { matched, unmatched } = parseStorageList(paste);
    if (!matched.length) {
      setNote({ text: `No products recognised. Lines look like "8x" and then a product link or name from the list above.`, warn: true });
      return;
    }
    if (replace && units.length && !confirm(`Replace your ${units.length} storage units with this list? Sizes you've edited will be lost.`)) return;
    setUnits((us) => matched.reduce((all, m) => [...all, ...unitsFromPreset(m.preset, m.count, all, uid)], replace ? [] : us));
    const total = matched.reduce((t, m) => t + m.count, 0);
    setNote({
      text: `${replace ? 'Now using' : 'Added'} ${total} units across ${matched.length} products.` + (unmatched.length ? ` Not recognised, so add these as custom units: ${unmatched.join('; ')}` : ''),
      warn: unmatched.length > 0,
    });
    setPaste(unmatched.join('\n'));
  };

  const setSpaces = (fn: (s: Space[]) => Space[]) => update((p) => ({ spaces: fn(p.spaces) }));
  const preview = PRESETS.find((x) => x.id === preset)!;
  const retailers = [...new Set(PRESETS.map((p) => p.retailer))];
  const groups = groupUnits(units);

  return (
    <div className="grid-2 storage">
      <section className="card">
        <h2>Your storage</h2>
        <p className="muted">Pick each product you own and how many. The most-used parts go in the units marked easiest to reach.</p>
        <div className="stats">
          <Stat label="Units" value={String(units.length)} hint={`${groups.length} kinds`} />
          <Stat label="Compartments" value={String(plan.compartments.length)} />
          <Stat label="Total volume" value={`${(plan.stats.physicalCapacity / 1000).toFixed(1)} L`} />
          <Stat label="Planned capacity" value={`${(plan.stats.plannedCapacity / 1000).toFixed(1)} L`} hint="after growth headroom" />
        </div>

        <div className="add-unit">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {retailers.map((r) => (
              <optgroup key={r} label={r}>
                {PRESETS.filter((p) => p.retailer === r).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input type="number" className="add-count" min={1} max={50} value={count} title="How many" onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
          <button onClick={addPreset}>Add</button>
          <button className="ghost" onClick={addCustom}>
            Custom unit
          </button>
        </div>
        <p className="muted small">
          {preview.compartments.map((c) => `${c.qty}× ${c.label} ${c.w}×${c.d}×${c.h} mm`).join(' + ')}
          {preview.notes ? ` — ${preview.notes}` : ' — approximate: measure yours and edit.'}
        </p>

        <details className="paste-list">
          <summary>Paste a list of what you own</summary>
          <p className="muted small">One product per line: how many, then its link or name from the list above, e.g. "8x https://www.officeworks.com.au/…sort6comp".</p>
          <textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'8x https://www.officeworks.com.au/shop/officeworks/p/ezy-storage-sort-it-2-5l-6-compartment-storage-container-sort6comp\n7x Sterilite Clearview 3 drawer unit'} />
          <div className="row">
            <button disabled={!paste.trim()} onClick={() => importList(false)}>
              Add to my storage
            </button>
            <button className="ghost" disabled={!paste.trim()} onClick={() => importList(true)}>
              Replace my storage
            </button>
          </div>
        </details>
        {note && <div className={`banner ${note.warn ? 'warn' : ''}`}>{note.text}</div>}

        {units.length === 0 && <div className="empty-state">No storage yet. Add a product above, or paste a list.</div>}

        {groups.length > 0 && (
          <div className="unit-rows">
            {groups.map((g) => (
              <GroupRow
                key={g.units[0].id}
                group={g}
                spaces={spaces}
                isOpen={open === g.units[0].id}
                toggle={() => setOpen(open === g.units[0].id ? null : g.units[0].id)}
                patch={(fn) => patchGroup(g, fn)}
                onAdd={() => addCopy(g)}
                onRemove={(n) => removeCopies(g, n)}
                onCode={(unitId, code) => setUnits((us) => setUnitCode(us, unitId, code))}
                onName={(unitId, drawer, name) => setUnits((us) => setPlaceName(us, unitId, drawer, name))}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Spaces (optional)</h2>
        <p className="muted">
          Cupboards, shelves or alcoves your units live in — internal mm. With outside sizes on your units, the planner can tell you how much room is left and what would fit.
        </p>
        {spaces.map((s) => (
          <div key={s.id} className="space-row">
            <input value={s.name} onChange={(e) => setSpaces((ss) => ss.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
            <DimsInput value={s} onChange={(d) => setSpaces((ss) => ss.map((x) => (x.id === s.id ? { ...x, ...d } : x)))} />
            <span className="muted small">{(compartmentVolume(s) / 1000).toFixed(0)} L</span>
            <button className="icon danger" onClick={() => setSpaces((ss) => ss.filter((x) => x.id !== s.id))}>
              ✕
            </button>
          </div>
        ))}
        <button className="ghost" onClick={() => setSpaces((ss) => [...ss, { id: uid(), name: `Cupboard ${ss.length + 1}`, w: 800, d: 450, h: 1800 }])}>
          + Add space
        </button>

        <h3>Measuring tips</h3>
        <ul className="tips">
          <li>Measure inside the compartment at the narrowest point — drawer runners and lips steal space.</li>
          <li>Height: use the usable depth (to just below the drawer above), not the drawer front.</li>
          <li>Tick <b>No dividers</b> for tiny drawers or fabric boxes that can only hold one group.</li>
          <li>
            Tiny parts in deep tubs are hard to find — a shallow tray inside is a cheap fix. Use <b>÷2</b> to model fitting a fixed divider.
          </li>
        </ul>
      </section>
    </div>
  );
}

/** A unit's letter, changed only once a whole valid one has been typed */
function CodeInput({ code, title, onChange }: { code: string; title: string; onChange: (code: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const next = (draft ?? code).trim().toUpperCase();
    setDraft(null);
    if (validUnitCode(next) && next !== code) onChange(next);
  };
  return (
    <input
      className="unit-code"
      aria-label={`Letter for ${title}`}
      title={title}
      maxLength={3}
      value={draft ?? code}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function GroupRow({
  group,
  spaces,
  isOpen,
  toggle,
  patch,
  onAdd,
  onRemove,
  onCode,
  onName,
}: {
  group: UnitGroup;
  spaces: Space[];
  isOpen: boolean;
  toggle: () => void;
  patch: (fn: (u: StorageUnit) => StorageUnit) => void;
  onAdd: () => void;
  onRemove: (n: number) => void;
  onCode: (unitId: string, code: string) => void;
  onName: (unitId: string, drawer: string | null, name: string) => void;
}) {
  const first = group.units[0];
  const codes = group.units.flatMap((u) => (u.code ? [u.title ? `${u.code}: ${u.title}` : u.code] : []));
  const copies = group.units.length;
  const patchComp = (i: number, change: Partial<CompartmentSpec>) => patch((u) => ({ ...u, compartments: u.compartments.map((c, k) => (k === i ? { ...c, ...change } : c)) }));
  return (
    <div className={`unit-row ${isOpen ? 'open' : ''}`}>
      <div className="unit-row-head">
        <button className="icon expand" title={isOpen ? 'Hide sizes' : 'Edit sizes'} onClick={toggle}>
          {isOpen ? '▾' : '▸'}
        </button>
        <div className="unit-row-name" onClick={toggle}>
          <b>
            {group.name}
            {codes.length > 0 && <span className="unit-codes">{codes.join(codes.some((c) => c.includes(':')) ? ' · ' : ' ')}</span>}
          </b>
          <span className="muted small">
            {describeCompartments(first)} mm · {(unitVolume(first) / 1000).toFixed(1)} L each
          </span>
        </div>
        <span className="stepper" title="How many you have">
          <button className="ghost" disabled={copies < 2} onClick={() => onRemove(1)}>
            −
          </button>
          <b>{copies}</b>
          <button className="ghost" onClick={onAdd}>
            +
          </button>
        </span>
        <span className="muted small unit-row-total">{((unitVolume(first) * copies) / 1000).toFixed(1)} L</span>
        <button
          className="icon danger"
          title={copies > 1 ? `Remove all ${copies}` : 'Remove'}
          onClick={() => (copies === 1 || confirm(`Remove all ${copies} of ${group.name}?`)) && onRemove(copies)}
        >
          ✕
        </button>
      </div>
      {isOpen && (
        <div className="unit-row-body">
          {copies > 1 && <p className="muted small">Changes here apply to all {copies}.</p>}
          <div className="unit-meta">
            <label>
              Name
              <input
                value={group.name}
                onChange={(e) => {
                  const name = e.target.value;
                  patch((u) => ({ ...u, name: u.name === group.name ? name : u.name.replace(/^.*(\s#\d+)$/, `${name}$1`) }));
                }}
              />
            </label>
            <label>
              Reach
              <select value={first.accessibility} onChange={(e) => patch((u) => ({ ...u, accessibility: Number(e.target.value) as 1 | 2 | 3 }))}>
                <option value={3}>Easy (hand height)</option>
                <option value={2}>OK</option>
                <option value={1}>Awkward (floor / top / back)</option>
              </select>
            </label>
            {spaces.length > 0 && (
              <label>
                In
                <select value={first.spaceId ?? ''} onChange={(e) => patch((u) => ({ ...u, spaceId: e.target.value || undefined }))}>
                  <option value="">—</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label title="Outside size, mm — used to suggest what else fits in a cupboard">
              Outside W×D×H
              <DimsInput value={first.external} onChange={(external) => patch((u) => ({ ...u, external }))} />
            </label>
          </div>
          <div className="unit-names">
            <p className="muted small">
              The letter is what its drawers are known by, as in A1, and stays put when you add or reorder storage; change one only to match what’s already on the drawers (giving it a letter another unit has swaps the two). A name is your own, and shows beside the code everywhere, as in “A1: Technic”. A drawer without a name of its own shows its unit’s.
            </p>
            {group.units.map((u) => {
              const drawers = u.compartments.flatMap((c) => Array.from({ length: c.qty }, (_, i) => ({ key: drawerKey(c.id, i), label: c.qty > 1 ? `${c.label} ${i + 1}` : c.label })));
              const named = drawers.filter((d) => u.drawerNames?.[d.key]).length;
              return (
                <div key={u.id} className="unit-name-row">
                  <CodeInput code={u.code ?? ''} title={u.name} onChange={(code) => onCode(u.id, code)} />
                  <NameInput value={u.title ?? ''} placeholder={copies > 1 ? `Name for ${u.name}` : 'Name, e.g. Technic cabinet'} label={`Name for ${u.name}`} onChange={(name) => onName(u.id, null, name)} />
                  {drawers.length > 1 && (
                    <details className="unit-drawer-names">
                      <summary className="small">
                        Name its {drawers.length} {first.compartments[0]?.label.toLowerCase().startsWith('drawer') ? 'drawers' : 'compartments'}
                        {named ? ` (${named} named)` : ''}
                      </summary>
                      <div className="unit-drawer-grid">
                        {drawers.map((d, n) => (
                          <label key={d.key} className="small">
                            <span className="code">{`${u.code ?? ''}${n + 1}`}</span>
                            <NameInput value={u.drawerNames?.[d.key] ?? ''} placeholder={u.title || d.label} label={`Name for ${u.code ?? ''}${n + 1}, ${d.label}`} onChange={(name) => onName(u.id, d.key, name)} />
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <table className="comps">
            <thead>
              <tr>
                <th>Compartment</th>
                <th className="num">W</th>
                <th className="num">D</th>
                <th className="num">H (mm)</th>
                <th className="num">Qty</th>
                <th title="Tick if it can't take dividers or bags">No dividers</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {first.compartments.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    <input value={c.label} onChange={(e) => patchComp(i, { label: e.target.value })} />
                  </td>
                  {(['w', 'd', 'h', 'qty'] as const).map((k) => (
                    <td key={k} className="num">
                      <input type="number" min={1} value={c[k]} onChange={(e) => patchComp(i, { [k]: Math.max(1, Number(e.target.value) || 1) })} />
                    </td>
                  ))}
                  <td className="center">
                    <input type="checkbox" checked={!!c.noDividers} onChange={(e) => patchComp(i, { noDividers: e.target.checked })} />
                  </td>
                  <td className="nowrap">
                    <button className="icon" title="Fit a fixed divider: halves the width, doubles the count" onClick={() => patchComp(i, { w: Math.floor(c.w / 2), qty: c.qty * 2 })}>
                      ÷2
                    </button>
                    <button
                      className="icon"
                      title="Remove"
                      disabled={first.compartments.length === 1}
                      onClick={() => patch((u) => ({ ...u, compartments: u.compartments.filter((_, k) => k !== i) }))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link" onClick={() => patch((u) => ({ ...u, compartments: [...u.compartments, { id: uid(), label: 'Compartment', w: 100, d: 100, h: 50, qty: 1 }] }))}>
            + compartment type
          </button>
        </div>
      )}
    </div>
  );
}

function DimsInput({ value, onChange }: { value?: { w: number; d: number; h: number }; onChange: (d: { w: number; d: number; h: number }) => void }) {
  const v = value ?? { w: 0, d: 0, h: 0 };
  return (
    <span className="dims">
      {(['w', 'd', 'h'] as const).map((k, i) => (
        <span key={k}>
          {i > 0 && '×'}
          <input type="number" min={0} value={v[k] || ''} placeholder={k.toUpperCase()} onChange={(e) => onChange({ ...v, [k]: Number(e.target.value) || 0 })} />
        </span>
      ))}
    </span>
  );
}
