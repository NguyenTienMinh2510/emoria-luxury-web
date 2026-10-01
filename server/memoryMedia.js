import {createClient} from '@supabase/supabase-js';

// Call only with the result of rpc_get_memory_view for this tag/caller/grant.
export async function signMemoryMedia(data, tag) {
  if (!data?.is_unlocked) throw Object.assign(new Error('Không có quyền xem media.'), {status:403});
  const paths=[...new Set([...(data.media_gallery||[]).map(m=>m.url),data.audio_url,data.intro_video_path?'storage://'+data.intro_video_path:null].filter(x=>x?.startsWith('storage://')).map(x=>x.slice(10)))];
  const moderatedPaths=[...(data.media_gallery||[]).filter(m=>['video','image'].includes(m.type)&&m.url?.startsWith('storage://')).map(m=>m.url.slice(10)),data.intro_video_path].filter(Boolean);
  const result={}, unavailable=[];
  let warning=null;
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return {urls:{},blocked:moderatedPaths,unavailable:paths,expires_in:120,warning:'Media tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc nội dung kỷ vật.'};
  const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const admin=createClient(base,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
  const allowed=new Set();
  if(moderatedPaths.length){
    const check=await admin.from('memory_video_labels').select('path').eq('tag',tag).eq('status','ready').in('path',moderatedPaths);
    // Fail closed for uploaded images/videos, preserving letters and audio.
    if(check.error)warning='Ảnh/video tạm thời chưa sẵn sàng để kiểm tra quyền xem. Các nội dung khác vẫn xem được.';
    else (check.data||[]).forEach(row=>allowed.add(row.path));
  }
  const blocked=moderatedPaths.filter(path=>!allowed.has(path));
  const verified=[];
  await Promise.all(paths.map(async path=>{
    if(path.length>200||!/^[-a-zA-Z0-9_./]+$/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')||path.split('/')[0]!==tag||blocked.includes(path)){unavailable.push(path);return;}
    try{
      if(!allowed.has(path)){
        // Editable gallery types must never let a disguised video bypass moderation.
        const info=await admin.storage.from('emoria-memory').info(path);
        const mime=info.data?.contentType||info.data?.metadata?.mimetype;
        if(info.error||!['audio/mpeg','audio/wav','audio/ogg','audio/mp4'].includes(mime))throw new Error('Unverified media');
      }
      verified.push(path);
    }catch{unavailable.push(path);warning='Một số media tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc nội dung kỷ vật.';}
  }));
  if(verified.length){
    try{
      const signed=await admin.storage.from('emoria-memory').createSignedUrls(verified,120);
      if(signed.error)throw signed.error;
      for(const row of signed.data||[]){
        if(verified.includes(row.path)&&!row.error&&row.signedUrl)result[row.path]=row.signedUrl;
      }
    }catch{/* Missing URLs stay unavailable; never issue an unsigned fallback. */}
    for(const path of verified)if(!result[path])unavailable.push(path);
    if(verified.some(path=>!result[path]))warning='Một số media tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc nội dung kỷ vật.';
  }
  return {urls:result,blocked,unavailable,warning,expires_in:120};
}
