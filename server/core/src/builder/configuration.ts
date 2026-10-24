import { z } from 'zod';
import { queryInput } from './records.js';
import {
  builder,
  route,
  collection,
  admin,
  identifier,
  revision,
  requireVersion,
  type Row,
} from './base.js';
import { tx, audit } from '../db.js';
import type { Context } from '../auth.js';
import type { DB } from './base.js';
export const collectionAsyncChecks: ((
  c: Context,
  db: DB,
  col: Row,
  config: Row,
) => Promise<void>)[] = [];
export const collectionConfigChecks: ((config: Row) => void)[] = [];
builder.put(
  '/collections/:id/config',
  route(async (q, s, c) => {
    admin(c);
    const b = z.object({ version: revision, config: z.record(z.unknown()) }).parse(q.body);
    for (const check of collectionConfigChecks) check(b.config);
    s.json(
      await tx(async (db) => {
        await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          identifier.parse(q.params.id),
        ]);
        const col = await collection(c, String(q.params.id), db);
        requireVersion(col.version, b.version);
        for (const check of collectionAsyncChecks) await check(c, db, col, b.config);
        const r = (
          await db.query(
            'UPDATE collections SET config=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, col.id, JSON.stringify(b.config)],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'collection.config', r.id);
        return r;
      }),
    );
  }),
);
collectionConfigChecks.push((c) => {
  if (c.table)
    z.object({
      columns: z.array(z.string()).max(100),
      sort: z.string().optional(),
      direction: z.enum(['asc', 'desc']).optional(),
      filters: queryInput.shape.filters.optional(),
      mode: queryInput.shape.mode.optional(),
    }).parse(c.table);
});

collectionAsyncChecks.push(async (c, db, col, config) => {
  const keys = new Set(
    (
      await db.query('SELECT key FROM fields WHERE tenant_id=$1 AND collection_id=$2', [
        c.tenant,
        col.id,
      ])
    ).rows.map((f) => f.key),
  );
  for (const key of [
    ...(config.table?.columns || []),
    ...(config.table?.filters || [])
      .map((f: Row) => f.field)
      .filter(
        (key: string) =>
          !['title', 'status', 'created_at', 'updated_at', 'created_by'].includes(key),
      ),
    ...(config.form?.sections || []).flatMap((section: Row) => section.keys),
  ])
    if (!keys.has(key))
      throw new z.ZodError([
        { code: 'custom', path: ['config'], message: 'Không tìm thấy trường ' + key },
      ]);
});
