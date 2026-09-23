import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Lock, SmartphoneNfc, Check, Share2, Mail, Phone, MapPin, EyeOff, ArrowUp } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider';

export default function PrivacyPolicyModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const modalOverlayRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const handleScroll = (e) => {
    if (e.target.scrollTop > 250) {
      setShowScrollTop(true);
    } else {
      setShowScrollTop(false);
    }
  };

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Prevent background scrolling, support Escape key, and isolate scroll events
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Isolate modal touch and wheel events so background listeners never intercept them
    const overlay = modalOverlayRef.current;
    const stopScrollBubble = (e) => {
      e.stopPropagation();
    };

    if (overlay) {
      overlay.addEventListener('wheel', stopScrollBubble, { passive: true });
      overlay.addEventListener('touchmove', stopScrollBubble, { passive: true });
      overlay.addEventListener('touchstart', stopScrollBubble, { passive: true });
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (overlay) {
        overlay.removeEventListener('wheel', stopScrollBubble);
        overlay.removeEventListener('touchmove', stopScrollBubble);
        overlay.removeEventListener('touchstart', stopScrollBubble);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('policy') || url.searchParams.has('privacy') || url.hash === '#privacy') {
        url.searchParams.delete('policy');
        url.searchParams.delete('privacy');
        if (url.hash === '#privacy') url.hash = '';
        const cleanUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
        window.history.replaceState({}, '', cleanUrl);
      }
    } catch {}
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?policy=privacy`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  return (
    <div
      ref={modalOverlayRef}
      role="dialog"
      data-modal="privacy-policy"
      aria-modal="true"
      aria-labelledby="privacy-policy-title"
      className="fixed inset-0 z-[120] flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md overflow-hidden"
      onClick={handleClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl h-[92dvh] sm:h-[88dvh] max-h-[860px] bg-dark-900 border border-white/20 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-200"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-dark-950/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.2)] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="privacy-policy-title" className="font-serif text-base sm:text-xl font-bold text-metallic tracking-wide line-clamp-1">
                {t('CHÍNH SÁCH BẢO MẬT THÔNG TIN', 'PRIVACY & DATA POLICY')}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                {t('EMORIA — Trang sức Bạc Công nghệ S925', 'EMORIA — S925 Smart Sentimental Jewelry')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              title={t('Sao chép liên kết chia sẻ', 'Copy share link')}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5 transition-colors text-slate-300 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 hidden sm:inline">{t('Đã chép link', 'Link copied')}</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('Chia sẻ link', 'Share link')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Đóng"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Subheader Metadata */}
        <div className="px-4 sm:px-6 py-2 bg-white/[0.02] border-b border-white/5 flex flex-wrap items-center justify-between text-[10px] sm:text-[11px] text-slate-400 gap-2 shrink-0">
          <span>📅 {t('Ngày có hiệu lực: 22/09/2026', 'Effective Date: 22/09/2026')}</span>
          <div className="flex items-center gap-3">
            <span>🌐 <a href="https://emoria.vn" className="text-amber-300 hover:underline">emoria.vn</a></span>
            <span className="hidden sm:inline">✉️ <a href="mailto:emoria.jewelry@gmail.com" className="hover:underline">emoria.jewelry@gmail.com</a></span>
          </div>
        </div>

        {/* Scrollable Content Body - Guaranteed Scroll on Mobile and Desktop */}
        <div
          ref={scrollContainerRef}
          data-no-scroll-lock="true"
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-7 space-y-6 text-xs sm:text-sm leading-relaxed text-slate-300 pr-3 sm:pr-5 select-text touch-pan-y"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255, 255, 255, 0.25) transparent'
          }}
        >
          {/* Giới thiệu */}
          <p className="text-slate-200 font-light italic bg-amber-400/[0.03] p-3.5 rounded-2xl border border-amber-400/20">
            {t(
              'EMORIA cam kết tôn trọng và bảo vệ tuyệt đối quyền riêng tư của khách hàng. Chúng tôi hiểu rằng mỗi món trang sức công nghệ NFC không chỉ là tài sản vật chất mà còn là nơi lưu giữ những ký ức, cảm xúc và thông điệp thiêng liêng nhất của bạn.',
              'EMORIA is committed to respecting and safeguarding your privacy. We understand that each NFC smart jewelry piece is not merely a luxury accessory, but a sacred repository of your most cherished memories, emotions, and personal letters.'
            )}
          </p>

          {/* Mục 1 */}
          <section className="space-y-2.5">
            <h4 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="text-amber-300 font-mono text-xs px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">1</span>
              {t('MỤC ĐÍCH VÀ PHẠM VI THU THẬP THÔNG TIN', 'PURPOSE AND SCOPE OF DATA COLLECTION')}
            </h4>
            <p className="text-xs text-slate-400">
              {t('Chúng tôi chỉ thu thập các dữ liệu cần thiết nhằm phục vụ cho trải nghiệm mua sắm và vận hành sản phẩm công nghệ:', 'We only collect essential data necessary for boutique commerce and smart NFC product operations:')}
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs sm:text-sm text-slate-300">
              <li>
                <strong className="text-white">{t('Thông tin cá nhân & giao dịch:', 'Personal & Transaction Details:')}</strong> {t('Họ tên, số điện thoại, địa chỉ nhận hàng, địa chỉ email (phục vụ xử lý đơn hàng, bảo hành và gửi bản tin chăm sóc khách hàng).', 'Full name, phone number, shipping address, email address (for order fulfillment, warranty, and customer care updates).')}
              </li>
              <li>
                <strong className="text-white">{t('Dữ liệu Không gian ký ức (Memory Space):', 'Memory Space Sentimental Data:')}</strong> {t('Hình ảnh, video ngắn, bản ghi âm, ghi chú văn bản hoặc ngày kỷ niệm do chính người dùng chủ động tải lên liên kết với vi chip NFC trên sản phẩm.', 'Photos, videos, audio recordings, handwritten letter notes, and milestones voluntarily uploaded by the owner to their NFC memory space.')}
              </li>
              <li>
                <strong className="text-white">{t('Dữ liệu kỹ thuật:', 'Hardware & Technical Identifiers:')}</strong> {t('Mã định danh độc bản của chip NFC (UID) gán trên từng món trang sức nhằm mục đích kích hoạt và xác thực quyền truy cập.', 'Unique hardware chip identifier (UID) paired with each piece to verify ownership and unlock rights.')}
              </li>
            </ul>
          </section>

          {/* Mục 2 */}
          <section className="space-y-2.5">
            <h4 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="text-amber-300 font-mono text-xs px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">2</span>
              {t('PHẠM VI SỬ DỤNG THÔNG TIN', 'USE OF COLLECTED INFORMATION')}
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs sm:text-sm text-slate-300">
              <li>{t('Xử lý đơn đặt hàng, giao nhận sản phẩm và hỗ trợ kỹ thuật liên quan đến vi chip NFC.', 'Fulfilling orders, parcel deliveries, and technical assistance for the NFC smart chip.')}</li>
              <li>{t('Kích hoạt và duy trì hiển thị trang Memory Space cá nhân khi người dùng thực hiện thao tác chạm NFC bằng thiết bị di động.', 'Activating and displaying the dedicated Memory Space when tapped with any modern NFC-capable mobile device.')}</li>
              <li>{t('Gửi thông báo về tình trạng đơn hàng, hướng dẫn sử dụng, bảo quản trang sức Bạc S925 và các bộ sưu tập mới (khách hàng có thể hủy nhận bất kỳ lúc nào qua nút Huỷ đăng ký).', 'Sending order tracking notifications, jewelry care guides, and boutique releases (with 1-click unsubscribe option).')}</li>
              <li>{t('Nâng cấp chất lượng dịch vụ và bảo mật hệ thống.', 'Improving system security and personalized service quality.')}</li>
            </ul>
          </section>

          {/* Mục 3 - ĐẶC THÙ NFC */}
          <section className="space-y-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <h4 className="font-serif text-sm sm:text-base font-bold text-amber-300 flex items-center gap-2">
              <SmartphoneNfc className="w-4 h-4 text-amber-300 shrink-0" />
              <span>{t('3. CHÍNH SÁCH BẢO MẬT ĐẶC THÙ CHO TRANG SỨC CÔNG NGHỆ NFC', '3. SPECIALIZED SECURITY FOR SMART NFC JEWELRY')}</span>
            </h4>
            <p className="text-xs text-slate-300">
              {t('Vì sản phẩm của EMORIA lưu trữ những giá trị tinh thần và cảm xúc mang tính cá nhân cao, chúng tôi áp dụng cơ chế bảo mật nghiêm ngặt:', 'Because EMORIA jewelry safeguards deeply personal emotional memories, we enforce three layers of specialized protection:')}
            </p>
            <div className="grid sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                  <EyeOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{t('Không lưu trên chip', 'Zero Media on Chip')}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  {t('Chip NFC NTAG21 chỉ đóng vai trò là “chìa khóa vật lý” dẫn đến link bảo mật. Mất nhẫn không làm lộ ảnh/video.', 'The NFC chip acts solely as a physical cryptographic key. Losing the jewelry does not expose raw media files.')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{t('Mật mã PIN cá nhân', 'Private PIN Code')}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  {t('Người sở hữu có quyền đặt mã PIN. Khi chạm NFC, bắt buộc nhập đúng PIN mới xem được thư riêng.', 'Owners can set a custom PIN code. When tapped, viewers must enter the PIN to unlock sensitive handwritten letters.')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{t('Mã hóa SSL/TLS', 'SSL/TLS Encryption')}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  {t('Toàn bộ media tải lên đám mây đều được mã hóa đường truyền SSL/TLS và chứng thực máy chủ.', 'All media uploaded to cloud vaults is end-to-end transport encrypted via modern SSL/TLS.')}
                </p>
              </div>
            </div>
          </section>

          {/* Mục 4 */}
          <section className="space-y-2.5">
            <h4 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="text-amber-300 font-mono text-xs px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">4</span>
              {t('QUYỀN VÀ TRÁCH NHIỆM CỦA NGƯỜI DÙNG', 'USER RIGHTS AND CONTROLS')}
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs sm:text-sm text-slate-300">
              <li>
                <strong className="text-white">{t('Quyền xem và cập nhật:', 'Access & Edit Rights:')}</strong> {t('Bạn có quyền thay đổi thông tin liên hệ, chỉnh sửa hoặc xóa bỏ bất kỳ hình ảnh, nội dung nào trong Memory Space bất cứ khi nào.', 'You can view, edit, or delete any milestone, photo, or note in your Memory Space at any time.')}
              </li>
              <li>
                <strong className="text-white">{t('Quyền yêu cầu xóa vĩnh viễn:', 'Right to Erasure:')}</strong> {t('Bạn có thể yêu cầu xóa hoàn toàn tài khoản và toàn bộ ký ức đã lưu trên máy chủ của EMORIA bằng cách gửi email về bộ phận hỗ trợ.', 'You may request permanent deletion of your account and all associated cloud memory vaults by emailing our support desk.')}
              </li>
              <li>
                <strong className="text-white">{t('Quyền từ chối nhận email tiếp thị:', 'Marketing Opt-out:')}</strong> {t('Khách hàng có thể bấm vào liên kết Huỷ đăng ký (Unsubscribe) ở cuối mỗi email marketing.', 'You can opt out of promotional emails anytime with a single click.')}
              </li>
            </ul>
          </section>

          {/* Mục 5 */}
          <section className="space-y-2.5 p-3.5 rounded-2xl bg-rose-500/[0.04] border border-rose-500/20">
            <h4 className="font-serif text-sm sm:text-base font-bold text-rose-300 flex items-center gap-2">
              <span className="text-rose-300 font-mono text-xs px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">5</span>
              {t('CAM KẾT KHÔNG CHIA SẺ DỮ LIỆU', 'COMMITMENT AGAINST THIRD-PARTY DATA SALE')}
            </h4>
            <p className="text-xs sm:text-sm text-slate-300">
              {t(
                'EMORIA tuyệt đối không bán, cho thuê, trao đổi hoặc chia sẻ thông tin cá nhân cũng như dữ liệu ký ức của khách hàng cho bất kỳ bên thứ ba nào vì mục đích quảng cáo thương mại. Dữ liệu chỉ được cung cấp cho đơn vị bưu chính/vận chuyển đối tác nhằm mục đích giao kiện trang sức đến tận tay bạn.',
                'EMORIA strictly DOES NOT sell, rent, trade, or share your personal data or memory vault files with any commercial third parties. Delivery details are shared strictly with verified postal partners solely to fulfill shipment to your doorstep.'
              )}
            </p>
          </section>

          {/* Mục 6 */}
          <section className="space-y-2.5 pt-2">
            <h4 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="text-amber-300 font-mono text-xs px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">6</span>
              {t('ĐƠN VỊ THU THẬP VÀ QUẢN LÝ DỮ LIỆU', 'DATA CONTROLLER & SUPPORT CONTACT')}
            </h4>
            <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-300 pt-1">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">{t('Trụ sở', 'Headquarters')}</span>
                  <strong className="text-white">EMORIA Jewelry · TP. Hồ Chí Minh, Việt Nam</strong>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">{t('Hotline hỗ trợ', 'Customer Hotline')}</span>
                  <a href="tel:0948741431" className="text-emerald-300 font-bold hover:underline">094 874 14 31</a>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3 sm:col-span-2">
                <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">{t('Email an toàn thông tin & bảo mật', 'Data Protection & Security Email')}</span>
                  <a href="mailto:emoria.jewelry@gmail.com" className="text-amber-300 font-semibold hover:underline">emoria.jewelry@gmail.com</a>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Floating Scroll-to-Top Button */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              type="button"
              onClick={scrollToTop}
              title={t('Lên đầu trang', 'Scroll to top')}
              className="absolute bottom-16 right-4 sm:bottom-20 sm:right-7 z-30 p-2.5 rounded-full bg-dark-950/95 border border-amber-400/40 text-amber-300 shadow-[0_4px_20px_rgba(0,0,0,0.7)] hover:bg-amber-400/20 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs backdrop-blur-md"
            >
              <ArrowUp className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px] font-medium">{t('Đầu trang', 'Top')}</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-5 border-t border-white/10 flex flex-wrap items-center justify-between bg-dark-950/90 gap-3 shrink-0">
          <span className="text-[11px] sm:text-xs text-slate-400">
            {t('Bạn có thể lưu trữ hoặc mở lại chính sách này bất kỳ lúc nào.', 'You may revisit or save this policy at any time.')}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="store-button !px-6 !py-2.5 !text-xs font-semibold"
          >
            {t('Tôi Đã Hiểu', 'I Understand')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
