# Working on Brick Stash

A LEGO storage planner (Vite, React, TypeScript, Vitest, a dependency-free Node server). README.md explains the app, its code map and the user's flagged issues; read it first.

## The user
- Australian. Use AUD and Australian shops (Officeworks, Spotlight, Howards Storage World).
- Design rules: store by type, not colour; keeping similar parts together beats saving space; leave headroom. Changes to a plan are always optional and never automatic. Drawers recorded on My storage are never changed by the planner: it only suggests for the parts and drawers not yet recorded.
- They keep a "Flagged issues" list at the end of README.md. Tick items off there with a short note.

## Where it runs
- **On the NAS** (the normal setup), one container, `brick-stash`, on port 5173, runs the image GitHub builds from `main` (`ghcr.io/rememberthistime/brick-stash`). The user updates it from Unraid's Docker tab. Its live data is `/mnt/user/data/projects/lego` on the NAS (`/data` in the container): `project.json` and `backups/`. It's served at https://lego.brindo.de through the NAS's reverse proxy, on the home network only. There is no development box and no test server on the NAS any more.
- **On the PC**, `npm run serve` serves the built `dist/` on 5173 from `data/`.
- Code is changed in Claude Code sessions on the repository (often in the cloud, with no access to the NAS or its data) or on the PC.


## Rules
- Never change the live data while developing. Test on another port with `BRICK_DATA_DIR` pointed at a scratch folder.
- On the PC, never build into `dist/`, as that changes the page the user's running server sends out. Check builds with `npx vite build --outDir <scratch folder>`.
- A change is live once it's merged to `main`, the image has built, and the user has updated the container. Say when a change needs that. A change to the `Dockerfile` can't be tried without Docker, so say when one is untested.
- Run `npm test` and `npx tsc --noEmit` before calling work done.
- Commit and push only when asked.
- Never enter the user's Rebrickable key or any other credentials. Don't build Brick Architect's label artwork into the app: it isn't licensed for reuse.
