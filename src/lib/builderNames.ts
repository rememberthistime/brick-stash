// Names a builder would use. Rebrickable's names are accurate but read like a catalogue ("Brick Sloped 30° 1 x 1 x
// 2/3 (Cheese Slope)", "Plate Special 1 x 2 with 1 Stud with Groove and Inside Stud Holder (Jumper)"). The plain name
// leads with what you'd call the part out loud ("Cheese slope 1×1", "Jumper 1×2"); the official name stays beside it
// wherever there's room, and in the part's tooltip.
//
// Kinds are the groups a builder sorts by inside a catalogue heading: Rebrickable files jumpers, brackets, clips and
// plates with bars all under "Plates Special", where nobody would look for them together.

/** Parts known by a nickname, by Rebrickable's part number */
const NICKNAMES: Record<string, string> = {
  '54200': 'Cheese slope 1×1',
  '85984': 'Cheese slope 1×2',
  '3794a': 'Jumper 1×2',
  '3794b': 'Jumper 1×2',
  '15573': 'Jumper 1×2',
  '87580': 'Jumper 2×2',
  '4070': 'Headlight brick 1×1',
  '6141': 'Round plate 1×1 (dot)',
  '4073': 'Round plate 1×1 (dot)',
  '98138': 'Round tile 1×1',
  '3062a': 'Round brick 1×1',
  '3062b': 'Round brick 1×1',
  '4589': 'Cone 1×1',
  '2780': 'Friction pin (black)',
  '3673': 'Pin without friction (grey)',
  '6558': 'Long friction pin (blue)',
  '43093': 'Axle pin with friction (blue)',
  '4274': 'Half pin',
  '3713': 'Technic bush',
  '32123a': 'Half bush',
  '32123b': 'Half bush',
  '24866': 'Flower plate 1×1',
  '25269': 'Quarter round tile 1×1',
};

/** What a nickname in the name means, where it's a word on its own */
const AKA_WORDS: Record<string, string> = { log: 'Log brick', jumper: 'Jumper', 'cheese slope': 'Cheese slope' };

/** Catalogue headings at the start of a name, and what you'd say instead */
const PREFIXES: [RegExp, string][] = [
  [/^Brick Sloped Inverted\b/, 'Inverted slope'],
  [/^Brick Sloped\b/, 'Slope'],
  [/^Brick Curved Inverted\b/, 'Inverted curved slope'],
  [/^Brick Curved\b/, 'Curved slope'],
  [/^Brick Wedged\b/, 'Wedge brick'],
  [/^Brick Round\b/, 'Round brick'],
  [/^Brick Arch\b/, 'Arch'],
  [/^Brick Special\b/, 'Brick'],
  [/^Plate Special Round\b/, 'Round plate'],
  [/^Plate Special\b/, 'Plate'],
  [/^Plate Round\b/, 'Round plate'],
  [/^Tile Special\b/, 'Tile'],
  [/^Tile Round\b/, 'Round tile'],
];

/** Words kept capitalised wherever they are */
const PROPER = new Set(['Technic', 'Duplo', 'Minifig', 'Minidoll', 'LEGO', 'Star', 'Wars', 'Ninjago', 'DOTS']);

const SIZE = /(\d+(?:\.\d+)?(?: \d+\/\d+)?|\d+\/\d+)\s+x\s+(?=\d)/g;
/** "1 x 2 x 2/3" → "1×2×2/3" */
export const tightSizes = (s: string) => s.replace(SIZE, '$1×');

/** The first footprint in a name, "1×2", for following a nickname */
const footprint = (name: string) => {
  const m = name.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  return m ? `${m[1]}×${m[2]}` : '';
};

const sentence = (s: string) =>
  s
    .split(' ')
    .map((w, i) => (i === 0 || PROPER.has(w) || /\d/.test(w) || /^[A-Z]{2,}$/.test(w) || /^[A-Z]-/.test(w) ? w : w.toLowerCase()))
    .join(' ');

const cache = new Map<string, string>();

/**
 * What a builder would call a part: "Cheese slope 1×1" for "Brick Sloped 30° 1 x 1 x 2/3 (Cheese Slope)",
 * "Inverted slope 45° 2×2" for "Brick Sloped Inverted 45° 2 x 2 [Ovoid Bottom Pin, Bar-sized Stud Holes]".
 * Mould details in square brackets are left to the official name.
 */
export function plainName(name: string, partNum?: string): string {
  if (partNum && NICKNAMES[partNum]) return NICKNAMES[partNum];
  const key = `${partNum ?? ''}|${name}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  let out = name.trim();
  const aka = out.match(/\[aka ([^\]]+)\]/i) ?? out.match(/\((Cheese Slope|Jumper)\)/i);
  if (aka) {
    const word = aka[1].trim();
    const nick = AKA_WORDS[word.toLowerCase()] ?? sentence(word);
    out = `${nick} ${footprint(out)}`.trim();
  } else {
    for (const [re, said] of PREFIXES) {
      if (re.test(out)) {
        out = out.replace(re, said);
        break;
      }
    }
    out = sentence(tightSizes(out.replace(/\s*\[[^\]]*\]/g, '')));
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,$/, '').trim();
  if (!out) out = name;
  cache.set(key, out);
  return out;
}

/** The plain name of a part, falling back to its number */
export const partPlainName = (p: { partNum: string; name: string }) => plainName(p.name || p.partNum, p.partNum);

/** The plain name, with the official one after it where they differ, for places with room for both */
export function bothNames(p: { partNum: string; name: string }): { plain: string; official?: string } {
  const plain = partPlainName(p);
  const same = (x: string) => tightSizes(x).toLowerCase();
  return same(plain) === same(p.name) ? { plain } : { plain, official: p.name };
}

// ─── Kinds ───────────────────────────────────────────────────────────────────

export interface Kind {
  key: string;
  /** what a group of them is called: "Brackets" */
  label: string;
}

const KINDS: { key: string; label: string; test: RegExp; nums?: string[] }[] = [
  { key: 'cheese', label: 'Cheese slopes', test: /\(Cheese Slope\)/i, nums: ['54200', '85984'] },
  { key: 'jumper', label: 'Jumpers', test: /\(Jumper\)/i, nums: ['3794a', '3794b', '15573', '87580'] },
  { key: 'bracket', label: 'Brackets', test: /^Bracket\b|^Plate Special .*\bBracket\b/i },
  { key: 'plate-clip', label: 'Plates with clips', test: /^Plate Special .*\bClips?\b/i },
  { key: 'plate-bar', label: 'Plates with bars and handles', test: /^Plate Special .*\b(Bar|Handle|Bar Holder)\b/i },
  { key: 'plate-pin', label: 'Plates with pins and axle holes', test: /^Plate Special .*\b(Pins?|Pin Hole|Axle|Towball)\b/i },
  { key: 'plate-wheel', label: 'Plates with wheel holders', test: /^Plate Special .*\bWheel Holder/i },
  { key: 'plate-side', label: 'Plates with studs on the side', test: /^Plate Special .*\bStuds? on (the )?(1 )?Sides?\b/i },
  { key: 'plate-rail', label: 'Plates with rails and grooves', test: /^Plate Special .*\b(Rail|Door Rail|Groove)\b/i },
  { key: 'log', label: 'Log bricks', test: /\[aka Log\]|\bPalisade\b/i },
  { key: 'brick-side', label: 'Bricks with studs on the side', test: /^Brick Special .*\bStuds? on\b/i, nums: ['4070'] },
  { key: 'brick-clip', label: 'Bricks with clips and bars', test: /^Brick Special .*\b(Clips?|Bar|Handle)\b/i },
  { key: 'brick-pin', label: 'Bricks with pins and axle holes', test: /^Brick Special .*\b(Pins?|Axle|Pin Hole)\b/i },
  { key: 'grille', label: 'Grille tiles', test: /^Tile Special .*\bGrille\b/i, nums: ['2412a', '2412b'] },
  { key: 'tile-clip', label: 'Tiles with clips and bars', test: /^Tile Special .*\b(Clips?|Bar|Handle)\b/i },
  { key: 'inverted', label: 'Inverted slopes', test: /^Brick (Sloped|Curved) Inverted\b|^Brick Wedged, Sloped Inverted\b/i },
  { key: 'arch', label: 'Arches', test: /^Brick Arch\b/i },
  { key: 'round-1x1', label: '1×1 rounds', test: /^(Plate|Tile|Brick) Round 1 x 1\b/i, nums: ['6141', '4073', '98138', '3062a', '3062b', '4589'] },
];

/** The builder's group a part belongs to within its catalogue heading, or null where the heading already says it */
export function builderKind(p: { partNum: string; name: string }): Kind | null {
  for (const k of KINDS) if (k.nums?.includes(p.partNum) || k.test.test(p.name)) return { key: k.key, label: k.label };
  return null;
}

/** For tooltips: "Cheese slope 1×1 (Brick Sloped 30° 1 x 1 x 2/3 (Cheese Slope))", or the one name where they agree */
export function nameTitle(p: { partNum: string; name: string }): string {
  const { plain, official } = bothNames(p);
  return official ? `${plain} · ${official}` : plain;
}

/** Both names, for searching by either */
export const searchName = (p: { partNum: string; name: string }) => `${p.name} ${partPlainName(p)}`;
