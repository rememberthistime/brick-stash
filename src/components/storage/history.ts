// The steps taken by hand on the storage pages (moves, swaps, parts taken out), newest last, to undo one at a time.
// Kept for this visit to the app only: reloading starts a fresh list. Each step puts back only the drawers it touched,
// so undoing never overwrites anything else.
import { useSyncExternalStore } from 'react';
import type { Step } from '../../lib/move';

const MAX = 50;
let steps: Step[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const history = {
  push(step: Step) {
    if (!Object.keys(step.drawers).length) return;
    steps = [...steps, step].slice(-MAX);
    emit();
  },
  pop(): Step | undefined {
    const last = steps[steps.length - 1];
    if (last) {
      steps = steps.slice(0, -1);
      emit();
    }
    return last;
  },
  clear() {
    steps = [];
    emit();
  },
};

export function useHistory(): Step[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => steps,
  );
}
