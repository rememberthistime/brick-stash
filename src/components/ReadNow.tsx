// "Read new photos now": has the server read the photos without waiting for the evening run, and shows how that's going.
import { useCallback, useEffect, useRef, useState } from 'react';

interface Reading {
  /** false where the server has no Claude Code or photo tool to read with */
  available?: boolean;
  /** when another reading was asked for, to follow the one under way, ms */
  requested: number | null;
  status: {
    state: 'running' | 'done';
    started: number;
    finished?: number;
    ok?: boolean;
    summary?: string;
    /** while running: the drawer being read, and which of how many it is */
    reading?: string;
    step?: number;
    steps?: number;
    /** drawers read, drawers that couldn't be, and how many are left for next time */
    read?: string[];
    failed?: string[];
    waiting?: number;
    /** what Claude Code reckons the run cost, US$ */
    cost?: number;
  } | null;
  /** the server's clock, so ages don't depend on this device's */
  now: number;
}

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

  if (!reading || reading.available === false) return null;
  const { status, now } = reading;

  const ask = async () => {
    setError('');
    try {
      const r = await fetch('/api/read-photos', { method: 'POST' });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}.`);
      setReading(body);
    } catch (e) {
      setError(e instanceof TypeError ? 'Couldn’t reach the server.' : (e as Error).message);
    }
  };

  return (
    <div className="read-now">
      <button className="ghost" disabled={asked} onClick={() => void ask()} title={running ? 'Photos are being read now. Press to read again afterwards, for photos added since.' : undefined}>
        Read new photos now
      </button>
      <span className="muted small" aria-live="polite">
        {error ||
          (running
            ? `Reading ${status!.reading ?? 'photos'}${status!.steps ? ` (${status!.step} of ${status!.steps})` : ''}… started ${minutes(now - status!.started)}.${asked ? ' It will run again afterwards for the photos added since.' : ''}`
            : asked
              ? 'Starting…'
              : status?.state === 'done' && status.finished
                ? [
                    `Last read ${when(status.finished)}:`,
                    status.read?.length ? status.read.join(', ') : status.failed?.length ? 'nothing' : 'nothing new',
                    status.failed?.length ? `(couldn’t read ${status.failed.join(', ')})` : status.ok === false && !status.read?.length ? '(it ended with an error)' : '',
                    status.waiting ? `· ${status.waiting} more waiting` : '',
                    status.cost ? `· about US$${status.cost.toFixed(2)} of Claude use` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                : status
                  ? 'The last reading was cut off before it finished.'
                  : 'Otherwise they’re read each evening, if there’s anything new.')}
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
