import { z } from 'zod';
import { builder, route, collection, fail, type Row, type DB } from './base.js';
import { fieldsFor, fieldSavedHooks } from './fields.js';
import { collectionConfigChecks, collectionAsyncChecks } from './configuration.js';
import { allRecords } from './data-transfer.js';
import type { Context } from '../auth.js';
export const viewSchemas: Record<string, z.ZodTypeAny> = {
  kanban: z.object({ field: z.string().min(1) }),
};
export const viewChecks: ((config: Row, fields: Row[], col: Row) => void)[] = [];
export function fieldOf(fields: Row[], key: string, types: string[]) {
  const field = fields.find((f) => f.key === key);
  if (!field || !types.includes(field.type)) fail(400, 'Trường view không hợp lệ: ' + key);
  return field;
}
collectionConfigChecks.push((config) => {
  for (const [key, schema] of Object.entries(viewSchemas))
    if (config[key]) schema.parse(config[key]);
});
export async function checkViews(c: Context, db: DB, col: Row, config: Row) {
  const fields = await fieldsFor(c, col.id, db);
  for (const check of viewChecks) check(config, fields, col);
}
collectionAsyncChecks.push(checkViews);
fieldSavedHooks.push((c, db, col) => checkViews(c, db, col, col.config));
viewChecks.push((config, fields) => {
  if (config.kanban) {
    const f = fieldOf(fields, config.kanban.field, ['select']);
    if (f.config.formula || f.config.linkage)
      fail(400, 'Kanban cần trường Select không tự tính hoặc liên kết');
  }
});
builder.get(
  '/collections/:id/views/:view',
  route(async (q, s, c) => {
    const col = await collection(c, String(q.params.id));
    const view = String(q.params.view);
    if (!viewSchemas[view]) fail(404, 'View không tồn tại');
    const config = col.config[view];
    if (!config) fail(400, 'Chưa cấu hình view');
    const fields = (await fieldsFor(c, col.id)).filter((f) => f.can_read);
    const keys = [
      config.field,
      config.start,
      config.end,
      config.progress,
      config.dependencies,
    ].filter(Boolean);
    if (keys.some((k) => !fields.some((f) => f.key === k)))
      fail(403, 'Không có quyền đọc trường được dùng trong view');
    const search = z.string().max(200).default('').parse(q.query.search);
    const filters: Row[] = [];
    if (view === 'calendar' && q.query.from && q.query.to) {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const from = date.parse(q.query.from),
        to = date.parse(q.query.to);
      if (from > to) fail(400, 'Khoảng ngày không hợp lệ');
      filters.push(
        { field: config.start, op: 'lte', value: to },
        { field: config.end || config.start, fallback: config.start, op: 'gte', value: from },
      );
    }
    s.json({
      fields,
      items: await allRecords(
        c,
        col.id,
        { search, filters, sort: config.start || 'created_at', direction: 'asc' },
        1000,
      ),
    });
  }),
);
