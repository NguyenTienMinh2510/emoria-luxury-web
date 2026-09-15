import React,{useEffect,useRef,useState} from 'react';
export default function MemoryCinema({url,title,recipient,onComplete,onRefresh}) {
  const [failed,setFailed]=useState(false), ref=useRef(null);
  useEffect(()=>{setFailed(false);},[url]);
  return <section className="max-w-5xl mx-auto px-4 py-8 text-center space-y-6" aria-label="Video mở quà">
    <p className="text-amber-200/80 uppercase tracking-[.3em] text-xs">Một món quà dành riêng cho {recipient||'bạn'}</p>
    <h1 className="font-serif text-3xl sm:text-5xl">{title}</h1>
    <p className="text-slate-400">Chạm phát để cùng nhìn lại những khoảnh khắc của chúng mình.</p>
    <video ref={ref} src={url} controls playsInline preload="metadata" onEnded={onComplete} onError={()=>setFailed(true)} className="w-full max-h-[65vh] bg-black rounded-3xl border border-white/15 shadow-2xl"/>
    {failed&&<div role="alert" className="text-amber-200 space-y-3"><p>Chưa phát được video. Liên kết có thể đã hết hạn hoặc định dạng chưa được hỗ trợ.</p><button className="store-button" onClick={onRefresh}>Tải lại video</button></div>}
    <p className="text-slate-400 text-sm">Sau video là những lá thư, giai điệu và lời nhắn dành cho bạn.</p>
    <button className="text-sm underline text-slate-400 hover:text-white" onClick={()=>{ref.current?.pause();onComplete();}}>Bỏ qua video, mở thư tay</button>
  </section>;
}
