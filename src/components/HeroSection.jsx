import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';


export default function HeroSection({ onExploreClick, currentUser, onOpenAuth }) {
  // Dynamic canvas for silver dust particles only (clean, no overlapping circles)
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Silver Dust Particle System
    const particleCount = Math.min(Math.floor(width / 24), 50);
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.4,
      baseAlpha: Math.random() * 0.45 + 0.15,
      alpha: 0.2,
      twinkleSpeed: Math.random() * 0.02 + 0.008,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -(Math.random() * 0.3 + 0.1),
      sparklePhase: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Render Floating Silver Dust Sparkles
      particles.forEach((p) => {
        p.sparklePhase += p.twinkleSpeed;
        p.alpha = p.baseAlpha + Math.sin(p.sparklePhase) * 0.25;
        if (p.alpha < 0.04) p.alpha = 0.04;

        p.x += p.vx;
        p.y += p.vy;

        if (p.y < 0) {
          p.y = height;
          p.x = Math.random() * width;
        }
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(241, 245, 249, ${p.alpha})`;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = p.radius * 3;
        ctx.fill();

        if (p.radius > 1.2) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${p.alpha * 0.5})`;
          ctx.lineWidth = 0.5;
          const flareLen = p.radius * 2.8;
          ctx.beginPath();
          ctx.moveTo(p.x - flareLen, p.y);
          ctx.lineTo(p.x + flareLen, p.y);
          ctx.moveTo(p.x, p.y - flareLen);
          ctx.lineTo(p.x, p.y + flareLen);
          ctx.stroke();
        }
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <section
      id="hero"
      className="relative min-h-[100dvh] lg:h-screen w-full flex flex-col items-center justify-between pt-20 sm:pt-24 pb-6 px-4 sm:px-6 overflow-hidden bg-dark-950 select-none"
    >
      {/* Dynamic Canvas Background for Ambient Silver Dust */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-70"
      />

      {/* Subtle Diamond Pattern Overlay */}
      <div className="absolute inset-0 bg-diamond-pattern opacity-25 pointer-events-none z-0" />

      {/* Mobile Protective Dark Overlay for maximum text contrast */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none pointer-events-none z-0" />

      {/* Ambient Lighting Glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] sm:w-[950px] h-[500px] bg-gradient-to-b from-white/10 via-slate-300/5 to-transparent rounded-full blur-3xl pointer-events-none z-0" />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-t from-slate-300/10 via-white/5 to-transparent rounded-full blur-3xl pointer-events-none z-0" />

      {/* 1. ĐỊNH VỊ BACKGROUND DÂY CHUYỀN CHUẨN TÂM (Absolute True Center) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 0.52, scale: 1.0 }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="flex items-center justify-center w-full max-w-[900px] px-4 [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_72%)] [-webkit-mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_72%)]"
        >
          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="w-full flex items-center justify-center"
          >
            <img
              src="/assets/background_neck.png"
              alt="EMORIA S925 Necklace Background"
              className="w-[90vw] sm:w-[85vw] max-w-[900px] h-auto object-contain mix-blend-screen contrast-125 brightness-110 select-none pointer-events-none"
            />
          </motion.div>
        </motion.div>
      </div>

      {/* 2. Official EMORIA Logo & Slogan (z-20) */}
      <div className="w-full max-w-4xl mx-auto text-center flex flex-col items-center z-20 mt-1 sm:mt-3">
        {/* Floating Logo Container */}
        <motion.div
          animate={{ y: [-4, 4, -4] }}
          transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
          className="relative inline-flex flex-col items-center cursor-pointer group"
        >
          <img
            src="/assets/logo.png"
            alt="EMORIA Logo"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
            className="w-[88vw] max-w-[520px] sm:max-w-[620px] md:max-w-[700px] h-auto object-contain drop-shadow-[0_4px_20px_rgba(255,255,255,0.25)] select-none"
          />
        </motion.div>

        {/* Official Slogan */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mt-2 sm:mt-3 text-xs sm:text-sm font-sans font-semibold tracking-[0.25em] sm:tracking-[0.35em] text-slate-200 uppercase text-center drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] px-4"
        >
          MỘT CHẠM MỞ KÍ ỨC - TRỌN ĐỜI GIỮ YÊU THƯƠNG
        </motion.p>
      </div>

      <div className="w-full max-w-md mx-auto z-20 flex flex-col items-center justify-center my-auto min-h-[160px]">
        {currentUser ? <div className="text-center space-y-3"><p className="text-slate-300 break-words">Xin chào, {currentUser}</p><button className="store-button" onClick={()=>onOpenAuth('login')}>Tài khoản của bạn</button></div> : <div className="flex items-center justify-center gap-5 sm:gap-10">
          <button onClick={()=>onOpenAuth('login')} className="min-h-11 px-4 text-base sm:text-lg text-slate-200 hover:text-white">Đăng nhập</button><span aria-hidden="true" className="text-slate-500">✦</span><button onClick={()=>onOpenAuth('register')} className="min-h-11 px-4 text-base sm:text-lg text-slate-200 hover:text-white">Đăng ký</button>
        </div>}
      </div>

      {/* 4. Bottom Scroll Indicator / Explore Link (z-20) */}
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center relative z-20">
        <motion.button
          onClick={onExploreClick}
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-colors group cursor-pointer"
          aria-label="Khám phá bộ sưu tập"
        >
          <span className="text-[10px] sm:text-[11px] tracking-[0.25em] uppercase text-slate-300 group-hover:text-white font-sans font-medium transition-colors">
            Khám phá bộ sưu tập
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition-transform group-hover:translate-y-0.5" />
        </motion.button>
      </div>
    </section>
  );
}
