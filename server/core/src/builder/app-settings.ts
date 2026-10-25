import { z } from 'zod';
import {
  builder,
  route,
  application,
  admin,
  identifier,
  title,
  revision,
  roleList,
  requireVersion,
  type Row,
} from './base.js';
import { tx, audit } from '../db.js';
export const appConfigChecks: ((config: Row) => void)[] = [];
appConfigChecks.push((c) => {
  if (c.roles) roleList.parse(c.roles);
});
builder.put(
  '/apps/:id/settings',
  route(async (q, s, c) => {
    admin(c);
    const b = z
      .object({
        name: title,
        description: z.string().max(2000),
        icon: z.string().max(32),
        version: revision,
        config: z.record(z.unknown()),
      })
      .parse(q.body);
    for (const check of appConfigChecks) check(b.config);
    s.json(
      await tx(async (db) => {
        await db.query('SELECT id FROM apps WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          identifier.parse(q.params.id),
        ]);
        const a = await application(c, String(q.params.id), db);
        requireVersion(a.version, b.version);
        for (const item of (b.config.menu || []) as Row[]) {
          if (item.page_id) {
            const page = await db.query(
              'SELECT id FROM app_pages WHERE tenant_id=$1 AND app_id=$2 AND id=$3',
              [c.tenant, a.id, item.page_id],
            );
            if (!page.rowCount)
              throw new z.ZodError([
                {
                  code: 'custom',
                  path: ['config', 'menu'],
                  message: 'Trang menu không thuộc ứng dụng',
                },
              ]);
          }
        }
        const r = (
          await db.query(
            'UPDATE apps SET name=$3,description=$4,icon=$5,config=$6 WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, a.id, b.name, b.description, b.icon, JSON.stringify(b.config)],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'app.configure', r.id);
        return r;
      }),
    );
  }),
);
