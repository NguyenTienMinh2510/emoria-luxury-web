import React from 'react';
import { Shield, Sparkles, SmartphoneNfc, Heart } from 'lucide-react';

export default function Footer({ onSelectView }) {
  return (
    <footer className="w-full bg-dark-950 border-t border-white/10 text-slate-400 text-xs py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-1">
            <div 
              onClick={() => onSelectView && onSelectView('home')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span className="font-serif text-2xl font-bold tracking-[0.25em] text-metallic">
                EMORIA
              </span>
              <span className="text-white/40 text-[10px]">✦ S925 NFC</span>
            </div>
            <p className="text-xs text-slate-400">
              Một chạm mở kí ức - Trọn đời giữ yêu thương
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-slate-300">
            <button
              onClick={() => onSelectView && onSelectView('home')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Trang Chủ
            </button>
            <button
              onClick={() => onSelectView && onSelectView('shop')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Cửa Hàng
            </button>
            <button
              onClick={() => onSelectView && onSelectView('memory')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Kỷ Niệm NFC
            </button>
            <button
              onClick={() => onSelectView && onSelectView('articles')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Tạp Chí
            </button>
            <button
              onClick={() => onSelectView && onSelectView('about')}
              className="text-amber-300 hover:text-amber-200 font-medium transition-colors cursor-pointer"
            >
              Về Chúng Tôi (About Us)
            </button>
          </div>

          {/* Guarantees */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-300">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>Trang sức S925</span>
            </div>
            <div className="flex items-center gap-1.5">
              <SmartphoneNfc className="w-3.5 h-3.5 text-slate-400" />
              <span>Chống nước IP68</span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <p>© 2026 EMORIA VIETNAM. All rights reserved.</p>
          <p>Designed with Dark Luxury &amp; NFC Smart Sentimental Architecture</p>
        </div>
      </div>
    </footer>
  );
}
