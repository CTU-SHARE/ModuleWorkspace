import { Router, type Request, type Response, type NextFunction } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { getContext, admin, fail, type Context } from '../auth.js';
import { pool } from '../db.js';

export const builder = Router();
export const identifier = z.string().uuid();
export const title = z.string().trim().min(1).max(160);
export const revision = z.number().int().positive();
export const roleList = z.array(z.enum(['owner', 'admin', 'editor', 'viewer'])).min(1);
export type DB = Pick<pg.PoolClient, 'query'>;
export type Row = Record<string, any>;
export const route =
  (fn: (q: Request, s: Response, c: Context) => Promise<unknown>) =>
  (q: Request, s: Response, n: NextFunction) => {
    getContext(q)
      .then((c) => fn(q, s, c))
      .catch(n);
  };
export async function application(c: Context, id: string, db: DB = pool) {
  const a = (
    await db.query('SELECT * FROM apps WHERE tenant_id=$1 AND id=$2', [
      c.tenant,
      identifier.parse(id),
    ])
  ).rows[0];
  if (!a) fail(404, 'Không tìm thấy ứng dụng');
  if (!['owner', 'admin'].includes(c.role) && a.config.roles && !a.config.roles.includes(c.role))
    fail(403, 'Không có quyền truy cập ứng dụng');
  return a;
}
export async function collection(c: Context, id: string, db: DB = pool, allowArchived = false) {
  const col = (
    await db.query('SELECT * FROM collections WHERE tenant_id=$1 AND id=$2', [
      c.tenant,
      identifier.parse(id),
    ])
  ).rows[0];
  if (!col) fail(404, 'Không tìm thấy bảng');
  if (col.archived_at && !allowArchived) fail(409, 'Bảng đã được lưu trữ');
  const a = await application(c, col.app_id, db);
  if (a.config.modules?.records === false) fail(403, 'Module dữ liệu đã tắt');
  return col;
}
export function requireVersion(actual: number, expected: unknown) {
  if (revision.parse(expected) !== actual)
    fail(409, 'Cấu hình đã thay đổi. Tải lại trước khi lưu.');
}
export function editable(c: Context, record: Row) {
  if (c.role === 'viewer') fail(403, 'Tài khoản chỉ đọc');
  if (c.role === 'editor' && record.created_by !== c.user) fail(403, 'Chỉ sửa hồ sơ của mình');
  if (!['draft', 'rejected'].includes(record.status))
    fail(409, 'Hồ sơ không còn cho phép chỉnh sửa');
}
export { admin, fail, pool };
