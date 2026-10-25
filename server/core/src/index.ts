import './builder/gantt.js';
import './builder/calendar.js';
import './builder/views.js';
import './builder/templates.js';
import './builder/cloning.js';
import './builder/packages.js';
import './builder/data-transfer.js';
import './builder/linkage.js';
import './builder/trees.js';
import './builder/formulas.js';
import './builder/relations.js';
import './builder/actions.js';
import './builder/conditions.js';
import './builder/details.js';
import './builder/modules.js';
import './builder/menus.js';
import './builder/pages.js';
import './builder/app-settings.js';
import { legacyAccess } from './builder/legacy-access.js';
import './builder/forms.js';
import './builder/configuration.js';
import './builder/records.js';
import './builder/defaults.js';
import './builder/validation.js';
import './builder/file-fields.js';
import { loadRecord, saveRecord, recordInput } from './builder/records-service.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { z } from 'zod';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from './config.js';
import { pool, tx, audit, event } from './db.js';
import {
  identity,
  context,
  admin,
  writer,
  internal,
  fail,
  HttpError,
  type Context,
} from './auth.js';
import './builder/apps.js';
import './builder/fields.js';
import './builder/collections.js';
import { builder } from './builder/base.js';
import { collection as authorizedCollection } from './builder/base.js';
import { deliverEvent } from './workflow.js';
const app = express();
app.disable('x-powered-by');
app.disable('etag');
app.use((_q, s, n) => {
  s.setHeader('Cache-Control', 'no-store');
  n();
});
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const uuid = z.string().uuid();
const label = z.string().trim().min(1).max(160);
const roles = z.enum(['owner', 'admin', 'editor', 'viewer']);
const run =
  (fn: (q: Request, s: Response) => Promise<unknown>) =>
  (q: Request, s: Response, n: NextFunction) => {
    Promise.resolve(fn(q, s)).catch(n);
  };
const ctx = (q: Request) => context(q.headers.authorization, q.headers['x-tenant-id']);
const id = (q: Request, key = 'id') => uuid.parse(q.params[key]);
app.use('/api/builder', builder);
app.use('/api', legacyAccess);
app.get(
  '/health',
  run(async (_q, s) => {
    await pool.query('SELECT 1');
    s.json({ status: 'ok' });
  }),
);
app.get(
  '/internal/gateway',
  run(async (q, s) => {
    await identity(q.headers.authorization);
    s.sendStatus(200);
  }),
);
app.post(
  '/internal/hasura-auth',
  run(async (q, s) => {
    const h = Object.fromEntries(
      Object.entries(q.body.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const c = await context(h.authorization, h['x-tenant-id']);
    s.json({
      'X-Hasura-Role': 'member',
      'X-Hasura-User-Id': c.user,
      'X-Hasura-Tenant-Id': c.tenant,
      'X-Hasura-App-Role': c.role,
      'Cache-Control': 'no-store',
    });
  }),
);
app.post(
  '/internal/events/:id/deliver',
  run(async (q, s) => {
    internal(q.headers['x-internal-secret']);
    await deliverEvent(id(q));
    s.json({ ok: true });
  }),
);
app.get(
  '/api/me',
  run(async (q, s) => {
    const user = await identity(q.headers.authorization);
    await pool.query('INSERT INTO users(id,display_name) VALUES($1,$1) ON CONFLICT DO NOTHING', [
      user,
    ]);
    const r = await pool.query(
      'SELECT o.*,m.role FROM organizations o JOIN memberships m ON m.tenant_id=o.id WHERE m.user_id=$1 ORDER BY o.created_at',
      [user],
    );
    s.json({ user, organizations: r.rows });
  }),
);
app.post(
  '/api/organizations',
  run(async (q, s) => {
    const user = await identity(q.headers.authorization);
    const b = z.object({ name: label }).parse(q.body);
    const r = await tx(async (c) => {
      await c.query('INSERT INTO users(id,display_name) VALUES($1,$1) ON CONFLICT DO NOTHING', [
        user,
      ]);
      const org = (
        await c.query('INSERT INTO organizations(name) VALUES($1) RETURNING *', [b.name])
      ).rows[0];
      await c.query("INSERT INTO memberships VALUES($1,$2,'owner')", [org.id, user]);
      await audit(c, org.id, user, 'organization.create', org.id);
      return org;
    });
    s.status(201).json(r);
  }),
);
app.get(
  '/api/members',
  run(async (q, s) => {
    const c = await ctx(q);
    s.json(
      (
        await pool.query(
          'SELECT m.user_id,m.role,u.display_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE tenant_id=$1 ORDER BY u.display_name',
          [c.tenant],
        )
      ).rows,
    );
  }),
);
app.put(
  '/api/members/:subject',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    const b = z.object({ role: roles.exclude(['owner']) }).parse(q.body);
    const subject = z.string().min(1).max(128).parse(q.params.subject);
    await tx(async (db) => {
      await db.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [c.tenant]);
      const old = (
        await db.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2', [
          c.tenant,
          subject,
        ])
      ).rows[0];
      if (old?.role === 'owner' || subject === c.user)
        fail(403, 'Không thay đổi vai trò chủ sở hữu hoặc chính mình');
      if (c.role !== 'owner' && (old?.role === 'admin' || b.role === 'admin'))
        fail(403, 'Chỉ chủ sở hữu quản lý quản trị viên');
      const u = await db.query('SELECT id FROM users WHERE id=$1', [subject]);
      if (!u.rowCount) fail(400, 'Người dùng cần đăng nhập ShareBase một lần trước');
      await db.query(
        'INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role',
        [c.tenant, subject, b.role],
      );
      await audit(db, c.tenant, c.user, 'member.save', subject, { role: b.role });
    });
    s.json({ ok: true });
  }),
);
app.delete(
  '/api/members/:subject',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    await tx(async (db) => {
      await db.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [c.tenant]);
      const old = (
        await db.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2', [
          c.tenant,
          q.params.subject,
        ])
      ).rows[0];
      if (!old) fail(404, 'Không tìm thấy thành viên');
      if (
        old.role === 'owner' ||
        q.params.subject === c.user ||
        (old.role === 'admin' && c.role !== 'owner')
      )
        fail(403, 'Không được xóa thành viên này');
      await db.query('DELETE FROM memberships WHERE tenant_id=$1 AND user_id=$2', [
        c.tenant,
        q.params.subject,
      ]);
      await audit(db, c.tenant, c.user, 'member.remove', q.params.subject);
    });
    s.json({ ok: true });
  }),
);
app.post(
  '/api/templates/office',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    s.status(201).json(
      await tx(async (db) => {
        const a = (
          await db.query(
            "INSERT INTO apps(tenant_id,name,description) VALUES($1,'Văn phòng số','Hồ sơ đề nghị mua sắm và phê duyệt nội bộ') RETURNING *",
            [c.tenant],
          )
        ).rows[0];
        const col = (
          await db.query(
            "INSERT INTO collections(tenant_id,app_id,name,description,workflow_enabled) VALUES($1,$2,'Đề nghị mua sắm','Đề xuất vật tư, ghi nhận ngân sách và duyệt theo vai trò.',true) RETURNING *",
            [c.tenant, a.id],
          )
        ).rows[0];
        const specs = [
          ['item', 'Tên hàng hóa', 'text', true],
          ['amount', 'Dự toán (VNĐ)', 'number', true],
          ['reason', 'Lý do đề nghị', 'textarea', true],
          ['needed_on', 'Ngày cần', 'date', false],
        ];
        for (let i = 0; i < specs.length; i++) {
          const [key, label, type, required] = specs[i];
          const f = (
            await db.query(
              'INSERT INTO fields(tenant_id,collection_id,key,label,type,required,position) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
              [c.tenant, col.id, key, label, type, required, i],
            )
          ).rows[0];
          for (const role of ['owner', 'admin', 'editor', 'viewer'])
            await db.query('INSERT INTO field_permissions VALUES($1,$2,$3,$4)', [
              c.tenant,
              f.id,
              role,
              role !== 'viewer',
            ]);
        }
        await audit(db, c.tenant, c.user, 'template.office', a.id);
        return { app: a, collection: col };
      }),
    );
  }),
);
app.get(
  '/api/apps',
  run(async (q, s) => {
    const c = await ctx(q);
    s.json(
      (
        await pool.query(
          'SELECT * FROM apps WHERE tenant_id=$1 AND EXISTS(SELECT 1 FROM app_roles ar WHERE ar.app_id=apps.id AND ar.role=$2) ORDER BY created_at',
          [c.tenant, c.role],
        )
      ).rows,
    );
  }),
);
app.post(
  '/api/apps',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    const b = z
      .object({ name: label, description: z.string().max(2000).default('') })
      .parse(q.body);
    s.status(201).json(
      await tx(async (db) => {
        const r = (
          await db.query(
            'INSERT INTO apps(tenant_id,name,description) VALUES($1,$2,$3) RETURNING *',
            [c.tenant, b.name, b.description],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'app.create', r.id);
        return r;
      }),
    );
  }),
);
app.get(
  '/api/collections',
  run(async (q, s) => {
    const c = await ctx(q);
    s.json(
      (
        await pool.query(
          'SELECT * FROM collections WHERE tenant_id=$1 AND EXISTS(SELECT 1 FROM app_roles ar WHERE ar.app_id=collections.app_id AND ar.role=$2) ORDER BY created_at',
          [c.tenant, c.role],
        )
      ).rows,
    );
  }),
);
app.post(
  '/api/collections',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    const b = z
      .object({ app_id: uuid, name: label, description: z.string().max(2000).default('') })
      .parse(q.body);
    s.status(201).json(
      await tx(async (db) => {
        const r = (
          await db.query(
            'INSERT INTO collections(tenant_id,app_id,name,description) VALUES($1,$2,$3,$4) RETURNING *',
            [c.tenant, b.app_id, b.name, b.description],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'collection.create', r.id);
        return r;
      }),
    );
  }),
);
app.patch(
  '/api/collections/:id',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    const b = z
      .object({
        name: label,
        workflow_enabled: z.boolean(),
        reviewer_role: z.enum(['admin', 'editor']),
      })
      .parse(q.body);
    s.json(
      await tx(async (db) => {
        const r = (
          await db.query(
            'UPDATE collections SET name=$3,workflow_enabled=$4,reviewer_role=$5 WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, id(q), b.name, b.workflow_enabled, b.reviewer_role],
          )
        ).rows[0];
        if (!r) fail(404, 'Không tìm thấy bảng');
        await audit(db, c.tenant, c.user, 'collection.configure', r.id, b);
        return r;
      }),
    );
  }),
);
app.get(
  '/api/collections/:id/fields',
  run(async (q, s) => {
    const c = await ctx(q);
    s.json(
      (
        await pool.query(
          `SELECT f.*,p.can_write FROM fields f JOIN field_permissions p ON p.field_id=f.id AND p.role=$3 WHERE f.tenant_id=$1 AND f.collection_id=$2 ORDER BY position,key`,
          [c.tenant, id(q), c.role],
        )
      ).rows,
    );
  }),
);
const fieldInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
  label,
  type: z.enum(['text', 'textarea', 'number', 'date', 'boolean', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(100)).max(100).default([]),
  position: z.number().int().min(0).default(0),
  read_roles: z.array(roles).default(['owner', 'admin', 'editor', 'viewer']),
  write_roles: z.array(roles).default(['owner', 'admin', 'editor']),
});
app.post(
  '/api/collections/:id/fields',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    const b = fieldInput.parse(q.body);
    if (b.type === 'select' && !b.options.length)
      fail(400, 'Trường lựa chọn cần danh sách giá trị');
    s.status(201).json(
      await tx(async (db) => {
        await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          id(q),
        ]);
        if (
          b.required &&
          (
            await db.query(
              'SELECT 1 FROM records WHERE tenant_id=$1 AND collection_id=$2 LIMIT 1',
              [c.tenant, id(q)],
            )
          ).rowCount
        )
          fail(409, 'Bảng đã có dữ liệu: chỉ thêm trường không bắt buộc');
        const f = (
          await db.query(
            'INSERT INTO fields(tenant_id,collection_id,key,label,type,required,options,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [
              c.tenant,
              id(q),
              b.key,
              b.label,
              b.type,
              b.required,
              JSON.stringify(b.options),
              b.position,
            ],
          )
        ).rows[0];
        for (const role of new Set(['owner', 'admin', ...b.read_roles]))
          await db.query('INSERT INTO field_permissions VALUES($1,$2,$3,$4)', [
            c.tenant,
            f.id,
            role,
            role === 'owner' ||
              role === 'admin' ||
              (role !== 'viewer' && b.write_roles.includes(role as any)),
          ]);
        await audit(db, c.tenant, c.user, 'field.create', f.id);
        return f;
      }),
    );
  }),
);

app.get(
  '/api/collections/:id/records',
  run(async (q, s) => {
    const c = await ctx(q);
    await authorizedCollection(c, id(q));
    const page = z.coerce.number().int().min(1).default(1).parse(q.query.page);
    const search = z.string().max(200).default('').parse(q.query.search);
    const status = z
      .enum(['', 'draft', 'pending', 'approved', 'rejected'])
      .default('')
      .parse(q.query.status);
    const args = [c.tenant, id(q), '%' + search + '%', status];
    const where = "tenant_id=$1 AND collection_id=$2 AND title ILIKE $3 AND ($4='' OR status=$4)";
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT * FROM records WHERE ${where} ORDER BY created_at DESC LIMIT 30 OFFSET $5`,
        [...args, (page - 1) * 30],
      ),
      pool.query(`SELECT count(*)::int AS n FROM records WHERE ${where}`, args),
    ]);
    s.json({
      items: await Promise.all(rows.rows.map((r) => loadRecord(c, r.id))),
      total: total.rows[0].n,
      page,
    });
  }),
);
app.get(
  '/api/records/:id',
  run(async (q, s) => {
    s.json(await loadRecord(await ctx(q), id(q)));
  }),
);

app.post(
  '/api/collections/:id/records',
  run(async (q, s) => {
    s.status(201).json(await saveRecord(await ctx(q), id(q), recordInput.parse(q.body)));
  }),
);
app.patch(
  '/api/records/:id',
  run(async (q, s) => {
    const c = await ctx(q);
    const r = await loadRecord(c, id(q));
    s.json(await saveRecord(c, r.collection_id, recordInput.parse(q.body), r.id));
  }),
);
app.delete(
  '/api/records/:id',
  run(async (q, s) => {
    const c = await ctx(q);
    writer(c);
    await tx(async (db) => {
      const r = (
        await db.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          id(q),
        ])
      ).rows[0];
      if (!r) fail(404, 'Không tìm thấy hồ sơ');
      if (r.status !== 'draft') fail(409, 'Chỉ xóa hồ sơ nháp');
      if (c.role === 'editor' && r.created_by !== c.user) fail(403, 'Chỉ xóa hồ sơ của mình');
      const refs = await db.query(
        'SELECT 1 FROM outbox WHERE tenant_id=$1 AND record_id=$2 LIMIT 1',
        [c.tenant, r.id],
      );
      if (refs.rowCount)
        await db.query('UPDATE outbox SET record_id=NULL WHERE tenant_id=$1 AND record_id=$2', [
          c.tenant,
          r.id,
        ]);
      if (
        (
          await db.query('SELECT 1 FROM approvals WHERE tenant_id=$1 AND record_id=$2 LIMIT 1', [
            c.tenant,
            r.id,
          ])
        ).rowCount
      )
        fail(409, 'Hồ sơ có lịch sử phê duyệt không được xóa');
      const fs = (
        await db.query('SELECT object_key FROM files WHERE tenant_id=$1 AND record_id=$2', [
          c.tenant,
          r.id,
        ])
      ).rows;
      if (fs.length) fail(409, 'Hồ sơ đính kèm tệp cần được giữ lại để bảo toàn lịch sử');
      await db.query('DELETE FROM records WHERE tenant_id=$1 AND id=$2', [c.tenant, r.id]);
      await audit(db, c.tenant, c.user, 'record.delete', r.id);
    });
    s.json({ ok: true });
  }),
);
app.post(
  '/api/records/:id/submit',
  run(async (q, s) => {
    const c = await ctx(q);
    writer(c);
    s.json(
      await tx(async (db) => {
        const r = (
          await db.query(
            'SELECT r.*,c.workflow_enabled,c.reviewer_role FROM records r JOIN collections c ON c.id=r.collection_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r',
            [c.tenant, id(q)],
          )
        ).rows[0];
        if (!r) fail(404, 'Không tìm thấy hồ sơ');
        if (c.role === 'editor' && r.created_by !== c.user) fail(403, 'Chỉ gửi hồ sơ của mình');
        if (!r.workflow_enabled) fail(400, 'Bảng chưa bật quy trình');
        if (!['draft', 'rejected'].includes(r.status))
          fail(409, 'Hồ sơ không ở trạng thái cho phép gửi');
        if (
          !(
            await db.query(
              "SELECT 1 FROM memberships WHERE tenant_id=$1 AND user_id<>$2 AND (role=$3 OR role='owner') LIMIT 1",
              [c.tenant, c.user, r.reviewer_role],
            )
          ).rowCount
        )
          fail(400, 'Cần một người duyệt khác có vai trò phù hợp');
        await db.query(
          "UPDATE records SET status='pending',version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [c.tenant, r.id],
        );
        const a = (
          await db.query(
            'INSERT INTO approvals(tenant_id,record_id,requested_by,reviewer_role) VALUES($1,$2,$3,$4) RETURNING *',
            [c.tenant, r.id, c.user, r.reviewer_role],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'approval.submit', r.id);
        await event(db, c.tenant, c.user, 'approval.submitted', r.id);
        return a;
      }),
    );
  }),
);
app.get(
  '/api/approvals',
  run(async (q, s) => {
    const c = await ctx(q);
    s.json(
      (
        await pool.query(
          `SELECT a.*,r.title FROM approvals a JOIN records r ON r.id=a.record_id WHERE a.tenant_id=$1 AND (a.requested_by=$2 OR a.reviewer_role=$3 OR $3='owner') ORDER BY a.created_at DESC LIMIT 100`,
          [c.tenant, c.user, c.role],
        )
      ).rows,
    );
  }),
);
app.post(
  '/api/approvals/:id/decide',
  run(async (q, s) => {
    const c = await ctx(q);
    const b = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        comment: z.string().max(2000).default(''),
      })
      .parse(q.body);
    s.json(
      await tx(async (db) => {
        const a = (
          await db.query('SELECT * FROM approvals WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            c.tenant,
            id(q),
          ])
        ).rows[0];
        if (!a) fail(404, 'Không tìm thấy yêu cầu');
        if (a.status !== 'pending') fail(409, 'Yêu cầu đã xử lý');
        if (a.requested_by === c.user) fail(403, 'Không được tự phê duyệt');
        if (c.role !== 'owner' && c.role !== a.reviewer_role)
          fail(403, 'Không thuộc vai trò duyệt');
        await db.query(
          'UPDATE approvals SET status=$3,decided_by=$4,comment=$5,decided_at=now() WHERE tenant_id=$1 AND id=$2',
          [c.tenant, a.id, b.decision, c.user, b.comment],
        );
        await db.query(
          'UPDATE records SET status=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [c.tenant, a.record_id, b.decision],
        );
        await audit(db, c.tenant, c.user, 'approval.' + b.decision, a.record_id, {
          comment: b.comment,
        });
        await event(db, c.tenant, c.user, 'approval.' + b.decision, a.record_id);
        return { ok: true };
      }),
    );
  }),
);
app.get(
  '/api/records/:id/files',
  run(async (q, s) => {
    const c = await ctx(q);
    await loadRecord(c, id(q));
    s.json(
      (
        await pool.query(
          'SELECT id,name,mime,size,created_at FROM files WHERE tenant_id=$1 AND record_id=$2 ORDER BY created_at',
          [c.tenant, id(q)],
        )
      ).rows,
    );
  }),
);
app.post(
  '/api/records/:id/files',
  run(async (q, s) => {
    const c = await ctx(q);
    writer(c);
    await new Promise<void>((resolve, reject) =>
      upload.single('file')(q, s, (e) => (e ? reject(e) : resolve())),
    );
    if (!q.file) fail(400, 'Chọn tệp');
    const file = q.file;
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];
    if (!allowed.includes(file.mimetype)) fail(400, 'Chỉ nhận PDF, PNG, JPEG, TXT');
    const fid = randomUUID(),
      key = `${c.tenant}/${id(q)}/${fid}`;
    let stored = false;
    try {
      const result = await tx(async (db) => {
        const r = (
          await db.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            c.tenant,
            id(q),
          ])
        ).rows[0];
        if (!r) fail(404, 'Không tìm thấy hồ sơ');
        if (!['draft', 'rejected'].includes(r.status))
          fail(409, 'Không thay tệp sau khi gửi duyệt');
        if (c.role === 'editor' && r.created_by !== c.user) fail(403, 'Chỉ sửa hồ sơ của mình');
        await s3.send(
          new PutObjectCommand({
            Bucket: env.S3_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: 'application/octet-stream',
          }),
        );
        stored = true;
        const f = (
          await db.query(
            'INSERT INTO files(id,tenant_id,record_id,name,object_key,mime,size,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,size',
            [
              fid,
              c.tenant,
              r.id,
              file.originalname.slice(0, 200),
              key,
              file.mimetype,
              file.size,
              c.user,
            ],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'file.upload', fid);
        return f;
      });
      s.status(201).json(result);
    } catch (e) {
      if (stored)
        await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })).catch(() => {});
      throw e;
    }
  }),
);
app.get(
  '/api/files/:id/download',
  run(async (q, s) => {
    const c = await ctx(q);
    const f = (
      await pool.query('SELECT * FROM files WHERE tenant_id=$1 AND id=$2', [c.tenant, id(q)])
    ).rows[0];
    if (!f) fail(404, 'Không tìm thấy tệp');
    await loadRecord(c, f.record_id);
    const obj = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: f.object_key }));
    s.setHeader('Content-Type', 'application/octet-stream');
    s.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    );
    s.setHeader('Cache-Control', 'no-store');
    s.send(Buffer.from(await obj.Body!.transformToByteArray()));
  }),
);
app.get(
  '/api/notifications',
  run(async (q, s) => {
    const c = await ctx(q);
    s.json(
      (
        await pool.query(
          'SELECT * FROM notifications WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100',
          [c.tenant, c.user],
        )
      ).rows,
    );
  }),
);
app.post(
  '/api/notifications/read',
  run(async (q, s) => {
    const c = await ctx(q);
    await pool.query(
      'UPDATE notifications SET read_at=now() WHERE tenant_id=$1 AND user_id=$2 AND read_at IS NULL',
      [c.tenant, c.user],
    );
    s.json({ ok: true });
  }),
);
app.get(
  '/api/realtime/token',
  run(async (q, s) => {
    const c = await ctx(q);
    const token = await new SignJWT({ channels: [`personal:${c.tenant}:${c.user}`] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(c.user)
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode(env.CENTRIFUGO_SECRET));
    s.json({ token });
  }),
);
app.get(
  '/api/dashboard',
  run(async (q, s) => {
    const c = await ctx(q);
    const [counts, apps, members] = await Promise.all([
      pool.query(
        'SELECT status,count(*)::int AS count FROM records WHERE tenant_id=$1 GROUP BY status',
        [c.tenant],
      ),
      pool.query('SELECT count(*)::int AS count FROM apps WHERE tenant_id=$1', [c.tenant]),
      pool.query('SELECT count(*)::int AS count FROM memberships WHERE tenant_id=$1', [c.tenant]),
    ]);
    s.json({ statuses: counts.rows, apps: apps.rows[0].count, members: members.rows[0].count });
  }),
);
app.get(
  '/api/audit',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    s.json(
      (
        await pool.query('SELECT * FROM audit_logs WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [
          c.tenant,
        ])
      ).rows,
    );
  }),
);
app.get(
  '/api/operations',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    s.json(
      (
        await pool.query(
          'SELECT id,kind,attempts,available_at,delivered_at,last_error,created_at FROM outbox WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',
          [c.tenant],
        )
      ).rows,
    );
  }),
);
app.post(
  '/api/operations/:id/retry',
  run(async (q, s) => {
    const c = await ctx(q);
    admin(c);
    await pool.query(
      'UPDATE outbox SET available_at=now(),last_error=NULL WHERE tenant_id=$1 AND id=$2 AND delivered_at IS NULL',
      [c.tenant, id(q)],
    );
    s.json({ ok: true });
  }),
);
app.use((_q, s) => s.status(404).json({ error: 'Endpoint không tồn tại' }));
app.use((e: any, _q: Request, s: Response, _n: NextFunction) => {
  if (s.headersSent) return;
  const status =
    e instanceof HttpError
      ? e.status
      : e instanceof z.ZodError
        ? 400
        : e instanceof multer.MulterError
          ? 400
          : ['23505', '23503', '22P02'].includes(e.code)
            ? 409
            : 500;
  console.error(
    JSON.stringify({
      level: 'error',
      status,
      message: status === 500 ? 'Internal server error' : e.message,
      code: e.code,
    }),
  );
  s.status(status).json({
    code:
      e instanceof z.ZodError
        ? 'VALIDATION_ERROR'
        : status === 409
          ? 'CONFLICT'
          : status === 403
            ? 'FORBIDDEN'
            : status === 401
              ? 'UNAUTHENTICATED'
              : status === 404
                ? 'NOT_FOUND'
                : status === 500
                  ? 'INTERNAL_ERROR'
                  : 'INVALID_REQUEST',
    fieldErrors: e instanceof z.ZodError ? e.flatten().fieldErrors : {},
    error:
      status === 500
        ? 'Lỗi máy chủ'
        : e instanceof z.ZodError
          ? e.issues.map((x) => x.path.join('.') + ': ' + x.message).join('; ')
          : status === 409 && e.code
            ? 'Dữ liệu trùng hoặc liên kết không hợp lệ'
            : e.message,
  });
});
const server = app.listen(env.PORT, '0.0.0.0', () =>
  console.log('ShareBase Core listening on', env.PORT),
);
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () => server.close(() => void pool.end().then(() => process.exit(0))));
