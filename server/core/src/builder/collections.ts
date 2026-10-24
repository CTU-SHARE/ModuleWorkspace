import { z } from 'zod';
import {
  builder,
  route,
  application,
  collection,
  identifier,
  title,
  revision,
  requireVersion,
  admin,
  pool,
  fail,
} from './base.js';
import { tx, audit } from '../db.js';
builder.get(
  '/apps/:id/collections',
  route(async (q, s, c) => {
    await application(c, String(q.params.id));
    const archived = q.query.archived === 'true' && ['owner', 'admin'].includes(c.role);
    s.json(
      (
        await pool.query(
          'SELECT * FROM collections WHERE tenant_id=$1 AND app_id=$2 AND (archived_at IS NULL OR $3) ORDER BY created_at,id',
          [c.tenant, q.params.id, archived],
        )
      ).rows,
    );
  }),
);
builder.post(
  '/apps/:id/collections',
  route(async (q, s, c) => {
    admin(c);
    const b = z
      .object({ name: title, description: z.string().max(2000).default('') })
      .parse(q.body);
    s.status(201).json(
      await tx(async (db) => {
        await application(c, String(q.params.id), db);
        const col = (
          await db.query(
            'INSERT INTO collections(tenant_id,app_id,name,description) VALUES($1,$2,$3,$4) RETURNING *',
            [c.tenant, q.params.id, b.name, b.description],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'collection.create', col.id);
        return col;
      }),
    );
  }),
);
builder.patch(
  '/collections/:id',
  route(async (q, s, c) => {
    admin(c);
    const b = z
      .object({
        name: title,
        description: z.string().max(2000),
        version: revision,
        workflow_enabled: z.boolean(),
        reviewer_role: z.enum(['admin', 'editor']),
      })
      .parse(q.body);
    s.json(
      await tx(async (db) => {
        await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          identifier.parse(q.params.id),
        ]);
        const col = await collection(c, String(q.params.id), db);
        requireVersion(col.version, b.version);
        const row = (
          await db.query(
            'UPDATE collections SET name=$3,description=$4,workflow_enabled=$5,reviewer_role=$6 WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, col.id, b.name, b.description, b.workflow_enabled, b.reviewer_role],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'collection.update', col.id);
        return row;
      }),
    );
  }),
);

builder.post(
  '/collections/:id/archive',
  route(async (q, s, c) => {
    admin(c);
    const b = z.object({ version: revision, archived: z.boolean() }).parse(q.body);
    s.json(
      await tx(async (db) => {
        await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          identifier.parse(q.params.id),
        ]);
        const col = await collection(c, String(q.params.id), db, true);
        requireVersion(col.version, b.version);
        if (b.archived) {
          const relation = await db.query(
            "SELECT 1 FROM fields WHERE tenant_id=$1 AND archived_at IS NULL AND type='relation' AND config->'relation'->>'target'=$2 LIMIT 1",
            [c.tenant, col.id],
          );
          if (relation.rowCount)
            fail(409, 'Bảng đang là đích quan hệ; lưu trữ trường quan hệ trước');
          const pages = (
            await db.query(
              'SELECT config,draft_config FROM app_pages WHERE tenant_id=$1 AND app_id=$2',
              [c.tenant, col.app_id],
            )
          ).rows;
          if (
            pages.some((p) =>
              [p.config, p.draft_config].some((x) =>
                x.blocks?.some((b: any) => b.collection_id === col.id),
              ),
            )
          )
            fail(409, 'Bảng đang dùng trên trang; bỏ block và xuất bản trang trước');
        }
        const result = (
          await db.query(
            'UPDATE collections SET archived_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, col.id, b.archived],
          )
        ).rows[0];
        await audit(
          db,
          c.tenant,
          c.user,
          b.archived ? 'collection.archive' : 'collection.restore',
          col.id,
        );
        return result;
      }),
    );
  }),
);
