import { describe, expect, it } from 'vitest';
import { boxAt, withBoxName } from './photos';

describe('box names', () => {
  const list = [
    { x: 20, y: 20, name: 'Fences' },
    { x: 70, y: 70, name: 'Food' },
  ];

  it('finds the box at a tap, allowing for a slightly different place', () => {
    expect(boxAt(list, { x: 23, y: 18 })?.name).toBe('Fences');
    expect(boxAt(list, { x: 45, y: 45 })).toBeUndefined();
  });

  it('renames a box tapped again, rather than adding a second', () => {
    const next = withBoxName(list, { x: 22, y: 21 }, ' Railings ');
    expect(next).toHaveLength(2);
    expect(next.find((b) => b.name === 'Railings')).toEqual({ x: 22, y: 21, name: 'Railings' });
  });

  it('adds a new box, and takes one off with an empty name', () => {
    expect(withBoxName(list, { x: 50, y: 10 }, 'Flags')).toHaveLength(3);
    expect(withBoxName(list, { x: 70, y: 71 }, '').map((b) => b.name)).toEqual(['Fences']);
  });
});
