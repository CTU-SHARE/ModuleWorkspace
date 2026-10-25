import { z } from 'zod';
import {
  builder,
  route,
  application,
  admin,
  identifier,
  title,
  revision,
  requireVersion,
  pool,
  fail,
  type DB,
  type Row,
} from './base.js';
import { tx, audit } from '../db.js';
import type { Context } from '../auth.js';
export const pageConfig = z.object({
  roles: z
    .array(z.enum(['owner', 'admin', 'editor', 'viewer']))
    .default(['owner', 'admin', 'editor', 'viewer']),
  blocks: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(160),
        collection_id: identifier,
        view: z.enum([
          'records',
          'form',
          'detail',
          'kanban',
          'calendar',
          'gantt',
          'dashboard',
          'tree',
        ]),
      }),
    )
    .max(24),
});
export async function checkPage(c: Context, appId: string, config: unknown, db: DB = pool) {
  const b = pageConfig.parse(config);
  for (const block of b.blocks) {
    const found = await db.query(
      'SELECT id FROM collections WHERE tenant_id=$1 AND app_id=$2 AND id=$3',
      [c.tenant, appId, block.collection_id],
    );
    if (!found.rowCount) fail(400, 'Block tham chiếu bảng ngoài ứng dụng');
  }
  return b;
}
builder.get(
  '/apps/:id/pages',
  route(async (q, s, c) => {
    await application(c, String(q.params.id));
    const rows = (
      await pool.query(
        'SELECT * FROM app_pages WHERE tenant_id=$1 AND app_id=$2 ORDER BY created_at,id',
        [c.tenant, q.params.id],
      )
    ).rows;
    s.json(
      rows
        .filter(
          (p) =>
            ['owner', 'admin'].includes(c.role) ||
            (p.published && (p.config.roles || []).includes(c.role)),
        )
        .map((p) => (['owner', 'admin'].includes(c.role) ? p : { ...p, draft_config: undefined })),
    );
  }),
);
builder.post(
  '/apps/:id/pages',
  route(async (q, s, c) => {
    admin(c);
    await application(c, String(q.params.id));
    const b = z
      .object({ name: title, slug: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/) })
      .parse(q.body);
    s.status(201).json(
      await tx(async (db) => {
        const p = (
          await db.query(
            'INSERT INTO app_pages(tenant_id,app_id,name,slug,draft_config) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [
              c.tenant,
              q.params.id,
              b.name,
              b.slug,
              JSON.stringify({ roles: ['owner', 'admin', 'editor', 'viewer'], blocks: [] }),
            ],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'page.create', p.id);
        return p;
      }),
    );
  }),
);
builder.put(
  '/pages/:id',
  route(async (q, s, c) => {
    admin(c);
    const b = z
      .object({
        version: revision,
        name: title,
        config: pageConfig,
        publish: z.boolean().default(false),
      })
      .parse(q.body);
    s.json(
      await tx(async (db) => {
        const p = (
          await db.query('SELECT * FROM app_pages WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            c.tenant,
            identifier.parse(q.params.id),
          ])
        ).rows[0];
        if (!p) fail(404, 'Không tìm thấy trang');
        await application(c, p.app_id, db);
        requireVersion(p.version, b.version);
        await checkPage(c, p.app_id, b.config, db);
        const r = (
          await db.query(
            'UPDATE app_pages SET name=$3,draft_config=$4,config=CASE WHEN $5 THEN $4 ELSE config END,published=CASE WHEN $5 THEN true ELSE published END WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, p.id, b.name, JSON.stringify(b.config), b.publish],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, b.publish ? 'page.publish' : 'page.draft', r.id);
        return r;
      }),
    );
  }),
);
