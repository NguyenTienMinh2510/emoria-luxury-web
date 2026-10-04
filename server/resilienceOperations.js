import {eventAdmin} from './eventGateway.js';
import {processHouseJobs} from './houseModeration.js';
export async function runResilienceWorker({admin=eventAdmin(),processJobs=processHouseJobs}={}) {
 const deadline=Date.now()+150000;
 const call=async(name,args)=>{const {data,error}=await admin.rpc(name,args);if(error)throw new Error('WORKER_DATABASE_FAILED');return data;};
 const lease=await call('rpc_begin_resilience_worker');
 if(!lease?.allowed)return {running:true};
 let ok=false;
 try {
  const maintenance=await call('rpc_run_resilience_maintenance');
  const claimed=await call('rpc_claim_storage_cleanup',{p_limit:2});
  let removed=0;
  for(const item of claimed||[]) {
   // Only the DB's atomic claims may be deleted. Reference triggers block
   // attachment during the claim, and a failed Storage request releases it.
   const result=await admin.storage.from(item.bucket).remove([item.path]);
   if(result.error){await call('rpc_release_storage_cleanup',{p_bucket:item.bucket,p_path:item.path});continue;}
   const confirmed=await call('rpc_confirm_storage_deleted',{p_bucket:item.bucket,p_path:item.path});
   if(!confirmed?.success)throw new Error('WORKER_STORAGE_CONFIRM_FAILED');
   removed++;
  }
  const jobs=await processJobs({maxItems:1,deadline});
  ok=true;return {...maintenance,removed,jobs};
 }finally{await call('rpc_finish_resilience_worker',{p_lease:lease.lease_id,p_ok:ok});}
}
