import assert from 'node:assert/strict';
import {runResilienceWorker} from '../server/resilienceOperations.js';
import handler from '../api/resilience-worker.js';
const calls=[];
const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='rpc_begin_resilience_worker'?{allowed:true,lease_id:'owned-lease'}:name==='rpc_claim_storage_cleanup'?[{bucket:'emoria-event-media',path:'claimed-only'}]:name==='rpc_confirm_storage_deleted'?{success:true}:{expired_orders:1}};},storage:{from:bucket=>({remove:async paths=>{assert.equal(bucket,'emoria-event-media');assert.deepEqual(paths,['claimed-only']);return {error:null};}})}};
const result=await runResilienceWorker({admin,processJobs:async()=>({processed:1})});assert.equal(result.removed,1);assert.equal(result.jobs.processed,1);assert.deepEqual(calls.at(-1),{name:'rpc_finish_resilience_worker',args:{p_lease:'owned-lease',p_ok:true}});
calls.length=0;admin.storage.from=()=>({remove:async()=>({error:{message:'fixture failure'}})});
assert.equal((await runResilienceWorker({admin,processJobs:async()=>({processed:0})})).removed,0);assert.ok(calls.some(c=>c.name==='rpc_release_storage_cleanup'));assert.ok(!calls.some(c=>c.name==='rpc_confirm_storage_deleted'));
calls.length=0;await assert.rejects(runResilienceWorker({admin,processJobs:async()=>{throw new Error('fixture');}}));assert.equal(calls.at(-1).args.p_ok,false);
const busy={rpc:async()=>({data:{allowed:false}})};let processed=false;assert.deepEqual(await runResilienceWorker({admin:busy,processJobs:async()=>{processed=true;}}),{running:true});assert.equal(processed,false);
const saved=process.env.RESILIENCE_WORKER_SECRET;process.env.RESILIENCE_WORKER_SECRET='a'.repeat(64);
for(const authorization of [undefined,'Bearer wrong','Bearer '+'a'.repeat(65)]){const res={setHeader(){},end(body){this.body=JSON.parse(body);}};await handler({method:'POST',headers:{authorization}},res);assert.equal(res.statusCode,401);}
if(saved===undefined)delete process.env.RESILIENCE_WORKER_SECRET;else process.env.RESILIENCE_WORKER_SECRET=saved;
console.log('PASS worker ownership lease, guarded Storage deletion/release, failure health and unauthenticated rejection.');
