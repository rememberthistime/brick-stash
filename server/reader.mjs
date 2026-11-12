// Reading drawer photos into drafts: Claude Code, run by this server with nobody watching, each evening and whenever
// the app asks. It needs the `claude` program (signed in) and the photo tool, which the Docker image has; where
// they're missing, such as on a PC running `npm run serve`, the app simply doesn't offer it.
//
// Claude is only asked to look at photos. Everything that doesn't need looking is done here, because every token
// Claude reads or writes is paid for, and again on each step of a run:
// - this server works out which drawers have photos newer than their draft, so nothing new costs nothing;
// - each drawer is read in a run of its own, so one drawer's pictures aren't carried through the next one's;
// - Claude writes just that drawer's draft, and this server backs up and files it with the others.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_RUN_MS = 45 * 60_000;
const SUMMARY_LENGTH = 4000;
const PHOTO_NAME = /^([A-Z]+\d*)-(piece|closeup|top|side)(?:-(\d+))?(?:-at-(\d{1,2})-(\d{1,2}))?\.(jpe?g|png|webp)$/i;

const onPath = (name) => (process.env.PATH ?? '').split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, name)));
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const mtimeOf = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const writeJson = (file, value, indent) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, indent));
  fs.renameSync(`${file}.tmp`, file);
};

/** The first of these that exists: the catalogue in the built app, or in the source tree */
const findParts = () => [path.join(HERE, '..', 'dist', 'data', 'parts.json'), path.join(HERE, '..', 'public', 'data', 'parts.json')].find((f) => fs.existsSync(f)) ?? '';

export const readerDefaults = ({ dataDir, photosDir }) => ({
  dataDir,
  photosDir,
  // Crops and reference pictures, each drawer's draft as Claude wrote it, and the last run's output
  workDir: process.env.BRICK_WORK_DIR ?? path.join(os.homedir(), '.brick-stash', 'work'),
  // The image's own copy, which belongs to root, so a run can't rewrite it and then run it
  tool: process.env.BRICK_PHOTO_TOOL ?? '/usr/local/bin/photo-tools',
  // Sonnet reads photos for about a fifth of what the largest model costs. "opus", or a full model name, for more care.
  model: process.env.BRICK_READ_MODEL || 'sonnet',
  // The most drawers read in one go, so a big batch of photos can't run away. The rest wait for the next go.
  maxDrawers: Math.max(1, Number(process.env.BRICK_READ_MAX) || 5),
});

/**
 * What a run may do, so text in a photo can't talk it into anything else:
 * - read anything, but write only in the folder it runs in. Not the photos, the drafts or the project (this server
 *   files what it produces), and not the app's own code;
 * - run only the photo tool and ls.
 * Anything else is refused rather than asked about, as nobody is there to answer.
 */
function runClaude({ prompt, cwd, photosDir, tool, model }) {
  const args = ['-p', prompt, '--model', model, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Glob', 'Grep', `Bash(${tool}:*)`, 'Bash(ls:*)', '--output-format', 'json'];
  const child = spawn('claude', args, { cwd, env: { ...process.env, BRICK_PHOTOS: photosDir, BRICK_WORK: cwd, DISABLE_AUTOUPDATER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (err += c));
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), MAX_RUN_MS);
    const finish = (result) => {
      clearTimeout(timer);
      resolve(result);
    };
    child.on('error', (e) => finish({ ok: false, text: `Couldn't start claude: ${e.message}` }));
    child.on('close', (code) => {
      // With --output-format json, the last thing printed says what Claude said and what the run cost
      let said = null;
      try {
        said = JSON.parse(out.trim().split('\n').pop());
      } catch {
        /* not JSON: an error before Claude got going */
      }
      if (said && typeof said === 'object') finish({ ok: code === 0 && !said.is_error, text: String(said.result ?? ''), cost: Number(said.total_cost_usd) || 0 });
      else finish({ ok: false, text: `${out}\n${err}`.trim() });
    });
  });
}

/** `run` and `available` can be swapped out, to test without Claude */
export function createReader({ dataDir, photosDir, workDir, tool, model = 'sonnet', maxDrawers = 5, run = runClaude, available = () => fs.existsSync(tool) && onPath('claude'), log = console.log, partsFile = findParts() }) {
  const statusFile = path.join(dataDir, 'read-status.json');
  // When each drawer was last read, and whether that worked
  const logFile = path.join(dataDir, 'read-log.json');
  const draftsFile = path.join(photosDir, 'drawer-drafts.json');
  const reviewsFile = path.join(photosDir, 'reviews.json');
  const notesFile = path.join(photosDir, 'identification-notes.md');
  let running = false;
  /** when another reading was asked for during this one */
  let queued = null;

  const readStatus = () => {
    const s = readJson(statusFile);
    return s && typeof s === 'object' ? s : null;
  };
  const writeStatus = (status) => {
    try {
      writeJson(statusFile, status);
    } catch (e) {
      log(`Couldn't record how the photo reading went: ${e.message}`);
    }
  };
  const readLog = () => {
    const l = readJson(logFile);
    return l && typeof l === 'object' && l.drawers && typeof l.drawers === 'object' ? l : { drawers: {} };
  };
  // A run this server didn't see the end of was cut off, by a restart or an update
  const left = readStatus();
  if (left?.state === 'running') writeStatus({ state: 'done', started: left.started, finished: Date.now(), ok: false, summary: 'The app was restarted while photos were being read. Ask again to read them.' });

  const readDrafts = () => {
    const d = readJson(draftsFile);
    return d && Array.isArray(d.drawers) ? d : { drawers: [] };
  };
  /** The code a draft's photos are filed under: a draft can be filed as "A3?" until its code is confirmed */
  const photoCode = (d) => String(d.photos ?? d.code ?? '').replace(/\?$/, '').toUpperCase();

  function photosByDrawer() {
    const out = new Map();
    let names = [];
    try {
      names = fs.readdirSync(photosDir);
    } catch {
      /* no photos folder yet */
    }
    for (const name of names) {
      const m = name.match(PHOTO_NAME);
      if (!m) continue;
      const code = m[1].toUpperCase();
      const photo = { name, view: m[2].toLowerCase(), ...(m[4] === undefined ? {} : { at: { x: Number(m[4]), y: Number(m[5]) } }), taken: Math.round(mtimeOf(path.join(photosDir, name))) };
      out.set(code, [...(out.get(code) ?? []), photo]);
    }
    for (const list of out.values()) list.sort((a, b) => a.taken - b.taken);
    return out;
  }

  /**
   * Drawers to read: those with a photo from above, and photos newer than their last reading. A draft from before
   * readings were logged counts as read when the drafts file last changed. One that failed is only tried again when
   * the user asks, so a drawer that can't be read doesn't cost a run every evening.
   */
  function pending(asked) {
    const drawers = readLog().drawers;
    const drafted = new Set(readDrafts().drawers.map(photoCode));
    const draftsChanged = mtimeOf(draftsFile);
    const out = [];
    for (const [code, photos] of photosByDrawer()) {
      if (!photos.some((p) => p.view === 'top')) continue;
      const last = drawers[code];
      const readAt = last?.at ?? (drafted.has(code) ? draftsChanged : 0);
      if (Math.max(...photos.map((p) => p.taken)) > readAt || (asked && last && !last.ok)) out.push(code);
    }
    return out.sort(natural);
  }

  /** Drawers whose answers on /review are newer than the notes last learnt from */
  function answered() {
    const since = readLog().lessonsAt ?? mtimeOf(notesFile);
    if (!fs.existsSync(notesFile) || mtimeOf(reviewsFile) <= since) return [];
    return Object.entries(readJson(reviewsFile) ?? {})
      // A draft the user has marked as finished with has nothing more to teach
      .filter(([, r]) => r && typeof r === 'object' && !r.closed && (r.updated ?? 0) > since)
      .map(([code]) => code)
      .sort(natural);
  }

  /** The collection as a list Claude can search without reading the whole project */
  function writeCollection() {
    const file = path.join(workDir, 'collection.tsv');
    const catalog = readJson(partsFile) ?? {};
    const canonical = (num) => {
      let p = num;
      for (let i = 0; i < 6 && catalog.aliases?.[p] && catalog.aliases[p] !== p; i++) p = catalog.aliases[p];
      return p;
    };
    const qty = new Map();
    for (const r of readJson(path.join(dataDir, 'project.json'))?.rows ?? []) {
      const num = canonical(String(r.partNum ?? '').trim());
      if (num && r.qty > 0) qty.set(num, (qty.get(num) ?? 0) + r.qty);
    }
    const lines = [...qty].sort((a, b) => natural(a[0], b[0])).map(([num, n]) => `${num}\t${n}\t${catalog.parts?.[num]?.[0] ?? ''}`);
    fs.writeFileSync(file, `part\tquantity\tname\n${lines.join('\n')}\n`);
    return file;
  }

  const fill = (file, values) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), fs.readFileSync(path.join(HERE, file), 'utf8'));

  /** A draft as Claude wrote it, or why it can't be used */
  function checkedDraft(file) {
    if (!fs.existsSync(file)) return { error: 'no draft was written' };
    const d = readJson(file);
    if (!d || typeof d !== 'object' || !Array.isArray(d.pockets)) return { error: 'the draft isn’t valid JSON with a list of pockets' };
    const strings = (v) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
    if (!d.pockets.every((p) => p && typeof p === 'object' && Array.isArray(p.parts) && strings(p.parts) && strings(p.maybe))) return { error: 'a pocket in the draft has no list of parts' };
    // The app works sizes out from these, so anything that isn't a share of 0 to 1 is dropped rather than passed on
    const share = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : typeof v === 'number' && v > 1 && v <= 100 ? v / 100 : undefined);
    const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const area = (a) => (a && [a.x, a.y, a.w, a.h].every((n) => typeof n === 'number' && n >= 0 && n <= 100) ? { x: a.x, y: a.y, w: a.w, h: a.h } : undefined);
    const pockets = d.pockets.map((p) => JSON.parse(JSON.stringify({ ...p, share: share(p.share), fill: share(p.fill), where: text(p.where), ask: text(p.ask), label: text(p.label), area: area(p.area) })));
    return { draft: { ...d, pockets, note: text(d.note) } };
  }

  /** File one drawer's draft with the rest, in place of any it already had */
  function fileDraft(code, draft) {
    const drafts = readDrafts();
    const at = drafts.drawers.findIndex((d) => photoCode(d) === code);
    const old = at >= 0 ? drafts.drawers[at] : null;
    // A draft keeps the code it was filed under, such as "A3?", which the user's answers are kept by
    const entry = { ...draft, code: old?.code ?? code, ...(old?.photos ? { photos: old.photos } : {}) };
    if (old) drafts.drawers[at] = entry;
    else drafts.drawers.push(entry);
    writeJson(draftsFile, drafts, 1);
    // A draft marked as finished with is worth checking again once it's been read afresh
    const reviews = readJson(reviewsFile);
    const key = String(entry.code).toUpperCase();
    if (reviews?.[key]?.closed) {
      delete reviews[key].closed;
      writeJson(reviewsFile, reviews, 1);
    }
  }

  async function readDrawer(code, photos, collection) {
    const dir = path.join(workDir, code);
    fs.mkdirSync(dir, { recursive: true });
    const draftFile = path.join(dir, 'draft.json');
    fs.rmSync(draftFile, { force: true });
    const old = readDrafts().drawers.find((d) => photoCode(d) === code);
    const context = {
      code,
      photos,
      latestTopPhoto: photos.filter((p) => p.view === 'top').pop()?.name,
      ...(old ? { earlierDraft: old, answers: (readJson(reviewsFile) ?? {})[String(old.code).toUpperCase()] ?? null } : {}),
      boxNames: (readJson(path.join(photosDir, 'boxes.json')) ?? {})[code] ?? [],
    };
    writeJson(path.join(dir, 'context.json'), context, 1);
    const started = Date.now();
    const prompt = fill('read-drawer.md', { CODE: code, WORK: dir, NOTES: notesFile, COLLECTION: collection, PARTS: partsFile, PHOTOS: photosDir, TOOL: tool });
    const r = await run({ kind: 'drawer', code, prompt, cwd: dir, photosDir, tool, model });
    let error = r.ok ? null : 'the run ended with an error';
    if (r.ok) {
      const checked = checkedDraft(draftFile);
      if (checked.draft) fileDraft(code, checked.draft);
      else error = checked.error;
    }
    const drawers = { ...readLog().drawers, [code]: { at: started, ok: !error } };
    writeJson(logFile, { ...readLog(), drawers });
    return { code, ok: !error, error, text: r.text ?? '', cost: r.cost ?? 0 };
  }

  /** Have Claude score the user's answers and add what they teach to the notes, on a copy that's then put back */
  async function learn(changed, read) {
    const dir = path.join(workDir, 'lessons');
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, 'identification-notes.md');
    const before = fs.readFileSync(notesFile, 'utf8');
    fs.writeFileSync(copy, before);
    const started = Date.now();
    const prompt = fill('read-lessons.md', { WORK: dir, PHOTOS: photosDir, CHANGED: changed.join(', ') || 'none', READ: read.join(', ') || 'none' });
    const r = await run({ kind: 'lessons', prompt, cwd: dir, photosDir, tool, model });
    const after = r.ok ? fs.readFileSync(copy, 'utf8') : '';
    // Notes that came back much shorter were rewritten, not added to, so they're left as they were
    const kept = r.ok && after.trim() && after.length >= before.length * 0.8;
    if (kept && after !== before) {
      fs.writeFileSync(path.join(dir, 'notes-before.md'), before);
      fs.writeFileSync(`${notesFile}.tmp`, after);
      fs.renameSync(`${notesFile}.tmp`, notesFile);
    }
    if (kept) writeJson(logFile, { ...readLog(), lessonsAt: started });
    return { ok: !!kept, text: r.text ?? '', cost: r.cost ?? 0 };
  }

  async function session(why, asked) {
    running = true;
    const started = Date.now();
    writeStatus({ state: 'running', started });
    let ok = true;
    let cost = 0;
    const said = [];
    const read = [];
    const failed = [];
    let waiting = 0;
    try {
      const due = pending(asked);
      const now = due.slice(0, maxDrawers);
      waiting = due.length - now.length;
      const changed = answered();
      if (!now.length && !changed.length) said.push('Nothing new to read.');
      else {
        log(`Reading drawer photos (${why}): ${now.join(', ') || 'no new drawers'}${waiting ? `, ${waiting} more waiting` : ''}${changed.length ? `; answers to learn from: ${changed.join(', ')}` : ''}`);
        fs.mkdirSync(workDir, { recursive: true });
        const photos = photosByDrawer();
        const collection = now.length ? writeCollection() : '';
        // Kept beside the drafts, as before, in case a reading goes wrong
        if (now.length && fs.existsSync(draftsFile)) fs.copyFileSync(draftsFile, path.join(photosDir, 'drawer-drafts.backup.json'));
        for (const [i, code] of now.entries()) {
          writeStatus({ state: 'running', started, reading: code, step: i + 1, steps: now.length, read, failed });
          const r = await readDrawer(code, photos.get(code), collection);
          cost += r.cost;
          (r.ok ? read : failed).push(code);
          said.push(`${code}${r.ok ? '' : ` (not read: ${r.error})`}\n${r.text.trim()}`);
          if (!r.ok && /\/login|api key|not logged in|authenticat/i.test(r.text)) {
            said.push('Claude isn’t signed in. Open the container’s console, run "claude" and sign in, then ask again.');
            waiting += now.length - i - 1;
            break;
          }
        }
        if (changed.length && !failed.length) {
          writeStatus({ state: 'running', started, reading: 'the answers you’ve given', read, failed });
          const r = await learn(changed, read);
          cost += r.cost;
          if (r.text.trim()) said.push(`Notes\n${r.text.trim()}`);
        }
        ok = !failed.length;
      }
    } catch (e) {
      ok = false;
      said.push(e.message);
    }
    if (waiting) said.push(`${waiting} more ${waiting === 1 ? 'drawer is' : 'drawers are'} waiting. Ask again to read ${waiting === 1 ? 'it' : 'them'}, or leave ${waiting === 1 ? 'it' : 'them'} for this evening.`);
    const summary = said.join('\n\n');
    try {
      fs.mkdirSync(workDir, { recursive: true });
      fs.writeFileSync(path.join(workDir, 'last-run.txt'), summary);
    } catch {
      /* the summary below is what the app shows */
    }
    writeStatus({ state: 'done', started, finished: Date.now(), ok, read, failed, waiting, cost: Math.round(cost * 100) / 100, summary: summary.slice(-SUMMARY_LENGTH) });
    if (read.length || failed.length || cost) log(`Photo reading finished after ${Math.round((Date.now() - started) / 1000)}s: read ${read.join(', ') || 'none'}${failed.length ? `, failed ${failed.join(', ')}` : ''}, about US$${cost.toFixed(2)}`);
    running = false;
    // Photos added during the run haven't been looked at, so a reading asked for meanwhile follows on
    if (queued !== null) {
      queued = null;
      void session('asked for during the last one', true);
    }
  }

  return {
    state: () => ({ available: available(), requested: queued, status: readStatus(), now: Date.now() }),
    /** Drawers a reading would look at now */
    pending,
    /** Read now, or straight after the reading that's under way. False if it can't be done here. */
    ask() {
      if (!available()) return false;
      if (running) queued ??= Date.now();
      else void session('asked for in the app', true);
      return true;
    },
    /** Read every day at a time like "21:07", by this machine's clock, if there's anything new */
    schedule(at) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(at ?? '');
      if (!m || !available()) return null;
      const next = () => {
        const now = new Date();
        const then = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]));
        if (then <= now) then.setDate(then.getDate() + 1);
        return then;
      };
      const arm = () => {
        const timer = setTimeout(() => {
          if (!running && (pending(false).length || answered().length)) void session('the evening run', false);
          arm();
        }, next() - Date.now());
        timer.unref?.();
      };
      arm();
      return next();
    },
  };
}
