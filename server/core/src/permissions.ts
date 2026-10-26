/** Tenant-defined roles are restrictive overlays on the existing ACL profiles. */
export const permissionCatalog = [
  { key: 'apps.read', label: 'Xem danh sách và thông tin ứng dụng', level: 'viewer' },
  { key: 'apps.manage', label: 'Tạo, cấu hình và sao chép ứng dụng', level: 'admin' },
  { key: 'apps.export', label: 'Xuất cấu hình ứng dụng', level: 'admin' },
  { key: 'templates.install', label: 'Cài mẫu hoặc nhập gói ứng dụng', level: 'admin' },
  { key: 'collections.read', label: 'Xem bảng và cấu trúc trường', level: 'viewer' },
  { key: 'collections.manage', label: 'Tạo, sửa, lưu trữ bảng và cấu hình chế độ xem', level: 'admin' },
  { key: 'fields.manage', label: 'Thiết kế trường và quyền đọc/ghi trường', level: 'admin' },
  { key: 'records.read', label: 'Xem, tìm kiếm hồ sơ và thống kê theo bảng', level: 'viewer' },
  { key: 'records.create', label: 'Tạo hồ sơ', level: 'editor' },
  { key: 'records.update', label: 'Sửa hồ sơ theo quyền nền', level: 'editor' },
  { key: 'records.delete', label: 'Xóa hồ sơ nháp theo quyền nền', level: 'editor' },
  { key: 'purchases.update', label: 'Cập nhật mua hàng sau phê duyệt', level: 'editor' },
  { key: 'records.complete', label: 'Thực hiện hành động hoàn thành', level: 'editor' },
  { key: 'data.import', label: 'Nhập hồ sơ CSV/Excel', level: 'editor' },
  { key: 'data.export', label: 'Xuất hồ sơ CSV/Excel', level: 'viewer' },
  { key: 'files.read', label: 'Xem danh sách và tải tệp', level: 'viewer' },
  { key: 'files.upload', label: 'Tải tệp lên hồ sơ', level: 'editor' },
  { key: 'comments.read', label: 'Đọc bình luận', level: 'viewer' },
  { key: 'comments.create', label: 'Viết bình luận', level: 'editor' },
  { key: 'approvals.read', label: 'Xem danh sách phê duyệt', level: 'viewer' },
  { key: 'approvals.submit', label: 'Gửi hồ sơ phê duyệt', level: 'editor' },
  { key: 'approvals.decide', label: 'Duyệt / từ chối theo vai trò duyệt của bảng', level: 'editor' },
  { key: 'pages.read', label: 'Xem trang quản lý theo quyền nền', level: 'viewer' },
  { key: 'pages.manage', label: 'Tạo, sửa và xuất bản trang', level: 'admin' },
  { key: 'members.read', label: 'Xem danh sách thành viên tổ chức', level: 'viewer' },
  { key: 'dashboard.read', label: 'Xem tổng quan tổ chức', level: 'viewer' },
  { key: 'audit.read', label: 'Xem nhật ký tổ chức', level: 'admin' },
  { key: 'operations.read', label: 'Xem trạng thái xử lý nền', level: 'admin' },
  { key: 'operations.retry', label: 'Thử lại sự kiện xử lý nền', level: 'admin' },
] as const;
export type Permission = typeof permissionCatalog[number]['key'];
export type BaseRole = 'admin' | 'editor' | 'viewer';
export const permissionKeys = permissionCatalog.map(p => p.key);
const ranks = { viewer: 0, editor: 1, admin: 2 };
export function availablePermissions(base: BaseRole): Permission[] {
  return permissionCatalog.filter(p => ranks[p.level] <= ranks[base]).map(p => p.key);
}
export const dependencies: Partial<Record<Permission, Permission[]>> = {
  'collections.read': ['apps.read'], 'records.read': ['collections.read'],
  'apps.manage': ['apps.read'], 'apps.export': ['apps.read'],
  'templates.install': ['apps.manage'], 'collections.manage': ['collections.read'],
  'fields.manage': ['collections.manage'],
  'records.create': ['records.read'], 'records.update': ['records.read'],
  'purchases.update': ['records.read'],
  'records.delete': ['records.read'], 'records.complete': ['records.update'],
  'data.import': ['records.create'], 'data.export': ['records.read'],
  'files.read': ['records.read'], 'files.upload': ['files.read', 'records.update'],
  'comments.read': ['records.read'], 'comments.create': ['comments.read'],
  'approvals.read': ['records.read'], 'approvals.submit': ['approvals.read', 'records.update'],
  'approvals.decide': ['approvals.read'], 'pages.read': ['collections.read'],
  'pages.manage': ['pages.read'], 'dashboard.read': ['records.read', 'members.read'],
  'operations.retry': ['operations.read'],
};
export function permissionError(base: BaseRole, permissions: string[]): string | undefined {
  const allowed: string[] = availablePermissions(base);
  for (const p of permissions) {
    if (!allowed.includes(p)) return `Quyền ${p} không thuộc mức nền ${base}`;
    for (const dep of dependencies[p as Permission] || [])
      if (!permissions.includes(dep)) return `${p} cần quyền ${dep}`;
  }
}
/** Exact route allowlist: new/unclassified endpoints fail closed for custom roles. */
export function routePermissions(method: string, path: string): Permission[] | null {
  const get = method === 'GET';
  const p = path.replace(/\/$/, '') || '/';
  if (get && ['/notifications','/realtime/token'].includes(p)) return [];
  if (method === 'POST' && p === '/notifications/read') return [];
  if (get && p === '/members') return ['members.read'];
  if (get && p === '/dashboard') return ['dashboard.read'];
  if (get && p === '/audit') return ['audit.read'];
  if (get && p === '/operations') return ['operations.read'];
  if (method === 'POST' && /^\/operations\/[^/]+\/retry$/.test(p)) return ['operations.retry'];
  if (method === 'PATCH' && /^\/purchases\/[^/]+$/.test(p)) return ['purchases.update'];
  if (get && p === '/approvals') return ['approvals.read'];
  if (method === 'POST' && /^\/approvals\/[^/]+\/decide$/.test(p)) return ['approvals.decide'];
  if (method === 'POST' && /^\/records\/[^/]+\/submit$/.test(p)) return ['approvals.submit'];
  if (/^\/records\/[^/]+\/files$/.test(p)) return get ? ['files.read'] : method === 'POST' ? ['files.upload'] : null;
  if (get && /^\/files\/[^/]+\/download$/.test(p)) return ['files.read'];
  if (method === 'POST' && p === '/templates/office') return ['templates.install'];
  const b = p.startsWith('/builder/') ? p.slice(8) : p;
  if (get && /^\/templates(?:\/[^/]+)?$/.test(b)) return ['templates.install'];
  if (method === 'POST' && (/^\/templates\/[^/]+\/install$/.test(b) || b === '/packages/import')) return ['templates.install'];
  if (/^\/apps(?:\/[^/]+)?$/.test(b)) return get ? ['apps.read'] : method === 'POST' && b === '/apps' ? ['apps.manage'] : null;
  if (method === 'POST' && /^\/apps\/[^/]+\/clone$/.test(b)) return ['apps.manage'];
  if (get && /^\/apps\/[^/]+\/export$/.test(b)) return ['apps.export'];
  if (method === 'PUT' && /^\/apps\/[^/]+\/settings$/.test(b)) return ['apps.manage'];
  if (/^\/apps\/[^/]+\/pages$/.test(b)) return get ? ['pages.read'] : method === 'POST' ? ['pages.manage'] : null;
  if (method === 'PUT' && /^\/pages\/[^/]+$/.test(b)) return ['pages.manage'];
  if (/^\/apps\/[^/]+\/collections$/.test(b)) return get ? ['collections.read'] : method === 'POST' ? ['collections.manage'] : null;
  if (b === '/collections') return get ? ['collections.read'] : method === 'POST' ? ['collections.manage'] : null;
  if (/^\/collections\/[^/]+\/fields$/.test(b)) return get ? ['collections.read'] : method === 'POST' ? ['fields.manage'] : null;
  if (method === 'PUT' && /^\/collections\/[^/]+\/fields\/[^/]+$/.test(b)) return ['fields.manage'];
  if (method === 'POST' && /^\/collections\/[^/]+\/fields\/[^/]+\/archive$/.test(b)) return ['fields.manage'];
  if ((method === 'PATCH' && /^\/collections\/[^/]+$/.test(b)) ||
      (method === 'PUT' && /^\/collections\/[^/]+\/config$/.test(b)) ||
      (method === 'POST' && /^\/collections\/[^/]+\/archive$/.test(b))) return ['collections.manage'];
  if (/^\/collections\/[^/]+\/records$/.test(b)) return get ? ['records.read'] : method === 'POST' ? ['records.create'] : null;
  if (method === 'POST' && /^\/collections\/[^/]+\/query$/.test(b)) return ['records.read'];
  if (get && /^\/collections\/[^/]+\/(dashboard|tree|views\/[^/]+)$/.test(b)) return ['records.read'];
  if (method === 'POST' && /^\/collections\/[^/]+\/import(?:\/preview)?$/.test(b)) return ['data.import'];
  if (method === 'POST' && /^\/collections\/[^/]+\/export$/.test(b)) return ['data.export'];
  if (/^\/records\/[^/]+$/.test(b)) return get ? ['records.read'] : method === 'PATCH' ? ['records.update'] : method === 'DELETE' ? ['records.delete'] : null;
  if (get && /^\/records\/[^/]+\/related$/.test(b)) return ['records.read'];
  if (method === 'PUT' && /^\/records\/[^/]+\/parent$/.test(b)) return ['records.update'];
  if (/^\/records\/[^/]+\/comments$/.test(b)) return get ? ['comments.read'] : method === 'POST' ? ['comments.create'] : null;
  // Action names are configurable: the handler checks the actual action kind too.
  if (method === 'POST' && /^\/records\/[^/]+\/actions\/[^/]+$/.test(b)) return ['records.read'];
  return null;
}
