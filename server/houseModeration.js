import {labelWithQwen} from './aiService.js';
import {eventAdmin} from './eventGateway.js';
import {housePreviewPath,readHousePhoto} from './housePreview.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const db=async query=>{const {data,error}=await query;if(error)throw fail(error.code==='42501'?403:503,'Chưa xử lý được lượt xuất bản. Hãy thử lại.');return data;};
export async function enqueueHousePublish(c,tag) {
  return c.db(eventAdmin().rpc('rpc_enqueue_house_publish',{p_tag:tag,p_owner:c.user.id}));
}
export async function readHousePublishJob(c,jobId) {
  return c.db(eventAdmin().rpc('rpc_house_publish_job_status',{p_job:jobId,p_owner:c.user.id}));
}

// Cron and explicit owner retries share durable leases; leaving the page never
// loses progress or starts duplicate AI. Each invocation has a strict time budget.
export async function processHouseJobs({maxItems=1,deadline=Date.now()+150000,jobId=null}={}) {
  const admin=eventAdmin(),summary={processed:0,published:0,waiting:false};
  for(let i=0;i<Math.min(2,Math.max(1,maxItems));i++){
    if(deadline-Date.now()<30000)break;
    const task=await db(admin.rpc('rpc_claim_house_publish_task',{p_job:jobId}));
    if(!task||task.kind==='idle'){summary.waiting=true;summary.retry_after=task?.retry_after||5;break;}
    if(task.kind==='publish'){
      await db(admin.rpc('rpc_complete_house_publish_job',{p_job:task.job_id}));
      summary.published++;summary.processed++;continue;
    }
    let result;
    try {
      const signed=await db(admin.storage.from('emoria-event-media').createSignedUrl(task.path,180));
      result=await labelWithQwen(null,{url:signed.signedUrl,type:'image',timeoutMs:Math.min(120000,deadline-Date.now()-15000)});
    } catch(error) {
      console.warn('[House review deferred]',{status:error.status||503,name:error.name});
      result=error.status===422?{invalid_media:true,reason:error.message}:{technical_error:true};
    }
    const progress=await db(admin.rpc('rpc_finish_house_publish_task',{p_job:task.job_id,p_path:task.path,p_request:task.request_id,p_result:result}));
    summary.processed++;
    if(progress.completed===progress.total&&progress.status!=='failed'&&progress.status!=='superseded'){
      await db(admin.rpc('rpc_complete_house_publish_job',{p_job:task.job_id}));
      summary.published++;
    }
  }
  return summary;
}

// Isolated local fixtures only. Production publishes exclusively use durable jobs.
export async function moderateHousePhotos(c,tag,suppliedDraft) {
  if(process.env.NODE_ENV!=='test'&&!(process.env.SUPABASE_URL||'').startsWith('http://127.0.0.1:'))throw fail(503,'Xuất bản cần chạy qua hàng đợi kiểm duyệt.');
  const preview=housePreviewPath(suppliedDraft?.rooms);
  const paths=[...new Set([preview,...(suppliedDraft?.rooms||[]).flatMap(room=>(room.memories||[]).map(memory=>memory.photo_path))].filter(Boolean))];
  const admin=eventAdmin();
  for(const path of paths){
    const namespace=await admin.rpc('rpc_house_photo_review_namespace',{p_tag:tag,p_path:path});
    if(namespace.error||namespace.data!==true)throw fail(422,'Ảnh phải thuộc đúng kho ngôi nhà.');
    const photo=await readHousePhoto(path,tag,admin,path===preview?2097152:8388608);
    await db(admin.from('house_photo_reviews').upsert({tag,path,content_version:photo.version,requested_by:c.user.id,request_id:crypto.randomUUID(),status:'ready',violations:[],model:'local-preview',policy_version:1,reviewed_at:new Date().toISOString()},{onConflict:'path'}));
  }
}
