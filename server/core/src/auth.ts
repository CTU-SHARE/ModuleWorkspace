import { createRemoteJWKSet, jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { env } from './config.js';
import { pool } from './db.js';
export type Context = {
  user: string; tenant: string; role: string;
  customRole?: { id: string; name: string; permissions: string[] };
};
const requestContexts = new WeakMap<object, Promise<Context>>();
export function getContext(q: { headers: { authorization?: string; [key: string]: unknown } }): Promise<Context> {
  let promise = requestContexts.get(q);
  if (!promise) { promise = context(q.headers.authorization, q.headers['x-tenant-id']); requestContexts.set(q,promise); }
  return promise;
}
export function requirePermission(c: Context, permission: string) {
  if(c.customRole && !c.customRole.permissions.includes(permission)) fail(403,'Thiếu quyền: '+permission);
}
const jwks = createRemoteJWKSet(new URL(env.LOGTO_JWKS_URL));
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export async function identity(token: unknown) {
  if (typeof token !== 'string' || !token.startsWith('Bearer ')) fail(401, 'Vui lòng đăng nhập');
  try {
    const { payload } = await jwtVerify(token.slice(7), jwks, {
      issuer: env.LOGTO_ISSUER,
      audience: env.LOGTO_RESOURCE,
      algorithms: ['RS256', 'ES384', 'ES256'],
    });
    if (!payload.sub) fail(401, 'Token thiếu subject');
    return payload.sub;
  } catch {
    return fail(401, 'Token không hợp lệ hoặc đã hết hạn');
  }
}
export async function context(token: unknown, tenant: unknown): Promise<Context> {
  const user = await identity(token);
  if (typeof tenant !== 'string' || !/^[0-9a-f-]{36}$/i.test(tenant))
    fail(400, 'Chọn tổ chức hợp lệ');
  const r = await pool.query('SELECT m.role,m.custom_role_id,r.name,r.base_role,r.permissions FROM memberships m LEFT JOIN organization_roles r ON r.tenant_id=m.tenant_id AND r.id=m.custom_role_id WHERE m.tenant_id=$1 AND m.user_id=$2', [
    tenant,
    user,
  ]);
  if (!r.rowCount) fail(403, 'Không có quyền trong tổ chức');
  const m=r.rows[0];
  if(m.custom_role_id && !m.base_role) fail(403,'Role tùy chỉnh không còn khả dụng');
  return { user, tenant, role: m.base_role || m.role,
    ...(m.custom_role_id ? { customRole: {id:m.custom_role_id,name:m.name,permissions:m.permissions} } : {}) };

}
export function admin(c: Context) {
  if (!['owner', 'admin'].includes(c.role)) fail(403, 'Cần quyền quản trị');
}
export function writer(c: Context) {
  if (c.role === 'viewer') fail(403, 'Tài khoản chỉ đọc');
}
export function internal(value: unknown) {
  const a = Buffer.from(typeof value === 'string' ? value : '');
  const b = Buffer.from(env.INTERNAL_SECRET);
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail(403, 'Internal authorization required');
}
