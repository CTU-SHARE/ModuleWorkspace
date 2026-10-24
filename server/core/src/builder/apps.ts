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
