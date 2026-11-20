import { useEffect, useState } from 'react';
import { partImages } from '../lib/partImages';

/** Remembers which source worked (or that none did) so tiles don't retry failed URLs on every render */
const resolved = new Map<string, number>();

// ─── A bigger picture on hover ───────────────────────────────────────────────
// Small pictures are hard to tell apart, so pointing at one (or tapping it) shows it large, with its name and number,
// next to where it is. One preview for the whole page, drawn by <PartZoom /> in the app.

interface Zoom {
  src: string;
  partNum: string;
  title: string;
  rect: DOMRect;
}
let zoom: Zoom | null = null;
const listeners = new Set<(z: Zoom | null) => void>();
const show = (z: Zoom | null) => {
  zoom = z;
  listeners.forEach((l) => l(z));
};

export function PartZoom() {
  const [z, setZ] = useState<Zoom | null>(zoom);
  useEffect(() => {
    listeners.add(setZ);
    const hide = () => show(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', hide);
    window.addEventListener('dragstart', hide, true);
    return () => {
      window.removeEventListener('dragstart', hide, true);
      listeners.delete(setZ);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('keydown', hide);
    };
  }, []);
  if (!z) return null;
  const SIZE = 220;
  // Beside the picture, on whichever side has room, and kept on screen
  const right = z.rect.right + 12 + SIZE + 24 < window.innerWidth;
  const left = right ? z.rect.right + 12 : Math.max(8, z.rect.left - SIZE - 36);
  const top = Math.min(Math.max(8, z.rect.top + z.rect.height / 2 - SIZE / 2 - 20), window.innerHeight - SIZE - 70);
  return (
    <div className="part-zoom no-print" style={{ left, top, width: SIZE + 24 }} aria-hidden>
      <img src={z.src} alt="" width={SIZE} height={SIZE} referrerPolicy="no-referrer" />
      <div className="part-zoom-name">{z.title}</div>
      <div className="part-zoom-num">{z.partNum}</div>
    </div>
  );
}

export default function PartImage({ partNum, size = 32, title, zoomable = true }: { partNum: string; size?: number; title?: string; zoomable?: boolean }) {
  const [idx, setIdx] = useState(() => resolved.get(partNum) ?? 0);
  const urls = partImages(partNum);
  // A picture that goes while it's pointed at (added, removed, moved on) takes its preview with it
  useEffect(() => () => void (zoom?.partNum === partNum && show(null)), [partNum]);
  const box = { width: size, height: size };
  if (idx >= urls.length) return <span className="part-img missing" style={box} title={title ?? partNum} />;
  const enter = (e: React.SyntheticEvent<HTMLImageElement>) => zoomable && show({ src: urls[idx], partNum, title: title ?? partNum, rect: e.currentTarget.getBoundingClientRect() });
  return (
    <img
      className={`part-img ${zoomable ? 'zoomable' : ''}`}
      style={box}
      src={urls[idx]}
      alt={title ?? partNum}
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
      onMouseEnter={enter}
      onMouseLeave={() => zoomable && show(null)}
      onLoad={() => resolved.set(partNum, idx)}
      onError={() => {
        resolved.set(partNum, idx + 1);
        setIdx(idx + 1);
      }}
    />
  );
}
