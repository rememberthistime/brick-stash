import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LabelEntry } from '../lib/labels';
import { sameOriginPartImages } from '../lib/partImages';
import { joinLabels, makeLbx, renderLabel, stripGroups, type RenderedLabel } from '../lib/tapeLabel';
import { makeZip } from '../lib/zip';
import { download } from '../state';

const CONCURRENT = 4;
/** Tape is printed at 180 dots an inch */
const DOTS_PER_CM = 180 / 2.54;
const STRIP_LENGTHS = [50, 100, 200];
const MAX_LINKS = 6;

const images = new Map<string, Promise<HTMLImageElement | null>>();

/** The first picture of a part that loads, kept for the next label that needs it */
function loadImage(partNum: string) {
  let found = images.get(partNum);
  if (!found) {
    found = (async () => {
      for (const src of sameOriginPartImages(partNum)) {
        const image = await new Promise<HTMLImageElement | null>((done) => {
          const i = new Image();
          i.onload = () => done(i);
          i.onerror = () => done(null);
          i.src = src;
        });
        if (image) return image;
      }
      return null;
    })();
    images.set(partNum, found);
  }
  return found;
}

export default function TapeLabels({ entries, showSheet, options }: { entries: LabelEntry[]; showSheet: () => void; options?: ReactNode }) {
  const kinds = useMemo(() => [...new Set(entries.map((e) => e.kind))], [entries]);
  const [kind, setKind] = useState('');
  const [labels, setLabels] = useState<Record<string, RenderedLabel>>({});
  const [busy, setBusy] = useState('');
  const [stripCm, setStripCm] = useState(100);

  useEffect(() => {
    let stopped = false;
    setLabels({});
    const queue = [...entries];
    const worker = async () => {
      while (queue.length && !stopped) {
        const e = queue.shift()!;
        const label = await renderLabel({ code: e.code, cells: e.cells }, loadImage);
        if (!stopped) setLabels((all) => ({ ...all, [e.code]: label }));
      }
    };
    for (let i = 0; i < CONCURRENT; i++) void worker();
    return () => {
      stopped = true;
    };
  }, [entries]);

  const shown = entries.filter((e) => !kind || e.kind === kind);
  const ready = shown.filter((e) => labels[e.code]);

  const downloadAll = async (format: 'lbx' | 'png') => {
    setBusy(`Packing ${ready.length} labels…`);
    const files = await Promise.all(ready.map(async (e) => ({ name: `${e.code}.${format}`, data: format === 'png' ? labels[e.code].png : await makeLbx(labels[e.code]) })));
    download(`brick-stash-labels-${format}.zip`, await makeZip(files), 'application/zip');
    setBusy('');
  };
  /** Every label end to end, with cut lines between, split into strips no longer than the length chosen */
  const downloadStrip = async (format: 'lbx' | 'png') => {
    setBusy(`Joining ${ready.length} labels…`);
    const groups = stripGroups(
      ready.map((e) => labels[e.code].width),
      Math.round(stripCm * DOTS_PER_CM),
    );
    const strips = await Promise.all(groups.map((g) => joinLabels(g.map((i) => labels[ready[i].code]))));
    const name = (i: number) => `brick-stash-strip${strips.length > 1 ? `-${i + 1}-of-${strips.length}` : ''}-${ready[groups[i][0]].code}-to-${ready[groups[i][groups[i].length - 1]].code}`;
    const files = await Promise.all(strips.map(async (s, i) => ({ name: `${name(i)}.${format}`, data: format === 'png' ? s.png : await makeLbx(s) })));
    if (files.length === 1) download(files[0].name, files[0].data, format === 'png' ? 'image/png' : 'application/octet-stream');
    else download(`brick-stash-strips-${format}.zip`, await makeZip(files), 'application/zip');
    setBusy('');
  };
  const stripLength = ready.reduce((t, e) => t + labels[e.code].width, 0) / DOTS_PER_CM;

  const downloadOne = async (e: LabelEntry, format: 'lbx' | 'png') =>
    download(`${e.code}.${format}`, format === 'png' ? labels[e.code].png : await makeLbx(labels[e.code]), format === 'png' ? 'image/png' : 'application/octet-stream');

  return (
    <div className="labels-view">
      <div className="row no-print">
        <button className="ghost" onClick={showSheet}>
          Sheet labels instead
        </button>
        {options}
      </div>
      <section className="card">
        <h2>Labels for Brother P-touch printers</h2>
        <p className="muted">
          For <b>12 mm tape</b>, showing the location and each section in order. The <b>.lbx</b> files open directly in P-touch Editor; the PNGs can be placed in it or any other label software.
          Print with Quality set to Standard and Graphics set to Error Diffusion.
        </p>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All storage ({entries.length} labels)</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button disabled={!ready.length || !!busy} onClick={() => downloadAll('lbx')}>
            Download .lbx files
          </button>
          <button className="ghost" disabled={!ready.length || !!busy} onClick={() => downloadAll('png')}>
            Download PNGs
          </button>
          <span className="muted small">{busy || (ready.length < shown.length ? `Drawing ${ready.length} of ${shown.length}…` : `${ready.length} ready`)}</span>
        </div>
        <div className="tape-strip">
          <b>One long strip</b>
          <span className="muted small">
            Every label above end to end, in order, each starting with its drawer code and with a dotted line to cut along between them. About {Math.round(stripLength / 10) / 10} m of tape.
          </span>
          <div className="row">
            <label className="small">
              Split into lengths of{' '}
              <select value={stripCm} onChange={(e) => setStripCm(Number(e.target.value))}>
                {STRIP_LENGTHS.map((cm) => (
                  <option key={cm} value={cm}>
                    up to {cm < 100 ? `${cm} cm` : `${cm / 100} m`}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!ready.length || ready.length < shown.length || !!busy} onClick={() => downloadStrip('lbx')}>
              Download the strip (.lbx)
            </button>
            <button className="ghost" disabled={!ready.length || ready.length < shown.length || !!busy} onClick={() => downloadStrip('png')}>
              PNG
            </button>
          </div>
        </div>
        <p className="muted small">
          Prefer Brick Architect's own labels for single parts? Their artwork is theirs to share, so it can't be built into these, but each label below links to their page for that part, where you
          can print it. Their part numbers occasionally differ from Rebrickable's.
        </p>
      </section>

      {!entries.length && <p className="muted">Nothing to label yet.</p>}
      <div className="tape-list">
        {shown.map((e) => {
          const label = labels[e.code];
          return (
            <div key={e.code} className="tape-row">
              <div className="tape-head">
                <span className="code">{e.code}</span>
                {e.name && <span className="small place-name">{e.name}</span>}
                <span className="muted small tape-where">{e.where}</span>
                {label && (
                  <>
                    <button className="link small" onClick={() => downloadOne(e, 'lbx')}>
                      .lbx
                    </button>
                    <button className="link small" onClick={() => downloadOne(e, 'png')}>
                      PNG
                    </button>
                  </>
                )}
              </div>
              {label ? <img className="tape-preview" src={label.dataUrl} alt={`Label for ${e.code}`} style={{ width: label.width * 1.25 }} /> : <div className="tape-preview pending" />}
              {e.links.length > 0 && (
                <div className="tape-links small muted">
                  Brick Architect:{' '}
                  {e.links.slice(0, MAX_LINKS).map((p) => (
                    <a key={p.partNum} href={`https://brickarchitect.com/parts/${encodeURIComponent(p.partNum)}`} target="_blank" rel="noreferrer" title={p.name}>
                      {p.partNum}
                    </a>
                  ))}
                  {e.links.length > MAX_LINKS && ` +${e.links.length - MAX_LINKS}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
