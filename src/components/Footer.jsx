import React from 'react';
import { Shield, Sparkles, SmartphoneNfc, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full bg-dark-950 border-t border-white/10 text-slate-400 text-xs py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-serif text-2xl font-bold tracking-[0.25em] text-metallic">
              EMORIA
            </span>
            <span className="text-white/40 text-[10px]">✦ S925 NFC</span>
          </div>
          <p className="text-xs text-slate-400">
            Một chạm mở kí ức - Trọn đời giữ yêu thương
          </p>
        </div>

        {/* Guarantees */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span>Cam kết Bạc Chuẩn S925</span>
          </div>
          <div className="flex items-center gap-1.5">
            <SmartphoneNfc className="w-3.5 h-3.5 text-slate-400" />
            <span>Bảo hành Chip NFC Trọn Đời</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            <span>Làm Mới Bạc Miễn Phí</span>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center md:text-right text-[11px] text-slate-400">
          <p>© 2026 EMORIA VIETNAM. All rights reserved.</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Designed with Dark Luxury &amp; NFC Smart Tech</p>
        </div>
      </div>
    </footer>
  );
}
