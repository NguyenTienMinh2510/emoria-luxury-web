import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ShieldCheck, Cpu, Layers, Disc,
  ChevronDown, ArrowDown, Play, Pause, RotateCcw,
  Smartphone, FastForward, CheckCircle2, Lock, Unlock, User, X
} from 'lucide-react';

// Số lượng frames cuộn tối ưu (120 frames): mượt mà, tải nhanh và không mỏi tay
const TOTAL_FRAMES = 120;
const SOURCE_TOTAL_FRAMES = 300;

export default function ProductExplodedShowcase({ 
  mode = 'intro', // 'intro' | 'hero'
  onModeChange,
  currentUser,
  onOpenAuth,
  onExploreClick,
  onOpenNfcDemo
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imagesRef = useRef([]);
  
  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Refs for zero-latency event interception
  const isUnlockedRef = useRef(false);
  const currentFrameRef = useRef(0);
  const touchStartYRef = useRef(0);
  const postScrollDeltaYRef = useRef(0);
  const touchBufferRef = useRef(0);

  // Synchronize state with refs
  useEffect(() => {
    isUnlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  // Ánh xạ 120 frames đều từ 300 file ảnh gốc + cachebuster tránh lưu ảnh cũ
  const getFramePath = (index) => {
    const originalIndex = Math.min(
      SOURCE_TOTAL_FRAMES, 
      Math.max(1, Math.round(index * (SOURCE_TOTAL_FRAMES - 1) / (TOTAL_FRAMES - 1)) + 1)
    );
    const paddedIndex = String(originalIndex).padStart(3, '0');
    return `/assets/animation/ezgif-frame-${paddedIndex}.jpg?v=2`;
  };

  // Draw a specific frame onto Canvas with high-DPI, aspect-ratio contain, and zero-watermark guarantee
  const drawFrame = useCallback((frameIndex) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Find requested frame or closest loaded frame
    let img = imagesRef.current[frameIndex];
    if (!img || !img.complete) {
      for (let i = frameIndex - 1; i >= 0; i--) {
        if (imagesRef.current[i] && imagesRef.current[i].complete) {
          img = imagesRef.current[i];
          break;
        }
      }
    }

    if (!img || !img.complete) return;

    // Set canvas dimensions to match display container
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Điền nền màu đen thuần chủng đồng nhất tuyệt đối với ảnh hoạt ảnh
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate aspect-ratio contain for 1920x1080 (hoạt ảnh fit hoàn hảo cả desktop và điện thoại)
    const imgAspect = img.width / img.height;
    const canvasAspect = canvas.width / canvas.height;

    // Phóng to frames (1.32x desktop, 1.12x mobile) để mặt dây chuyền to hoành tráng, rõ nét, nhìn đã mắt
    const isMobile = window.innerWidth < 768;
    const scaleMultiplier = isMobile ? 1.12 : 1.32;
    let drawW, drawH, drawX, drawY;

    if (canvasAspect > imgAspect) {
      drawH = canvas.height * scaleMultiplier;
      drawW = drawH * imgAspect;
      drawX = (canvas.width - drawW) / 2;
      drawY = (canvas.height - drawH) / 2;
    } else {
      drawW = canvas.width * scaleMultiplier;
      drawH = drawW / imgAspect;
      drawX = (canvas.width - drawW) / 2;
      drawY = (canvas.height - drawH) / 2;
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Bảo vệ watermark 2 lớp: xóa triệt để vùng watermark góc dưới bên phải trên canvas
    if (frameIndex < 80) {
      const scale = drawW / img.width;
      const wmX = drawX + 1680 * scale;
      const wmY = drawY + 840 * scale;
      const wmW = 120 * scale;
      const wmH = 120 * scale;
      ctx.fillStyle = '#060608';
      ctx.fillRect(wmX, wmY, wmW, wmH);
    }
  }, []);

  // Preload 150 frames
  useEffect(() => {
    let isMounted = true;
    const images = new Array(TOTAL_FRAMES);
    let count = 0;

    // Load first frame immediately
    const firstImg = new Image();
    firstImg.src = getFramePath(0);
    firstImg.onload = () => {
      if (!isMounted) return;
      images[0] = firstImg;
      count++;
      setLoadedCount(count);
      drawFrame(0);
    };

    // Preload rest of 150 frames
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = getFramePath(i);
      img.onload = () => {
        if (!isMounted) return;
        images[i] = img;
        count++;
        setLoadedCount(count);
        if (count >= 20) {
          setIsLoaded(true);
        }
      };
      img.onerror = () => {
        if (!isMounted) return;
        count++;
        setLoadedCount(count);
      };
    }

    imagesRef.current = images;

    return () => {
      isMounted = false;
    };
  }, [drawFrame]);

  // Redraw on window resize & container size change to ensure crisp, perfectly centered rendering
  useEffect(() => {
    const handleResize = () => drawFrame(currentFrameRef.current);
    window.addEventListener('resize', handleResize);

    let ro = null;
    if (canvasRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        drawFrame(currentFrameRef.current);
      });
      ro.observe(canvasRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
    };
  }, [drawFrame]);

  // HARD SCROLL-LOCK MECHANISM WITH DWELL / RESISTANCE BUFFER:
  // Khóa cứng trang trong suốt 120 frames và GIỮ TRANG ở frame cuối để ngắm trọn vẹn,
  // chỉ khi người dùng cuộn tiếp một cách dứt khoát / mạnh mẽ mới cho trượt xuống tiếp
  useEffect(() => {
    const handleWheel = (e) => {
      const atTop = window.scrollY <= 15;
      if (!atTop) return;

      // 1. KHI CHƯA ĐẾN FRAME CUỐI (0 -> 118): Cuộn để bóc tách từng frame
      if (currentFrameRef.current < TOTAL_FRAMES - 1) {
        e.preventDefault();
        postScrollDeltaYRef.current = 0; // reset đệm

        const direction = Math.sign(e.deltaY);
        // Advance 1 to 4 frames per wheel tick for a smooth, natural explosion
        const step = Math.max(1, Math.min(4, Math.round(Math.abs(e.deltaY) / 30))) * direction;
        const next = Math.max(0, Math.min(TOTAL_FRAMES - 1, currentFrameRef.current + step));

        currentFrameRef.current = next;
        setCurrentFrame(next);
        drawFrame(next);

        if (next >= TOTAL_FRAMES - 1) {
          isUnlockedRef.current = true;
          setIsUnlocked(true);
        }
        return;
      }

      // 2. KHI ĐÃ HOÀN TẤT FRAME CUỐI CÙNG (Frame 119):
      if (currentFrameRef.current >= TOTAL_FRAMES - 1) {
        // Cuộn LÊN: Tua ngược hoạt ảnh ngay lập tức
        if (e.deltaY < 0) {
          e.preventDefault();
          postScrollDeltaYRef.current = 0;
          const step = Math.max(1, Math.min(4, Math.round(Math.abs(e.deltaY) / 30))) * -1;
          const next = Math.max(0, currentFrameRef.current + step);
          currentFrameRef.current = next;
          setCurrentFrame(next);
          drawFrame(next);

          if (next < TOTAL_FRAMES - 1) {
            isUnlockedRef.current = false;
            setIsUnlocked(false);
          }
          return;
        }

        // Cuộn XUỐNG: TẠO ĐỆM GIỮ TRANG (DWELL BUFFER)
        // Ngăn chặn quán tính lướt nhanh, giữ trang lại để ngắm toàn bộ linh kiện đã tách rời
        // Người dùng phải cuộn tiếp một cách dứt khoát (tích lũy deltaY >= 350) thì mới trượt xuống
        if (e.deltaY > 0) {
          postScrollDeltaYRef.current += Math.abs(e.deltaY);

          if (postScrollDeltaYRef.current < 350) {
            e.preventDefault(); // GIỮ TRANG LẠI!
            return;
          }

          // Đã cuộn mạnh dứt khoát: mở khóa cho trang trượt xuống tự nhiên
          isUnlockedRef.current = true;
          setIsUnlocked(true);
          return;
        }
      }
    };

    // Touch support for mobile devices
    const handleTouchStart = (e) => {
      if (e.touches && e.touches[0]) {
        touchStartYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      const atTop = window.scrollY <= 15;
      if (!atTop) return;
      if (!e.touches || !e.touches[0]) return;

      const deltaY = touchStartYRef.current - e.touches[0].clientY;
      touchStartYRef.current = e.touches[0].clientY;

      // Khi chưa đến frame cuối:
      if (currentFrameRef.current < TOTAL_FRAMES - 1) {
        e.preventDefault();
        touchBufferRef.current = 0;

        const direction = Math.sign(deltaY);
        const step = Math.max(1, Math.min(4, Math.round(Math.abs(deltaY) / 10))) * direction;
        const next = Math.max(0, Math.min(TOTAL_FRAMES - 1, currentFrameRef.current + step));

        currentFrameRef.current = next;
        setCurrentFrame(next);
        drawFrame(next);

        if (next >= TOTAL_FRAMES - 1) {
          isUnlockedRef.current = true;
          setIsUnlocked(true);
        }
        return;
      }

      // Khi đã ở frame cuối cùng:
      if (currentFrameRef.current >= TOTAL_FRAMES - 1) {
        // Vuốt xuống để tua lại (deltaY < 0):
        if (deltaY < 0) {
          e.preventDefault();
          touchBufferRef.current = 0;
          const step = Math.max(1, Math.min(4, Math.round(Math.abs(deltaY) / 10))) * -1;
          const next = Math.max(0, currentFrameRef.current + step);
          currentFrameRef.current = next;
          setCurrentFrame(next);
          drawFrame(next);

          if (next < TOTAL_FRAMES - 1) {
            isUnlockedRef.current = false;
            setIsUnlocked(false);
          }
          return;
        }

        // Vuốt lên để cuộn trang xuống (deltaY > 0):
        if (deltaY > 0) {
          touchBufferRef.current += deltaY;
          // Giữ trang trên mobile: vuốt ít nhất 130px dứt khoát mới cho trượt xuống
          if (touchBufferRef.current < 130) {
            e.preventDefault();
            return;
          }
          isUnlockedRef.current = true;
          setIsUnlocked(true);
          return;
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [drawFrame]);

  // Auto-play animation loop
  useEffect(() => {
    let intervalId;
    if (isAutoPlaying) {
      intervalId = setInterval(() => {
        const next = currentFrameRef.current + 1;
        if (next >= TOTAL_FRAMES) {
          setIsAutoPlaying(false);
          isUnlockedRef.current = true;
          setIsUnlocked(true);
          return;
        }
        currentFrameRef.current = next;
        setCurrentFrame(next);
        drawFrame(next);
      }, 30);
    }
    return () => clearInterval(intervalId);
  }, [isAutoPlaying, drawFrame]);

  // Scroll to next section handler
  const handleScrollToNext = () => {
    if (containerRef.current) {
      const targetY = containerRef.current.offsetTop + containerRef.current.offsetHeight;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  };

  // Reset to beginning
  const handleRestart = () => {
    currentFrameRef.current = 0;
    setCurrentFrame(0);
    isUnlockedRef.current = false;
    setIsUnlocked(false);
    drawFrame(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Skip straight to end & unlock
  const handleSkipToEnd = () => {
    currentFrameRef.current = TOTAL_FRAMES - 1;
    setCurrentFrame(TOTAL_FRAMES - 1);
    isUnlockedRef.current = true;
    setIsUnlocked(true);
    drawFrame(TOTAL_FRAMES - 1);
  };

  // 5 Components Specification Definition (scaled to 120 frames)
  const componentsData = [
    {
      id: 1,
      name: "Nắp Vòm Bạc S925 Đúc Khối",
      spec: "Bạc S925 cao cấp · Khắc logo EMORIA · Độ bóng gương",
      desc: "Mặt nạ bảo vệ đúc nguyên khối tinh xảo, đính kim cương trung tâm và họa tiết mặt trời rạng rỡ.",
      icon: Sparkles,
      side: "left",
      activeFrames: [30, 120]
    },
    {
      id: 2,
      name: "Seal Silicon Kháng Nước IP68",
      spec: "Chuẩn kháng nước IP68 · Chống ẩm & mồ hôi",
      desc: "Vòng đệm đàn hồi cao cấp giúp khoang chứa linh kiện kín khít tuyệt đối, an toàn khi đi mưa.",
      icon: ShieldCheck,
      side: "left",
      activeFrames: [48, 120]
    },
    {
      id: 3,
      name: "Vi Chip NFC NTAG215 & Cuộn Đồng",
      spec: "Không dùng pin · Tuổi thọ >10 năm · Chạm 0.5s",
      desc: "Trái tim lưu giữ Memory Space. Hoạt động bằng cảm ứng từ trường từ smartphone mà không cần sạc.",
      icon: Cpu,
      side: "right",
      activeFrames: [66, 120]
    },
    {
      id: 4,
      name: "Lá Chắn Từ Ferrite Chống Nhiễu",
      spec: "Độ dày 0.2mm · Triệt tiêu nhiễu sóng kim loại",
      desc: "Lớp màng cách từ đặc chủng giúp sóng vô tuyến xuyên thấu qua lớp bạc S925 mượt mà không độ trễ.",
      icon: Layers,
      side: "right",
      activeFrames: [80, 120]
    },
    {
      id: 5,
      name: "Khung Đáy Bạc S925 & Quai Dây",
      spec: "Chốt hàn laser · Đai ngàm khóa kép · Chắc chắn",
      desc: "Phần đế chịu lực định vị toàn bộ linh kiện thành một khối trang sức trang nhã, hoàn hảo.",
      icon: Disc,
      side: "right",
      activeFrames: [94, 120]
    }
  ];

  // Chuyển frame nhanh đến tầng linh kiện được chọn
  const handleJumpToLayer = (layerId) => {
    const comp = componentsData.find(c => c.id === layerId);
    if (comp) {
      const targetFrame = comp.activeFrames[0];
      currentFrameRef.current = targetFrame;
      setCurrentFrame(targetFrame);
      drawFrame(targetFrame);
      if (targetFrame >= TOTAL_FRAMES - 1) {
        isUnlockedRef.current = true;
        setIsUnlocked(true);
      }
    }
  };

  const progressPercent = Math.min(100, Math.round((currentFrame / (TOTAL_FRAMES - 1)) * 100));

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
      <div className="shrink-0 w-full max-w-4xl mx-auto flex flex-col items-center text-center relative z-30 pt-14 sm:pt-16 px-4">
        {/* Subtle Top Utility Bar: Quick Skip & Lock Status */}
        <div className="w-full flex items-center justify-between gap-2 mb-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-[11px]">
            {isUnlocked ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <Unlock className="w-3 h-3" />
                <span>Đã mở khóa cuộn</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-300/90 font-medium">
                <Lock className="w-3 h-3" />
                <span>Lăn chuột để bóc tách</span>
              </span>
            )}
          </div>

          <button
            onClick={handleSkipToEnd}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer text-[10px] sm:text-[11px]"
            title="Lướt nhanh đến khung hình cuối và mở khóa"
          >
            <span>Bỏ qua</span>
            <FastForward className="w-3 h-3" />
          </button>
        </div>

        {/* 3D Metallic EMORIA Logo */}
        <motion.div
          animate={{ y: [-3, 3, -3] }}
          transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
          className="relative inline-flex flex-col items-center select-none mt-1"
        >
          <img
            src="/assets/logo.png"
            alt="EMORIA Logo"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
            className="w-[72vw] max-w-[290px] sm:max-w-[360px] md:max-w-[400px] h-auto object-contain drop-shadow-[0_6px_28px_rgba(255,255,255,0.25)] select-none"
          />
        </motion.div>

        {/* Official Slogan with Silver Gradients & Diamond Accents */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 mt-1 sm:mt-1.5 px-4">
          <span className="w-6 sm:w-10 h-px bg-gradient-to-r from-transparent via-slate-400/40 to-transparent" />
          <p className="text-[10px] sm:text-xs md:text-sm font-sans font-medium tracking-[0.28em] sm:tracking-[0.38em] text-transparent bg-clip-text bg-gradient-to-r from-slate-300 via-white to-slate-300 uppercase text-center drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            MỘT CHẠM MỞ KÍ ỨC · TRỌN ĐỜI GIỮ YÊU THƯƠNG
          </p>
          <span className="w-6 sm:w-10 h-px bg-gradient-to-r from-transparent via-slate-400/40 to-transparent" />
        </div>

        {/* PURE TEXT AUTH LINKS: KHÔNG Ô BUTTON, KHÔNG ICON, KHÔNG LỖI FONT */}
        <div className="mt-2 sm:mt-2.5 flex items-center justify-center">
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
        <div className="absolute left-3 sm:left-6 lg:left-10 xl:left-14 top-1/2 -translate-y-1/2 z-30 space-y-2 max-w-[210px] lg:max-w-[240px] hidden md:block pointer-events-auto">
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
                className={`p-2.5 rounded-xl transition-all duration-300 border ${isHovered
                    ? 'glass-panel border-white/50 shadow-silver-glow scale-105 bg-white/20'
                    : 'glass-panel border-white/10 hover:border-white/30 hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded bg-white/10 flex items-center justify-center text-slate-200 shrink-0">
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-400 leading-normal">
                    Tầng 0{comp.id}
                  </span>
                </div>
                <h4 className="text-xs font-sans font-bold text-white tracking-wide leading-snug">
                  {comp.name}
                </h4>
                <p className="text-[10px] text-slate-300 font-light mt-0.5 leading-relaxed">
                  {comp.desc}
                </p>
                <div className="mt-1 pt-1 border-t border-white/10 text-[9px] text-slate-400 font-mono">
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
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)'
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%' }}
            className="w-full h-full block pointer-events-none"
          />

          {/* Loading Indicator */}
          {!isLoaded && loadedCount < 10 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-950/70 backdrop-blur-sm z-20">
              <div className="w-7 h-7 border-2 border-slate-400/30 border-t-white rounded-full animate-spin mb-2" />
              <p className="text-[11px] tracking-widest uppercase text-slate-300 font-sans">
                Đang chuẩn bị khung hình: {Math.round((loadedCount / TOTAL_FRAMES) * 100)}%
              </p>
            </div>
          )}
        </div>

        {/* CỘT THÔNG SỐ BÊN PHẢI (Desktop / Tablet) */}
        <div className="absolute right-3 sm:right-6 lg:right-10 xl:right-14 top-1/2 -translate-y-1/2 z-30 space-y-2 max-w-[210px] lg:max-w-[240px] hidden md:block pointer-events-auto">
          {componentsData.filter(c => c.side === 'right').map((comp) => {
            const Icon = comp.icon;
            const isVisible = currentFrame >= comp.activeFrames[0];
            const isHovered = activeCardIndex === comp.id;

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
                className={`p-2.5 rounded-xl transition-all duration-300 border ${isHovered
                    ? 'glass-panel border-amber-300/50 shadow-silver-glow scale-105 bg-white/20'
                    : 'glass-panel border-white/10 hover:border-white/30 hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded bg-amber-400/20 flex items-center justify-center text-amber-200 shrink-0">
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-amber-300 leading-normal">
                    Tầng 0{comp.id} · CORE TECH
                  </span>
                </div>
                <h4 className="text-xs font-sans font-bold text-white tracking-wide leading-snug">
                  {comp.name}
                </h4>
                <p className="text-[10px] text-slate-300 font-light mt-0.5 leading-relaxed">
                  {comp.desc}
                </p>
                <div className="mt-1 pt-1 border-t border-white/10 text-[9px] text-amber-200/90 font-mono">
                  <span>{comp.spec}</span>
                </div>
              </motion.div>
            );
          })}

          {/* Quick Interactive Button to Test Touch Demo */}
          {onOpenNfcDemo && isUnlocked && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => onOpenNfcDemo('emoria-lumen')}
              className="w-full p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-[11px] font-sans font-medium flex items-center justify-center gap-1.5 text-white shadow-silver-glow transition-all group cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-slate-300 group-hover:scale-110 transition-transform" />
              <span>Mô phỏng "Một chạm"</span>
            </motion.button>
          )}
        </div>

      </div>

      {/* 3. KHUNG THÔNG TIN BÓC TÁCH CHO GIAO DIỆN MOBILE */}
      <div className="md:hidden w-full max-w-sm sm:max-w-md mx-auto px-3 mb-1.5 z-30">
        <AnimatePresence mode="wait">
          {activeComponentMobile ? (
            <motion.div
              key={activeComponentMobile.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="w-full rounded-2xl p-2.5 glass-panel border border-white/20 bg-dark-950/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.85)]"
            >
              {/* Header: Tầng Badge + Chuyển nhanh 5 tầng + Nút xem toàn bộ */}
              <div className="flex items-center justify-between gap-1 mb-1 pb-1 border-b border-white/10">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${activeComponentMobile.id >= 3 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-slate-300'} animate-pulse`} />
                  <span className={`text-[10px] font-sans font-bold uppercase tracking-wider ${activeComponentMobile.id >= 3 ? 'text-amber-300' : 'text-slate-300'}`}>
                    Tầng 0{activeComponentMobile.id} {activeComponentMobile.id >= 3 ? '· CORE TECH' : ''}
                  </span>
                </div>

                {/* 5 Layer Navigation Pills */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((num) => {
                    const isActive = activeComponentMobile.id === num;
                    return (
                      <button
                        key={num}
                        onClick={() => handleJumpToLayer(num)}
                        className={`w-5 h-5 rounded-full text-[9px] font-bold font-mono transition-all flex items-center justify-center cursor-pointer ${
                          isActive
                            ? num >= 3
                              ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.9)] scale-110'
                              : 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.9)] scale-110'
                            : 'bg-white/10 text-slate-400 hover:text-white hover:bg-white/20'
                        }`}
                        title={`Xem Tầng 0${num}`}
                      >
                        T{num}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setIsMobileDrawerOpen(true)}
                    className="ml-1 px-1.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-[9px] font-sans flex items-center gap-0.5 cursor-pointer"
                    title="Xem chi tiết cả 5 tầng"
                  >
                    <span>5 Tầng</span>
                    <Layers className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>

              {/* Tên Tầng */}
              <h4 className="text-xs font-sans font-bold text-white tracking-wide leading-snug">
                {activeComponentMobile.name}
              </h4>

              {/* Mô tả đầy đủ */}
              <p className="text-[10px] text-slate-300 font-light mt-0.5 leading-snug">
                {activeComponentMobile.desc}
              </p>

              {/* Thông số kỹ thuật */}
              <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between text-[9px]">
                <span className={activeComponentMobile.id >= 3 ? 'text-amber-200 font-mono font-medium' : 'text-slate-400 font-mono'}>
                  {activeComponentMobile.spec}
                </span>
                {activeComponentMobile.id === 3 && onOpenNfcDemo && (
                  <button
                    onClick={() => onOpenNfcDemo('emoria-lumen')}
                    className="text-[9px] text-amber-300 underline underline-offset-2 flex items-center gap-0.5 ml-2 cursor-pointer shrink-0 font-medium"
                  >
                    <Smartphone className="w-2.5 h-2.5" />
                    <span>Thử chạm</span>
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            /* Khi đang ở Frame 0-29 trước khi tách */
            <motion.div
              key="intro-card"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="w-full rounded-2xl p-2.5 glass-panel border border-white/15 bg-dark-950/85 backdrop-blur-xl shadow-lg"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 text-[10px] font-sans font-medium text-slate-200">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>5 Tầng Linh Kiện Bạc S925 & Chip NFC</span>
                </div>
                <button
                  onClick={() => setIsMobileDrawerOpen(true)}
                  className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-[9px] font-sans flex items-center gap-1 cursor-pointer"
                >
                  <span>Xem 5 tầng</span>
                  <Layers className="w-2.5 h-2.5" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                Vuốt màn hình hoặc chạm tầng dưới đây để khám phá:
              </p>
              <div className="flex items-center justify-between gap-1 mt-1.5 pt-1 border-t border-white/10">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleJumpToLayer(num)}
                    className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] text-slate-300 hover:text-white font-mono flex items-center justify-center cursor-pointer"
                  >
                    <span>Tầng 0{num}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 4. BOTTOM CONTROLS & DYNAMIC PROGRESS BAR */}
      <div className="shrink-0 relative z-30 w-full max-w-2xl mx-auto flex flex-col items-center pb-2.5 sm:pb-3 px-3 sm:px-6">

        {/* Action Prompt / Next Section Unlock Status */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs mb-1.5 sm:mb-2">
          {isUnlocked ? (
            /* Khi đã chạy hết 120 frames: Nút mở khóa để tiếp tục cuộn */
            <motion.button
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleScrollToNext}
              className="flex items-center gap-2 px-5 py-1.5 rounded-full bg-gradient-to-r from-slate-100 via-white to-slate-200 text-dark-950 font-sans font-semibold text-[11px] sm:text-xs tracking-wider uppercase shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:scale-105 transition-all cursor-pointer"
            >
              <span>Khám phá bộ sưu tập (Cuộn mạnh để xuống)</span>
              <ChevronDown className="w-3.5 h-3.5 text-dark-950 animate-bounce" />
            </motion.button>
          ) : (
            /* Khi đang cuộn trong 120 frames: Khóa chặt trang và nhắc người dùng */
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] sm:text-xs">
              <ArrowDown className="w-3 h-3 animate-bounce text-slate-300" />
              <span className="tracking-wide text-slate-300 font-sans">
                {currentFrame === 0
                  ? 'Lăn chuột để bắt đầu bóc tách'
                  : 'Tiếp tục lăn chuột để xem hết linh kiện'}
              </span>
              <span className="text-slate-500 font-mono text-[10px]">
                ({currentFrame + 1}/{TOTAL_FRAMES})
              </span>
            </div>
          )}

          {/* Nút Play / Pause */}
          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            title={isAutoPlaying ? "Tạm dừng" : "Tự động phát hoạt ảnh"}
            className="p-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {isAutoPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>

          {/* Nút Reset */}
          <button
            onClick={handleRestart}
            title="Xem lại từ đầu"
            className="p-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* Interactive Scrubbing Slider */}
        <div className="w-full flex items-center gap-3">
          <input
            type="range"
            min="0"
            max={TOTAL_FRAMES - 1}
            value={currentFrame}
            onChange={(e) => {
              const val = Number(e.target.value);
              currentFrameRef.current = val;
              setCurrentFrame(val);
              drawFrame(val);
              if (val >= TOTAL_FRAMES - 1) {
                isUnlockedRef.current = true;
                setIsUnlocked(true);
              }
            }}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:accent-slate-200"
          />
        </div>

        {/* Status Label */}
        <div className="flex justify-between w-full mt-1 text-[9px] sm:text-[10px] text-slate-500 font-mono">
          <span>Nguyên vẹn</span>
          <span className={isUnlocked ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
            {isUnlocked ? '✓ 100% Phân tách · Đã mở khóa' : `Tiến trình: ${progressPercent}%`}
          </span>
          <span>Phân tách tối đa</span>
        </div>

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
              <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
                {componentsData.map((comp) => {
                  const Icon = comp.icon;
                  const isCurrentActive = activeComponentMobile?.id === comp.id;
                  const isCoreTech = comp.id >= 3;

                  return (
                    <div
                      key={comp.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        isCurrentActive
                          ? isCoreTech
                            ? 'border-amber-400/60 bg-amber-400/10 shadow-[0_0_15px_rgba(251,191,36,0.15)]'
                            : 'border-white/50 bg-white/10'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded flex items-center justify-center ${isCoreTech ? 'bg-amber-400/20 text-amber-300' : 'bg-white/10 text-slate-200'}`}>
                            <Icon className="w-3 h-3" />
                          </div>
                          <span className={`text-[10px] font-sans font-bold uppercase tracking-wider ${isCoreTech ? 'text-amber-300' : 'text-slate-400'}`}>
                            Tầng 0{comp.id} {isCoreTech ? '· CORE TECH' : ''}
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            handleJumpToLayer(comp.id);
                            setIsMobileDrawerOpen(false);
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-medium transition-all cursor-pointer ${
                            isCurrentActive
                              ? 'bg-white text-dark-950 font-bold shadow-sm'
                              : 'bg-white/10 text-slate-300 hover:bg-white/20'
                          }`}
                        >
                          {isCurrentActive ? 'Đang xem ✓' : 'Xem tầng này →'}
                        </button>
                      </div>

                      <h4 className="text-xs font-sans font-bold text-white tracking-wide">
                        {comp.name}
                      </h4>

                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-relaxed">
                        {comp.desc}
                      </p>

                      <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[10px] flex items-center justify-between">
                        <span className={isCoreTech ? 'text-amber-200 font-mono' : 'text-slate-400 font-mono'}>
                          {comp.spec}
                        </span>
                        {comp.id === 3 && onOpenNfcDemo && (
                          <button
                            onClick={() => {
                              setIsMobileDrawerOpen(false);
                              onOpenNfcDemo('emoria-lumen');
                            }}
                            className="text-[10px] text-amber-300 underline underline-offset-2 flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <Smartphone className="w-3 h-3" />
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
