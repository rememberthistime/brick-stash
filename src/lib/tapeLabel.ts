// Labels for Brother P-touch printers on 12 mm tape: one per compartment, listing each section in it.
// Each is drawn at the printer's own resolution in pure black and white, then saved as a PNG or wrapped
// in an .lbx file that P-touch Editor opens directly.
import { leaves, sectionLabel, type PlannedCompartment } from './planner';
import { makeZip } from './zip';

/** Printable height of 12 mm tape: 25.6 pt, or 64 dots at the 180 dpi these printers use */
export const TAPE_DOTS = 64;
const POINTS_PER_DOT = 72 / 180;
const CELL_GAP = 10;
const CODE_PADDING = 6;
const IMAGE_SIZE = 58;
const TEXT_WIDTH = 170;
const TITLE_FONT = 'bold 18px Arial, sans-serif';
const DETAIL_FONT = '13px Arial, sans-serif';
/** How much of the part pictures' pale grey to pull down towards black, so the shape survives on tape */
const IMAGE_GAMMA = 1.5;

/** Enough of a name to recognise a part on a small label */
export function shortName(label: string): string {
  return label
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/ — other$/, ' other')
    .replace(/ with .*$/i, '')
    .replace(/,.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LabelCell {
  title: string;
  detail: string;
  /** part numbers to picture, most numerous first */
  images: string[];
}

export interface LabelSpec {
  code: string;
  cells: LabelCell[];
}

export function labelSpec(c: PlannedCompartment & { code: string }): LabelSpec {
  return {
    code: c.code,
    cells: c.sections.map((s) => {
      const parts = leaves(s.node).flatMap((l) => (l.part ? [l.part] : [])).sort((a, b) => b.qty - a.qty);
      return {
        title: shortName(sectionLabel(s)),
        detail: parts.length === 1 ? parts[0].partNum : `${parts.length} types`,
        images: parts.slice(0, parts.length === 1 ? 1 : 2).map((p) => p.partNum),
      };
    }),
  };
}

/** Floyd–Steinberg error diffusion: greys (0 black to 255 white) down to pure black and white */
export function errorDiffuse(gray: Uint8ClampedArray | number[], w: number, h: number): Uint8Array {
  const v = Float32Array.from(gray);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const on = v[i] < 128 ? 0 : 255;
      const err = v[i] - on;
      out[i] = on;
      if (x + 1 < w) v[i + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) v[i + w - 1] += (err * 3) / 16;
        v[i + w] += (err * 5) / 16;
        if (x + 1 < w) v[i + w + 1] += err / 16;
      }
    }
  }
  return out;
}

/** Break a title onto at most two lines of the given width, measured by `measure` */
export function wrapTitle(title: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = title.split(' ');
  for (const [i, word] of words.entries()) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === 1 && measure(words.slice(i).join(' ')) > width) {
      // Second line won't fit whole: trim it to what will
      let rest = words.slice(i).join(' ');
      while (rest.length > 1 && measure(`${rest}…`) > width) rest = rest.slice(0, -1);
      return [lines[0], `${rest.trimEnd()}…`];
    }
  }
  lines.push(line);
  return lines;
}

/** A part picture cropped to its shape, stretched to full contrast and dithered for the printer */
function tapeImage(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const source = document.createElement('canvas');
  source.width = img.width;
  source.height = img.height;
  const sc = source.getContext('2d', { willReadFrequently: true })!;
  sc.fillStyle = '#fff';
  sc.fillRect(0, 0, img.width, img.height);
  sc.drawImage(img, 0, 0);
  const px = sc.getImageData(0, 0, img.width, img.height).data;
  let [x0, y0, x1, y1] = [img.width, img.height, 0, 0];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (px[i] < 245 || px[i + 1] < 245 || px[i + 2] < 245) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < x0) [x0, y0, x1, y1] = [0, 0, img.width - 1, img.height - 1];

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const scale = Math.min(IMAGE_SIZE / w, IMAGE_SIZE / h);
  const out = document.createElement('canvas');
  out.width = IMAGE_SIZE;
  out.height = IMAGE_SIZE;
  const oc = out.getContext('2d', { willReadFrequently: true })!;
  oc.fillStyle = '#fff';
  oc.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(source, x0, y0, w, h, (IMAGE_SIZE - w * scale) / 2, (IMAGE_SIZE - h * scale) / 2, w * scale, h * scale);

  const data = oc.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const gray: number[] = [];
  let darkest = 255;
  for (let i = 0; i < data.data.length; i += 4) {
    const g = 0.3 * data.data[i] + 0.59 * data.data[i + 1] + 0.11 * data.data[i + 2];
    gray.push(g);
    darkest = Math.min(darkest, g);
  }
  const range = Math.max(1, 255 - darkest);
  const bits = errorDiffuse(gray.map((g) => 255 * ((g - darkest) / range) ** IMAGE_GAMMA), IMAGE_SIZE, IMAGE_SIZE);
  for (let i = 0; i < bits.length; i++) {
    data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = bits[i];
    data.data[i * 4 + 3] = 255;
  }
  oc.putImageData(data, 0, 0);
  return out;
}

export interface RenderedLabel {
  width: number;
  png: Uint8Array;
  dataUrl: string;
}

/** Draw one label. `loadImage` returns a picture of a part, or null if there isn't one. */
export async function renderLabel(spec: LabelSpec, loadImage: (partNum: string) => Promise<HTMLImageElement | null>): Promise<RenderedLabel> {
  const measure = document.createElement('canvas').getContext('2d')!;
  const textWidth = (s: string, font: string) => {
    measure.font = font;
    return measure.measureText(s).width;
  };

  measure.font = 'bold 30px Arial, sans-serif';
  const codeWidth = Math.ceil(measure.measureText(spec.code).width) + CODE_PADDING * 2;

  const cells = await Promise.all(
    spec.cells.map(async (cell) => {
      const images = (await Promise.all(cell.images.map(loadImage))).filter((i): i is HTMLImageElement => !!i).map(tapeImage);
      const lines = wrapTitle(cell.title, TEXT_WIDTH, (s) => textWidth(s, TITLE_FONT));
      const text = Math.ceil(Math.max(...lines.map((l) => textWidth(l, TITLE_FONT)), textWidth(cell.detail, DETAIL_FONT)));
      return { cell, images, lines, width: images.length * (IMAGE_SIZE + 2) + text };
    }),
  );

  const width = codeWidth + cells.reduce((t, c) => t + c.width + CELL_GAP * 2, 0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = TAPE_DOTS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, TAPE_DOTS);

  // The location code, white on black so it stands out at arm's length
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, codeWidth, TAPE_DOTS);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.code, CODE_PADDING, TAPE_DOTS / 2 + 1);

  let x = codeWidth + CELL_GAP;
  cells.forEach((c, i) => {
    if (i > 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x - CELL_GAP, 6, 2, TAPE_DOTS - 12);
    }
    let cx = x;
    for (const image of c.images) {
      ctx.drawImage(image, cx, (TAPE_DOTS - IMAGE_SIZE) / 2);
      cx += IMAGE_SIZE + 2;
    }
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    const blockHeight = c.lines.length * 20 + 15;
    let y = (TAPE_DOTS - blockHeight) / 2 + 16;
    ctx.font = TITLE_FONT;
    for (const line of c.lines) {
      ctx.fillText(line, cx, y);
      y += 20;
    }
    ctx.font = DETAIL_FONT;
    ctx.fillText(c.cell.detail, cx, y - 2);
    x += c.width + CELL_GAP * 2;
  });

  // Text comes out anti-aliased: take everything to pure black and white for the printer
  const data = ctx.getImageData(0, 0, width, TAPE_DOTS);
  for (let i = 0; i < data.data.length; i += 4) {
    const on = data.data[i] < 128 ? 0 : 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = on;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);

  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
  return { width, png: new Uint8Array(await blob.arrayBuffer()), dataUrl: canvas.toDataURL('image/png') };
}

const pt = (n: number) => `${Math.round(n * 1000) / 1000}pt`;

/** The label.xml for one picture filling a 12 mm tape label, following the layout P-touch Editor itself writes */
export function lbxLabelXml(widthDots: number, imageName: string): string {
  const w = widthDots * POINTS_PER_DOT;
  const h = TAPE_DOTS * POINTS_PER_DOT;
  const x = '5.6pt';
  const y = '4pt';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<pt:document xmlns:pt="http://schemas.brother.info/ptouch/2007/lbx/main" xmlns:style="http://schemas.brother.info/ptouch/2007/lbx/style" xmlns:text="http://schemas.brother.info/ptouch/2007/lbx/text" xmlns:draw="http://schemas.brother.info/ptouch/2007/lbx/draw" xmlns:image="http://schemas.brother.info/ptouch/2007/lbx/image" xmlns:barcode="http://schemas.brother.info/ptouch/2007/lbx/barcode" xmlns:database="http://schemas.brother.info/ptouch/2007/lbx/database" xmlns:table="http://schemas.brother.info/ptouch/2007/lbx/table" xmlns:cable="http://schemas.brother.info/ptouch/2007/lbx/cable" version="1.7" generator="P-touch Editor 5.4.014 Windows">' +
    '<pt:body currentSheet="Sheet 1" direction="LTR"><style:sheet name="Sheet 1">' +
    '<style:paper media="0" width="33.6pt" height="850pt" marginLeft="4pt" marginTop="5.6pt" marginRight="4pt" marginBottom="5.6pt" orientation="landscape" autoLength="true" monochromeDisplay="true" printColorDisplay="false" printColorsID="0" paperColor="#FFFFFF" paperInk="#000000" split="1" format="259" backgroundTheme="0" printerID="22832" printerName="Brother PT-1230PC"/>' +
    '<style:cutLine regularCut="0pt" freeCut=""/>' +
    `<style:backGround x="${x}" y="${y}" width="${pt(w)}" height="${pt(h)}" brushStyle="NULL" brushId="0" userPattern="NONE" userPatternId="0" color="#000000" printColorNumber="1" backColor="#FFFFFF" backPrintColorNumber="0"/>` +
    '<pt:objects><image:image>' +
    `<pt:objectStyle x="${x}" y="${y}" width="${pt(w)}" height="${pt(h)}" backColor="#FFFFFF" backPrintColorNumber="0" ropMode="COPYPEN" angle="0" anchor="TOPLEFT" flip="NONE">` +
    '<pt:pen style="NULL" widthX="0.5pt" widthY="0.5pt" color="#000000" printColorNumber="1"/><pt:brush style="NULL" color="#000000" printColorNumber="1" id="0"/>' +
    '<pt:expanded objectName="Image1" ID="0" lock="0" templateMergeTarget="LABELLIST" templateMergeType="NONE" templateMergeID="0" linkStatus="NONE" linkID="0"/></pt:objectStyle>' +
    `<image:imageStyle originalName="${imageName}" alignInText="LEFT" firstMerge="true" fileName="${imageName}">` +
    '<image:transparent flag="false" color="#FFFFFF"/>' +
    `<image:trimming flag="false" shape="RECTANGLE" trimOrgX="0pt" trimOrgY="0pt" trimOrgWidth="${pt(w)}" trimOrgHeight="${pt(h)}"/>` +
    `<image:orgPos x="${x}" y="${y}" width="${pt(w)}" height="${pt(h)}"/>` +
    '<image:effect effect="NONE" brightness="50" contrast="50" photoIndex="4"/>' +
    '<image:mono operationKind="BINARY" reverse="0" ditherKind="MESH" threshold="128" gamma="100" ditherEdge="0" rgbconvProportionRed="30" rgbconvProportionGreen="59" rgbconvProportionBlue="11" rgbconvProportionReversed="0"/>' +
    '</image:imageStyle></image:image></pt:objects></style:sheet></pt:body></pt:document>'
  );
}

const PROP_XML =
  '<?xml version="1.0" encoding="UTF-8"?><meta:properties xmlns:meta="http://schemas.brother.info/ptouch/2007/lbx/meta" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><meta:appName>P-touch Editor</meta:appName><dc:title></dc:title><dc:subject></dc:subject><dc:creator>Brick Stash</dc:creator><meta:keyword></meta:keyword><dc:description></dc:description><meta:template></meta:template><meta:numPages>1</meta:numPages><meta:numWords>0</meta:numWords><meta:numChars>0</meta:numChars><meta:security>0</meta:security></meta:properties>';

/** Package a rendered label as an .lbx file */
export function makeLbx(label: { width: number; png: Uint8Array }): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return makeZip([
    { name: 'prop.xml', data: encoder.encode(PROP_XML) },
    { name: 'label.png', data: label.png },
    { name: 'label.xml', data: encoder.encode(lbxLabelXml(label.width, 'label.png')) },
  ]);
}
