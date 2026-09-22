import React, { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, ShoppingBag, SmartphoneNfc, Shield, Check, Plus, Minus, Gift } from 'lucide-react';
import { useStore } from '../components/StoreProvider';
import { useLanguage } from '../i18n/LanguageProvider';
const VirtualTryOnModal=lazy(()=>import('./VirtualTryOnModal'));

export default function ProductDetailModal({ productId, onClose, onAddToCart, onOpenNfcDemo }) {
  const { language, t } = useLanguage();
  const isEn = language === 'en';
  const { products, settings, loading: catalogLoading, error: catalogError } = useStore();
  const product = products.find(p => p.id === productId);

  const defaultSizes = (product?.variants || []).map(v => v.size);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState(product?.variants?.find(v => v.stock > 0)?.size || defaultSizes[0]);
  const [isGift, setIsGift] = useState(false);
  const [added, setAdded] = useState(false);
  const [tryOn,setTryOn]=useState(false);

  const selectedVariant = product?.variants?.find(v => v.size === selectedSize);
  const canBuy = settings?.sales_enabled && product?.active && selectedVariant?.stock >= quantity;
  if (!product) return null;

  const handleAdd = () => {
    if (!canBuy) return;
    if (onAddToCart) {
      onAddToCart(
        {
          ...product,
          size: selectedSize,
          isGift
        },
        quantity
      );
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <AnimatePresence>
      {tryOn&&<Suspense fallback={<div role="status" className="fixed inset-0 z-[100] grid place-items-center bg-black/90 text-white">{t('Đang mở gương AR…','Opening AR mirror…')}</div>}><VirtualTryOnModal product={product} settings={settings} initialSize={selectedSize} onClose={()=>setTryOn(false)} onAddToCart={onAddToCart}/></Suspense>}
      <div 
        inert={tryOn||undefined}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25 }}
          className="relative w-full max-w-3xl rounded-3xl glass-panel p-6 sm:p-8 border border-white/20 shadow-2xl bg-dark-900/95 overflow-hidden max-h-[90vh] overflow-y-auto text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors z-20 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-center">
            
            {/* Left: Product Image */}
            <div className="md:col-span-5 relative aspect-square rounded-2xl overflow-hidden bg-dark-950/90 border border-white/10">
              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
              {product.tag && (
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-dark-950/80 backdrop-blur-md border border-white/20 text-xs font-bold text-slate-200 uppercase">
                  {product.tag}
                </span>
              )}
            </div>

            {/* Right: Info & Actions */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-400 uppercase tracking-widest">{product.category}</span>
                  <span className="text-xs text-white/30">•</span>
                  <span className="text-xs text-slate-400">
                    {product.material}
                    {isEn && <span className="text-amber-200/80"> · Sterling Silver S925</span>}
                  </span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-serif font-bold text-white">
                  {product.name}
                </h3>
              </div>

              {/* Price & Rating */}
              <div className="flex flex-wrap gap-2 items-center justify-between pb-3 border-b border-white/10">
                <span className="text-2xl font-bold text-metallic">
                  {product.formattedPrice}
                </span>
                {product.rating > 0 && <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                  <Star className="w-4 h-4 fill-slate-200 text-slate-200" />
                  <span className="text-xs text-slate-400 font-normal">({product.reviewsCount} đánh giá)</span>
                </div>}
              </div>

              {/* Description */}
              {product.subtitle && <p className="font-serif text-lg text-white">{product.subtitle}</p>}
              <p className="text-sm text-slate-300 leading-relaxed font-light">
                {product.description}
              </p>
              {product.priceNote && <p className="text-xs text-slate-400">{product.priceNote}{product.unitsPerItem === 2 ? ' · Giá cho một bộ 2 chiếc; tồn kho tính theo bộ.' : ''}</p>}
              {product.benefits?.length > 0 && <div className="text-sm text-slate-300"><h4 className="font-semibold text-white mb-2">Đi kèm sản phẩm</h4><ul className="list-disc pl-5 space-y-1">{product.benefits.map(text => <li key={text}>{text}</li>)}</ul></div>}
              {product.specifications?.length > 0 && <details className="text-sm border border-white/10 rounded-xl p-3"><summary className="cursor-pointer min-h-[44px] flex items-center">Thông số sản phẩm</summary><dl className="space-y-3 pt-2">{product.specifications.map(([label,value]) => <div key={label} className="grid sm:grid-cols-2 gap-1"><dt className="text-slate-400">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl></details>}


              {/* Size selection */}
              {product.tryOnAvailable && (
                <button
                  onClick={() => setTryOn(true)}
                  className="w-full min-h-12 border border-amber-100/40 rounded-xl bg-amber-100/5 text-amber-100 font-semibold text-sm hover:bg-amber-100/10 transition-colors flex items-center justify-center gap-2"
                >
                  {product.category === 'Nhẫn'
                    ? t('Ướm thử nhẫn · AR', 'Try on ring · AR')
                    : product.category === 'Vòng tay'
                      ? t('Ướm thử vòng tay · AR', 'Try on bracelet · AR')
                      : t('Ướm thử lên cổ · AR', 'Try on necklace · AR')}
                </button>
              )}
              {defaultSizes.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Chọn phiên bản:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {defaultSizes.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        disabled={!product.variants.find(v => v.size === sz)?.stock}
                        onClick={() => { setSelectedSize(sz); setQuantity(1); }}
                        className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-all disabled:opacity-40 ${
                          selectedSize === sz
                            ? 'bg-white text-dark-950 border-white font-bold shadow-sm'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Gift option toggle */}
              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="rounded text-white focus:ring-0"
                />
                <div className="flex items-center gap-2 text-xs">
                  <Gift className="w-4 h-4 text-slate-200" />
                  <span>{product.benefits?.length ? 'Nâng cấp gói quà & thiệp' : 'Hộp quà & thiệp'} (+{new Intl.NumberFormat('vi-VN').format(settings?.gift_fee || 0)} đ / đơn)</span>
                </div>
              </label>

              {/* NFC Micro-Feature Callout */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <SmartphoneNfc className="w-5 h-5 text-slate-200 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-white">Tích hợp chip Memory Space NFC</p>
                    <p className="text-[11px] text-slate-400">Chạm mở ảnh & lời chúc, tương thích iOS & Android</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    if (onOpenNfcDemo) onOpenNfcDemo(product.id);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors min-h-[36px]"
                >
                  Chạm thử
                </button>
              </div>

              {/* Quantity & Add to Cart */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                <div className="flex items-center rounded-xl bg-white/5 border border-white/10 p-1">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-1.5 text-slate-400 hover:text-white"
                    aria-label="Giảm số lượng"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-3 text-sm font-semibold text-white">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(selectedVariant?.stock || 1, quantity + 1))}
                    className="p-1.5 text-slate-400 hover:text-white"
                    aria-label="Tăng số lượng"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={handleAdd}
                  disabled={!canBuy}
                  className="flex-1 h-11 min-h-[44px] px-6 rounded-2xl bg-white text-dark-950 font-bold text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2 shadow-silver-glow active:scale-[0.98] cursor-pointer"
                >
                  {added ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>{isEn ? 'Đã thêm vào giỏ! · Added!' : 'Đã thêm vào giỏ!'}</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>{canBuy ? (isEn ? 'Thêm Vào Giỏ Hàng · Add To Cart' : 'Thêm Vào Giỏ Hàng') : (isEn ? 'Tạm Hết Hàng · Sold Out' : 'Chưa có hàng để bán')}</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </motion.div>
      </div>
      {tryOn && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-[100] grid place-items-center bg-black/90 text-white">{t('Đang mở gương AR…', 'Opening AR mirror…')}</div>}>
          <VirtualTryOnModal
            key={product.id}
            product={product}
            settings={settings}
            onAddToCart={onAddToCart}
            onClose={() => setTryOn(false)}
          />
        </Suspense>
      )}
    </AnimatePresence>
  );
}
