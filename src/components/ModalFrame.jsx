import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function ModalFrame({ title, onClose, children, wide = false }) {
 const ref = useRef(null); const close=useRef(onClose); close.current=onClose;
 useEffect(() => {
  const previous=document.activeElement; const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden'; ref.current?.focus();
  const key=e=>{ if(e.key==='Escape') close.current(); if(e.key==='Tab') { const els=[...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')]; const first=els[0],last=els.at(-1); if(e.shiftKey && (document.activeElement===first || document.activeElement===ref.current)){ e.preventDefault();last?.focus(); } else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();} } };
  document.addEventListener('keydown',key);
  return ()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus();};
 },[]);
 return <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-lg flex items-center justify-center p-4" onClick={onClose}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`glass-panel bg-dark-900 rounded-3xl p-6 sm:p-8 w-full ${wide?'max-w-4xl':'max-w-md'} max-h-[90vh] overflow-y-auto text-slate-100`} onClick={e=>e.stopPropagation()}><div className="flex justify-between items-center gap-4 mb-6"><h2 className="font-serif text-2xl">{title}</h2><button aria-label="Đóng" onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><X /></button></div>{children}</div></div>;
}
