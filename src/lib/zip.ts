// A small zip writer: enough for .lbx files (which are zips) and for downloading many labels at once.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export async function makeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const header = (size: number, fill: (v: DataView) => void) => {
    const bytes = new Uint8Array(size);
    fill(new DataView(bytes.buffer));
    return bytes;
  };
  const common = (v: DataView, at: number, crc: number, packed: number, raw: number, nameLength: number) => {
    v.setUint16(at, 20, true); // version needed
    v.setUint16(at + 2, 0x0800, true); // names are UTF-8
    v.setUint16(at + 4, 8, true); // deflate
    v.setUint16(at + 6, 0, true); // time
    v.setUint16(at + 8, 0x21, true); // date: 1980-01-01
    v.setUint32(at + 10, crc, true);
    v.setUint32(at + 14, packed, true);
    v.setUint32(at + 18, raw, true);
    v.setUint16(at + 22, nameLength, true);
  };

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const packed = await deflate(entry.data);
    const crc = crc32(entry.data);
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      common(v, 4, crc, packed.length, entry.data.length, name.length);
    });
    const dir = header(46, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true); // version made by
      common(v, 6, crc, packed.length, entry.data.length, name.length);
      v.setUint32(42, offset, true);
    });
    chunks.push(local, name, packed);
    central.push(dir, name);
    offset += local.length + name.length + packed.length;
  }

  const centralSize = central.reduce((t, c) => t + c.length, 0);
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, entries.length, true);
    v.setUint16(10, entries.length, true);
    v.setUint32(12, centralSize, true);
    v.setUint32(16, offset, true);
  });
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((t, c) => t + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
