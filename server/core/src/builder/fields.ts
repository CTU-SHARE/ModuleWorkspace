import { z } from 'zod';
import { validateValue } from './records-service.js';
import {
  builder,
  route,
  collection,
  identifier,
  title,
  revision,
  admin,
  pool,
  requireVersion,
  fail,
  type DB,
  type Row,
} from './base.js';
import type { Context } from '../auth.js';
import { tx, audit } from '../db.js';
export const fieldTypes = new Set([
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'json',
  'file',
]);
export const fieldConfigChecks: ((field: Row, fields: Row[]) => void)[] = [];
export const fieldAsyncChecks: ((
  c: Context,
  db: DB,
  col: Row,
  field: Row,
  old?: Row,
) => Promise<void>)[] = [];
export const fieldSavedHooks: ((c: Context, db: DB, col: Row) => Promise<void>)[] = [];
export const fieldSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,49}$/)
    .refine(
      (k) =>
        ![
          'id',
          'title',
          'status',
          'created_at',
          'updated_at',
          'created_by',
          'version',
          'parent_id',
        ].includes(k),
      'Mã trường trùng thuộc tính hệ thống',
    ),
  label: title,
  type: z.string().refine((x) => fieldTypes.has(x)),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(100)).max(100).default([]),
  position: z.number().int().min(0).default(0),
  config: z.record(z.unknown()).default({}),
  read_roles: z
    .array(z.enum(['owner', 'admin', 'editor', 'viewer']))
    .default(['owner', 'admin', 'editor', 'viewer']),
  write_roles: z.array(z.enum(['owner', 'admin', 'editor'])).default(['owner', 'admin', 'editor']),
  version: z.number().int().positive().optional(),
});
export async function fieldsFor(
  c: Context,
  cid: string,
  db: DB = pool,
  includeArchived = false,
): Promise<Row[]> {
  return (
    await db.query(
      `SELECT f.*, (p.role IS NOT NULL) AS can_read, coalesce(p.can_write,false) AS can_write,
 ARRAY(SELECT role FROM field_permissions WHERE field_id=f.id ORDER BY role) read_roles,
 ARRAY(SELECT role FROM field_permissions WHERE field_id=f.id AND can_write ORDER BY role) write_roles
 FROM fields f LEFT JOIN field_permissions p ON p.field_id=f.id AND p.role=$3 WHERE f.tenant_id=$1 AND f.collection_id=$2 AND (f.archived_at IS NULL OR $4) ORDER BY position,key`,
      [c.tenant, cid, c.role, includeArchived],
    )
  ).rows;
}
builder.get(
  '/collections/:id/fields',
  route(async (q, s, c) => {
    await collection(c, String(q.params.id));
    s.json(
      (
        await fieldsFor(
          c,
          String(q.params.id),
          pool,
          q.query.archived === 'true' && ['owner', 'admin'].includes(c.role),
        )
      ).filter((f) => f.can_read),
    );
  }),
);
async function save(c: Context, cid: string, body: unknown, fid?: string) {
  admin(c);
  const b = fieldSchema.parse(body);
  if (b.type === 'select' && !b.options.length) fail(400, 'Trường Select cần options');
  return tx(async (db) => {
    await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
      c.tenant,
      cid,
    ]);
    await collection(c, cid, db);
    const all = await fieldsFor(c, cid, db);
    if (!fid && all.length >= 100) fail(400, 'Tối đa 100 trường mỗi bảng');
    const old = all.find((f) => f.id === fid);
    if (fid) {
      if (!old) fail(404, 'Không tìm thấy trường');
      requireVersion(old!.version, b.version);
      if (old!.key !== b.key) fail(400, 'Không đổi mã trường sau khi tạo');
    }
    const hasRecords = (
      await db.query('SELECT 1 FROM records WHERE tenant_id=$1 AND collection_id=$2 LIMIT 1', [
        c.tenant,
        cid,
      ])
    ).rowCount;
    if (
      hasRecords &&
      ((!old && b.required) ||
        (old &&
          (old.type !== b.type ||
            (!old.required && b.required) ||
            JSON.stringify(old.options) !== JSON.stringify(b.options))))
    )
      fail(409, 'Bảng đã có dữ liệu: cần chuyển đổi dữ liệu trước khi thay cấu trúc này');
    for (const check of fieldConfigChecks)
      check(
        b,
        all.filter((f) => f.id !== fid),
      );
    for (const check of fieldAsyncChecks) await check(c, db, await collection(c, cid, db), b, old);
    if (old) {
      const existing = await db.query(
        'SELECT value FROM record_values WHERE tenant_id=$1 AND field_id=$2',
        [c.tenant, fid],
      );
      for (const row of existing.rows) validateValue(b, row.value);
      if (b.config.validation && (b.config.validation as any).unique) {
        const dup = await db.query(
          "SELECT 1 FROM record_values WHERE tenant_id=$1 AND field_id=$2 AND value<>'null'::jsonb AND value<>'\"\"'::jsonb GROUP BY value HAVING count(*)>1 LIMIT 1",
          [c.tenant, fid],
        );
        if (dup.rowCount) fail(409, 'Dữ liệu hiện tại có giá trị trùng');
      }
    }
    const row = fid
      ? (
          await db.query(
            'UPDATE fields SET label=$3,type=$4,required=$5,options=$6,position=$7,config=$8 WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [
              c.tenant,
              fid,
              b.label,
              b.type,
              b.required,
              JSON.stringify(b.options),
              b.position,
              JSON.stringify(b.config),
            ],
          )
        ).rows[0]
      : (
          await db.query(
            'INSERT INTO fields(tenant_id,collection_id,key,label,type,required,options,position,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [
              c.tenant,
              cid,
              b.key,
              b.label,
              b.type,
              b.required,
              JSON.stringify(b.options),
              b.position,
              JSON.stringify(b.config),
            ],
          )
        ).rows[0];
    await db.query('DELETE FROM field_permissions WHERE tenant_id=$1 AND field_id=$2', [
      c.tenant,
      row.id,
    ]);
    for (const role of new Set(['owner', 'admin', ...b.read_roles]))
      await db.query('INSERT INTO field_permissions VALUES($1,$2,$3,$4)', [
        c.tenant,
        row.id,
        role,
        ['owner', 'admin'].includes(role) ||
          (role !== 'viewer' && b.write_roles.includes(role as any)),
      ]);
    await db.query('UPDATE collections SET updated_at=now() WHERE tenant_id=$1 AND id=$2', [
      c.tenant,
      cid,
    ]);
    for (const hook of fieldSavedHooks) await hook(c, db, await collection(c, cid, db));
    await audit(db, c.tenant, c.user, fid ? 'field.update' : 'field.create', row.id);
    return row;
  });
}
builder.post(
  '/collections/:id/fields',
  route(async (q, s, c) =>
    s.status(201).json(await save(c, identifier.parse(q.params.id), q.body)),
  ),
);
builder.put(
  '/collections/:id/fields/:fid',
  route(async (q, s, c) =>
    s.json(await save(c, identifier.parse(q.params.id), q.body, identifier.parse(q.params.fid))),
  ),
);

fieldConfigChecks.push((f) => {
  if (f.type === 'select' && (!f.options.length || new Set(f.options).size !== f.options.length))
    fail(400, 'Select cần danh sách lựa chọn không trùng');
});

builder.post(
  '/collections/:id/fields/:fid/archive',
  route(async (q, s, c) => {
    admin(c);
    const b = z.object({ version: revision, archived: z.boolean() }).parse(q.body);
    const cid = identifier.parse(q.params.id),
      fid = identifier.parse(q.params.fid);
    s.json(
      await tx(async (db) => {
        await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          cid,
        ]);
        const col = await collection(c, cid, db);
        const all = await fieldsFor(c, cid, db, true),
          field = all.find((f) => f.id === fid);
        if (!field) fail(404, 'Không tìm thấy trường');
        requireVersion(field.version, b.version);
        if (b.archived) {
          if (field.required) fail(409, 'Tắt Bắt buộc trước khi lưu trữ trường');
          const referenced = (value: any): boolean =>
            value === field.key ||
            (!!value && typeof value === 'object' && Object.values(value).some(referenced));
          if (
            referenced(col.config) ||
            all.some((f) => f.id !== fid && !f.archived_at && referenced(f.config))
          )
            fail(409, 'Trường đang dùng trong cấu hình hoặc quy tắc; bỏ tham chiếu trước');
        } else {
          for (const check of fieldConfigChecks)
            check(
              field,
              all.filter((f) => f.id !== fid && !f.archived_at),
            );
          for (const check of fieldAsyncChecks) await check(c, db, col, field, field);
        }
        const result = (
          await db.query(
            'UPDATE fields SET archived_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, fid, b.archived],
          )
        ).rows[0];
        await db.query('UPDATE collections SET updated_at=now() WHERE tenant_id=$1 AND id=$2', [
          c.tenant,
          cid,
        ]);
        for (const hook of fieldSavedHooks) await hook(c, db, col);
        await audit(db, c.tenant, c.user, b.archived ? 'field.archive' : 'field.restore', fid);
        return result;
      }),
    );
  }),
);
