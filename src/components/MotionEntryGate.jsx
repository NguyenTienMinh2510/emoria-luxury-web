import React, { useSyncExternalStore } from 'react';
import { prepareShowcaseFrames, SHOWCASE_FRAME_COUNT } from '../services/showcaseFrames.js';

export default function MotionEntryGate({ children }) {
  const sequence = prepareShowcaseFrames();
  const { loadedCount, ready, failed } = useSyncExternalStore(sequence.subscribe, sequence.getSnapshot, sequence.getSnapshot);
  if (ready) return children;
  const percent = Math.floor(loadedCount / SHOWCASE_FRAME_COUNT * 100);
  return (
    <main className="fixed inset-0 z-[200] overflow-y-auto bg-dark-950 px-5 py-8 text-white font-sans" aria-busy={!failed}>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(212,175,55,0.09),transparent_65%)]" />
      <div className="relative flex min-h-full items-center justify-center">
        <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-amber-200/20 bg-gradient-to-b from-[#191610] via-[#11100e] to-dark-950 px-6 py-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:px-10 sm:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-[21px] border border-amber-200/[0.06]" />
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-100/70">Chào mừng đến với</p>
          <img src="/assets/logo.png" alt="EMORIA" width="666" height="250" fetchPriority="high" className="mx-auto mt-6 h-auto w-56 max-w-full sm:w-64" />
          <div aria-hidden="true" className="mx-auto my-8 flex w-28 items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-200/40" />
            <span className="h-1.5 w-1.5 rotate-45 border border-amber-200/60" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-200/40" />
          </div>
          <h1 className="font-serif text-2xl leading-snug text-amber-50 sm:text-3xl">
            {failed ? 'Trải nghiệm chưa sẵn sàng' : <>Một khoảnh khắc,<br />để mọi thứ sẵn sàng.</>}
          </h1>
          <p id="entry-status" role="status" className="mt-4 text-sm leading-relaxed text-slate-300">
            {failed ? 'Kết nối chưa hoàn tất. Vui lòng thử lại.' : 'Đang chuẩn bị không gian trải nghiệm dành cho bạn.'}
          </p>
          <div className="mt-8 text-left">
            <div aria-hidden="true" className="mb-3 flex items-center justify-between text-[11px] tracking-wide text-slate-400">
              <span>{failed ? 'Tạm gián đoạn' : 'Hoàn thiện trải nghiệm'}</span>
              <span className="tabular-nums text-amber-100">{percent}%</span>
            </div>
            <progress value={loadedCount} max={SHOWCASE_FRAME_COUNT} aria-label="Chuẩn bị trải nghiệm" aria-describedby="entry-status"
              className="block h-1 w-full overflow-hidden rounded-full bg-white/10 accent-amber-200 [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-amber-200 [&::-moz-progress-bar]:bg-amber-200" />
          </div>
          {failed && <button type="button" onClick={sequence.retry} className="cta-luxury-gold mt-7 w-full">Thử lại</button>}
          <p className="mt-7 text-[11px] leading-relaxed text-slate-400">Cảm ơn bạn đã dành thời gian chờ.</p>
        </div>
      </div>
    </main>
  );
}
