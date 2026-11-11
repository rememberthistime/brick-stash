// The phone page: choose a drawer, take photos, and they're filed under it. It reads the storage list and never
// writes to the project, so it can't get in the way of whatever's open on another device.
import ReadNow from './ReadNow';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOX_NAME_IDEAS,
  boxAt,
  changePhoto,
  deletePhoto,
  photoUrl,
  saveBoxNames,
  topPhotoOf,
  uploadPhoto,
  useBoxNames,
  usePhotos,
  withBoxName,
  type BoxName,
  type Photo,
  type PhotoView,
  type Spot,
} from '../lib/photos';
import { expandCompartments } from '../lib/planner';
import { setupComps, type SetupComp } from '../lib/setup';
import { stem } from '../lib/storageList';
import type { Settings, Setup, StorageUnit } from '../lib/types';

const STORE = 'brick-stash-snap';
const VIEWS: { view: PhotoView; label: string }[] = [
  { view: 'piece', label: 'One piece' },
  { view: 'closeup', label: 'Close-up of a box' },
  { view: 'top', label: 'Drawer, top' },
  { view: 'side', label: 'Drawer, side' },
];
/** Photos that can say which box in the drawer they're from */
const SPOTTED: PhotoView[] = ['piece', 'closeup'];
const SHOWN = 12;
// Asking for these by name makes iPhones hand over a JPEG rather than HEIC, which most browsers can't show
const ACCEPT = 'image/jpeg,image/png,image/webp';

interface Shot {
  id: number;
  file: File;
  url: string;
  code: string;
  view: PhotoView;
  spot: Spot | null;
  status: 'sending' | 'done' | 'failed';
  name?: string;
  error?: string;
  /** saved, but without the box it was marked with */
  lostSpot?: boolean;
}

function remembered(): { code: string | null; view: PhotoView } {
  try {
    return { code: null, view: 'piece', ...JSON.parse(localStorage.getItem(STORE) ?? '{}') };
  } catch {
    return { code: null, view: 'piece' };
  }
}

export default function Snap() {
  const [comps, setComps] = useState<SetupComp[] | null>(null);
  const [loadError, setLoadError] = useState('');
  // Kept because a phone short of memory can reload the page while its camera is open
  const [code, setCode] = useState(() => remembered().code);
  const [view, setView] = useState(() => remembered().view);
  const [shots, setShots] = useState<Shot[]>([]);
  // Where the next photos come from. It stays put for several shots of the same box, and clears with a new drawer.
  const [spot, setSpot] = useState<Spot | null>(null);
  // A photo already saved whose box is being marked, and the box last tapped, which can be given a name
  const [marking, setMarking] = useState<Photo | null>(null);
  const [named, setNamed] = useState<Spot | null>(null);
  const { boxes, refresh: refreshBoxes } = useBoxNames(30000);
  const nextId = useRef(1);
  const queue = useRef(Promise.resolve());
  const { photos, refresh } = usePhotos(30000);
  // A server started before an update serves the new page with its old code, which can't save box marks
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    fetch('/api/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { features?: string[] } | null) => setOutdated(!!info && !info.features?.includes('spots')))
      .catch(() => {
        /* the photo uploads will say if the server can't be reached */
      });
  }, []);

  useEffect(() => {
    fetch('/api/project?only=units,settings,setup')
      .then(async (r) => {
        if (r.status === 404) throw new Error('There’s no project on the server yet. Open Brick Stash on your computer first.');
        if (!r.ok) throw new Error(`The server said ${r.status}.`);
        const p = (await r.json()) as { units: StorageUnit[]; settings: Settings; setup: Setup };
        setComps(setupComps(expandCompartments(p.units, p.settings), p.setup?.open));
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ code, view }));
    } catch {
      /* it only saves re-choosing the drawer */
    }
  }, [code, view]);

  useEffect(() => {
    setSpot(null);
    setMarking(null);
    setNamed(null);
  }, [code]);

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of photos) out.set(p.code, (out.get(p.code) ?? 0) + 1);
    return out;
  }, [photos]);

  const patch = (id: number, change: Partial<Shot>) => setShots((all) => all.map((s) => (s.id === id ? { ...s, ...change } : s)));

  // One at a time, so numbering follows the order they were taken and a slow upload never holds up the camera
  const send = (shot: Shot) => {
    patch(shot.id, { status: 'sending', error: undefined });
    queue.current = queue.current.then(async () => {
      try {
        const saved = await uploadPhoto(shot.code, shot.view, shot.file, shot.spot);
        // A server running older code saves the photo but quietly drops the mark, so check it came back
        patch(shot.id, { status: 'done', name: saved.name, lostSpot: !!shot.spot && !saved.spot });
        refresh();
      } catch (e) {
        const message = e instanceof TypeError ? 'Couldn’t reach the server.' : (e as Error).message;
        patch(shot.id, { status: 'failed', error: message });
      }
    });
  };

  const add = (files: FileList | null) => {
    if (!files || !code) return;
    const at = SPOTTED.includes(view) ? spot : null;
    const added = [...files].map((file): Shot => ({ id: nextId.current++, file, url: URL.createObjectURL(file), code, view, spot: at, status: 'sending' }));
    setShots((all) => [...added, ...all]);
    added.forEach(send);
  };

  const remove = async (shot: Shot) => {
    if (shot.status === 'done' && !confirm(`Delete ${shot.name}?`)) return;
    try {
      if (shot.name) await deletePhoto(shot.name);
      URL.revokeObjectURL(shot.url);
      setShots((all) => all.filter((s) => s.id !== shot.id));
      refresh();
    } catch (e) {
      patch(shot.id, { error: (e as Error).message });
    }
  };

  if (loadError) {
    return (
      <div className="snap">
        <div className="banner error">{loadError}</div>
        <button className="snap-wide" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!comps) return <div className="snap muted">Loading your storage…</div>;

  const index = comps.findIndex((c) => c.code === code);
  if (index < 0) return <DrawerPicker comps={comps} counts={counts} onPick={setCode} />;

  const comp = comps[index];
  const here = shots.filter((s) => s.code === comp.code);
  const step = (d: number) => setCode(comps[(index + d + comps.length) % comps.length].code);
  const waiting = shots.filter((s) => s.status === 'sending').length;
  const lost = shots.some((s) => s.lostSpot);
  const top = topPhotoOf(photos, comp.code);
  const drawerBoxes = boxes[comp.code] ?? [];
  const sentNames = new Set(shots.map((s) => s.name));
  const saved = photos.filter((p) => p.code === comp.code && !sentNames.has(p.name)).sort((a, b) => b.mtime - a.mtime);
  const tap = async (at: Spot | null) => {
    setNamed(at);
    if (!marking) return setSpot(at);
    if (!at) return setMarking(null);
    const photo = marking;
    setMarking(null);
    try {
      await changePhoto(photo.name, { spot: at });
    } catch (e) {
      alert(`Couldn't mark that: ${(e as Error).message}`);
    }
    refresh();
  };
  const nameBox = async (name: string) => {
    if (!named) return;
    try {
      await saveBoxNames(comp.code, withBoxName(drawerBoxes, named, name));
    } catch (e) {
      alert(`Couldn't save that name: ${(e as Error).message}`);
    }
    refreshBoxes();
  };

  return (
    <div className="snap">
      <header className="snap-head">
        <button className="ghost snap-step" aria-label="Previous drawer" onClick={() => step(-1)}>
          ‹
        </button>
        <button className="ghost snap-drawer" onClick={() => setCode(null)}>
          <span className="code">{comp.code}</span>
          <span className="snap-drawer-name">
            {comp.unitName} › {comp.label}
          </span>
          <span className="muted small">Change drawer</span>
        </button>
        <button className="ghost snap-step" aria-label="Next drawer" onClick={() => step(1)}>
          ›
        </button>
      </header>

      <div className="snap-views" role="radiogroup" aria-label="What this photo shows">
        {VIEWS.map((v) => (
          <button key={v.view} role="radio" aria-checked={view === v.view} className={view === v.view ? '' : 'ghost'} onClick={() => setView(v.view)}>
            {v.label}
          </button>
        ))}
      </div>

      {(SPOTTED.includes(view) || marking) && (
        <SpotPicker
          top={top}
          spot={marking ? null : spot}
          marking={marking}
          named={named}
          boxes={drawerBoxes}
          marked={photos.filter((p) => p.code === comp.code && p.spot)}
          onPick={tap}
          onName={nameBox}
          onCancel={() => setMarking(null)}
        />
      )}

      <label className="snap-shoot">
        <input
          type="file"
          accept={ACCEPT}
          capture="environment"
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
        Take photo
      </label>
      <label className="snap-gallery">
        <input
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
        Choose from gallery
      </label>

      {outdated && !lost && (
        <div className="banner error snap-lost">The server on your computer is running older code and won’t save which box a photo is from. Restart it before marking boxes.</div>
      )}
      {lost && (
        <div className="banner error snap-lost">
          The server saved your photos but not which box they’re from, so it’s running older code. Restart it on your computer, and mark these boxes from the drawer editor there.
        </div>
      )}

      <p className="muted small snap-status" aria-live="polite">
        {counts.get(comp.code) ?? 0} saved for {comp.code}
        {waiting > 0 && `, ${waiting} sending`}
      </p>

      <div className="snap-shots">
        {here.slice(0, SHOWN).map((s) => (
          <figure key={s.id} className={`snap-shot ${s.status}`}>
            <img src={s.url} alt={s.name ?? 'Photo being sent'} />
            <figcaption>{s.status === 'sending' ? 'Sending…' : s.status === 'failed' ? (s.error ?? 'Not sent') : s.lostSpot ? `${s.name}, box not saved` : s.name}</figcaption>
            {s.status === 'failed' && (
              <button className="snap-retry" onClick={() => send(s)}>
                Try again
              </button>
            )}
            {s.status !== 'sending' && (
              <button className="snap-remove" aria-label={`Delete ${s.name ?? 'this photo'}`} onClick={() => remove(s)}>
                ✕
              </button>
            )}
          </figure>
        ))}
      </div>

      {saved.length > 0 && (
        <>
          <h2 className="snap-kind">Saved for {comp.code}</h2>
          <div className="snap-shots">
            {saved.map((p) => (
              <figure key={p.name} className={`snap-shot ${marking?.name === p.name ? 'marking' : ''}`}>
                <img src={photoUrl(p)} alt={p.name} loading="lazy" />
                <figcaption>
                  {p.name}
                  {p.spot && ', box marked'}
                </figcaption>
                {top && SPOTTED.includes(p.view) && (
                  <button
                    className="snap-retry"
                    onClick={() => {
                      setMarking(p);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    {p.spot ? 'Move mark' : 'Mark box'}
                  </button>
                )}
              </figure>
            ))}
          </div>
        </>
      )}
      <p className="small snap-status">
        <a href="/review">Check drafts read from your photos →</a>
      </p>
      <ReadNow />
    </div>
  );
}

function DrawerPicker({ comps, counts, onPick }: { comps: SetupComp[]; counts: Map<string, number>; onPick: (code: string) => void }) {
  const kinds = new Map<string, SetupComp[]>();
  for (const c of comps) kinds.set(stem(c.unitName), [...(kinds.get(stem(c.unitName)) ?? []), c]);
  return (
    <div className="snap">
      <h1 className="snap-title">Which drawer?</h1>
      <p className="small">
        <a href="/review">Check drafts read from your photos →</a>
      </p>
      {!comps.length && <p className="muted">No storage yet. Add some on the Storage tab on your computer.</p>}
      {[...kinds].map(([kind, list]) => (
        <section key={kind}>
          <h2 className="snap-kind">{kind}</h2>
          <div className="snap-codes">
            {list.map((c) => (
              <button key={c.key} className="ghost snap-code" aria-label={`${c.code}, ${c.unitName}, ${c.label}`} onClick={() => onPick(c.code)}>
                {c.code}
                {!!counts.get(c.code) && <span className="snap-count">{counts.get(c.code)}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Tap the drawer's top photo to say which box the next photos come from. Earlier marks show faintly. */
function SpotPicker({
  top,
  spot,
  marking,
  named,
  boxes,
  marked,
  onPick,
  onName,
  onCancel,
}: {
  top?: Photo;
  spot: Spot | null;
  marking: Photo | null;
  named: Spot | null;
  boxes: BoxName[];
  marked: Photo[];
  onPick: (s: Spot | null) => void;
  onName: (name: string) => void;
  onCancel: () => void;
}) {
  if (!top) return <p className="muted small snap-spot-hint">Take a “Drawer, top” photo first, and you can then tap which box these come from.</p>;
  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const at = (v: number, size: number) => Math.min(99, Math.max(0, Math.floor((v / size) * 100)));
    onPick({ x: at(e.clientX - r.left, r.width), y: at(e.clientY - r.top, r.height) });
  };
  const hint = marking ? `Tap the box ${marking.name} came from.` : spot ? 'Next photos are marked as from here. Tap to move it.' : 'Tap the box these come from.';
  return (
    <div className="snap-spot">
      <p className="small snap-spot-hint">{hint}</p>
      <div className="snap-spot-frame">
        <img src={photoUrl(top)} alt={`${top.name}: tap a box`} onClick={pick} />
        {marked.map((p) => (
          <span key={p.name} className="snap-spot-dot old" style={{ left: `${p.spot!.x}%`, top: `${p.spot!.y}%` }} aria-hidden />
        ))}
        {boxes.map((b) => (
          <span key={`${b.x}-${b.y}`} className="snap-box-name" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
            {b.name}
          </span>
        ))}
        {spot && <span className="snap-spot-dot" style={{ left: `${spot.x}%`, top: `${spot.y}%` }} aria-label="Marked box" />}
      </div>
      {marking ? (
        <button className="link small" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        spot && (
          <button className="link small" onClick={() => onPick(null)}>
            Don’t mark a box
          </button>
        )
      )}
      {named && !marking && <BoxNameField key={`${named.x}-${named.y}`} current={boxAt(boxes, named)?.name ?? ''} used={boxes.map((b) => b.name)} onSave={onName} />}
    </div>
  );
}

/** Give the box just tapped a name for its label, such as "Fences", or leave it to be labelled by its parts */
function BoxNameField({ current, used, onSave }: { current: string; used: string[]; onSave: (name: string) => void }) {
  const [value, setValue] = useState(current);
  const ideas = [...new Set([...used, ...BOX_NAME_IDEAS])];
  const save = () => value.trim() !== current && onSave(value);
  // Saved a moment after typing stops, as well as on leaving the box, so a name isn't lost to a locked phone
  useEffect(() => {
    if (value.trim() === current) return;
    const timer = setTimeout(() => onSave(value), 900);
    return () => clearTimeout(timer);
  }, [value, current, onSave]);
  return (
    <div className="snap-box-field">
      <input
        list="snap-box-ideas"
        placeholder="Name this box (optional), e.g. Fences"
        aria-label="Name for this box’s label"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      <datalist id="snap-box-ideas">
        {ideas.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <span className="muted small">{current ? `Saved as “${current}”` : 'A name means its label says that, not every part.'}</span>
    </div>
  );
}
