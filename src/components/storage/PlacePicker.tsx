// "Move to…": a button that opens a short list of places, the ones beside similar parts first, narrowed by typing a
// drawer code ("A3", "a3.2") or any word of its name ("technic"). Enter takes the first, arrows choose, Esc closes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterPlaces, type PlaceOption } from './places';

const SHOWN = 40;

export default function PlacePicker({
  label,
  title,
  className = 'ghost small-btn',
  options,
  onPick,
  exclude,
  disabled,
}: {
  /** the button's words, e.g. "Move to…" */
  label: string;
  /** a heading for the list, e.g. "Move Plate 1 x 6 to…" */
  title: string;
  className?: string;
  /** made only when it opens, as a page may have one picker per part */
  options: () => PlaceOption[];
  onPick: (o: PlaceOption) => void;
  /** where the parts are now, left out of the list */
  exclude?: { key: string; pocket?: number };
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="place-picker">
      <button className={className} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={(e) => (e.stopPropagation(), setOpen(!open))}>
        {label}
      </button>
      {open && (
        <PickerList
          title={title}
          options={options}
          exclude={exclude}
          onClose={() => setOpen(false)}
          onPick={(o) => {
            setOpen(false);
            onPick(o);
          }}
        />
      )}
    </span>
  );
}

function PickerList({ title, options, exclude, onClose, onPick }: { title: string; options: () => PlaceOption[]; exclude?: { key: string; pocket?: number }; onClose: () => void; onPick: (o: PlaceOption) => void }) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const all = useMemo(() => options().filter((o) => !exclude || o.key !== exclude.key || (exclude.pocket !== undefined && o.pocket !== exclude.pocket)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = filterPlaces(all, query);
  const similar = !query && shown.some((o) => o.similar);
  useEffect(() => {
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);
  useEffect(() => setAt(0), [query]);
  return (
    <div className="picker-pop" ref={box} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="picker-title small">{title}</div>
      <input
        autoFocus
        type="search"
        className="picker-search"
        placeholder="Type a drawer code or name, e.g. A3, technic"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.stopPropagation(), onClose());
          if (e.key === 'ArrowDown') (e.preventDefault(), setAt(Math.min(at + 1, Math.min(shown.length, SHOWN) - 1)));
          if (e.key === 'ArrowUp') (e.preventDefault(), setAt(Math.max(at - 1, 0)));
          if (e.key === 'Enter' && shown[at]) (e.preventDefault(), onPick(shown[at]));
        }}
      />
      <ul className="picker-list" role="listbox">
        {shown.slice(0, SHOWN).map((o, i) => (
          <li key={`${o.key}|${o.pocket}`}>
            {similar && i === 0 && <div className="picker-sub small muted">Beside similar parts</div>}
            {similar && i > 0 && !o.similar && shown[i - 1].similar ? <div className="picker-sub small muted">Every drawer</div> : null}
            <button role="option" aria-selected={i === at} className={`picker-option ${i === at ? 'on' : ''}`} onMouseEnter={() => setAt(i)} onClick={() => onPick(o)}>
              <span className="picker-option-title">{o.title}</span>
              <span className="muted small">{o.detail}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="muted small picker-none">No drawer matches “{query}”.</li>}
        {shown.length > SHOWN && <li className="muted small picker-none">{shown.length - SHOWN} more: type to narrow.</li>}
      </ul>
    </div>
  );
}
