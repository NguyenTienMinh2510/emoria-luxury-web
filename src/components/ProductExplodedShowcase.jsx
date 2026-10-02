import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { prepareShowcaseFrames, SHOWCASE_FRAME_COUNT, SHOWCASE_DURATION_MS } from '../services/showcaseFrames.js';
import { ChevronDown } from 'lucide-react';

// Evenly sampled frames retain the original framing and playback duration.
const TOTAL_FRAMES = SHOWCASE_FRAME_COUNT;
const FRAME_RATE = (TOTAL_FRAMES - 1) * 1000 / SHOWCASE_DURATION_MS;

export default function ProductExplodedShowcase({ currentUser, onOpenAuth }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const frameLoaderRef = useRef(null);
  const canvasSizeRef = useRef(null);
  const paintFrameRef = useRef(0);
  const playbackRef = useRef(0);
  const currentFrameRef = useRef(0);
  const targetFrameRef = useRef(0);
  const paintedIndexRef = useRef(-1);
  const preparedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const touchBoundsRef = useRef(null);
  const activeTouchRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const drawFrame = useCallback((index) => {
    currentFrameRef.current = index;
    if (paintFrameRef.current) return;
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = 0;
      const loader = frameLoaderRef.current;
      const canvas = canvasRef.current;
      if (!loader || !canvas || !canvasSizeRef.current) return;
      let frameIndex = Math.floor(currentFrameRef.current);
      // Keep a valid image visible if both delivery and original copies fail.
      while (frameIndex >= 0 && !loader.ready[frameIndex]) frameIndex--;
      if (frameIndex < 0) frameIndex = loader.ready.findIndex(Boolean);
      if (frameIndex < 0 || paintedIndexRef.current === frameIndex) return;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      const img = loader.images[frameIndex];
      paintedIndexRef.current = frameIndex;
      const layerFrame = frameIndex * 119 / (TOTAL_FRAMES - 1);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const imgAspect = img.width / img.height;
      const canvasAspect = canvas.width / canvas.height;
      const scale = canvasSizeRef.current.scale;
      const drawW = canvasAspect > imgAspect ? canvas.height * scale * imgAspect : canvas.width * scale;
      const drawH = drawW / imgAspect;
      const drawX = (canvas.width - drawW) / 2;
      const yOffset = -canvas.height * 0.035 * Math.min(1, Math.max(0, (layerFrame - 40) / 8));
      const drawY = (canvas.height - drawH) / 2 + yOffset;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      if (layerFrame < 80) {
        ctx.fillStyle = '#060608';
        ctx.fillRect(drawX + drawW * 1680 / 1920, drawY + drawH * 840 / 1080,
          drawW * 120 / 1920, drawH * 120 / 1080);
      }
    });
  }, []);

  const animateTo = useCallback((target) => {
    if (targetFrameRef.current === target && playbackRef.current) return;
    targetFrameRef.current = target;
    cancelAnimationFrame(playbackRef.current);
    playbackRef.current = 0;
    if (!preparedRef.current) return;
    if (reducedMotionRef.current) {
      frameLoaderRef.current.request(target);
      drawFrame(target);
      setIsExpanded(target === TOTAL_FRAMES - 1 && frameLoaderRef.current.ready[target]);
      return;
    }
    if (target === currentFrameRef.current) return;
    if (target === 0) setIsExpanded(false);
    let previousTime;
    const tick = (time) => {
      // Pause elapsed time in background tabs; never jump through the sequence.
      const elapsed = previousTime === undefined ? 1000 / 60 : Math.min(32, time - previousTime);
      previousTime = time;
      const direction = Math.sign(target - currentFrameRef.current);
      const next = currentFrameRef.current + direction * elapsed * FRAME_RATE / 1000;
      const frame = direction > 0 ? Math.min(target, next) : Math.max(target, next);
      const loader = frameLoaderRef.current;
      const index = Math.floor(frame);
      // Hold the last decoded frame during a network stall; resume without skipping time.
      if (!loader.ready[index] && !loader.settled[index]) loader.request(index);
      else drawFrame(frame);
      if (currentFrameRef.current === target) {
        playbackRef.current = 0;
        setIsExpanded(target === TOTAL_FRAMES - 1);
      } else playbackRef.current = requestAnimationFrame(tick);
    };
    playbackRef.current = requestAnimationFrame(tick);
  }, [drawFrame]);

  useEffect(() => {
    preparedRef.current = false;
    reducedMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    const sequence = prepareShowcaseFrames();
    frameLoaderRef.current = sequence.loader;
    const sync = () => {
      const { loadedCount, ready } = sequence.getSnapshot();
      preparedRef.current = ready;
      setIsLoaded(ready);
      if (loadedCount) drawFrame(currentFrameRef.current);
      if (ready) animateTo(targetFrameRef.current);
    };
    const unsubscribe = sequence.subscribe(sync);
    sync();
    return () => {
      preparedRef.current = false;
      unsubscribe();
      frameLoaderRef.current = null;
      cancelAnimationFrame(paintFrameRef.current);
      cancelAnimationFrame(playbackRef.current);
      paintFrameRef.current = playbackRef.current = 0;
      currentFrameRef.current = targetFrameRef.current = 0;
      paintedIndexRef.current = -1;
    };
  }, [drawFrame, animateTo]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      const scale = window.innerWidth < 768 ? 1.4 : window.innerWidth < 1024 ? 1.18 : 1.28;
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height || canvasSizeRef.current?.scale !== scale) {
        canvas.width = width;
        canvas.height = height;
        canvasSizeRef.current = { scale };
        paintedIndexRef.current = -1;
        drawFrame(currentFrameRef.current);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (canvasRef.current) observer?.observe(canvasRef.current);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [drawFrame]);

  const collapse = useCallback(() => {
    touchBoundsRef.current = null;
    activeTouchRef.current = null;
    animateTo(0);
  }, [animateTo]);

  const updateTouch = useCallback(() => {
    const touch = activeTouchRef.current;
    if (!touch) return;
    const bounds = touch.element.getBoundingClientRect();
    const inside = touch.clientX >= bounds.left && touch.clientX <= bounds.right &&
      touch.clientY >= bounds.top && touch.clientY <= bounds.bottom;
    animateTo(inside ? TOTAL_FRAMES - 1 : 0);
  }, [animateTo]);

  useEffect(() => {
    const hide = () => { if (document.hidden) collapse(); };
    const scroll = () => { if (activeTouchRef.current) updateTouch(); else collapse(); };
    const moveTouch = (event) => {
      const active = activeTouchRef.current;
      const touch = active && Array.from(event.touches).find(touch => touch.identifier === active.identifier);
      if (!touch) return;
      active.clientX = touch.clientX;
      active.clientY = touch.clientY;
      updateTouch();
    };
    const endTouch = (event) => {
      const active = activeTouchRef.current;
      if (active && !Array.from(event.touches).some(touch => touch.identifier === active.identifier)) collapse();
    };
    window.addEventListener('scroll', scroll, { passive: true });
    // Native scrolling cancels pointer events; touch events track the actual finger until release.
    window.addEventListener('touchmove', moveTouch, { passive: true });
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });
    window.addEventListener('blur', collapse);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('touchmove', moveTouch);
      window.removeEventListener('touchend', endTouch);
      window.removeEventListener('touchcancel', endTouch);
      window.removeEventListener('blur', collapse);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [collapse, updateTouch]);

  const handleScrollToNext = () => {
    collapse();
    if (containerRef.current) {
      const targetY = containerRef.current.offsetTop + containerRef.current.offsetHeight;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  };

  const handlePointerDown = (event) => {
    if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return;
    touchBoundsRef.current = event.currentTarget.getBoundingClientRect();
    animateTo(TOTAL_FRAMES - 1);
  };

  const handlePointerMove = (event) => {
    const bounds = touchBoundsRef.current;
    if (!event.isPrimary || !bounds || event.pointerType !== 'pen') return;
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    animateTo(inside ? TOTAL_FRAMES - 1 : 0);
  };

  return (
    <section
      id="product-exploded-showcase"
      ref={containerRef}
      className="relative min-h-[100svh] md:h-[100dvh] md:min-h-[500px] w-full bg-black text-white selection:bg-silver/20 select-none overflow-hidden flex flex-col justify-between items-center"
    >
      {/* LUXURY ATELIER AMBIENT LIGHTING & DIAMOND PATTERN TEXTURE */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_25%,rgba(255,255,255,0.06),transparent_75%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-diamond-pattern opacity-20 pointer-events-none z-0" />

      {/* 1. TOP HERO BRAND HEADER */}
      <div className="shrink-0 w-full max-w-4xl mx-auto flex flex-col items-center text-center relative z-30 pt-9 sm:pt-10 pb-0.5 px-4">
        {/* 3D Metallic EMORIA Logo */}
        <motion.div
          animate={{ y: [-3, 3, -3] }}
          transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
          className="relative inline-flex flex-col items-center select-none mt-0.5"
        >
          <img
            src="/assets/logo.png"
            alt="EMORIA Logo"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
            className="w-[60vw] max-w-[240px] sm:max-w-[280px] md:max-w-[310px] h-auto object-contain drop-shadow-[0_6px_28px_rgba(255,255,255,0.25)] select-none"
          />
        </motion.div>

        {/* Official Slogan with Silver Gradients & Diamond Accents */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 mt-0.5 sm:mt-1 px-4">
          <span className="w-6 sm:w-10 h-px bg-gradient-to-r from-transparent via-slate-400/40 to-transparent" />
          <p className="text-[10px] sm:text-xs md:text-sm font-sans font-medium tracking-[0.28em] sm:tracking-[0.38em] text-transparent bg-clip-text bg-gradient-to-r from-slate-300 via-white to-slate-300 uppercase text-center drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            MỘT CHẠM MỞ KÍ ỨC · TRỌN ĐỜI GIỮ YÊU THƯƠNG
          </p>
          <span className="w-6 sm:w-10 h-px bg-gradient-to-r from-transparent via-slate-400/40 to-transparent" />
        </div>

        {/* PURE TEXT AUTH LINKS: KHÔNG Ô BUTTON, KHÔNG ICON, KHÔNG LỖI FONT */}
        <div className="mt-1 sm:mt-1.5 flex items-center justify-center">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300 font-sans tracking-wide">
                Xin chào, <strong className="text-white font-medium">{currentUser}</strong>
              </span>
              <span className="text-slate-600 text-xs">✦</span>
              <button
                onClick={() => onOpenAuth && onOpenAuth('login')}
                className="text-xs font-sans tracking-[0.2em] uppercase text-slate-300 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
              >
                Tài khoản
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-6 sm:gap-8">
              <button
                onClick={() => onOpenAuth && onOpenAuth('login')}
                className="text-xs sm:text-sm font-sans font-medium tracking-[0.22em] text-slate-300 hover:text-white uppercase transition-colors cursor-pointer hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
              >
                Đăng nhập
              </button>
              <span className="text-slate-500 text-xs select-none">✦</span>
              <button
                onClick={() => onOpenAuth && onOpenAuth('register')}
                className="text-xs sm:text-sm font-sans font-medium tracking-[0.22em] text-slate-300 hover:text-white uppercase transition-colors cursor-pointer hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
              >
                Đăng ký
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN CENTER CANVAS (FULL VIEWPORT WIDTH - ABSOLUTE TRUE CENTER) */}
      <div className="relative w-full flex-1 min-h-[clamp(320px,50svh,560px)] md:min-h-0 flex items-center justify-center">

        {/* RESPONSIVE CANVAS STAGE (Đảm bảo dây chuyền nằm đúng tuyệt đối chính tâm màn hình) */}
        <div
          className="relative w-full h-full min-h-[clamp(320px,50svh,560px)] md:min-h-0 flex items-center justify-center overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)'
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%' }}
            className="absolute inset-0 w-full h-full block pointer-events-none"
          />

          <button
            type="button"
            aria-label="Bung 5 tầng linh kiện: rê chuột hoặc giữ chạm, rời ảnh để thu lại"
            aria-busy={!isLoaded}
            aria-expanded={isExpanded}
            onPointerEnter={event => { if (event.pointerType === 'mouse') animateTo(TOTAL_FRAMES - 1); }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={event => { if (event.isPrimary && event.pointerType !== 'touch') collapse(); }}
            onPointerUp={event => { if (event.isPrimary && event.pointerType !== 'touch') collapse(); }}
            onPointerCancel={event => { if (event.isPrimary && event.pointerType !== 'touch') collapse(); }}
            onTouchStart={event => {
              if (activeTouchRef.current) return;
              const touch = event.changedTouches[0];
              if (!touch) return;
              activeTouchRef.current = { identifier: touch.identifier, clientX: touch.clientX,
                clientY: touch.clientY, element: event.currentTarget };
              animateTo(TOTAL_FRAMES - 1);
            }}
            onFocus={event => { if (event.currentTarget.matches(':focus-visible')) animateTo(TOTAL_FRAMES - 1); }}
            onBlur={() => { if (!activeTouchRef.current) collapse(); }}
            onClick={event => { if (event.detail === 0) animateTo(TOTAL_FRAMES - 1); }}
            onKeyDown={event => {
              if (event.key === 'Escape') collapse();
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                animateTo(TOTAL_FRAMES - 1);
              }
            }}
            className="absolute inset-0 md:left-[32%] md:right-[32%] md:top-[8%] md:bottom-[5%] z-10 rounded-3xl bg-transparent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
            style={{ touchAction: 'pan-y' }}
          />
        </div>

      </div>

      {/* Collection navigation stays available while the frames are preparing. */}
      <div className="shrink-0 relative z-30 w-full max-w-2xl mx-auto flex flex-col items-center gap-2 pb-3 px-3 sm:px-6">
        <button type="button" onClick={handleScrollToNext}
          className="cta-luxury-gold !px-8 !py-3.5 text-xs sm:text-sm tracking-[0.2em]">
          <span>Khám phá bộ sưu tập</span>
          <ChevronDown className="w-4 h-4 text-dark-950" />
        </button>
      </div>

    </section>
  );
}
