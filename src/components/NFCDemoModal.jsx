import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Sparkles, X, Play, Pause, Volume2, ShieldCheck, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { products } from '../data/products';

export default function NFCDemoModal({ isOpen, onClose, selectedProductId, onOpenMemoryViewer }) {
  const [isTapped, setIsTapped] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const product = products.find(p => p.id === selectedProductId) || products[0];

  const handleTap = () => {
    setIsTapped(true);
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#ffffff', '#cbd5e1', '#94a3b8', '#e2e8f0']
    });
  };

  const resetTap = () => {
    setIsTapped(false);
    setIsPlayingAudio(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25 }}
          className="relative w-full max-w-2xl rounded-3xl glass-panel p-6 sm:p-8 border border-white/20 shadow-2xl bg-dark-900/95 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => {
              resetTap();
              onClose();
            }}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors z-20"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-slate-200" />
              <span>Công Nghệ Một Chạm Ký Ức NFC</span>
            </div>
            <h3 className="text-2xl font-serif font-bold text-metallic">
              Mô Phỏng Trải Nghiệm Chạm {product.name}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Chỉ cần áp mặt sau điện thoại vào trang sức để giải mã ký ức
            </p>
          </div>

          {/* Simulation Stage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            
            {/* Left: Interactive Jewelry & Smartphone Tap Animation */}
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-dark-950/80 border border-white/10 relative min-h-[280px]">
              
              {/* Product Visual */}
              <div className="relative w-28 h-28 rounded-2xl overflow-hidden border border-white/20 shadow-xl mb-4">
                <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                {/* NFC Hotspot Marker */}
                <span className="absolute inset-0 border-2 border-white/60 rounded-2xl animate-ping opacity-40 pointer-events-none" />
              </div>

              {/* Tap State Instruction */}
              {!isTapped ? (
                <div className="text-center space-y-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleTap}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-slate-200 via-white to-slate-300 text-dark-950 font-bold text-xs uppercase tracking-wider shadow-silver-glow flex items-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 animate-bounce" />
                    <span>Áp Điện Thoại Chạm Thử</span>
                  </motion.button>
                  <p className="text-[11px] text-slate-400">
                    (Mô phỏng NFC Touch không cần mở khóa app)
                  </p>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Đã nhận diện Chip NFC S925!</span>
                  </div>
                  
                  {onOpenMemoryViewer && (
                    <button
                      onClick={() => {
                        resetTap();
                        onClose();
                        onOpenMemoryViewer(product.id || 'emoria-lumen');
                      }}
                      className="px-4 py-2 rounded-xl bg-white text-dark-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-silver-glow hover:bg-slate-200 transition-colors mx-auto cursor-pointer"
                    >
                      <span>Mở Memory Space Đầy Đủ</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={resetTap}
                    className="block mx-auto text-xs text-slate-400 hover:text-white underline cursor-pointer pt-1"
                  >
                    Chạm lại thiết bị khác
                  </button>
                </div>
              )}
            </div>

            {/* Right: Unlocked Memory Space Display */}
            <div className="rounded-2xl p-5 bg-white/5 border border-white/10 flex flex-col justify-between min-h-[280px]">
              {!isTapped ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2 text-slate-500">
                  <Smartphone className="w-10 h-10 opacity-30 animate-pulse" />
                  <p className="text-xs text-slate-400">
                    Đang chờ tín hiệu chạm từ điện thoại...
                  </p>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Memory Space</p>
                      <h4 className="text-sm font-serif font-bold text-white">{product.nfcStory.title}</h4>
                    </div>
                    <span className="text-[10px] text-slate-400">{product.nfcStory.date}</span>
                  </div>

                  {/* Secret Quote */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-slate-200 italic leading-relaxed">
                      "{product.nfcStory.quote}"
                    </p>
                  </div>

                  {/* Audio Player Memo */}
                  <div className="p-3 rounded-xl bg-dark-950/80 border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                        className="w-8 h-8 rounded-full bg-white text-dark-950 flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
                      >
                        {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <div>
                        <p className="text-xs font-medium text-white">{product.nfcStory.audioName}</p>
                        <p className="text-[10px] text-slate-400">
                          {isPlayingAudio ? 'Đang phát âm thanh ghi âm...' : '0:45 • Giọng nói kỷ niệm'}
                        </p>
                      </div>
                    </div>
                    <Volume2 className={`w-4 h-4 ${isPlayingAudio ? 'text-slate-200 animate-pulse' : 'text-slate-500'}`} />
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Mã hóa bảo mật: S925-NFC-V2</span>
                    <span className="text-white font-medium">Bảo hành trọn đời</span>
                  </div>
                </motion.div>
              )}
            </div>

          </div>

          {/* Footer Action */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-400">Trang sức đi kèm thẻ chứng nhận NFC chính hãng</span>
            <button
              onClick={() => {
                resetTap();
                onClose();
              }}
              className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
