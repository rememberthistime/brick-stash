// The storage map: each cupboard or shelf with its units shelf by shelf, and every drawer's code and contents,
// to print and stick on the door so anyone knows where to look before opening it.
import { useState } from 'react';
import { placeName } from '../../lib/codes';
import { contentsName, type PlacedPocket, type SetupComp } from '../../lib/setup';
import { MAX_SHELVES, nudgeUnit, storageMap, type MapDrawer } from '../../lib/storageMap';
import type { Project, StorageUnit } from '../../lib/types';
import { mainGroup } from '../../lib/labels';
import { jobLabel } from '../../lib/unitJobs';
import { GroupDot, GroupKey } from '../GroupDot';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  comps: SetupComp[];
  placed: Map<string, PlacedPocket[]>;
}

const MAX_NAMES = 3;

export default function StorageMap({ project, update, comps, placed }: Props) {
  const [arranging, setArranging] = useState(false);

  const drawersOf = (u: StorageUnit): MapDrawer[] =>
    comps
      .filter((c) => c.unitId === u.id)
      .map((c) => {
        const inUse = (placed.get(c.key) ?? []).filter((p) => p.parts.length);
        const names = [...new Set(inUse.map((p) => p.label?.trim() || contentsName(p)))];
        const contents = names.length > MAX_NAMES ? `${names.slice(0, MAX_NAMES).join(' · ')} +${names.length - MAX_NAMES}` : names.join(' · ');
        const recorded = !!project.setup.drawers[c.key]?.length;
        return { code: c.code, title: placeName(c) || contents || (recorded ? 'Empty' : '—'), recorded, ...(mainGroup(inUse) ? { group: mainGroup(inUse) } : {}) };
      });
  const map = storageMap(project.spaces, project.units, drawersOf);
  const setUnit = (id: string, f: (u: StorageUnit) => StorageUnit) => update((p) => ({ units: p.units.map((u) => (u.id === id ? f(u) : u)) }));

  if (!project.units.length) return <p className="muted">Add your storage on Units first.</p>;

  return (
    <div className="map-view">
      <div className="row no-print">
        <button onClick={() => window.print()}>Print</button>
        <label className="small">
          <input type="checkbox" checked={arranging} onChange={(e) => setArranging(e.target.checked)} /> Arrange: put units on their shelves and in order
        </label>
      </div>
      <GroupKey />
      {!project.spaces.length && (
        <p className="muted small no-print">Add your cupboards and shelves on Spaces to get a map for each. Until then, every unit is shown together.</p>
      )}
      {map.map((g) => (
        <section key={g.space?.id ?? 'none'} className="card map-space">
          <h2>
            {g.space?.name ?? (project.spaces.length ? 'Not in a cupboard' : 'Your storage')}{' '}
            {g.space && <small className="muted">{(g.space.w / 10).toFixed(0)} × {(g.space.h / 10).toFixed(0)} cm</small>}
          </h2>
          {!g.shelves.length && <p className="muted small">No units in here yet. Put units in it on Units.</p>}
          <div className="map-frame">
            {g.shelves.map((row, s) => (
              <div key={s} className="map-shelf">
                {row.map(({ unit, drawers, width }) => (
                  <div key={unit.id} className="map-unit" style={{ flexGrow: width, flexBasis: 0 }}>
                    <div className="map-unit-head">
                      <span className="map-letter">{unit.code}</span>
                      <span className="map-unit-name">
                        {unit.title && <b>{unit.title}</b>} <span className="muted small">{unit.name}</span>
                        {jobLabel(unit.job) && jobLabel(unit.job) !== unit.title && <span className="map-unit-job">For {jobLabel(unit.job)}</span>}
                      </span>
                    </div>
                    <ul className="map-drawers">
                      {drawers.map((d) => (
                        <li key={d.code} className={d.recorded ? '' : 'muted'}>
                          <GroupDot group={d.group} /> <span className="code">{d.code}</span> <span className="map-drawer-title">{d.title}</span>
                        </li>
                      ))}
                    </ul>
                    {arranging && (
                      <div className="map-arrange no-print">
                        <button className="icon" title="Move left" aria-label={`Move ${unit.code} left`} onClick={() => update((p) => ({ units: nudgeUnit(p.units, unit.id, -1) }))}>
                          ‹
                        </button>
                        <select value={unit.shelf ?? 1} aria-label={`Shelf for ${unit.code}`} onChange={(e) => setUnit(unit.id, (u) => ({ ...u, shelf: Number(e.target.value) }))}>
                          {Array.from({ length: MAX_SHELVES }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n === 1 ? 'Top shelf' : `Shelf ${n}`}
                            </option>
                          ))}
                        </select>
                        {project.spaces.length > 0 && (
                          <select value={unit.spaceId ?? ''} aria-label={`Cupboard for ${unit.code}`} onChange={(e) => setUnit(unit.id, (u) => ({ ...u, spaceId: e.target.value || undefined }))}>
                            <option value="">no cupboard</option>
                            {project.spaces.map((sp) => (
                              <option key={sp.id} value={sp.id}>
                                {sp.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <button className="icon" title="Move right" aria-label={`Move ${unit.code} right`} onClick={() => update((p) => ({ units: nudgeUnit(p.units, unit.id, 1) }))}>
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
