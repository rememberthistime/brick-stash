// The one switch for the app's suggestions. Off, the storage pages show only what you've recorded. On, its ideas
// appear beside your own work: room beside the same sort of parts, the plan for drawers with nothing recorded, and
// moves worth making. Remembered on each device.
import { useSyncExternalStore } from 'react';

const STORE = 'brick-stash-suggestions';
const listeners = new Set<() => void>();
let on = (() => {
  try {
    return localStorage.getItem(STORE) === 'on';
  } catch {
    return false;
  }
})();

export function setSuggestions(next: boolean) {
  on = next;
  try {
    localStorage.setItem(STORE, next ? 'on' : 'off');
  } catch {
    /* only a convenience */
  }
  listeners.forEach((l) => l());
}

export function useSuggestions(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
  );
}

export function SuggestionsSwitch() {
  const value = useSuggestions();
  return (
    <button className={`switch ${value ? 'on' : ''}`} role="switch" aria-checked={value} onClick={() => setSuggestions(!value)} title={value ? 'Hide the app’s suggestions: show only what you’ve recorded' : 'Show the app’s suggestions beside your own layout'}>
      <span className="switch-track" aria-hidden>
        <span className="switch-knob" />
      </span>
      Suggestions {value ? 'on' : 'off'}
    </button>
  );
}
