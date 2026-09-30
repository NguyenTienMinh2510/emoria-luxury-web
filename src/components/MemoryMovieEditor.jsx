import {useLanguage} from '../i18n/LanguageProvider';
import React, {useEffect, useRef, useState} from 'react';
import {supabase} from '../lib/supabaseClient.js';
import {uploadModeratedMedia, moderateUploadedMedia, fetchMediaUploads} from '../services/videoUpload.js';
import {inspectMovieFile, renderMemoryMovie, MOVIE_LIMITS} from '../services/memoryMovie';
import {UploadCloud, RefreshCw, Trash2, CheckCircle2, AlertTriangle, Film} from 'lucide-react';
import MediaModerationModal from './MediaModerationModal.jsx';
import { triggerAiWarmup } from '../services/aiWarmup.js';

export default function MemoryMovieEditor({tag, path, onChange, onBusy, videoConsent=false, onAddToGallery}) {
  const {t}=useLanguage();
  const [clips,setClips]=useState([]),[music,setMusic]=useState(null),[keepAudio,setKeepAudio]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(0),[result,setResult]=useState(null),[preview,setPreview]=useState('');
  const [isDragging,setIsDragging]=useState(false);
  const [modInfo,setModInfo]=useState({status:'',labels:[],reason:''});
  const [videoUrl,setVideoUrl]=useState('');
  const [retrying,setRetrying]=useState(false);
  const [gallerySuccess,setGallerySuccess]=useState('');
  const [uploadProgress,setUploadProgress]=useState(null);
  const [pendingPath,setPendingPath]=useState('');
  useEffect(()=>setPendingPath(''),[tag]);

  // Đánh thức GPU container ngầm ngay khi mở Movie Editor
  useEffect(() => {
    triggerAiWarmup();
  }, []);

  const urls=useRef(new Set()), abort=useRef(null), mounted=useRef(true);

  useEffect(()=>{
    mounted.current=true;
    return()=>{
      mounted.current=false;
      abort.current?.abort();
      urls.current.forEach(url=>URL.revokeObjectURL(url));
    };
  },[]);

  // Load moderation status and signed URL whenever path changes
  useEffect(()=>{
    let active=true;
    if(!path){
      setVideoUrl('');
      setModInfo({status:'',labels:[],reason:''});
      return;
    }
    // Fetch moderation labels
    fetchMediaUploads(tag).then(res=>{
      if(!active)return;
      const found=(res.uploads||[]).find(u=>u.path===path);
      if(found){
        setModInfo({
          status:found.status||'ready',
          labels:found.labels||[],
          reason:found.reason||''
        });
      }
    }).catch(()=>{});

    // Create preview signed URL if needed
    supabase.storage.from('emoria-memory').createSignedUrl(path,3600).then(({data,error})=>{
      if(active&&data?.signedUrl&&!error){
        setVideoUrl(data.signedUrl);
      }
    }).catch(()=>{});

    return()=>{active=false;};
  },[tag,path]);

  const run=async action=>{
    if(busy)return;
    setBusy(true);onBusy?.(true);setError('');setGallerySuccess('');
    try{await action();}
    catch(e){if(mounted.current)setError(e.name==='AbortError'?t("Đã hủy ghép video.","Video assembly cancelled."):e.message);}
    finally{abort.current=null;onBusy?.(false);if(mounted.current){setBusy(false);setUploadProgress(null);}}
  };

  const handleUploadFile=async file=>{
    if(!file)return;
    if(!['video/mp4','video/webm'].includes(file.type)||file.size>MOVIE_LIMITS.outputBytes){
      throw new Error(t("Video phải là định dạng MP4 hoặc WebM, dung lượng tối đa 50 MB.","Choose an MP4 or WebM video, up to 50 MB."));
    }
    let uploaded;
    try { uploaded=await uploadModeratedMedia(tag,file,videoConsent,'intro',setUploadProgress); }
    catch(error) { if(error.uploadedPath)setPendingPath(error.uploadedPath);throw error; }
    setPendingPath('');
    onChange(uploaded.path);
    setModInfo({
      status:uploaded.approved?'ready':'rejected',
      labels:uploaded.labels||[],
      reason:uploaded.reason||''
    });
  };

  const handleRetryModeration=async()=>{
    const reviewPath=pendingPath||path;
    if(!reviewPath||retrying)return;
    setRetrying(true);setError('');onBusy?.(true);
    try{
      const res=await moderateUploadedMedia(tag,reviewPath,videoConsent,setUploadProgress);
      if(pendingPath){onChange(reviewPath);setPendingPath('');}
      setModInfo({
        status:res.approved?'ready':'rejected',
        labels:res.labels||[],
        reason:res.reason||''
      });
    }catch(err){
      if(err.code==='MEDIA_REJECTED')setPendingPath('');
      setError(err.message);
    }finally{
      setRetrying(false);setUploadProgress(null);onBusy?.(false);
    }
  };

  const handleDrop=e=>{
    e.preventDefault();
    setIsDragging(false);
    const file=e.dataTransfer?.files?.[0];
    if(file)run(()=>handleUploadFile(file));
  };

  const chooseClips=async files=>run(async()=>{
    if(clips.length+files.length>MOVIE_LIMITS.files)throw new Error(t("Tối đa 12 cảnh.","Up to 12 scenes."));
    const added=[];
    try{
      for(const file of files){
        const item=await inspectMovieFile(file);
        added.push(item);
        urls.current.add(item.url);
      }
      setClips(prev=>[...prev,...added]);
    }catch(e){
      added.forEach(c=>{URL.revokeObjectURL(c.url);urls.current.delete(c.url);});
      throw e;
    }
  });

  const editClip=(id,patch)=>setClips(prev=>prev.map(c=>c.id===id?{...c,...patch}:c));

  const handleAddRenderedToGallery=async()=>{
    if(!result)return;
    run(async()=>{
      const uploaded=await uploadModeratedMedia(tag,result,videoConsent,'gallery',setUploadProgress);
      if(onAddToGallery){
        onAddToGallery({
          path:uploaded.path,
          type:'video',
          caption:result.name||'Phim kỷ niệm từ ảnh'
        });
      }
      setGallerySuccess(t("Đã thêm video vào Bộ sưu tập Kỷ niệm thành công!","Video added to the memory gallery!"));
    });
  };

  return (
    <section className="p-5 rounded-2xl bg-white/5 border border-white/15 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-amber-300" />
            <p className="text-amber-200 text-xs uppercase tracking-widest font-semibold">{t("01 · Video Đại Diện Mở Thư","01 · Opening video")}</p>
          </div>
          <h3 className="font-serif text-xl text-white mt-1">{t("Khoảnh khắc đặc biệt (Intro Movie)","Your opening film")}</h3>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            {t("Video này sẽ phát một lần khi người nhận mở thư/hộp kỷ niệm. Chỉ có","This video plays before the recipient opens the letters. There is")} <strong className="text-slate-200">{t("duy nhất 1 video đại diện","only one opening video")}</strong>{t("; nếu tải video mới sẽ tự động thay thế video cũ.","; uploading a new video replaces the previous one.")}
          </p>
        </div>
      </div>

      {pendingPath&&<div className="rounded-xl border border-amber-400/30 p-3 space-y-2">
        <p role="status" className="text-xs text-amber-200">{t('Tệp đã tải lên nhưng chưa hoàn tất kiểm duyệt. Bạn có thể thử lại mà không cần tải tệp lên lần nữa.','Your file is uploaded but review is incomplete. Retry without uploading it again.')}</p>
        <button type="button" className="store-button" disabled={!videoConsent||busy||retrying} onClick={handleRetryModeration}>{t('Thử lại kiểm duyệt','Retry review')}</button>
      </div>}

      {/* KHU VỰC 1: VIDEO ĐẠI DIỆN ĐANG SỬ DỤNG */}
      {path ? (
        <div className="p-4 rounded-xl bg-black/60 border border-white/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-slate-200">{t("Video đại diện hiện tại","Current opening video")}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy||retrying}
                className="text-xs text-red-300 hover:text-red-200 flex items-center gap-1 hover:underline cursor-pointer"
                onClick={()=>onChange('')}
              >
                <Trash2 className="w-3.5 h-3.5" /> {t("Gỡ video","Remove video")}
              </button>
            </div>
          </div>

          {/* Trình phát xem trước */}
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-56 rounded-lg bg-black object-contain border border-white/10"
            />
          )}

          <p className="text-[11px] text-slate-400 font-mono break-all">{path}</p>

          {/* Trạng thái kiểm duyệt & Nhãn AI */}
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                {modInfo.status==='ready' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t("Đã kiểm duyệt an toàn","Approved")}
                  </span>
                ) : modInfo.status==='rejected' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" /> {t("Bị từ chối kiểm duyệt","Rejected")}
                  </span>
                ) : modInfo.status==='processing' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t("Đang kiểm duyệt với AI...","Reviewing with AI...")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-700/50 border border-white/10 text-amber-200 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" /> {t("Chưa hoàn tất kiểm duyệt","Review incomplete")}
                  </span>
                )}
              </div>

              {/* Nút Thử lại / Kiểm duyệt lại trực tiếp */}
              {(modInfo.status!=='ready'||retrying) && (
                <button
                  type="button"
                  disabled={!videoConsent||busy||retrying}
                  onClick={handleRetryModeration}
                  className="px-3 py-1 rounded-lg text-xs bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-200 font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retrying?'animate-spin':''}`} />
                  {retrying ? t("Đang thử lại...","Retrying...") : t("Kiểm duyệt lại với AI","Retry AI review")}
                </button>
              )}
            </div>

            {/* Hiển thị lý do nếu bị từ chối hoặc có thông báo */}
            {modInfo.reason && (
              <p className={`text-xs ${modInfo.status==='rejected'?'text-red-300':'text-amber-200'}`}>
                {modInfo.reason}
              </p>
            )}

            {/* Nhãn AI do Model trả về trực tiếp */}
            {modInfo.labels && modInfo.labels.length > 0 && (
              <div className="pt-1">
                <div className="mb-1.5">
                  <span className="text-[11px] font-semibold text-amber-200 uppercase tracking-wider">
                    {t("Chủ đề kỷ vật:","Memory topics:")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modInfo.labels.map((label,idx)=>(
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-full text-xs bg-amber-400/10 border border-amber-400/25 text-amber-200"
                    >
                      #{label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Vùng thay thế video khác */}
          <div className="pt-2">
            <label className="store-label !mb-0 text-slate-300">
              {t("Chọn video khác để","Choose another video to")} <strong className="text-amber-300">{t("thay thế video này","replace this video")}</strong>:
              <input
                disabled={busy||retrying}
                type="file"
                accept="video/mp4,video/webm"
                className="mt-1"
                onChange={e=>{
                  const f=e.target.files?.[0];
                  e.target.value='';
                  if(f)run(()=>handleUploadFile(f));
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        /* KHU VỰC 2: DROPZONE KÉO THẢ TẢI VIDEO ĐẠI DIỆN MỚI */
        <div
          onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
          onDragLeave={()=>setIsDragging(false)}
          onDrop={handleDrop}
          className={`p-6 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-amber-400 bg-amber-400/10 scale-[1.01]'
              : 'border-white/20 bg-black/40 hover:border-white/40 hover:bg-black/60'
          }`}
          onClick={()=>document.getElementById('intro-file-input')?.click()}
        >
          <input
            id="intro-file-input"
            type="file"
            accept="video/mp4,video/webm"
            disabled={busy}
            className="hidden"
            onChange={e=>{
              const f=e.target.files?.[0];
              e.target.value='';
              if(f)run(()=>handleUploadFile(f));
            }}
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-300">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white">
              {t("Kéo & thả video mở đầu vào đây, hoặc","Drop an opening video here, or")} <span className="text-amber-300 underline">{t("bấm để chọn","click to choose")}</span>
            </p>
            <p className="text-xs text-slate-400">
              {t("Hỗ trợ định dạng MP4 hoặc WebM (tối đa 50 MB). Hệ thống AI sẽ tự động kiểm duyệt và trả về nhãn nội dung.","Supports MP4 and WebM (up to 50 MB). AI automatically moderates content and returns topic labels.")}
            </p>
          </div>
        </div>
      )}

      {/* KHU VỰC 3: GHÉP ẢNH & CLIP THÀNH VIDEO (SLIDESHOW MAKER) */}
      <details className="rounded-xl border border-white/10 bg-black/30 p-4">
        <summary className="cursor-pointer font-semibold text-sm text-slate-200 select-none hover:text-amber-200">
          <span>{t("Tạo video kỷ niệm từ ảnh & clip","Create a memory film from photos & clips")}</span>
        </summary>

        <div className="space-y-4 pt-4 text-xs">
          <p className="text-slate-400 leading-relaxed">
            {t("Bạn có nhiều hình ảnh đẹp? Hãy ghép chúng thành 1 thước phim kỷ niệm kèm nhạc nền. Sau khi ghép xong, bạn có thể chọn","Combine photos and clips with music. When finished, you can")} <strong className="text-slate-200">{t("đặt làm Video đại diện","use it as the opening video")}</strong> {t("hoặc","or")} <strong className="text-slate-200">{t("thêm vào Bộ sưu tập Kỷ niệm","add it to the memory gallery")}</strong>.
          </p>

          <label className="store-label">
            {t("Thêm ảnh hoặc clip nguồn:","Add source photos or clips:")}
            <input
              multiple
              disabled={busy}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              onChange={e=>{chooseClips([...e.target.files]);e.target.value='';}}
            />
          </label>

          {/* Danh sách clip nguồn */}
          {clips.map((c,i)=>(
            <div key={c.id} className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
              <div className="flex items-center gap-3">
                {c.kind==='image' ? (
                  <img src={c.url} alt="" className="w-16 h-12 object-cover rounded border border-white/10" />
                ) : (
                  <video src={c.url} muted preload="metadata" className="w-16 h-12 object-cover rounded border border-white/10" />
                )}
                <span className="truncate flex-1 text-slate-200">{i+1}. {c.file.name}</span>
                <button
                  type="button"
                  disabled={busy||!i}
                  className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-30"
                  onClick={()=>setClips(prev=>{const next=[...prev];[next[i-1],next[i]]=[next[i],next[i-1]];return next;})}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30"
                  onClick={()=>setClips(prev=>prev.filter(x=>x.id!==c.id))}
                >
                  {t("Gỡ","Remove")}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {c.kind==='image' ? (
                  <label className="store-label">
                    {t("Thời lượng (giây)","Duration (seconds)")}
                    <input
                      className="store-input"
                      type="number"
                      min="1"
                      max="30"
                      disabled={busy}
                      value={c.seconds}
                      onChange={e=>editClip(c.id,{seconds:Number(e.target.value)})}
                    />
                  </label>
                ) : (
                  <>
                    <label className="store-label">
                      {t("Bắt đầu (giây)","Start (seconds)")}
                      <input
                        type="number"
                        className="store-input"
                        min="0"
                        max={c.duration}
                        step="0.1"
                        disabled={busy}
                        value={c.start}
                        onChange={e=>editClip(c.id,{start:Number(e.target.value)})}
                      />
                    </label>
                    <label className="store-label">
                      {t("Kết thúc (giây)","End (seconds)")}
                      <input
                        type="number"
                        className="store-input"
                        min="0"
                        max={c.duration}
                        step="0.1"
                        disabled={busy}
                        value={c.end}
                        onChange={e=>editClip(c.id,{end:Number(e.target.value)})}
                      />
                    </label>
                  </>
                )}
              </div>
              <label className="store-label">
                {t("Phụ đề trên cảnh","Scene caption")}
                <input
                  className="store-input"
                  maxLength={100}
                  disabled={busy}
                  value={c.caption}
                  onChange={e=>editClip(c.id,{caption:e.target.value})}
                />
              </label>
            </div>
          ))}

          {/* Nhạc nền */}
          <label className="store-label">
            {t("Nhạc nền ghép phim (tùy chọn)","Background music (optional)")}
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={e=>{
                const f=e.target.files?.[0];
                if(f&&(!f.type.startsWith('audio/')||f.size>50*1024*1024)){
                  setError(t("Nhạc nền tối đa 50 MB.","Background music must be no larger than 50 MB."));
                  return;
                }
                setMusic(f||null);
              }}
            />
          </label>
          {music && (
            <div className="flex items-center justify-between p-2 rounded bg-white/5">
              <span>{t("Đã chọn:","Selected:")} {music.name}</span>
              <button type="button" disabled={busy} className="text-red-300 hover:underline" onClick={()=>setMusic(null)}>
                {t("Gỡ nhạc","Remove music")}
              </button>
            </div>
          )}

          <label className="flex gap-2 items-center cursor-pointer">
            <input
              type="checkbox"
              checked={keepAudio}
              disabled={busy}
              onChange={e=>setKeepAudio(e.target.checked)}
            />
            <span>{t("Giữ âm thanh gốc trong các clip video","Keep original clip audio")}</span>
          </label>

          {/* Nút Render */}
          <button
            type="button"
            disabled={busy||!clips.length}
            className="store-button w-full sm:w-auto"
            onClick={()=>run(async()=>{
              setProgress(0);
              abort.current=new AbortController();
              const file=await renderMemoryMovie(clips,{
                music,
                keepClipAudio:keepAudio,
                signal:abort.current.signal,
                onProgress:setProgress
              });
              if(!mounted.current)return;
              const url=URL.createObjectURL(file);
              urls.current.add(url);
              if(preview){
                URL.revokeObjectURL(preview);
                urls.current.delete(preview);
              }
              setResult(file);
              setPreview(url);
            })}
          >
            {t("Ghép thành video ngay","Create video")}
          </button>

          {busy && (
            <div role="status" className="space-y-1.5 p-3 rounded-xl bg-black/60 border border-white/10">
              <progress className="w-full h-2 rounded bg-white/10" max="1" value={progress}/>
              <div className="flex justify-between items-center text-xs text-slate-300">
                <span>{t("Đang xử lý / kết xuất phim ·","Rendering film ·")} {Math.round(progress*100)}%</span>
                <button type="button" className="text-red-300 hover:underline" onClick={()=>abort.current?.abort()}>
                  {t("Hủy ghép","Cancel rendering")}
                </button>
              </div>
            </div>
          )}

          {/* KẾT QUẢ RENDER: LIÊN KẾT 2 LỰA CHỌN RÕ RÀNG */}
          {result && (
            <div className="p-4 rounded-xl bg-black/70 border border-amber-400/30 space-y-3">
              <p className="font-semibold text-amber-200">{t("Đã xuất video thành công (","Video created (")}{(result.size/1024/1024).toFixed(1)} MB)!</p>
              <video controls playsInline src={preview} className="w-full max-h-56 rounded-lg bg-black object-contain"/>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs transition cursor-pointer"
                  onClick={()=>run(()=>handleUploadFile(result))}
                >
                  {t("Đặt làm Video đại diện","Use as opening video")}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                  onClick={handleAddRenderedToGallery}
                >
                  {t("Thêm vào Bộ sưu tập Kỷ niệm","Add to memory gallery")}
                </button>

                <a
                  className="text-xs text-slate-300 underline hover:text-white ml-auto"
                  href={preview}
                  download={result.name||'emoria-memory-movie.webm'}
                >
                  {t("Tải video về máy","Download video")}
                </a>
              </div>

              {gallerySuccess && (
                <p role="status" className="text-emerald-300 text-xs font-medium">{gallerySuccess}</p>
              )}
            </div>
          )}
        </div>
      </details>

      {error && <p role="alert" className="text-red-300 text-xs">{error}</p>}
      <p className="text-[11px] text-slate-400">
        {t("Mẹo: Sau khi tải video đại diện, nhớ bấm","After uploading the opening video, select")} <strong className="text-slate-200">{t("“Lưu thay đổi”","“Save changes”")}</strong> {t("ở cuối Studio để cập nhật cho chip NFC.","at the bottom of Studio to update your memory.")}
      </p>

      {/* Pop-up chờ xử lý & kiểm duyệt AI */}
      <MediaModerationModal
        isOpen={!!uploadProgress}
        jobs={uploadProgress?[uploadProgress]:[]}
        title={t("Đang tải lên & kiểm duyệt video","Uploading & moderating video")}
        detail={t("Vui lòng giữ tab này mở đến khi tải lên và kiểm duyệt hoàn tất.","Please keep this tab open until uploading and review finish.")}
      />
    </section>
  );
}
