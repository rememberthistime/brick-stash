// What each unit is for: one line per unit, with what it holds and what size of part, so moves offer the right
// units first and the layout check knows what belongs where. Names can be filled in from the jobs.
import type { SizeClass, StorageUnit, UnitJob } from '../lib/types';
import { SIZE_CLASSES, jobLabel, nameFromJobs, setJob, sizeClassLabel, unitShape, whatChoices } from '../lib/unitJobs';
import { setPlaceName } from '../lib/codes';
import NameInput from './NameInput';

const byCode = (a: StorageUnit, b: StorageUnit) => (a.code ?? '').length - (b.code ?? '').length || (a.code ?? '').localeCompare(b.code ?? '');

export default function UnitJobs({ units, setUnits }: { units: StorageUnit[]; setUnits: (fn: (u: StorageUnit[]) => StorageUnit[]) => void }) {
  if (!units.length) return null;
  const choices = whatChoices();
  const sorted = [...units].sort(byCode);
  const withJob = units.filter((u) => jobLabel(u.job)).length;
  const toName = units.filter((u) => !u.title?.trim() && jobLabel(u.job)).length;
  const change = (u: StorageUnit, job: UnitJob) => setUnits((us) => setJob(us, u.id, { ...u.job, ...job }));
  return (
    <section className="card unit-jobs">
      <h3>What each unit is for</h3>
      <p className="muted small">
        Give each unit one job, such as Bricks, Technic, or Plates &amp; Tiles in its flat parts, so anyone can tell where a part belongs. Moving a part offers the units whose job it fits first, and the layout check on Review points out parts in another unit’s job. The shape column says what the unit’s compartments suit.
      </p>
      <table className="unit-jobs-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Name</th>
            <th>Holds</th>
            <th>Size of part</th>
            <th className="muted">Its shape suits</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => {
            const shape = unitShape(u);
            return (
              <tr key={u.id}>
                <td>
                  <b className="code">{u.code}</b> <span className="muted small">{u.name}</span>
                </td>
                <td>
                  <NameInput value={u.title ?? ''} placeholder={jobLabel(u.job) || 'Name, e.g. Bricks'} label={`Name for ${u.code ?? u.name}`} onChange={(name) => setUnits((us) => setPlaceName(us, u.id, null, name))} />
                </td>
                <td>
                  <select aria-label={`What ${u.code ?? u.name} holds`} value={u.job?.what ?? ''} onChange={(e) => change(u, { what: e.target.value || undefined })}>
                    <option value="">Anything</option>
                    {choices.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.indent ? `   ${c.label}` : c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select aria-label={`Size of part for ${u.code ?? u.name}`} value={u.job?.size ?? ''} onChange={(e) => change(u, { size: (e.target.value || undefined) as SizeClass | undefined })}>
                    <option value="">Any size</option>
                    {SIZE_CLASSES.map((c) => (
                      <option key={c.key} value={c.key} title={c.hint}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted small">
                  {shape && shape !== 'ordinary' ? (
                    <>
                      {sizeClassLabel(shape)}
                      {u.job?.size !== shape && (
                        <>
                          {' '}
                          <button className="link small" onClick={() => change(u, { size: shape })}>
                            Use
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    'Ordinary sizes'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        {withJob} of {units.length} units have a job.{' '}
        {toName > 0 && (
          <button className="link small" onClick={() => setUnits(nameFromJobs)}>
            Name the {toName} unnamed {toName === 1 ? 'unit' : 'units'} after {toName === 1 ? 'its job' : 'their jobs'}
          </button>
        )}
      </p>
    </section>
  );
}
