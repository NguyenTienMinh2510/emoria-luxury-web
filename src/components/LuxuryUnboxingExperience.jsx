import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Heart } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider.jsx';

/**
 * Web Audio API synthesizer for an ethereal crystal chime chord.
 * Zero external network dependency, instant and high-fidelity sound.
 */
function playCrystalChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;
    // Harmonic frequencies for an uplifting golden chime (E Major 9th chord)
    const freqs = [659.25, 830.61, 987.77, 1318.51, 1661.22];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.detune.setValueAtTime((i % 2 === 0 ? 3 : -3), now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08 / (i + 1), now + 0.04 + i * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8 + i * 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.03);
      osc.stop(now + 2.5);
    });
  } catch {
    // Graceful fallback
  }
}

export default function LuxuryUnboxingExperience({ onUnboxed, hasIntroVideo = false }) {
  const { t } = useLanguage();
  const [isOpening, setIsOpening] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleOpen = () => {
    if (isOpening || isDone) return;
    setIsOpening(true);

    // 1. Play crystal chime sound
    playCrystalChime();

    // 2. Launch royal gold dust confetti
    try {
      confetti({
        particleCount: 75,
        spread: 85,
        origin: { y: 0.5 },
        colors: ['#D4AF37', '#FFD700', '#FFF8DC', '#E6CA65', '#C5A059'],
        disableForReducedMotion: true
      });
      setTimeout(() => {
        confetti({
          particleCount: 40,
          angle: 60,
          spread: 55,
          origin: { x: 0.15, y: 0.55 },
          colors: ['#D4AF37', '#FFDF73']
        });
        confetti({
          particleCount: 40,
          angle: 120,
          spread: 55,
          origin: { x: 0.85, y: 0.55 },
          colors: ['#D4AF37', '#FFDF73']
        });
      }, 250);
    } catch {
      // Confetti fallback
    }

    // 3. Smooth letter unfolding transition leading directly to the video intro
    setTimeout(() => {
      setIsDone(true);
      setTimeout(() => {
        onUnboxed?.();
      }, 650);
    }, 1100);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950 overflow-hidden select-none cursor-pointer"
      onClick={handleOpen}
    >
      {/* Deep romantic ambient backdrop with warm candlelight & gold aura */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="w-[800px] h-[800px] rounded-full bg-gradient-to-tr from-amber-600/10 via-rose-950/20 to-transparent blur-[140px] animate-pulse" />
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-amber-500/5 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full bg-amber-700/5 blur-[120px]" />
      </div>

      <AnimatePresence mode="wait">
        {!isDone ? (
          <motion.div
            key="luxury-envelope-card"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{
              opacity: 1,
              scale: isOpening ? [1, 1.03, 1.15] : 1,
              rotateX: isOpening ? [0, 8, -4] : 0,
              filter: isOpening ? 'brightness(1.3)' : 'brightness(1)'
            }}
            exit={{ opacity: 0, scale: 1.2, filter: 'blur(16px)' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-[96vw] md:w-[92vw] max-w-5xl h-[88vh] max-h-[820px] rounded-[32px] sm:rounded-[44px] bg-gradient-to-b from-[#1c1815] via-[#12100e] to-[#090807] border-2 border-amber-400/40 shadow-[0_35px_100px_rgba(0,0,0,0.95),0_0_90px_rgba(212,175,55,0.22)] flex items-center justify-center overflow-hidden p-6 sm:p-12"
          >
            {/* Fine luxury letter paper texture & gilded decorative inner border */}
            <div className="absolute inset-3 sm:inset-5 rounded-[24px] sm:rounded-[32px] border border-amber-300/20 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
              {/* Corner Filigree Ornaments */}
              <div className="flex justify-between items-center opacity-60">
                <div className="w-5 h-5 border-t-2 border-l-2 border-amber-300/70" />
                <div className="w-5 h-5 border-t-2 border-r-2 border-amber-300/70" />
              </div>
              <div className="flex justify-between items-center opacity-60">
                <div className="w-5 h-5 border-b-2 border-l-2 border-amber-300/70" />
                <div className="w-5 h-5 border-b-2 border-r-2 border-amber-300/70" />
              </div>
            </div>

            {/* Subtle Diagonal Envelope Flap Creases */}
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-200/10 via-transparent to-transparent" />
            <div className="absolute top-0 left-0 right-0 h-1/2 border-b border-amber-400/10 [clip-path:polygon(0_0,100%_0,50%_100%)] bg-gradient-to-b from-white/[0.04] to-black/20 pointer-events-none" />

            {/* Horizontal Satin Silk Ribbon */}
            <div className="absolute left-0 right-0 h-14 sm:h-16 bg-gradient-to-b from-amber-500/10 via-amber-400/20 to-amber-600/10 border-y border-amber-400/25 pointer-events-none flex items-center justify-center shadow-inner" />

            {/* Centerpiece: Golden Wax Seal */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              {/* Pulsing golden aura */}
              <motion.div
                animate={{
                  scale: isOpening ? [1, 1.5, 2.2] : [1, 1.12, 1],
                  opacity: isOpening ? [0.6, 0.9, 0] : [0.35, 0.6, 0.35]
                }}
                transition={{
                  repeat: isOpening ? 0 : Infinity,
                  duration: isOpening ? 0.9 : 3,
                  ease: 'easeInOut'
                }}
                className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-gradient-to-r from-amber-500/25 via-yellow-400/35 to-amber-600/25 blur-2xl pointer-events-none"
              />

              {/* Wax Seal Button */}
              <motion.button
                type="button"
                aria-label={t('Chạm để mở thư', 'Tap to open letter')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpen();
                }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                animate={
                  isOpening
                    ? {
                        scale: [1, 1.2, 0.6],
                        rotate: [0, -10, 15, -5, 0],
                        filter: ['brightness(1)', 'brightness(1.9)', 'brightness(2.5)']
                      }
                    : {}
                }
                transition={{ duration: 0.8 }}
                className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full cursor-pointer group focus:outline-none"
              >
                {/* 3D Wax Seal Rim */}
                <div className="w-full h-full rounded-full p-2.5 bg-gradient-to-br from-[#ffd700] via-[#c59b27] to-[#6d4c0d] shadow-[inset_0_2px_6px_rgba(255,255,255,0.7),0_15px_45px_rgba(0,0,0,0.9),0_0_35px_rgba(212,175,55,0.5)] flex items-center justify-center border border-amber-200/70">
                  {/* Inner Core with Monogram */}
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#7c3a0e] via-[#b45309] to-[#d97706] p-1.5 shadow-inner flex flex-col items-center justify-center text-center">
                    <div className="w-full h-full rounded-full border border-amber-200/50 flex flex-col items-center justify-center p-2 bg-gradient-to-b from-[#b45309]/90 to-[#78350f]/90">
                      <motion.div
                        animate={{ rotate: isOpening ? 180 : 0 }}
                        transition={{ duration: 0.8 }}
                      >
                        <Heart className="w-7 h-7 sm:w-8 sm:h-8 text-amber-100 fill-amber-200/50 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" />
                      </motion.div>
                      <span className="font-serif font-black tracking-[0.25em] text-[11px] sm:text-[13px] text-amber-100 uppercase mt-1.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                        EMORIA
                      </span>
                    </div>
                  </div>
                </div>
              </motion.button>

              {/* Romantic invitation to open */}
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className="mt-8 sm:mt-10 text-center pointer-events-none"
              >
                <span className="font-serif italic tracking-widest text-sm sm:text-base text-amber-200/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                  {isOpening
                    ? t('Đang mở bức thư...', 'Unfolding letter...')
                    : hasIntroVideo
                    ? t('Chạm để mở bức thư & video intro', 'Touch to open letter & video intro')
                    : t('Chạm để mở bức thư', 'Touch to open the letter')}
                </span>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
