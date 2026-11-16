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

1. **Collection** — import a CSV (any spreadsheet with a part-number column, ideally quantity), a Rebrickable parts export, or BrickLink XML. Or paste rows, or pull whole sets from Rebrickable with your own API key.
   - **Sets you keep built**: enter them, drop in a set's parts file, or upload Rebrickable's set list export, and their parts come off before anything is stored. Spares stay in, since they're loose in your boxes. The list is kept separately, so a fresh full export can be re-imported and the same sets still come off. Untick a set to put its parts back.
   - **Kept out**: untick a whole family (minifigs, baseplates) or a single part, or turn on *bulky one-offs*. These parts stay listed but aren't stored in drawers.
2. **Storage** — the units you own: pick products from the catalogue (Officeworks, Spotlight, Howards Storage World, IKEA, small-parts cabinets…) and how many, paste a list like `8x <product link>`, or add custom units with **internal** mm sizes. Identical units show as one row; expand it to edit sizes, reach, or outside size. Use **÷2** on a compartment to model fitting a fixed divider.
   - **Letters and names**: each unit has a letter, the A in drawer code A1. It's kept with the unit, so adding or reordering storage never changes another drawer's code. Change one only to match what's already on the drawers (giving it a letter in use swaps the two). Give a unit, or any of its drawers, a **name** of your own, and it shows beside the code everywhere, as in "A1: Technic". A drawer without its own name shows its unit's.
   - **Spaces**: cupboards, shelves or the room under them, by inside size. Put units in a space and it shows how much of it they take and roughly how many more of each of your kinds of unit would fit.
3. **My storage** — where you'll spend most of your time, and where the app opens once there's a project. Every drawer is shown as a tile, by kind of storage:
   - **Recorded drawers** are exactly as you've recorded them. Open one, set how many pockets it has and roughly what share of the drawer each takes, then search for parts or whole groups to add. A rough **% full** per pocket makes the estimates better. A drawer with one pocket goes by the drawer's name; a divided one can label each pocket. In a drawer with several pockets only the one you're adding to is opened out.
   - **Drawers you haven't recorded** show what the plan suggests for them (*Suggested: …*), laid out from the parts that aren't in any drawer yet. Open one for its parts and a to-scale divider diagram with each divider's size, then **Record it like this**, or record it by hand. Recorded drawers never change unless you change them; the suggestions only ever fill the gaps.
   - **Your own layout**: **Take the dividers out** makes a sectioned box one big space; **Lift the containers out** does the same and lets its small containers stand in other drawers. Put the sections back at any time.
   - **Not sorted yet**: the parts in no recorded drawer, by family, biggest first by room or by number of pieces. Where there's room beside the same sort of parts in a recorded drawer, that's offered first (**Put in A3.2**), and **Put all … beside their own sort** does them all at once, with undo. The rest show their suggested drawer (click to see that suggestion). **Put in…** puts a part straight into any drawer, listing pockets that already hold similar parts first. To put many parts into one drawer, choose it at the top and each part gets a **+ A1.2** button. The last one can be undone.
   - **Suggested moves**: a short list for the recorded drawers, each to **Accept** or **Skip**: ease an overfull pocket, bring a split part together, move a part in with its own family, or combine two pockets that fit in one. Each shows the parts it moves, with pictures and links.
   - **Tidy the layout**: drawers that slot into each other's places (the same product and size) can be moved round, within a unit or between units, so each family sits in one run. For each kind of drawer it shows the layout now and after, coloured by family, and offers the swaps that get there, one at a time or all at once. Only recorded drawers move, each with its pockets and name; a drawer takes the code of the slot it moves to, so reprint its label. Each swap goes on **Moves to make**, with undo.
   - **Estimates against your drawers**: real fills against the estimates, by family and for the drawers furthest off. Tick **Use these fills** and every part's estimated size is corrected from them. Best left until most of the collection is recorded.
   - **What the review found**: what's too full, split, spread out, mixed or half empty. Tick **Mixed on purpose** on a pocket and it's left alone.
   - **Print labels…** makes Brother P-touch 12 mm tape labels (`.lbx` for P-touch Editor, or PNGs) or a printable sheet, for recorded drawers, with links to Brick Architect's own label for each part (their artwork isn't built in, as it isn't licensed for reuse). **Pick list for a build** takes a set number, a parts file or a pasted list, and lists the drawers to open and how many of each part to take, with the colours the build needs. **Export CSV** lists every drawer's contents, recorded and suggested.
   - **Colour key** explains the family colours (click one to highlight its drawers), and **Plan settings** set how finely the suggestions sort and how full they fill each drawer.
   - Each section folds to one line; **Open all**, **Close all** and the **Where is…?** search are at the top.

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

Volumes are estimated from the part name (stud dimensions × brick or plate height, or mm where the name says mm) times a loose-packing factor, with defaults per category. You can override one part's size on the Collection tab, and fills entered on My storage (with **Use these fills**) correct the rest.

## Code map

- `src/lib/taxonomy.ts` — families, size parsing and buckets, and the plain-English group names
- `src/lib/volume.ts` — per-piece bulk volume estimates
- `src/lib/collection.ts`, `src/lib/keepOut.ts` — imports, canonical parts, built sets and what's kept out
- `src/lib/planner.ts` — tree, granularity, packing and layout
- `src/lib/gaps.ts` — planning around the recorded drawers: room in recorded pockets first, then the empty drawers, and recording a suggestion
- `src/lib/rearrange.ts` — swaps of whole drawers that bring each family into one run, and undoing them
- `src/lib/setup.ts` — the drawers as recorded: what's in each pocket, the review, suggested moves, opened-up units
- `src/lib/measure.ts` — correcting estimates from recorded fills
- `src/lib/codes.ts` — unit letters, drawer codes and names
- `src/lib/spaces.ts` — how much of a cupboard or shelf its units take, and what else fits
- `src/lib/dividers.ts` — pocket and divider layouts per compartment
- `src/lib/pickList.ts` — pick list for a build
- `src/lib/labels.ts`, `src/lib/tapeLabel.ts`, `src/lib/zip.ts` — label contents, Brother 12 mm tape labels and `.lbx` packaging
- `src/lib/presets.ts`, `src/lib/storageList.ts` — the storage catalogue (preset sizes are approximate) and pasted lists
- `src/lib/rebrickable.ts` — Rebrickable API (proxied at `/rb-api`)
- `src/components/storage/` — the My storage tab: `StorageView.tsx` (the tab), `DrawerEditor.tsx` (recording a drawer), `Suggested.tsx` (a suggested drawer and its dividers), `NotSorted.tsx`, `Improvements.tsx` (moves, estimates, findings), `Rearrange.tsx` (tidy the layout), `PlanSettings.tsx` (settings and colour key)
- `src/components/CollectionTab.tsx`, `StorageTab.tsx`, `PickList.tsx`, `Labels.tsx`, `TapeLabels.tsx`, `Versions.tsx`, `PartImage.tsx` — the other tabs and views
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
- [x] Include a key to the colours used in the plan section — *colour key on My storage; click a family to highlight its drawers*
- [x] List the required sizes of each of the dividers as defined in the plan — *each suggested drawer lists its dividers by size, with positions and a to-scale diagram (the separate cutting list went in the November tidy-up)*
- [x] When using the subtract built sets option, the process fails if it finds a mismatch between set contents and known parts list. As this may be due to known missing parts, allow the process to continue — *a mismatch is now a neutral note with the full list; each set is saved as it's fetched, rate limits are retried, and sets that can't be fetched stay in the box to retry*
- [x] Rebrickable provides a csv of set lists with the set name in the column - allow for this list to be uploaded rather than requiring a copy/paste of set ids — *upload it under Sets you keep built (or Add whole sets); it fills the box so you can remove any that aren't built*
- [x] The plan notes that "1 large compartment(s) are under 15% full Sterilite Medium › Drawer 10 (5%). A small-parts cabinet or a tray insert would hold these groups and free the large compartments for bulky categories." Could this tool suggest more efficient division of storage spaces that would cover this scenario (i.e. more flexible divider setup, not just full width dividers — *done: short dividers, pockets sized to their contents, and free bays in near-empty drawers*
- [x] Option to order parts by size in the collection/what you have section — *click any column heading in an opened family; the order carries across families*
- [x] Additional column for total size of all pieces alongside the cm3/pc column — *new Total column, sortable*
- [x] Highlight storage spaces with high level of free space remaining e.g. 50%+ — *every tile shows how full it is; What the review found lists drawers half empty or more (the 50%+ filter went in the November tidy-up)*
- [x] Add images to the "doesn't fit yet" section — *pictures on each row of Not sorted yet*
- [x] Add option to exclude specific parts from storage from the planning page — *untick a part on the Collection tab (the plan's own Keep out buttons went in the November tidy-up)*
- [x] Need option re-plan when manual changes are made (optional, not automatic) — *superseded: recorded drawers never change, and suggestions for the rest follow what you record*
