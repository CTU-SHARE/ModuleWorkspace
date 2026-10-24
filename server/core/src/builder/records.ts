import { z } from 'zod';
import { builder, route, collection, identifier, pool, fail, type Row } from './base.js';
import type { Context } from '../auth.js';
import { fieldsFor } from './fields.js';
import { loadRecord, saveRecord, recordInput } from './records-service.js';
export const queryInput = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().max(200).default(''),
  sort: z.string().max(60).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  mode: z.enum(['and', 'or']).default('and'),
  filters: z
    .array(
      z.object({
        field: z.string(),
        op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'isNull']),
        value: z.unknown().optional(),
        fallback: z.string().max(50).optional(),
      }),
    )
    .max(20)
    .default([]),
});
export async function recordQuery(c: Context, cid: string, input: unknown) {
  await collection(c, cid);
  const b = queryInput.parse(input);
  const fields = (await fieldsFor(c, cid)).filter((f) => f.can_read);
  const args: any[] = [c.tenant, cid];
  const bind = (v: any) => {
    args.push(v);
    return '$' + args.length;
  };
  const expression = (key: string) => {
    if (['title', 'status', 'created_at', 'updated_at', 'created_by'].includes(key))
      return `to_jsonb(r.${key})`;
    const f = fields.find((f) => f.key === key);
    if (!f) fail(400, 'Không được lọc/sắp xếp trường ' + key);
    return `(SELECT v.value FROM record_values v WHERE v.record_id=r.id AND v.field_id=${bind(f.id)} AND v.tenant_id=r.tenant_id)`;
  };
  const conditions = ['r.tenant_id=$1', 'r.collection_id=$2'];
  if (b.search) conditions.push(`r.title ILIKE ${bind('%' + b.search + '%')}`);
  const predicates = b.filters.map((f) => {
    const primary = expression(f.field);
    const e = f.fallback
      ? `coalesce(nullif(${primary},'null'::jsonb),${expression(f.fallback)})`
      : primary;
    if (f.op === 'isNull') return `(${e} IS NULL OR ${e}='null'::jsonb)`;
    if (f.value === undefined) fail(400, 'Điều kiện cần giá trị');
    if (f.op === 'contains') return `(${e} #>> '{}') ILIKE ${bind('%' + String(f.value) + '%')}`;
    const op = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op];
    return `${e} ${op} ${bind(JSON.stringify(f.value))}::jsonb`;
  });
  if (predicates.length)
    conditions.push('(' + predicates.join(b.mode === 'and' ? ' AND ' : ' OR ') + ')');
  return { b, fields, args, bind, expression, where: conditions.join(' AND ') };
}
export async function queryRecords(c: Context, cid: string, input: unknown) {
  const { b, args, bind, expression, where } = await recordQuery(c, cid, input);
  const total = (await pool.query(`SELECT count(*)::int n FROM records r WHERE ${where}`, args))
    .rows[0].n;
  const sort = expression(b.sort);
  const rows = (
    await pool.query(
      `SELECT r.id FROM records r WHERE ${where} ORDER BY ${sort} ${b.direction} NULLS LAST,r.id LIMIT ${bind(b.pageSize)} OFFSET ${bind((b.page - 1) * b.pageSize)}`,
      args,
    )
  ).rows;
  return {
    items: await Promise.all(rows.map((r) => loadRecord(c, r.id))),
    total,
    page: b.page,
    pageSize: b.pageSize,
  };
}
builder.post(
  '/collections/:id/query',
  route(async (q, s, c) => s.json(await queryRecords(c, identifier.parse(q.params.id), q.body))),
);
builder.get(
  '/collections/:id/records',
  route(async (q, s, c) =>
    s.json(
      await queryRecords(c, identifier.parse(q.params.id), {
        ...q.query,
        filters: q.query.filters ? JSON.parse(String(q.query.filters)) : [],
      }),
    ),
  ),
);
builder.get(
  '/records/:id',
  route(async (q, s, c) => s.json(await loadRecord(c, identifier.parse(q.params.id)))),
);
builder.post(
  '/collections/:id/records',
  route(async (q, s, c) =>
    s
      .status(201)
      .json(await saveRecord(c, identifier.parse(q.params.id), recordInput.parse(q.body))),
  ),
);
builder.patch(
  '/records/:id',
  route(async (q, s, c) => {
    const old = await loadRecord(c, identifier.parse(q.params.id));
    s.json(await saveRecord(c, old.collection_id, recordInput.parse(q.body), old.id));
  }),
);
