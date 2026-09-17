import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, ShoppingBag, Eye, SmartphoneNfc, Sparkles, 
  CheckCircle2, Package, Truck, Clock, ShieldCheck, Heart, RefreshCw, X
} from 'lucide-react';
import { useStore } from '../components/StoreProvider';
import { trackOrderSecure } from '../services/orderBackendService';

export default function ShopView({
  initialSearch = '',
  onSelectProduct,
  onAddToCart,
  onOpenNfcDemo,
  onOpenCart,
}) {
  const { products, settings, loading: catalogLoading, error: catalogError } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => { setSearchQuery(initialSearch); }, [initialSearch]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'tracking'
  
  // Order Tracking State
  const [trackingInput, setTrackingInput] = useState('');
  const [trackingToken, setTrackingToken] = useState('');
  const [trackingResults, setTrackingResults] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [isSearchingOrder, setIsSearchingOrder] = useState(false);

  // Danh mục sản phẩm
  const categories = [
    { id: 'all', label: 'Tất Cả Sản Phẩm' },
    { id: 'Dây chuyền', label: 'Dây Chuyền S925' },
    { id: 'Nhẫn', label: 'Nhẫn Cặp & Đơn' },
    { id: 'Vòng tay', label: 'Vòng Tay & Lắc' },
  ];

  // Lọc và sắp xếp sản phẩm
  const filteredProducts = useMemo(() => {
    return products
      .filter((item) => {
        if (!item.active) return false;
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.material.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase());
        
        let matchesPrice = true;
        if (priceFilter === 'under250') matchesPrice = item.price < 250000;
        else if (priceFilter === '250to300') matchesPrice = item.price >= 250000 && item.price <= 300000;
        else if (priceFilter === 'above300') matchesPrice = item.price > 300000;

        return matchesCategory && matchesSearch && matchesPrice;
      })
      .sort((a, b) => {
        if (sortBy === 'priceAsc') return a.price - b.price;
        if (sortBy === 'priceDesc') return b.price - a.price;
        if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
        return 0; // Default popular
      });
  }, [products, selectedCategory, searchQuery, priceFilter, sortBy]);

  // Xử lý tra cứu đơn hàng
  const handleTrackOrder = async (e) => {
    e.preventDefault();setTrackingError('');setTrackingResults(null);setIsSearchingOrder(true);
    try { const order=await trackOrderSecure(trackingInput,trackingToken);setTrackingResults([order]); }
    catch(error){setTrackingError(error.message);}finally{setIsSearchingOrder(false);}
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending_payment':
        return { label: 'Chờ Thanh Toán VietQR', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'confirmed':
        return { label: 'Đã Tiếp Nhận & Chờ Gia Công', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'crafting_nfc':
        return { label: 'Đang Đúc & Nạp Chip NFC', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'shipping':
        return { label: 'Đang Vận Chuyển', bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' };
      case 'completed':
        return { label: 'Đã Giao Thành Công', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'cancelled':
        return {label:'Đã hủy',bg:'bg-red-500/20 text-red-300 border-red-500/40'};
      default:
        return { label: 'Đang Xử Lý', bg: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };
    }
  };

  return (
    <div className="w-full bg-dark-950 text-slate-100 min-h-screen pt-24 pb-20 selection:bg-white/20">
      
      {/* 1. Header Banner Cửa Hàng - Pure Dark Luxury */}
      <section className="relative px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mb-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-gradient-to-b from-white/10 to-transparent blur-3xl pointer-events-none rounded-full" />
        
        <div className="relative z-10 text-center max-w-3xl mx-auto pt-6 pb-8 border-b border-white/10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-xs text-slate-300 tracking-widest uppercase mb-4 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-white/80" />
            <span>Emoria Luxury Boutique • S925 & NFC Technology</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-metallic uppercase leading-tight mb-4">
            Cửa Hàng Trang Sức Bạc
          </h1>
          
          <p className="text-sm sm:text-base text-slate-300 font-light leading-relaxed mb-6">
            Mỗi chế tác trang sức Bạc Ý S925 cao cấp là một kiệt tác thủ công độc bản, ẩn chứa vi chip NFC lưu trữ hình ảnh, âm thanh và lời nhắn trên máy chủ.
          </p>

          {/* Sub Navigation Tabs: Cửa Hàng vs Tra Cứu Đơn Hàng */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold tracking-wider uppercase transition-all duration-300 cursor-pointer flex items-center gap-2 ${
                activeTab === 'catalog'
                  ? 'bg-white text-dark-950 shadow-silver-glow scale-105'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Duyệt Sản Phẩm ({products.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('tracking')}
              className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold tracking-wider uppercase transition-all duration-300 cursor-pointer flex items-center gap-2 ${
                activeTab === 'tracking'
                  ? 'bg-white text-dark-950 shadow-silver-glow scale-105'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Tra Cứu Đơn Hàng</span>
            </button>
          </div>

          {/* 3 Quick Value Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 text-left">
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-slate-300 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-white">Bạc S925 Chuẩn Quốc Tế</p>
                <p className="text-slate-400 font-light">Không kích ứng, độ sáng bóng vượt trội</p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <SmartphoneNfc className="w-5 h-5 text-slate-300 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-white">NFC Memory Chip</p>
                <p className="text-slate-400 font-light">Chạm mở ảnh, video & giọng nói trên máy chủ</p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <Package className="w-5 h-5 text-slate-300 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-white">Hộp Quà Sơn Mài Emoria</p>
                <p className="text-slate-400 font-light">Sang trọng, kèm thư cảm ơn mạ bạc</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Main Content Area: Catalog OR Tracking */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ===================== TAB 1: PRODUCT CATALOG ===================== */}
        {activeTab === 'catalog' && (
          <div>
            {/* Filter & Search Bar */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                
                {/* Categories Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer ${
                        selectedCategory === cat.id
                          ? 'bg-white text-dark-950 font-semibold shadow-md'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Search & Sort Controls */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                  {/* Search Box */}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Tìm tên, chất liệu..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl bg-black/40 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Price Filter */}
                  <select
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value)}
                    className="px-3 py-2 text-xs sm:text-sm rounded-xl bg-black/40 border border-white/15 text-slate-200 focus:outline-none focus:border-white/40 cursor-pointer"
                  >
                    <option value="all">Mọi mức giá</option>
                    <option value="under250">Dưới 250.000đ</option>
                    <option value="250to300">250.000đ - 300.000đ</option>
                    <option value="above300">Trên 300.000đ</option>
                  </select>

                  {/* Sort Filter */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 text-xs sm:text-sm rounded-xl bg-black/40 border border-white/15 text-slate-200 focus:outline-none focus:border-white/40 cursor-pointer"
                  >
                    <option value="popular">Nổi bật nhất</option>
                    <option value="priceAsc">Giá tăng dần</option>
                    <option value="priceDesc">Giá giảm dần</option>
                    <option value="rating">Đánh giá cao</option>
                  </select>
                </div>

              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between mb-6 px-1">
              <p className="text-xs text-slate-400">
                Hiển thị <span className="font-semibold text-white">{filteredProducts.length}</span> tuyệt phẩm trang sức
              </p>
              {(selectedCategory !== 'all' || searchQuery || priceFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearchQuery('');
                    setPriceFilter('all');
                    setSortBy('popular');
                  }}
                  className="text-xs text-slate-400 hover:text-white underline underline-offset-4 cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>

            {/* Product Grid */}
            {catalogLoading ? <p role="status">Đang tải sản phẩm…</p> : catalogError ? <p role="alert">{catalogError}</p> : filteredProducts.length === 0 ? (
              <div className="py-20 text-center rounded-3xl bg-white/[0.02] border border-white/10">
                <Package className="w-12 h-12 text-slate-500 mx-auto mb-3 stroke-1" />
                <h3 className="font-serif text-lg font-semibold text-white mb-1">Không tìm thấy sản phẩm phù hợp</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                  Hãy thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác để khám phá các tuyệt phẩm trang sức S925 khác.
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearchQuery('');
                    setPriceFilter('all');
                  }}
                  className="px-5 py-2 rounded-full bg-white text-dark-950 text-xs font-semibold uppercase tracking-wider"
                >
                  Xem Tất Cả Sản Phẩm
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="group relative flex flex-col rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/30 transition-all duration-300 overflow-hidden hover:shadow-silver-glow"
                  >
                    {/* Product Image Area */}
                    <div className="relative aspect-square w-full overflow-hidden bg-black/40">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />

                      {/* Tag Badges */}
                      <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
                        {product.tag && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white text-dark-950 shadow-md">
                            {product.tag}
                          </span>
                        )}
                        {product.hasNFC && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wider uppercase bg-black/70 backdrop-blur-md text-slate-200 border border-white/20 flex items-center gap-1">
                            <SmartphoneNfc className="w-2.5 h-2.5 text-white" />
                            <span>NFC Chip</span>
                          </span>
                        )}
                      </div>

                      {/* Quick Hover Overlay: NFC Demo & Detail View */}
                      <div className="absolute inset-0 bg-dark-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 p-4 backdrop-blur-xs">
                        <button
                          onClick={() => onSelectProduct(product.id)}
                          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white text-white hover:text-dark-950 border border-white/20 text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                          title="Xem chi tiết & chọn size"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Chi Tiết</span>
                        </button>

                        <button
                          onClick={() => onOpenNfcDemo(product.id)}
                          className="px-3 py-2 rounded-xl bg-white text-dark-950 hover:bg-slate-200 text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-md cursor-pointer"
                          title="Chạm thử NFC kỷ niệm của sản phẩm này"
                        >
                          <SmartphoneNfc className="w-3.5 h-3.5" />
                          <span>Thử NFC</span>
                        </button>
                      </div>
                    </div>

                    {/* Product Info */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span>{product.category}</span>
                          <span className="text-slate-300 font-medium">Bạc S925</span>
                        </div>

                        <h3 
                          onClick={() => onSelectProduct(product.id)}
                          className="font-serif text-base font-bold text-white group-hover:text-slate-200 transition-colors cursor-pointer line-clamp-1 mb-1"
                        >
                          {product.name}
                        </h3>

                        <p className="text-[11px] text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                          {product.description}
                        </p>
                      </div>

                      {/* Price & Add to Cart Button */}
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-400 font-light">Giá chế tác</p>
                          <p className="font-serif text-base font-bold text-white tracking-tight">
                            {product.formattedPrice}
                          </p>
                        </div>

                        <button
                          onClick={() => {
                            onAddToCart(product, 1);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-white text-dark-950 hover:bg-slate-200 text-xs font-bold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 shadow-silver-glow cursor-pointer active:scale-95"
                          title="Thêm vào giỏ hàng"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Mua</span>
                        </button>
                      </div>
                    </div>

                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 2: ORDER TRACKING ===================== */}
        {activeTab === 'tracking' && (
          <div className="max-w-3xl mx-auto">
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-2xl mb-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/20 flex items-center justify-center mx-auto mb-4 text-white shadow-silver-glow">
                <Truck className="w-7 h-7 stroke-1" />
              </div>
              
              <h2 className="font-serif text-2xl font-bold text-white mb-2 uppercase">
                Tra Cứu Tiến Độ Đơn Hàng
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-6">
                Nhập mã đơn hàng (EMO-…) đã nhận được sau khi đặt mua để kiểm tra tiến độ chế tác và giao hàng.
              </p>

              <form onSubmit={handleTrackOrder} className="max-w-lg mx-auto space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      required
                      placeholder="Nhập mã đơn hàng (EMO-…)"
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value)}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-black/50 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/30 uppercase font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearchingOrder || !trackingInput.trim()}
                    className="px-6 py-3 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isSearchingOrder ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span>Tra Cứu Đơn</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    aria-label="Số điện thoại hoặc mã tra cứu bổ sung (tùy chọn)"
                    type="text"
                    placeholder="Số điện thoại hoặc mã tra cứu riêng (tùy chọn)"
                    value={trackingToken}
                    onChange={(e) => setTrackingToken(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-black/30 border border-white/10 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-white/30"
                  />
                </div>
              </form>

              {trackingError && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center">
                  {trackingError}
                </div>
              )}
            </div>

            {/* Tracking Results List */}
            {trackingResults && trackingResults.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider px-1">
                  Tìm thấy {trackingResults.length} đơn hàng của bạn:
                </h3>

                {trackingResults.map((order) => {
                  const badge = getStatusBadge(order.status);
                  return (
                    <div
                      key={order.id}
                      className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl"
                    >
                      {/* Order Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10 mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-lg font-bold text-white">{order.id}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${badge.bg}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Đặt ngày: {new Date(order.createdAt).toLocaleString('vi-VN')}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-400 font-light">Tổng thanh toán</p>
                          <p className="font-serif text-lg font-bold text-white">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.totals?.finalTotal || 0)}
                          </p>
                        </div>
                      </div>

                      {/* Items in order */}
                      <div className="space-y-3 mb-4">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-1">
                            <div className="flex items-center gap-3">
                              {item.image && (
                                <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-white/10" />
                              )}
                              <div>
                                <p className="font-semibold text-white">{item.name}</p>
                                <p className="text-slate-400 text-[11px]">
                                  Size: {item.size} • SL: {item.quantity} {item.isGift ? '• (Hộp quà +35k)' : ''}
                                </p>
                              </div>
                            </div>
                            <p className="font-medium text-slate-200">
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price * item.quantity)}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Shipping Info */}
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-slate-300 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-500">Người nhận: </span>
                          <span className="font-medium text-white">{order.customerName} ({order.phone})</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Địa chỉ giao: </span>
                          <span className="font-medium text-white">{order.address}, {order.city}</span>
                        </div>
                      </div>

                      {/* Timeline status */}
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Lịch sử tiến độ:</p>
                        <div className="space-y-2 relative border-l border-white/10 ml-2 pl-4">
                          {order.statusTimeline?.map((step, sIdx) => (
                            <div key={sIdx} className="relative text-xs">
                              <div className="w-2 h-2 rounded-full bg-white absolute -left-[21px] top-1.5 shadow-silver-glow" />
                              <p className="text-slate-200 font-medium">{step.description}</p>
                              <p className="text-[10px] text-slate-500">{new Date(step.time).toLocaleString('vi-VN')}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );
}
