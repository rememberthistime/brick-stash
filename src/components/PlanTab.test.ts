import { expect, it } from 'vitest';
import { unitLetter } from './PlanTab';

it('gives every unit a letter code that cannot be confused with a compartment number', () => {
  expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(unitLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  const all = Array.from({ length: 800 }, (_, i) => unitLetter(i));
  expect(new Set(all).size).toBe(800);
  expect(all.every((l) => /^[A-Z]+$/.test(l))).toBe(true);
});
