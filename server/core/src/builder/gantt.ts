import { z } from 'zod';
import { viewSchemas, viewChecks, fieldOf } from './views.js';
import { registerPrepare, afterSaveHooks } from './records-service.js';
import { collectionAsyncChecks } from './configuration.js';
import { fieldsFor } from './fields.js';
import { fail, type Row, type DB } from './base.js';
import type { Context } from '../auth.js';
viewSchemas.gantt = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  progress: z.string().optional(),
  dependencies: z.string().optional(),
});
viewChecks.push((config, fields, col) => {
  if (!config.gantt) return;
  const g = config.gantt;
  fieldOf(fields, g.start, ['date']);
  fieldOf(fields, g.end, ['date']);
  if (g.progress) {
    const f = fieldOf(fields, g.progress, ['number']);
    if (f.config.validation?.min !== 0 || f.config.validation?.max !== 100)
      fail(400, 'Trường tiến độ cần validation min=0, max=100');
  }
  if (g.dependencies) {
    const f = fieldOf(fields, g.dependencies, ['relation']);
    if (f.config.relation.target !== col.id || f.config.relation.kind !== 'many-to-many')
      fail(400, 'Phụ thuộc Gantt cần quan hệ N-N đến cùng bảng');
  }
});
registerPrepare(50, async (_c, _db, col, _fields, data) => {
  const key = col.config.gantt?.progress;
  if (
    key &&
    data[key] != null &&
    (typeof data[key] !== 'number' || data[key] < 0 || data[key] > 100)
  )
    fail(400, 'Tiến độ cần từ 0 đến 100');
});
async function graph(c: Context, db: DB, col: Row, config: Row) {
  const g = config.gantt;
  if (!g?.dependencies) return;
  const fields = await fieldsFor(c, col.id, db),
    dependency = fieldOf(fields, g.dependencies, ['relation']);
  const records = (
    await db.query('SELECT id FROM records WHERE tenant_id=$1 AND collection_id=$2 LIMIT 5001', [
      c.tenant,
      col.id,
    ])
  ).rows;
  if (records.length > 5000) fail(400, 'Gantt có phụ thuộc hỗ trợ tối đa 5000 hồ sơ mỗi bảng');
  const rows = (
    await db.query(
      'SELECT v.record_id,v.value FROM record_values v WHERE v.tenant_id=$1 AND v.collection_id=$2 AND v.field_id=$3',
      [c.tenant, col.id, dependency.id],
    )
  ).rows;
  const edges = new Map<string, string[]>(rows.map((r) => [r.record_id, r.value || []]));
  const ids = new Set(records.map((r) => r.id)),
    seen = new Set<string>(),
    done = new Set<string>();
  function visit(id: string, depth = 0) {
    if (depth > 200) fail(400, 'Chuỗi phụ thuộc vượt 200 bước');
    if (seen.has(id)) fail(400, 'Phụ thuộc Gantt tạo thành chu trình');
    if (done.has(id)) return;
    seen.add(id);
    for (const parent of edges.get(id) || []) {
      if (!ids.has(parent)) fail(400, 'Phụ thuộc phải thuộc cùng bảng');
      visit(parent, depth + 1);
    }
    seen.delete(id);
    done.add(id);
  }
  for (const r of records) visit(r.id);
}
afterSaveHooks.push(async (c, db, col) => graph(c, db, col, col.config));
collectionAsyncChecks.push(graph);
