import { useState } from 'react';
import type { Exclusion, Project } from '../lib/types';
import { parseInventory, type SubtractResult } from '../lib/collection';
import { BadKeyError, formatSetLines, parseSetLines, parseSetList, pause, setName, setParts, type WantedSet } from '../lib/rebrickable';
import { uid } from '../state';

interface Props {
  project: Project;
  update: (p: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  apiKey: string;
  apiKeyInput: React.ReactNode;
  subtraction: SubtractResult;
}

/** Above this share of a subtraction not being in the collection, the sets themselves are probably wrong */
const WRONG_SET_SHARE = 0.2;

const pieces = (e: Exclusion) => e.rows.reduce((t, r) => t + (r.spare ? 0 : r.qty), 0);

/** Sets kept built (or anything else not in storage), subtracted from the imported collection */
export default function BuiltSets({ project, update, apiKey, apiKeyInput, subtraction }: Props) {
  const [sets, setSets] = useState('');
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const list = project.excluded;

  const add = (items: Exclusion[]) => update((p) => ({ excluded: [...p.excluded, ...items] }));
  const patch = (id: string, change: Partial<Exclusion>) => update((p) => ({ excluded: p.excluded.map((e) => (e.id === id ? { ...e, ...change } : e)) }));

  const fetchSets = async () => {
    const wanted = parseSetLines(sets);
    const already = new Set(list.map((e) => e.label.split(' ')[0]));
    const todo = wanted.filter((w) => !already.has(w.setNum));
    const skipped = wanted.length - todo.length;
    const failed: { set: WantedSet; why: string }[] = [];
    let added = 0;
    setErrors([]);
    setNotice('');
    for (const [i, set] of todo.entries()) {
      setBusy(`Fetching ${set.setNum} (${i + 1} of ${todo.length})…`);
      try {
        const name = await setName(set.setNum, apiKey);
        await pause(1100); // Rebrickable allows ~1 request/second
        const rows = await setParts(set.setNum, apiKey, set.copies);
        // Saved one at a time, so an interrupted run keeps what it has done
        add([{ id: uid(), label: `${set.setNum} ${name}${set.copies > 1 ? ` ×${set.copies}` : ''}`, rows, enabled: true }]);
        added++;
      } catch (e) {
        if (e instanceof BadKeyError) {
          // Every other set would fail the same way
          failed.push(...todo.slice(i).map((t) => ({ set: t, why: e.message })));
          break;
        }
        failed.push({ set, why: (e as Error).message });
      }
      await pause(1100);
    }
    setBusy('');
    setSets(formatSetLines(failed.map((f) => f.set)));
    setErrors(failed.length ? [`Couldn't fetch ${failed.length} set(s), left in the box above to retry: ${failed.slice(0, 8).map((f) => `${f.set.setNum} (${f.why})`).join(', ')}${failed.length > 8 ? '…' : ''}`] : []);
    setNotice(`Subtracted ${added} set(s).${skipped ? ` Skipped ${skipped} already in the list.` : ''}`);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const found: Exclusion[] = [];
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      const text = await f.text();
      const setList = parseSetList(text);
      if (setList) {
        // A set list may hold sets that aren't kept built, so it fills the box for checking first
        setSets((cur) => formatSetLines(parseSetLines(`${cur}\n${formatSetLines(setList)}`)));
        const minutes = Math.ceil((setList.length * 2.5) / 60);
        setNotice(`Loaded ${setList.length} sets from ${f.name}. Remove any you don't keep built, then click Subtract these sets (about ${minutes} min).`);
        continue;
      }
      const r = parseInventory(text);
      if (r.rows.length) found.push({ id: uid(), label: f.name.replace(/\.(csv|tsv|txt|xml)$/i, ''), rows: r.rows, enabled: true });
      else errs.push(`${f.name}: ${r.warnings[0] ?? 'no parts found'}`);
    }
    setErrors(errs);
    add(found);
  };

  const active = list.filter((e) => e.enabled);
  const missingPieces = subtraction.missing.reduce((t, m) => t + m.qty, 0);
  const missingShare = missingPieces / Math.max(1, missingPieces + subtraction.removed);

  return (
    <section className="card">
      <h2>Sets you keep built</h2>
      <p className="muted">
        Rebrickable's parts export includes every set in your lists, built or not. Add the sets you keep built and their parts come off the collection before planning. Spare parts stay in — they're loose in
        your boxes, not in the model. This list is kept separately, so you can re-import a fresh full export at any time.
      </p>

      {apiKeyInput}
      <textarea rows={3} placeholder={'One set per line, e.g.\n10294\n75192-1 x2'} value={sets} onChange={(e) => setSets(e.target.value)} />
      <div className="row">
        <button disabled={!apiKey || !sets.trim() || !!busy} onClick={fetchSets}>
          Subtract these sets
        </button>
        <label className="ghost-file">
          <input type="file" accept=".csv,.tsv,.txt,.xml" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <span className="link">…or upload a set list or parts file</span>
        </label>
      </div>
      <p className="muted small">A set list is Rebrickable's set list export (with a Set Number column); it fills the box above. A parts file is any list with part numbers and quantities, and comes straight off.</p>

      {busy && <div className="banner">{busy}</div>}
      {!busy && notice && <div className="banner">{notice}</div>}
      {errors.map((e, i) => (
        <div key={i} className="banner warn">
          {e}
        </div>
      ))}

      {list.length > 0 && (
        <>
          <table className="excluded">
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={e.enabled ? '' : 'off'}>
                  <td className="center">
                    <input type="checkbox" checked={e.enabled} title="Include in the subtraction" onChange={(ev) => patch(e.id, { enabled: ev.target.checked })} />
                  </td>
                  <td>{e.label}</td>
                  <td className="num">{pieces(e).toLocaleString()} pcs</td>
                  <td>
                    <button className="icon danger" title="Remove" onClick={() => update((p) => ({ excluded: p.excluded.filter((x) => x.id !== e.id) }))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="banner">
            Subtracting {active.length} of {list.length} — <b>{subtraction.removed.toLocaleString()}</b> pieces taken off.
          </div>
          {missingPieces > 0 && (
            <div className={`banner ${missingShare > WRONG_SET_SHARE ? 'warn' : ''}`}>
              <details>
                <summary>
                  {missingPieces.toLocaleString()} pieces in these sets aren't in your part list, so there was nothing to take off for them. Everything else has been subtracted.
                  {missingShare > WRONG_SET_SHARE ? ' That is a lot: check the set numbers, and that these sets are in your export.' : " That's fine if those parts are lost or were swapped."}
                </summary>
                <ul className="missing-list">
                  {subtraction.missing.slice(0, 200).map((m) => (
                    <li key={m.partNum}>
                      {m.qty} × {m.name} ({m.partNum})
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </>
      )}
    </section>
  );
}
