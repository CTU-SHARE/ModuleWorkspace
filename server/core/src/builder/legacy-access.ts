import type { Request, Response, NextFunction } from 'express';
import { getContext } from '../auth.js';
import { collection, application, pool, fail } from './base.js';
export function legacyAccess(q: Request, _s: Response, n: NextFunction) {
  if (q.path.startsWith('/builder') || q.path === '/me' || q.path === '/organizations') return n();
  const match = q.path.match(/^\/(collections|records|files|approvals)\/([0-9a-f-]{36})(?:\/|$)/i);
  if (!match) return n();
  void (async () => {
    const c = await getContext(q);
    const [, kind, id] = match;
    if (kind === 'collections') {
      await collection(c, id);
      return;
    }
    const query =
      kind === 'records'
        ? 'SELECT collection_id FROM records WHERE tenant_id=$1 AND id=$2'
        : kind === 'files'
          ? 'SELECT r.collection_id FROM files f JOIN records r ON r.id=f.record_id WHERE f.tenant_id=$1 AND f.id=$2'
          : 'SELECT r.collection_id FROM approvals a JOIN records r ON r.id=a.record_id WHERE a.tenant_id=$1 AND a.id=$2';
    const row = (await pool.query(query, [c.tenant, id])).rows[0];
    if (row) {
      const col = await collection(c, row.collection_id);
      const app = await application(c, col.app_id);
      const feature =
        kind === 'files' || q.path.endsWith('/files')
          ? 'files'
          : kind === 'approvals' || q.path.endsWith('/submit')
            ? 'approvals'
            : null;
      if (feature && app.config.modules?.[feature] === false) fail(403, 'Module đã tắt');
    }
  })()
    .then(() => n())
    .catch(n);
}
