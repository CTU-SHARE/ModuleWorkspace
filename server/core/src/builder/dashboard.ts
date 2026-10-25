import { z } from 'zod';
import { builder, route, collection, fail, pool } from './base.js';
import { viewSchemas, viewChecks, fieldOf } from './views.js';
import { recordQuery } from './records.js';
viewSchemas.dashboard = z.object({
  blocks: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(160),
        metric: z.enum(['count', 'sum', 'avg', 'group']),
        field: z.string().optional(),
      }),
    )
    .max(12),
});
viewChecks.push((config, fields) => {
  if (!config.dashboard) return;
  const b = viewSchemas.dashboard.parse(config.dashboard);
  if (new Set(b.blocks.map((x: any) => x.id)).size !== b.blocks.length)
    fail(400, 'Block thống kê trùng ID');
  for (const block of b.blocks) {
    if (block.metric !== 'count')
      fieldOf(
        fields,
        block.field,
        block.metric === 'group' ? ['select', 'text', 'boolean', 'date'] : ['number'],
      );
  }
});
builder.get(
  '/collections/:id/dashboard',
  route(async (q, s, c) => {
    const col = await collection(c, String(q.params.id));
    const config = viewSchemas.dashboard.parse(col.config.dashboard);
    let filters: unknown = [];
    try {
      if (q.query.filters) filters = JSON.parse(String(q.query.filters));
    } catch {
      fail(400, 'Bộ lọc không hợp lệ');
    }
    const results = [];
    for (const block of config.blocks) {
      const { args, expression, where } = await recordQuery(c, col.id, {
        search: q.query.search || '',
        mode: q.query.mode || 'and',
        filters,
      });
      if (block.metric === 'count') {
        const result = (
          await pool.query(`SELECT count(*)::int value FROM records r WHERE ${where}`, args)
        ).rows[0];
        results.push({ ...block, ...result });
        continue;
      }
      const value = expression(block.field);
      if (block.metric === 'group') {
        const groups = (
          await pool.query(
            `SELECT coalesce((${value} #>> '{}'),'Chưa có giá trị') label,count(*)::int value FROM records r WHERE ${where} GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 101`,
            args,
          )
        ).rows;
        if (groups.length > 100) fail(400, 'Thống kê vượt 100 nhóm; hãy lọc dữ liệu');
        results.push({ ...block, groups });
      } else {
        const number = `CASE WHEN jsonb_typeof(${value})='number' THEN (${value} #>> '{}')::numeric END`;
        const aggregate = block.metric === 'sum' ? 'sum' : 'avg';
        const result = (
          await pool.query(
            `SELECT ${aggregate}(${number})::float8 value FROM records r WHERE ${where}`,
            args,
          )
        ).rows[0];
        results.push({ ...block, ...result });
      }
    }
    s.json(results);
  }),
);
