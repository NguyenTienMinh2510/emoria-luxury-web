import {createClient} from '@supabase/supabase-js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.method!=='POST')return send(405,{error:'Method not allowed'});
 try{
  let body=req.body;if(!body){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(413,{error:'Yêu cầu quá lớn.'});}body=JSON.parse(raw);}if(typeof body==='string')body=JSON.parse(body);
  if(typeof body.tag!=='string'||body.tag.length>64)return send(400,{error:'Mã kỷ vật không hợp lệ.'});
  const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const caller=createClient(base,key,{auth:{persistSession:false},global:{headers:req.headers.authorization?{Authorization:req.headers.authorization}:{}}});
  const {data,error}=await caller.rpc('rpc_get_memory_view',{p_tag_uid:body.tag,p_grant_token:body.grant||null});
  if(error||!data?.is_unlocked)return send(403,{error:'Không có quyền xem media.'});
  const paths=[...new Set([...(data.media_gallery||[]).map(m=>m.url),data.audio_url,data.intro_video_path?'storage://'+data.intro_video_path:null].filter(x=>x?.startsWith('storage://')).map(x=>x.slice(10)))];
  const result={};
  const videoPaths=[...(data.media_gallery||[]).filter(m=>m.type==='video').map(m=>m.url?.replace(/^storage:\/\//,'')),data.intro_video_path].filter(Boolean);
  const unavailable=[];
  let warning=null;
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return send(200,{urls:{},blocked:videoPaths,unavailable:paths,expires_in:120,warning:'Media tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc nội dung kỷ vật.'});
  const admin=createClient(base,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
  const allowed=new Set();
  if(videoPaths.length){
    const check=await admin.from('memory_video_labels').select('path').eq('tag',body.tag).eq('status','ready').in('path',videoPaths);
    // Fail closed for video, but preserve letters/photos when moderation is unavailable.
    if(check.error)warning='Video tạm thời chưa sẵn sàng để kiểm tra quyền phát. Các nội dung khác vẫn xem được.';
    else check.data.forEach(row=>allowed.add(row.path));
  }
  const blocked=videoPaths.filter(path=>!allowed.has(path));
  await Promise.all(paths.map(async path=>{
    if(path.split('/')[0]!==body.tag||blocked.includes(path)){unavailable.push(path);return;}
    try{
      if(!allowed.has(path)){
        // Gallery types are editable; never let a video disguised as an image bypass moderation.
        const info=await admin.storage.from('emoria-memory').info(path);
        const mime=info.data?.contentType||info.data?.metadata?.mimetype;
        if(info.error||!['image/jpeg','image/png','image/webp','audio/mpeg','audio/wav','audio/ogg','audio/mp4'].includes(mime))throw new Error('Unverified media');
      }
      const signed=await admin.storage.from('emoria-memory').createSignedUrl(path,120);
      if(signed.error||!signed.data?.signedUrl)throw new Error('Unavailable');
      result[path]=signed.data.signedUrl;
    }catch{unavailable.push(path);warning='Một số media tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc nội dung kỷ vật.';}
  }));
  send(200,{urls:result,blocked,unavailable,warning,expires_in:120});
 }catch{send(503,{error:'Không thể mở media. Kiểm tra cấu hình Storage của server.'});}
}
