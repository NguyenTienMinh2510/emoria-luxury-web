import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageProvider';

const HOUSE_PREVIEW = '/memoryhouse/models/house-preview.png';

// Render the saved house once, then release WebGL while the static image stays visible.
export default function MemoryHousePreview({ house, onPreview }) {
  const { t } = useLanguage();
  const host = useRef(null);
  const [image, setImage] = useState(HOUSE_PREVIEW);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false, started = false, engine;
    setImage(HOUSE_PREVIEW);
    setStatus('loading');
    const fallback = () => {
      if (!cancelled) setStatus('fallback');
      engine?.dispose();
      engine = null;
    };
    const start = async () => {
      if (started || cancelled) return;
      started = true;
      try {
        const { createHouseRenderer } = await import('../services/house3dRenderer.js');
        if (cancelled || !host.current) return;
        engine = createHouseRenderer(host.current, {
          isEditing: () => false,
          onError: fallback,
          onReady: async () => {
            try {
              const capture = await engine.captureWhenReady();
              if (!cancelled && capture) {
                setImage(capture);
                setStatus('ready');
              } else if (!cancelled) setStatus('fallback');
            } catch { if (!cancelled) setStatus('fallback'); }
            finally { engine?.dispose(); engine = null; }
          }
        });
        engine.update({ rooms: house.rooms, title: house.title, theme: house.theme });
        engine.overview(false);
      } catch { fallback(); }
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
    }, { rootMargin: '150px' });
    if (observer) observer.observe(host.current);
    else start();
    return () => { cancelled = true; observer?.disconnect(); engine?.dispose(); engine = null; };
  }, [house]);

  const alt = status === 'ready'
    ? `${t('Ảnh ngôi nhà 3D', '3D house image')} · ${house.title || t('Ngôi Nhà Kỷ Niệm', 'Memory House')}`
    : t('Mô hình 3D mẫu của Ngôi Nhà Kỷ Niệm', 'Sample 3D Memory House model');
  return <figure data-testid="memory-house-preview" className="space-y-2 relative z-10">
    <div className="relative aspect-[13/10] max-h-[560px] overflow-hidden rounded-2xl bg-[#e9dfd2]">
      <div ref={host} aria-hidden="true" className="absolute inset-0 pointer-events-none" />
      <button type="button" onClick={() => onPreview?.(image, alt)} disabled={!onPreview || status !== 'ready'}
        aria-label={t('Phóng to ảnh ngôi nhà 3D', 'Enlarge the 3D house image')}
        className="relative w-full h-full block focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:cursor-default">
        <img src={image} alt={alt} className="w-full h-full object-contain" />
      </button>
    </div>
    <figcaption className="text-center text-xs text-slate-400" role={status === 'loading' ? 'status' : undefined}>
      {status === 'loading' ? t('Đang dựng ảnh ngôi nhà 3D của bạn…', 'Rendering your 3D house image…')
        : status === 'fallback' ? t('Ảnh mô hình mẫu. Mở House Studio để xem ngôi nhà của bạn.', 'Sample model image. Open House Studio to view your house.')
        : t('Toàn cảnh ngôi nhà 3D của bạn · Chạm ảnh để phóng to', 'Your complete 3D house · Tap the image to enlarge')}
    </figcaption>
  </figure>;
}
