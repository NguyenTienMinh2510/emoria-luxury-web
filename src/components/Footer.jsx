import React from 'react';
import { Shield, Sparkles, SmartphoneNfc, Heart } from 'lucide-react';
import { useLanguage, BilingualText } from '../i18n/LanguageProvider';

export default function Footer({ onSelectView, onOpenPrivacy }) {
  const { t, tBilingual } = useLanguage();

  return (
    <footer className="w-full bg-dark-950 border-t border-white/10 text-slate-400 text-xs py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-1">
            <div 
              onClick={() => onSelectView && onSelectView('home')}
              className="flex items-center gap-2 cursor-pointer notranslate"
              translate="no"
            >
              <span className="font-serif text-2xl font-bold tracking-[0.25em] text-metallic">
                EMORIA
              </span>
              <span className="text-white/40 text-[10px]">✦ S925 NFC</span>
            </div>
            <p className="text-xs text-slate-400">
              <BilingualText 
                vi="Một chạm mở kí ức - Trọn đời giữ yêu thương"
                en="One touch unlocks memories — A lifetime holding love"
              />
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-slate-300">
            <button
              onClick={() => onSelectView && onSelectView('home')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {t('Trang Chủ', 'Home')}
            </button>
            <button
              onClick={() => onSelectView && onSelectView('shop')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {t('Cửa Hàng', 'Boutique')}
            </button>
            <button
              onClick={() => onSelectView && onSelectView('memory')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {t('Kỷ Niệm NFC', 'Memory Vault')}
            </button>
            <button
              onClick={() => onSelectView && onSelectView('articles')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {t('Tạp Chí', 'Chronicles')}
            </button>
            <button
              onClick={() => onSelectView && onSelectView('about')}
              className="text-amber-300 hover:text-amber-200 font-medium transition-colors cursor-pointer"
            >
              {t('Về Chúng Tôi', 'About Us')}
            </button>
            <button
              type="button"
              onClick={() => onOpenPrivacy && onOpenPrivacy()}
              className="hover:text-amber-300 font-medium transition-colors cursor-pointer flex items-center gap-1.5 text-slate-300"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('Chính Sách Bảo Mật', 'Privacy Policy')}</span>
            </button>
          </div>

          {/* Guarantees */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-300">
            <div className="flex items-center gap-1.5 notranslate" translate="no">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>{t('Trang sức Bạc S925', 'S925 Sterling Silver')}</span>
            </div>
            <div className="flex items-center gap-1.5 notranslate" translate="no">
              <SmartphoneNfc className="w-3.5 h-3.5 text-slate-400" />
              <span>{t('Chống nước IP68', 'IP68 Waterproof NFC')}</span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <p>
            © 2026 EMORIA VIETNAM. All rights reserved. ·{' '}
            <button
              type="button"
              onClick={() => onOpenPrivacy && onOpenPrivacy()}
              className="text-slate-400 hover:text-amber-300 underline transition-colors cursor-pointer"
            >
              {t('Chính sách bảo mật dữ liệu', 'Data Privacy Policy')}
            </button>
          </p>
          <p>Designed with Dark Luxury &amp; NFC Smart Sentimental Architecture</p>
        </div>
      </div>
    </footer>
  );
}
