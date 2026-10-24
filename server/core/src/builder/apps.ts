import { z } from 'zod';
import { builder, route, title, admin } from './base.js';
import { tx, audit } from '../db.js';
export const appInput = z.object({
  name: title,
  description: z.string().max(2000).default(''),
  icon: z
    .enum(['Layers3', 'School', 'Briefcase', 'Users', 'Folder', 'Calendar'])
    .default('Layers3'),
});
builder.post(
  '/apps',
  route(async (q, s, c) => {
    admin(c);
    const b = appInput.parse(q.body);
    const a = await tx(async (db) => {
      const r = (
        await db.query(
          'INSERT INTO apps(tenant_id,name,description,icon) VALUES($1,$2,$3,$4) RETURNING *',
          [c.tenant, b.name, b.description, b.icon],
        )
      ).rows[0];
      await audit(db, c.tenant, c.user, 'app.create', r.id);
      return r;
    });
    s.status(201).json(a);
  }),
);
import { pool, application } from './base.js';
builder.get(
  '/apps',
  route(async (q, s, c) => {
    const page = z.coerce.number().int().min(1).default(1).parse(q.query.page);
    const search = z.string().max(160).default('').parse(q.query.search);
    const args = [c.tenant, '%' + search + '%', c.role];
    const where =
      "tenant_id=$1 AND name ILIKE $2 AND ($3 IN ('owner','admin') OR NOT config ? 'roles' OR config->'roles' ? $3)";
    const data = await pool.query(
      `SELECT * FROM apps WHERE ${where} ORDER BY created_at,id LIMIT 30 OFFSET $4`,
      [...args, (page - 1) * 30],
    );
    const total = await pool.query(`SELECT count(*)::int n FROM apps WHERE ${where}`, args);
    s.json({ items: data.rows, total: total.rows[0].n, page });
  }),
);
builder.get(
  '/apps/:id',
  route(async (q, s, c) => s.json(await application(c, String(q.params.id)))),
);
