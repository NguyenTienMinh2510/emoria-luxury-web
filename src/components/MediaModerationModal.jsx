import {useLanguage} from '../i18n/LanguageProvider';
import React, {useEffect, useId, useState} from 'react';
import {remainingMediaSeconds} from '../services/mediaUploadProgress.js';

export default function MediaModerationModal({
  isOpen,
  title,
  detail,
  jobs = [],
  completed = 0,
  total = 0
}) {
  const {t}=useLanguage();
  const titleId=useId();
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    if(!isOpen)return;
    setNow(Date.now());
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(timer);
  },[isOpen]);
  if (!isOpen) return null;

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy="true"
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div 
        className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:p-7 rounded-3xl bg-neutral-950 border border-white/20 shadow-2xl text-center space-y-4 text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Vòng xoay animation sang trọng */}
        <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-amber-400/20 animate-ping" />
          <div className="w-12 h-12 rounded-full border-2 border-amber-300/30 border-t-amber-400 animate-spin" />
        </div>

        <div className="space-y-1.5">
          <h4 id={titleId} className="font-serif text-lg text-white font-bold tracking-wide">
            {title||t('Đang tải lên & kiểm duyệt nội dung','Uploading & reviewing content')}
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed font-light">
            {detail||t('Hệ thống đang kiểm tra nội dung. Vui lòng giữ tab này mở cho đến khi hoàn tất.','We are reviewing your content. Please keep this tab open until it finishes.')}
          </p>
        </div>

        {total>1&&<p role="status" className="text-xs text-amber-200">{t('Đã xử lý {done}/{total} tệp','Processed {done}/{total} files',{done:completed,total})}</p>}
        <div className="space-y-3 text-xs">
          {jobs.map((job,index)=>{
            const remaining=remainingMediaSeconds(job,now);
            const duration=remaining>=60?t('{count} phút','{count} min',{count:Math.ceil(remaining/60)}):t('{count} giây','{count} sec',{count:remaining});
            return <div key={index} className="rounded-xl bg-white/5 p-3 space-y-1">
              {job.name&&<p className="truncate text-slate-300" title={job.name}>{job.name}</p>}
              <p role="status" className="text-amber-200">{job.stage==='uploading'?t('Đang tải tệp lên','Uploading file'):t('Đang kiểm duyệt nội dung','Reviewing content')}</p>
              <p className="tabular-nums text-slate-200">{remaining>0?t('Bước này còn khoảng {time}','About {time} left in this step',{time:duration}):t('Lâu hơn dự kiến, vẫn đang xử lý…','Taking longer than estimated, still processing…')}</p>
            </div>;
          })}
          {jobs.length>0&&<p className="text-[11px] text-slate-400">{t('Thời gian ước tính thay đổi theo mạng và thời gian kiểm duyệt.','Estimates vary with your connection and review time.')}</p>}
        </div>

        {/* Thanh trạng thái loading thanh lịch */}
        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400 animate-pulse w-4/5 mx-auto rounded-full" />
        </div>

        <p className="text-[11px] text-slate-500 font-mono">
          {t("Đang xử lý an toàn · Vui lòng không đóng cửa sổ","Processing · Please keep this window open")}
        </p>
      </div>
    </div>
  );
}
