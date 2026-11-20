// Shown on Put away & move when a search is typed: where a part is if it isn't in the list (in a drawer, kept out,
// all in sets kept built), and a way to add it, straight into a drawer if you like, when you don't have it at all.
import { useState } from 'react';
import type { KeptReason } from '../../lib/keepOut';
import type { Spot } from '../../lib/move';
import type { Part } from '../../lib/types';
import PartImage from '../PartImage';
import type { Elsewhere } from './find';
import PlacePicker from './PlacePicker';
import type { PlaceOption } from './places';

export interface NewPart {
  partNum: string;
  name?: string;
  catId?: number;
  qty: number;
  colour?: string;
}

interface Props {
  query: string;
  found: Elsewhere;
  /** true when the search also matches parts in the list */
  listHasMatches: boolean;
  codeOf: (spot: Spot) => string;
  onOpen: (key: string) => void;
  places: (forParts: Part[]) => PlaceOption[];
  /** the part as the planner would see it, for choosing a drawer beside similar parts */
  partFor: (p: NewPart) => Part;
  onKeepIn: (part: Part, to?: Spot) => void;
  onAdd: (p: NewPart, to?: Spot) => void;
  categories: [string, string][];
  colours: string[];
}

const WHY: Record<KeptReason, string> = { family: 'its family is kept out of storage', bulky: 'kept out as a bulky part', picked: 'kept out by hand' };

export default function NotInList({ query, found, listHasMatches, codeOf, onOpen, places, partFor, onKeepIn, onAdd, categories, colours }: Props) {
  const [qty, setQty] = useState('1');
  const [colour, setColour] = useState('');
  const [own, setOwn] = useState<{ name: string; catId: string } | null>(null);
  const n = Math.max(1, Math.round(Number(qty) || 1));
  const anything = found.inDrawers.length + found.kept.length + found.built.length > 0;
  const nothingOwned = !anything && !listHasMatches;
  if (query.trim().length < 2 || (!anything && listHasMatches)) return null;

  const extra = (p: { partNum: string; name?: string; catId?: number }): NewPart => ({ ...p, qty: n, ...(colour.trim() ? { colour: colour.trim() } : {}) });
  const amount = (
    <span className="not-in-amount">
      <label className="small">
        How many <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="extra-qty" />
      </label>
      <label className="small">
        Colour <input list="not-in-colours" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="optional" className="extra-colour" />
      </label>
      <datalist id="not-in-colours">
        {colours.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </span>
  );
  const addButtons = (p: NewPart, label: string) => (
    <span className="not-in-actions">
      <button className="ghost small-btn" onClick={() => onAdd(p)}>
        Add to the list
      </button>
      <PlacePicker label="Add and put in…" title={`Add ${label} and put it in…`} options={() => places([partFor(p)])} onPick={(o) => onAdd(p, { key: o.key, pocket: o.pocket })} />
    </span>
  );

  return (
    <div className="not-in card-inset">
      {found.inDrawers.map(({ part, spots }) => (
        <div key={part.partNum} className="not-in-row">
          <PartImage partNum={part.partNum} size={40} title={part.name} />
          <span className="not-in-what">
            {part.name} <small className="muted mono">{part.partNum}</small>
            <small className="not-in-why">Already in {spots.map(codeOf).join(', ')}</small>
          </span>
          <button className="ghost small-btn" onClick={() => onOpen(spots[0].key)}>
            Open {codeOf(spots[0])}
          </button>
        </div>
      ))}
      {found.kept.map(({ part, reason }) => (
        <div key={part.partNum} className="not-in-row">
          <PartImage partNum={part.partNum} size={40} title={part.name} />
          <span className="not-in-what">
            {part.name} <small className="muted mono">{part.partNum}</small>
            <small className="not-in-why">
              {part.qty === 1 ? "1 piece" : `${part.qty.toLocaleString()} pieces`}, not in this list because it’s {WHY[reason]}
            </small>
          </span>
          <span className="not-in-actions">
            <button className="ghost small-btn" onClick={() => onKeepIn(part)}>
              Store it in a drawer
            </button>
            <PlacePicker label="Put in…" title={`Store ${part.name} in…`} options={() => places([part])} onPick={(o) => onKeepIn(part, { key: o.key, pocket: o.pocket })} />
          </span>
        </div>
      ))}
      {found.built.map((part) => (
        <div key={part.partNum} className="not-in-row">
          <PartImage partNum={part.partNum} size={40} title={part.name} />
          <span className="not-in-what">
            {part.name} <small className="muted mono">{part.partNum}</small>
            <small className="not-in-why">All {part.qty.toLocaleString()} are in sets kept built, so none need a drawer. Untick a set on Sets kept built to put them back.</small>
          </span>
        </div>
      ))}
      {nothingOwned && (
        <>
          <p className="small not-in-head">
            <b>Not in your collection.</b> Add it here, and put it straight in a drawer if you like.
          </p>
          {amount}
          {found.catalog.map((c) => (
            <div key={c.partNum} className="not-in-row">
              <PartImage partNum={c.partNum} size={40} title={c.name} />
              <span className="not-in-what">
                {c.name} <small className="muted mono">{c.partNum}</small>
              </span>
              {addButtons(extra(c), c.name)}
            </div>
          ))}
          {own ? (
            <div className="not-in-own">
              <label className="small">
                Name <input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} className="extra-name" />
              </label>
              <label className="small">
                Most like{' '}
                <select value={own.catId} onChange={(e) => setOwn({ ...own, catId: e.target.value })}>
                  <option value="">choose a kind of part…</option>
                  {categories.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {own.name.trim() && addButtons(extra({ partNum: '', name: own.name.trim(), ...(own.catId ? { catId: Number(own.catId) } : {}) }), own.name.trim())}
            </div>
          ) : (
            <p className="small">
              {found.catalog.length ? 'Not one of these? ' : 'Rebrickable doesn’t list anything like that. '}
              <button className="link small" onClick={() => setOwn({ name: /^[\w-]+$/.test(query.trim()) && /\d/.test(query) ? '' : query.trim(), catId: '' })}>
                Add it as a part of your own
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
