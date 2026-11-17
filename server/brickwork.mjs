// Brick Work (https://github.com/Ulef1005/brick-work), the user's collection manager, over its REST API. The address
// and a token are set on the server (BRICK_WORK_URL, BRICK_WORK_TOKEN), so the token never reaches a browser.
// Reading the collection needs a read token. Filing parts in Brick Work by drawer needs write, and only ever touches
// storages Brick Stash made (marked in their note) and stock lines that are unstored or in one of those.
//
// What's stored loose in drawers is Brick Work's loose stock plus the parts of every set copy, since Brick Work doesn't
// say which sets are kept built. Brick Stash's "Sets you keep built" takes the built ones off, as it does for a
// Rebrickable export.

const PAGE = 200;
/** Stock lines moved into a storage per request */
const MOVE_BATCH = 200;
/** How a storage made by Brick Stash is marked, in its note: "Brick Stash pocket:abc123" */
export const MARK = 'Brick Stash ';
export const markOf = (note) => (typeof note === 'string' && note.startsWith(MARK) ? note.slice(MARK.length).trim() : null);
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

  async function call(path, method = 'GET', body) {
    let reply;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    // Writes carry a fresh key, so a retried request can't be applied twice
    if (method !== 'GET') Object.assign(headers, { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() });
    try {
      reply = await fetchImpl(`${url}/api/v2${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (e) {
      throw Object.assign(new Error(`Couldn't reach Brick Work at ${url}: ${e.cause?.code ?? e.message}`), { status: 502 });
    }
    if (reply.status === 401) throw Object.assign(new Error('Brick Work turned the token down. Check BRICK_WORK_TOKEN.'), { status: 502 });
    if (reply.status === 403) throw Object.assign(new Error(method === 'GET' ? 'The Brick Work token isn’t allowed to read. It needs the read scope.' : 'The Brick Work token isn’t allowed to write. Filing parts by drawer needs a token with the write scope.'), { status: 502 });
    if (reply.status === 503) throw Object.assign(new Error('Brick Work’s API is switched off. Create a token under Admin › API tokens.'), { status: 502 });
    if (!reply.ok) {
      const problem = await reply.json().catch(() => null);
      throw Object.assign(new Error(`Brick Work said ${reply.status} for ${method} ${path}${problem?.detail || problem?.title ? `: ${problem.detail ?? problem.title}` : ''}.`), { status: 502 });
    }
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

    /** Loose part lines, with where each is filed: what deciding where to file them needs */
    async stock() {
      const lines = (await all('/stock?kind=part')).filter((l) => !l.archived_at);
      return {
        lines: lines.map((l) => ({ id: l.id, partNum: partNumberOf(l.item), name: l.item?.name ?? '', colour: colourOf(l.color) ?? '', qty: l.quantity ?? 0, storageId: l.storage_id ?? null, lotId: l.lot_id ?? null })),
      };
    },

    /** Brick Work's storages; the ones Brick Stash made carry their key in `mark` */
    async storages() {
      const list = (await all('/storages')).filter((x) => x.id && x.id !== 'unstored' && !x.archived_at);
      return { storages: list.map((x) => ({ id: x.id, name: x.name ?? '', type: x.type ?? null, parentId: x.parent_id ?? null, mark: markOf(x.note) })) };
    },

    /**
     * Make Brick Work's storages match the drawers, then file stock lines in them. `storages` come parents first, each
     * with its Brick Stash key, the id it already has in Brick Work (if any), and its parent's key; `moves` list stock
     * lines by the key of the storage they go in. Only storages Brick Stash made are ever changed.
     */
    async apply({ storages = [], moves = [] }) {
      const existing = new Map((await this.storages()).storages.filter((x) => x.mark).map((x) => [x.mark, x]));
      const ids = {};
      let created = 0;
      let updated = 0;
      let moved = 0;
      const errors = [];
      for (const want of storages) {
        const parentId = want.parentKey ? ids[want.parentKey] ?? null : null;
        if (want.parentKey && !parentId) {
          errors.push(`${want.name}: its parent wasn't made, so it was skipped`);
          continue;
        }
        const body = { name: String(want.name).slice(0, 120), type: want.type ?? null, parent_id: parentId, note: `${MARK}${want.key}` };
        const have = existing.get(want.key);
        try {
          if (have) {
            if (have.name !== body.name || have.type !== body.type || (have.parentId ?? null) !== parentId) {
              await call(`/storages/${encodeURIComponent(have.id)}`, 'PATCH', body);
              updated++;
            }
            ids[want.key] = have.id;
          } else {
            const made = await call('/storages', 'POST', body);
            ids[want.key] = made?.data?.id;
            created++;
          }
        } catch (e) {
          errors.push(`${want.name}: ${e.message}`);
        }
      }
      for (const m of moves) {
        const id = ids[m.key] ?? existing.get(m.key)?.id;
        if (!id) {
          errors.push(`${m.stockIds.length} lines for ${m.key}: no storage to move them to`);
          continue;
        }
        for (let i = 0; i < m.stockIds.length; i += MOVE_BATCH) {
          const batch = m.stockIds.slice(i, i + MOVE_BATCH);
          try {
            await call(`/storages/${encodeURIComponent(id)}/contents`, 'POST', { selections: batch.map((sid) => ({ entity: 'stock', id: sid })) });
            moved += batch.length;
          } catch (e) {
            errors.push(`${batch.length} lines into ${m.key}: ${e.message}`);
          }
        }
      }
      return { ids, created, updated, moved, errors };
    },
  };
}
