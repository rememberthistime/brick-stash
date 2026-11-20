# Brick Stash — LEGO storage planner

Tell it what parts you own and what storage you have, record what's really in your drawers, and it suggests where everything else should go — sorted **by type, not colour**, with **room to grow** built in.

```bash
npm install
npm run serve      # build and run for every device on your network, http://localhost:5173
npm run dev        # the same, for working on the code (this computer only)
npm test
npm run fetch-data # refresh the Rebrickable part catalogue (public/data/parts.json)
```

## Where it runs

**On the PC**, `npm run serve` prints the addresses to open on other devices on the same network (Windows may ask to let Node through its firewall the first time). The project is saved in `data/project.json`, with the version before it in `project.previous.json`.

**On Unraid** (always on), one container serves the app. GitHub builds the image (`ghcr.io/rememberthistime/brick-stash`) whenever `main` changes, after running the tests, and Unraid's Docker tab updates the container from it. Its settings:
- **Port** 5173.
- **Path** `/data` → `/mnt/user/data/projects/lego`. Everything of yours is in there: `project.json`, and `backups/`. Anything else there, such as `photos/` and `.brick-stash/` from earlier versions of the app, is no longer used and can be deleted. It isn't in the appdata backup, so back that folder up separately. Updating the container never touches it.

HTTPS comes from the reverse proxy (SWAG, on the home network only) at `https://lego.brindo.de`. There's no password, so keep it on your home network; Tailscale is fine for reaching it while you're out.

**Your project** is kept on the server, with a copy in your browser. If the server's off, edits wait in the browser and are sent when it's back. If two devices change it at once, the second is told rather than overwriting the first. The server also keeps the project as it stood before the first change of each day, for 30 days, in `backups/`: **Earlier versions…** at the top of the app lists them and brings one back. **Save project** writes a JSON file, and **Open…** replaces the project with one (it asks first).

**Changing the code** is done away from the NAS, in a Claude Code session on the repository or on the PC. Changes go live when they're merged to `main` and the container is updated.

## Using it

**Your layout comes first.** The drawers you record are the plan. The app's own ideas (room beside the same sort of parts, what it would put in drawers you haven't recorded, moves worth making) appear only with the **Suggestions** switch on, at the top of Drawers and Put away & move. It's remembered on each device and starts off. Nothing changes unless you press a button.

The sidebar lists every job the app does, in groups, with a count beside each (how many parts aren't in a drawer, how many moves are worth making, and so on). Each page does one thing and opens with a sentence saying where things stand. Each page has its own address (`#/put-away`), so bookmarks and the back button work. On a phone, ☰ opens the sidebar. With a project loaded, the app opens on **Put away & move**.

**Collection**
- **Parts**: everything you have, by family, colours merged. Click a family for its parts, each with a picture, sortable by any column. Untick a family or a part to keep it out of storage, or type a part's own size (cm³ per piece) to override the estimate.
- **Import**: a CSV (any spreadsheet with a part-number column, ideally quantity), a Rebrickable parts export or BrickLink XML. Or paste rows, or pull whole sets from Rebrickable with your own API key.
- **Sets kept built**: enter them, drop in a set's parts file, or upload Rebrickable's set list export, and their parts come off before anything is stored. Spares stay in, since they're loose in your boxes. The list is kept separately, so a fresh full export can be re-imported and the same sets still come off. Untick a set to put its parts back.
- **Kept out**: minifigs, baseplates, *bulky one-offs* or any part you pick. These parts aren't stored in drawers but are still in the pick list.

**Storage**
- **Drawers**: every drawer as a tile, by kind of storage, with pictures of the parts in it. The **Where is…?** search dims everything else, and the colour key highlights one family's drawers.
  - **Recorded drawers** are exactly as you've recorded them. Open one, set how many pockets it has and roughly what share of the drawer each takes, then search for parts or whole groups to add, by name or by part number (as typed, or pasted from Google Lens or a website: "LEGO 3023 Plate 1 x 2", "3069", a printed part's number). The search stays put, so several of what it finds can be added in turn; a tick shows what's already here. Click a part to add it to the pocket you're working on, or a pocket's number to put it in another; the pocket holding the same sort of parts is offered by name. A rough **% full** per pocket makes the estimates better.
  - **Names**: a pocket is called by the name you give it, or in a drawer of one pocket by the drawer's name, or failing those by what's in it ("Plates 1 × 2", "Slopes & Curves", "Bricks & Plates + 2"). The same name is used everywhere a pocket is mentioned: Put away & move, suggested moves, labels. **Mixed on purpose** only tells the review to leave a pocket alone; it doesn't rename it.
  - **Pictures**: point at any part's picture (or tap it) to see it large, with its name and number. A part's name opens its Rebrickable page, with pictures from every side.
  - **Moving parts**: every part in a drawer has **Move…**, which lists pockets beside similar parts first; type a drawer code (A3, a3.2) or a word of its name to narrow it. Tick several parts to move them together, **Move everything…** empties a pocket into another, and **Swap with another drawer…** swaps two drawers' pockets and names. A part the search finds in another drawer can be moved here in one click. ✕ takes a part out, back to Put away & move. Every step can be undone, one at a time, from the bar at the bottom or with Ctrl+Z (the list lasts until the page is reloaded).
  - **Suggested for this drawer** (with Suggestions on): a tile shows **+3 to put in** or **1 move** when something is waiting for it, and opening it lists, under your pockets, the unsorted parts with room there (each to **Add** or turn down with ✕, or **Add all**) and the best moves in or out of it, to **Accept** or **Skip**.
  - **Drawers you haven't recorded** are shown as not recorded. With Suggestions on, they're dashed and show what the plan suggests for them, from the parts that aren't in any drawer yet. Open one for its parts and a to-scale divider diagram with each divider's size, then **Record it like this**, or record it by hand. Recorded drawers never change unless you change them; the suggestions only ever fill the gaps.
  - **Your own layout**: **Take the dividers out** makes a sectioned box one big space; **Lift the containers out** does the same and lets its small containers stand in other drawers. Put the sections back at any time.
- **Units**: the units you own. Pick products from the catalogue (Officeworks, Spotlight, Howards Storage World, IKEA, small-parts cabinets…) and how many, paste a list like `8x <product link>`, or add custom units with **internal** mm sizes. Identical units show as one row; expand it to edit sizes, reach or outside size. Use **÷2** on a compartment to model fitting a fixed divider.
  - **Letters and names**: each unit has a letter, the A in drawer code A1. It's kept with the unit, so adding or reordering storage never changes another drawer's code. Change one only to match what's already on the drawers (giving it a letter in use swaps the two). Give a unit, or any of its drawers, a **name** of your own, and it shows beside the code everywhere, as in "A1: Technic". A drawer without its own name shows its unit's.
- **Spaces**: cupboards, shelves or the room under them, by inside size. Put units in a space and it shows how much of it they take and roughly how many more of each of your kinds of unit would fit.

**Sort**
- **Put away & move**: the parts in no recorded drawer down one side, your drawers as small tiles on the other, and one drawer open beside them with its pockets. Drag a part by its row (⠿) onto a drawer's tile or a pocket, from one pocket to another, or back to the list to take it out. Drag a pocket's name, or the open drawer's name, to move everything in it. Or tick parts (in the list or in pockets) and use **Move to…** (type a code or name), **Into A3.2** (the drawer that's open; click a pocket to choose it), or **Take out**: this is the way on a phone. Each part in the list has **+ A3.2** for the open drawer and **Put in…** for any drawer. Where there's room beside the same sort of parts, the part shows **→ A3.2: Fences** (✕ turns that down), and **Put … beside their own sort** does them all at once. **Edit drawer…** opens the full drawer editor. Every step can be undone, one at a time, from the bar at the bottom or with Ctrl+Z.
- **Suggestions**: the app's ideas for your recorded drawers, on three tabs (counted in the sidebar only with Suggestions on).
  - **Moves worth making**: a short list for the recorded drawers, each to **Accept** or **Skip**: ease an overfull pocket, bring a split part together, move a part in with its own family, or combine two pockets that fit in one. Each shows the parts it moves, with pictures and links.
  - **Tidy the layout**: drawers that slot into each other's places (the same product and size) can be moved round, within a unit or between units, so each family sits in one run. For each kind of drawer it shows the layout now and after, coloured by family, and offers the swaps that get there, one at a time or all at once. Only recorded drawers move, each with its pockets and name; a drawer takes the code of the slot it moves to, so reprint its label. Each swap goes on **Moves to make**, with undo.
  - **Review**: what's too full, split, spread out, mixed or half empty (tick **Mixed on purpose** on a pocket and it's left alone), and real fills against the estimates, by family and for the drawers furthest off. Tick **Use these fills** and every part's estimated size is corrected from them. Best left until most of the collection is recorded.

**Print & lists**
- **Labels**: Brother P-touch 12 mm tape labels (`.lbx` for P-touch Editor, or PNGs) or a printable sheet, for recorded drawers, with links to Brick Architect's own label for each part (their artwork isn't built in, as it isn't licensed for reuse).
- **Pick list**: takes a set number, a parts file or a pasted list, and lists the drawers to open and how many of each part to take, with the colours the build needs.
- **Export**: a CSV of every drawer's contents, recorded and suggested.

**Settings**
- **Plan settings**: how finely the suggestions sort, how much room to leave to grow and how full they fill each drawer.
- **Project & versions**: download the project as a file, open one, or go back to the project as it was at the start of an earlier day.

## How the suggestions are made

| Principle | How it's implemented |
| --- | --- |
| By type, not colour | Colours are merged. Printed and patterned variants, mould revisions and alternates fold into one part via Rebrickable's `part_relationships` (3069b ≡ 3069a, 3626cpr0001 → 3626). |
| Fill the gaps, don't rebuild | Recorded drawers are left exactly as they are. Parts in no recorded drawer are first offered room beside their own group (or, in an unlabelled pocket, their family) in a recorded drawer, up to the practical fill. Only what's left is planned, and only into drawers with nothing recorded. With nothing recorded, it's a fresh plan. |
| Use as few drawers as needed | Free drawers are filled in turn to their planned fill, and any left over stay empty at the end. A near-empty suggested drawer is tipped into another holding the same group if it fits. **Plan settings** can spread parts across every free drawer instead. |
| Keep similar parts together | Parts form a tree: **group → family → category → size → part**. Families in the same group (bricks and slopes; plates and tiles; Technic; vehicles and building; figures and nature) may share a divided drawer; unrelated groups never do unless storage is too full. |
| Separate vs combine | A group with enough pieces (Relaxed 250 / Balanced 100 / Fine 40) is split into its sub-groups, and ones too small are kept together as "Other …". Part types too small for a divider of their own share a "Mixed …" section with their neighbours. Groups are named the way you'd say them: "Slopes 2×4 and bigger", "Mixed modified bricks". |
| Where each family goes | Units of the same kind form a *zone*. Each family goes to the zone whose compartments suit its sizes: small parts to small compartments, bulky ones to big drawers. The least flexible families choose first, and every choice is checked by laying it out. |
| When space is tight | Growth headroom goes first, then spare compartments, then neighbouring groups share a compartment where one ends and the next begins. Whatever still doesn't fit is shown as having no room, never slipped into an unrelated drawer. |
| Room to grow | Each compartment is only planned to `practical fill ÷ (1 + growth)`, and some compartments are kept empty next to the biggest families. |
| Dividers | Sections become pockets in rows: long dividers between rows, short ones within a row. Arrangements favour comfortable pockets and few short dividers; each pocket must hold its largest part and be at least 40 mm wide. A drawer holding little gets compact pockets and a free bay. |

Volumes are estimated from the part name (stud dimensions × brick or plate height, or mm where the name says mm) times a loose-packing factor, with defaults per category. You can override one part's size on Parts, and fills entered on recorded drawers (with **Use these fills** on Review) correct the rest.

## Code map

- `src/lib/taxonomy.ts` — families, size parsing and buckets, and the plain-English group names
- `src/lib/volume.ts` — per-piece bulk volume estimates
- `src/lib/collection.ts`, `src/lib/keepOut.ts` — imports, canonical parts, built sets and what's kept out
- `src/lib/planner.ts` — tree, granularity, packing and layout
- `src/lib/gaps.ts` — planning around the recorded drawers: room in recorded pockets first, then the empty drawers, and recording a suggestion
- `src/lib/rearrange.ts` — swaps of whole drawers that bring each family into one run, and undoing them
- `src/lib/move.ts` — moving parts, pockets and whole drawers by hand, and undoing each step
- `src/lib/setup.ts` — the drawers as recorded: what's in each pocket, the review, suggested moves, opened-up units
- `src/lib/measure.ts` — correcting estimates from recorded fills
- `src/lib/codes.ts` — unit letters, drawer codes and names
- `src/lib/spaces.ts` — how much of a cupboard or shelf its units take, and what else fits
- `src/lib/dividers.ts` — pocket and divider layouts per compartment
- `src/lib/pickList.ts` — pick list for a build
- `src/lib/labels.ts`, `src/lib/tapeLabel.ts`, `src/lib/zip.ts` — label contents, Brother 12 mm tape labels and `.lbx` packaging
- `src/lib/presets.ts`, `src/lib/storageList.ts` — the storage catalogue (preset sizes are approximate) and pasted lists
- `src/lib/rebrickable.ts` — Rebrickable API (proxied at `/rb-api`)
- `src/components/Shell.tsx` — the sidebar, page addresses and page headlines; `src/App.tsx` works out each page's headline and count
- `src/components/storage/` — the storage and sort pages: `model.ts` (everything they work out from the project, once), `StorageView.tsx` (Drawers, Put away & move, Suggestions and its tabs, Labels, Pick list, Export), `DrawerEditor.tsx` (recording a drawer), `Suggested.tsx` (a suggested drawer and its dividers), `SortPage.tsx` (Put away & move: the list beside the drawers, dragging and picking), `PlacePicker.tsx` and `places.ts` (Move to…), `history.ts` (undo), `suggestionsSwitch.tsx` (the Suggestions switch), `Improvements.tsx` (moves, estimates, findings), `Rearrange.tsx` (tidy the layout), `PlanSettings.tsx` (settings and colour key)
- `src/components/CollectionTab.tsx` (Parts, Import, Sets kept built, Kept out), `StorageTab.tsx` (Units, Spaces), `PickList.tsx`, `Labels.tsx`, `TapeLabels.tsx`, `Versions.tsx`, `PartImage.tsx` — the other pages and views
- `src/state.ts`, `src/lib/sync.ts` — keeping the browser and the server's project in step
- `server/api.mjs` — the shared project and its daily versions; `server/index.mjs` — runs the built app for the network
- `Dockerfile`, `.github/workflows/docker.yml` — the image Unraid runs, built and published from `main`

## Data & resources

- **Rebrickable**: catalogue downloads (parts, categories, relationships) for categorisation; the API for set inventories and BrickLink ids. https://rebrickable.com/downloads/ and https://rebrickable.com/api/
- **BrickLink**: XML import. Its catalogue has real part weights and dimensions, a good next source for better volume estimates.
- **Brick Architect**: well-known part labels with images, and a categorisation guide worth comparing against ours. https://brickarchitect.com/labels/

## Ideas / next steps

- Per-family usage weighting (which families you reach for most) feeding which drawers are easiest to reach
- Better volume estimates from BrickLink weights
- Move planning into a Web Worker if collections get much bigger (today about 10 ms for the gaps in a 1,500-part-type collection)

## Flagged issues

- [x] Need option to duplicate items in your storage to allow for easy entry of multiple boxes of the same type — *Duplicate… button on each unit; asks how many copies*
- [x] Link to or show image of the different part types in the plan section to ensure user knows which is which — *pictures on tiles, in each drawer and suggestion (names link to Rebrickable) and on labels*
- [x] Include a key to the colours used in the plan section — *colour key on Drawers; click a family to highlight its drawers*
- [x] List the required sizes of each of the dividers as defined in the plan — *each suggested drawer lists its dividers by size, with positions and a to-scale diagram (the separate cutting list went in the November tidy-up)*
- [x] When using the subtract built sets option, the process fails if it finds a mismatch between set contents and known parts list. As this may be due to known missing parts, allow the process to continue — *a mismatch is now a neutral note with the full list; each set is saved as it's fetched, rate limits are retried, and sets that can't be fetched stay in the box to retry*
- [x] Rebrickable provides a csv of set lists with the set name in the column - allow for this list to be uploaded rather than requiring a copy/paste of set ids — *upload it under Sets you keep built (or Add whole sets); it fills the box so you can remove any that aren't built*
- [x] The plan notes that "1 large compartment(s) are under 15% full Sterilite Medium › Drawer 10 (5%). A small-parts cabinet or a tray insert would hold these groups and free the large compartments for bulky categories." Could this tool suggest more efficient division of storage spaces that would cover this scenario (i.e. more flexible divider setup, not just full width dividers — *done: short dividers, pockets sized to their contents, and free bays in near-empty drawers*
- [x] Option to order parts by size in the collection/what you have section — *click any column heading in an opened family; the order carries across families*
- [x] Additional column for total size of all pieces alongside the cm3/pc column — *new Total column, sortable*
- [x] Highlight storage spaces with high level of free space remaining e.g. 50%+ — *every tile shows how full it is; What the review found lists drawers half empty or more (the 50%+ filter went in the November tidy-up)*
- [x] Add images to the "doesn't fit yet" section — *pictures on each row of Not sorted yet*
- [x] Add option to exclude specific parts from storage from the planning page — *untick a part on Parts (the plan's own Keep out buttons went in the November tidy-up)*
- [x] Need option re-plan when manual changes are made (optional, not automatic) — *superseded: recorded drawers never change, and suggestions for the rest follow what you record*
- [x] Brick Stash looks cluttered next to Brick Work, and the part pictures are too small to sort by — *a sidebar with one page per job and a headline on each, a calmer look, and larger pictures: 56 px on Put away, 48 px on Parts and pictures on every drawer tile (the Brick Work connection was removed)*
- [x] Suggested moves and parts to put away aren't visible when looking at a drawer; approve or reject them there — *a drawer's tile shows what's waiting for it, and the drawer opens with **Suggested for this drawer**: parts to Add or turn down, and the best moves to Accept or Skip*
- [x] Automatic pocket names aren't always accurate, can only be changed via Mixed on purpose, and my own names aren't always the ones shown — *one name everywhere: yours if you've given one, otherwise a description of what's in it (by part, group or families); Mixed on purpose no longer renames; the name box shows the current automatic name*
- [x] The Add to this drawer search clears after each add — *it stays, with a tick on what's been added*
- [x] Part numbers from Google Lens rarely find anything — *a number anywhere in the search is matched, and translated as the collection files it (3069 → 3069b, prints to the plain part, BrickLink numbers)*
- [x] The search finds parts that belong in another pocket of the same drawer — *each result has a button for every pocket, with the one holding the same sort of parts named*
- [x] Part names alone don't say what a part is, so suggested moves can't be judged, and small pictures aren't clear — *moves in a drawer now show their parts' pictures; any picture enlarges when pointed at, with name and number; names link to Rebrickable*
- [x] Managing and rearranging storage by hand should be as simple as possible, with the app's suggestions an add-on to my own layout — *stage 1: Move… on every part (type a drawer code or name), several at once, whole pockets, swapping drawers, undo history; stage 2: Put away & move puts the unsorted parts beside your drawers, with drag and drop and tick-and-move for phones; stage 3: a Suggestions switch (off to start) shows the app's ideas only when you want them, and Suggested moves, Tidy the layout and Review are tabs of one Suggestions page*
