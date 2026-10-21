import pg from 'pg';
import { env } from './config.js';
export const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:15,statement_timeout:15000});
export async function tx<T>(fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function audit(c:pg.PoolClient,t:string,u:string,a:string,id:string,detail:unknown={}){await c.query('INSERT INTO audit_logs(tenant_id,actor,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[t,u,a,id,JSON.stringify(detail)]);}
export async function event(c:pg.PoolClient,t:string,u:string,kind:string,id:string){await c.query('INSERT INTO outbox(tenant_id,actor,kind,record_id) VALUES($1,$2,$3,$4)',[t,u,kind,id]);}
