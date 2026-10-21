import {pool,tx} from './db.js';
import {env} from './config.js';
import {fail} from './auth.js';
export async function deliverEvent(id:string){
 const channels=await tx(async db=>{
 const e=(await db.query('SELECT * FROM outbox WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!e)fail(404,'Unknown event');if(e.delivered_at)return [];
 const record=e.record_id?(await db.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2',[e.tenant_id,e.record_id])).rows[0]:null;
 let recipients:string[]=[];
 if(e.kind==='approval.submitted'&&record){const a=(await db.query("SELECT reviewer_role,requested_by FROM approvals WHERE tenant_id=$1 AND record_id=$2 AND status='pending'",[e.tenant_id,record.id])).rows[0];if(a)recipients=(await db.query("SELECT user_id FROM memberships WHERE tenant_id=$1 AND user_id<>$2 AND (role=$3 OR role='owner')",[e.tenant_id,a.requested_by,a.reviewer_role])).rows.map(r=>r.user_id);}
 else if(e.kind.startsWith('approval.')&&record)recipients=[record.created_by];else recipients=[e.actor];
 const msg=({ 'approval.submitted':'Có hồ sơ cần phê duyệt','approval.approved':'Hồ sơ đã được duyệt','approval.rejected':'Hồ sơ đã bị từ chối','record.created':'Đã tạo hồ sơ','record.updated':'Đã cập nhật hồ sơ'} as Record<string,string>)[e.kind]||'Dữ liệu đã thay đổi';
 for(const user of recipients)await db.query('INSERT INTO notifications(tenant_id,user_id,event_id,message) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM memberships WHERE tenant_id=$1 AND user_id=$2) ON CONFLICT(event_id,user_id) DO NOTHING',[e.tenant_id,user,e.id,msg]);
 return recipients.map(u=>`personal:${e.tenant_id}:${u}`);
 });
 // Send only an invalidation marker. The client refetches through current membership checks.
 for(const channel of channels){const r=await fetch(env.CENTRIFUGO_URL+'/api/publish',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':env.CENTRIFUGO_API_KEY},body:JSON.stringify({channel,data:{type:'refresh',event_id:id}}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Realtime delivery failed');const body=await r.json() as any;if(body.error)throw Error('Realtime rejected delivery');}
 await pool.query('UPDATE outbox SET delivered_at=now(),last_error=NULL WHERE id=$1',[id]);
}
