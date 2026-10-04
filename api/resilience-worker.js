import {timingSafeEqual} from 'node:crypto';
import {runResilienceWorker} from '../server/resilienceOperations.js';
import {eventAdmin} from '../server/eventGateway.js';
export default async function handler(req,res) {
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 const expected=process.env.RESILIENCE_WORKER_SECRET,actual=String(req.headers.authorization||'');
 const a=Buffer.from(actual),b=Buffer.from(`Bearer ${expected||''}`);
 if(!expected||a.length!==b.length||!timingSafeEqual(a,b))return send(401,{error:'Unauthorized'});
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(405,{error:'Method not allowed'});}
 try {
  if(req.method==='GET') {const {data,error}=await eventAdmin().rpc('rpc_resilience_health');if(error)throw error;return send(data?.worker_healthy?200:503,data);}
  return send(200,await runResilienceWorker());
 }catch{console.error('[Resilience worker] failed');return send(503,{error:'Worker unavailable'});}
}
