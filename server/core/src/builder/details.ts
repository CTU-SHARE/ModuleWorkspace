import { z } from 'zod';
import { builder, route, collection, application, identifier, pool, fail } from './base.js';
import { loadRecord } from './records-service.js';
import { writer } from '../auth.js';
import { tx, audit } from '../db.js';
builder.get(
  '/records/:id/comments',
  route(async (q, s, c) => {
    const r = await loadRecord(c, identifier.parse(q.params.id));
    const col = await collection(c, r.collection_id);
    const app = await application(c, col.app_id);
    if (app.config.modules?.comments === false) fail(403, 'Module trao đổi đã tắt');
    const page = z.coerce.number().int().min(1).default(1).parse(q.query.page);
    s.json(
      (
        await pool.query(
          'SELECT id,author,body,created_at FROM comments WHERE tenant_id=$1 AND record_id=$2 ORDER BY created_at,id LIMIT 50 OFFSET $3',
          [c.tenant, r.id, (page - 1) * 50],
        )
      ).rows,
    );
  }),
);
builder.post(
  '/records/:id/comments',
  route(async (q, s, c) => {
    writer(c);
    const b = z.object({ body: z.string().trim().min(1).max(2000) }).parse(q.body);
    const r = await loadRecord(c, identifier.parse(q.params.id));
    const col = await collection(c, r.collection_id);
    const app = await application(c, col.app_id);
    if (app.config.modules?.comments === false) fail(403, 'Module trao đổi đã tắt');
    s.status(201).json(
      await tx(async (db) => {
        const x = (
          await db.query(
            'INSERT INTO comments(tenant_id,record_id,author,body) VALUES($1,$2,$3,$4) RETURNING *',
            [c.tenant, r.id, c.user, b.body],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'comment.create', x.id);
        return x;
      }),
    );
  }),
);
