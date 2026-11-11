#!/usr/bin/python3 -I
"""The only program the photo reading may run besides ls (see server/reader.mjs).

It reads photos from the photos folder and writes only to the work folder, and fetches reference pictures
only from Rebrickable's CDN, so a run can't be talked into doing anything else with Python. The Docker
image installs it as /usr/local/bin/photo-tools, owned by root, so a run can't change it either.

  photo-tools info  A1-top.jpg [more...]          size and modified time of photos
  photo-tools shrink A1-top.jpg [--max 1600]       a downsized copy
  photo-tools crop  A1-top.jpg X Y W H [--max 900] a box cut out, in percent of the photo
  photo-tools ref   3001 [COLOUR]                  Rebrickable's picture of a part (colour 71 by default)

Photos are named relative to the photos folder (BRICK_PHOTOS); output paths, in BRICK_WORK, are printed.
"""
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

PHOTOS = Path(os.environ.get("BRICK_PHOTOS", "/data/photos")).resolve()
WORK = Path(os.environ.get("BRICK_WORK", Path.home() / ".brick-stash" / "work")).resolve()
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp)$", re.I)
PART = re.compile(r"^[A-Za-z0-9._-]{1,40}$")


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(2)


def photo(name):
    if not NAME.match(name):
        fail(f"Not a photo name: {name}")
    path = (PHOTOS / name).resolve()
    if path.parent != PHOTOS or not path.is_file():
        fail(f"No such photo in {PHOTOS}: {name}")
    return path


def option(args, flag, default):
    if flag in args:
        i = args.index(flag)
        value = int(args[i + 1])
        del args[i:i + 2]
        return value
    return default


def save(img, stem, suffix):
    WORK.mkdir(parents=True, exist_ok=True)
    out = WORK / f"{stem}{suffix}.jpg"
    img.convert("RGB").save(out, quality=88)
    print(out)


def main(args):
    if not args:
        fail(__doc__)
    command, args = args[0], args[1:]
    if command == "info":
        from PIL import Image
        for name in args:
            path = photo(name)
            with Image.open(path) as img:
                stamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(path.stat().st_mtime))
                print(f"{name}\t{img.width}x{img.height}\t{stamp}")
    elif command == "shrink":
        from PIL import Image, ImageOps
        biggest = option(args, "--max", 1600)
        if len(args) != 1:
            fail("shrink takes one photo")
        with Image.open(photo(args[0])) as img:
            img = ImageOps.exif_transpose(img)
            img.thumbnail((biggest, biggest))
            save(img, Path(args[0]).stem, "-small")
    elif command == "crop":
        from PIL import Image, ImageOps
        biggest = option(args, "--max", 900)
        if len(args) != 5:
            fail("crop takes a photo and X Y W H in percent")
        x, y, w, h = (float(v) for v in args[1:])
        if not (0 <= x < 100 and 0 <= y < 100 and 0 < w <= 100 and 0 < h <= 100):
            fail("X Y W H are percentages of the photo")
        with Image.open(photo(args[0])) as img:
            img = ImageOps.exif_transpose(img)
            box = (img.width * x / 100, img.height * y / 100,
                   img.width * min(100, x + w) / 100, img.height * min(100, y + h) / 100)
            img = img.crop(tuple(round(v) for v in box))
            img.thumbnail((biggest, biggest))
            save(img, Path(args[0]).stem, f"-crop-{x:g}-{y:g}-{w:g}-{h:g}")
    elif command == "ref":
        if not 1 <= len(args) <= 2 or not PART.match(args[0]) or (len(args) == 2 and not args[1].isdigit()):
            fail("ref takes a part number and optionally a colour number")
        num, colour = args[0], args[1] if len(args) == 2 else "71"
        url = f"https://cdn.rebrickable.com/media/parts/ldraw/{colour}/{num}.png"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "brick-stash"}), timeout=20) as r:
                data = r.read(5_000_000)
        except Exception as e:
            fail(f"Couldn't fetch {url}: {e}")
        out = WORK / "ref" / f"{num}-{colour}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        print(out)
    else:
        fail(f"Unknown command: {command}\n\n{__doc__}")


if __name__ == "__main__":
    main(sys.argv[1:])
