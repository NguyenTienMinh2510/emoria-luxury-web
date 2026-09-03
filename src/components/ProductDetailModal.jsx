import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, ShoppingBag, SmartphoneNfc, Shield, Check, Plus, Minus } from 'lucide-react';
import { products } from '../data/products';

export default function ProductDetailModal({ productId, onClose, onAddToCart, onOpenNfcDemo }) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const product = products.find(p => p.id === productId);
  if (!product) return null;

  const handleAdd = () => {
    if (onAddToCart) onAddToCart(product, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25 }}
          className="relative w-full max-w-3xl rounded-3xl glass-panel p-6 sm:p-8 border border-white/20 shadow-2xl bg-dark-900/95 overflow-hidden max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors z-20"
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
                  <span className="text-xs text-slate-400">{product.material}</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-serif font-bold text-white">
                  {product.name}
                </h3>
              </div>

              {/* Price & Rating */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-2xl font-bold text-metallic">
                  {product.formattedPrice}
                </span>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                  <span>{product.rating}</span>
                  <Star className="w-4 h-4 fill-slate-200 text-slate-200" />
                  <span className="text-xs text-slate-400 font-normal">({product.reviewsCount} đánh giá)</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-300 leading-relaxed font-light">
                {product.description}
              </p>

              {/* NFC Micro-Feature Callout */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <SmartphoneNfc className="w-5 h-5 text-slate-200 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-white">Tích hợp chip Memory Space NFC</p>
                    <p className="text-[11px] text-slate-400">Không cần cài ứng dụng, tương thích iOS & Android</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    if (onOpenNfcDemo) onOpenNfcDemo(product.id);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
                >
                  Chạm thử
                </button>
              </div>

              {/* Quantity & Add to Cart */}
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center rounded-xl bg-white/5 border border-white/10 p-1">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-1.5 text-slate-400 hover:text-white"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-3 text-sm font-semibold text-white">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-1.5 text-slate-400 hover:text-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={handleAdd}
                  className="flex-1 h-11 min-h-[44px] px-6 rounded-2xl bg-white text-dark-950 font-bold text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2 shadow-silver-glow active:scale-[0.98] cursor-pointer"
                >
                  {added ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Đã thêm vào giỏ!</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Thêm Vào Giỏ Hàng</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
