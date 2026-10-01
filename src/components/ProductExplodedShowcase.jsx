import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadShowcaseFrames } from '../services/showcaseFrames.js';
import {
  Sparkles, ShieldCheck, Cpu, Layers, Disc,
  ChevronDown,
  Smartphone, FastForward, Lock, Unlock, X
} from 'lucide-react';

// Use every original frame while preserving the existing image stage and layer timing.
const TOTAL_FRAMES = 300;
const LAYER_FRAMES = [0, 30, 48, 66, 80, 86, 119];

export default function ProductExplodedShowcase({ currentUser, onOpenAuth, onOpenNfcDemo }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const frameLoaderRef = useRef(null);
  const canvasSizeRef = useRef(null);
  const paintFrameRef = useRef(0);
  const playbackRef = useRef(0);
  const currentFrameRef = useRef(0);
  const targetFrameRef = useRef(0);
  const paintedIndexRef = useRef(-1);
  const labelFrameRef = useRef(0);
  const preparedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const touchBoundsRef = useRef(null);

  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

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
      const labelFrame = LAYER_FRAMES.filter(value => value <= layerFrame).pop();
      // Only update React when a layer changes; the canvas runs independently.
      if (labelFrame !== labelFrameRef.current) {
        labelFrameRef.current = labelFrame;
        setCurrentFrame(labelFrame);
      }
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
      drawFrame(target);
      setIsExpanded(target === TOTAL_FRAMES - 1);
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
      const next = currentFrameRef.current + direction * elapsed * 60 / 1000;
      const frame = direction > 0 ? Math.min(target, next) : Math.max(target, next);
      drawFrame(frame);
      if (frame === target) {
        playbackRef.current = 0;
        setIsExpanded(target === TOTAL_FRAMES - 1);
      } else playbackRef.current = requestAnimationFrame(tick);
    };
    playbackRef.current = requestAnimationFrame(tick);
  }, [drawFrame]);

  useEffect(() => {
    let count = 0, successes = 0;
    preparedRef.current = false;
    const mobile = window.innerWidth < 768;
    reducedMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    const loader = loadShowcaseFrames({
      count: TOTAL_FRAMES,
      getPath: index => `/assets/animation-optimized/frame-${String(index).padStart(3, '0')}${mobile ? '-640' : ''}.webp?v=3`,
      getFallbackPath: index => `/assets/animation/ezgif-frame-${String(index + 1).padStart(3, '0')}.jpg?v=2`,
      onLoad: (index, loaded) => {
        count++;
        if (loaded) successes++;
        if (count % 6 === 0 || index === 0 || count === TOTAL_FRAMES) setLoadedCount(count);
        if (paintedIndexRef.current < 0 && loaded) drawFrame(0);
        if (count === TOTAL_FRAMES) {
          preparedRef.current = successes > 0;
          setIsLoaded(successes > 0);
          animateTo(targetFrameRef.current);
        }
      },
    });
    frameLoaderRef.current = loader;
    // Download and decode the entire sequence immediately on entry.
    loader.preload();
    return () => {
      preparedRef.current = false;
      loader.dispose();
      frameLoaderRef.current = null;
      cancelAnimationFrame(paintFrameRef.current);
      cancelAnimationFrame(playbackRef.current);
      paintFrameRef.current = playbackRef.current = 0;
      currentFrameRef.current = targetFrameRef.current = 0;
      paintedIndexRef.current = -1;
      labelFrameRef.current = 0;
    };
  }, [drawFrame, animateTo]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      const scale = window.innerWidth < 768 ? 1.05 : window.innerWidth < 1024 ? 1.18 : 1.28;
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
    animateTo(0);
  }, [animateTo]);

  useEffect(() => {
    const hide = () => { if (document.hidden) collapse(); };
    window.addEventListener('scroll', collapse, { passive: true });
    window.addEventListener('blur', collapse);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('scroll', collapse);
      window.removeEventListener('blur', collapse);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [collapse]);

  useEffect(() => { if (isMobileDrawerOpen) collapse(); }, [isMobileDrawerOpen, collapse]);

  const handleScrollToNext = () => {
    collapse();
    if (containerRef.current) {
      const targetY = containerRef.current.offsetTop + containerRef.current.offsetHeight;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  };

  const handlePointerDown = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    touchBoundsRef.current = event.currentTarget.getBoundingClientRect();
    animateTo(TOTAL_FRAMES - 1);
  };

  const handlePointerMove = (event) => {
    const bounds = touchBoundsRef.current;
    if (!event.isPrimary || !bounds || event.pointerType === 'mouse') return;
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    animateTo(inside ? TOTAL_FRAMES - 1 : 0);
  };

  // Layer labels retain the original 120-frame timing scale.
  const componentsData = [
    {
      id: 1,
      name: "Nắp Vòm Bạc S925 Đúc Khối",
      spec: "Bạc S925 cao cấp · Khắc laser logo EMORIA",
      desc: "Mặt nạ bảo vệ đúc khối tinh xảo, đính kim cương và họa tiết mặt trời rạng rỡ.",
      icon: Sparkles,
      side: "left",
      activeFrames: [30, 120]
    },
    {
      id: 2,
      name: "Seal Silicon Kháng Nước IP68",
      spec: "Chuẩn kháng nước IP68 · Chống ẩm & mồ hôi",
      desc: "Vòng đệm đàn hồi cao cấp giúp khoang linh kiện kín khít, an toàn khi đi mưa.",
      icon: ShieldCheck,
      side: "left",
      activeFrames: [48, 120]
    },
    {
      id: 3,
      name: "Vi Chip NFC NTAG215 & Cuộn Đồng",
      spec: "Không dùng pin · Tuổi thọ >10 năm · Chạm 0.5s",
      desc: "Trái tim Memory Space, vận hành bằng cảm ứng từ smartphone không cần sạc.",
      icon: Cpu,
      side: "right",
      activeFrames: [66, 120]
    },
    {
      id: 4,
      name: "Lá Chắn Từ Ferrite Chống Nhiễu",
      spec: "Độ dày 0.2mm · Triệt tiêu nhiễu sóng kim loại",
      desc: "Lá chắn từ đặc chủng giúp sóng NFC xuyên thấu qua lớp bạc S925 mượt mà.",
      icon: Layers,
      side: "right",
      activeFrames: [80, 120]
    },
    {
      id: 5,
      name: "Khung Đáy Bạc S925 & Quai Dây",
      spec: "Chốt hàn laser · Ngàm khóa kép chắc chắn",
      desc: "Khung đế đúc nguyên khối, định vị toàn bộ linh kiện thành khối trang sức hoàn mỹ.",
      icon: Disc,
      side: "right",
      activeFrames: [86, 120]
    }
  ];

  const handleJumpToLayer = (layerId) => {
    const comp = componentsData.find(c => c.id === layerId);
    if (comp) animateTo(Math.ceil(comp.activeFrames[0] * (TOTAL_FRAMES - 1) / 119));
  };

  // Xác định tầng linh kiện đang được bóc tách
  const activeComponentMobile = componentsData
    .filter(c => currentFrame >= c.activeFrames[0])
    .pop();

  return (
    <section
      id="product-exploded-showcase"
      ref={containerRef}
      className="relative h-[100dvh] min-h-[500px] w-full bg-black text-white selection:bg-silver/20 select-none overflow-hidden flex flex-col justify-between items-center"
    >
      {/* LUXURY ATELIER AMBIENT LIGHTING & DIAMOND PATTERN TEXTURE */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_25%,rgba(255,255,255,0.06),transparent_75%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-diamond-pattern opacity-20 pointer-events-none z-0" />

      {/* 1. TOP HERO BRAND HEADER */}
      <div className="shrink-0 w-full max-w-4xl mx-auto flex flex-col items-center text-center relative z-30 pt-9 sm:pt-10 pb-0.5 px-4">
        {/* Subtle Top Utility Bar: Quick Skip & Lock Status */}
        <div className="w-full flex items-center justify-between gap-2 mb-0.5 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-[11px]">
            {isExpanded ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <Unlock className="w-3 h-3" />
                <span>Đã bung đủ 5 tầng</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-300/90 font-medium">
                <Lock className="w-3 h-3" />
                <span>Rê chuột / giữ chạm vào ảnh</span>
              </span>
            )}
          </div>

          <button
            onClick={handleScrollToNext}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer text-[10px] sm:text-[11px]"
            title="Khám phá bộ sưu tập"
          >
            <span>Bỏ qua</span>
            <FastForward className="w-3 h-3" />
          </button>
        </div>

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
      <div className="relative w-full flex-1 min-h-0 flex items-center justify-center">

        {/* CỘT THÔNG SỐ BÊN TRÁI (Desktop / Tablet) */}
        <div className="absolute left-3 sm:left-6 lg:left-8 xl:left-12 top-[40%] -translate-y-1/2 z-30 space-y-2 max-w-[240px] lg:max-w-[280px] xl:max-w-[310px] hidden md:block pointer-events-auto">
          {componentsData.filter(c => c.side === 'left').map((comp) => {
            const Icon = comp.icon;
            const isVisible = currentFrame >= comp.activeFrames[0];
            const isHovered = activeCardIndex === comp.id;

            if (!isVisible) return null;

            return (
              <motion.div
                key={comp.id}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                onMouseEnter={() => setActiveCardIndex(comp.id)}
                onMouseLeave={() => setActiveCardIndex(null)}
                className={`p-2.5 sm:p-3 rounded-xl transition-all duration-300 border ${isHovered
                    ? 'glass-panel border-white/60 shadow-[0_0_25px_rgba(255,255,255,0.3)] scale-[1.02] bg-white/20'
                    : 'glass-panel border-white/15 hover:border-white/35 hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded bg-white/15 flex items-center justify-center text-slate-100 shrink-0">
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-sans font-bold uppercase tracking-wider text-slate-300 leading-normal">
                    Tầng 0{comp.id}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm lg:text-[15px] font-sans font-bold text-white tracking-wide leading-snug">
                  {comp.name}
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-200 font-light mt-0.5 leading-relaxed">
                  {comp.desc}
                </p>
                <div className="mt-1.5 pt-1 border-t border-white/10 text-[10px] sm:text-[11px] text-slate-300 font-mono truncate">
                  <span>{comp.spec}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* RESPONSIVE CANVAS STAGE (Đảm bảo dây chuyền nằm đúng tuyệt đối chính tâm màn hình) */}
        <div
          className="relative w-full h-full flex items-center justify-center min-h-0 overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)'
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%' }}
            className="w-full h-full block pointer-events-none"
          />

          <button
            type="button"
            aria-label="Bung 5 tầng linh kiện: rê chuột hoặc giữ chạm, rời ảnh để thu lại"
            aria-describedby="showcase-loading-status"
            aria-busy={!isLoaded && loadedCount < TOTAL_FRAMES}
            aria-expanded={isExpanded}
            onPointerEnter={event => { if (event.pointerType === 'mouse') animateTo(TOTAL_FRAMES - 1); }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={event => { if (event.isPrimary) collapse(); }}
            onPointerUp={event => { if (event.isPrimary) collapse(); }}
            onPointerCancel={event => { if (event.isPrimary) collapse(); }}
            onFocus={() => animateTo(TOTAL_FRAMES - 1)}
            onBlur={collapse}
            onClick={event => { if (event.detail === 0) animateTo(TOTAL_FRAMES - 1); }}
            onKeyDown={event => {
              if (event.key === 'Escape') collapse();
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                animateTo(TOTAL_FRAMES - 1);
              }
            }}
            className="absolute left-[20%] right-[20%] md:left-[32%] md:right-[32%] top-[8%] bottom-[5%] z-10 rounded-3xl bg-transparent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
            style={{ touchAction: 'pan-y' }}
          />
          <p id="showcase-loading-status" role="status" aria-live="polite"
            className="absolute bottom-2 inset-x-4 z-20 text-center text-[10px] sm:text-xs text-slate-300 pointer-events-none">
            {!isLoaded && (loadedCount < TOTAL_FRAMES
              ? `Đang chuẩn bị chuyển động: ${Math.round(loadedCount / TOTAL_FRAMES * 100)}%`
              : 'Không thể tải hoạt ảnh. Bạn vẫn có thể khám phá bộ sưu tập.')}
          </p>
        </div>

        {/* CỘT THÔNG SỐ BÊN PHẢI (Desktop / Tablet) */}
        <div className="absolute right-3 sm:right-6 lg:right-8 xl:right-12 top-[40%] -translate-y-1/2 z-30 space-y-2 max-w-[240px] lg:max-w-[280px] xl:max-w-[310px] hidden md:block pointer-events-auto">
          {componentsData.filter(c => c.side === 'right').map((comp) => {
            const Icon = comp.icon;
            const isVisible = currentFrame >= comp.activeFrames[0];
            const isHovered = activeCardIndex === comp.id;
            const isBaseLayer = comp.id === 5;

            if (!isVisible) return null;

            return (
              <motion.div
                key={comp.id}
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                onMouseEnter={() => setActiveCardIndex(comp.id)}
                onMouseLeave={() => setActiveCardIndex(null)}
                className={`p-2.5 sm:p-3 rounded-xl transition-all duration-300 border ${
                  isBaseLayer
                    ? isHovered
                      ? 'glass-panel border-white/90 shadow-[0_0_30px_rgba(255,255,255,0.45)] scale-[1.02] bg-white/25 ring-1 ring-white/50'
                      : 'glass-panel border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.2)] bg-white/10 hover:border-white/70'
                    : isHovered
                    ? 'glass-panel border-amber-300/80 shadow-[0_0_25px_rgba(251,191,36,0.35)] scale-[1.02] bg-white/20'
                    : 'glass-panel border-white/15 hover:border-white/35 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                    isBaseLayer ? 'bg-white/25 text-white shadow-sm' : 'bg-amber-400/20 text-amber-200'
                  }`}>
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <span className={`text-[11px] sm:text-xs font-sans font-bold uppercase tracking-wider leading-normal ${
                    isBaseLayer ? 'text-white' : 'text-amber-300'
                  }`}>
                    Tầng 0{comp.id} {isBaseLayer ? '· ĐẾ NGUYÊN KHỐI S925' : '· CORE TECH'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm lg:text-[15px] font-sans font-bold text-white tracking-wide leading-snug">
                  {comp.name}
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-200 font-light mt-0.5 leading-relaxed">
                  {comp.desc}
                </p>
                <div className="mt-1.5 pt-1 border-t border-white/10 text-[10px] sm:text-[11px] font-mono truncate flex items-center justify-between">
                  <span className={isBaseLayer ? 'text-slate-200 font-medium' : 'text-amber-200/95'}>{comp.spec}</span>
                  {comp.id === 3 && onOpenNfcDemo && (
                    <button
                      onClick={() => onOpenNfcDemo('emoria-lumen')}
                      className="text-amber-300 hover:text-white underline underline-offset-2 ml-2 flex items-center gap-1 font-semibold text-[10px] sm:text-[11px] cursor-pointer"
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Thử chạm</span>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>

      {/* Keep the card and canvas size fixed; only its layer text animates. */}
      <div data-showcase-layers className="md:hidden w-full max-w-sm sm:max-w-md h-[188px] sm:h-[176px] shrink-0 mx-auto px-3 mb-2 z-30">
        <div className="h-full w-full rounded-2xl p-3 glass-panel border border-white/20 bg-dark-950/95 shadow-[0_8px_32px_rgba(0,0,0,0.85)] flex flex-col">
          <div className="shrink-0 flex items-center justify-between gap-1 mb-2 pb-2 border-b border-white/10">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-amber-300">
              {activeComponentMobile ? `Tầng 0${activeComponentMobile.id}` : '5 tầng'}
            </span>
            <div className="flex items-center gap-1">
              {componentsData.map(comp => (
                <button key={comp.id} type="button"
                  onClick={() => handleJumpToLayer(comp.id)}
                  aria-label={`Xem tầng ${comp.id}`}
                  aria-pressed={activeComponentMobile?.id === comp.id}
                  className={`w-6 h-6 rounded-full text-[10px] font-bold font-mono flex items-center justify-center cursor-pointer ${
                    activeComponentMobile?.id === comp.id ? 'bg-amber-400 text-black' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}>
                  T{comp.id}
                </button>
              ))}
              <button type="button" onClick={() => setIsMobileDrawerOpen(true)}
                className="ml-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-[10px] font-sans flex items-center gap-1 cursor-pointer"
                title="Xem chi tiết cả 5 tầng">
                <span>5 Tầng</span><Layers className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <motion.div key={activeComponentMobile?.id || 'intro-text'}
              initial={{ opacity: 0.5, y: 3 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}>
              <h4 className="text-sm sm:text-base font-sans font-bold text-white tracking-wide leading-snug">
                {activeComponentMobile?.name || '5 Tầng Linh Kiện Bạc S925 & Chip NFC'}
              </h4>
              <p className="text-xs text-slate-200 font-light mt-1 leading-relaxed">
                {activeComponentMobile?.desc || 'Giữ chạm vào ảnh để bung linh kiện, thả tay để thu lại.'}
              </p>
              {activeComponentMobile && (
                <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                  <span className="text-amber-200 font-mono">{activeComponentMobile.spec}</span>
                  {activeComponentMobile.id === 3 && onOpenNfcDemo && (
                    <button type="button" onClick={() => onOpenNfcDemo('emoria-lumen')}
                      className="text-amber-300 underline underline-offset-2 flex items-center gap-1 shrink-0 cursor-pointer">
                      <Smartphone className="w-3 h-3" /><span>Thử chạm</span>
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Collection navigation stays available while the frames are preparing. */}
      <div className="shrink-0 relative z-30 w-full max-w-2xl mx-auto flex flex-col items-center gap-2 pb-3 px-3 sm:px-6">
        <p className="text-[10px] sm:text-xs text-slate-300 text-center">
          Rê chuột hoặc giữ chạm vào ảnh để bung linh kiện · Rời ảnh để thu lại
        </p>
        <button type="button" onClick={handleScrollToNext}
          className="cta-luxury-gold !px-8 !py-3.5 text-xs sm:text-sm tracking-[0.2em]">
          <span>Khám phá bộ sưu tập</span>
          <ChevronDown className="w-4 h-4 text-dark-950" />
        </button>
      </div>

      {/* 5. MOBILE FULL 5-LAYER DRAWER MODAL (Xem toàn bộ 5 tầng đầy đủ trên điện thoại) */}
      <AnimatePresence>
        {isMobileDrawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end"
            onClick={() => setIsMobileDrawerOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="w-full max-h-[82vh] bg-dark-950 border-t border-white/20 rounded-t-3xl p-4 flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold uppercase tracking-wider font-sans">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Cấu Trúc 5 Tầng Chế Tác EMORIA</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Chạm "Xem tầng này" để tua hoạt ảnh đến đúng vị trí
                  </p>
                </div>
                <button
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Layer Cards List */}
              <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
                {componentsData.map((comp) => {
                  const Icon = comp.icon;
                  const isCurrentActive = activeComponentMobile?.id === comp.id;
                  const isCoreTech = comp.id >= 3;

                  return (
                    <div
                      key={comp.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                        isCurrentActive
                          ? isCoreTech
                            ? 'border-amber-400/70 bg-amber-400/15 shadow-[0_0_20px_rgba(251,191,36,0.2)]'
                            : 'border-white/60 bg-white/15 shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                          : 'border-white/15 bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isCoreTech ? 'bg-amber-400/20 text-amber-300' : 'bg-white/15 text-slate-100'}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className={`text-xs font-sans font-bold uppercase tracking-wider ${isCoreTech ? 'text-amber-300' : 'text-slate-300'}`}>
                            Tầng 0{comp.id} {isCoreTech ? '· CORE TECH' : ''}
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            handleJumpToLayer(comp.id);
                            setIsMobileDrawerOpen(false);
                          }}
                          className={`px-3 py-1 rounded-full text-xs font-sans font-semibold transition-all cursor-pointer ${
                            isCurrentActive
                              ? 'bg-white text-dark-950 font-bold shadow-md'
                              : 'bg-white/10 text-slate-200 hover:bg-white/20'
                          }`}
                        >
                          {isCurrentActive ? 'Đang xem ✓' : 'Xem tầng này →'}
                        </button>
                      </div>

                      <h4 className="text-sm sm:text-base font-sans font-bold text-white tracking-wide">
                        {comp.name}
                      </h4>

                      <p className="text-xs sm:text-sm text-slate-200 font-light mt-1.5 leading-relaxed">
                        {comp.desc}
                      </p>

                      <div className="mt-2.5 pt-2 border-t border-white/10 text-xs flex items-center justify-between">
                        <span className={isCoreTech ? 'text-amber-200 font-mono font-medium' : 'text-slate-300 font-mono'}>
                          {comp.spec}
                        </span>
                        {comp.id === 3 && onOpenNfcDemo && (
                          <button
                            onClick={() => {
                              setIsMobileDrawerOpen(false);
                              onOpenNfcDemo('emoria-lumen');
                            }}
                            className="text-xs text-amber-300 underline underline-offset-2 flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>Thử một chạm</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
