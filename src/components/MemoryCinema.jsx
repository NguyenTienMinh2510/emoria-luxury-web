import {useLanguage} from '../i18n/LanguageProvider';
import React,{useEffect,useRef,useState} from 'react';
export default function MemoryCinema({url,title,recipient,onComplete,onRefresh}) {
  const {t}=useLanguage();
  const [failed,setFailed]=useState(false), ref=useRef(null);
  useEffect(()=>{setFailed(false);},[url]);
  return <section className="max-w-5xl mx-auto px-4 py-8 text-center space-y-6" aria-label={t("Video mở quà","Opening video")}>
    <p className="text-amber-200/80 uppercase tracking-[.3em] text-xs">{t("Một món quà dành riêng cho","A gift just for")} {recipient||t("bạn","you")}</p>
    <h1 className="font-serif text-3xl sm:text-5xl">{title}</h1>
    <p className="text-slate-400">{t("Chạm phát để cùng nhìn lại những khoảnh khắc của chúng mình.","Press play to relive our moments together.")}</p>
    <video ref={ref} src={url} controls playsInline preload="metadata" onEnded={onComplete} onError={()=>setFailed(true)} className="w-full max-h-[65vh] bg-black rounded-3xl border border-white/15 shadow-2xl"/>
    {failed&&<div role="alert" className="text-amber-200 space-y-3"><p>{t("Chưa phát được video. Liên kết có thể đã hết hạn hoặc định dạng chưa được hỗ trợ.","Unable to play the video. Its link may have expired or the format may not be supported.")}</p><button className="store-button" onClick={onRefresh}>{t("Tải lại video","Reload video")}</button></div>}
    <p className="text-slate-400 text-sm">{t("Sau video là những lá thư, giai điệu và lời nhắn dành cho bạn.","Letters, music and messages await you after the video.")}</p>
    <button className="text-sm underline text-slate-400 hover:text-white" onClick={()=>{ref.current?.pause();onComplete();}}>{t("Bỏ qua video, mở thư tay","Skip video and open letters")}</button>
  </section>;
}
