import {createClient} from '@supabase/supabase-js';
import {labelVideo} from './geminiVideo.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const serverClient=()=>{
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw fail(503,'Server chưa cấu hình phân tích video.');
  return createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})}});
};
// The REST router authenticates and checks the admin role before this handler.
export async function readVideoLabels(c) {
  const rows=await c.db(serverClient().from('memory_video_labels').select('path,labels,status,violations,reason').eq('tag',c.params[0]).order('started_at',{ascending:false}).limit(100));
  return {labels:Object.fromEntries(rows.map(row=>[row.path,row.labels])),uploads:rows};
}
export async function readVideoUploads(c) {
  const tag=c.params[0];
  const view=await c.db(c.client.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:null}));
  if(!view.is_owner||!view.is_unlocked)throw fail(403,'Chỉ chủ sở hữu được xem kết quả tải video.');
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return {uploads:[],warning:'Chức năng kiểm duyệt chưa được cấu hình.'};
  const includeLabels=view.is_admin===true&&(c.query.get('include_labels')==='1'||c.query.get('include_labels')==='true');
  const columns=includeLabels?'path,status,labels,reason,policy_version,started_at':'path,status,reason,policy_version,started_at';
  const result=await serverClient().from('memory_video_labels').select(columns).eq('tag',tag).order('started_at',{ascending:false}).limit(100);
  if(['42P01','PGRST205'].includes(result.error?.code))return {uploads:[],warning:'Chức năng kiểm duyệt đang chờ cập nhật dữ liệu.'};
  return {uploads:await c.db(Promise.resolve(result))};
}
// Never expose internal topic/violation codes, model metadata or cached payloads to buyers.
const publicResult=(result,includeLabels=false)=>({
  approved:result.approved===true,
  ...(includeLabels&&result.labels?{labels:result.labels}:{}),
  reason:result.approved===true?null:result.reason||'Phương tiện chưa đạt kiểm duyệt.'
});
export async function analyzeVideo(c) {
  const tag=c.params[0],path=c.body.path;
  if(c.body.consent!==true)throw fail(400,'Cần đồng ý gửi phương tiện này cho Google Gemini để phân tích.');
  if(typeof path!=='string'||path.length>200||!path.startsWith(tag+'/')||path.includes('..')||!/^[-a-zA-Z0-9_./]+$/.test(path))throw fail(422,'Đường dẫn phương tiện không hợp lệ.');
  const view=await c.db(c.client.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:null}));
  if(!view.is_owner||!view.is_unlocked)throw fail(403,'Chỉ chủ sở hữu được gửi phương tiện cho AI.');
  const key=process.env.GEMINI_API_KEY;
  if(!key)throw fail(503,'Chưa cấu hình GEMINI_API_KEY trên server.');
  const client=serverClient();
  const lease=await c.db(client.rpc('reserve_video_labels',{p_user:c.user.id,p_tag:tag,p_path:path}));
  if(lease.cached)return publicResult(lease,view.is_admin===true&&c.body.include_labels===true);
  try {
    const download=await client.storage.from('emoria-memory').download(path);
    if(download.error)throw fail(422,'Không thể đọc phương tiện đã tải lên.');
    const result=await labelVideo(download.data,key);
    // Recheck ownership after the external request before retaining private derived data.
    const current=await c.db(c.client.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:null}));
    if(!current.is_owner||!current.is_unlocked)throw fail(403,'Quyền sở hữu kỷ vật đã thay đổi.');
    const saved=await c.db(client.from('memory_video_labels').update({status:result.approved?'ready':'rejected',labels:result.labels,violations:result.violations,reason:result.reason,model:result.model,policy_version:1}).eq('path',path).eq('request_id',lease.request_id).select('path'));
    if(!saved.length)throw fail(409,'Lượt phân tích đã hết hạn. Hãy tải lại nhãn.');
    if(!result.approved){
      const removed=await client.storage.from('emoria-memory').remove([path]);
      if(removed.error)console.warn('Rejected media cleanup pending');
    }
    return publicResult(result,view.is_admin===true&&c.body.include_labels===true);
  }catch(error){
    await client.from('memory_video_labels').update({status:'failed',reason:'Chưa hoàn tất kiểm duyệt do lỗi kỹ thuật; không kết luận vi phạm.'}).eq('path',path).eq('request_id',lease.request_id).eq('status','processing');
    throw error.status?error:fail(503,'Kiểm duyệt bị gián đoạn. Phương tiện chưa được sử dụng; hãy thử lại sau.');
  }
}
