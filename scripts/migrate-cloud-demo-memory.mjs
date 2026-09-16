import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
if(process.argv[2]!=='--apply')throw new Error('Explicit --apply required.');
const cloud=JSON.parse(fs.readFileSync('.local/cloud-service.json','utf8')),local=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
if(cloud.url!=='https://svbmupgifhafrehdfomx.supabase.co'||local.API_URL!=='http://127.0.0.1:55321')throw new Error('Unexpected source/destination.');
const options={auth:{persistSession:false,autoRefreshToken:false}},src=createClient(local.API_URL,local.SERVICE_ROLE_KEY,options),dst=createClient(cloud.url,cloud.serviceKey,options);
const good=async p=>{const r=await p;if(r.error)throw new Error(r.error.message);return r.data;};
const tag='emoria-lumen',adminId='d1d24f84-c326-4116-9da5-da3399fae0d4';
const target=await good(dst.from('memory_spaces').select('id,owner_id,intro_video_path').eq('tag_uid',tag).single());
const source=await good(src.from('memory_spaces').select('intro_video_path').eq('tag_uid',tag).single());
if(!target.owner_id)await good(dst.from('memory_spaces').update({owner_id:adminId,claim_code_hash:null}).eq('id',target.id).is('owner_id',null));
if(!target.intro_video_path&&source.intro_video_path){
 if(!source.intro_video_path.startsWith(tag+'/'))throw new Error('Invalid media ownership prefix.');
 const blob=await good(src.storage.from('emoria-memory').download(source.intro_video_path));
 // A unique path avoids replacing any existing Cloud media.
 const path=`${tag}/cloud-intro-${Date.now()}.${blob.type==='video/mp4'?'mp4':'webm'}`;
 await good(dst.storage.from('emoria-memory').upload(path,blob,{contentType:blob.type,upsert:false}));
 await good(dst.from('memory_spaces').update({intro_video_path:path}).eq('id',target.id).is('intro_video_path',null));
 console.log('Copied local demo intro video into private Cloud Storage. Existing Cloud letters/gallery/PIN preserved.');
}
console.log('Cloud Lumen is editable by the existing project admin; no local passwords or users copied.');
