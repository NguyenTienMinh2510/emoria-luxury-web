import {createClient} from '@supabase/supabase-js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.method!=='POST')return send(405,{error:'Method not allowed'});
 try{
  let body=req.body;if(!body){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(413,{error:'Yêu cầu quá lớn.'});}body=JSON.parse(raw);}if(typeof body==='string')body=JSON.parse(body);
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>4096||typeof body.tag!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.tag))return send(400,{error:'Mã kỷ vật không hợp lệ.'});
  const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const caller=createClient(base,key,{auth:{persistSession:false},global:{headers:req.headers.authorization?{Authorization:req.headers.authorization}:{},fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
  const {data,error}=await caller.rpc('rpc_get_memory_view',{p_tag_uid:body.tag,p_grant_token:body.grant||null});
  if(error||!data?.is_unlocked)return send(403,{error:'Không có quyền xem media.'});
  const paths=[...new Set([...(data.media_gallery||[]).map(m=>m.url),data.audio_url,data.intro_video_path?'storage://'+data.intro_video_path:null].filter(x=>x?.startsWith('storage://')).map(x=>x.slice(10)))];
  const result={};
  const moderatedPaths=[...(data.media_gallery||[]).filter(m=>['video','image'].includes(m.type)&&m.url?.startsWith('storage://')).map(m=>m.url?.replace(/^storage:\/\//,'')),data.intro_video_path].filter(Boolean);
  const unavailable=[];
  let warning=null;
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return send(200,{urls:{},blocked:moderatedPaths,unavailable:paths,expires_in:120,warning:'Media tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc nội dung kỷ vật.'});
  const admin=createClient(base,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
  const allowed=new Set();
  if(moderatedPaths.length){
    const check=await admin.from('memory_video_labels').select('path').eq('tag',body.tag).eq('status','ready').in('path',moderatedPaths);
    // Fail closed for uploaded images/videos, preserving letters and audio when moderation is unavailable.
    if(check.error)warning='Ảnh/video tạm thời chưa sẵn sàng để kiểm tra quyền xem. Các nội dung khác vẫn xem được.';
    else check.data.forEach(row=>allowed.add(row.path));
  }
  const blocked=moderatedPaths.filter(path=>!allowed.has(path));
  await Promise.all(paths.map(async path=>{
    if(path.length>200||!/^[-a-zA-Z0-9_./]+$/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')||path.split('/')[0]!==body.tag||blocked.includes(path)){unavailable.push(path);return;}
    try{
      if(!allowed.has(path)){
        // Gallery types are editable; never let a video disguised as an image bypass moderation.
        const info=await admin.storage.from('emoria-memory').info(path);
        const mime=info.data?.contentType||info.data?.metadata?.mimetype;
        if(info.error||!['audio/mpeg','audio/wav','audio/ogg','audio/mp4'].includes(mime))throw new Error('Unverified media');
      }
      const signed=await admin.storage.from('emoria-memory').createSignedUrl(path,120);
      if(signed.error||!signed.data?.signedUrl)throw new Error('Unavailable');
      result[path]=signed.data.signedUrl;
    }catch{unavailable.push(path);warning='Một số media tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc nội dung kỷ vật.';}
  }));
  send(200,{urls:result,blocked,unavailable,warning,expires_in:120});
 }catch{send(503,{error:'Không thể mở media. Kiểm tra cấu hình Storage của server.'});}
}
