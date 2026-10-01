import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SlidersHorizontal, Star, ShoppingBag, SmartphoneNfc, 
  Eye, Check, ChevronLeft, ChevronRight, ArrowRight, Sparkles 
} from 'lucide-react';
import { categories } from '../data/products';
import { useStore } from './StoreProvider';
import { useLanguage } from '../i18n/LanguageProvider';
import { productImageProps } from '../services/productImages.js';

const VirtualTryOnModal = lazy(() => import('./VirtualTryOnModal'));

const CATEGORY_TRANSLATIONS = {
  'Tất cả': 'All',
  'Vòng tay': 'Bracelets',
  'Nhẫn': 'Rings',
  'Dây chuyền': 'Necklaces',
  'Móc khóa': 'Keychains'
};

export default function ProductCatalog({ 
  onSelectProduct, 
  onAddToCart, 
  onOpenNfcDemo,
  onNavigateToShop,
  searchQuery = '' 
}) {
  const { language, t } = useLanguage();
  const isEn = language === 'en';
  const { products, settings, loading: catalogLoading, error: catalogError } = useStore();
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [sortBy, setSortBy] = useState('default');
  const [addedIds, setAddedIds] = useState([]);
  const [tryOnProduct, setTryOnProduct] = useState(null);
  
  const scrollContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Mouse Drag to scroll tracking
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  // Filter & Search Logic
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      if (!item.active) return false;
      const matchCategory = activeCategory === 'Tất cả' || item.category === activeCategory;
      const matchSearch = !searchQuery || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.material.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    }).sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'rating') return b.rating - a.rating;
      return 0;
    });
  }, [products, activeCategory, searchQuery, sortBy]);

  // Update scroll status & progress indicator
  const updateScrollStatus = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll > 0) {
      setScrollProgress(Math.min(100, Math.max(0, (scrollLeft / maxScroll) * 100)));
    }
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    updateScrollStatus();
    el.addEventListener('scroll', updateScrollStatus, { passive: true });
    window.addEventListener('resize', updateScrollStatus);
    return () => {
      el.removeEventListener('scroll', updateScrollStatus);
      window.removeEventListener('resize', updateScrollStatus);
    };
  }, [filteredProducts]);

  const handleScroll = (direction) => {
    if (!scrollContainerRef.current) return;
    const offset = direction === 'left' ? -360 : 360;
    scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  // Drag-to-scroll handlers for desktop mouse
  const handleMouseDown = (e) => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || !scrollContainerRef.current) return;
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.4;
    if (Math.abs(walk) > 6) {
      hasDraggedRef.current = true;
    }
    scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleCardClick = (productId) => {
    if (hasDraggedRef.current) return; // Ignore click if user was dragging
    if (onSelectProduct) onSelectProduct(productId);
  };

  const handleAddToCart = (product, e) => {
    e.stopPropagation();
    if (onSelectProduct) onSelectProduct(product.id);
  };

  return (
    <section 
      id="products" 
      className="relative min-h-[85vh] w-full py-20 px-4 sm:px-6 lg:px-8 bg-dark-950 bg-diamond-pattern overflow-hidden"
    >
      {/* Background Decorative Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-slate-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-6 border-b border-white/10 gap-6">
          
          {/* Left Title: Khám phá kí ức / A Touch To Remember */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/15 text-xs text-slate-300 font-sans uppercase tracking-[0.2em] mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Tuyệt Tác Trang Sức Kỷ Niệm</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-slate-100 tracking-wide">
              Khám phá kí ức
            </h2>
            <p className="font-serif italic text-base sm:text-lg text-slate-300 tracking-wider mt-1.5">
              A Touch To Remember
            </p>
          </motion.div>

          {/* Right Controls: Categories & Horizontal Nav Buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            
            {/* Category Tabs: Nhẫn, Vòng tay, Dây chuyền, Móc khóa */}
            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
              {categories.map((cat) => {
                const isActive = activeCategory === cat;
                const enLabel = isEn && CATEGORY_TRANSLATIONS[cat] ? ` · ${CATEGORY_TRANSLATIONS[cat]}` : '';
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`relative px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-sans tracking-wide transition-all duration-200 cursor-pointer ${
                      isActive 
                        ? 'text-white font-bold bg-white/15 border border-white/40 shadow-silver-glow scale-105' 
                        : 'text-slate-300 hover:text-white hover:bg-white/5 border border-white/5'
                    }`}
                  >
                    <span>{cat}</span>
                    {enLabel && <span className="opacity-75 text-[11px] font-normal">{enLabel}</span>}
                  </button>
                );
              })}
            </div>

            {/* Slider Arrow Navigation Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                aria-label="Xem sản phẩm trước"
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                  canScrollLeft
                    ? 'bg-white/10 hover:bg-white/20 border-white/30 text-white shadow-silver-glow hover:scale-105'
                    : 'bg-white/5 border-white/10 text-slate-600 cursor-not-allowed opacity-40'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => handleScroll('right')}
                disabled={!canScrollRight}
                aria-label="Xem sản phẩm tiếp theo"
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                  canScrollRight
                    ? 'bg-white text-dark-950 border-white shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:scale-105 hover:bg-slate-100'
                    : 'bg-white/5 border-white/10 text-slate-600 cursor-not-allowed opacity-40'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>


        {/* Product Single Row Carousel Container */}
        {catalogLoading ? (
          <div role="status" className="py-24 text-center text-slate-300">Đang tải tuyệt tác trang sức…</div>
        ) : catalogError ? (
          <p role="alert" className="py-16 text-center text-red-400">{catalogError}</p>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center glass-panel rounded-3xl p-8 border border-white/10">
            <p className="text-slate-300 text-base">Không tìm thấy sản phẩm phù hợp trong danh mục này.</p>
            <button
              onClick={() => setActiveCategory('Tất cả')}
              className="cta-luxury-secondary mt-4 !px-6 !py-2 text-xs"
            >
              Xem tất cả sản phẩm
            </button>
          </div>
        ) : (
          <div className="relative group/track">
            {/* Horizontal Scroll Track */}
            <div
              ref={scrollContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="flex flex-nowrap items-stretch gap-5 sm:gap-6 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-4 px-1 cursor-grab active:cursor-grabbing touch-pan-x"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {filteredProducts.map((product, idx) => {
                const isAdded = addedIds.includes(product.id);

                return (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: Math.min(idx * 0.06, 0.3) }}
                    onClick={() => handleCardClick(product.id)}
                    className="w-[280px] sm:w-[320px] lg:w-[345px] shrink-0 snap-start group relative rounded-3xl glass-panel p-4 sm:p-5 border border-white/15 hover:border-white/40 transition-all duration-300 shadow-glass flex flex-col justify-between cursor-pointer hover:scale-[1.02] bg-white/[0.03] hover:bg-white/[0.06]"
                  >
                    {/* Top Image Container */}
                    <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-dark-950/90 mb-4 border border-white/10">
                      
                      {/* Product Image */}
                      <img
                        {...productImageProps(product.image)}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        draggable="false"
                        className="w-full h-full object-cover object-center group-hover:scale-108 transition-transform duration-500 select-none"
                      />

                      {/* Top Action Badges (AR & NFC) */}
                      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                        {product.tryOnAvailable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTryOnProduct(product);
                            }}
                            title={product.category === 'Nhẫn' ? t('Trải nghiệm Nhẫn · AR', 'Try on Ring · AR') : product.category === 'Vòng tay' ? t('Trải nghiệm Vòng Tay · AR', 'Try on Bracelet · AR') : t('Trải nghiệm Dây Chuyền · AR', 'Try on Necklace · AR')}
                            className="h-9 px-3 rounded-full bg-dark-950/90 backdrop-blur-md border border-amber-300/50 text-amber-200 flex items-center justify-center text-[11px] font-bold shadow-lg hover:scale-105 hover:border-amber-300 hover:bg-amber-400/20 transition-all cursor-pointer"
                          >
                            <span>Trải Nghiệm AR</span>
                          </button>
                        )}
                        {product.hasNFC && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenNfcDemo) onOpenNfcDemo(product.id);
                            }}
                            title="Chạm thử chip NFC"
                            className="w-9 h-9 rounded-full bg-dark-950/90 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:scale-115 hover:border-white hover:bg-white/25 transition-all cursor-pointer"
                          >
                            <SmartphoneNfc className="w-4 h-4 text-amber-300" />
                          </button>
                        )}
                      </div>

                      {/* Tag / Category Badge */}
                      {product.tag && (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-dark-950/80 backdrop-blur-md border border-white/20 text-[10px] uppercase font-bold tracking-widest text-slate-200">
                          {product.tag}
                        </span>
                      )}

                      {/* Quick Hover Overlay */}
                      <div className="absolute inset-0 bg-dark-950/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectProduct) onSelectProduct(product.id);
                          }}
                          className="p-3 rounded-full bg-white text-dark-950 hover:bg-slate-200 transition-all shadow-xl font-medium"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Product Info */}
                    <div className="space-y-1.5 text-center mt-auto">
                      <h3 className="font-serif text-base sm:text-lg font-medium text-slate-100 tracking-wider group-hover:text-white transition-colors">
                        {product.name}
                      </h3>

                      <p className="text-xs text-slate-300 font-light">
                        {product.material}
                        {isEn && <span className="text-[10px] text-amber-200/70 font-normal"> · Sterling Silver S925</span>}
                      </p>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <span className="text-base font-bold text-white tracking-wide">
                          {product.formattedPrice}
                        </span>
                        {product.rating > 0 && (
                          <div className="flex items-center gap-1 text-slate-300 text-xs font-medium pl-2 border-l border-white/10">
                            <span>{product.rating}</span>
                            <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                          </div>
                        )}
                      </div>

                      {/* High-Impact Visible CTA Button On Product Card */}
                      <div className="pt-3 space-y-2">
                        {product.tryOnAvailable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTryOnProduct(product);
                            }}
                            className="w-full py-2 px-3 rounded-xl border border-amber-100/40 text-amber-100 bg-amber-100/10 text-xs font-semibold hover:bg-amber-100/20 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                          >
                            <span>
                              {product.category === 'Nhẫn'
                                ? t('Trải nghiệm Nhẫn · AR', 'Try on Ring · AR')
                                : product.category === 'Vòng tay'
                                  ? t('Trải nghiệm Vòng Tay · AR', 'Try on Bracelet · AR')
                                  : t('Trải nghiệm Dây Chuyền · AR', 'Try on Necklace · AR')}
                            </span>
                          </button>
                        )}
                        <button
                          onClick={(e) => handleAddToCart(product, e)}
                          className="cta-luxury-gold !w-full !py-2.5 !text-xs !tracking-wider shadow-[0_0_20px_rgba(250,204,21,0.5)]"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Khám Phá & Đặt Mua · Order Now' : 'Khám Phá & Đặt Mua'}</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* End of Row Card: Link to Full Shop Catalog */}
              <div
                onClick={() => {
                  if (onNavigateToShop) onNavigateToShop();
                  else if (onSelectProduct) onSelectProduct(filteredProducts[0]?.id);
                }}
                className="w-[260px] sm:w-[300px] shrink-0 snap-start rounded-3xl glass-panel p-6 border border-white/20 hover:border-amber-300/60 transition-all duration-300 shadow-glass flex flex-col items-center justify-center text-center cursor-pointer bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:scale-[1.02] group"
              >
                <div className="w-16 h-16 rounded-full bg-white/10 border border-white/25 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-amber-400/20 transition-all">
                  <ArrowRight className="w-7 h-7 text-white group-hover:text-amber-300 transition-colors" />
                </div>
                <h4 className="font-serif text-xl font-bold text-white mb-2">
                  Xem Toàn Bộ
                </h4>
                <p className="text-xs text-slate-300 font-light leading-relaxed mb-6 max-w-[200px]">
                  Khám phá trọn vẹn bộ sưu tập trang sức Bạc S925 tích hợp NFC tại Cửa Hàng.
                </p>
                <button
                  className="cta-luxury-gold !w-full !py-3 !text-xs"
                >
                  <span>Mở Cửa Hàng</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scroll Progress Bar */}
            <div className="mt-4 w-full max-w-xs mx-auto h-1 rounded-full bg-white/10 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-slate-300 via-white to-amber-300 rounded-full transition-all duration-150"
                style={{ width: `${Math.max(15, scrollProgress)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {tryOnProduct && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-[100] grid place-items-center bg-black/90 text-white">{t('Đang mở gương AR…', 'Opening AR mirror…')}</div>}>
          <VirtualTryOnModal
            key={tryOnProduct.id}
            product={tryOnProduct}
            settings={settings}
            onAddToCart={onAddToCart}
            onClose={() => setTryOnProduct(null)}
          />
        </Suspense>
      )}
    </section>
  );
}
