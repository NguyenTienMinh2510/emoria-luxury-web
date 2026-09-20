import React, {useEffect, useState} from 'react';
import {supabase} from '../lib/supabaseClient';
import {uploadModeratedMedia, moderateUploadedMedia, fetchMediaUploads} from '../services/videoUpload.js';
import {Images, UploadCloud, RefreshCw, Trash2, CheckCircle2, AlertTriangle, Music} from 'lucide-react';
import MediaModerationModal from './MediaModerationModal.jsx';

export default function MemoryMediaEditor({tag, items, onChange, audio, onAudio, videoConsent=false, onBusy=()=>{}}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[statusText,setStatusText]=useState('');
  const [retryingPath,setRetryingPath]=useState('');
  const [uploadsMap,setUploadsMap]=useState({});

  // Fetch moderation statuses for gallery media
  const loadStatuses=async()=>{
    try{
      const res=await fetchMediaUploads(tag);
      const map={};
      (res.uploads||[]).forEach(u=>{map[u.path]=u;});
      setUploadsMap(map);
    }catch(_){}
  };

  useEffect(()=>{
    loadStatuses();
  },[tag,items.length]);

  const uploadFile=async(file)=>{
    if(!file)return;
    const allowed=['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4'];
    if(!allowed.includes(file.type)||file.size>50*1024*1024){
      throw new Error(`Tệp "${file.name}" không hợp lệ. Chọn ảnh JPEG/PNG/WebP, video MP4/WebM hoặc audio MP3/WAV/OGG/M4A, tối đa 50 MB.`);
    }

    if(file.type.startsWith('audio/')){
      const path=`${tag}/audio-${crypto.randomUUID()}.${file.type.split('/')[1]||'mp3'}`;
      const res=await supabase.storage.from('emoria-memory').upload(path,file,{upsert:false,contentType:file.type});
      if(res.error)throw res.error;
      onAudio('storage://'+path);
      return;
    }

    // Moderate images and videos with Gemini AI
    setStatusText(`Đang tải & kiểm duyệt "${file.name}"...`);
    const uploaded=await uploadModeratedMedia(tag,file,videoConsent,'gallery');
    const type=file.type.startsWith('image/')?'image':'video';
    onChange([...items,{path:uploaded.path,type,caption:file.name}]);
  };

  const handleMultiUpload=async(files)=>{
    if(!files||!files.length||busy)return;
    setError('');setBusy(true);onBusy(true);
    try{
      for(const file of files){
        if(items.length>=30){
          setError('Đã đạt giới hạn tối đa 30 media trong Bộ sưu tập.');
          break;
        }
        await uploadFile(file);
      }
      await loadStatuses();
    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);onBusy(false);setStatusText('');
    }
  };

  const retryItem=async(path)=>{
    if(!path||retryingPath)return;
    setRetryingPath(path);setError('');
    try{
      await moderateUploadedMedia(tag,path,videoConsent);
      await loadStatuses();
    }catch(err){
      setError(err.message);
    }finally{
      setRetryingPath('');
    }
  };

  return (
    <section className="space-y-4 p-5 rounded-2xl bg-white/5 border border-white/15">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Images className="w-4 h-4 text-sky-400" />
            <p className="text-sky-300 text-xs uppercase tracking-widest font-semibold">02 · Bộ Sưu Tập Kỷ Niệm (Gallery)</p>
          </div>
          <h3 className="font-serif text-xl text-white mt-1">Ảnh, video & âm thanh riêng tư</h3>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            Các hình ảnh và video lưu niệm này được hiển thị trong kho lưu trữ riêng của kỷ vật. Cả ảnh và video đều được AI kiểm duyệt tự động để đảm bảo an toàn.
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-slate-300">
          {items.length}/30 media
        </span>
      </div>

      {/* Vùng tải lên media */}
      <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
        <label className="store-label !mb-0 flex flex-col items-center justify-center p-4 border border-dashed border-white/20 rounded-xl hover:border-sky-400/60 hover:bg-sky-500/5 transition cursor-pointer">
          <UploadCloud className="w-8 h-8 text-sky-400 mb-2" />
          <span className="text-xs font-semibold text-white">Bấm để tải thêm Ảnh, Video hoặc Nhạc vào Gallery</span>
          <span className="text-[11px] text-slate-400 mt-0.5">Chọn nhiều ảnh JPEG/PNG/WebP, video MP4/WebM hoặc audio (tối đa 50 MB)</span>
          <input
            aria-label="Tải media kỷ vật"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
            disabled={busy||items.length>=30}
            className="hidden"
            onChange={e=>{
              const files=[...(e.target.files||[])];
              e.target.value='';
              handleMultiUpload(files);
            }}
          />
        </label>

        {busy && (
          <div role="status" className="flex items-center gap-2 text-xs text-amber-200">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>{statusText || 'Đang tải lên và kiểm duyệt với Gemini AI...'}</span>
          </div>
        )}

        {error && <p role="alert" className="text-red-300 text-xs">{error}</p>}

        {audio?.startsWith('storage://') && (
          <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-200">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              <span>Đã gắn bản ghi âm / nhạc nền riêng</span>
            </div>
            <button
              type="button"
              className="text-red-300 hover:underline cursor-pointer"
              onClick={()=>onAudio('')}
            >
              Gỡ audio
            </button>
          </div>
        )}
      </div>

      {/* Danh sách media đã gắn */}
      {items.length > 0 ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">Danh sách phương tiện trong Gallery ({items.length}):</p>
          <div className="space-y-2">
            {items.map((m,i)=>{
              const upload=uploadsMap[m.path];
              const isReady=!upload||upload.status==='ready';
              const isFailed=upload&&(upload.status==='failed'||upload.status==='uploaded');
              const isRejected=upload&&upload.status==='rejected';
              const isProcessing=upload&&upload.status==='processing';

              return (
                <div key={m.path||i} className="p-3 rounded-xl bg-black/60 border border-white/10 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-slate-400 font-mono">
                      {m.type==='image'?'Ảnh':'Video'}
                    </span>
                    <input
                      aria-label="Chú thích media"
                      className="store-input !mt-0 flex-1 text-xs py-1.5"
                      value={m.caption||''}
                      maxLength={500}
                      placeholder="Nhập chú thích cho ảnh/video này..."
                      onChange={e=>onChange(items.map((x,j)=>i===j?{...x,caption:e.target.value}:x))}
                    />
                  </div>

                  {/* Trạng thái kiểm duyệt từng media */}
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {isProcessing ? (
                      <span className="text-amber-300 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Đang duyệt
                      </span>
                    ) : isRejected ? (
                      <span className="text-red-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Bị từ chối
                      </span>
                    ) : isFailed ? (
                      <button
                        type="button"
                        disabled={retryingPath===m.path||!videoConsent}
                        onClick={()=>retryItem(m.path)}
                        className="text-amber-200 hover:text-amber-100 flex items-center gap-1 underline cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${retryingPath===m.path?'animate-spin':''}`} />
                        Kiểm duyệt lại
                      </button>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Đã duyệt
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={!i}
                      aria-label="Đưa lên trước"
                      className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-30"
                      onClick={()=>{
                        const copy=[...items];
                        [copy[i],copy[i-1]]=[copy[i-1],copy[i]];
                        onChange(copy);
                      }}
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      aria-label="Gỡ tệp này"
                      className="px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 cursor-pointer"
                      onClick={()=>onChange(items.filter((_,j)=>i!==j))}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">Chưa có ảnh hay video nào trong Bộ sưu tập Kỷ niệm.</p>
      )}

      <p className="text-[11px] text-slate-400">
        Tải xong, hãy bấm <strong className="text-slate-200">“Lưu thay đổi”</strong> ở cuối Studio để cập nhật cho người nhận.
      </p>

      {/* Pop-up chờ xử lý & kiểm duyệt AI */}
      <MediaModerationModal
        isOpen={busy || !!retryingPath}
        title="Đang tải lên & kiểm duyệt phương tiện"
        detail="Hệ thống đang kiểm tra nội dung và tự động phân tích nhãn chủ đề cho ảnh/video. Quá trình xử lý thường chỉ mất vài giây, vui lòng giữ tab này mở..."
      />
    </section>
  );
}
