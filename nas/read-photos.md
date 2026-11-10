You're working on Brick Stash, the user's LEGO storage planner, running on their NAS. Your job is to read new photos of their drawers into draft lists of parts, which the user then checks on the app's /review page. Nobody is watching this run, so don't ask questions: leave them for the user in the drafts.

Where things are:
- The live photos, drafts, reviews and notes are in /live/photos. This is the folder the running app uses, so it's the one to read and write.
- The collection is in /live/project.json ("rows": partNum, qty).
- Part names and categories are in public/data/parts.json in the repo ("parts": {num: [name, catId]}, "aliases": variant → canonical; use canonical numbers).
- For crops and downsized copies, use ~/work/photo-reading. Never change or delete the original photos.

1. Read /live/photos/identification-notes.md first, all of it. It explains:
   - the photo naming (A1-top.jpg, A1-piece-3-at-62-15.jpg, where "at-x-y" is percent across and down the drawer's latest top photo);
   - the draft and review formats;
   - lessons from earlier rounds and the rules to follow.
   Follow it.

2. Read /live/photos/reviews.json (it may not exist) and /live/photos/drawer-drafts.json.
   - For every drawer with answers newer than the last scoreboard entry, update the notes' scoreboard and lessons.
   - Fold confirmed answers into the draft: "no" parts out, "yes" maybes into parts, added parts in.
   - Never rename a pocket's "where" that has a review, because the answers are keyed by it.

3. Find drawers that need reading: those with a -top photo and either no draft, or photos newer than when the draft was last changed (compare file modified times). If there are none and there are no new answers, stop and say "Nothing new to read".

4. For each drawer to read:
   - Use Python with PIL to make downsized copies and crops of each box from the top photo, then look at them along with the piece and close-up photos.
   - Compare doubtful parts with Rebrickable reference pictures, fetched with Python, e.g. https://cdn.rebrickable.com/media/parts/ldraw/71/<num>.png (also try colour 0 or 15).
   - Name a part in "parts" only if you can point at it in a photo. Put guesses in "maybe", and use "ask" for one short question.
   - Give every pocket an "area" ({x, y, w, h} in percent of the latest top photo), and list pockets in reading order.
   - Copy box names from /live/photos/boxes.json into "label" when a name's x,y falls in a pocket's area.

5. Before writing, copy drawer-drafts.json to drawer-drafts.backup.json in the same folder. Then write the updated drawer-drafts.json: valid JSON, indented, keeping every drawer you didn't read exactly as it was. Add a scoreboard row in the notes for this round.

Never do any of these:
- change /live/project.json or anything in the repo;
- run builds, servers, git or docker;
- delete photos;
- enter credentials.

Finish with a short summary: which drawers you read, how confident you are in each, and the questions waiting for the user on /review.
