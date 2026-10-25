import { builder, route, pool, identifier, application } from './base.js';
import { loadRecord } from './records-service.js';
import { z } from 'zod';
import { fieldTypes, fieldConfigChecks, fieldAsyncChecks } from './fields.js';
import { fieldSchemas, registerPrepare, afterSaveHooks } from './records-service.js';
import { collection, fail } from './base.js';
fieldTypes.add('relation');
fieldSchemas.relation = z.array(z.string().uuid()).max(100);
export const relationSchema = z.object({
  target: z.string().uuid(),
  kind: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
});
fieldConfigChecks.push((f) => {
  if (f.type === 'relation') {
    relationSchema.parse(f.config.relation);
    if (Object.hasOwn(f.config, 'default')) fail(400, 'Trường quan hệ không dùng default');
  }
});
fieldAsyncChecks.push(async (c, db, col, f, old) => {
  if (f.type !== 'relation') return;
  const relation = relationSchema.parse(f.config.relation);
  const target = await collection(c, relation.target, db);
  if (target.app_id !== col.app_id) fail(400, 'Quan hệ cần nằm trong cùng ứng dụng');
  if (
    old &&
    JSON.stringify(old.config.relation) !== JSON.stringify(relation) &&
    (await db.query('SELECT 1 FROM record_values WHERE field_id=$1 LIMIT 1', [old.id])).rowCount
  )
    fail(409, 'Không đổi quan hệ khi đã có dữ liệu');
});
registerPrepare(40, async (c, db, _col, fields, data) => {
  for (const f of fields) {
    if (f.type !== 'relation' || !Object.hasOwn(data, f.key)) continue;
    const rel = relationSchema.parse(f.config.relation);
    const ids = fieldSchemas.relation.parse(data[f.key] ?? []) as string[];
    if (new Set(ids).size !== ids.length) fail(400, 'Quan hệ có ID trùng');
    if (rel.kind === 'one-to-one' && ids.length > 1) fail(400, 'Quan hệ 1-1 chỉ chọn một hồ sơ');
    if (f.required && !ids.length) fail(400, f.label + ': bắt buộc');
    await collection(c, rel.target, db);
    const found = await db.query(
      'SELECT id FROM records WHERE tenant_id=$1 AND collection_id=$2 AND id=ANY($3::uuid[])',
      [c.tenant, rel.target, ids],
    );
    if (found.rowCount !== ids.length) fail(400, 'Quan hệ tham chiếu hồ sơ không hợp lệ');
    data[f.key] = ids;
  }
});
afterSaveHooks.push(async (c, db, _col, fields, data, record) => {
  for (const f of fields) {
    if (f.type !== 'relation' || !Object.hasOwn(data, f.key)) continue;
    const rel = relationSchema.parse(f.config.relation);
    await db.query('DELETE FROM record_links WHERE tenant_id=$1 AND field_id=$2 AND source_id=$3', [
      c.tenant,
      f.id,
      record.id,
    ]);
    for (const target of data[f.key])
      await db.query('INSERT INTO record_links VALUES($1,$2,$3,$4,$5)', [
        c.tenant,
        f.id,
        record.id,
        target,
        rel.kind !== 'many-to-many',
      ]);
  }
});

// The inverse is derived from the same link rows, never a second mutable copy.
builder.get(
  '/records/:id/related',
  route(async (q, s, c) => {
    const record = await loadRecord(c, identifier.parse(q.params.id));
    const page = z.coerce.number().int().min(1).default(1).parse(q.query.page);
    const rows = (
      await pool.query(
        `SELECT r.id,r.title,r.collection_id,f.label AS field_label,CASE WHEN l.source_id=$2 THEN 'outgoing' ELSE 'incoming' END direction,co.name AS collection_name FROM record_links l JOIN fields f ON f.id=l.field_id JOIN field_permissions p ON p.field_id=f.id AND p.role=$3 JOIN records r ON r.id=CASE WHEN l.source_id=$2 THEN l.target_id ELSE l.source_id END JOIN collections co ON co.id=r.collection_id WHERE l.tenant_id=$1 AND (l.source_id=$2 OR l.target_id=$2) AND f.archived_at IS NULL AND co.archived_at IS NULL ORDER BY r.title,r.id,f.id LIMIT 31 OFFSET $4`,
        [c.tenant, record.id, c.role, (page - 1) * 30],
      )
    ).rows;
    const allowed = [];
    for (const row of rows) {
      const col = await collection(c, row.collection_id);
      await application(c, col.app_id);
      allowed.push({ ...row, collection: col });
    }
    s.json({ items: allowed.slice(0, 30), hasMore: rows.length > 30, page });
  }),
);
