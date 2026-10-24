import { z } from 'zod';
import {
  builder,
  route,
  collection,
  identifier,
  title,
  admin,
  pool,
  requireVersion,
  type DB,
  type Row,
} from './base.js';
import type { Context } from '../auth.js';
import { tx, audit } from '../db.js';
export const fieldTypes = new Set(['text', 'textarea', 'number', 'date', 'boolean', 'select']);
export const fieldConfigChecks: ((field: Row, fields: Row[]) => void)[] = [];
export const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
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
export async function fieldsFor(c: Context, cid: string, db: DB = pool): Promise<Row[]> {
  return (
    await db.query(
      `SELECT f.*, (p.role IS NOT NULL) AS can_read, coalesce(p.can_write,false) AS can_write,
 ARRAY(SELECT role FROM field_permissions WHERE field_id=f.id ORDER BY role) read_roles,
 ARRAY(SELECT role FROM field_permissions WHERE field_id=f.id AND can_write ORDER BY role) write_roles
 FROM fields f LEFT JOIN field_permissions p ON p.field_id=f.id AND p.role=$3 WHERE f.tenant_id=$1 AND f.collection_id=$2 ORDER BY position,key`,
      [c.tenant, cid, c.role],
    )
  ).rows;
}
builder.get(
  '/collections/:id/fields',
  route(async (q, s, c) => {
    await collection(c, String(q.params.id));
    s.json((await fieldsFor(c, String(q.params.id))).filter((f) => f.can_read));
  }),
);
async function save(c: Context, cid: string, body: unknown, fid?: string) {
  admin(c);
  const b = fieldSchema.parse(body);
  if (b.type === 'select' && !b.options.length) throw Error('Trường Select cần options');
  return tx(async (db) => {
    await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
      c.tenant,
      cid,
    ]);
    await collection(c, cid, db);
    const all = await fieldsFor(c, cid, db);
    const old = all.find((f) => f.id === fid);
    if (fid) {
      if (!old) throw Object.assign(new Error('Không tìm thấy trường'), { status: 404 });
      requireVersion(old!.version, b.version);
      if (old!.key !== b.key)
        throw Object.assign(new Error('Không đổi mã trường sau khi tạo'), { status: 400 });
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
      throw Object.assign(
        new Error('Bảng đã có dữ liệu: cần chuyển đổi dữ liệu trước khi thay cấu trúc này'),
        { status: 409 },
      );
    for (const check of fieldConfigChecks)
      check(
        b,
        all.filter((f) => f.id !== fid),
      );
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
