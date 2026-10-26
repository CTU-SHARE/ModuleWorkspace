import type { Request, Response, NextFunction } from 'express';
import { getContext, fail } from './auth.js';
import { routePermissions } from './permissions.js';
export function roleGuard(q: Request, _s: Response, next: NextFunction) {
  // Role management has its own owner-only handlers; identity/bootstrap are tenant-independent.
  if (q.path === '/me' || q.path === '/organizations' || q.path === '/roles' || q.path.startsWith('/roles/')) return next();
  void (async () => {
    const c = await getContext(q);
    if (!c.customRole) return;
    const permissions = routePermissions(q.method, q.path);
    if (!permissions) fail(403, 'Role tùy chỉnh không được phép dùng endpoint này');
    for (const permission of permissions)
      if (!c.customRole.permissions.includes(permission)) fail(403, 'Thiếu quyền: ' + permission);
  })().then(() => next()).catch(next);
}
