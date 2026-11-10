# Working on Brick Stash

A LEGO storage planner (Vite, React, TypeScript, Vitest, a dependency-free Node server). README.md explains the app, its code map and the user's flagged issues; read it first.

## The user
- Australian. Use AUD and Australian shops (Officeworks, Spotlight, Howards Storage World).
- Design rules: store by type, not colour; keeping similar parts together beats saving space; leave headroom. Changes to a plan are always optional and never automatic.
- They keep a "Flagged issues" list at the end of README.md. Tick items off there with a short note.

## Where it runs
- **On the NAS** (the normal setup), the app runs in the `brick-stash` container on port 5173, built from `main` by `nas/deploy.sh`. Its live data is `/live/project.json` and `/live/photos/` inside the development box (`/mnt/user/appdata/brick-stash` on the NAS).
- **On the PC**, `npm run serve` serves the built `dist/` on 5173 from `data/` and `photos/`.

## Rules
- Never change the live data while developing. Test with `nas/dev-server.sh` (port 5174, copies of the live data). On the PC, test on another port with `BRICK_DATA_DIR` and `BRICK_PHOTOS_DIR` pointed at scratch folders.
- On the PC, never build into `dist/`, as that changes the page the user's running server sends out. Check builds with `npx vite build --outDir <scratch folder>`.
- After changing server code, the running app needs redeploying (NAS) or restarting `npm run serve` (PC). Say so.
- Run `npm test` and `npx tsc --noEmit` before calling work done.
- Commit and push only when asked. Deploy (`bash nas/deploy.sh`) only when asked, from `main` with everything committed.
- Never enter the user's Rebrickable key or any other credentials. Don't build Brick Architect's label artwork into the app: it isn't licensed for reuse.

## Reading drawer photos
Before reading photos or changing drafts, read `photos/identification-notes.md` and `photos/reviews.json`, in the live photos folder on the NAS. The user checks drafts on `/review`. The evening job (`nas/read-photos.sh`, run by cron in the development box) does the same reading unattended.
