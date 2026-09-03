import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote, Sparkles, X, Heart, SmartphoneNfc } from 'lucide-react';
import { testimonials } from '../data/testimonials';

export default function FeedbackSection({ onOpenNfcDemo }) {
  const [selectedKol, setSelectedKol] = useState(null);

  return (
    <section 
      id="feedback" 
      className="relative min-h-[90vh] w-full py-20 px-4 sm:px-6 lg:px-8 bg-dark-900 border-t border-b border-white/10 overflow-hidden"
    >
      {/* Background Diamond Lattice Overlay */}
      <div className="absolute inset-0 bg-diamond-pattern opacity-50 pointer-events-none" />

      {/* Decorative Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-slate-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Section Title & Official Quote matching Mockup 5 */}
        <div className="text-center max-w-4xl mx-auto mb-14 space-y-4">
          
          <motion.h2 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="font-cinzel text-3xl sm:text-5xl font-medium text-slate-100 tracking-wider"
          >
            FEEDBACK
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="font-sans font-light italic text-sm sm:text-base md:text-lg text-neutral-300 leading-relaxed tracking-wider px-4 max-w-3xl mx-auto"
          >
            "Tôn vinh cảm xúc cá nhân và ký ức độc bản, EMORIA trở thành điểm chạm đồng hành cùng những người nổi tiếng trong việc lưu giữ và khẳng định câu chuyện của chính họ."
          </motion.p>
        </div>

        {/* 3 Monochrome Portrait Cards matching Mockup 5 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 max-w-7xl mx-auto">
          {testimonials.map((kol, idx) => (
            <motion.div
              key={kol.id}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.15 }}
              whileHover={{ y: -6 }}
              onClick={() => setSelectedKol(kol)}
              className="group relative rounded-2xl glass-panel p-3 sm:p-4 border border-white/10 hover:border-white/30 transition-all duration-300 shadow-glass cursor-pointer flex flex-col justify-between"
            >
              {/* Monochrome Editorial Image */}
              <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-dark-950/90 mb-4 border border-white/5">
                <img
                  src={kol.image}
                  alt={kol.name}
                  className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
                />

                {/* Subtle dark vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-dark-950/80 via-transparent to-transparent opacity-60 group-hover:opacity-30 transition-opacity" />

                {/* Hover Quote Preview Badge */}
                <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-dark-950/85 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
                  <p className="text-xs text-slate-200 line-clamp-2 italic">
                    "{kol.quote}"
                  </p>
                  <span className="text-[10px] text-slate-400 mt-1 block uppercase tracking-wider">
                    Nhấn để đọc câu chuyện ✦
                  </span>
                </div>
              </div>

              {/* Caption Typography matching Mockup 5 */}
              <div className="text-center py-2">
                <h3 className="font-serif text-base sm:text-lg text-slate-100 tracking-wider group-hover:text-white transition-colors">
                  {kol.title}
                </h3>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Detail Story Modal for KOL */}
      <AnimatePresence>
        {selectedKol && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md"
            onClick={() => setSelectedKol(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-3xl glass-panel p-6 sm:p-8 border border-white/20 shadow-2xl bg-dark-900/95"
            >
              <button
                onClick={() => setSelectedKol(null)}
                className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/30">
                  <img src={selectedKol.image} alt={selectedKol.name} className="w-full h-full object-cover object-top" />
                </div>
                <div>
                  <h3 className="text-xl font-serif font-bold text-metallic">{selectedKol.title}</h3>
                  <p className="text-xs text-slate-400">{selectedKol.role}</p>
                </div>
              </div>

              <div className="relative p-4 rounded-2xl bg-white/5 border border-white/10 mb-6">
                <Quote className="w-6 h-6 text-slate-400/40 absolute top-2 right-2" />
                <p className="text-sm text-slate-200 italic leading-relaxed">
                  "{selectedKol.quote}"
                </p>
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                  <span>Ký ức mã hóa:</span>
                  <span className="font-semibold text-slate-200">{selectedKol.highlight}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedKol(null);
                  if (onOpenNfcDemo) onOpenNfcDemo('emoria-pulse');
                }}
                className="w-full py-3 rounded-full bg-white text-dark-950 font-bold text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
              >
                <SmartphoneNfc className="w-4 h-4" />
                <span>Trải nghiệm Chạm Ký Ức NFC</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
