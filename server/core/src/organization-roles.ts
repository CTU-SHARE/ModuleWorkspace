import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getContext, fail, type Context } from './auth.js';
import { pool, tx, audit } from './db.js';
import { permissionCatalog, permissionKeys, permissionError, dependencies } from './permissions.js';

export const organizationRoles = Router();
const uuid = z.string().uuid();
const input = z.object({
  name: z.string().trim().min(1).max(80).refine(n => !['owner','admin','editor','viewer'].includes(n.toLowerCase()), 'Tên này dành cho role hệ thống'),
  description: z.string().max(1000).default(''),
  base_role: z.enum(['admin','editor','viewer']),
  permissions: z.array(z.string().refine(p => permissionKeys.includes(p as any), 'Quyền không hợp lệ')).max(permissionKeys.length)
    .refine(p => new Set(p).size === p.length, 'Quyền bị trùng'),
});
function owner(c: Context) {
  if (c.customRole || c.role !== 'owner') fail(403, 'Chỉ owner tổ chức được quản lý role tùy chỉnh');
}
const run = (fn: (q: Request,s: Response,c: Context) => Promise<unknown>) =>
  (q: Request,s: Response,n: NextFunction) => { getContext(q).then(c => {owner(c);return fn(q,s,c);}).catch(n); };
function parse(body: unknown) {
  const b = input.parse(body);
  const error = permissionError(b.base_role,b.permissions);
  if (error) fail(400,error);
  return b;
}
// Same organization lock serializes assignment, edits and deletion to avoid dangling roles.
async function lock(db: any,c: Context) {
  await db.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[c.tenant]);
  const live = (await db.query('SELECT role,custom_role_id FROM memberships WHERE tenant_id=$1 AND user_id=$2',[c.tenant,c.user])).rows[0];
  if (!live || live.role !== 'owner' || live.custom_role_id) fail(403,'Quyền owner đã thay đổi');
}
organizationRoles.get('/',run(async (_q,s,c) => {
  const result = await pool.query(`SELECT r.*,(SELECT count(*)::int FROM memberships m WHERE m.tenant_id=r.tenant_id AND m.custom_role_id=r.id) AS member_count FROM organization_roles r WHERE tenant_id=$1 ORDER BY lower(name),id`,[c.tenant]);
  s.json({items:result.rows,catalog:permissionCatalog,dependencies});
}));
organizationRoles.post('/',run(async(q,s,c) => {
  const b=parse(q.body);
  const r=await tx(async db=>{
    await lock(db,c);
    const row=(await db.query('INSERT INTO organization_roles(tenant_id,name,description,base_role,permissions) VALUES($1,$2,$3,$4,$5) RETURNING *',[c.tenant,b.name,b.description,b.base_role,JSON.stringify(b.permissions)])).rows[0];
    await audit(db,c.tenant,c.user,'role.create',row.id,{name:b.name,base_role:b.base_role,permissions:b.permissions});return row;
  });s.status(201).json(r);
}));
organizationRoles.put('/:id',run(async(q,s,c) => {
  const b=parse(q.body),id=uuid.parse(q.params.id),version=z.number().int().positive().parse(q.body.version);
  const r=await tx(async db=>{
    await lock(db,c);
    const old=(await db.query('SELECT * FROM organization_roles WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c.tenant,id])).rows[0];
    if(!old)fail(404,'Không tìm thấy role');
    if(old.version!==version)fail(409,'Role đã thay đổi, hãy tải lại');
    const row=(await db.query('UPDATE organization_roles SET name=$3,description=$4,base_role=$5,permissions=$6,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *',[c.tenant,id,b.name,b.description,b.base_role,JSON.stringify(b.permissions)])).rows[0];
    await db.query('UPDATE memberships SET role=$3 WHERE tenant_id=$1 AND custom_role_id=$2',[c.tenant,id,b.base_role]);
    await audit(db,c.tenant,c.user,'role.update',id,{before:old,after:row});return row;
  });s.json(r);
}));
organizationRoles.delete('/:id',run(async(q,s,c) => {
  const id=uuid.parse(q.params.id),version=z.number().int().positive().parse(q.body.version);
  await tx(async db=>{
    await lock(db,c);
    const old=(await db.query('SELECT * FROM organization_roles WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c.tenant,id])).rows[0];
    if(!old)fail(404,'Không tìm thấy role');
    if(old.version!==version)fail(409,'Role đã thay đổi, hãy tải lại');
    if((await db.query('SELECT 1 FROM memberships WHERE tenant_id=$1 AND custom_role_id=$2 LIMIT 1',[c.tenant,id])).rowCount)fail(409,'Role đang được gán cho thành viên; hãy đổi role của họ trước');
    await db.query('DELETE FROM organization_roles WHERE tenant_id=$1 AND id=$2',[c.tenant,id]);
    await audit(db,c.tenant,c.user,'role.delete',id,{name:old.name});
  });s.json({ok:true});
}));
organizationRoles.put('/assignment/:subject',run(async(q,s,c) => {
  const subject=z.string().min(1).max(128).parse(q.params.subject);
  const b=z.discriminatedUnion('kind',[
    z.object({kind:z.literal('custom'),role_id:uuid}),
    z.object({kind:z.literal('builtin'),role:z.enum(['admin','editor','viewer'])}),
  ]).parse(q.body);
  await tx(async db=>{
    await lock(db,c);
    const old=(await db.query('SELECT * FROM memberships WHERE tenant_id=$1 AND user_id=$2',[c.tenant,subject])).rows[0];
    if(subject===c.user||old?.role==='owner')fail(403,'Không thay đổi owner hoặc chính mình');
    if(!(await db.query('SELECT 1 FROM users WHERE id=$1',[subject])).rowCount)fail(400,'Người dùng cần đăng nhập Module Workspace một lần trước');
    let role: string,customId: string|null=null;
    if(b.kind==='custom'){
      const r=(await db.query('SELECT * FROM organization_roles WHERE tenant_id=$1 AND id=$2',[c.tenant,b.role_id])).rows[0];
      if(!r)fail(404,'Role không thuộc tổ chức này');role=r.base_role;customId=r.id;
    }else role=b.role;
    await db.query('INSERT INTO memberships(tenant_id,user_id,role,custom_role_id) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role,custom_role_id=excluded.custom_role_id',[c.tenant,subject,role,customId]);
    await audit(db,c.tenant,c.user,'member.role.assign',subject,{role,custom_role_id:customId});
  });s.json({ok:true});
}));
