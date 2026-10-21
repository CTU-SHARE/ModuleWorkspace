import {createRemoteJWKSet,jwtVerify} from 'jose';
import {timingSafeEqual} from 'node:crypto';
import {env} from './config.js';
import {pool} from './db.js';
export type Context={user:string;tenant:string;role:string};
const jwks=createRemoteJWKSet(new URL(env.LOGTO_JWKS_URL));
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export function fail(status:number,message:string):never{throw new HttpError(status,message);}
export async function identity(token:unknown){
 if(typeof token!=='string'||!token.startsWith('Bearer '))fail(401,'Vui lòng đăng nhập');
 try{const {payload}=await jwtVerify(token.slice(7),jwks,{issuer:env.LOGTO_ISSUER,audience:env.LOGTO_RESOURCE,algorithms:['RS256','ES384','ES256']});if(!payload.sub)fail(401,'Token thiếu subject');return payload.sub;}catch{ return fail(401,'Token không hợp lệ hoặc đã hết hạn');}
}
export async function context(token:unknown,tenant:unknown):Promise<Context>{
 const user=await identity(token);
 if(typeof tenant!=='string'||! /^[0-9a-f-]{36}$/i.test(tenant))fail(400,'Chọn tổ chức hợp lệ');
 const r=await pool.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,user]);
 if(!r.rowCount)fail(403,'Không có quyền trong tổ chức');
 return {user,tenant,role:r.rows[0].role};
}
export function admin(c:Context){if(!['owner','admin'].includes(c.role))fail(403,'Cần quyền quản trị');}
export function writer(c:Context){if(c.role==='viewer')fail(403,'Tài khoản chỉ đọc');}
export function internal(value:unknown){const a=Buffer.from(typeof value==='string'?value:'');const b=Buffer.from(env.INTERNAL_SECRET);if(a.length!==b.length||!timingSafeEqual(a,b))fail(403,'Internal authorization required');}
