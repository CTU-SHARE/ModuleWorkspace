import type { Request, Response, NextFunction } from 'express';
import { context } from '../auth.js';
import { collection, application, pool } from './base.js';
export function legacyAccess(q: Request, _s: Response, n: NextFunction) {
  if (q.path.startsWith('/builder') || q.path === '/me' || q.path === '/organizations') return n();
  const match = q.path.match(/^\/(collections|records|files|approvals)\/([0-9a-f-]{36})(?:\/|$)/i);
  if (!match) return n();
  void (async () => {
    const c = await context(q.headers.authorization, q.headers['x-tenant-id']);
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
    if (row) await collection(c, row.collection_id);
  })()
    .then(() => n())
    .catch(n);
}
