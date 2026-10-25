import { z } from 'zod';
import { viewSchemas, viewChecks, fieldOf } from './views.js';
import { registerPrepare } from './records-service.js';
import { collectionAsyncChecks } from './configuration.js';
import { fieldsFor } from './fields.js';
import { fail } from './base.js';
viewSchemas.calendar = z.object({ start: z.string().min(1), end: z.string().optional() });
viewChecks.push((config, fields) => {
  if (config.calendar) {
    fieldOf(fields, config.calendar.start, ['date']);
    if (config.calendar.end) fieldOf(fields, config.calendar.end, ['date']);
  }
});
registerPrepare(50, async (c, db, col, fields, data, rid) => {
  const ranges = [col.config.calendar, col.config.gantt].filter(Boolean);
  if (!ranges.length) return;
  const old = rid
    ? (
        await db.query(
          'SELECT f.key,v.value FROM record_values v JOIN fields f ON f.id=v.field_id WHERE v.tenant_id=$1 AND v.record_id=$2',
          [c.tenant, rid],
        )
      ).rows
    : [];
  const merged = { ...Object.fromEntries(old.map((x) => [x.key, x.value])), ...data };
  for (const range of ranges) {
    const start = merged[range.start],
      end = merged[range.end || range.start];
    if (start && end && start > end) fail(400, 'Ngày kết thúc phải từ ngày bắt đầu trở đi');
  }
});
collectionAsyncChecks.push(async (c, db, col, config) => {
  const fields = await fieldsFor(c, col.id, db);
  for (const range of [config.calendar, config.gantt].filter(Boolean)) {
    if (!range.end) continue;
    const start = fieldOf(fields, range.start, ['date']),
      end = fieldOf(fields, range.end, ['date']);
    const invalid = await db.query(
      `SELECT 1 FROM record_values a JOIN record_values b ON a.record_id=b.record_id AND a.tenant_id=b.tenant_id WHERE a.tenant_id=$1 AND a.collection_id=$2 AND a.field_id=$3 AND b.field_id=$4 AND a.value<>'null'::jsonb AND b.value<>'null'::jsonb AND a.value>b.value LIMIT 1`,
      [c.tenant, col.id, start.id, end.id],
    );
    if (invalid.rowCount) fail(409, 'Có hồ sơ có ngày kết thúc trước ngày bắt đầu');
  }
});
