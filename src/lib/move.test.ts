import { describe, expect, it } from 'vitest';
import { moveParts, movePocket, swapDrawers, undoStep } from './move';
import { EMPTY_SETUP, type Setup, type StorageUnit } from './types';

let n = 0;
const id = () => `new${++n}`;
const pocket = (pid: string, parts: string[], fill?: number) => ({ id: pid, share: 0.5, parts, ...(fill === undefined ? {} : { fill }) });
const setup: Setup = {
  ...EMPTY_SETUP,
  drawers: {
    'u:c:1': [pocket('p1', ['a', 'b'], 0.6), pocket('p2', ['c'])],
    'u:c:2': [pocket('p3', ['d'], 0.4)],
  },
};
const units: StorageUnit[] = [{ id: 'u', name: 'Drawers', accessibility: 2, compartments: [{ id: 'c', label: 'Drawer', w: 100, d: 100, h: 100, qty: 3 }], drawerNames: { 'c:1': 'Technic' } } as StorageUnit];

describe('moving parts by hand', () => {
  it('takes a part out of its pocket and puts it in another drawer', () => {
    const { setup: s } = moveParts(setup, [{ part: 'a', from: { key: 'u:c:1', pocket: 0 } }], { key: 'u:c:2', pocket: 0 }, id);
    expect(s.drawers['u:c:1'][0].parts).toEqual(['b']);
    expect(s.drawers['u:c:2'][0].parts).toEqual(['d', 'a']);
    // fills are yours to say, so they're left as entered
    expect(s.drawers['u:c:1'][0].fill).toBe(0.6);
  });

  it('moves between pockets of the same drawer, and several at once', () => {
    const { setup: s } = moveParts(
      setup,
      [
        { part: 'a', from: { key: 'u:c:1', pocket: 0 } },
        { part: 'b', from: { key: 'u:c:1', pocket: 0 } },
      ],
      { key: 'u:c:1', pocket: 1 },
      id,
    );
    expect(s.drawers['u:c:1'][0].parts).toEqual([]);
    expect(s.drawers['u:c:1'][0].fill).toBeUndefined();
    expect(s.drawers['u:c:1'][1].parts).toEqual(['c', 'a', 'b']);
  });

  it('records a drawer with nothing recorded as one pocket, for a part not in a drawer yet', () => {
    const { setup: s, before } = moveParts(setup, [{ part: 'z' }], { key: 'u:c:3', pocket: 2 }, id);
    expect(s.drawers['u:c:3']).toHaveLength(1);
    expect(s.drawers['u:c:3'][0].parts).toEqual(['z']);
    expect('u:c:3' in before && before['u:c:3'] === undefined).toBe(true);
  });

  it('does nothing for a part already where it is going', () => {
    const r = moveParts(setup, [{ part: 'a', from: { key: 'u:c:1', pocket: 0 } }], { key: 'u:c:1', pocket: 0 }, id);
    expect(r.setup).toBe(setup);
    expect(r.before).toEqual({});
  });

  it('moves a whole pocket', () => {
    const { setup: s } = movePocket(setup, { key: 'u:c:1', pocket: 0 }, { key: 'u:c:2', pocket: 0 }, id);
    expect(s.drawers['u:c:1'][0].parts).toEqual([]);
    expect(s.drawers['u:c:2'][0].parts).toEqual(['d', 'a', 'b']);
  });

  it('undoes a move, removing a drawer the move recorded', () => {
    const { setup: s, before } = moveParts(setup, [{ part: 'a', from: { key: 'u:c:1', pocket: 0 } }], { key: 'u:c:3', pocket: 0 }, id);
    const back = undoStep({ setup: s, units }, { text: '', drawers: before });
    expect(back.setup.drawers).toEqual(setup.drawers);
  });
});

describe('swapping two drawers', () => {
  it('swaps pockets and names, and undoes', () => {
    const r = swapDrawers({ setup, units }, 'u:c:1', 'u:c:3');
    expect(r.setup.drawers['u:c:3']).toEqual(setup.drawers['u:c:1']);
    expect(r.setup.drawers['u:c:1']).toBeUndefined();
    expect(r.units[0].drawerNames).toEqual({ 'c:3': 'Technic' });
    const back = undoStep({ setup: r.setup, units: r.units }, { text: '', drawers: r.before, names: r.names });
    expect(back.setup.drawers).toEqual(setup.drawers);
    expect(back.units[0].drawerNames).toEqual({ 'c:1': 'Technic' });
  });
});

describe('taking parts out', () => {
  it('leaves them in no drawer, and undoes', async () => {
    const { takeOut } = await import('./move');
    const r = takeOut(setup, [{ part: 'c', from: { key: 'u:c:1', pocket: 1 } }]);
    expect(r.setup.drawers['u:c:1'][1].parts).toEqual([]);
    expect(undoStep({ setup: r.setup, units }, { text: '', drawers: r.before }).setup.drawers).toEqual(setup.drawers);
  });
});
