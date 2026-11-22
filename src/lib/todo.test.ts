import { describe, expect, it } from 'vitest';
import { markDone, sourceOf, todoList, unmarkDone } from './todo';
import { EMPTY_SETUP, type AcceptedMove, type Setup } from './types';

const pocket = (id: string, parts: string[]) => ({ id, share: 1, parts });
const swap = (a: string, b: string): AcceptedMove => ({ id: `${a}<>${b}`, text: `Swap ${a} and ${b}`, before: { [a]: [pocket(a, ['x'])], [b]: [pocket(b, ['y'])] }, namesBefore: { [a]: '', [b]: '' } });
const partMove = (from: string, to: string, part: string): AcceptedMove => ({ id: `m-${part}`, text: `Move ${part}`, before: { [from]: [pocket(from, [part])], [to]: [pocket(to, [])] }, parts: [part] });

describe('moves to make', () => {
  it('puts a run of swaps through one slot together as where each drawer ends up', () => {
    // B1<>B3, then B1<>E1, then B1<>F2: the drawer in B3 goes to B1, E1's to B3, F2's to E1 and B1's to F2
    const list = todoList([swap('B1', 'B3'), swap('B1', 'E1'), swap('B1', 'F2')]);
    expect(list.rings).toHaveLength(1);
    expect(list.rings[0].indices).toEqual([0, 1, 2]);
    const to = Object.fromEntries(list.rings[0].shifts.map((s) => [s.to, s.from]));
    expect(to).toEqual({ B1: 'F2', B3: 'B1', E1: 'B3', F2: 'E1' });
  });

  it('keeps unrelated swaps apart, and swaps that cancel out leave nothing to move', () => {
    const list = todoList([swap('A1', 'A2'), swap('C1', 'C2'), swap('C1', 'C2')]);
    expect(list.rings).toHaveLength(2);
    expect(list.rings.find((r) => r.indices.includes(1))!.shifts).toEqual([]);
  });

  it('groups moves of parts by the drawer they come out of', () => {
    const list = todoList([partMove('A2', 'G3', 'p1'), swap('B1', 'B2'), partMove('A2', 'F1', 'p2'), partMove('C1', 'W1', 'p3')]);
    expect(list.trips).toEqual([
      { from: 'A2', indices: [0, 2] },
      { from: 'C1', indices: [3] },
    ]);
    expect(sourceOf(partMove('A2', 'G3', 'p1'))).toBe('A2');
  });

  it('marking done ticks the moved parts as there, and undoing puts both back', () => {
    const setup: Setup = { ...EMPTY_SETUP, drawers: { A2: [pocket('a', [])], G3: [pocket('g', ['p1', 'q'])] }, accepted: [partMove('A2', 'G3', 'p1'), swap('B1', 'B2')] };
    const { setup: done, step } = markDone(setup, [0]);
    expect(done.accepted.map((a) => a.id)).toEqual(['B1<>B2']);
    expect(done.drawers.G3![0].checked).toEqual(['p1']);
    const back = unmarkDone(done, step);
    expect(back.accepted.map((a) => a.id)).toEqual(setup.accepted.map((a) => a.id));
    expect(back.drawers.G3![0].checked).toBeUndefined();
  });
});
