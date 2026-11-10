// Where pictures of parts come from. Rebrickable's LDraw renders cover most moulds; BrickLink fills gaps
// where its part number matches. Neutral greys so the shape, not the colour, stands out.
const SOURCES = (p: string) => [
  ['rb', `71/${p}.png`],
  ['bl', `PN/86/${p}.png`],
  ['rb', `0/${p}.png`],
  ['bl', `PN/11/${p}.png`],
];

const HOSTS: Record<string, string> = {
  rb: 'https://cdn.rebrickable.com/media/parts/ldraw/',
  bl: 'https://img.bricklink.com/ItemImage/',
};

export const partImages = (partNum: string) => SOURCES(encodeURIComponent(partNum)).map(([host, path]) => HOSTS[host] + path);

/** The same pictures through the dev server, which lets the page read their pixels to draw labels */
export const sameOriginPartImages = (partNum: string) => SOURCES(encodeURIComponent(partNum)).map(([host, path]) => `/part-img/${host}/${path}`);
