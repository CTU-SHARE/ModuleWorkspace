import { z } from 'zod';
import type pg from 'pg';
import { pool, tx, audit, event } from '../db.js';
import { writer, fail, type Context } from '../auth.js';
import { collection as authorizedCollection, type Row, type DB } from './base.js';
const label = z.string().trim().min(1).max(160);
export const valueChecks: ((f: Row, v: any) => void)[] = [];
type PrepareHook = (
  c: Context,
  db: DB,
  col: Row,
  fields: Row[],
  data: Row,
  rid?: string,
) => Promise<void>;
const prepareHooks: { priority: number; run: PrepareHook }[] = [];
export function registerPrepare(priority: number, run: PrepareHook) {
  prepareHooks.push({ priority, run });
  prepareHooks.sort((a, b) => a.priority - b.priority);
}
export const afterSaveHooks: ((
  c: Context,
  db: DB,
  col: Row,
  fields: Row[],
  data: Row,
  record: Row,
) => Promise<void>)[] = [];
export const fieldSchemas: Record<string, z.ZodTypeAny> = {};
export async function loadRecord(c: Context, rid: string) {
  const r = (
    await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2', [c.tenant, rid])
  ).rows[0];
  if (!r) fail(404, 'Không tìm thấy hồ sơ');
  await authorizedCollection(c, r.collection_id);
  const values = (
    await pool.query(
      'SELECT f.key,v.value FROM record_values v JOIN fields f ON f.id=v.field_id JOIN field_permissions p ON p.field_id=f.id AND p.role=$3 WHERE v.tenant_id=$1 AND v.record_id=$2 AND f.archived_at IS NULL',
      [c.tenant, rid, c.role],
    )
  ).rows;
  return { ...r, data: Object.fromEntries(values.map((v) => [v.key, v.value])) };
}
export function validateValue(f: any, value: unknown): any {
  try {
    return validateRaw(f, value);
  } catch (e) {
    if (e instanceof Error) Object.assign(e, { fieldErrors: { [f.key]: [e.message] } });
    throw e;
  }
}
function validateRaw(f: any, value: unknown) {
  if (value === null || value === '') {
    if (f.required) fail(400, `${f.label}: bắt buộc`);
    return null;
  }
  const schemas: Record<string, z.ZodTypeAny> = {
    text: z.string().max(500),
    textarea: z.string().max(10000),
    number: z.number().finite(),
    boolean: z.boolean(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
    select: z.string().refine((v) => f.options.includes(v)),
    json: z.unknown(),
    file: z.string().uuid(),
    ...fieldSchemas,
  };
  if (!schemas[f.type]) fail(400, 'Kiểu trường không được hỗ trợ');
  const r = schemas[f.type].safeParse(value);
  if (!r.success) fail(400, `${f.label}: giá trị không hợp lệ`);
  for (const check of valueChecks) check(f, r.data);
  return r.data;
}
export const recordInput = z.object({
  title: label,
  data: z.record(z.unknown()).default({}),
  version: z.number().int().positive().optional(),
});
export async function saveRecord(
  c: Context,
  collection: string,
  b: z.infer<typeof recordInput>,
  rid?: string,
  connection?: pg.PoolClient,
) {
  writer(c);
  const work = async (db: pg.PoolClient) => {
    const col = (
      await db.query('SELECT * FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        c.tenant,
        collection,
      ])
    ).rows[0];
    if (!col) fail(404, 'Không tìm thấy bảng');
    await authorizedCollection(c, collection, db);
    if (rid) {
      const old = (
        await db.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          rid,
        ])
      ).rows[0];
      if (!old || old.collection_id !== collection) fail(404, 'Không tìm thấy hồ sơ');
      if (!['draft', 'rejected'].includes(old.status))
        fail(409, 'Chỉ sửa hồ sơ nháp hoặc bị từ chối');
      if (c.role === 'editor' && old.created_by !== c.user) fail(403, 'Chỉ sửa hồ sơ của mình');
      if (b.version !== old.version) fail(409, 'Hồ sơ đã thay đổi; hãy tải lại');
    }
    const fields = (
      await db.query(
        'SELECT f.*,p.can_write FROM fields f LEFT JOIN field_permissions p ON p.field_id=f.id AND p.role=$3 WHERE f.tenant_id=$1 AND collection_id=$2 AND f.archived_at IS NULL',
        [c.tenant, collection, c.role],
      )
    ).rows;
    for (const key of Object.keys(b.data)) {
      const f = fields.find((f) => f.key === key);
      if (!f || !f.can_write) fail(403, 'Không được ghi trường ' + key);
      if (f.config?.formula) fail(400, 'Không được gửi giá trị trường tính toán');
    }
    b = { ...b, data: { ...b.data } };
    for (const hook of prepareHooks) await hook.run(c, db, col, fields, b.data, rid);
    const values = [];
    for (const f of fields) {
      if (Object.hasOwn(b.data, f.key)) values.push([f.id, validateValue(f, b.data[f.key])]);
      else if (!rid && f.required)
        fail(400, `${f.label}: bắt buộc (hãy cấp quyền ghi cho người tạo)`);
    }
    const r = rid
      ? (
          await db.query(
            "UPDATE records SET title=$3,status='draft',version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
            [c.tenant, rid, b.title],
          )
        ).rows[0]
      : (
          await db.query(
            'INSERT INTO records(tenant_id,collection_id,title,created_by) VALUES($1,$2,$3,$4) RETURNING *',
            [c.tenant, collection, b.title, c.user],
          )
        ).rows[0];
    for (const [fid, value] of values)
      await db.query(
        'INSERT INTO record_values VALUES($1,$2,$3,$4,$5) ON CONFLICT(record_id,field_id) DO UPDATE SET value=excluded.value',
        [c.tenant, collection, r.id, fid, JSON.stringify(value)],
      );
    for (const hook of afterSaveHooks) await hook(c, db, col, fields, b.data, r);
    await audit(db, c.tenant, c.user, rid ? 'record.update' : 'record.create', r.id, {
      version: r.version,
    });
    await event(db, c.tenant, c.user, rid ? 'record.updated' : 'record.created', r.id);
    return r;
  };
  return connection ? work(connection) : tx(work);
}
