import {useLanguage,LanguageSwitcher} from '../i18n/LanguageProvider';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, User, ShoppingBag, Menu, X, Sparkles, SmartphoneNfc, Store, Compass, BookOpen, Shield } from 'lucide-react';
import { navItems } from '../data/navigation';

export default function Navbar({ 
  activeSection,
  currentUser,
  isAdmin=false, 
  onOpenAuth, 
  onOpenNfcDemo, 
  cartCount = 0, 
  onOpenCart, 
  onSearch,
  currentView = 'shop',
  onSelectView,
  sandbox=false,
}) {
  const {t}=useLanguage();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  const handleSwitchView = (view) => {
    if (onSelectView) {
      onSelectView(view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <header
      style={{top:sandbox?24:0}}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-dark-950/90 backdrop-blur-xl border-b border-white/10 shadow-2xl py-2.5'
          : 'bg-gradient-to-b from-dark-950/95 via-dark-950/60 to-transparent backdrop-blur-md py-3.5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2">

          {/* Logo */}
          <div 
            onClick={() => handleSwitchView('home')}
            className="flex items-center gap-2.5 group relative cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-serif text-xl sm:text-3xl font-bold tracking-[0.12em] sm:tracking-[0.2em] text-metallic group-hover:brightness-125 transition-all">
                EMORIA
              </span>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 border border-white/30 text-[10px] text-white/90 shadow-silver-glow animate-pulse">
                ✦
              </span>
            </div>
          </div>

          {/* Desktop Center: Space Switcher Pill (Shop vs Memory vs Articles vs Home vs Admin) */}
          <div className="hidden xl:flex items-center p-1 rounded-full bg-black/60 border border-white/15 backdrop-blur-xl shadow-inner">
            <button
              onClick={() => handleSwitchView('home')}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                currentView === 'home'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{t("Trang Chủ","Home")}</span>
            </button>

            <button
              onClick={() => handleSwitchView('shop')}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                currentView === 'shop'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>{t("Cửa Hàng","Shop")}</span>
            </button>

            <button
              onClick={() => handleSwitchView('memory')}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                currentView === 'memory'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <SmartphoneNfc className="w-3.5 h-3.5" />
              <span>{t("Kỷ Niệm","Memories")}</span>
            </button>

            <button
              onClick={() => handleSwitchView('articles')}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                currentView === 'articles' || currentView === 'article-detail'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t("Bài Viết","Journal")}</span>
            </button>

            <button
              onClick={() => handleSwitchView('about')}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                currentView === 'about'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t("Giới Thiệu","About")}</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => handleSwitchView('admin')}
                className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                  currentView === 'admin'
                    ? 'bg-white text-dark-950 shadow-silver-glow'
                    : 'text-amber-300 hover:text-amber-200 hover:bg-white/5'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>{t("Quản Trị","Admin")}</span>
              </button>
            )}
          </div>

          <button type="button" onClick={() => handleSwitchView('memory-match')} aria-current={currentView === 'memory-match' ? 'page' : undefined} className="hidden xl:block px-3 py-2 rounded-full border border-rose-400/40 text-rose-200 text-xs font-semibold hover:bg-rose-500/15">Mismatch</button>

          {/* Right Action Bar: Search, Cart, User Profile */}
          <div className="flex items-center gap-2 sm:gap-3">

            <LanguageSwitcher/>
            {/* Search Input Bar (Visible from lg) */}
            <form
              onSubmit={handleSearchSubmit}
              className={`relative hidden xl:flex items-center transition-all duration-300 ${
                searchFocused ? 'w-56' : 'w-40'
              }`}
            >
              <input
                id="search-input"
                name="search"
                type="text"
                placeholder={t("Tìm trang sức...","Search jewelry...")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (onSearch) onSearch(e.target.value);
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full h-8 pl-3 pr-7 rounded-full text-xs bg-black/40 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:border-white/50 transition-all"
              />
              <button
                type="submit"
                aria-label={t("Tìm kiếm","Search")}
                className="absolute right-2 text-slate-400 hover:text-white transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </form>

            {isAdmin&&<button onClick={()=>handleSwitchView('admin')} className="hidden sm:block min-h-11 px-2 sm:px-3 text-xs rounded-xl border border-white/20" aria-current={currentView==='admin'?'page':undefined}>{t("Quản trị","Admin")}</button>}
            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              aria-label={t("Giỏ hàng","Cart")}
              className="relative p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer min-w-[38px] min-h-[38px]"
            >
              <ShoppingBag className="w-5 h-5 stroke-[1.5]" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-white text-dark-950 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-md animate-pulse">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Auth / Account Profile Button */}
            <button
              onClick={onOpenAuth}
              aria-label={currentUser?`Tài khoản ${currentUser}`:t("Tài khoản","Account")}
              className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer min-h-[38px]"
            >
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold transition-all ${
                currentUser
                  ? 'bg-amber-400 text-dark-950 border-amber-300 shadow-sm shadow-amber-500/20'
                  : 'bg-white/10 border-white/20 text-slate-200'
              }`}>
                {currentUser ? currentUser.trim()[0]?.toUpperCase() : <User className="w-4 h-4" />}
              </div>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center min-w-[40px] min-h-[40px]"
              aria-label={t("Mở menu","Open menu")} aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="xl:hidden overflow-hidden mt-3 pt-3 pb-4 border-t border-white/10 bg-dark-950/95 backdrop-blur-2xl rounded-2xl px-4 space-y-3 shadow-2xl"
            >
              {/* Mobile View Switcher Buttons */}
              <div className="grid grid-cols-5 gap-1.5 pb-3 border-b border-white/10">
                <button
                  onClick={() => handleSwitchView('home')}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase flex flex-col items-center gap-1 transition-all ${
                    currentView === 'home'
                      ? 'bg-white text-dark-950 shadow-sm'
                      : 'bg-white/5 text-slate-300 border border-white/10'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>{t("Trang Chủ","Home")}</span>
                </button>

                <button
                  onClick={() => handleSwitchView('shop')}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase flex flex-col items-center gap-1 transition-all ${
                    currentView === 'shop'
                      ? 'bg-white text-dark-950 shadow-sm'
                      : 'bg-white/5 text-slate-300 border border-white/10'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>{t("Cửa Hàng","Shop")}</span>
                </button>

                <button
                  onClick={() => handleSwitchView('memory')}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase flex flex-col items-center gap-1 transition-all ${
                    currentView === 'memory'
                      ? 'bg-white text-dark-950 shadow-sm'
                      : 'bg-white/5 text-slate-300 border border-white/10'
                  }`}
                >
                  <SmartphoneNfc className="w-3.5 h-3.5" />
                  <span>{t("Kỷ Niệm","Memories")}</span>
                </button>

                <button
                  onClick={() => handleSwitchView('articles')}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase flex flex-col items-center gap-1 transition-all ${
                    currentView === 'articles' || currentView === 'article-detail'
                      ? 'bg-white text-dark-950 shadow-sm'
                      : 'bg-white/5 text-slate-300 border border-white/10'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{t("Bài Viết","Journal")}</span>
                </button>

                <button
                  onClick={() => handleSwitchView('about')}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase flex flex-col items-center gap-1 transition-all ${
                    currentView === 'about'
                      ? 'bg-white text-dark-950 shadow-sm'
                      : 'bg-white/5 text-slate-300 border border-white/10'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t("Giới Thiệu","About")}</span>
                </button>
              </div>

              <button type="button" onClick={() => handleSwitchView('memory-match')} aria-current={currentView === 'memory-match' ? 'page' : undefined} className="w-full min-h-11 rounded-xl border border-rose-400/40 text-rose-200 font-semibold">Mismatch · {t('Chơi cùng người quen','Play with someone you know')}</button>
              {isAdmin&&<button onClick={()=>handleSwitchView('admin')} className="w-full min-h-11 rounded-xl bg-white text-dark-950 font-semibold">{t("Trang quản trị","Admin dashboard")}</button>}
              {/* Mobile Search */}
              <form onSubmit={handleSearchSubmit} className="relative mb-2">
                <input
                  id="search-input-mobile"
                  name="search_mobile"
                  type="text"
                  placeholder={t("Tìm kiếm trang sức...","Search jewelry...")}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (onSearch) onSearch(e.target.value);
                  }}
                  className="w-full h-10 pl-3 pr-8 rounded-xl text-sm bg-black/40 border border-white/20 text-white placeholder-slate-400 focus:outline-none"
                />
                <button type="submit" aria-label={t("Tìm kiếm","Search")} className="absolute right-3 top-2.5 text-slate-300">
                  <Search className="w-4 h-4" />
                </button>
              </form>

              {/* Quick NFC Trigger */}
              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenNfcDemo();
                  }}
                  className="flex-1 h-10 flex items-center justify-center gap-2 text-xs font-medium text-slate-200 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
                >
                  <SmartphoneNfc className="w-3.5 h-3.5 text-white" />
                  <span>{t("Thử Chạm NFC","Try NFC")}</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth();
                  }}
                  className="h-10 flex items-center justify-center text-xs font-medium text-white px-4 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 cursor-pointer"
                >
                  {t("Tài khoản","Account")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
