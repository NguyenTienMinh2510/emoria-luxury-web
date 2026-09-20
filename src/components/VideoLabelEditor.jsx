import React,{useEffect,useState} from 'react';
import {apiRequest} from '../services/apiClient.js';
import {moderateUploadedVideo} from '../services/videoUpload.js';

export default function VideoLabelEditor({tag,items,introPath,consent=false,refreshKey,onApproved,onBusy=()=>{}}) {
  const [uploads,setUploads]=useState([]),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const videos=[...items.filter(m=>m.type==='video'),...(introPath&&!items.some(m=>m.path===introPath)?[{path:introPath,type:'video',caption:'Bộ phim mở quà'}]:[])];
  const fetchUploads=()=>apiRequest(`/memories/${encodeURIComponent(tag)}/video-uploads`);
  const load=async(keepMessage=false)=>{try{const r=await fetchUploads();setUploads(r.uploads||[]);if(!keepMessage)setMessage(r.warning||'');}catch(e){setMessage(e.message);}};
  useEffect(()=>{let active=true;fetchUploads().then(r=>{if(active){setUploads(r.uploads||[]);setMessage(r.warning||'');}}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[tag,refreshKey]);
  const analyze=async path=>{
    setBusy(path);onBusy(true);setMessage('Đang kiểm duyệt video… Có thể mất khoảng 2–3 phút.');
    try{await moderateUploadedVideo(tag,path,consent);setMessage('Video đã đạt kiểm duyệt.');}
    catch(error){setMessage(error.message);}finally{await load(true);setBusy('');onBusy(false);}
  };
  return <section className="p-4 border border-white/15 rounded-xl space-y-3">
    <h4 className="font-semibold">Kết quả kiểm duyệt video</h4>
    <p className="text-xs text-slate-400">Video mới tự động được kiểm duyệt khi tải lên. Chỉ video đạt kiểm duyệt được gắn vào kỷ vật. Lỗi kỹ thuật không bị tính là vi phạm.</p>
    <button type="button" className="underline text-sm" disabled={!!busy} onClick={()=>load()}>Làm mới kết quả tải lên</button>
    {uploads.map(upload=>{
      const attached=videos.some(v=>v.path===upload.path);
      const ready=upload.status==='ready';
      const retryable=['uploaded','failed','processing'].includes(upload.status)||upload.policy_version===0;
      return <div key={upload.path} className="border border-white/10 p-3 rounded-lg text-sm space-y-2">
        <p className="text-xs text-slate-400 break-all">{upload.path}</p>
        <p>{upload.status==='rejected'?'Bị từ chối':upload.status==='failed'?'Lỗi kỹ thuật · chưa duyệt':upload.status==='processing'?'Đang kiểm duyệt':ready?(upload.policy_version===0?'Video cũ · chưa được kiểm duyệt':'Đã đạt kiểm duyệt'):'Chờ kiểm duyệt'}</p>
        {upload.reason&&<p role="status" className={upload.status==='rejected'?'text-red-300':'text-amber-200'}>{upload.reason}</p>}
        {retryable&&<button type="button" className="store-button" disabled={!consent||!!busy} onClick={()=>analyze(upload.path)}>Kiểm duyệt lại</button>}
        {ready&&!attached&&onApproved&&<button type="button" className="store-button" disabled={!!busy||items.length>=30} onClick={()=>onApproved(upload.path)}>Thêm video đã duyệt vào kỷ vật</button>}
      </div>;
    })}
    {message&&<p role="status" className="text-sm text-slate-300">{message}</p>}
  </section>;
}
