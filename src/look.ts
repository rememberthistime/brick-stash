// The look of the app on this device: Bright (the default), Workshop or Night. Kept in this browser only, and set on
// the page before it's drawn so it doesn't flash.
import { useSyncExternalStore } from 'react';

export const LOOKS = [
  { id: 'bright', label: 'Bright' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'night', label: 'Night' },
] as const;
export type Look = (typeof LOOKS)[number]['id'];

const STORE = 'brick-stash-look';
const listeners = new Set<() => void>();
const valid = (v: string | null): v is Look => LOOKS.some((l) => l.id === v);
let look: Look = (() => {
  try {
    const v = localStorage.getItem(STORE);
    return valid(v) ? v : 'bright';
  } catch {
    return 'bright';
  }
})();

export const applyLook = () => document.documentElement.setAttribute('data-look', look);

export function setLook(next: Look) {
  look = next;
  try {
    localStorage.setItem(STORE, next);
  } catch {
    /* only a convenience */
  }
  applyLook();
  listeners.forEach((l) => l());
}

export const useLook = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => look,
  );
