import React, {useEffect, useRef, useState} from 'react';
import {uploadModeratedVideo} from '../services/videoUpload.js';
import {inspectMovieFile, renderMemoryMovie, MOVIE_LIMITS} from '../services/memoryMovie';

export default function MemoryMovieEditor({tag, path, onChange, onBusy,videoConsent=false}) {
  const [clips,setClips]=useState([]),[music,setMusic]=useState(null),[keepAudio,setKeepAudio]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(0),[result,setResult]=useState(null),[preview,setPreview]=useState('');
  const urls=useRef(new Set()), abort=useRef(null), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;abort.current?.abort();urls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);
  const run=async action=>{if(busy)return;setBusy(true);onBusy(true);setError('');try{await action();}catch(e){if(mounted.current)setError(e.name==='AbortError'?'Đã hủy ghép video.':e.message);}finally{abort.current=null;onBusy(false);if(mounted.current)setBusy(false);}};
  const choose=async files=>run(async()=>{
    if(clips.length+files.length>MOVIE_LIMITS.files)throw new Error('Tối đa 12 cảnh.');
    const added=[];try{for(const file of files){const item=await inspectMovieFile(file);added.push(item);urls.current.add(item.url);}setClips(prev=>[...prev,...added]);}catch(e){added.forEach(c=>{URL.revokeObjectURL(c.url);urls.current.delete(c.url);});throw e;}
  });
  const upload=async file=>{
    if(!['video/mp4','video/webm'].includes(file?.type)||file.size>MOVIE_LIMITS.outputBytes)throw new Error('Video MP4/WebM tối đa 50 MB.');
    const next=await uploadModeratedVideo(tag,file,videoConsent);
    onChange(next);
  };
  const edit=(id,patch)=>setClips(prev=>prev.map(c=>c.id===id?{...c,...patch}:c));
  return <section className="p-5 rounded-2xl bg-white/5 border border-white/15 space-y-4">
    <div><p className="text-amber-200 text-xs uppercase tracking-widest">01 · Bộ phim mở quà</p><h3 className="font-serif text-xl mt-2">Câu chuyện của hai người</h3><p className="text-slate-400 text-sm mt-2">Người nhận xem video này khi mở NFC, rồi đến thư tay và nhạc. Bạn có thể tải bản đã dựng hoặc ghép ngay bên dưới.</p></div>
    <label className="store-label">Tải video đã dựng (MP4/WebM, tối đa 50 MB)<input disabled={busy} type="file" accept="video/mp4,video/webm" onChange={e=>{const file=e.target.files[0];e.target.value='';if(file)run(()=>upload(file));}}/></label>
    {path&&<p className="text-emerald-300">Đã chọn video mở đầu. <button type="button" disabled={busy} className="underline" onClick={()=>onChange('')}>Gỡ video</button></p>}
    <details><summary className="cursor-pointer font-semibold py-2">Ghép ảnh và clip thành một video</summary><div className="space-y-4 pt-3">
      <p className="text-xs text-slate-400">Tối đa 12 cảnh / 3 phút, xuất 720p. Thời gian xuất gần bằng thời lượng video; giữ tab đang mở. Tệp nguồn được xử lý trên thiết bị. Chỉ video kết quả được tải khi bạn chọn lưu.</p>
      <label className="store-label">Thêm ảnh hoặc clip<input multiple disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>{choose([...e.target.files]);e.target.value='';}}/></label>
      {clips.map((c,i)=><div key={c.id} className="p-3 rounded-xl bg-black/40 space-y-2"><div className="flex items-center gap-3">{c.kind==='image'?<img src={c.url} alt="" className="w-16 h-12 object-cover rounded"/>:<video src={c.url} muted preload="metadata" className="w-16 h-12 object-cover rounded"/>}<span className="truncate flex-1">{i+1}. {c.file.name}</span><button type="button" aria-label={`Đưa cảnh ${i+1} lên trước`} disabled={busy||!i} onClick={()=>setClips(prev=>{const next=[...prev];[next[i-1],next[i]]=[next[i],next[i-1]];return next;})}>↑</button><button type="button" disabled={busy} onClick={()=>setClips(prev=>prev.filter(x=>x.id!==c.id))}>Gỡ</button></div>
      <div className="grid grid-cols-2 gap-3">{c.kind==='image'?<label className="store-label">Hiển thị (giây)<input className="store-input" type="number" min="1" max="30" disabled={busy} value={c.seconds} onChange={e=>edit(c.id,{seconds:Number(e.target.value)})}/></label>:<>{[['start','Bắt đầu (giây)'],['end','Kết thúc (giây)']].map(([key,label])=><label className="store-label" key={key}>{label}<input type="number" className="store-input" min="0" max={c.duration} step="0.1" disabled={busy} value={c[key]} onChange={e=>edit(c.id,{[key]:Number(e.target.value)})}/></label>)}</>}</div><label className="store-label">Lời nhắn trên cảnh<input className="store-input" maxLength="100" disabled={busy} value={c.caption} onChange={e=>edit(c.id,{caption:e.target.value})}/></label></div>)}
      <label className="store-label">Nhạc nền (tùy chọn)<input type="file" accept="audio/*" disabled={busy} onChange={e=>{const f=e.target.files[0];if(f&&(!f.type.startsWith('audio/')||f.size>50*1024*1024)){setError('Nhạc tối đa 50 MB.');return;}setMusic(f||null);}}/></label>
      {music&&<button type="button" disabled={busy} onClick={()=>setMusic(null)}>Gỡ nhạc: {music.name}</button>}
      <label className="flex gap-2 items-center"><input type="checkbox" checked={keepAudio} disabled={busy} onChange={e=>setKeepAudio(e.target.checked)}/>Giữ tiếng gốc trong clip</label>
      <button type="button" disabled={busy||!clips.length} className="store-button" onClick={()=>run(async()=>{setProgress(0);abort.current=new AbortController();const file=await renderMemoryMovie(clips,{music,keepClipAudio:keepAudio,signal:abort.current.signal,onProgress:setProgress});if(!mounted.current)return;const url=URL.createObjectURL(file);urls.current.add(url);if(preview){URL.revokeObjectURL(preview);urls.current.delete(preview);}setResult(file);setPreview(url);})}>Ghép thành video</button>
      {busy&&<div role="status"><progress className="w-full" max="1" value={progress}/><p>Đang xử lý / kiểm duyệt · {Math.round(progress*100)}%</p><button type="button" onClick={()=>abort.current?.abort()}>Hủy ghép</button></div>}
      {result&&<div className="space-y-3"><video controls playsInline src={preview} className="w-full rounded-xl"/><p className="text-xs text-slate-400">Đã xuất {(result.size/1024/1024).toFixed(1)} MB. Xem lại trước khi gắn vào món quà.</p><a className="underline mr-4" href={preview} download={result.name}>Tải bản video</a><button type="button" disabled={busy} className="store-button" onClick={()=>run(()=>upload(result))}>Dùng làm video mở đầu</button></div>}
    </div></details>
    {error&&<p role="alert" className="text-red-300">{error}</p>}
    <p className="text-xs text-slate-400">Bấm “Lưu thay đổi” ở cuối Studio để người nhận thấy phiên bản mới.</p>
  </section>;
}
