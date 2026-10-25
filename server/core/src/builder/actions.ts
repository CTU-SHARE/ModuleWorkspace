import { z } from 'zod';
import {
  builder,
  route,
  collection,
  application,
  identifier,
  revision,
  fail,
  type Row,
} from './base.js';
import { collectionConfigChecks } from './configuration.js';
import { tx, audit, event } from '../db.js';
export const actionsSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/),
      label: z.string().min(1).max(80),
      kind: z.enum(['approve', 'reject', 'complete']),
      roles: z.array(z.enum(['owner', 'admin', 'editor'])).min(1),
    }),
  )
  .max(12);
collectionConfigChecks.push((c) => {
  if (c.actions) {
    const a = actionsSchema.parse(c.actions);
    if (new Set(a.map((x) => x.id)).size !== a.length) fail(400, 'Action trùng mã');
  }
});
builder.post(
  '/records/:id/actions/:action',
  route(async (q, s, c) => {
    const b = z
        .object({
          version: revision,
          request_id: identifier,
          comment: z.string().max(2000).default(''),
        })
        .parse(q.body),
      rid = identifier.parse(q.params.id),
      aid = String(q.params.action);
    s.json(
      await tx(async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          c.tenant + ':' + c.user + ':' + b.request_id,
        ]);
        const receipt = (
          await db.query(
            'SELECT * FROM action_receipts WHERE tenant_id=$1 AND user_id=$2 AND request_id=$3',
            [c.tenant, c.user, b.request_id],
          )
        ).rows[0];
        if (receipt) {
          if (receipt.record_id !== rid || receipt.action_id !== aid)
            fail(409, 'Request ID đã dùng cho thao tác khác');
          return receipt.result;
        }
        const r = (
          await db.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            c.tenant,
            rid,
          ])
        ).rows[0];
        if (!r) fail(404, 'Không tìm thấy hồ sơ');
        const col = await collection(c, r.collection_id, db);
        const app = await application(c, col.app_id, db);
        const action = actionsSchema.parse(col.config.actions || []).find((a) => a.id === aid);
        if (!action) fail(404, 'Không tìm thấy hành động');
        if (!action.roles.includes(c.role as any) || c.role === 'viewer')
          fail(403, 'Không có quyền thực hiện');
        if (r.version !== b.version) fail(409, 'Hồ sơ đã thay đổi');
        let status: string;
        if (action.kind === 'complete') {
          if (c.role === 'editor' && r.created_by !== c.user)
            fail(403, 'Chỉ hoàn thành hồ sơ của mình');
          if (
            !['draft', 'approved'].includes(r.status) ||
            (col.workflow_enabled && r.status !== 'approved')
          )
            fail(409, 'Hồ sơ chưa đủ điều kiện hoàn thành');
          status = 'completed';
        } else {
          if (app.config.modules?.approvals === false) fail(403, 'Module phê duyệt đã tắt');
          const approval = (
            await db.query(
              "SELECT * FROM approvals WHERE tenant_id=$1 AND record_id=$2 AND status='pending' FOR UPDATE",
              [c.tenant, rid],
            )
          ).rows[0];
          if (r.status !== 'pending' || !approval) fail(409, 'Không có yêu cầu đang chờ duyệt');
          if (approval.requested_by === c.user) fail(403, 'Không được tự phê duyệt');
          if (c.role !== 'owner' && c.role !== approval.reviewer_role)
            fail(403, 'Không thuộc vai trò duyệt');
          status = action.kind === 'approve' ? 'approved' : 'rejected';
          await db.query(
            'UPDATE approvals SET status=$3,decided_by=$4,comment=$5,decided_at=now() WHERE tenant_id=$1 AND id=$2',
            [c.tenant, approval.id, status, c.user, b.comment],
          );
        }
        const result = (
          await db.query(
            'UPDATE records SET status=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,version',
            [c.tenant, rid, status],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'action.' + aid, rid, { comment: b.comment });
        await event(
          db,
          c.tenant,
          c.user,
          (action.kind === 'complete' ? 'record.' : 'approval.') + status,
          rid,
        );
        await db.query(
          'INSERT INTO action_receipts(tenant_id,user_id,request_id,record_id,action_id,result) VALUES($1,$2,$3,$4,$5,$6)',
          [c.tenant, c.user, b.request_id, rid, aid, JSON.stringify(result)],
        );
        return result;
      }),
    );
  }),
);
