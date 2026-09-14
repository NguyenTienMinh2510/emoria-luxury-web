import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, Star, ShoppingBag, SmartphoneNfc, Eye, Check } from 'lucide-react';
import { categories } from '../data/products';
import { useStore } from './StoreProvider';

export default function ProductCatalog({ 
  onSelectProduct, 
  onAddToCart, 
  onOpenNfcDemo,
  searchQuery = '' 
}) {
  const { products, settings, loading: catalogLoading, error: catalogError } = useStore();
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [sortBy, setSortBy] = useState('default');
  const [addedIds, setAddedIds] = useState([]);

  // Filter & Search Logic
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
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

  const handleAddToCart = (product, e) => {
    e.stopPropagation();
    if (onSelectProduct) onSelectProduct(product.id);
    return;
    setAddedIds((prev) => [...prev, product.id]);
    setTimeout(() => {
      setAddedIds((prev) => prev.filter((id) => id !== product.id));
    }, 1500);
  };

  return (
    <section 
      id="products" 
      className="relative min-h-screen w-full py-20 px-4 sm:px-6 lg:px-8 bg-dark-950 bg-diamond-pattern overflow-hidden"
    >
      {/* Background Decorative Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-slate-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Section Header matching Mockup 4 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 pb-6 border-b border-white/10 gap-6">
          
          {/* Left Title: Khám phá kí ức / A Touch To Remember */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-slate-100 tracking-wide">
              Khám phá kí ức
            </h2>
            <p className="font-serif italic text-base sm:text-lg text-slate-300 tracking-wider mt-1.5">
              A Touch To Remember
            </p>
          </motion.div>

          {/* Filter Bar & Categories matching Mockup 4 */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            
            {/* Filter Toggle Button */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl glass-panel text-slate-200 text-sm font-medium border border-white/15">
              <SlidersHorizontal className="w-4 h-4 text-slate-300" />
              <span>Filter</span>
            </div>

            {/* Category Tabs: Nhẫn, Vòng tay, Dây chuyền, Móc khóa */}
            <div className="flex items-center flex-wrap gap-1 sm:gap-2">
              {categories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`relative px-3.5 py-1.5 rounded-lg text-sm sm:text-base transition-all duration-200 ${
                      isActive 
                        ? 'text-white font-semibold bg-white/10 border border-white/30 shadow-silver-glow' 
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Product Grid - 4 Columns matching Mockup 4 */}
        {catalogLoading ? <p role="status">Đang tải sản phẩm…</p> : catalogError ? <p role="alert">{catalogError}</p> : filteredProducts.length === 0 ? (
          <div className="py-20 text-center glass-panel rounded-3xl p-8 border border-white/10">
            <p className="text-slate-300 text-base">Không tìm thấy sản phẩm phù hợp trong danh mục này.</p>
            <button
              onClick={() => setActiveCategory('Tất cả')}
              className="mt-4 px-6 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
            >
              Xem tất cả sản phẩm
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {filteredProducts.map((product, idx) => {
              const isAdded = addedIds.includes(product.id);

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  whileHover={{ y: -6 }}
                  onClick={() => onSelectProduct && onSelectProduct(product.id)}
                  className="group relative rounded-2xl glass-panel p-3 sm:p-4 border border-white/10 hover:border-white/30 transition-all duration-300 shadow-glass flex flex-col justify-between cursor-pointer"
                >
                  {/* Top Image Container */}
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-dark-950/90 mb-4 border border-white/5">
                    
                    {/* Product Image */}
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover object-center group-hover:scale-108 transition-transform duration-500"
                    />

                    {/* NFC Featured Circular Badge on top-right (matching Mockup 4 Product 4) */}
                    {product.hasNFC && (
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenNfcDemo) onOpenNfcDemo(product.id);
                          }}
                          title="Chạm thử chip NFC"
                          className="w-8 h-8 rounded-full bg-dark-950/80 backdrop-blur-md border border-white/30 text-white flex items-center justify-center shadow-lg hover:scale-115 hover:border-white hover:bg-white/20 transition-all"
                        >
                          <SmartphoneNfc className="w-4 h-4 text-slate-200" />
                        </button>
                      </div>
                    )}

                    {/* Tag / Category Badge */}
                    {product.tag && (
                      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-dark-950/70 backdrop-blur-md border border-white/15 text-[10px] uppercase font-bold tracking-wider text-slate-300">
                        {product.tag}
                      </span>
                    )}

                    {/* Quick Action Overlay on Hover */}
                    <div className="absolute inset-0 bg-dark-950/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectProduct) onSelectProduct(product.id);
                        }}
                        className="p-2.5 rounded-full bg-white/20 hover:bg-white text-white hover:text-dark-950 transition-all shadow-lg"
                        title="Xem chi tiết"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleAddToCart(product, e)}
                        className="p-2.5 rounded-full bg-white text-dark-950 hover:bg-slate-200 transition-all shadow-lg font-medium"
                        title="Thêm vào giỏ"
                      >
                        {isAdded ? <Check className="w-4 h-4 text-emerald-600" /> : <ShoppingBag className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Product Details matching Mockup 4 Typography */}
                  <div className="text-center space-y-1 mt-auto">
                    {/* Name */}
                    <h3 className="font-serif text-base sm:text-lg font-medium text-slate-100 tracking-wider group-hover:text-white transition-colors">
                      {product.name}
                    </h3>

                    {/* Material */}
                    <p className="text-xs text-slate-300 font-light">
                      {product.material}
                    </p>

                    {/* Price */}
                    <p className="text-sm font-semibold text-slate-200 pt-0.5">
                      {product.formattedPrice}
                    </p>

                    {/* Rating Stars matching Mockup 4 (e.g. 4.8 ★, 5 ★) */}
                    <div className="flex items-center justify-center gap-1 pt-1 text-slate-300 text-xs font-medium">
                      <span>{product.rating}</span>
                      <Star className="w-3.5 h-3.5 fill-slate-200 text-slate-200" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
