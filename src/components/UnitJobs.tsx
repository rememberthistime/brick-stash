// What each unit is for: one line per unit, with what it holds and what size of part, so moves offer the right
// units first and the layout check knows what belongs where. Each unit has a suggested job, from what's in it and the
// shape of its drawers, to take with Use. Names can be filled in from the jobs.
import type { SizeClass, StorageUnit, UnitJob } from '../lib/types';
import { SIZE_CLASSES, jobLabel, nameFromJobs, setJob, sizeClassLabel, unitShape, whatChoices } from '../lib/unitJobs';
import { setPlaceName } from '../lib/codes';
import NameInput from './NameInput';
import type { JobHint } from '../lib/jobSuggest';

const byCode = (a: StorageUnit, b: StorageUnit) => (a.code ?? '').length - (b.code ?? '').length || (a.code ?? '').localeCompare(b.code ?? '');

export default function UnitJobs({ units, setUnits, hints = new Map(), moves = 0 }: { units: StorageUnit[]; setUnits: (fn: (u: StorageUnit[]) => StorageUnit[]) => void; hints?: Map<string, JobHint>; moves?: number }) {
  if (!units.length) return null;
  const choices = whatChoices();
  const sorted = [...units].sort(byCode);
  const withJob = units.filter((u) => jobLabel(u.job)).length;
  const toName = units.filter((u) => !u.title?.trim() && jobLabel(u.job)).length;
  const change = (u: StorageUnit, job: UnitJob) => setUnits((us) => setJob(us, u.id, { ...u.job, ...job }));
  // Use all only fills units with no job yet; a job you've set is changed one unit at a time
  const forEmpty = units.filter((u) => !jobLabel(u.job) && hints.has(u.id));
  const useAll = () => setUnits((us) => us.reduce((acc, u) => (!jobLabel(u.job) && hints.has(u.id) ? setJob(acc, u.id, hints.get(u.id)!.job) : acc), us));
  return (
    <section className="card unit-jobs">
      <h3>What each unit is for</h3>
      <p className="muted small">
        Give each unit a job, such as Bricks, Technic, or Plates &amp; Tiles in its flat parts, so anyone can tell where a part belongs. A single drawer can have a use of its own, set in the drawer (Used for), and Suggestions offers one for a drawer that’s mostly another sort of part. Each unit has a suggested job, from what’s already in it (or, for an empty unit, what the suggestions would put there) and what its drawers’ shape suits. Moving a part offers the units whose job it fits first, the suggestions for drawers not yet recorded follow the jobs, Suggestions offers moves for parts in another unit’s job, and the layout check on Review points them out.
      </p>
      <table className="unit-jobs-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Name</th>
            <th>Holds</th>
            <th>Size of part</th>
            <th>Suggested</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => {
            const shape = unitShape(u);
            const hint = hints.get(u.id);
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
                <td className="small unit-job-hint">
                  {hint ? (
                    <>
                      <b>{jobLabel(hint.job)}</b>{' '}
                      <button className="link small" onClick={() => setUnits((us) => setJob(us, u.id, hint.job))}>
                        Use
                      </button>
                      <span className="muted block">{hint.why}</span>
                    </>
                  ) : jobLabel(u.job) ? (
                    <span className="muted">As set</span>
                  ) : (
                    <span className="muted">{shape && shape !== 'ordinary' ? `Its drawers suit ${sizeClassLabel(shape).toLowerCase()}` : 'Nothing in it yet to go by'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        {withJob} of {units.length} units have a job.{' '}
        {forEmpty.length > 0 && (
          <>
            <button className="link small" onClick={useAll}>
              Use the suggested {forEmpty.length === 1 ? 'job' : 'jobs'} for the {forEmpty.length} {forEmpty.length === 1 ? 'unit' : 'units'} without one
            </button>{' '}
          </>
        )}
        {toName > 0 && (
          <button className="link small" onClick={() => setUnits(nameFromJobs)}>
            Name the {toName} unnamed {toName === 1 ? 'unit' : 'units'} after {toName === 1 ? 'its job' : 'their jobs'}
          </button>
        )}
      </p>
      {moves > 0 && (
        <p className="unit-jobs-moves">
          {moves} {moves === 1 ? 'part or pocket is' : 'parts and pockets are'} in a unit whose job {moves === 1 ? 'it doesn’t' : 'they don’t'} fit, with room in one whose job {moves === 1 ? 'it does' : 'they do'}. <a href="#/moves">See the moves on Suggestions</a>, to accept or skip.
        </p>
      )}
    </section>
  );
}
