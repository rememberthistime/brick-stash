// Reading drawer photos into drafts: Claude Code, run by this server with nobody watching, each evening and whenever
// the app asks. It needs the `claude` program (signed in) and the photo tool, which the Docker image has; where
// they're missing, such as on a PC running `npm run serve`, the app simply doesn't offer it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_RUN_MS = 2 * 3600_000;
const SUMMARY_LENGTH = 2000;

const onPath = (name) => (process.env.PATH ?? '').split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, name)));

/** The first of these that exists: the catalogue in the built app, or in the source tree */
const partsFile = () => [path.join(HERE, '..', 'dist', 'data', 'parts.json'), path.join(HERE, '..', 'public', 'data', 'parts.json')].find((f) => fs.existsSync(f)) ?? '';

export const readerDefaults = ({ dataDir, photosDir }) => ({
  dataDir,
  photosDir,
  // Crops and reference pictures, the last run's output, and nothing else
  workDir: process.env.BRICK_WORK_DIR ?? path.join(os.homedir(), '.brick-stash', 'work'),
  // The image's own copy, which belongs to root, so a run can't rewrite it and then run it
  tool: process.env.BRICK_PHOTO_TOOL ?? '/usr/local/bin/photo-tools',
  promptFile: path.join(HERE, 'read-photos.md'),
});

/**
 * What a run may do, so text in a photo can't talk it into anything else:
 * - read anything, but write only in the work folder (where it runs) and the photos folder. Not the project beside
 *   the photos, and not the app's own code;
 * - run only the photo tool and ls.
 * Anything else is refused rather than asked about, as nobody is there to answer.
 */
function runClaude({ prompt, workDir, photosDir, tool }, onOutput) {
  const args = ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Glob', 'Grep', `Bash(${tool}:*)`, 'Bash(ls:*)', '--add-dir', photosDir];
  const child = spawn('claude', args, { cwd: workDir, env: { ...process.env, BRICK_PHOTOS: photosDir, BRICK_WORK: workDir, DISABLE_AUTOUPDATER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', onOutput);
  child.stderr.on('data', onOutput);
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), MAX_RUN_MS);
    const finish = (ok) => {
      clearTimeout(timer);
      resolve(ok);
    };
    child.on('error', (e) => {
      onOutput(`Couldn't start claude: ${e.message}\n`);
      finish(false);
    });
    child.on('close', (code) => finish(code === 0));
  });
}

/** `run` and `available` can be swapped out, to test without Claude */
export function createReader({ dataDir, photosDir, workDir, tool, promptFile, run = runClaude, available = () => fs.existsSync(tool) && onPath('claude'), log = console.log }) {
  const statusFile = path.join(dataDir, 'read-status.json');
  let running = false;
  /** when another reading was asked for during this one */
  let queued = null;

  const readStatus = () => {
    try {
      const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      return s && typeof s === 'object' ? s : null;
    } catch {
      return null;
    }
  };
  const writeStatus = (status) => {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(`${statusFile}.tmp`, JSON.stringify(status));
      fs.renameSync(`${statusFile}.tmp`, statusFile);
    } catch (e) {
      log(`Couldn't record how the photo reading went: ${e.message}`);
    }
  };
  // A run this server didn't see the end of was cut off, by a restart or an update
  const left = readStatus();
  if (left?.state === 'running') writeStatus({ state: 'done', started: left.started, finished: Date.now(), ok: false, summary: 'The app was restarted while photos were being read. Ask again to read them.' });

  const prompt = () =>
    fs
      .readFileSync(promptFile, 'utf8')
      .replaceAll('{PHOTOS}', photosDir)
      .replaceAll('{PROJECT}', path.join(dataDir, 'project.json'))
      .replaceAll('{PARTS}', partsFile())
      .replaceAll('{WORK}', workDir)
      .replaceAll('{TOOL}', tool);

  async function start(why) {
    running = true;
    const started = Date.now();
    writeStatus({ state: 'running', started });
    log(`Reading new drawer photos (${why})`);
    let output = '';
    let ok = false;
    try {
      fs.mkdirSync(workDir, { recursive: true });
      fs.mkdirSync(photosDir, { recursive: true });
      ok = await run({ prompt: prompt(), workDir, photosDir, tool }, (chunk) => (output += chunk));
    } catch (e) {
      output += `\n${e.message}`;
    }
    if (!ok && /\/login|api key|not logged in|authenticat/i.test(output)) output += '\nClaude isn’t signed in. Open the container’s console, run "claude" and sign in, then ask again.';
    try {
      fs.writeFileSync(path.join(workDir, 'last-run.txt'), output);
    } catch {
      /* the summary below is what the app shows */
    }
    writeStatus({ state: 'done', started, finished: Date.now(), ok, summary: output.trim().slice(-SUMMARY_LENGTH) });
    log(`Photo reading finished${ok ? '' : ' with an error'}, after ${Math.round((Date.now() - started) / 1000)}s`);
    running = false;
    // Photos added during the run haven't been read, so one asked for meanwhile follows on
    if (queued !== null) {
      queued = null;
      void start('asked for during the last one');
    }
  }

  /** Is there a photo, box name or answer newer than the last reading began? */
  function somethingNew() {
    const last = readStatus();
    if (!last?.started || last.ok === false) return true;
    try {
      return fs.readdirSync(photosDir).some((name) => /\.(jpe?g|png|webp)$/i.test(name) || name === 'reviews.json' || name === 'boxes.json' ? fs.statSync(path.join(photosDir, name)).mtimeMs > last.started : false);
    } catch {
      return false;
    }
  }

  return {
    state: () => ({ available: available(), requested: queued, status: readStatus(), now: Date.now() }),
    /** Read now, or straight after the reading that's under way. False if it can't be done here. */
    ask() {
      if (!available()) return false;
      if (running) queued ??= Date.now();
      else void start('asked for in the app');
      return true;
    },
    /** Read every day at a time like "21:07", by this machine's clock, if anything has changed since the last reading */
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
          if (!running && somethingNew()) void start('the evening run');
          else log(running ? 'Evening photo reading skipped: one is already running.' : 'Evening photo reading skipped: nothing new since the last one.');
          arm();
        }, next() - Date.now());
        timer.unref?.();
      };
      arm();
      return next();
    },
  };
}
