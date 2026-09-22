import {useLanguage} from '../i18n/LanguageProvider';
import React,{useEffect,useRef,useState} from 'react';
import { Volume2, VolumeX, Sparkles, Film, ArrowRight } from 'lucide-react';

export default function MemoryCinema({url,title,recipient,onComplete,onRefresh}) {
  const {t}=useLanguage();
  const [failed,setFailed]=useState(false);
  const [isMuted,setIsMuted]=useState(false);
  const [isPlaying,setIsPlaying]=useState(false);
  const ref=useRef(null);

  useEffect(()=>{
    setFailed(false);
    if(!ref.current)return;
    // Attempt unmuted autoplay; fallback to muted autoplay if browser blocks
    const attemptPlay = () => {
      const p = ref.current?.play();
      if(p !== undefined){
        p.then(()=>{
          setIsPlaying(true);
        }).catch(()=>{
          if(ref.current){
            ref.current.muted = true;
            setIsMuted(true);
            ref.current.play().then(()=>{
              setIsPlaying(true);
            }).catch(()=>setFailed(true));
          }
        });
      }
    };
    attemptPlay();
  },[url]);

  const toggleSound = () => {
    if(!ref.current)return;
    ref.current.muted = !ref.current.muted;
    setIsMuted(ref.current.muted);
  };

  return (
    <section 
      className="max-w-5xl mx-auto px-4 py-8 text-center space-y-6 animate-fadeIn" 
      aria-label={t("Video mở quà","Opening video")}
    >
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-200 text-xs tracking-wider uppercase">
        <Film className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
        <span>{t("Khoảnh khắc mở quà đặc biệt","Special unboxing cinema")}</span>
      </div>

      <p className="text-amber-200/80 uppercase tracking-[.3em] text-xs">
        {t("Một món quà dành riêng cho","A gift just for")} <strong className="text-white">{recipient||t("bạn","you")}</strong>
      </p>

      <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl text-metallic font-normal tracking-tight">
        {title}
      </h1>

      <p className="text-slate-300 text-sm max-w-lg mx-auto leading-relaxed">
        {t("Từng thước phim kỷ niệm đang tự động được phát lại để cùng bạn sống lại những khoảnh khắc đẹp nhất.","Your memory film is playing automatically to relive your most precious moments together.")}
      </p>

      {/* Cinematic Centerpiece Video Player */}
      <div className="relative group rounded-3xl overflow-hidden border border-amber-400/30 shadow-[0_0_60px_rgba(251,191,36,0.18)] bg-black max-w-4xl mx-auto">
        <video
          ref={ref}
          src={url}
          autoPlay
          playsInline
          controls
          preload="auto"
          onPlay={()=>setIsPlaying(true)}
          onPause={()=>setIsPlaying(false)}
          onEnded={onComplete}
          onError={()=>setFailed(true)}
          className="w-full max-h-[72vh] object-contain bg-black"
        />

        {/* Floating Unmute Helper if muted by browser */}
        {isMuted && isPlaying && (
          <button
            type="button"
            onClick={toggleSound}
            className="absolute top-4 right-4 z-20 px-3.5 py-2 rounded-full bg-amber-400/90 text-dark-950 font-bold text-xs flex items-center gap-2 shadow-lg backdrop-blur-md hover:bg-amber-300 transition-all cursor-pointer animate-bounce"
          >
            <VolumeX className="w-4 h-4 text-dark-950" />
            <span>{t("Bật tiếng video ✦","Turn sound on ✦")}</span>
          </button>
        )}

        {/* Bottom Cinema Subtitle Bar */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 flex items-center justify-between text-xs text-slate-300 pointer-events-none">
          <span className="flex items-center gap-1.5 text-amber-200">
            <Sparkles className="w-3.5 h-3.5" />
            {isPlaying ? t("Đang phát phim kỷ niệm","Now playing memory film") : t("Tạm dừng","Paused")}
          </span>
          <span className="text-[11px] text-slate-400">EMORIA MEMORY CINEMA</span>
        </div>
      </div>

      {failed && (
        <div role="alert" className="text-amber-200 space-y-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 max-w-md mx-auto">
          <p>{t("Chưa phát được video. Liên kết có thể đã hết hạn hoặc định dạng chưa được hỗ trợ.","Unable to play the video. Its link may have expired or the format may not be supported.")}</p>
          <button className="store-button" onClick={onRefresh}>{t("Tải lại video","Reload video")}</button>
        </div>
      )}

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
        <button
          type="button"
          onClick={()=>{ref.current?.pause();onComplete();}}
          className="cta-luxury-gold !py-2.5 !px-6 text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(250,204,21,0.4)]"
        >
          <span>{t("Xem trọn vẹn thư tay & lời chúc","Read full letter & wishes")}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}
