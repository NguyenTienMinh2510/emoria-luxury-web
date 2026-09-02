import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, User, ShoppingBag, Menu, X, Sparkles, SmartphoneNfc } from 'lucide-react';
import { navItems } from '../data/navigation';

export default function Navbar({ activeSection, onOpenAuth, onOpenNfcDemo, cartCount = 0, onOpenCart, onSearch }) {
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

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
          ? 'bg-dark-950/85 backdrop-blur-xl border-b border-white/10 shadow-2xl py-3'
          : 'bg-gradient-to-b from-dark-950/90 via-dark-950/40 to-transparent backdrop-blur-md py-4'
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">

          {/* Logo */}
          <a
            href="#hero"
            className="flex items-center gap-2.5 group relative"
          >
            <div className="relative">
              {/* Fallback stylized logo text & pendant icon */}
              <div className="flex items-center gap-1.5">
                <span className="font-serif text-2xl sm:text-3xl font-bold tracking-[0.2em] text-metallic group-hover:brightness-125 transition-all">
                  EMORIA
                </span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 border border-white/30 text-[10px] text-white/90 shadow-silver-glow animate-pulse">
                  ✦
                </span>
              </div>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-4">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`relative px-3.5 py-2 text-sm lg:text-base font-medium transition-colors duration-200 ${isActive
                      ? 'text-white font-semibold'
                      : 'text-slate-300 hover:text-white'
                    }`}
                >
                  <span className="relative z-10">{item.label}</span>

                  {/* Active Flourish Underline matching Mockup */}
                  {isActive && (
                    <motion.div
                      layoutId="activeNavBracket"
                      className="absolute -bottom-1 left-0 right-0 h-4 flex items-center justify-center pointer-events-none"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    >
                      <div className="flourish-bracket w-full h-full" />
                    </motion.div>
                  )}
                </a>
              );
            })}
          </nav>

          {/* Right Action Bar: Search, NFC Experience Button, Cart, User Profile */}
          <div className="flex items-center gap-2 sm:gap-4">

            {/* Search Input Bar matching Mockup 3, 4, 5 */}
            <form
              onSubmit={handleSearchSubmit}
              className={`relative hidden sm:flex items-center transition-all duration-300 ${searchFocused ? 'w-56 lg:w-64' : 'w-44 lg:w-52'
                }`}
            >
              <input
                type="text"
                placeholder="Tìm trang sức..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (onSearch) onSearch(e.target.value);
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full h-9 pl-3.5 pr-8 rounded-full text-xs lg:text-sm glass-input placeholder-slate-400 focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-all"
              />
              <button
                type="submit"
                aria-label="Tìm kiếm"
                className="absolute right-2.5 text-slate-300 hover:text-white transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>

            {/* NFC Simulation Quick Trigger Button */}
            <button
              onClick={onOpenNfcDemo}
              title="Mô phỏng trải nghiệm chạm NFC"
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 hover:bg-white/15 border border-white/20 text-slate-200 transition-all hover:border-white/40 shadow-sm"
            >
              <SmartphoneNfc className="w-3.5 h-3.5 text-slate-300 animate-pulse" />
              <span>Chạm NFC</span>
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              aria-label="Giỏ hàng"
              className="relative p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-100 text-dark-950 font-bold text-[10px] flex items-center justify-center shadow-lg">
                  {cartCount}
                </span>
              )}
            </button>

            {/* "You" User Profile Button matching Mockup */}
            <button
              onClick={onOpenAuth}
              className="flex flex-col items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center group-hover:border-white/50 transition-all">
                <User className="w-4 h-4" />
              </div>
              <span className="text-[10px] tracking-wider uppercase font-semibold mt-0.5 text-slate-300 group-hover:text-white">
                You
              </span>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden overflow-hidden mt-3 pt-3 pb-4 border-t border-white/10 bg-dark-950/95 backdrop-blur-2xl rounded-2xl px-4 space-y-3"
            >
              <form onSubmit={handleSearchSubmit} className="relative mb-3">
                <input
                  type="text"
                  placeholder="Tìm kiếm sản phẩm..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (onSearch) onSearch(e.target.value);
                  }}
                  className="w-full h-10 pl-4 pr-10 rounded-full text-sm glass-input"
                />
                <button type="submit" className="absolute right-3 top-2.5 text-slate-300">
                  <Search className="w-5 h-5" />
                </button>
              </form>

              <div className="flex flex-col space-y-2">
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeSection === item.id
                        ? 'bg-white/10 text-white font-semibold'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenNfcDemo();
                  }}
                  className="flex items-center gap-2 text-sm text-slate-200 py-2 px-3 rounded-lg hover:bg-white/10"
                >
                  <SmartphoneNfc className="w-4 h-4 text-slate-300" />
                  <span>Trải nghiệm chạm NFC</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth();
                  }}
                  className="text-sm font-medium text-white px-4 py-2 rounded-full bg-white/10 border border-white/20"
                >
                  Tài khoản
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
