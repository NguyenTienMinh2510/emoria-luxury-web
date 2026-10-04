import {createClient} from '@supabase/supabase-js';
import {signMemoryMedia} from '../server/memoryMedia.js';
import {admitGateway,requestIp} from '../server/eventGateway.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.method!=='POST')return send(405,{error:'Method not allowed'});
 try{
  let body=req.body;if(!body){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(413,{error:'Yêu cầu quá lớn.'});}body=JSON.parse(raw);}if(typeof body==='string')body=JSON.parse(body);
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>4096||typeof body.tag!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.tag))return send(400,{error:'Mã kỷ vật không hợp lệ.'});
  await admitGateway({ip:requestIp(req)},'memory_media');
  const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const caller=createClient(base,key,{auth:{persistSession:false},global:{headers:req.headers.authorization?{Authorization:req.headers.authorization}:{},fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
  const {data,error}=await caller.rpc('rpc_get_memory_view',{p_tag_uid:body.tag,p_grant_token:body.grant||null});
  if(error||!data?.is_unlocked)return send(403,{error:'Không có quyền xem media.'});
  send(200,await signMemoryMedia(data,body.tag));
 }catch(error){if(error.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));send(error.status||503,{error:error.status?error.message:'Không thể mở media. Kiểm tra cấu hình Storage của server.'});}
}
