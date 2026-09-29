import {useLanguage} from '../i18n/LanguageProvider';
import React, {useEffect, useState} from 'react';
import {supabase} from '../lib/supabaseClient';
import {uploadModeratedMedia, moderateUploadedMedia, fetchMediaUploads} from '../services/videoUpload.js';
import {Images, UploadCloud, RefreshCw, Trash2, CheckCircle2, AlertTriangle, Music} from 'lucide-react';
import MediaModerationModal from './MediaModerationModal.jsx';
import {mediaProgress, runMediaBatch} from '../services/mediaUploadProgress.js';

export default function MemoryMediaEditor({tag, items, onChange, audio, onAudio, videoConsent=false, onBusy=()=>{}}){
  const {t}=useLanguage();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[statusText,setStatusText]=useState('');
  const [retryingPath,setRetryingPath]=useState('');
  const [uploadsMap,setUploadsMap]=useState({});
  const [jobs,setJobs]=useState({}),[batchCount,setBatchCount]=useState({completed:0,total:0});

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
    if(!busy)loadStatuses();
  },[tag,items.length,busy]);

  const uploadFile=async(file,index)=>{
    if(!file)return;
    const allowed=['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4'];
    if(!allowed.includes(file.type)||!file.size||file.size>50*1024*1024){
      throw new Error(`Tệp "${file.name}" không hợp lệ. Chọn ảnh JPEG/PNG/WebP, video MP4/WebM hoặc audio MP3/WAV/OGG/M4A, tối đa 50 MB.`);
    }
    const updateProgress=progress=>setJobs(previous=>({...previous,[index]:progress}));

    if(file.type.startsWith('audio/')){
      updateProgress(mediaProgress(file,'uploading'));
      const path=`${tag}/audio-${crypto.randomUUID()}.${file.type.split('/')[1]||'mp3'}`;
      const res=await supabase.storage.from('emoria-memory').upload(path,file,{upsert:false,contentType:file.type});
      if(res.error)throw res.error;
      return {audio:'storage://'+path};
    }

    // Moderate images and videos with Gemini AI
    setStatusText(`Đang tải & kiểm duyệt "${file.name}"...`);
    const uploaded=await uploadModeratedMedia(tag,file,videoConsent,'gallery',updateProgress);
    const type=file.type.startsWith('image/')?'image':'video';
    return {path:uploaded.path,type,caption:file.name};
  };

  const handleMultiUpload=async(files)=>{
    if(!files||!files.length||busy)return;
    let slots=30-items.length;
    const selected=files.filter(file=>file.type.startsWith('audio/')||slots-->0);
    const limitMessage=selected.length<files.length?t("Đã đạt giới hạn tối đa 30 media trong Bộ sưu tập.","The gallery has reached its 30-file limit."):'';
    const accepted=new Array(selected.length),failures=[];
    setError(limitMessage);setBusy(true);onBusy(true);setJobs({});
    setBatchCount({completed:0,total:selected.length});
    try{
      await runMediaBatch(selected,uploadFile,(result,index)=>{
        if(result.status==='fulfilled'){
          accepted[index]=result.value;
          if(result.value.audio){
            onAudio(accepted.filter(value=>value?.audio).at(-1).audio);
          }else{
            onChange([...items,...accepted.filter(value=>value&&!value.audio)]);
            setUploadsMap(previous=>({...previous,[result.value.path]:{status:'ready'}}));
          }
        }else{
          failures.push(`${selected[index].name}: ${result.reason.message}`);
          setError([limitMessage,...failures].filter(Boolean).join('\n'));
        }
        setJobs(previous=>{const next={...previous};delete next[index];return next;});
        setBatchCount(previous=>({...previous,completed:previous.completed+1}));
      });
    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);onBusy(false);setStatusText('');setJobs({});
    }
  };

  const retryItem=async(path)=>{
    if(!path||retryingPath)return;
    setRetryingPath(path);setError('');setBatchCount({completed:0,total:1});onBusy(true);
    try{
      await moderateUploadedMedia(tag,path,videoConsent,progress=>setJobs({retry:progress}));
      setUploadsMap(previous=>({...previous,[path]:{...previous[path],status:'ready',reason:''}}));
    }catch(err){
      setError(err.message);
    }finally{
      setRetryingPath('');setJobs({});onBusy(false);
    }
  };

  return (
    <fieldset disabled={busy||!!retryingPath} className="min-w-0 space-y-4 p-5 rounded-2xl bg-white/5 border border-white/15">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Images className="w-4 h-4 text-sky-400" />
            <p className="text-sky-300 text-xs uppercase tracking-widest font-semibold">{t("02 · Bộ Sưu Tập Kỷ Niệm (Gallery)","02 · Memory gallery")}</p>
          </div>
          <h3 className="font-serif text-xl text-white mt-1">{t("Ảnh, video & âm thanh riêng tư","Private photos, videos & audio")}</h3>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            {t("Các hình ảnh và video lưu niệm này được hiển thị trong kho lưu trữ riêng của kỷ vật. Cả ảnh và video đều được AI kiểm duyệt tự động để đảm bảo an toàn.","These photos and videos appear in your memory’s private gallery. Images and videos are automatically moderated by AI.")}
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
          <span className="text-xs font-semibold text-white">{t("Bấm để tải thêm Ảnh, Video hoặc Nhạc vào Gallery","Upload photos, videos or music to the gallery")}</span>
          <span className="text-[11px] text-slate-400 mt-0.5">{t("Chọn nhiều ảnh JPEG/PNG/WebP, video MP4/WebM hoặc audio (tối đa 50 MB)","Select JPEG/PNG/WebP images, MP4/WebM videos or audio (up to 50 MB)")}</span>
          <input
            aria-label={t("Tải media kỷ vật","Upload memory media")}
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
            <span>{statusText || t("Đang tải lên và kiểm duyệt với AI...","Uploading and moderating with AI...")}</span>
          </div>
        )}

        {error && <p role="alert" className="text-red-300 text-xs">{error}</p>}

        {audio?.startsWith('storage://') && (
          <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-200">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              <span>{t("Đã gắn bản ghi âm / nhạc nền riêng","Audio / background music attached")}</span>
            </div>
            <button
              type="button"
              className="text-red-300 hover:underline cursor-pointer"
              onClick={()=>onAudio('')}
            >
              {t("Gỡ audio","Remove audio")}
            </button>
          </div>
        )}
      </div>

      {/* Danh sách media đã gắn */}
      {items.length > 0 ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">{t("Danh sách phương tiện trong Gallery (","Gallery files (")}{items.length}):</p>
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
                      {m.type==='image'?t("Ảnh","Image"):'Video'}
                    </span>
                    <input
                      aria-label={t("Chú thích media","Media caption")}
                      className="store-input !mt-0 flex-1 text-xs py-1.5"
                      value={m.caption||''}
                      maxLength={500}
                      placeholder={t("Nhập chú thích cho ảnh/video này...","Add a caption for this photo/video...")}
                      onChange={e=>onChange(items.map((x,j)=>i===j?{...x,caption:e.target.value}:x))}
                    />
                  </div>

                  {/* Trạng thái kiểm duyệt từng media */}
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {isProcessing ? (
                      <span className="text-amber-300 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> {t("Đang duyệt","Reviewing")}
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
                        {t("Kiểm duyệt lại","Review again")}
                      </button>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t("Đã duyệt","Approved")}
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={!i}
                      aria-label={t("Đưa lên trước","Move earlier")}
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
                      aria-label={t("Gỡ tệp này","Remove this file")}
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
        <p className="text-xs text-slate-400 italic">{t("Chưa có ảnh hay video nào trong Bộ sưu tập Kỷ niệm.","No photos or videos in this gallery yet.")}</p>
      )}

      <p className="text-[11px] text-slate-400">
        {t("Tải xong, hãy bấm","After uploading, select")} <strong className="text-slate-200">{t("“Lưu thay đổi”","“Save changes”")}</strong> {t("ở cuối Studio để cập nhật cho người nhận.","at the bottom of Studio to update the recipient’s view.")}
      </p>

      {/* Pop-up chờ xử lý & kiểm duyệt AI */}
      <MediaModerationModal
        isOpen={busy || !!retryingPath}
        jobs={Object.values(jobs)}
        completed={batchCount.completed}
        total={batchCount.total}
        title={t("Đang tải lên & kiểm duyệt phương tiện","Uploading & moderating media")}
        detail={t("Vui lòng giữ tab này mở đến khi tải lên và kiểm duyệt hoàn tất.","Please keep this tab open until uploading and review finish.")}
      />
    </fieldset>
  );
}
