// The review page (/review): go through each box of a drawer read from photos and say which parts are right, which
// aren't there and what was missed. Made for the phone, and works on the computer too. It writes only reviews.json
// beside the photos, never the project, so it can't get in the way of whatever's open on another device.
import { placeName } from '../lib/codes';
import { expandCompartments } from '../lib/planner';
import ReadNow from './ReadNow';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeToParts } from '../lib/collection';
import { photoUrl, topPhotoOf, usePhotos, type Photo } from '../lib/photos';
import {
  addScores,
  confirmedParts,
  emptyScore,
  fetchDrafts,
  photoCode,
  photosIn,
  pocketKey,
  saveReview,
  scoreOf,
  searchCollection,
  unconfirmed,
  withPocket,
  withVerdict,
  type DrawerReview,
  type PocketReview,
  type Reviews,
  type Score,
  type Verdict,
} from '../lib/review';
import { setupComps, type DraftDrawer, type DraftPocket, type PhotoArea, type SetupDraft } from '../lib/setup';
import type { InventoryRow, Part, Settings, Setup, StorageUnit } from '../lib/types';
import { useCatalog } from '../state';
import PartImage from './PartImage';

const STORE = 'brick-stash-review';
const SAVE_AFTER = 700;
/** Boxes filled by type can list hundreds of parts; the rest wait behind a button */
const FIRST_PARTS = 12;
const DRAWER_CODE = /^[A-Z]+\d*$/;

const remembered = () => {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
};

function scoreText(s: Score) {
  const bits = [`${s.right} right`, `${s.wrong} not there`];
  if (s.unchecked) bits.push(`${s.unchecked} to check`);
  if (s.missed) bits.push(`${s.missed} added`);
  if (s.maybeYes + s.maybeNo + s.maybeOpen) bits.push(`maybes ${s.maybeYes} yes, ${s.maybeNo} no${s.maybeOpen ? `, ${s.maybeOpen} to answer` : ''}`);
  return bits.join(' · ');
}

interface PartInfo {
  name: string;
  qty?: number;
}

export default function Review() {
  const [drafts, setDrafts] = useState<SetupDraft | null>(null);
  const [reviews, setReviews] = useState<Reviews>({});
  const [error, setError] = useState('');
  const [code, setCode] = useState(remembered);
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'failed'>('');
  const { photos } = usePhotos(30000);
  const { catalog } = useCatalog();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const latest = useRef<Reviews>({});
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetchDrafts()
      .then(({ drafts, reviews }) => {
        setDrafts(drafts);
        setReviews(reviews);
        latest.current = reviews;
      })
      .catch((e) => setError(e instanceof TypeError ? 'Couldn’t reach the server.' : e.message));
    // Only for how many of each part there are, and searching; the review works without it
    fetch('/api/project?only=rows,units,settings,setup')
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((p: { rows?: InventoryRow[]; units?: StorageUnit[]; settings?: Settings; setup?: Setup }) => {
        setRows(p.rows ?? []);
        // The names the user has given drawers, to show beside their codes
        if (p.units && p.settings) setNames(new Map(setupComps(expandCompartments(p.units, p.settings), p.setup?.open).flatMap((c) => (placeName(c) ? [[c.code, placeName(c)] as const] : []))));
      })
      .catch(() => {
        /* no collection to search, but answers can still be given */
      });
  }, []);

  useEffect(() => {
    try {
      if (code) localStorage.setItem(STORE, code);
      else localStorage.removeItem(STORE);
    } catch {
      /* it only saves choosing the drawer again */
    }
  }, [code]);

  const parts = useMemo(() => mergeToParts(rows, catalog), [rows, catalog]);
  const info = useMemo(() => {
    const byNum = new Map(parts.map((p) => [p.partNum, p]));
    return (n: string): PartInfo => {
      const p = byNum.get(n);
      return p ? { name: p.name, qty: p.qty } : { name: catalog?.parts[n]?.[0] ?? '' };
    };
  }, [parts, catalog]);

  const flush = useCallback(async (keepalive = false) => {
    clearTimeout(timer.current);
    const codes = [...pending.current];
    pending.current.clear();
    for (const c of codes) {
      setSaveState('saving');
      try {
        await saveReview(c, latest.current[c], keepalive);
        setSaveState('saved');
      } catch {
        pending.current.add(c);
        setSaveState('failed');
      }
    }
  }, []);

  // A phone locked or switched away from mid-review still gets its answers saved
  useEffect(() => {
    const away = () => document.visibilityState === 'hidden' && pending.current.size && flush(true);
    document.addEventListener('visibilitychange', away);
    return () => document.removeEventListener('visibilitychange', away);
  }, [flush]);

  const change = (c: string, f: (r: DrawerReview) => DrawerReview) => {
    const next = { ...latest.current, [c]: f(latest.current[c] ?? { pockets: {} }) };
    latest.current = next;
    setReviews(next);
    pending.current.add(c);
    setSaveState('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), SAVE_AFTER);
  };

  if (error) {
    return (
      <div className="snap">
        <div className="banner error">{error}</div>
        <button className="snap-wide" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!drafts) return <div className="snap muted">Loading drafts…</div>;

  const index = drafts.drawers.findIndex((d) => d.code === code);
  const setClosed = (c: string, closed: boolean) => change(c, (r) => ({ ...r, closed: closed || undefined }));
  if (index < 0) return <DraftPicker drafts={drafts} reviews={reviews} names={names} onPick={setCode} onClosed={setClosed} />;
  const drawer = drafts.drawers[index];
  const step = (d: number) => setCode(drafts.drawers[(index + d + drafts.drawers.length) % drafts.drawers.length].code);

  return (
    <div className="snap review">
      <header className="snap-head">
        <button className="ghost snap-step" aria-label="Previous draft" onClick={() => step(-1)}>
          ‹
        </button>
        <button className="ghost snap-drawer" onClick={() => setCode(null)}>
          <span className="code">{reviews[drawer.code]?.code ?? drawer.code}</span>
          <span className="snap-drawer-name">
            {names.get(reviews[drawer.code]?.code ?? photoCode(drawer)) && <b>{names.get(reviews[drawer.code]?.code ?? photoCode(drawer))} · </b>}
            Checking the draft
          </span>
          <span className="muted small">All drafts</span>
        </button>
        <button className="ghost snap-step" aria-label="Next draft" onClick={() => step(1)}>
          ›
        </button>
      </header>
      <DrawerReviewView
        key={drawer.code}
        drawer={drawer}
        review={reviews[drawer.code]}
        photos={photos}
        info={info}
        parts={parts}
        onChange={(f) => change(drawer.code, f)}
      />
      <p className={`muted small review-saved ${saveState === 'failed' ? 'bad' : ''}`} aria-live="polite">
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Not saved: couldn’t reach the server. It will try again with your next answer.' : ''}
      </p>
    </div>
  );
}

function DraftPicker({ drafts, reviews, names, onPick, onClosed }: { drafts: SetupDraft; reviews: Reviews; names: ReadonlyMap<string, string>; onPick: (code: string) => void; onClosed: (code: string, closed: boolean) => void }) {
  const scores = drafts.drawers.map((d) => scoreOf(d, reviews[d.code]));
  const total = scores.reduce(addScores, emptyScore());
  const finished = drafts.drawers.filter((d) => reviews[d.code]?.closed);
  return (
    <div className="snap review">
      <h1 className="snap-title">Check drafts</h1>
      <p className="muted small">
        Drawers read from your photos. Go through each box and say what’s right, what isn’t there and what was missed. Your answers are saved as you go, and the checked version is what <b>Load checked drafts</b> on My setup brings in.
      </p>
      <ReadNow onRead={() => location.reload()} />
      {!drafts.drawers.length && <p className="muted">No drafts yet. They appear here once photos have been read.</p>}
      <div className="review-drafts">
        {drafts.drawers.map((d, i) => {
          const s = scores[i];
          const real = reviews[d.code]?.code;
          if (reviews[d.code]?.closed) return null;
          return (
            <div key={d.code} className="review-draft-row">
              <button className="ghost review-draft" aria-label={`${real ?? d.code}: ${s.checked} of ${s.boxes} boxes done`} onClick={() => onPick(d.code)}>
                <span className="code">{real ?? d.code}</span>
                {names.get(real ?? photoCode(d)) && <span className="small place-name">{names.get(real ?? photoCode(d))}</span>}
                {real && <span className="muted small">filed as {d.code}</span>}
                <span className="small">
                  {s.checked} of {s.boxes} boxes done
                </span>
                <span className={`review-bar ${s.checked === s.boxes ? 'full' : ''}`} style={{ ['--done' as string]: `${(s.checked / Math.max(1, s.boxes)) * 100}%` }} />
              </button>
              <button className="link small" title="Finished with this draft: nothing more to check, load or learn from. It can be reopened." onClick={() => onClosed(d.code, true)}>
                Finished
              </button>
            </div>
          );
        })}
      </div>
      {finished.length > 0 && (
        <details className="review-finished">
          <summary className="small">
            Finished with <span className="muted">{finished.length}</span>
          </summary>
          <p className="muted small">Nothing more to do on these. They aren’t loaded into My setup or learnt from.</p>
          {finished.map((d) => (
            <div key={d.code} className="review-draft-row">
              <button className="ghost review-draft" onClick={() => onPick(d.code)}>
                <span className="code">{reviews[d.code]?.code ?? d.code}</span>
                {names.get(reviews[d.code]?.code ?? photoCode(d)) && <span className="small place-name">{names.get(reviews[d.code]?.code ?? photoCode(d))}</span>}
                <span className="muted small">finished</span>
              </button>
              <button className="link small" onClick={() => onClosed(d.code, false)}>
                Reopen
              </button>
            </div>
          ))}
        </details>
      )}
      {total.right + total.wrong > 0 && <p className="muted small">So far: {scoreText(total)}.</p>}
      <p className="small review-links">
        <a href="/snap">Take photos</a> · <a href="/">Open Brick Stash</a>
      </p>
    </div>
  );
}

function DrawerReviewView({
  drawer,
  review,
  photos,
  info,
  parts,
  onChange,
}: {
  drawer: DraftDrawer;
  review: DrawerReview | undefined;
  photos: Photo[];
  info: (n: string) => PartInfo;
  parts: Part[];
  onChange: (f: (r: DrawerReview) => DrawerReview) => void;
}) {
  const score = scoreOf(drawer, review);
  const top = topPhotoOf(photos, photoCode(drawer));
  const mine = photos.filter((p) => p.code === photoCode(drawer));
  const areas = drawer.pockets.map((p) => p.area);
  const [realCode, setRealCode] = useState(review?.code ?? '');
  const codeOk = !realCode || DRAWER_CODE.test(realCode.toUpperCase());

  return (
    <>
      {drawer.note && <p className="muted small">{drawer.note}</p>}
      {unconfirmed(drawer.code) && (
        <label className="review-code">
          <span className="small">This draft’s drawer code isn’t known. Which drawer is it?</span>
          <input
            value={realCode}
            placeholder="e.g. C4"
            autoCapitalize="characters"
            onChange={(e) => {
              const v = e.target.value.trim().toUpperCase();
              setRealCode(v);
              if (!v || DRAWER_CODE.test(v)) onChange((r) => ({ ...r, code: v || undefined }));
            }}
          />
          {!codeOk && <span className="small bad">A code is letters then numbers, like C4.</span>}
        </label>
      )}
      <p className="small review-score">
        <b>
          {score.checked} of {score.boxes} boxes done.
        </b>{' '}
        {scoreText(score)}{' '}
        {review?.closed ? (
          <>
            <b>Marked as finished:</b> nothing more to do.{' '}
            <button className="link small" onClick={() => onChange((r) => ({ ...r, closed: undefined }))}>
              Reopen
            </button>
          </>
        ) : (
          <button className="link small" title="Finished with this draft, whatever’s been answered: nothing more to check, load or learn from. It can be reopened." onClick={() => onChange((r) => ({ ...r, closed: true }))}>
            Mark as finished, nothing more to do
          </button>
        )}
      </p>
      {top && areas.some(Boolean) && <Overview top={top} areas={areas} done={drawer.pockets.map((p, i) => !!review?.pockets[pocketKey(p, i)]?.done)} />}
      {top && !areas.some(Boolean) && <img className="review-top" src={photoUrl(top)} alt={`${top.name}, the whole drawer`} />}
      {drawer.pockets.map((p, i) => {
        const key = pocketKey(p, i);
        return (
          <BoxCard
            key={key}
            index={i}
            name={key}
            pocket={p}
            review={review?.pockets[key]}
            top={top}
            photos={photosIn(p.area, mine)}
            info={info}
            parts={parts}
            onChange={(f) => onChange((r) => withPocket(r, key, f))}
          />
        );
      })}
    </>
  );
}

/** The whole drawer with each box outlined and numbered; tapping one goes to it */
function Overview({ top, areas, done }: { top: Photo; areas: (PhotoArea | undefined)[]; done: boolean[] }) {
  return (
    <div className="review-overview">
      <img src={photoUrl(top)} alt={`${top.name}, with the boxes numbered`} />
      {areas.map(
        (a, i) =>
          a && (
            <button
              key={i}
              className={`review-area ${done[i] ? 'done' : ''}`}
              style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}
              aria-label={`Box ${i + 1}`}
              onClick={() => document.getElementById(`box-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <span>{done[i] ? '✓' : i + 1}</span>
            </button>
          ),
      )}
    </div>
  );
}

/** One box cut out of the top photo */
function Crop({ photo, area }: { photo: Photo; area: PhotoArea }) {
  const [ratio, setRatio] = useState(4 / 3);
  const aspect = (area.w * ratio) / area.h;
  return (
    <div className="review-crop" style={{ aspectRatio: `${aspect}`, width: `min(100%, calc(40vh * ${aspect}))` }}>
      <img
        src={photoUrl(photo)}
        alt=""
        onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        style={{ width: `${10000 / area.w}%`, left: `${(-area.x * 100) / area.w}%`, top: `${(-area.y * 100) / area.h}%` }}
      />
    </div>
  );
}

function BoxCard({
  index,
  name,
  pocket,
  review,
  top,
  photos,
  info,
  parts,
  onChange,
}: {
  index: number;
  name: string;
  pocket: DraftPocket;
  review: PocketReview | undefined;
  top?: Photo;
  photos: Photo[];
  info: (n: string) => PartInfo;
  parts: Part[];
  onChange: (f: (p: PocketReview) => PocketReview) => void;
}) {
  const r = review ?? {};
  const said = r.parts ?? {};
  const [open, setOpen] = useState(!r.done);
  const [all, setAll] = useState(false);
  const label = r.label ?? pocket.label;
  const verdict = (n: string, v: Verdict | undefined) => onChange((p) => withVerdict(p, n, v));
  const final = confirmedParts(pocket, review);
  const named = all ? pocket.parts : pocket.parts.slice(0, FIRST_PARTS);
  const wrong = pocket.parts.filter((n) => said[n] === 'no').length;

  const title = (
    <>
      <span className="review-num">{r.done ? '✓' : index + 1}</span>
      <span className="review-box-title">
        {name}
        {label && <span className="muted"> · {label}</span>}
      </span>
    </>
  );

  if (!open) {
    return (
      <section id={`box-${index}`} className="review-box done">
        <button className="ghost review-box-head" onClick={() => setOpen(true)} aria-expanded={false}>
          {title}
          <span className="muted small">
            {final.length} part{final.length === 1 ? '' : 's'}
            {wrong ? `, ${wrong} taken off` : ''} · Edit
          </span>
        </button>
      </section>
    );
  }

  return (
    <section id={`box-${index}`} className={`review-box ${r.done ? 'done' : ''}`}>
      <h2 className="review-box-head">{title}</h2>
      <div className="review-pictures">
        {top && pocket.area && <Crop photo={top} area={pocket.area} />}
        {photos.length > 0 && (
          <div className="review-pieces">
            {photos.map((p) => (
              <a key={p.name} href={photoUrl(p)} target="_blank" rel="noreferrer">
                <img src={photoUrl(p)} alt={p.name} loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </div>
      {pocket.ask && <p className="review-ask">{pocket.ask}</p>}

      {pocket.parts.length > 0 && (
        <ul className="review-parts">
          {named.map((n) => (
            <PartRow key={n} n={n} info={info(n)} verdict={said[n]} onVerdict={(v) => verdict(n, v)} yes="Here" no="Not here" />
          ))}
        </ul>
      )}
      {pocket.parts.length > FIRST_PARTS && (
        <button className="link small" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${pocket.parts.length} parts`}
        </button>
      )}
      {!pocket.parts.length && <p className="muted small">The draft has nothing in this box.</p>}

      {!!pocket.maybe?.length && (
        <>
          <h3 className="review-sub">Not sure about these. Are they here?</h3>
          <ul className="review-parts">
            {pocket.maybe.map((n) => (
              <PartRow key={n} n={n} info={info(n)} verdict={said[n]} onVerdict={(v) => verdict(n, v)} yes="Yes" no="No" />
            ))}
          </ul>
        </>
      )}

      {!!r.added?.length && (
        <>
          <h3 className="review-sub">You added</h3>
          <ul className="review-parts">
            {r.added.map((n) => (
              <li key={n} className="review-part">
                <PartImage partNum={n} size={56} />
                <PartName n={n} info={info(n)} />
                <div className="review-verdict">
                  <button className="ghost" onClick={() => onChange((p) => ({ ...p, added: (p.added ?? []).filter((x) => x !== n) }))}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <AddPart parts={parts} leaveOut={new Set([...pocket.parts, ...(pocket.maybe ?? []), ...(r.added ?? [])])} onAdd={(n) => onChange((p) => ({ ...p, added: [...(p.added ?? []), n] }))} />

      <div className="review-fields">
        <input placeholder="Box name for its label (optional)" aria-label="Box name" value={r.label ?? pocket.label ?? ''} onChange={(e) => onChange((p) => ({ ...p, label: e.target.value }))} />
        <textarea
          rows={2}
          placeholder="Anything else? e.g. “the black ones are 3001”, or “these are in the next box”"
          aria-label="Note about this box"
          value={r.note ?? ''}
          onChange={(e) => onChange((p) => ({ ...p, note: e.target.value }))}
        />
      </div>

      <button
        className={`snap-wide ${r.done ? 'ghost' : ''}`}
        onClick={() => {
          onChange((p) => ({ ...p, done: !p.done }));
          if (!r.done) setOpen(false);
        }}
      >
        {r.done ? 'Not done yet' : 'Done with this box'}
      </button>
      {!r.done && <p className="muted small review-hint">Anything you haven’t answered is taken as right.</p>}
    </section>
  );
}

function PartName({ n, info }: { n: string; info: PartInfo }) {
  return (
    <div className="review-part-name">
      <b>{n}</b> {info.name}
      <span className="muted small">{info.qty === undefined ? '' : `You have ${info.qty}`}</span>
    </div>
  );
}

function PartRow({ n, info, verdict, onVerdict, yes, no }: { n: string; info: PartInfo; verdict?: Verdict; onVerdict: (v: Verdict | undefined) => void; yes: string; no: string }) {
  return (
    <li className={`review-part ${verdict ?? ''}`}>
      <PartImage partNum={n} size={56} />
      <PartName n={n} info={info} />
      <div className="review-verdict">
        <button aria-pressed={verdict === 'yes'} className={verdict === 'yes' ? 'yes' : 'ghost'} onClick={() => onVerdict(verdict === 'yes' ? undefined : 'yes')}>
          ✓ {yes}
        </button>
        <button aria-pressed={verdict === 'no'} className={verdict === 'no' ? 'no' : 'ghost'} onClick={() => onVerdict(verdict === 'no' ? undefined : 'no')}>
          ✗ {no}
        </button>
      </div>
    </li>
  );
}

function AddPart({ parts, leaveOut, onAdd }: { parts: Part[]; leaveOut: Set<string>; onAdd: (n: string) => void }) {
  const [q, setQ] = useState('');
  const found = useMemo(() => searchCollection(parts, q, leaveOut), [parts, q, leaveOut]);
  return (
    <div className="review-add">
      <input placeholder="Add a part the draft missed: number or name" aria-label="Find a part to add" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && !found.length && <p className="muted small">{parts.length ? 'Nothing in your collection matches.' : 'Your collection hasn’t loaded, so parts can’t be searched.'}</p>}
      {found.length > 0 && (
        <ul className="review-found">
          {found.map((p) => (
            <li key={p.partNum}>
              <button
                className="ghost"
                onClick={() => {
                  onAdd(p.partNum);
                  setQ('');
                }}
              >
                <PartImage partNum={p.partNum} size={40} />
                <span>
                  <b>{p.partNum}</b> {p.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
