import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, ShoppingBag, ArrowRight, Plus, Minus, Gift, ShieldCheck, LogIn } from 'lucide-react';

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onOpenCheckout,
  currentUser,
  onOpenAuth
}) {
  const totalPrice = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(totalPrice) + ' VNĐ';

  const handleProceedToCheckout = () => {
    if (!currentUser) {
      if (onOpenAuth) {
        onOpenAuth();
      } else if (onOpenCheckout) {
        onOpenCheckout();
      }
      return;
    }
    onClose();
    if (onOpenCheckout) {
      onOpenCheckout();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 bg-dark-950/80 backdrop-blur-md flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="w-full max-w-md bg-dark-900 border-l border-white/10 h-full p-6 flex flex-col justify-between shadow-2xl text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-white" />
              <h3 className="font-serif text-lg font-bold text-white">Giỏ Hàng Của Bạn</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              aria-label="Đóng giỏ hàng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-3">
                <ShoppingBag className="w-12 h-12 opacity-30" />
                <p className="text-sm">Giỏ hàng của bạn đang trống</p>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors min-h-[44px] flex items-center justify-center"
                >
                  Khám phá trang sức ngay
                </button>
              </div>
            ) : (
              cartItems.map((item) => (
                <div 
                  key={`${item.id}-${item.size || 'default'}`}
                  className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3.5"
                >
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover bg-dark-950 shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate font-serif">{item.name}</h4>
                    <p className="text-xs text-slate-400">
                      {item.material} {item.size && `· Cỡ: ${item.size}`}
                    </p>
                    {item.isGift && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 mt-0.5">
                        <Gift className="w-3 h-3" />
                        <span>Kèm hộp quà sơn mài</span>
                      </span>
                    )}
                    <p className="text-xs font-bold text-slate-200 mt-1">{item.formattedPrice || `${new Intl.NumberFormat('vi-VN').format(item.price)} VNĐ`}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => onRemoveItem(item.id, item.size)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                      title="Xóa món này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center rounded-lg bg-white/10 px-1 py-0.5 text-xs">
                      <button 
                        onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1), item.size)}
                        className="px-1.5 py-1 text-slate-400 hover:text-white"
                        aria-label="Giảm"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 text-white font-semibold">{item.quantity}</span>
                      <button 
                        onClick={() => onUpdateQuantity(item.id, item.quantity + 1, item.size)}
                        className="px-1.5 py-1 text-slate-400 hover:text-white"
                        aria-label="Tăng"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer & Checkout */}
          {cartItems.length > 0 && (
            <div className="pt-4 border-t border-white/10 space-y-4">
              {!currentUser && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-amber-300">Yêu cầu tài khoản EMORIA</span>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Quý khách vui lòng đăng nhập hoặc tạo tài khoản để đặt hàng và kích hoạt bảo hành NFC cho kỷ vật.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Tổng thanh toán:</span>
                <span className="text-xl font-bold text-white font-serif">{formattedTotal}</span>
              </div>

              <button
                onClick={handleProceedToCheckout}
                className="w-full !h-13 !text-sm !tracking-wider cta-luxury-gold shadow-[0_0_35px_rgba(250,204,21,0.65)]"
              >
                {currentUser ? (
                  <>
                    <span>Tiến Hành Đặt Hàng</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Đăng Nhập Để Đặt Hàng</span>
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
