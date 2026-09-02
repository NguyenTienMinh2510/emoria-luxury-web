import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, ShoppingBag, ArrowRight, CheckCircle2, Plus, Minus } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function CartDrawer({ isOpen, onClose, cartItems, onUpdateQuantity, onRemoveItem, onClearCart }) {
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  const totalPrice = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(totalPrice) + ' VNĐ';

  const handleCheckout = () => {
    setIsCheckingOut(true);
    setTimeout(() => {
      setIsCheckingOut(false);
      setOrderComplete(true);
      confetti({
        particleCount: 70,
        spread: 80,
        origin: { y: 0.5 }
      });
      setTimeout(() => {
        onClearCart();
        setOrderComplete(false);
        onClose();
      }, 2500);
    }, 1200);
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
          className="w-full max-w-md bg-dark-900 border-l border-white/10 h-full p-6 flex flex-col justify-between shadow-2xl"
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
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {orderComplete ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <CheckCircle2 className="w-14 h-14 text-emerald-400 animate-bounce" />
                <h4 className="text-xl font-serif font-bold text-white">Đặt Hàng Thành Công!</h4>
                <p className="text-xs text-slate-300">
                  EMORIA sẽ gửi trang sức bạc S925 cùng hướng dẫn kích hoạt chip NFC đến bạn sớm nhất.
                </p>
              </div>
            ) : cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-3">
                <ShoppingBag className="w-12 h-12 opacity-30" />
                <p className="text-sm">Giỏ hàng của bạn đang trống</p>
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
                >
                  Khám phá trang sức ngay
                </button>
              </div>
            ) : (
              cartItems.map((item) => (
                <div 
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3.5"
                >
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover bg-dark-950" />
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate font-serif">{item.name}</h4>
                    <p className="text-xs text-slate-400">{item.material}</p>
                    <p className="text-xs font-bold text-slate-200 mt-1">{item.formattedPrice}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center rounded-lg bg-white/10 px-1 py-0.5 text-xs">
                      <button 
                        onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                        className="px-1 text-slate-400 hover:text-white"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 text-white font-semibold">{item.quantity}</span>
                      <button 
                        onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                        className="px-1 text-slate-400 hover:text-white"
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
          {cartItems.length > 0 && !orderComplete && (
            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Tổng thanh toán:</span>
                <span className="text-xl font-bold text-white font-serif">{formattedTotal}</span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-slate-200 via-white to-slate-300 text-dark-950 font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-silver-glow"
              >
                {isCheckingOut ? (
                  <div className="w-5 h-5 border-2 border-dark-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Tiến Hành Đặt Hàng</span>
                    <ArrowRight className="w-4 h-4" />
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
