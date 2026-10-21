import {pool,tx} from './db.js';
import {env} from './config.js';
let stopping=false;
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;});
while(!stopping){
 try{
 const e=await tx(async db=>{const r=(await db.query('SELECT id FROM outbox WHERE delivered_at IS NULL AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1')).rows[0];if(!r)return null;await db.query("UPDATE outbox SET attempts=attempts+1,available_at=now()+interval '60 seconds' WHERE id=$1",[r.id]);return r;});
 if(!e){await new Promise(r=>setTimeout(r,1500));continue;}
 try{const r=await fetch(env.N8N_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Internal-Secret':env.INTERNAL_SECRET},body:JSON.stringify({event_id:e.id}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('n8n HTTP '+r.status);
 const done=(await pool.query('SELECT delivered_at FROM outbox WHERE id=$1',[e.id])).rows[0];if(!done.delivered_at)throw Error('Workflow returned before delivery completed');
 }catch(e2){await pool.query("UPDATE outbox SET last_error=$2,available_at=now()+make_interval(secs=>LEAST(3600,5*power(2,LEAST(attempts,9)))::double precision) WHERE id=$1 AND delivered_at IS NULL",[e.id,String(e2).slice(0,500)]);}
 }catch(e){console.error('Worker iteration failed',String(e));await new Promise(r=>setTimeout(r,3000));}
}
await pool.end();
