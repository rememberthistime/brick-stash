// Photos of drawers and pieces, kept on the server and filed by drawer code
import { useCallback, useEffect, useState } from 'react';

export type PhotoView = 'piece' | 'closeup' | 'top' | 'side';

/** Where in the drawer a piece or close-up came from: percent across and down its top photo */
export interface Spot {
  x: number;
  y: number;
}

export interface Photo {
  name: string;
  code: string;
  view: PhotoView;
  spot?: Spot;
  size: number;
  mtime: number;
}

/** The drawer's most recent photo from above, which places are marked on */
export const topPhotoOf = (photos: Photo[], code: string) => photos.filter((p) => p.code === code && p.view === 'top').sort((a, b) => b.mtime - a.mtime)[0];

export const photoUrl = (p: Photo) => `/api/photos/${encodeURIComponent(p.name)}?v=${p.mtime}`;

export async function uploadPhoto(code: string, view: PhotoView, file: Blob, spot?: Spot | null): Promise<Photo> {
  const at = spot ? `&x=${spot.x}&y=${spot.y}` : '';
  const r = await fetch(`/api/photos?code=${encodeURIComponent(code)}&view=${view}${at}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}.`);
  return body as Photo;
}

/** Move a photo to another drawer, or mark (or with null, clear) which box it came from */
export async function changePhoto(name: string, change: { code?: string; spot?: Spot | null }): Promise<Photo> {
  const r = await fetch(`/api/photos/${encodeURIComponent(name)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}.`);
  return body as Photo;
}

export async function deletePhoto(name: string) {
  const r = await fetch(`/api/photos/${encodeURIComponent(name)}`, { method: 'DELETE' });
  // Already gone is what was wanted
  if (!r.ok && r.status !== 404) throw new Error(`The server said ${r.status}.`);
}

/** The photos on the server, checked every so often so ones taken on the phone turn up by themselves */
export function usePhotos(everyMs = 10000) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const refresh = useCallback(() => {
    fetch('/api/photos')
      .then((r) => (r.ok ? r.json() : []))
      .then(setPhotos)
      .catch(() => {
        /* no server to ask; there's nothing to show */
      });
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, everyMs);
    return () => clearInterval(timer);
  }, [refresh, everyMs]);
  return { photos, refresh };
}

/** A name given to a box, such as "Fences", so its label can say that rather than list every part */
export interface BoxName extends Spot {
  name: string;
}
export type BoxNames = Record<string, BoxName[]>;

/** Common names for boxes of mixed small parts, offered when naming one */
export const BOX_NAME_IDEAS = ['Fences', 'Minifig accessories', 'Food', 'Animal parts', 'Flags', 'Plants', 'Technic connectors', 'Technic pins', 'Hinges', 'Clips and bars', 'Mixed'];

/** Taps this close (in percent of the photo) count as the same box */
const SAME_BOX = 6;
export const boxAt = (list: BoxName[], spot: Spot) =>
  list
    .map((b) => ({ b, d: Math.hypot(b.x - spot.x, b.y - spot.y) }))
    .filter((x) => x.d <= SAME_BOX)
    .sort((a, b) => a.d - b.d)[0]?.b;

/** Name the box at a place, replacing any name already near it. An empty name takes it off. */
export function withBoxName(list: BoxName[], spot: Spot, name: string): BoxName[] {
  const old = boxAt(list, spot);
  const rest = list.filter((b) => b !== old);
  return name.trim() ? [...rest, { x: spot.x, y: spot.y, name: name.trim() }] : rest;
}

export async function saveBoxNames(code: string, list: BoxName[]): Promise<BoxName[]> {
  const r = await fetch(`/api/boxes/${encodeURIComponent(code)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}.`);
  return body as BoxName[];
}

export function useBoxNames(everyMs = 15000) {
  const [boxes, setBoxes] = useState<BoxNames>({});
  const refresh = useCallback(() => {
    fetch('/api/boxes')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setBoxes)
      .catch(() => {
        /* no server, so no names */
      });
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, everyMs);
    return () => clearInterval(timer);
  }, [refresh, everyMs]);
  return { boxes, refresh };
}
