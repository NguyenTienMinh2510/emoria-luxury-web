import React, { useSyncExternalStore } from 'react';
import { prepareShowcaseFrames, SHOWCASE_FRAME_COUNT } from '../services/showcaseFrames.js';

export default function MotionEntryGate({ children }) {
  const sequence = prepareShowcaseFrames();
  const { loadedCount, ready, failed } = useSyncExternalStore(sequence.subscribe, sequence.getSnapshot, sequence.getSnapshot);
  if (ready) return children;
  const percent = Math.floor(loadedCount / SHOWCASE_FRAME_COUNT * 100);
  return (
    <main className="fixed inset-0 z-[200] bg-black text-white flex items-center justify-center px-6" aria-busy={!failed}>
      <div className="w-full max-w-xs text-center">
        <img src="/assets/logo.png" alt="EMORIA" className="w-56 h-auto mx-auto mb-10" />
        <p role="status" className="text-sm text-slate-200 tracking-wide">
          {failed ? 'Chưa tải đủ chuyển động. Vui lòng thử lại.' : 'Đang chuẩn bị chuyển động'}
        </p>
        <progress value={loadedCount} max={SHOWCASE_FRAME_COUNT} aria-label="Chuẩn bị chuyển động"
          className="w-full h-1.5 mt-5 mb-3 accent-amber-300" />
        <p className="text-xs text-slate-400 tabular-nums">{percent}%</p>
        {failed && <button type="button" onClick={sequence.retry} className="cta-luxury-primary mt-6">Thử lại</button>}
      </div>
    </main>
  );
}
