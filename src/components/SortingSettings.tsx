// How parts are grouped: a lens for each level (Looks like, Catalogue, Used for), and parts put in a group by hand.
// Nothing changes until Use this sorting is pressed, and until then the plan with the new sorting is shown beside the
// plan as it is.
import { useMemo, useState } from 'react';
import { plainName } from '../lib/builderNames';
import { baseMould } from '../lib/collection';
import { buildTree, type TreeNode } from '../lib/planner';
import { DEFAULT_SORTING, type Catalog, type Lens, type Part, type Project, type Sorting } from '../lib/types';
import WhatIf from './WhatIf';

const LENSES: { k: Lens; label: string; hint: string }[] = [
  { k: 'looks', label: 'Looks like', hint: 'Flat pieces, rounds, curves, clips and bars… then by outline (1×2, 2×4…)' },
  { k: 'catalogue', label: 'Catalogue', hint: 'Rebrickable’s families and categories: plates, modified plates, tiles…' },
  { k: 'usedFor', label: 'Used for', hint: 'General building, vehicles, scenery, Technic, figures (a rough guess)' },
];

const PRESETS: { label: string; levels: Lens[] }[] = [
  { label: 'Looks like, then catalogue', levels: ['looks', 'catalogue'] },
  { label: 'Catalogue only (as before)', levels: ['catalogue'] },
  { label: 'Used for, then looks like', levels: ['usedFor', 'looks'] },
];

const same = (a: Sorting, b: Sorting) => JSON.stringify({ l: a.levels, p: a.parts ?? {} }) === JSON.stringify({ l: b.levels, p: b.parts ?? {} });

const groupNames = (tree: TreeNode) => {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    for (const c of n.children)
      if (!c.part && !c.sortAs) {
        out.push(c.label);
        walk(c);
      }
  };
  walk(tree);
  return [...new Set(out)];
};

export default function SortingSettings({ project, catalog, parts, onApply }: { project: Project; catalog: Catalog | null; parts: Part[]; onApply: (s: Sorting) => void }) {
  const saved = project.sorting ?? DEFAULT_SORTING;
  const [draft, setDraft] = useState<Sorting>(saved);
  const [partText, setPartText] = useState('');
  const [groupText, setGroupText] = useState('');
  const changed = !same(draft, saved);
  const categories = catalog?.categories ?? {};
  const tree = useMemo(() => buildTree(parts, categories, project.settings.volumeScale, {}, draft), [parts, categories, project.settings.volumeScale, draft]);
  const names = useMemo(() => groupNames(tree), [tree]);
  const byNum = useMemo(() => new Map(parts.map((p) => [p.partNum, p])), [parts]);
  const trial = useMemo(() => ({ ...project, sorting: draft }), [project, draft]);

  const setLevel = (i: number, lens: Lens | '') => {
    const levels = draft.levels.slice(0, i);
    if (lens) levels.push(lens);
    // Later levels stay, as long as they don't repeat one above
    for (const l of draft.levels.slice(i + 1)) if (lens && !levels.includes(l)) levels.push(l);
    setDraft({ ...draft, levels: levels.length ? levels : ['catalogue'] });
  };
  const found = (() => {
    const t = partText.trim();
    if (!t) return null;
    const num = baseMould(t.split(/\s+/)[0], catalog);
    return byNum.get(num) ?? byNum.get(t.split(/\s+/)[0]) ?? null;
  })();
  const addOwn = () => {
    if (!found || !groupText.trim()) return;
    setDraft({ ...draft, parts: { ...(draft.parts ?? {}), [found.partNum]: groupText.trim() } });
    setPartText('');
  };
  const removeOwn = (num: string) => {
    const rest = { ...(draft.parts ?? {}) };
    delete rest[num];
    setDraft({ ...draft, parts: rest });
  };
  const own = Object.entries(draft.parts ?? {});

  return (
    <div className="sorting">
      <p className="muted small">
        How parts are grouped when the app suggests where they go. Pick a way of grouping for each level: with Looks like then Catalogue, a 1×1 round plate and a 1×1 round tile both go in “Round 1×1”, each in its own part of it. Nothing changes until you press Use this sorting, and you can see what would happen first.
      </p>
      <div className="row">
        {PRESETS.map((p) => (
          <button key={p.label} className={`ghost ${draft.levels.join() === p.levels.join() ? 'on' : ''}`} onClick={() => setDraft({ ...draft, levels: p.levels })}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="sorting-levels">
        {[0, 1, 2].map((i) => {
          if (i > draft.levels.length) return null;
          const options = LENSES.filter((l) => !draft.levels.slice(0, i).includes(l.k));
          if (!options.length) return null;
          const value = draft.levels[i] ?? '';
          return (
            <label key={i} className="sorting-level">
              <span>{i === 0 ? 'First by' : 'Then by'}</span>
              <select value={value} onChange={(e) => setLevel(i, e.target.value as Lens | '')}>
                {i > 0 && <option value="">Nothing more</option>}
                {options.map((l) => (
                  <option key={l.k} value={l.k}>
                    {l.label}
                  </option>
                ))}
              </select>
              <small className="muted">{LENSES.find((l) => l.k === value)?.hint ?? ''}</small>
            </label>
          );
        })}
      </div>

      <h4>Parts you’ve put in a group yourself</h4>
      <p className="muted small">When the app gets a part wrong, put it in the group you’d look for it in: one of the groups below, or a new name of your own, which makes a group of its own.</p>
      {own.length > 0 && (
        <ul className="sorting-own">
          {own.map(([num, g]) => (
            <li key={num}>
              {byNum.has(num) ? plainName(byNum.get(num)!.name, num) : num} <span className="muted">→</span> <b>{g}</b>{' '}
              <button className="link small danger" onClick={() => removeOwn(num)}>
                Take out
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row sorting-add">
        <input list="sorting-parts" placeholder="Part number or name" value={partText} onChange={(e) => setPartText(e.target.value)} aria-label="Part" />
        <datalist id="sorting-parts">
          {parts.slice(0, 3000).map((p) => (
            <option key={p.partNum} value={`${p.partNum} ${plainName(p.name, p.partNum)}`} />
          ))}
        </datalist>
        <input list="sorting-groups" placeholder="Group" value={groupText} onChange={(e) => setGroupText(e.target.value)} aria-label="Group" />
        <datalist id="sorting-groups">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button className="ghost" disabled={!found || !groupText.trim()} onClick={addOwn}>
          Put it there
        </button>
        {partText.trim() && !found && <small className="muted">Not a part in your collection</small>}
      </div>

      <details className="sorting-groups">
        <summary>
          The groups this makes: {tree.children.length} at the top, {names.length} in all
        </summary>
        <ul>
          {tree.children.map((g) => (
            <li key={g.id}>
              <b>{g.label}</b> <span className="muted small">· {g.pieces.toLocaleString()} pieces</span>
              {g.children.some((c) => !c.part) && (
                <span className="muted small">
                  {' '}
                  ·{' '}
                  {g.children
                    .filter((c) => !c.part)
                    .map((c) => c.label)
                    .join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>

      {changed && (
        <>
          <WhatIf now={project} after={trial} catalog={catalog} title="What this sorting would change" />
          <div className="row">
            <button onClick={() => onApply(draft)}>Use this sorting</button>
            <button className="ghost" onClick={() => setDraft(saved)}>
              Keep what I have
            </button>
          </div>
        </>
      )}
    </div>
  );
}
