import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowUpRight, SmartphoneNfc } from 'lucide-react';

export default function CollectionShowcase({ onSelectProduct, onOpenNfcDemo }) {
  return (
    <section 
      id="collection" 
      className="relative min-h-[90vh] w-full flex items-center justify-center py-20 px-4 sm:px-6 lg:px-8 bg-dark-900 border-t border-b border-white/10 overflow-hidden"
    >
      {/* Background Diamond Lattice Overlay */}
      <div className="absolute inset-0 bg-diamond-pattern opacity-60 pointer-events-none" />

      {/* Decorative Radial Ambient Glows */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[450px] h-[450px] bg-slate-400/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[550px] h-[550px] bg-blue-950/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-8 px-4 sm:px-8 relative z-10">
        
        {/* Left Column: Cursive "Emoria Summer" & Editorial Typography (Mockup 3) */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full lg:w-1/2 flex flex-col justify-center text-left py-4 sm:py-6 lg:py-12"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/15 backdrop-blur-md w-fit mb-4">
            <Sparkles className="w-3.5 h-3.5 text-slate-300 animate-pulse" />
            <span className="text-xs uppercase tracking-[0.25em] text-slate-200 font-medium">
              Summer 2026 Edition
            </span>
          </div>

          {/* Large Cursive "Emoria Summer" matching Mockup 3 */}
          <div className="relative my-2 select-none">
            <h2 className="font-cursive text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-metallic font-normal leading-tight tracking-wide drop-shadow-[0_4px_25px_rgba(255,255,255,0.2)]">
              Emoria<br />
              <span className="pl-4 sm:pl-8 lg:pl-10">Summer</span>
            </h2>
          </div>

          {/* Slogan & Details */}
          <div className="mt-4 sm:mt-6 space-y-4">
            <h3 className="font-cinzel text-lg sm:text-2xl font-bold tracking-[0.35em] text-slate-200 uppercase flex items-center gap-3">
              <span>NEW COLLECTION</span>
              <span className="h-[1px] w-16 bg-gradient-to-r from-slate-400 to-transparent" />
            </h3>
            
            <p className="font-sans text-sm sm:text-base text-slate-300 max-w-lg leading-relaxed font-light">
              Lấy cảm hứng từ những vì tinh tú mùa hạ và dải ngân hà vĩnh cửu. Bộ đôi vòng tay bạc S925 tích hợp vi chip NFC kép, kết nối câu chuyện tình yêu và lưu giữ mọi khoảnh khắc bí mật chỉ thuộc về hai người.
            </p>
          </div>

          {/* Action Buttons: High-Impact Luxury CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full">
            <a
              href="#products"
              className="cta-luxury-gold !h-12 !px-8 text-xs sm:text-sm !w-full sm:!w-auto flex items-center justify-center gap-2.5 shadow-[0_0_30px_rgba(250,204,21,0.6)]"
            >
              <span>Xem Sản Phẩm</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>

            <button
              onClick={() => onOpenNfcDemo && onOpenNfcDemo('emoria-celestial-duo')}
              className="cta-luxury-secondary !h-12 !px-7 text-xs sm:text-sm !w-full sm:!w-auto flex items-center justify-center gap-2.5"
            >
              <SmartphoneNfc className="w-4 h-4 text-amber-300" />
              <span>Chạm Thử NFC</span>
            </button>
          </div>
        </motion.div>

        {/* Right Column: Navy Velvet Jewelry Box with Celestial Bracelets (Mockup 3) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, x: 30 }}
          whileInView={{ opacity: 1, scale: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          className="w-full lg:w-1/2 relative flex items-center justify-center"
        >
          {/* Outer Glass Card Frame */}
          <div className="relative w-full max-w-sm sm:max-w-md lg:max-w-xl mx-auto rounded-3xl overflow-hidden glass-panel p-2 sm:p-4 shadow-silver-glow border border-white/20 group">
            
            {/* Main Showcase Image */}
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-dark-950/80">
              <img 
                src="/assets/summer_box.png" 
                alt="Emoria Summer Collection Box"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
              />

              {/* Shimmer Light Bar */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

              {/* Interactive Hotspot 1: Celestial Blue Planet Charm */}
              <div className="absolute top-[50%] left-[32%] -translate-x-1/2 -translate-y-1/2">
                <button 
                  onClick={() => onSelectProduct && onSelectProduct('emoria-celestial-duo')}
                  className="relative group/hotspot p-2 focus:outline-none"
                  aria-label="Vòng tay Celestial Lapis NFC"
                >
                  <span className="w-6 h-6 rounded-full bg-white/80 backdrop-blur-md border-2 border-slate-900 flex items-center justify-center text-dark-950 font-bold text-xs shadow-lg animate-bounce">
                    ✦
                  </span>
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg bg-dark-950/90 text-[11px] font-semibold text-white whitespace-nowrap opacity-0 group-hover/hotspot:opacity-100 transition-opacity border border-white/20 shadow-xl pointer-events-none">
                    Mặt Đá Lapis & Vi Chip NFC
                  </span>
                </button>
              </div>

              {/* Interactive Hotspot 2: Silver Orbit Bangle */}
              <div className="absolute top-[65%] right-[22%] -translate-x-1/2 -translate-y-1/2">
                <button 
                  onClick={() => onSelectProduct && onSelectProduct('emoria-celestial-duo')}
                  className="relative group/hotspot p-2 focus:outline-none"
                  aria-label="Vòng tay Orbit Bạc S925"
                >
                  <span className="w-6 h-6 rounded-full bg-white/80 backdrop-blur-md border-2 border-slate-900 flex items-center justify-center text-dark-950 font-bold text-xs shadow-lg animate-bounce" style={{ animationDelay: '0.4s' }}>
                    ✦
                  </span>
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg bg-dark-950/90 text-[11px] font-semibold text-white whitespace-nowrap opacity-0 group-hover/hotspot:opacity-100 transition-opacity border border-white/20 shadow-xl pointer-events-none">
                    Quỹ Đạo Bạc S925 Nguyên Khối
                  </span>
                </button>
              </div>

              {/* Bottom Card Overlay Tag */}
              <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-dark-950/80 backdrop-blur-md border border-white/10 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white font-serif">EMORIA CELESTIAL DUO</h4>
                  <p className="text-xs text-slate-300">Bạc S925 & Bộ đôi NFC Đồng bộ</p>
                </div>
                <span className="text-sm font-bold text-white">349.000 VNĐ</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
