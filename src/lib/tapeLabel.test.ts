import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { errorDiffuse, lbxLabelXml, makeLbx, shortName, stripGroups, TAPE_DOTS, wrapTitle } from './tapeLabel';
import { crc32, makeZip } from './zip';

/** Read a zip back, checking its structure as a stranger would */
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const packed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = new Uint8Array(inflateRawSync(bytes.subarray(start, start + packed)));
    expect(crc32(data)).toBe(view.getUint32(at + 16, true));
    files[name] = data;
    at += 46 + nameLength;
  }
  return files;
}

describe('zip', () => {
  it('computes the standard checksum', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes files that read back intact', async () => {
    const a = new TextEncoder().encode('hello hello hello');
    const b = new Uint8Array([0, 1, 2, 255]);
    const files = unzip(await makeZip([{ name: 'a.txt', data: a }, { name: 'dir/b.bin', data: b }]));
    expect(new TextDecoder().decode(files['a.txt'])).toBe('hello hello hello');
    expect([...files['dir/b.bin']]).toEqual([0, 1, 2, 255]);
  });
});

describe('.lbx files', () => {
  it('holds what P-touch Editor expects, sized for 12 mm tape', async () => {
    const png = new Uint8Array([1, 2, 3]);
    const files = unzip(await makeLbx({ width: 500, png }));
    expect(Object.keys(files).sort()).toEqual(['label.png', 'label.xml', 'prop.xml']);
    const xml = new TextDecoder().decode(files['label.xml']);
    expect(xml).toContain('width="33.6pt"');
    expect(xml).toContain('fileName="label.png"');
    expect(xml).toContain('width="200pt" height="25.6pt"'); // 500 dots at 180 dpi, full printable height
    expect(TAPE_DOTS * 0.4).toBeCloseTo(25.6);
  });

  it('has balanced tags', () => {
    const xml = lbxLabelXml(100, 'label.png');
    const open: string[] = [];
    for (const m of xml.matchAll(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g)) {
      if (m[1]) expect(open.pop()).toBe(m[2]);
      else if (!m[3]) open.push(m[2]);
    }
    expect(open).toEqual([]);
  });
});

describe('text', () => {
  it('shortens long part names', () => {
    expect(shortName('Brick Special 1 x 2 with Masonry Brick Profile')).toBe('Brick Special 1 x 2');
    expect(shortName('Brick Curved 4 x 1 No Studs [Stud Holder with Symmetric Ridges]')).toBe('Brick Curved 4 x 1 No Studs');
    expect(shortName('Short Technic beams (up to 4 long)')).toBe('Short Technic beams');
    expect(shortName('Plate 1 x 2 (1/2)')).toBe('Plate 1 x 2');
  });

  it('wraps to two lines at most', () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapTitle('Brick 2 x 4', 200, measure)).toEqual(['Brick 2 x 4']);
    expect(wrapTitle('Bricks Special 1 x 2 Palisade', 150, measure)).toEqual(['Bricks Special', '1 x 2 Palisade']);
    const long = wrapTitle('One Two Three Four Five Six Seven Eight Nine Ten', 100, measure);
    expect(long).toHaveLength(2);
    expect(long[1].endsWith('…')).toBe(true);
    expect(measure(long[1])).toBeLessThanOrEqual(100);
  });
});

describe('errorDiffuse', () => {
  it('gives pure black and white, keeping the overall shade', () => {
    const w = 32;
    const out = errorDiffuse(new Array(w * w).fill(128), w, w);
    expect(new Set(out).size).toBe(2);
    const black = out.filter((v) => v === 0).length / out.length;
    expect(black).toBeGreaterThan(0.4);
    expect(black).toBeLessThan(0.6);
  });

  it('leaves solid black and white alone', () => {
    expect([...errorDiffuse([0, 0, 255, 255], 2, 2)]).toEqual([0, 0, 255, 255]);
  });
});

describe('a continuous strip', () => {
  it('keeps labels in order and starts a new strip before one would run too long', () => {
    expect(stripGroups([100, 100, 100], 1000, 24)).toEqual([[0, 1, 2]]);
    expect(stripGroups([400, 400, 400], 900, 24)).toEqual([[0, 1], [2]]);
    expect(stripGroups([1200, 100], 1000, 24)).toEqual([[0], [1]]);
  });
});
