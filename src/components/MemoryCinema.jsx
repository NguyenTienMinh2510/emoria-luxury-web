import {useLanguage} from '../i18n/LanguageProvider';
import React,{useEffect,useRef,useState} from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Film, ArrowRight } from 'lucide-react';

export default function MemoryCinema({url,title,recipient,onComplete,onRefresh}) {
  const {t}=useLanguage();
  const [failed,setFailed]=useState(false);
  const [isMuted,setIsMuted]=useState(false);
  const [isPlaying,setIsPlaying]=useState(false);
  const ref=useRef(null);
  const containerRef=useRef(null);
  const completeRef=useRef(onComplete);
  completeRef.current=onComplete;

  useEffect(()=>{
    const previousFocus=document.activeElement, overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    window.scrollTo({top:0,behavior:'instant'});
    containerRef.current?.focus();
    const key=event=>{
      if(event.key==='Escape')completeRef.current();
      if(event.key==='Tab'){
        const controls=[...containerRef.current.querySelectorAll('button, video[controls]')], first=controls[0], last=controls.at(-1);
        if(event.shiftKey && (document.activeElement===first || document.activeElement===containerRef.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && (document.activeElement===last || document.activeElement===containerRef.current)){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return ()=>{
      document.body.style.overflow=overflow;
      document.removeEventListener('keydown',key);
      previousFocus?.focus();
    };
  },[]);

  useEffect(()=>{
    const video=ref.current;
    if(!video)return;
    let active=true;
    setFailed(false);
    setIsMuted(false);
    video.muted=false;
    const attemptPlay = async () => {
      try { await video.play(); }
      catch {
        if(!active)return;
        video.muted=true;
        setIsMuted(true);
        try { await video.play(); } catch { if(active)setFailed(true); }
      }
      if(active)setIsPlaying(!video.paused);
    };
    attemptPlay();
    return ()=>{active=false;video.pause();};
  },[url]);

  const toggleSound = () => {
    if(!ref.current)return;
    ref.current.muted = !ref.current.muted;
    setIsMuted(ref.current.muted);
  };

  return (
    <section 
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="fixed inset-0 z-[120] h-[100dvh] bg-black text-white overflow-hidden focus:outline-none"
      aria-label={t("Video mở quà","Opening video")}
    >
      <div className="absolute top-0 inset-x-0 z-10 flex items-start justify-between gap-4 p-4 sm:p-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
      <div className="space-y-1.5 min-w-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-200 text-[11px] tracking-wider uppercase">
          <Film className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span className="hidden sm:inline">{t("Khoảnh khắc mở quà đặc biệt","Special unboxing cinema")}</span>
          {recipient && (
            <span className="text-white/80 font-normal">
              <span className="hidden sm:inline">· </span>{t("Dành riêng cho","For")} <strong className="text-amber-200">{recipient}</strong>
            </span>
          )}
        </div>

        {title && (
          <h1 className="font-serif text-xl sm:text-3xl text-metallic font-normal tracking-tight line-clamp-1">
            {title}
          </h1>
        )}
      </div>
        <button
          type="button"
          onClick={()=>{ref.current?.pause();onComplete();}}
          className="shrink-0 min-h-11 px-4 rounded-full border border-white/30 bg-black/60 text-xs flex items-center gap-2 pointer-events-auto hover:bg-white/15"
        >
          <span>{t("Bỏ qua video", "Skip video")}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cinematic Centerpiece Video Player with Zoom Entrance Effect */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 bg-black"
      >
        <video
          ref={ref}
          src={url}
          autoPlay
          playsInline
          controls
          preload="auto"
          aria-label={title || t("Phim kỷ niệm", "Memory film")}
          onPlay={()=>setIsPlaying(true)}
          onPause={()=>setIsPlaying(false)}
          onVolumeChange={event=>setIsMuted(event.currentTarget.muted)}
          onEnded={onComplete}
          onError={()=>setFailed(true)}
          className="w-full h-full object-cover sm:object-contain bg-black"
        />

        {isPlaying && (
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={!isMuted}
            className="absolute bottom-20 right-4 sm:right-6 z-20 min-h-11 px-4 rounded-full bg-amber-400/90 text-dark-950 font-bold text-xs flex items-center gap-2 shadow-lg backdrop-blur-md hover:bg-amber-300"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isMuted ? t("Bật tiếng video", "Turn sound on") : t("Tắt tiếng video", "Mute video")}</span>
          </button>
        )}

      </motion.div>

      {failed && (
        <div role="alert" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[calc(100%-2rem)] max-w-md text-center text-amber-200 space-y-3 p-5 rounded-2xl bg-black/90 border border-amber-500/20">
          <p>{t("Chưa phát được video. Liên kết có thể đã hết hạn hoặc định dạng chưa được hỗ trợ.","Unable to play the video. Its link may have expired or the format may not be supported.")}</p>
          <button className="store-button" onClick={onRefresh}>{t("Tải lại video","Reload video")}</button>
        </div>
      )}

    </section>
  );
}
