import { useState, type ReactNode } from 'react';

const STORE = 'brick-stash-folds';

function read(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
}

/** Which folds are open, remembered in this browser */
export function useFolds() {
  const [state, setState] = useState<Record<string, boolean>>(read);
  const save = (next: Record<string, boolean>) => {
    setState(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* ignore: only a convenience */
    }
  };
  return {
    isOpen: (id: string, byDefault = false) => state[id] ?? byDefault,
    toggle: (id: string, byDefault = false) => save({ ...state, [id]: !(state[id] ?? byDefault) }),
    setAll: (ids: string[], open: boolean) => save({ ...state, ...Object.fromEntries(ids.map((id) => [id, open])) }),
  };
}

export type Folds = ReturnType<typeof useFolds>;

interface Props {
  id: string;
  folds: Folds;
  title: ReactNode;
  /** shown beside the title, open or closed */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** open regardless, e.g. because it holds a search result */
  force?: boolean;
  /** a fold inside another fold, without its own card */
  inner?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Fold({ id, folds, title, summary, defaultOpen = false, force = false, inner = false, className = '', children }: Props) {
  const open = force || folds.isOpen(id, defaultOpen);
  return (
    <section className={`${inner ? 'fold-inner' : 'card'} fold ${open ? 'open' : ''} ${className}`}>
      <button className="fold-head" aria-expanded={open} onClick={() => folds.toggle(id, defaultOpen)}>
        <span className="fold-caret">{open ? '▾' : '▸'}</span>
        <span className="fold-title">{title}</span>
        {summary && <span className="fold-summary muted small">{summary}</span>}
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}
