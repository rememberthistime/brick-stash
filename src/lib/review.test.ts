import { describe, expect, it } from 'vitest';
import type { Photo } from './photos';
import { addScores, confirmedParts, photosIn, reviewedDrafts, scoreOf, searchCollection, withPocket, withVerdict, type DrawerReview } from './review';
import type { DraftDrawer } from './setup';
import type { Part } from './types';

const drawer: DraftDrawer = {
  code: 'H2',
  pockets: [
    { where: 'Front left', share: 0.5, parts: ['33243', '6191'], maybe: ['32803'], area: { x: 10, y: 0, w: 20, h: 25 } },
    { where: 'Back right', share: 0.5, fill: 0.4, parts: ['50950'], label: 'Curves' },
  ],
};

describe('checking drafts', () => {
  it('applies yes, no, maybe and missed parts', () => {
    const r = { parts: { 6191: 'no', 32803: 'yes' } as const, added: ['3001'] };
    expect(confirmedParts(drawer.pockets[0], r)).toEqual(['33243', '32803', '3001']);
    expect(confirmedParts(drawer.pockets[0], undefined)).toEqual(['33243', '6191']);
  });

  it('turns checked drafts into drafts for My setup, with the real code and names', () => {
    const reviews = { H2: { code: 'H3', pockets: { 'Back right': { label: 'Big curves', parts: { 50950: 'no' as const } } } } };
    const out = reviewedDrafts({ drawers: [drawer] }, reviews).drawers[0];
    expect(out.code).toBe('H3');
    expect(out.pockets[1]).toEqual({ share: 0.5, fill: 0.4, parts: [], label: 'Big curves' });
    expect(out.pockets[0].parts).toEqual(['33243', '6191']);
  });

  it('scores a draft, counting unanswered parts in a finished box as right', () => {
    let r: DrawerReview = { pockets: {} };
    r = withPocket(r, 'Front left', (p) => withVerdict(withVerdict(p, '6191', 'no'), '32803', 'yes'));
    r = withPocket(r, 'Back right', (p) => ({ ...p, done: true, added: ['3001'] }));
    expect(scoreOf(drawer, r)).toEqual({ boxes: 2, checked: 1, named: 3, right: 1, wrong: 1, unchecked: 1, missed: 1, maybeYes: 1, maybeNo: 0, maybeOpen: 0 });
    expect(addScores(scoreOf(drawer, r), scoreOf(drawer, undefined)).named).toBe(6);
    expect(withVerdict({ parts: { 1: 'yes' } }, '1', undefined).parts).toEqual({});
  });

  it('finds the photos taken of a box', () => {
    const photo = (name: string, spot?: { x: number; y: number }) => ({ name, code: 'H2', view: 'piece', spot, size: 1, mtime: 1 }) as Photo;
    const found = photosIn(drawer.pockets[0].area, [photo('in', { x: 27, y: 11 }), photo('out', { x: 46, y: 16 }), photo('none')]);
    expect(found.map((p) => p.name)).toEqual(['in']);
    expect(photosIn(undefined, [photo('in', { x: 27, y: 11 })])).toEqual([]);
  });

  it('searches the collection by number or name words', () => {
    const part = (partNum: string, name: string, qty: number) => ({ partNum, name, qty }) as Part;
    const parts = [part('3001', 'Brick 2 x 4', 10), part('30010', 'Panel 1 x 2 x 3', 5), part('3003', 'Brick 2 x 2', 50), part('6191', 'Brick Curved 1 x 4', 3), part('15068', 'Brick Curved 2 x 2 x 2/3', 90), part('6215', 'Brick Curved 2 x 3', 2), part('6216', 'Brick Curved 2 x 3 x 2', 2)];
    expect(searchCollection(parts, 'curved 2 x 3')[0].partNum).toBe('6215');
    expect(searchCollection(parts, '3001').map((p) => p.partNum)).toEqual(['3001', '30010']);
    expect(searchCollection(parts, 'brick 2').map((p) => p.partNum).slice(0, 2)).toEqual(['3003', '3001']);
    expect(searchCollection(parts, 'panel', new Set(['30010']))).toEqual([]);
    expect(searchCollection(parts, '  ')).toEqual([]);
  });
});
