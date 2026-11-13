// Labels to print, as Brother tape labels or a sheet of sticky labels, from whatever list of labels it's given.
import { useState, type ReactNode } from 'react';
import type { LabelEntry } from '../lib/labels';
import PartImage from './PartImage';
import TapeLabels from './TapeLabels';

export default function Labels({ entries, close, backLabel, note, options }: { entries: LabelEntry[]; close: () => void; backLabel: string; note?: ReactNode; options?: ReactNode }) {
  const [pictures, setPictures] = useState(true);
  const [tape, setTape] = useState(true);
  if (tape) return <TapeLabels entries={entries} close={close} backLabel={backLabel} showSheet={() => setTape(false)} options={options} />;
  return (
    <div className="labels-view">
      <div className="row no-print">
        <button onClick={() => window.print()}>Print</button>
        <button className="ghost" onClick={close}>
          {backLabel}
        </button>
        <button className="ghost" onClick={() => setTape(true)}>
          Brother tape labels
        </button>
        <label>
          <input type="checkbox" checked={pictures} onChange={(e) => setPictures(e.target.checked)} /> Pictures
        </label>
        {options}
        <span className="muted small">
          {note} For more polished picture labels, <a href="https://brickarchitect.com/labels/" target="_blank" rel="noreferrer">Brick Architect</a> publishes a well-known set keyed by part number.
        </span>
      </div>
      {!entries.length && <p className="muted">Nothing to label yet.</p>}
      <div className="labels">
        {entries.flatMap((e) =>
          e.cells.map((cell, i) => (
            <div key={`${e.code}-${i}`} className={`label ${cell.family ? `fam-border-${cell.family}` : ''}`}>
              <div className="label-code">
                {e.code}
                {e.cells.length > 1 ? `.${i + 1}` : ''}
                {e.name && <span className="label-name"> {e.name}</span>}
              </div>
              <div className="label-main">
                {pictures && cell.images.length > 0 && (
                  <span className="label-imgs">
                    {cell.images.map((p) => (
                      <PartImage key={p} partNum={p} size={40} />
                    ))}
                  </span>
                )}
                <div className="label-title">{cell.sheetTitle ?? cell.title}</div>
              </div>
              <div className="label-parts">
                {cell.parts.slice(0, 6).join(' · ')}
                {cell.parts.length > 6 ? ` +${cell.parts.length - 6}` : ''}
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
