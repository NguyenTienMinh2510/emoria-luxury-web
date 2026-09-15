import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, CheckCircle2, ArrowLeft, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export default function HeroSection({ onExploreClick, onLoginSuccess, onOpenAuth }) {
  // authState: 'banner' | 'login' | 'register'
  const [authState, setAuthState] = useState('banner');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authError, setAuthError] = useState('');

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

  // Helper to format email from username/email input
  const formatEmail = (input) => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;
    return `${trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@emoria.vn`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError('');

    const targetEmail = formatEmail(username);

    // If Supabase is configured, use real Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        if (authState === 'login') {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: targetEmail,
            password: password,
          });

          if (error) {
            // Translate common Supabase error messages to friendly Vietnamese
            if (error.message.includes('Invalid login credentials')) {
              throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
            }
            if (error.message.includes('Email not confirmed')) {
              throw new Error('Tài khoản chưa được xác nhận email. Vui lòng kiểm tra hộp thư.');
            }
            throw new Error(error.message);
          }

          setAuthSuccess(true);
          const displayName = data.user?.user_metadata?.full_name || username || 'Thành viên EMORIA';
          if (onLoginSuccess) onLoginSuccess(displayName);

          setTimeout(() => {
            setAuthSuccess(false);
            setAuthState('banner');
          }, 1400);
        } else {
          // Register
          const { data, error } = await supabase.auth.signUp({
            email: targetEmail,
            password: password,
            options: {
              data: {
                full_name: fullName || username,
                username: username,
              },
            },
          });

          if (error) {
            if (error.message.includes('User already registered')) {
              throw new Error('Tên đăng nhập / Email này đã được đăng ký.');
            }
            if (error.message.includes('Password should be at least')) {
              throw new Error('Mật khẩu phải có tối thiểu 6 ký tự.');
            }
            throw new Error(error.message);
          }

          setAuthSuccess(true);
          const displayName = fullName || username || 'Thành viên EMORIA';
          if (onLoginSuccess) onLoginSuccess(displayName);

          setTimeout(() => {
            setAuthSuccess(false);
            setAuthState('banner');
          }, 1400);
        }
      } catch (err) {
        setAuthError(err.message || 'Thao tác xác thực không thành công.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Offline / Demo fallback
      setTimeout(() => {
        setIsSubmitting(false);
        setAuthSuccess(true);
        if (onLoginSuccess) {
          onLoginSuccess(fullName || username || 'Thành viên EMORIA VIP');
        }
        setTimeout(() => {
          setAuthSuccess(false);
          setAuthState('banner');
        }, 1400);
      }, 700);
    }
  };

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

      {/* 3. Center Stage: "Đăng nhập | Đăng kí" <-> Glassmorphism Form (z-20) */}
      <div className="w-full max-w-md mx-auto z-20 flex flex-col items-center justify-center my-auto min-h-[190px]">
        <AnimatePresence mode="wait">
          {/* STATE 1: Minimalist Text Navigation */}
          {authState === 'banner' && (
            <motion.div
              key="banner-buttons"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center gap-6 sm:gap-10 w-full"
            >
              {/* Nút Đăng nhập */}
              <button
                onClick={() => {
                  onOpenAuth?.();
                  setAuthError('');
                }}
                className="group relative px-4 py-2 text-base sm:text-lg font-sans font-medium tracking-wide text-slate-200 hover:text-white transition-all duration-300"
              >
                <span className="relative z-10 drop-shadow-[0_2px_8px_rgba(255,255,255,0.25)]">
                  Đăng nhập
                </span>
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1.5px] bg-gradient-to-r from-transparent via-slate-200 to-transparent group-hover:w-full transition-all duration-300" />
              </button>

              <span className="text-slate-500 text-xs opacity-60 select-none">✦</span>

              {/* Nút Đăng ký */}
              <button
                onClick={() => {
                  onOpenAuth?.();
                  setAuthError('');
                }}
                className="group relative px-4 py-2 text-base sm:text-lg font-sans font-medium tracking-wide text-slate-200 hover:text-white transition-all duration-300"
              >
                <span className="relative z-10 drop-shadow-[0_2px_8px_rgba(255,255,255,0.25)]">
                  Đăng ký
                </span>
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1.5px] bg-gradient-to-r from-transparent via-slate-200 to-transparent group-hover:w-full transition-all duration-300" />
              </button>
            </motion.div>
          )}

          {/* STATE 2: Glassmorphism Form with Supabase Auth */}
          {(authState === 'login' || authState === 'register') && (
            <motion.div
              key="auth-form"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -12 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl relative border border-white/20 backdrop-blur-2xl bg-black/75"
            >
              <button
                onClick={() => {
                  setAuthState('banner');
                  setAuthError('');
                }}
                className="absolute top-4 left-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Quay lại"
                aria-label="Quay lại"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* Tiêu đề form */}
              <div className="text-center mb-4 pt-1">
                <h3 className="text-lg sm:text-xl font-sans font-bold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.25)]">
                  {authState === 'login' ? 'Đăng Nhập' : 'Đăng Ký Thành Viên'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
                  {authState === 'login'
                    ? 'Kết nối với Memory Space của bạn'
                    : 'Bắt đầu lưu giữ những ký ức quý giá'}
                </p>
              </div>

              {/* Error Notification */}
              {authError && (
                <div className="mb-3 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {authSuccess ? (
                <div className="py-5 flex flex-col items-center text-center space-y-2.5">
                  <CheckCircle2 className="w-11 h-11 text-emerald-400 animate-bounce" />
                  <p className="text-sm font-medium text-emerald-300">
                    {authState === 'login' ? 'Đăng nhập thành công!' : 'Đăng ký thành công!'}
                  </p>
                  <p className="text-xs text-slate-400">Đang đồng bộ chip NFC &amp; Memory Space...</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  {authState === 'register' && (
                    <div className="space-y-1">
                      <label htmlFor="hero-fullname" className="text-xs font-medium text-slate-300 ml-2">Họ và tên</label>
                      <input
                        id="hero-fullname"
                        name="fullName"
                        type="text"
                        required
                        placeholder="Nguyễn Văn A"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white/[0.08] border border-white/15 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/40 transition-all font-sans"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label htmlFor="hero-username" className="text-xs font-medium text-slate-300 ml-2">Tên đăng nhập hoặc Email</label>
                    <input
                      id="hero-username"
                      name="username"
                      type="text"
                      required
                      placeholder="tên_đăng_nhập hoặc email"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl bg-white/[0.08] border border-white/15 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/40 transition-all font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="hero-password" className="text-xs font-medium text-slate-300 ml-2">Mật khẩu</label>
                    <input
                      id="hero-password"
                      name="password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl bg-white/[0.08] border border-white/15 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/40 transition-all font-sans"
                    />
                  </div>

                  {/* Nút Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 min-h-[44px] mt-2 rounded-xl bg-gradient-to-r from-slate-200 via-white to-slate-300 text-slate-950 font-sans font-bold text-sm shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>{authState === 'login' ? 'Đăng nhập ngay' : 'Tạo tài khoản'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* Nút chuyển đổi Đăng nhập / Đăng ký */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthState(authState === 'login' ? 'register' : 'login');
                        setAuthError('');
                      }}
                      className="text-[11px] sm:text-xs text-slate-400 hover:text-white underline transition-colors cursor-pointer"
                    >
                      {authState === 'login'
                        ? 'Chưa có tài khoản? Đăng ký ngay'
                        : 'Đã có tài khoản? Đăng nhập'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
