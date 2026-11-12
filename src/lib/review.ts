// Checking drafts of drawers read from photos: the user says which parts are right, which aren't there, and what was
// missed. The answers are kept beside the photos (reviews.json), so the next reading of photos can learn from them,
// and a checked draft is what loads into My setup.
import type { Photo } from './photos';
import type { DraftDrawer, DraftPocket, PhotoArea, SetupDraft } from './setup';
import type { Part } from './types';

export type Verdict = 'yes' | 'no';

export interface PocketReview {
  /** what the user said about each part the draft named, or offered as a maybe */
  parts?: Record<string, Verdict>;
  /** parts the draft missed */
  added?: string[];
  label?: string;
  note?: string;
  /** the whole box has been looked at; parts left unanswered are taken as right */
  done?: boolean;
}

export interface DrawerReview {
  /** the drawer's real code, for a draft filed under one still to be confirmed */
  code?: string;
  pockets: Record<string, PocketReview>;
  updated?: number;
  /** finished with, whatever has or hasn't been answered: it isn't loaded into My setup or learnt from */
  closed?: boolean;
}

export type Reviews = Record<string, DrawerReview>;

export const pocketKey = (p: DraftPocket, i: number) => p.where ?? `Box ${i + 1}`;

/** Codes like "A3?" are still to be confirmed */
export const unconfirmed = (code: string) => code.endsWith('?');

/** The code the drawer's photos are filed under */
export const photoCode = (d: DraftDrawer) => d.photos ?? d.code.replace(/\?$/, '');

/** What's in the box once the user's answers are applied */
export function confirmedParts(p: DraftPocket, r: PocketReview | undefined): string[] {
  const said = r?.parts ?? {};
  return [...new Set([...p.parts.filter((n) => said[n] !== 'no'), ...(p.maybe ?? []).filter((n) => said[n] === 'yes'), ...(r?.added ?? [])])];
}

/** The drafts with every answer applied, ready to load into My setup */
export function reviewedDrafts(drafts: SetupDraft, reviews: Reviews): SetupDraft {
  return {
    drawers: drafts.drawers.map((d) => {
      const r = reviews[d.code];
      return {
        code: r?.code ?? d.code,
        ...(d.open ? { open: d.open } : {}),
        pockets: d.pockets.map((p, i) => {
          const pr = r?.pockets[pocketKey(p, i)];
          const label = pr?.label ?? p.label;
          return { share: p.share, fill: p.fill, parts: confirmedParts(p, pr), ...(p.container ? { container: p.container } : {}), ...(label ? { label } : {}) };
        }),
      };
    }),
  };
}

export interface Score {
  boxes: number;
  checked: number;
  /** parts the draft named */
  named: number;
  right: number;
  wrong: number;
  unchecked: number;
  /** parts the user added because the draft missed them */
  missed: number;
  maybeYes: number;
  maybeNo: number;
  maybeOpen: number;
}

export const emptyScore = (): Score => ({ boxes: 0, checked: 0, named: 0, right: 0, wrong: 0, unchecked: 0, missed: 0, maybeYes: 0, maybeNo: 0, maybeOpen: 0 });

export function scoreOf(d: DraftDrawer, r: DrawerReview | undefined): Score {
  const s = emptyScore();
  d.pockets.forEach((p, i) => {
    const pr = r?.pockets[pocketKey(p, i)];
    const said = pr?.parts ?? {};
    s.boxes++;
    if (pr?.done) s.checked++;
    for (const n of p.parts) {
      s.named++;
      if (said[n] === 'no') s.wrong++;
      else if (said[n] === 'yes' || pr?.done) s.right++;
      else s.unchecked++;
    }
    for (const n of p.maybe ?? []) {
      if (said[n] === 'yes') s.maybeYes++;
      else if (said[n] === 'no') s.maybeNo++;
      else s.maybeOpen++;
    }
    s.missed += pr?.added?.length ?? 0;
  });
  return s;
}

export const addScores = (a: Score, b: Score): Score => Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof Score] + b[k as keyof Score]])) as unknown as Score;

/** The piece and close-up photos marked as coming from inside this box */
export const photosIn = (area: PhotoArea | undefined, photos: Photo[]) =>
  area ? photos.filter((p) => p.spot && p.spot.x >= area.x && p.spot.x <= area.x + area.w && p.spot.y >= area.y && p.spot.y <= area.y + area.h) : [];

/** Change what's been said about one box */
export function withPocket(r: DrawerReview, key: string, change: (p: PocketReview) => PocketReview): DrawerReview {
  return { ...r, pockets: { ...r.pockets, [key]: change(r.pockets[key] ?? {}) } };
}

/** Say yes or no to a part, or with undefined take the answer back */
export function withVerdict(p: PocketReview, partNum: string, verdict: Verdict | undefined): PocketReview {
  const parts = { ...p.parts };
  if (verdict) parts[partNum] = verdict;
  else delete parts[partNum];
  return { ...p, parts };
}

const MAX_FOUND = 8;

/** Parts in the collection matching a number or the words of a name, closest first */
export function searchCollection(parts: Part[], query: string, leaveOut: ReadonlySet<string> = new Set()): Part[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const phrase = words.join(' ');
  const isWordChar = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);
  const startsAWord = (text: string, w: string) => text.split(/[^a-z0-9]+/).some((t) => t.startsWith(w));
  const rank = (p: Part) => {
    const num = p.partNum.toLowerCase();
    if (num === q) return 0;
    if (num.startsWith(q)) return 1;
    const name = p.name.toLowerCase();
    if (!words.every((w) => startsAWord(name, w))) return -1;
    // "curved 2 x 3" should find Brick Curved 2 x 3 before every curved part with a 2 and a 3 in it
    const at = name.indexOf(phrase);
    return at >= 0 && !isWordChar(name[at - 1]) && !isWordChar(name[at + phrase.length]) ? 2 : 3;
  };
  return parts
    .filter((p) => !leaveOut.has(p.partNum))
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || b.p.qty - a.p.qty)
    .slice(0, MAX_FOUND)
    .map((x) => x.p);
}

export async function fetchDrafts(): Promise<{ drafts: SetupDraft; reviews: Reviews }> {
  const [d, r] = await Promise.all([fetch('/api/drafts'), fetch('/api/reviews')]);
  const drafts = await d.json().catch(() => null);
  if (!d.ok) throw new Error(drafts?.error ?? `The server said ${d.status}.`);
  if (!Array.isArray(drafts?.drawers)) throw new Error('The drafts file has no list of drawers.');
  return { drafts, reviews: r.ok ? await r.json() : {} };
}

export async function saveReview(code: string, review: DrawerReview, keepalive = false): Promise<DrawerReview> {
  const r = await fetch(`/api/reviews/${encodeURIComponent(code)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review), keepalive });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}.`);
  return body as DrawerReview;
}
