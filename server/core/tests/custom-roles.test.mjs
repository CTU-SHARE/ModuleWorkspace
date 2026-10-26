import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';

const port=19400, jwksPort=19401;
Object.assign(process.env,{
 DATABASE_URL:'postgres://fixture:fixture@localhost/fixture',PORT:String(port),
 LOGTO_ISSUER:'http://127.0.0.1:'+jwksPort,LOGTO_JWKS_URL:'http://127.0.0.1:'+jwksPort+'/jwks',LOGTO_RESOURCE:'fixture',
 INTERNAL_SECRET:'x'.repeat(32),CENTRIFUGO_SECRET:'x'.repeat(32),CENTRIFUGO_API_KEY:'x'.repeat(32),
 CENTRIFUGO_URL:'http://127.0.0.1:19402',N8N_WEBHOOK_URL:'http://127.0.0.1:19402',
 S3_ENDPOINT:'http://127.0.0.1:19402',S3_ACCESS_KEY:'fixture',S3_SECRET_KEY:'fixture',HASURA_URL:'http://127.0.0.1:19402',HASURA_ADMIN_SECRET:'x'.repeat(32),
});
const db=new PGlite();
await db.exec('CREATE ROLE hasura;');
for(const f of (await readdir('../db/migrations')).filter(f=>f.endsWith('.sql')).sort()){
 let sql=await readFile('../db/migrations/'+f,'utf8');
 // PGlite provides gen_random_uuid natively; no external pgcrypto extension is needed for these migrations.
 sql=sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
 await db.exec(sql);
}
const query=async(text,params)=>{
 const r=await db.query(text,params);
 return {...r,rowCount:/^\s*(SELECT|WITH)/i.test(text)?r.rows.length:r.affectedRows};
};
pg.Pool.prototype.query=query;
pg.Pool.prototype.connect=async()=>({query,release(){}});
const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='fixture';
const jwks=createServer((_q,s)=>{s.setHeader('Content-Type','application/json');s.end(JSON.stringify({keys:[jwk]}));});
await new Promise(r=>jwks.listen(jwksPort,'127.0.0.1',r));
const token=async subject=>new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setSubject(subject).setIssuer(process.env.LOGTO_ISSUER).setAudience('fixture').setExpirationTime('5m').sign(privateKey);
const tokens={};for(const u of ['owner-a','owner-b','admin-a','member-a','viewer-a'])tokens[u]=await token(u);
await import('../dist/index.js');
let assertions=0;
async function req(user,tenant,method,path,body,status=200){
 const r=await fetch('http://127.0.0.1:'+port+path,{method,headers:{Authorization:'Bearer '+tokens[user],'X-Tenant-Id':tenant||'','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();assert.equal(r.status,status,`${method} ${path} ${JSON.stringify(data)}`);assertions++;return data;
}
try{
 for(const u of Object.keys(tokens))await req(u,'','GET','/api/me');
 const a=await req('owner-a','','POST','/api/organizations',{name:'Organization A'},201);
 const b=await req('owner-b','','POST','/api/organizations',{name:'Organization B'},201);
 await req('owner-a',a.id,'PUT','/api/members/admin-a',{role:'admin'});
 await req('owner-a',a.id,'PUT','/api/members/viewer-a',{role:'viewer'});
 const catalog=await req('owner-a',a.id,'GET','/api/roles');assert.equal(catalog.catalog.length,28);assertions++;
 await req('admin-a',a.id,'GET','/api/roles',undefined,403);
 await req('viewer-a',a.id,'POST','/api/roles',{},403);
 await req('owner-a',a.id,'POST','/api/roles',{name:'Invalid',base_role:'viewer',permissions:['apps.manage']},400);
 await req('owner-a',a.id,'POST','/api/roles',{name:'Invalid',base_role:'editor',permissions:['records.create']},400);
 const permissions=['apps.read','collections.read','records.read'];
 let role=await req('owner-a',a.id,'POST','/api/roles',{name:'Giáo viên thử nghiệm',base_role:'editor',permissions},201);
 await req('owner-a',a.id,'POST','/api/roles',{name:'GIÁO VIÊN THỬ NGHIỆM',base_role:'editor',permissions},409);
 await req('owner-a',a.id,'PUT','/api/roles/assignment/member-a',{kind:'custom',role_id:role.id});
 await req('owner-b',b.id,'PUT','/api/roles/assignment/member-a',{kind:'custom',role_id:role.id},404);
 await req('owner-b',b.id,'PUT','/api/roles/'+role.id,{name:'Cross tenant',base_role:'editor',permissions,version:role.version},404);
 await req('member-a',a.id,'GET','/api/roles',undefined,403);
 await req('member-a',a.id,'PUT','/api/members/viewer-a',{role:'admin'},403);
 await req('admin-a',a.id,'PUT','/api/members/member-a',{role:'editor'},403);
 await req('owner-a',a.id,'PUT','/api/roles/assignment/owner-a',{kind:'custom',role_id:role.id},403);
 const app=await req('owner-a',a.id,'POST','/api/builder/apps',{name:'Test app'},201);
 const col=await req('owner-a',a.id,'POST',`/api/builder/apps/${app.id}/collections`,{name:'Test collection'},201);
 await req('member-a',a.id,'GET','/api/builder/apps?page=1');
 await req('member-a',a.id,'POST',`/api/builder/collections/${col.id}/records`,{title:'Denied',data:{}},403);
 await req('member-a',a.id,'POST',`/api/collections/${col.id}/records`,{title:'Denied legacy',data:{}},403);
 await req('member-a',a.id,'POST',`/api/builder/collections/${col.id}/export`,{format:'csv'},403);
 await req('member-a',a.id,'GET','/api/members',undefined,403);
 await req('member-a',a.id,'POST','/internal/hasura-auth',{headers:{authorization:'Bearer '+tokens['member-a'],'x-tenant-id':a.id}},403);
 await req('owner-a',a.id,'POST','/internal/hasura-auth',{headers:{authorization:'Bearer '+tokens['owner-a'],'x-tenant-id':a.id}});
 role=await req('owner-a',a.id,'PUT','/api/roles/'+role.id,{name:role.name,base_role:'editor',permissions:[...permissions,'records.create'],version:role.version});
 const record=await req('member-a',a.id,'POST',`/api/builder/collections/${col.id}/records`,{title:'Allowed after grant',data:{}},201);
 await req('member-a',a.id,'GET','/api/builder/records/'+record.id);
 await req('member-a',b.id,'GET','/api/builder/records/'+record.id,undefined,403);
 await req('member-a',a.id,'PATCH','/api/builder/records/'+record.id,{title:'Still no edit',data:{},version:record.version},403);
 await req('owner-a',a.id,'PUT','/api/roles/'+role.id,{name:role.name,base_role:'editor',permissions,version:1},409);
 role=await req('owner-a',a.id,'PUT','/api/roles/'+role.id,{name:role.name,base_role:'viewer',permissions,version:role.version});
 await req('member-a',a.id,'POST',`/api/builder/collections/${col.id}/records`,{title:'Revoked',data:{}},403);
 await req('owner-a',a.id,'DELETE','/api/roles/'+role.id,{version:role.version},409);
 const restrictedAdmin=await req('owner-a',a.id,'POST','/api/roles',{name:'Admin hạn chế',base_role:'admin',permissions},201);
 await req('owner-a',a.id,'PUT','/api/roles/assignment/viewer-a',{kind:'custom',role_id:restrictedAdmin.id});
 await req('viewer-a',a.id,'POST','/api/builder/apps',{name:'Escalation'},403);
 await req('viewer-a',a.id,'PUT',`/api/builder/apps/${app.id}/settings`,{name:'Escalation'},403);
 await req('viewer-a',a.id,'POST',`/api/builder/collections/${col.id}/fields`,{},403);
 await req('viewer-a',a.id,'POST','/api/templates/office',{},403);
 await req('viewer-a',a.id,'POST','/api/builder/templates/school/install',{},403);
 await req('viewer-a',a.id,'GET','/api/audit',undefined,403);
 await req('viewer-a',a.id,'GET','/api/operations',undefined,403);
 await req('viewer-a',a.id,'DELETE','/api/members/member-a',{},403);
 await req('viewer-a',a.id,'PUT','/api/roles/assignment/member-a',{kind:'builtin',role:'admin'},403);
 await req('owner-a',a.id,'PUT',`/api/builder/collections/${col.id}/config`,{version:col.version,config:{...col.config,actions:[{id:'ordinary-name',label:'Complete',kind:'complete',roles:['admin']}]}});
 await req('viewer-a',a.id,'POST',`/api/builder/records/${record.id}/actions/ordinary-name`,{version:record.version,request_id:crypto.randomUUID()},403);
 await req('admin-a',a.id,'POST','/api/builder/apps',{name:'Built-in admin still works'},201);

 await req('owner-a',a.id,'PUT','/api/roles/assignment/member-a',{kind:'builtin',role:'viewer'});
 await req('owner-a',a.id,'DELETE','/api/roles/'+role.id,{version:role.version});
 // All route mappings are explicit; omitted endpoints cannot accidentally inherit base admin powers.
 const {routePermissions}=await import('../dist/permissions.js');
 assert.equal(routePermissions('POST','/new-dangerous-endpoint'),null);assertions++;
 assert.deepEqual(routePermissions('POST','/builder/records/r/actions/my-approve'),['records.read']);assertions++;
 console.log(`PASS ${assertions} assertions: migrations, JWT, tenant isolation, owner-only management, grant/revoke, legacy routes, GraphQL denial, optimistic locking, delete protection.`);
 process.exit(0);
}catch(e){console.error(e);process.exit(1);}
