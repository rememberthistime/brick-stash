# Reading drawers from photos

How to get better at identifying parts from photos of the drawers. Read this before looking at new photos, and add to it after each round of corrections.

## Naming photos

`<drawer code>-<view>.jpg`, for example `A1-top.jpg` and `A1-side.jpg`. Top-down does most of the work, and side-on helps with fill. Labels are worth including, but treat them as hints: they aren't always right.

The phone page (`/snap`) names them automatically, and adds `A1-piece-1.jpg`, `A1-piece-2.jpg` for single pieces and `A1-closeup.jpg`, `A1-closeup-2.jpg` for close-ups of one box. A piece or close-up may end `-at-62-15`: that's where it came from, as percent across and down the drawer's most recent top photo taken before it. Crop the top photo around that point to see the box. Without it, the photo only says the part is somewhere in the drawer.

Boxes the user has named on the phone ("Fences", "Food") are in `boxes.json`, by drawer code and place on the top photo. Give the matching pocket in a draft a `label` with that name, and treat the name as a strong hint to what's in the box. If the app runs on the NAS, this folder is at `/mnt/user/appdata/brick-stash/photos` rather than here.

## Writing drafts, and reading the user's answers

Drafts go in `drawer-drafts.json`. Each pocket has `where` ("Back left"), `share`, `fill`, `parts`, and optionally:
- `area`: `{x, y, w, h}`, the box's place on the drawer's latest top photo in percent. The review page uses it to crop the box and match piece photos to it, so always give one.
- `maybe`: parts that might be there. Put guesses here rather than in `parts`.
- `ask`: one short question for the user about the box.
- `label`: from `boxes.json`.

List pockets in reading order on the photo (left to right, top to bottom), so the numbers on the review page read naturally. A drawer can have `note` (shown to the user) and `photos` (the code its photos are filed under, when that differs from the draft's code, e.g. "A3?" → A3).

The user checks drafts on `/review`, and their answers are in `reviews.json`, by draft code and then by `where`:
- `parts`: `{partNum: "yes" | "no"}`.
- `added`: parts the draft missed.
- `label`, `note`, and `done`. When `done` is set, parts left unanswered count as right.
- A drawer-level `code` gives the real code for a draft filed under a "?" code.

Read `reviews.json` before each round. Update the scoreboard from it, add what was learnt to these notes, and fold confirmed answers into the draft. Never rename a `where` that has a review, because the answers are keyed by it.

## Scoreboard

| Round | Drawers | Parts named | Right pocket | Right drawer, wrong pocket | Wrong | Missed |
|---|---|---|---|---|---|---|
| 1 (2026-11-06) | A1 | 29 | 12 | 6 | 11 | 4 |
| 2 (2026-11-06) | A3 (6 of 12 boxes checked; A2 was re-read as I2 in round 4) | 16 | 12 | 0 | 4 | 0 |
| 3 (2026-11-08) | H1, 6 boxes read part by part | 21 | 16 (3 unanswered, taken as right) | 0 | 5 | 3 |
| 3 (2026-11-08) | H1, 3 boxes "assumed by type" | 230 | 22 checked yes, 194 unanswered | 0 | 14 | 0 |
| 4 (2026-11-08) | I2, all 13 boxes checked (final score taken 2026-11-10; was 35/31/4/8 with 9 boxes) | 47 | 35 (4 unanswered) | 0 | 12 | 19 |
| 5 (2026-11-08) | H2 (round 1's A1, moved) | 26 | 21 | 2 | 3 | 1 |
| 6 (2026-11-08) | H3, the same drawer as round 2's A3 | awaiting corrections | | | | |
| 7 (2026-11-10) | none read (no new photos); I2's last 4 boxes scored and folded into the draft, see round 4 | | | | | |

Round 1's misses include 6191 (stickered "SPORT") in lower centre, the most common piece in that pocket. Z was close at group level: all named lengths were right, but it missed that all 850 of the 1 x 4s are in there.

## What went wrong in round 1

- **Listing likely parts rather than seen ones.** The biggest cause of error. Lower left was named as arches (3659, 4490, 2339) from the collection list, and was really 6005.
- **Assuming the most common part must be there.** 93273, 41855, 30165, 42022 and the 41747/8 wedges were named because they fit the group, and none were in those pockets.
- **Mirror pairs and close shapes.** 29119/29120 were read from notched shapes that were something else. 37352 and 6091 were swapped between two pockets.
- **Not looking long enough at a dominant pocket.** Right, tall held 376 of 11477 as well as the obvious 15068, and they were missed.
- **Parts underneath.** The 1 x 4s in Z weren't identified, probably including the cream columns.

## What the round 2 to 5 answers taught (scored 2026-11-08)

- **The old mistake is still the main one.** H1's arches box named 3659, 3455 and 42022 from the collection, and only 93273 was there. A3's 1 x 1 boxes named 3024, 6141, 18674 and 87087 because they're common, and none were. Most wrong parts in rounds 2 to 5 were filled in from the group, not pointed at.
- **Parts read from a piece photo were almost always right.** H2, checked box by box against piece photos, had 21 of 26 right, and the 5 wrong ones were all carried over from earlier drafts, not seen in the new photos.
- **Small mixed boxes hide parts.** I2's small boxes missed 8 parts (98397, 30031, 2399, 52038, 4219, 649, 50943, 40620). Say a mixed box looks mixed, and ask, rather than listing two or three parts as if complete.
- **"Assumed by type" works for food and animal parts, not props.** Food was 11 of 12 checked right, animal parts 10 of 12, but the minifig props box was 1 of 12 (only 36752a). Don't fill a props box by type again; name only what's seen.
- **Round 5 got 29119/29120 wrong.** They are not in H2 at all; the user added them to H1's clear back-right box. Round 1's correction was right. 3563 is only in H2's lower centre, not front centre, and 6191 is only in lower centre.
- **88930 was 93606.** The grey and black curves seen from below in H2's back middle are 93606 (4 x 2 curved, no studs), not 88930.
- **The same drawer turns up under new codes and turned round.** H3 is round 2's A3, a quarter turn round. Check new photos against old ones before reading from scratch.

## What I2's last four boxes taught (scored 2026-11-10)

The last four boxes checked (Lower right, Middle right, Back right, Back narrow) were the worst of I2: 15 named, 5 right, 10 wrong, 11 missed.
- **A Technic box was filled from the group, again.** Middle right named the common connectors (6536, 18654, 32013, 42003, 62462), and all five were wrong. It is the *angled* axle-and-pin connector box: 32034 (#2), 32016 (#3), 32192 (#4), 32015 (#5), 32014 (#6) and 10288 (triple), plus 6538a. A box holding one family in several angles should be read as that family, and asked about, not filled with the commonest Technic parts.
- **Lower right is plates with clips and handles:** 4590, 3839b, 61072. 4623 and 23443 were guesses and wrong.
- **Back right:** only 2432 was right; 2540, 99563 and 3044a were wrong, and the 98834 spoiler with handle was missed. Handled parts (2432, 98834, 3839b, 2540-type) are spread over three boxes, so look closely at handle shapes.
- **Back narrow held more than the one part named:** 2508 (long towball plate), 4596 and 4714 (stretcher) as well as 47755. One part named in a box rarely means one part there.
- Across I2, misses (19) outnumber wrong parts (12). For small mixed boxes, the bigger problem now is stopping too early, not guessing too much.

## What's worked

- Reference pictures changed answers in round 2: looped plates looked like locking hinges until compared, and were 4590; the 3-bar 2412 and the slotted 61409 are easy to mix up.
- Ruling out helped: 30165, 41855 were confirmed not in A1, and turned up as strong matches in A3.
- The collection's rare parts are useful: only 4 of 35442 exist, and the purple starburst matches it.

## Capture notes from the phone page (round 3)

- Single-piece photos are the most useful thing yet: one clear example per box, on a plain background. They don't say which box they came from, though, so match them by colour and shape.
- Black parts in the black tubs are close to unreadable from above. Ask for a close-up with the torch, or a handful tipped onto a light surface.
- The whole drawer must be in frame and shot square on. H1's back-right clear box was cut off and skewed.
- Containers 50 mm deep and opaque mean fill can only be judged from above.
- For mixed boxes (props, food, animal parts) the user is happy for the draft to fill them by part type. Mark those as "assumed by type".

## Rules for next time

1. Name a part only if a specific example can be pointed at in the photo. Put anything else under "maybe".
2. Compare doubtful parts against reference pictures from Rebrickable, rather than relying on memory of the shape.
3. Use confirmed drawers to rule things out. A part confirmed in full somewhere doesn't need considering again, and what's left in the collection narrows the rest.
4. Check that the pieces named are plausible for the pocket's size. If a part's whole quantity can't fit, say that some must be elsewhere.
5. After naming parts, look for what's left over in the pocket that nothing named explains.

## Confirmed so far

See `drawer-drafts.json`. These are known not to be in A1 (now H2): 3659, 4490, 2339, 93273, 41855, 30165, 42022, 41747, 41748, 29119, 29120, 88930, 42023. 29119 and 29120 are in H1's clear back-right box.

## Catalogue quirks

Part numbers are merged into one mould, so use the merged number in drafts. 10314 is filed under 6191, which means they can't be told apart in the app.

## Facts from the user

- Pockets are themed where possible, for example A2 back middle is all fences.
- Stickers can hide a part: "SPORT" in A1 was a sticker on 10314, not a print.
- A1 (now H2): 78666 is only in back left. Back right has 50950 and 24309. 3563 and 6191 are only in lower centre. Middle left has 32803. Back middle also has 93606.
- A3/H3's gears box holds "several other similar piece types" beyond the five named (user's note on review).
- Printed labels are often readable in side views, but can be stale: A2's front left label says 2412 and 61409, which look to be in middle left. Awaiting confirmation.
- Z as recorded by the user in the app: 3010, 3009, 6111, 3008, 6112, 2465. It doesn't include the 3622 (1 x 3) read from the photo, so that needs checking.

## Limits to remember

- A part is assumed to be entirely in the places recorded so far. Naming a common part in a small pocket (3039 x 587 in A3) wrecks that pocket's estimate until its other locations are recorded, so don't use fills to correct volumes until most of the collection is in.

## Mislabelled photos

The round 2 photos named A2 and A3 were of Sterilite Large drawers, not Mediums. "A2" is I2, photographed again in round 4 from the handle side, which shows it on the left. "A3" was photographed again in round 6 as H3 (same boxes, a quarter turn round). On review the user gave A3? the code A3, so whether it's A3 or H3 is still to be confirmed; the H3 draft carries A3?'s confirmed parts. Z is as labelled. A1 has moved to H2, and its draft now uses that code.

Orientation: drawers photographed with the handle on the left of the picture read as front = left column, and the drawer's left side = top row. Round 1's A1 names (front left, lower centre, right tall...) map onto H2's photo this way.

## Still to confirm

- H3: the black round part with six notches in the gears box (not 4185, checked against the reference), the flat blue piece from the pointed-slopes box, and the small red curved piece from the back-left medium box.
- Silhouettes worth remembering: 61678 seen side-on has a saw-tooth underside (H2 piece 5); 6191 is a full 1 x 4 half-cylinder, and 79756 is the thinner one.

- H1: pieces 3, 4 and 5 (grey house-shaped tile, grey and teal angled tiles) weren't identified, and the sizes of the two clear boxes on the right aren't known.
- I2 piece photos not yet identified: the grey frame and white tray-like plate in piece 3, the grey Y and clip parts in piece 6, the white sloped block in piece 8, the white plate with upright tabs in piece 9, and the round sign and pirate flag in piece 12.

- A3: its containers come to 118% of a Sterilite Medium's floor as listed (2 large, 2 medium, 8 small). That fits it being a Sterilite Large (H3), not a Medium.
