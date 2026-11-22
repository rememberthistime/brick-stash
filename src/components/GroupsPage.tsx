// Groups: the master list of every group the sorting makes, as a tree you open level by level (kind, then small, long
// or large, then exact size), with how many part types and pieces each holds, which drawers they're in, and each part's
// colours, the last thing you'd look for. Another way of grouping can be looked at here before it's used.
import { useMemo, useState } from 'react';
import { buildTree, leaves, type TreeNode } from '../lib/planner';
import { colourStock } from '../lib/colours';
import { collectionRows } from '../lib/collection';
import { DEFAULT_SORTING, type Catalog, type Lens, type Part, type Project, type Sorting } from '../lib/types';
import { SORTING_PRESETS, presetLabel } from './SortingSettings';
import PartImage from './PartImage';
import PartName from './PartName';
import WhatIf from './WhatIf';

const SHOWN_PARTS = 60;

export default function GroupsPage({
  project,
  catalog,
  parts,
  whereIs,
  apply,
}: {
  project: Project;
  catalog: Catalog | null;
  parts: Part[];
  whereIs: Map<string, string[]>;
  apply: (s: Sorting) => void;
}) {
  const saved = project.sorting ?? DEFAULT_SORTING;
  const [levels, setLevels] = useState<Lens[]>(saved.levels);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const sorting = useMemo<Sorting>(() => ({ ...saved, levels }), [saved, levels]);
  const previewing = levels.join() !== saved.levels.join();
  const tree = useMemo(() => buildTree(parts, catalog?.categories ?? {}, project.settings.volumeScale, {}, sorting), [parts, catalog, project.settings.volumeScale, sorting]);
  const colours = useMemo(
    () =>
      colourStock(
        collectionRows(project),
        project.excluded.filter((e) => e.enabled).flatMap((e) => e.rows),
        catalog,
        project.colours,
      ),
    [project, catalog],
  );
  const q = query.trim().toLowerCase();
  // With a search, only groups whose name matches or that hold a matching part, opened to show it
  const matches = useMemo(() => {
    if (!q) return null;
    const keep = new Set<string>();
    const walk = (n: TreeNode): boolean => {
      const hit = n.label.toLowerCase().includes(q) || (!!n.part && (n.part.partNum.toLowerCase() === q || n.part.name.toLowerCase().includes(q)));
      let any = hit;
      for (const c of n.children) if (walk(c)) any = true;
      if (any) keep.add(n.id);
      return any;
    };
    walk(tree);
    return keep;
  }, [q, tree]);
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const groupsUnder = (n: TreeNode): TreeNode[] => n.children.filter((c) => !c.part);
  const allIds = useMemo(() => {
    const out: string[] = [];
    const walk = (n: TreeNode) => groupsUnder(n).forEach((c) => (out.push(c.id), walk(c)));
    walk(tree);
    return out;
  }, [tree]);

  const ctx: Ctx = { matches, open, toggle, colours, whereIs };

  return (
    <div className="groups-page">
      <section className="card">
        <div className="row">
          <label className="small">
            Grouped by{' '}
            <select
              value={SORTING_PRESETS.find((p) => p.levels.join() === levels.join()) ? levels.join() : 'own'}
              onChange={(e) => e.target.value !== 'own' && setLevels(e.target.value.split(',') as Lens[])}
            >
              {SORTING_PRESETS.map((p) => (
                <option key={p.label} value={p.levels.join()}>
                  {p.label}
                </option>
              ))}
              {!SORTING_PRESETS.some((p) => p.levels.join() === levels.join()) && <option value="own">{presetLabel(levels)}</option>}
            </select>
          </label>
          <input className="groups-search" placeholder="Find a group or part" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="ghost" onClick={() => setOpen(new Set(allIds))}>
            Open all
          </button>
          <button className="ghost" onClick={() => setOpen(new Set())}>
            Close all
          </button>
        </div>
        <p className="muted small">
          {tree.children.length} groups at the top, {allIds.length} in all. Open a group for the groups inside it, down to single parts with their colours and drawers. Click a part’s group tag to move
          it to another group.
        </p>
        {previewing && (
          <div className="banner warn">
            <div className="row">
              <span>
                This is how <b>{presetLabel(levels)}</b> would group your parts. You still use <b>{presetLabel(saved.levels)}</b>.
              </span>
              <button onClick={() => apply(sorting)}>Use this grouping</button>
              <button className="ghost" onClick={() => setCompare(!compare)}>
                {compare ? 'Hide what changes' : 'What would change'}
              </button>
              <button className="ghost" onClick={() => setLevels(saved.levels)}>
                Back to mine
              </button>
            </div>
            {compare && <WhatIf now={project} after={{ ...project, sorting }} catalog={catalog} title="What this grouping would change" />}
          </div>
        )}
      </section>
      <ul className="group-list top">
        {tree.children
          .filter((c) => !matches || matches.has(c.id))
          .map((c) =>
            c.part ? (
              <li key={c.id}>
                <PartRows list={[c]} ctx={ctx} />
              </li>
            ) : (
              <Node key={c.id} n={c} depth={0} ctx={ctx} />
            ),
          )}
      </ul>
    </div>
  );
}

interface Ctx {
  matches: Set<string> | null;
  open: Set<string>;
  toggle: (id: string) => void;
  colours: Map<string, Map<string, number>>;
  whereIs: Map<string, string[]>;
}

const drawersOf = (n: TreeNode, whereIs: Map<string, string[]>) =>
  [...new Set(leaves(n).flatMap((l) => (l.part ? (whereIs.get(l.part.partNum) ?? []) : [])))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const typesOf = (n: TreeNode) => leaves(n).filter((l) => l.part).length;

function Node({ n, depth, ctx }: { n: TreeNode; depth: number; ctx: Ctx }) {
  const { matches, open, toggle, whereIs } = ctx;
  const isOpen = matches ? matches.has(n.id) : open.has(n.id);
  const drawers = drawersOf(n, whereIs);
  const kids = n.children.filter((c) => !matches || matches.has(c.id));
  const subgroups = kids.filter((c) => !c.part);
  const partsHere = kids.filter((c) => c.part);
  return (
    <li className={`group-node depth-${depth}`}>
      <button className="group-head" aria-expanded={isOpen} onClick={() => toggle(n.id)}>
        <span className="group-caret">{isOpen ? '▾' : '▸'}</span>
        <span className={`swatch fam-${n.familyKey}`} />
        <b>{n.label}</b>
        <span className="muted small">
          {typesOf(n).toLocaleString()} part type{typesOf(n) === 1 ? '' : 's'} · {n.pieces.toLocaleString()} pcs
          {drawers.length ? ` · in ${drawers.slice(0, 6).join(', ')}${drawers.length > 6 ? ` +${drawers.length - 6}` : ''}` : ' · not in a drawer'}
        </span>
      </button>
      {isOpen && (
        <>
          {subgroups.length > 0 && (
            <ul className="group-list">
              {subgroups.map((c) => (
                <Node key={c.id} n={c} depth={depth + 1} ctx={ctx} />
              ))}
            </ul>
          )}
          {partsHere.length > 0 && <PartRows list={partsHere} ctx={ctx} />}
        </>
      )}
    </li>
  );
}

function PartRows({ list, ctx }: { list: TreeNode[]; ctx: Ctx }) {
  const { colours, whereIs } = ctx;
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, SHOWN_PARTS);
  return (
    <table className="group-parts">
      <tbody>
        {shown.map((l) => {
          const p = l.part!;
          const cs = [...(colours.get(p.partNum) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
          const where = whereIs.get(p.partNum) ?? [];
          return (
            <tr key={l.id}>
              <td className="part-img-cell">
                <PartImage partNum={p.partNum} title={p.name} />
              </td>
              <td>
                <PartName part={p} /> <small className="muted mono">{p.partNum}</small>
              </td>
              <td className="num">{p.qty.toLocaleString()}</td>
              <td className="small">
                {cs.length ? (
                  <>
                    {cs
                      .slice(0, 4)
                      .map(([c, n]) => `${c} ${n}`)
                      .join(' · ')}
                    {cs.length > 4 && <span className="muted"> · +{cs.length - 4} colours</span>}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="small mono">{where.length ? where.join(', ') : <span className="muted">not in a drawer</span>}</td>
            </tr>
          );
        })}
        {list.length > SHOWN_PARTS && (
          <tr>
            <td colSpan={5}>
              <button className="link small" onClick={() => setAll(!all)}>
                {all ? 'Fewer' : `All ${list.length}`}
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
