// Reading the collection from Brick Work (https://github.com/Ulef1005/brick-work), the user's collection manager, over
// its REST API. The address and a token are set on the server (BRICK_WORK_URL, BRICK_WORK_TOKEN), so the token never
// reaches a browser. Only reads: a read-only token is enough.
//
// What's stored loose in drawers is Brick Work's loose stock plus the parts of every set copy, since Brick Work doesn't
// say which sets are kept built. Brick Stash's "Sets you keep built" takes the built ones off, as it does for a
// Rebrickable export.

const PAGE = 200;
/** Set copies whose parts are read at once */
const AT_ONCE = 4;

export const brickWorkDefaults = () => ({
  url: (process.env.BRICK_WORK_URL ?? '').trim().replace(/\/+$/, ''),
  token: (process.env.BRICK_WORK_TOKEN ?? '').trim(),
});

/** Rebrickable's number for an item, else its preferred BrickLink number; null for an item with neither */
export function partNumberOf(item) {
  if (item?.rebrickable?.key) return String(item.rebrickable.key);
  const links = Array.isArray(item?.bricklink) ? item.bricklink : [];
  const link = links.find((l) => l?.preferred) ?? links[0];
  return link?.no ? String(link.no) : null;
}

const colourOf = (c) => (c && typeof c === 'object' ? c.name ?? (c.rebrickable_id != null ? String(c.rebrickable_id) : undefined) : undefined);

export function createBrickWork({ url: given, token, fetchImpl = fetch }) {
  // "http://nas:3333/" and "http://nas:3333" are the same place
  const url = (given ?? '').trim().replace(/\/+$/, '');
  const configured = !!(url && token);

  async function call(path) {
    let reply;
    try {
      reply = await fetchImpl(`${url}/api/v2${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch (e) {
      throw Object.assign(new Error(`Couldn't reach Brick Work at ${url}: ${e.cause?.code ?? e.message}`), { status: 502 });
    }
    if (reply.status === 401) throw Object.assign(new Error('Brick Work turned the token down. Check BRICK_WORK_TOKEN.'), { status: 502 });
    if (reply.status === 403) throw Object.assign(new Error('The Brick Work token isn’t allowed to read. It needs the read scope.'), { status: 502 });
    if (reply.status === 503) throw Object.assign(new Error('Brick Work’s API is switched off. Create a token under Admin › API tokens.'), { status: 502 });
    if (!reply.ok) throw Object.assign(new Error(`Brick Work said ${reply.status} for ${path}.`), { status: 502 });
    return reply.json();
  }

  /** Every item of a list, page by page */
  async function all(path) {
    const out = [];
    let cursor = null;
    for (let guard = 0; guard < 10_000; guard++) {
      const sep = path.includes('?') ? '&' : '?';
      const body = await call(`${path}${sep}limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      out.push(...(Array.isArray(body?.data) ? body.data : []));
      cursor = body?.page?.next_cursor ?? null;
      if (!cursor) break;
    }
    return out;
  }

  return {
    configured,
    url,
    /** Whether Brick Work answers, and as which token */
    async status() {
      if (!configured) return { configured: false };
      try {
        const me = await call('/me');
        return { configured: true, ok: true, url, token: me?.data?.name ?? me?.name ?? null, scopes: me?.data?.scopes ?? me?.scopes ?? [] };
      } catch (e) {
        return { configured: true, ok: false, url, error: e.message };
      }
    },
    /**
     * The collection as rows to import: loose parts, then each set copy's parts (less any recorded missing; spares
     * kept, as they're loose in the drawers). Items with no Rebrickable or BrickLink number are counted, not imported.
     */
    async collection() {
      const rows = [];
      let unnamed = 0;
      const add = (item, color, qty, extra = {}) => {
        const partNum = partNumberOf(item);
        if (!partNum) return void unnamed++;
        if (!(qty > 0)) return;
        rows.push({ partNum, qty, ...(colourOf(color) ? { colour: colourOf(color) } : {}), ...(item?.name ? { name: item.name } : {}), ...extra });
      };
      const loose = await all('/stock?kind=part');
      for (const line of loose) if (!line.archived_at) add(line.item, line.color, line.quantity);
      const copies = (await all('/copies')).filter((c) => !c.archived_at);
      let fromSets = 0;
      for (let i = 0; i < copies.length; i += AT_ONCE) {
        const batch = copies.slice(i, i + AT_ONCE);
        const lists = await Promise.all(batch.map((c) => all(`/copies/${encodeURIComponent(c.id)}/parts`)));
        lists.forEach((parts) => {
          for (const p of parts) {
            // Parts of a minifigure in the set are listed too; whole figures aren't parts to store loose
            if (p.item?.kind && p.item.kind !== 'part') continue;
            const before = rows.length;
            add(p.item, p.color, (p.quantity ?? 0) - (p.missing ?? 0), p.spare ? { spare: true } : {});
            fromSets += rows.length - before;
          }
        });
      }
      return { rows, looseLines: loose.length, sets: copies.length, setLines: fromSets, unnamed };
    },
  };
}
