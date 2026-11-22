// The frame every page sits in: a sidebar listing the jobs the app does, grouped, with a count beside each, and a
// headline at the top of each page saying where things stand. Each page is its own address (#/put-away), so the
// browser's back button and bookmarks work.
import { useEffect, useState, type ReactNode } from 'react';

export type Page = 'import' | 'parts' | 'groups' | 'built' | 'kept' | 'units' | 'spaces' | 'drawers' | 'put-away' | 'todo' | 'moves' | 'tidy' | 'review' | 'labels' | 'map' | 'pick' | 'export' | 'settings' | 'project';

/** The pages, grouped. A page `under` another is reached from that page's tabs, not listed in the sidebar itself. */
export const NAV: { group: string; pages: { id: Page; label: string; under?: Page }[] }[] = [
  // The pages used most come first: putting parts away and moving them, then the drawers themselves
  {
    group: 'Sort',
    pages: [
      { id: 'put-away', label: 'Put away & move' },
      { id: 'todo', label: 'Moves to make' },
      { id: 'moves', label: 'Suggestions' },
      { id: 'tidy', label: 'Tidy the layout', under: 'moves' },
      { id: 'review', label: 'Review', under: 'moves' },
    ],
  },
  {
    group: 'Storage',
    pages: [
      { id: 'drawers', label: 'Drawers' },
      { id: 'units', label: 'Units' },
      { id: 'spaces', label: 'Spaces' },
    ],
  },
  {
    group: 'Print & lists',
    pages: [
      { id: 'labels', label: 'Labels' },
      { id: 'map', label: 'Storage map' },
      { id: 'pick', label: 'Pick list' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    group: 'Collection',
    pages: [
      { id: 'parts', label: 'Parts' },
      { id: 'groups', label: 'Groups' },
      { id: 'import', label: 'Import' },
      { id: 'built', label: 'Sets kept built' },
      { id: 'kept', label: 'Kept out' },
    ],
  },
  {
    group: 'Settings',
    pages: [
      { id: 'settings', label: 'Settings' },
      { id: 'project', label: 'Project & versions' },
    ],
  },
];

const PAGES = new Set<string>(NAV.flatMap((g) => g.pages.map((p) => p.id)));
const fromHash = (): Page | null => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return PAGES.has(h) ? (h as Page) : null;
};

/** The page in the address. With none, Import until there's a project, then Put away, the page most visits are for. */
export function usePage(ready: boolean): [Page, (p: Page) => void] {
  const [page, setPageState] = useState<Page | null>(fromHash);
  useEffect(() => {
    const onHash = () => setPageState(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setPage = (p: Page) => {
    window.location.hash = `/${p}`;
    setPageState(p);
    window.scrollTo(0, 0);
  };
  return [page ?? (ready ? 'put-away' : 'import'), setPage];
}

export function Sidebar({ page, setPage, counts, open, setOpen }: { page: Page; setPage: (p: Page) => void; counts: Partial<Record<Page, ReactNode>>; open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <nav className={`sidebar no-print ${open ? 'open' : ''}`} aria-label="Pages">
      {NAV.map((g) => (
        <div key={g.group} className="nav-group">
          <div className="nav-label">{g.group}</div>
          {g.pages.filter((p) => !p.under).map((p) => {
            const here = page === p.id || g.pages.some((x) => x.under === p.id && x.id === page);
            return (
            <button
              key={p.id}
              className={`nav-item ${here ? 'active' : ''}`}
              aria-current={here ? 'page' : undefined}
              onClick={() => {
                setPage(p.id);
                setOpen(false);
              }}
            >
              <span>{p.label}</span>
              {counts[p.id] !== undefined && counts[p.id] !== '' && <span className="nav-count">{counts[p.id]}</span>}
            </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export const pageLabel = (p: Page) => NAV.flatMap((g) => g.pages.map((x) => ({ ...x, group: g.group }))).find((x) => x.id === p)!;

/** A page's name, then one sentence on where things stand, then a line on what the page is for */
export function PageHead({ page, headline, children }: { page: Page; headline: ReactNode; children?: ReactNode }) {
  const { group, label, under } = pageLabel(page);
  const parent = under ? pageLabel(under).label : null;
  return (
    <header className="page-head no-print">
      <div className="page-kicker">
        {parent ?? group} · {label}
      </div>
      <h2 className="page-headline">{headline}</h2>
      {children && <div className="page-sub">{children}</div>}
    </header>
  );
}
