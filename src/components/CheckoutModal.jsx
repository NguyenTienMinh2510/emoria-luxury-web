import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Truck, Banknote, QrCode, CheckCircle2, ArrowRight, Package, Clock, MapPin, Phone, Copy, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useStore } from './StoreProvider';
import { createOrder } from '../services/orderBackendService';
import {supabase} from '../lib/supabaseClient';
import {readPendingCheckout,savePendingCheckout,clearPendingCheckout} from '../services/checkoutSession';
import PaymentStatus from './PaymentStatus';
import BankAppPayment from './BankAppPayment';
import { getMyProfile, updateMyProfile } from '../services/profileService';

const BANK_BIN_NAMES = {
  '970418': 'BIDV',
  '970415': 'VietinBank',
  '970436': 'Vietcombank',
  '970422': 'MBBank',
  '970407': 'Techcombank',
  '970423': 'TPBank',
  '970432': 'VPBank',
  '970416': 'ACB',
  '970441': 'VIB',
  '970405': 'Agribank',
  '970448': 'OCB',
  '970428': 'Nam A Bank',
  '970454': 'BVBank',
  '970429': 'SCB',
  '970437': 'HDBank',
  '970403': 'Sacombank',
  '970431': 'Eximbank',
  '970443': 'SHB',
  '970425': 'ABBANK',
  '970426': 'MSB',
  '970438': 'BaoVietBank',
  '970440': 'SeABank',
  '970452': 'KienLongBank',
  '970457': 'Woori Bank',
  '970424': 'Shinhan Bank'
};

export default function CheckoutModal({ isOpen, onClose, cartItems, onOrderComplete, onTrack, currentUserId='guest', onOpenAuth }) {
  const { settings } = useStore();
  const isLoggedIn = Boolean(currentUserId && currentUserId !== 'guest');
  const [pending,setPending]=useState(()=>readPendingCheckout(currentUserId));
  const [submitError, setSubmitError] = useState('');
  const [fullName, setFullName] = useState(pending?.payload.customerName||'');
  const [phone, setPhone] = useState(pending?.payload.phone||'');
  const [address, setAddress] = useState(pending?.payload.address||'');
  const [email, setEmail] = useState(pending?.payload.email||'');
  const [note, setNote] = useState(pending?.payload.note||'');
  const [paymentMethod, setPaymentMethod] = useState(() => {
    if (pending) {
      if (pending.payload.paymentMethod === 'cod') return 'cod';
      return 'vietqr';
    }
    return settings?.transfer_enabled ? 'vietqr' : (settings?.cod_enabled ? 'cod' : 'vietqr');
  });

  // Auto-fill form fields from user profile and session
  useEffect(() => {
    if (!isOpen || !currentUserId || currentUserId === 'guest') return;
    if (pending) return;

    let active = true;

    async function loadUserData() {
      // 1. Session user (fast fallback)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (active && session?.user) {
          const u = session.user;
          if (u.email) setEmail((prev) => (prev && prev.trim() ? prev : u.email));
          const sName = u.user_metadata?.full_name || u.user_metadata?.name || '';
          if (sName) setFullName((prev) => (prev && prev.trim() ? prev : sName));
          const sPhone = u.phone || u.user_metadata?.phone || '';
          if (sPhone) setPhone((prev) => (prev && prev.trim() ? prev : sPhone));
        }
      } catch (err) {
        console.warn('Session user read error:', err);
      }

      // 2. Full profile from database
      try {
        const res = await getMyProfile();
        if (active && res?.success && res.profile) {
          const p = res.profile;
          if (p.full_name) setFullName((prev) => (prev && prev.trim() ? prev : p.full_name));
          if (p.phone) setPhone((prev) => (prev && prev.trim() ? prev : p.phone));
          if (p.address) setAddress((prev) => (prev && prev.trim() ? prev : p.address));
          if (p.email) setEmail((prev) => (prev && prev.trim() ? prev : p.email));
        }
      } catch (err) {
        console.warn('Profile read error:', err);
      }
    }

    loadUserData();

    return () => { active = false; };
  }, [isOpen, currentUserId, pending]);
  
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const submitting = useRef(false);
  const bankName = settings?.bank_bin || '';
  const bankAccount = settings?.bank_account || '';
  const bankOwner = settings?.bank_owner || '';
  const displayBankName = BANK_BIN_NAMES[bankName] ? `${BANK_BIN_NAMES[bankName]} (${bankName})` : (bankName || 'Ngân hàng');
  const paymentConfigured = Boolean(!settings?.sandbox && bankName && bankAccount && bankOwner);

  if (!isOpen) return null;

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const giftWrapFee = cartItems.some(i => i.isGift) ? (settings?.gift_fee || 0) : 0;
  const shippingFee = subtotal >= (settings?.free_shipping_from || 0) || subtotal === 0 ? 0 : (settings?.shipping_fee || 0);
  const total = subtotal + giftWrapFee + shippingFee;
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(total) + ' VNĐ';

  const validate = () => {
    const errs = {};
    if (!fullName.trim()) errs.fullName = 'Vui lòng nhập họ và tên người nhận.';
    if (!phone.trim()) {
      errs.phone = 'Vui lòng nhập số điện thoại liên hệ.';
    } else if (!/^[0-9+ ]{9,15}$/.test(phone.trim())) {
      errs.phone = 'Số điện thoại không hợp lệ.';
    }
    if (!address.trim()) errs.address = 'Vui lòng nhập địa chỉ giao nhận chi tiết.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (submitting.current || (!pending&&!validate())) return;
    submitting.current = true;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const chosenMethod = paymentMethod === 'cod' ? 'cod' : 'vietqr';
      const payload = {
        customerName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        note: note.trim(),
        paymentMethod: chosenMethod,
        items: cartItems,
        hasGiftBox: cartItems.some(i => i.isGift),
      };
      const {data:session}=await supabase.auth.getSession();
      const sessionUser = session.session?.user;
      if (!isLoggedIn || !sessionUser) {
        setSubmitError('Quý khách vui lòng đăng nhập hoặc đăng ký tài khoản EMORIA để tiến hành đặt hàng.');
        if (onOpenAuth) onOpenAuth();
        submitting.current = false;
        setIsSubmitting(false);
        return;
      }
      const actor=sessionUser.id;
      let request=pending;
      if(request&&request.actor!==actor)throw new Error('Yêu cầu đang chờ thuộc phiên đăng nhập trước. Quay lại đúng tài khoản để kiểm tra kết quả đơn này.');
      if(!request){request={id:crypto.randomUUID(),payload,actor};savePendingCheckout(request);setPending(request);}
      const result = await createOrder({ ...request.payload, requestId: request.id });

      if (!result.success){if(!result.retryable){clearPendingCheckout(actor);setPending(null);}throw new Error(result.error || 'Không thể tạo đơn hàng.');}
      clearPendingCheckout(actor);setPending(null);
      setCompletedOrder(result.order);

      if (onOrderComplete) {
        onOrderComplete(result.order);
      }

      // Persist phone and address to user profile in background so customer never has to re-enter
      if (isLoggedIn) {
        updateMyProfile({
          fullName: fullName.trim(),
          phone: phone.trim(),
          address: address.trim()
        }).catch(() => {});
      }

      setIsSubmitting(false);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      setSubmitError(err.message || 'Đã xảy ra lỗi khi tạo đơn hàng');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const handleCopyAccount = async () => {
    try{await navigator.clipboard.writeText(bankAccount);setCopiedAccount(true);setTimeout(() => setCopiedAccount(false), 2000);}catch{setSubmitError('Không sao chép được. Bạn có thể chọn số tài khoản và sao chép thủ công.');}
  };

  return (
    <AnimatePresence>
      <div role="dialog" aria-modal="true" aria-label="Đặt hàng"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-xl"
        onClick={()=>{if(!isSubmitting)onClose();}}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25 }}
          className="relative w-full max-w-2xl rounded-3xl glass-panel p-6 sm:p-8 border border-white/20 shadow-2xl bg-dark-900/95 overflow-hidden max-h-[90vh] overflow-y-auto text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            aria-label="Đóng đặt hàng"
            disabled={isSubmitting}
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors z-20"
          >
            <X className="w-5 h-5" />
          </button>

          {completedOrder ? (
            /* --- ORDER CONFIRMATION SCREEN --- */
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>

              <div className="space-y-1">
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                  {completedOrder.isTest ? 'Đã lưu đơn thử nghiệm' : completedOrder.paymentMethod === 'vietqr' ? 'Đã Ghi Nhận Đơn Hàng' : 'Đặt Hàng Thành Công!'}
                </h3>
                <p className="text-xs text-slate-300">
                  Mã đơn hàng:{' '}
                  <span className="font-mono font-bold text-metallic text-sm break-all select-all">{completedOrder.id}</span>
                </p>
              </div>

              {completedOrder.lookupToken && <div className="rounded-xl p-4 bg-white/5 text-left text-sm space-y-2"><p>Mã tra cứu riêng — hãy lưu lại:</p><code className="break-all select-all">{completedOrder.lookupToken}</code><p className="text-slate-400 text-xs">Dùng cùng mã đơn ở mục Tra cứu. Không chia sẻ mã này công khai.</p></div>}
              <div className="flex flex-wrap justify-center gap-3">{onTrack&&<button className="store-button" onClick={()=>onTrack(completedOrder)}>Tra cứu đơn vừa đặt</button>}<button className="store-button" onClick={async()=>{try{await navigator.clipboard.writeText(`Mã đơn: ${completedOrder.id}\nMã tra cứu riêng: ${completedOrder.lookupToken||''}`);setSubmitError('Đã sao chép thông tin tra cứu.');}catch{setSubmitError('Hãy chọn và sao chép mã hiển thị phía trên.');}}}>Sao chép mã tra cứu</button></div>{submitError&&<p role="status" className="text-sm">{submitError}</p>}
              <PaymentStatus order={completedOrder} autoRefresh/>

              {/* Bank transfer info if selected */}
              {completedOrder.paymentMethod === 'vietqr' && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <QrCode className="w-4 h-4 text-emerald-400" />
                    <span>Chuyển đúng số tiền và giữ nguyên nội dung mã đơn</span>
                  </div>

                  {paymentConfigured ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                          <img
                            src={`https://img.vietqr.io/image/${encodeURIComponent(bankName)}-${encodeURIComponent(bankAccount)}-compact2.png?amount=${completedOrder.totals?.finalTotal || ''}&addInfo=${encodeURIComponent(completedOrder.id)}&accountName=${encodeURIComponent(bankOwner)}`}
                            alt="VietQR Chuyển Khoản"
                            className="w-40 h-40 rounded-xl bg-white p-2 shadow-lg object-contain"
                            loading="lazy"
                          />
                          <span className="text-[10px] text-slate-400 mt-2 tracking-widest uppercase font-mono">Quét mã VietQR tự động</span>
                        </div>

                        <div className="space-y-2 text-xs text-slate-300">
                          <div>Ngân hàng: <strong className="text-white">{displayBankName}</strong></div>
                          <div className="flex items-center gap-2">
                            <span>STK: <strong className="font-mono text-white text-sm">{bankAccount}</strong></span>
                            <button
                              type="button"
                              onClick={handleCopyAccount}
                              className="p-1 text-slate-400 hover:text-white"
                              title="Sao chép số tài khoản"
                            >
                              {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <div>Chủ TK: <strong className="text-white">{bankOwner}</strong></div>
                          <div>Số tiền: <strong className="text-white font-bold text-sm">{completedOrder.totals.formattedTotal}</strong></div>
                          <div className="flex items-center gap-2">
                            <span>Nội dung: <strong className="font-mono text-emerald-400 font-bold">{completedOrder.id}</strong></span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(completedOrder.id);
                                alert('Đã sao chép mã đơn: ' + completedOrder.id);
                              }}
                              className="p-1 text-slate-400 hover:text-white"
                              title="Sao chép mã đơn"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <BankAppPayment bank={bankName} account={bankAccount} owner={bankOwner} order={completedOrder} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300">{settings?.sandbox ? 'Thanh toán thử nghiệm: quản trị viên xác nhận trong mục Đơn hàng. Không chuyển tiền thật.' : 'Chưa có thông tin nhận chuyển khoản. Đơn chưa được xác nhận thanh toán.'}</p>
                  )}
                </div>
              )}

              {/* Order summary table */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left space-y-2 text-xs">
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  Thông tin nhận hàng
                </div>
                <div className="text-slate-200 font-semibold">{completedOrder.customerName} · {completedOrder.phone}</div>
                <div className="text-slate-300">{completedOrder.address}</div>
                <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-white text-sm">
                  <span>Tổng cộng</span>
                  <span className="text-metallic">{completedOrder.totals.formattedTotal}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-11 rounded-2xl bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 shadow-silver-glow"
                >
                  Hoàn Tất & Đóng
                </button>
              </div>
            </div>
          ) : (
            /* --- CHECKOUT FORM SCREEN --- */
            <form onSubmit={handlePlaceOrder} className="space-y-6">
              {submitError && <p role="alert" className="text-red-300 bg-red-500/10 p-3 rounded-xl text-sm">{submitError}</p>}
              {pending&&<div className="p-4 rounded-xl border border-amber-300/30 text-sm space-y-2"><p>Có yêu cầu đặt hàng chưa xác định kết quả. Gửi lại cùng yêu cầu để nhận đúng đơn, không trừ kho thêm lần nữa.</p><p>{pending.payload.customerName} · {pending.payload.items.reduce((n,i)=>n+i.quantity,0)} món · {pending.payload.paymentMethod==='vietqr'?'Chuyển khoản':'COD'}</p><button type="submit" disabled={isSubmitting} className="store-button">{isSubmitting?'Đang kiểm tra…':'Gửi lại yêu cầu đang chờ'}</button></div>}
              {settings?.sandbox && <p className="text-amber-200 text-sm">Đơn thử nghiệm. Dùng thông tin giả lập; không chuyển tiền.</p>}

              {!isLoggedIn && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-xs space-y-1">
                    <p className="font-semibold text-amber-300 text-sm">Yêu cầu đăng nhập tài khoản EMORIA</p>
                    <p className="text-slate-300 leading-relaxed">
                      Để đảm bảo quyền sở hữu trang sức gắn chip bảo mật NFC và kích hoạt chế độ bảo hành độc bản, quý khách vui lòng đăng nhập hoặc tạo tài khoản trước khi đặt hàng.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenAuth) onOpenAuth();
                      }}
                      className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 text-dark-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all inline-flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <span>Đăng Nhập / Đăng Ký Tài Khoản</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-slate-300" />
                  <span className="text-xs uppercase tracking-widest text-slate-400">Thanh toán an toàn</span>
                </div>
                <h3 className="font-serif text-2xl font-bold text-white">
                  Thông Tin Đặt Hàng
                </h3>
              </div>

              {/* Customer fields */}
              <fieldset disabled={isSubmitting||Boolean(pending)} className="space-y-6 disabled:opacity-60">
              {isLoggedIn && (
                <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>Thông tin nhận hàng được tự động lấy từ hồ sơ tài khoản của bạn.</span>
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    Họ và tên người nhận <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    aria-label="Họ và tên người nhận" autoComplete="name" maxLength={120}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-xs"
                  />
                  {errors.fullName && <p className="text-[11px] text-rose-400 mt-1">{errors.fullName}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 font-medium block mb-1">
                      Số điện thoại <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      aria-label="Số điện thoại" autoComplete="tel" maxLength={20}
                      placeholder="0912345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full glass-input rounded-xl px-4 py-2.5 text-xs"
                    />
                    {errors.phone && <p className="text-[11px] text-rose-400 mt-1">{errors.phone}</p>}
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 font-medium block mb-1">
                      Email liên hệ (Tùy chọn)
                    </label>
                    <input
                      type="email"
                      aria-label="Email liên hệ" autoComplete="email" maxLength={254}
                      placeholder="email@vidu.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full glass-input rounded-xl px-4 py-2.5 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    Địa chỉ giao hàng <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
                    aria-label="Địa chỉ giao hàng" autoComplete="street-address" maxLength={500}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-xs"
                  />
                  {errors.address && <p className="text-[11px] text-rose-400 mt-1">{errors.address}</p>}
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    Ghi chú giao hàng (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Giao ngoài giờ hành chính, gọi trước khi đến..."
                    aria-label="Ghi chú giao hàng" maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-xs"
                  />
                </div>
              </div>

              {/* Payment methods */}
              <div className="space-y-2 pt-2">
                <label className="text-xs text-slate-300 font-medium block">
                  Phương thức thanh toán
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`p-3 rounded-2xl border cursor-pointer flex items-center gap-3 transition-all ${
                      paymentMethod === 'cod'
                        ? 'bg-white/10 border-white text-white font-semibold'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === 'cod'}
                      disabled={!settings?.cod_enabled}
                      onChange={() => setPaymentMethod('cod')}
                      className="text-white"
                    />
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs">Khi nhận hàng (COD)</span>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-2xl border cursor-pointer flex items-center gap-3 transition-all ${
                      paymentMethod === 'vietqr'
                        ? 'bg-white/10 border-white text-white font-semibold'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === 'vietqr'}
                      disabled={!settings?.transfer_enabled}
                      onChange={() => setPaymentMethod('vietqr')}
                      className="text-white"
                    />
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs">Chuyển khoản VietQR</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Order total */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Tiền hàng ({cartItems.reduce((s, i) => s + i.quantity, 0)} món)</span>
                  <span className="text-slate-200">{new Intl.NumberFormat('vi-VN').format(subtotal)} đ</span>
                </div>
                {giftWrapFee > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Hộp quà sơn mài & thiệp</span>
                    <span className="text-slate-200">+{new Intl.NumberFormat('vi-VN').format(giftWrapFee)} đ</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>Phí giao hàng</span>
                  <span className="text-slate-200">{shippingFee === 0 ? 'Miễn phí' : `${new Intl.NumberFormat('vi-VN').format(shippingFee)} đ`}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/10">
                  <span className="font-serif">Tổng thanh toán:</span>
                  <span className="text-metallic text-base">{formattedTotal}</span>
                </div>
              </div>

              {!isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenAuth) onOpenAuth();
                  }}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 text-dark-950 font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-amber-glow cursor-pointer"
                >
                  <span>Đăng Nhập Để Đặt Hàng · {formattedTotal}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || !settings?.sales_enabled || !cartItems.length || (paymentMethod === 'cod' ? !settings?.cod_enabled : !settings?.transfer_enabled)}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-slate-200 via-white to-slate-300 text-dark-950 font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-silver-glow cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-dark-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{paymentMethod === 'vietqr' ? 'Xác Nhận & Quét Mã VietQR' : 'Xác Nhận Đặt Hàng (COD)'} · {formattedTotal}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
              </fieldset>
            </form>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
