import React,{useState} from 'react';
import {supabase} from '../lib/supabaseClient';
export default function MemoryMediaEditor({tag,items,onChange,audio,onAudio,onBusy=()=>{}}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const upload=async(file)=>{
  if(!file||busy)return;setError('');setBusy(true);onBusy(true);
  try{
   const allowed=['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4'];
   if(!allowed.includes(file.type)||file.size>50*1024*1024)throw new Error('Chọn ảnh JPEG/PNG/WebP, video MP4/WebM hoặc audio MP3/WAV/OGG/M4A, tối đa 50 MB.');
   const path=`${tag}/${crypto.randomUUID()}`;const result=await supabase.storage.from('emoria-memory').upload(path,file,{upsert:false,contentType:file.type});if(result.error)throw result.error;
   if(file.type.startsWith('audio/'))onAudio('storage://'+path);
   else onChange([...items,{path,type:file.type.startsWith('image/')?'image':'video',caption:file.name}]);
  }catch(e){setError(e.message);}finally{setBusy(false);onBusy(false);}
 };
 return <div className="space-y-3 p-4 border border-white/15 rounded-xl"><h4 className="font-semibold">Ảnh, video & audio riêng tư</h4><input aria-label="Tải media kỷ vật" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4" disabled={busy||items.length>=30} onChange={e=>{upload(e.target.files[0]);e.target.value='';}}/><p className="text-xs text-slate-400">Tải xong, bấm Lưu thay đổi để gắn tệp vào kỷ vật. Tối đa 30 ảnh/video. URL xem có hạn 2 phút; bản đã tải xuống không thể thu hồi.</p>{busy&&<p role="status">Đang tải lên…</p>}{error&&<p role="alert" className="text-red-300">{error}</p>}{audio?.startsWith('storage://')&&<div className="text-xs">Đã chọn audio <button type="button" className="underline ml-3" onClick={()=>onAudio('')}>Gỡ audio</button></div>}{items.map((m,i)=><div className="flex gap-2 items-center" key={m.path}><input aria-label="Chú thích media" className="store-input !mt-0" value={m.caption||''} maxLength={500} onChange={e=>onChange(items.map((x,j)=>i===j?{...x,caption:e.target.value}:x))}/><button type="button" disabled={!i} aria-label="Đưa lên trước" onClick={()=>{const copy=[...items];[copy[i],copy[i-1]]=[copy[i-1],copy[i]];onChange(copy);}}>↑</button><button type="button" onClick={()=>onChange(items.filter((_,j)=>i!==j))}>Gỡ</button></div>)}</div>;
}
