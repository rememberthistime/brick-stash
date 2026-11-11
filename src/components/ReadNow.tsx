// "Read new photos now": asks the development box to read the photos without waiting for the evening run, and shows
// how that's going. The server only leaves the request where the box will find it, so it can take up to a minute to start.
import { useCallback, useEffect, useRef, useState } from 'react';

interface Reading {
  /** when a reading was asked for and not yet started, ms */
  requested: number | null;
  status: { state: 'running' | 'done'; started: number; finished?: number; ok?: boolean; summary?: string } | null;
  /** the server's clock, so ages don't depend on this device's */
  now: number;
}

/** A request should be taken up within a minute; after this long, something's not running */
const SLOW_START_MS = 150_000;
/** A run that's been "running" longer than this was cut off */
const STUCK_MS = 3 * 3600_000;

const minutes = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 1 ? 'just now' : `${m} min ago`;
};
const when = (ms: number) => new Date(ms).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function ReadNow({ onRead }: { onRead?: () => void }) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState('');
  const wasBusy = useRef(false);

  const running = !!reading?.status && reading.status.state === 'running' && reading.now - reading.status.started < STUCK_MS;
  const asked = reading?.requested != null;
  const busy = running || asked;

  const check = useCallback(() => {
    fetch('/api/read-photos')
      // A server from before this was added says 404, and then there's nothing to offer
      .then((r) => (r.ok ? r.json() : null))
      .then(setReading)
      .catch(() => {
        /* the next check will try again */
      });
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, busy ? 8000 : 45000);
    return () => clearInterval(timer);
  }, [check, busy]);

  // New drafts are there to show once a reading has finished
  useEffect(() => {
    if (wasBusy.current && !busy && reading?.status?.state === 'done') onRead?.();
    wasBusy.current = busy;
  }, [busy, reading, onRead]);

  if (!reading) return null;
  const { status, requested, now } = reading;

  const ask = async () => {
    setError('');
    try {
      const r = await fetch('/api/read-photos', { method: 'POST' });
      if (!r.ok) throw new Error(`The server said ${r.status}.`);
      setReading(await r.json());
    } catch (e) {
      setError(e instanceof TypeError ? 'Couldn’t reach the server.' : (e as Error).message);
    }
  };

  return (
    <div className="read-now">
      <button className="ghost" disabled={busy} onClick={() => void ask()}>
        Read new photos now
      </button>
      <span className="muted small" aria-live="polite">
        {error ||
          (running
            ? `Reading photos… started ${minutes(now - status!.started)}. It can take a while with a lot of photos.${asked ? ' It will run again afterwards for the photos added since.' : ''}`
            : asked
              ? now - requested! > SLOW_START_MS
                ? `Asked ${minutes(now - requested!)} but not started. The development box checks every minute: is it running, and rebuilt since this button was added?`
                : 'Asked. It starts within a minute.'
              : status?.state === 'done' && status.finished
                ? `Last read ${when(status.finished)}${status.ok === false ? ', which ended with an error' : ''}.`
                : status
                  ? 'The last reading was cut off before it finished.'
                  : 'Otherwise they’re read each evening.')}
      </span>
      {!busy && status?.state === 'done' && status.summary && (
        <details className="read-now-summary">
          <summary className="small">What it said</summary>
          <pre>{status.summary}</pre>
        </details>
      )}
    </div>
  );
}
