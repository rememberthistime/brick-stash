# Brick Stash — LEGO storage planner

Tell it what parts you own and what storage you have; it works out what goes where — sorted **by type, not colour**, with **room to grow** built in.

```bash
npm install
npm run serve      # build and run for every device on your network, http://localhost:5173
npm run dev        # the same, for working on the code (this computer only)
npm test
npm run fetch-data # refresh the Rebrickable part catalogue (public/data/parts.json)
```

## Running it for your phone

`npm run serve` prints the address to open on your phone, which is also shown on the My setup tab. Phone and computer need to be on the same network, and Windows may ask you to let Node through its firewall the first time.

Your project is saved in `data/project.json` (with the version before it in `project.previous.json`), and photos go in `photos/`. The server also keeps the project as it stood before the first change of each day, for 30 days, in `data/backups/`; **Earlier versions…** at the top of the app lists them and brings one back. A browser that already has a project moves it to the server the first time it opens the app at the same address. Elsewhere, use **Save project** and **Open…**. There's no password, so keep it on your home network: don't forward a port to it. Tailscale is fine for reaching it while you're out.

### On Unraid (always on, with Claude there too)

This runs everything on the NAS, so the PC doesn't need to be on:
- **The app** (container `brick-stash`, port 5173) at `https://lego.brindo.de`, with `/snap` and `/review`, for every device on your network. HTTPS comes from the reverse proxy (SWAG), which also lets the phone use its camera.
- **A development box** (container `brick-stash-dev`) with Node, git, GitHub CLI, Claude Code and Python. You and Claude work on the code there over SSH (port 2222), it tests on port 5174 (`https://lego-dev.brindo.de`) with copies of your data, and it runs the evening photo reading.

Your data lives in `/mnt/user/data/projects/lego` (`project.json` and `photos/`), with your other projects and outside both containers, so rebuilding either one never touches it. It isn't in the appdata backup, so back that folder up separately. The code and the development box's home folder, logins and SSH keys are in `/mnt/user/appdata/brick-stash-dev`. The addresses and folders are set at the top of `nas/install.sh` and `nas/deploy.sh`.

**Setting it up (once)**

1. On the PC, stop `npm run serve`, so your project doesn't change while it's copied.
2. Copy this whole folder to the NAS, leaving out `node_modules`, `dist` and `data-raw`. Do bring `.git`, `data/` and `photos/`. For example, copy it into a share, then in the Unraid terminal move it to `/mnt/user/appdata/brick-stash-dev/repo`. `nas/authorized_keys` holds your PC's SSH public key, so it comes along and lets you sign in.
3. In the Unraid terminal:
   ```bash
   bash /mnt/user/appdata/brick-stash-dev/repo/nas/install.sh
   ```
   This copies your project and photos into the app's data folder, unless the NAS already has them. It then builds and starts both containers. The development box can't use the NAS's Docker, so Claude there can't redeploy the app: you do that in the Unraid terminal. `--with-docker` would let it, but that gives it full control of the NAS, so it's off by default.
4. Sign in to the development box from the PC: `ssh -p 2222 dev@<NAS address>`. Then, once:
   ```bash
   gh auth login        # GitHub.com, HTTPS, log in with a browser
   gh auth setup-git
   claude               # sign in to your Claude account, then /exit
   cd ~/brick-stash && npm ci && npm test
   ```
5. Open the app at `https://lego.brindo.de` on each device and re-enter your Rebrickable key, as browsers keep it (and the first-open move of a project) per address. Use that address from the start, rather than the NAS's IP and port, so you only do this once. Then turn off the PC's evening task (Scheduled in the Claude app sidebar), so photos aren't read twice.

Give the NAS a fixed address on your router, so bookmarks and SSH keep working. There's no password on the app, so keep it on your home network; Tailscale is fine for reaching it while you're out.

**Working on it from any device**
- **Claude desktop app:** add an SSH connection to `dev@<NAS address>` on port 2222 and open a Code session in `~/brick-stash`. Claude then runs on the NAS. VS Code's Remote-SSH works the same way.
- **Phone or browser:** start Claude in the development box (`claude`) and turn on Remote Control to carry on from claude.ai or the Claude app.
- **Testing a change:** `bash nas/dev-server.sh` serves the working copy at `https://lego-dev.brindo.de`, with fresh copies of the live data that get thrown away.
- **Putting it live:** commit to `main`, then in the Unraid terminal `bash /mnt/user/appdata/brick-stash-dev/repo/nas/deploy.sh`. It refuses a branch other than `main`, uncommitted changes, or a data folder with no project in it, unless given `--force`, and keeps your data.
- **Updating the development box** (for a newer Claude Code): `bash /mnt/user/appdata/brick-stash-dev/repo/nas/install.sh --dev-only` in the Unraid terminal. Your logins and files are kept.

**The evening photo reading** runs at 9:07pm, in the NAS's time zone, in the development box. It follows `nas/read-photos.md` and logs to `~/logs/read-photos.log`. It can read anything, but write only in the live photos folder and its work folder (`~/work/photo-reading`), so not your project or the code. The only program it can run is the photo tool (crops and Rebrickable reference pictures), from the copy built into the development box at `/usr/local/bin/photo-tools`, which it can't change. After changing `nas/photo-tools.py`, rebuild the box (`install.sh --dev-only`) for the job to pick it up. Run it by hand with `bash nas/read-photos.sh`. Pause it with `touch ~/read-photos.off`, and delete that file to start it again.

`photos/` in the repository holds a copy of the drafts, reviews, box names and notes from when it was last committed. On the NAS, the live versions are in the app's data folder (`/live/photos` in the development box).

## Using it

1. **Collection** — import a CSV (any spreadsheet with a part-number column, ideally quantity), a Rebrickable parts export, or BrickLink XML. Or paste rows, or pull whole sets from Rebrickable with your own API key.
   - **Sets you keep built**: Rebrickable's parts export includes every set in your lists, built or not, and can't be limited to one list. Enter the sets you keep built, or drop in a set's parts file, and those parts come off before planning. Spares stay in, since they're loose in your boxes. You can also upload Rebrickable's set list export, which fills the box so you can remove any that aren't built. The list is saved separately from the import, so a fresh full export can be re-imported and the same sets still come off. Untick a set to put its parts back. Parts a set needs that aren't in your list (lost or swapped) are noted and skipped.
   - **Kept out of the plan**: untick a whole family (minifigs, baseplates), any single part, or turn on *bulky one-offs* (at least a set size each and only a few of them, plus anything too big for every compartment). These parts stay listed but don't take room in the plan.
2. **Storage** — pick products from the catalogue and how many (Officeworks, Spotlight and hsw.com.au ranges, IKEA, small-parts cabinets…), paste a list like `8x <product link>`, or add custom units with **internal** mm measurements. Identical units show as one row with a quantity; expand it to edit sizes or reach for all of them. Each unit has a **letter** (shown beside its name), which is the A in drawer code A1. The letter is kept with the unit, so adding, reordering or changing the reach of storage never changes another drawer's code, and photos, box names, drafts and printed labels stay filed where they were. Expand a unit to change its letter to match what's already on the drawers; giving it one that's in use swaps the two. To add a product to the catalogue, add it to `src/lib/presets.ts`. Links can't be read for sizes automatically, as several retailers don't publish them.
3. **Plan** — the page is collapsible: each section and storage kind opens on demand, and your choices are remembered. Open a compartment and use **Move** to put a part or section somewhere else; moves and parts kept out by hand sit on top of the plan, so nothing else shifts, and **Your changes** lists them with undo. When you want the plan rebuilt around them, click **Re-plan**: it's never automatic, it asks first, and it can be undone. **Print labels** makes one label per compartment for Brother P-touch printers on 12 mm tape, as `.lbx` files for P-touch Editor or as PNGs, with links to Brick Architect's own label for each part. Their artwork isn't built in, because it isn't licensed for reuse.
   It also shows every compartment's contents (with part pictures), fill level and divider needs, search "where is…?", print labels (optionally with pictures) and export the plan as CSV. The **colour key** explains the family colours; click a family to highlight where it lives. Open a compartment for a to-scale divider diagram, and see the **divider cutting list** for every divider size you need.
   - **Locking the plan**: once your drawers are sorted and labelled, click **Lock plan**. From then on every part stays in its compartment whatever you add to the collection or storage, and whatever changes in the planner itself: quantities and fill levels update, but nothing is rearranged. Parts with no home yet (new ones, or ones whose compartment has gone) wait under **Doesn't fit yet**, and the lock card suggests a home for each beside the parts most like it that have room: its own sub-group first, then its family, then a related family, and failing those an empty compartment near its family. Unrelated parts are never put together. **Accept** one, or all, or use **Place…** to choose yourself; accepted homes are ordinary moves, listed under **Your changes** with undo. The card also lists compartments that have grown past their practical fill. **Unlock…** goes back to a freshly worked-out plan, keeping your moves.
   - **Pick list for a build**: enter a set number (using your Rebrickable key), choose a parts file, or paste a list. It lists the drawers to open, in order, and how many of each part to take, with the colours the build needs, since parts are stored by type. It also shows what you have too few of, don't have, keep elsewhere, or haven't given a drawer. If you've recorded drawers on My setup it looks there first, then in the plan. Tick parts off as you go, or print it.
   - **Measuring as you go**: when you've filled a compartment for real, open it and enter how full it **Actually** is. That drawer's figure updates straight away and nothing else moves. If two compartments' contents fit in one, **Move all** one into the other first, then enter the fill. **Measured drawers** lists them with what they'd do to the whole collection; click **Re-plan** when you want the rest of the plan to follow. Parts you've measured use their own figure. Other parts lean on their family's figure, then the overall one, and only shift part of the way until several litres have been measured, so one drawer can't rescale everything.

4. **My setup** (optional) — record what's in your drawers today, rather than starting from a fresh plan. Open a drawer, set how many pockets it has and roughly what share of the drawer each takes, then search for parts or whole groups to add. A rough **% full** per pocket makes everything better, but you can leave it blank and come back. Do as many drawers as you like at a time; it's saved as you go.
   - **Your own layout**: units in sections don't have to stay that way. **Take the dividers out** makes a box one big space, sized from the litres in its name, which you can correct. **Lift the containers out** does the same and makes its small containers available to stand in other drawers, as one, as many as fit, or a size of your own. They take their share of the drawer's floor, and any ordinary pockets share what's left. Put the sections back at any time. Tick **Mixed on purpose** on a pocket and the review leaves its mix alone. These layouts apply to My setup only: the Plan tab still plans from the Storage tab.
   - **Photos from your phone**: open `/snap` on your phone, choose a drawer, say whether it's one piece, a close-up of one box, or the drawer from above or the side, and take photos. For a piece or close-up, tap the box it came from on the drawer's top photo (take that first). The mark stays for the next few photos and clears when you change drawer; it's saved in the name (`H1-piece-4-at-62-15.jpg`, percent across and down the latest top photo). The drawer editor shows the top photo with a numbered dot for each marked photo. The phone lists the drawer's saved photos too, each with **Mark box**, so you can mark photos taken earlier without needing them in your camera roll. After tapping a box you can **name** it ("Fences", "Minifig accessories"); names are kept with the photos in `photos/boxes.json` and show on the top photo. In My setup each box has a **Label** field that suggests those names, and a labelled box shows that name instead of its parts. **Print labels…** on My setup makes the same Brother tape labels and printable sheet as the Plan tab, for your drawers as they really are: a named box prints its name with a picture or two, and other boxes print their main part or group. Tick **A label for each box** for one per box (I2.3) rather than one per drawer, which suits loose containers. In the drawer editor you can also **Mark box** on a photo taken without a mark, by clicking the box on the top photo, and **Move all to…** another drawer when units have moved around. Marks and order go with them. After updating, restart `npm run serve` (or rebuild on the NAS); the phone page warns you if the server is still running older code. Each is saved straight away and named for you (`A1-piece-3.jpg`), with **‹ ›** to step to the next drawer. They appear on that drawer's tile and in its editor here, where you can delete any you don't want. Photos are filed by drawer code. A unit keeps its letter however storage is reordered, so photos stay with their drawer; only changing a unit's letter by hand, or how many compartments it has, changes its codes.
   - **Drawers from photos**: Claude can read the photos in `photos/` (named by drawer, `A1-top.jpg`, whether taken as above or added by hand) into `photos/drawer-drafts.json`. A scheduled task in the Claude desktop app ("Read new drawer photos") does this each evening while the app is open, for drawers with new photos. Expect the kind of part to be right more often than the exact part, so check each draft before using it.
   - **Checking drafts**: open `/review` on your phone or computer (or **Check drafts** on My setup). For each drawer it shows the top photo with the boxes numbered. For each box it shows a close-up cut from that photo, your piece photos, and the parts the draft names. Mark each part **Here** or **Not here**, answer the "not sure" ones, add parts it missed (search by number or name), give the box a name for its label, and leave a note. Then tap **Done with this box**: anything you haven't answered is taken as right. A draft filed under an unknown code ("A3?") asks which drawer it really is. Answers save as you go to `photos/reviews.json`, next to the photos, and the next reading of photos learns from them. **Load checked drafts** on My setup brings in every draft you've finished checking, with your answers applied. **or from a file…** still loads a drafts file as it is. `photos/identification-notes.md` tracks how well the reading is doing and what to do better.
   - **Suggested moves**: a short list, each to **Accept** or **Skip**: ease an overfull pocket, bring a split part together, move a part in with its own family, or combine two pockets of similar parts that fit in one. Accepting updates the record and adds it to **Moves to make**. No pocket appears twice in a list, so the figures stay right, and more appear as you go.
   - **Estimates against your drawers**: real volume against the estimate, by family and for the drawers furthest off. Tick **Use these fills** and those corrections reach the Plan tab at the next **Re-plan**. It's best left until most of the collection is recorded, because a part with some still in an unrecorded drawer looks smaller than it is.
   - **What the review found**: what's too full, split, spread out, mixed or half empty.

Your project is kept on the server, with a copy in your browser. If the server's off, edits wait in the browser and are sent when it's back. If two devices change it at once, the second is told rather than overwriting the first. **Save project** writes a JSON file you can reopen later.

## How the planner decides

| Principle | How it's implemented |
| --- | --- |
| By type, not colour | Colours are merged. Printed/patterned variants, mould revisions and alternates fold into one part via Rebrickable's `part_relationships` (3069b ≡ 3069a, 3626cpr0001 → 3626). |
| Keep similar parts together | Parts form a tree: **group → family → Rebrickable category → size bucket → part**. There are five groups (Bricks & Slopes, Plates & Tiles, Technic, Vehicles & Building, Figures, Nature & Misc). Families in the same group may share a divided compartment; unrelated groups never do unless storage is too full. |
| Separate vs combine | Granularity comes from the setting: a group with enough pieces (Relaxed 250 / Balanced 100 / Fine 40) is split into its sub-groups, and sub-groups that are too small are lumped into "… — other". During layout, part types that would be tiny for their compartment join a "(mixed)" section of their siblings rather than taking a divider each. |
| Where each family goes | Units of the same kind form a *zone*. Each family goes to the zone whose compartments suit its groups: small parts go to small compartments and bulky ones to big drawers. The least flexible families choose first, and every choice is checked by actually laying it out. |
| Layout order | Within a zone, families run in a fixed reading order through consecutive compartments, and inside a family from small sizes to large. Multi-compartment boxes are filled as one unit. |
| When space is tight | The planner gives things up in this order: growth headroom first, then spare compartments, then neighbouring groups share a compartment where one ends and the next begins. Whatever still doesn't fit is listed as overflow, never slipped into an unrelated drawer. The plan's "How it's laid out" card says which of these happened. |
| Room for future additions | Each compartment is only planned to `practical fill ÷ (1 + growth)`, which is 85% ÷ 1.25 ≈ 68% by default. Also, 10% of compartments are kept empty, placed straight after the biggest families. |
| Dividers | Sections become pockets in rows: long dividers between rows, short ones within a row. Every arrangement is scored, favouring comfortable pockets and few short dividers, and each pocket must hold the largest part in it and be at least 40 mm wide. A drawer holding little gets compact pockets and a free bay. |
| Quick finding | Every compartment gets a location code (A1, B12…) from its unit's own letter, each unit lists its contents ("Bricks → Plates → …"), and units marked "easy reach" come first in their zone. There's also a "Where is…?" search. |
| Adjustments / purchases | Recommendations cover what to buy if parts overflow (sized to the overflow), under-used big containers, small parts in deep tubs, how many dividers you need, and spare room in cupboards. Use ÷2 on a compartment to model fitting a divider. |

Volumes are estimated from the part name (stud dimensions × brick/plate height, or mm where the name says mm) times a loose-packing factor, with defaults per category. The best correction is real drawers: open a compartment you've filled and enter how full it **Actually** is. It shows on that drawer straight away and, across drawers, works out how far the estimates are off by part, by family and overall; that reaches the rest of the plan when you **Re-plan**. Before you've measured anything, use **Volume scale** or **Calibrate from today** (how full your storage is with everything in it), and you can override a single part on the Collection tab.

There's also a reality check. Plain bricks, plates and tiles can't pack loose any tighter than about 1.2× their volume when built solid, so the planner works out the least storage a part list could possibly need. If that's more than your storage holds, the plan says so: the part list or the storage list is wrong, not the estimates. Calibration refuses scales below that floor.

## Code map

- `src/lib/taxonomy.ts` — families, size parsing, buckets
- `src/lib/volume.ts` — per-piece bulk volume estimates
- `src/lib/collection.ts` — CSV/XML import, canonical-part resolution
- `src/lib/planner.ts` — tree, granularity search, packing, layout
- `src/lib/moves.ts` — manual moves applied on top of a finished plan
- `src/lib/lock.ts` — a locked plan: where every part was when it was locked, read back for the collection as it is now, and suggested homes for parts without one
- `src/lib/codes.ts` — unit letters and drawer codes
- `src/lib/pickList.ts` and `src/components/PickList.tsx` — pick list for a build
- `src/lib/labels.ts` — what goes on each label, from the plan or from My setup, for the tape labels and the sheet
- `src/lib/setup.ts` — your real setup: what's in each pocket, the review of it, and suggested moves
- `src/lib/review.ts` and `src/components/Review.tsx` — checking drafts read from photos (`/review`), and applying the answers when they load into My setup
- `src/lib/measure.ts` — real fill measurements: shown on their own compartment, and worked into volume corrections for the next re-plan
- `src/lib/tapeLabel.ts`, `src/lib/zip.ts` — Brother 12 mm tape labels and `.lbx` packaging
- `src/lib/dividers.ts` — pocket and divider layouts per compartment, free bays, and the cutting list
- `src/lib/recommend.ts`, `src/lib/presets.ts` — advice and storage catalogue (preset sizes are approximate)
- `src/lib/rebrickable.ts` — Rebrickable API (proxied at `/rb-api`)
- `server/api.mjs` — the shared project and photos, used by both servers; `server/index.mjs` — runs the built app for the network
- `nas/` — running it on the Unraid NAS: `install.sh` (one-time setup), `deploy.sh` (put `main` live), `dev-server.sh` (test copy on 5174), `read-photos.sh`, `read-photos.md` and `photo-tools.py` (the evening photo reading, and the only Python it may run), and `dev/` (the development box's image)
- `src/state.ts`, `src/lib/sync.ts` — keeping the browser and the server's project in step
- `src/components/Snap.tsx`, `src/lib/photos.ts` — the phone page and photos
- `src/components/PartImage.tsx` — part pictures: Rebrickable LDraw renders, falling back to BrickLink images

## Data & resources

- **Rebrickable**: catalogue downloads (parts, categories, relationships), used for categorisation; the API is used for set inventories and looking up BrickLink ids. https://rebrickable.com/downloads/ and https://rebrickable.com/api/
- **BrickLink**: XML import. Its catalogue has real part weights/dimensions — a good next source for better volume estimates.
- **Brick Architect**: well-known part labels with images, and a categorisation guide worth comparing against ours. https://brickarchitect.com/labels/

## Ideas / next steps

- Per-family usage weighting (which families you reach for most) feeding the accessibility layout
- Drag-to-pin a group to a specific compartment, with re-planning around the pins
- Better volume model from BrickLink weights, plus a calibration wizard
- Move planning into a Web Worker for very large collections (currently ~0.5 s for 2,500 part types × 170 compartments)

## Flagged issues

- [x] Need option to duplicate items in your storage to allow for easy entry of multiple boxes of the same type — *Duplicate… button on each unit; asks how many copies*
- [x] Link to or show image of the different part types in the plan section to ensure user knows which is which — *pictures on tiles, in the compartment detail (part number links to Rebrickable) and on labels*
- [x] Include a key to the colours used in the plan section — *colour key card; click a family to highlight its compartments*
- [x] List the required sizes of each of the dividers as defined in the plan — *cutting list grouped by size, plus per-compartment positions and a to-scale diagram*
- [x] When using the subtract built sets option, the process fails if it finds a mismatch between set contents and known parts list. As this may be due to known missing parts, allow the process to continue — *a mismatch is now a neutral note with the full list; each set is saved as it's fetched, rate limits are retried, and sets that can't be fetched stay in the box to retry*
- [x] Rebrickable provides a csv of set lists with the set name in the column - allow for this list to be uploaded rather than requiring a copy/paste of set ids — *upload it under Sets you keep built (or Add whole sets); it fills the box so you can remove any that aren't built*
- [x] The plan notes that "1 large compartment(s) are under 15% full Sterilite Medium › Drawer 10 (5%). A small-parts cabinet or a tray insert would hold these groups and free the large compartments for bulky categories." Could this tool suggest more efficient division of storage spaces that would cover this scenario (i.e. more flexible divider setup, not just full width dividers — *done: short dividers, pockets sized to their contents, and free bays in near-empty drawers*
- [x] Option to order parts by size in the collection/what you have section — *click any column heading in an opened family; the order carries across families*
- [x] Additional column for total size of all pieces alongside the cm3/pc column — *new Total column, sortable*
- [x] Highlight storage spaces with high level of free space remaining e.g. 50%+ — *green outline and "% free" on the tile, a count per product, and a 50%+ free button that shows only those*
- [x] Add images to the "doesn't fit yet" section — *pictures on each row*
- [x] Add option to exclude specific parts from storage from the planning page — *Keep out on each part and section in a compartment and on Doesn't fit yet rows; nothing else moves, and Your changes has Put back*
- [x] Need option re-plan when manual changes are made (optional, not automatic) — *Re-plan button on the Plan tab whenever there are changes it hasn't been rebuilt around; it asks first and can be undone. Lock plan stops any rebuild until you unlock it*
