import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider';

export default function ARPlacementGuideModal({
  isOpen,
  onClose,
  category = 'necklace',
  onOpenSizeGuide
}) {
  const { t } = useLanguage();
  const dialog = useRef();
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'sizing'

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const handleKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey, true);
      prev?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isNecklace = category === 'necklace' || category === 'Dây chuyền';
  const isRing = category === 'ring' || category === 'Nhẫn';
  const isBracelet = category === 'bracelet' || category === 'Vòng tay';

  return createPortal(
    <div
      className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-modal-title"
        className="relative w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-3xl bg-[#101216] border border-amber-400/30 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.8)] p-6 sm:p-8 outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono tracking-widest text-amber-200/80 uppercase font-semibold">
                EMORIA LUXURY · AR GUIDANCE
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <h2 id="guide-modal-title" className="font-serif text-2xl text-white">
              {t('Hướng Dẫn Trải Nghiệm AR & Đo Size Chuẩn', 'AR Experience & Size Guide')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Đóng hướng dẫn', 'Close guide')}
            className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 my-5 p-1 rounded-2xl bg-white/5 border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`flex-1 min-h-11 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'camera'
                ? 'bg-amber-100 text-dark-950 shadow-md font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            {t('Cách Đặt Camera Chuẩn Nhất', 'Best Camera Placement')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sizing')}
            className={`flex-1 min-h-11 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'sizing'
                ? 'bg-amber-100 text-dark-950 shadow-md font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            {t('3 Phương Pháp Đo Size Tốt Nhất', '3 Best Sizing Methods')}
          </button>
        </div>

        {/* Tab 1: Camera Placement Guide */}
        {activeTab === 'camera' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 4 Golden Rules */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="text-amber-300 font-semibold text-sm">
                  {t('1. Ánh sáng thuận chiều', '1. Natural Forward Light')}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t(
                    'Ngồi đối diện cửa sổ hoặc đèn sáng. Tránh ánh sáng chiếu từ sau lưng (ngược sáng làm camera bị tối mặt/tay).',
                    'Face your light source directly. Avoid backlighting from windows behind you.'
                  )}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="text-amber-300 font-semibold text-sm">
                  {t('2. Cố định thiết bị', '2. Keep Device Steady')}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t(
                    'Nên đặt điện thoại hoặc laptop tựa lên bàn/giá đỡ cố định. Thiết bị không rung lắc sẽ giúp AI nhận diện cực nhanh và mượt.',
                    'Rest your phone or laptop on a stable surface. A steady camera ensures instantaneous landmark locking.'
                  )}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="text-amber-300 font-semibold text-sm">
                  {t('3. Khoảng cách lý tưởng', '3. Optimal Distance')}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isNecklace && t('Cách camera 50 – 70 cm (thấy trọn khuôn mặt và cả hai bờ vai).', 'Keep 50 – 70 cm from camera (both shoulders in full view).')}
                  {isRing && t('Cách camera 25 – 40 cm (bàn tay nằm gọn trong khung hình).', 'Keep 25 – 40 cm from camera (hand centered comfortably).')}
                  {isBracelet && t('Cách camera 30 – 50 cm (cổ tay và bàn tay thấy rõ).', 'Keep 30 – 50 cm from camera (wrist and palm fully visible).')}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="text-amber-300 font-semibold text-sm">
                  {t('4. Tư thế thoải mái', '4. Natural Posture')}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isNecklace && t('Ngồi thẳng lưng, thả lỏng cổ và vai. Trang sức sẽ tự động bám theo xương quai xanh.', 'Sit upright, relax shoulders. Necklace naturally aligns with your collarbone.')}
                  {isRing && t('Giơ mu bàn tay hướng vào camera, xòe nhẹ các ngón tay tự nhiên.', 'Face the back of your hand to camera, fingers gently spread.')}
                  {isBracelet && t('Đưa cổ tay hướng thẳng camera, xoay nhẹ để ngắm các góc.', 'Hold wrist facing camera, turn slowly to view all angles.')}
                </p>
              </div>
            </div>

            {/* Master Jeweler's Tips */}
            <div className="p-4 rounded-2xl bg-amber-400/[0.06] border border-amber-400/25 space-y-2">
              <h4 className="text-sm font-semibold text-amber-200">
                {t('Lời Khuyên Từ Nghệ Nhân Kim Hoàn Emoria', 'Advice from Emoria Master Jeweler')}
              </h4>
              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                <li>
                  {t(
                    'Khi thử nhẫn: Hãy thử đổi các ngón tay (Trỏ, Giữa, Áp út) bằng thanh chọn bên cạnh để xem dáng nhẫn ở ngón nào tôn tay nhất.',
                    'Ring try-on: Switch fingers (Index, Middle, Ring) using the selector to find the most flattering style.'
                  )}
                </li>
                <li>
                  {t(
                    'Khi thử dây chuyền: Di chuyển nhẹ đầu sang hai bên hoặc xoay người 15° để chiêm ngưỡng ánh kim phản chiếu từ các góc cạnh 3D.',
                    'Necklace try-on: Gently turn your head or tilt 15° to appreciate the 3D luster and reflections.'
                  )}
                </li>
                <li>
                  {t(
                    'Đo độ vừa vặn: Bạn có thể dùng thước đo trực quan ngay trên màn hình AR để so khớp kích cỡ thật với nhẫn hoặc dây cũ.',
                    'Check your fit: You can use the on-screen visual ruler on the AR camera to match your real jewelry.'
                  )}
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 2: Best Sizing Methods */}
        {activeTab === 'sizing' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Method 1 */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-300">
                  {t('Phương Pháp 1: Ướm Thử AR Trực Quan Trên Màn Hình', 'Method 1: Live Interactive AR Fitting')}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/30">
                  {t('TIỆN LỢI NHẤT', 'MOST CONVENIENT')}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t(
                  'Bật camera AR và dùng thước đo trực quan ngay trên màn hình. Kéo chọn các kích cỡ xem thử (Ví dụ: 40cm, 45cm, 50cm cho dây chuyền hoặc 16mm, 17mm cho nhẫn) để thấy ngay tỷ lệ thực tế.',
                  'Start the AR camera and use the on-screen visual ruler to compare sizes (40cm, 45cm, 50cm for necklaces or 16mm, 17mm for rings) directly on your screen.'
                )}
              </p>
            </div>

            {/* Method 2 */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-300">
                  {t('Phương Pháp 2: Đo Đường Kính Nhẫn Cũ / Dây Cũ Bằng Thước Kẻ', 'Method 2: Measure Existing Ring/Chain with a Ruler')}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  {t('ĐỘ CHÍNH XÁC CAO', 'HIGH PRECISION')}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isRing &&
                  t(
                    'Lấy chiếc nhẫn bạn đang đeo vừa ngón muốn mua, đặt lên thước kẻ có vạch mm. Đo từ mép trong bên này sang mép trong bên kia (lòng trong, không tính kim loại). Nhập số mm đó vào cữ đo.',
                    'Take a ring that fits well and place it on a mm ruler. Measure the inside diameter from inner edge to inner edge (exclude metal band). Enter the mm value into the sizing box.'
                  )}
                {isNecklace &&
                  t(
                    'Dùng một sợi chỉ hoặc dây mềm quấn quanh cổ và điều chỉnh đến độ dài mong muốn. Đánh dấu và duỗi thẳng sợi dây áp lên thước kẻ để đo số centimet chính xác.',
                    'Use a soft cord around your neck to your desired drop. Mark it and measure the flat length on a ruler in cm.'
                  )}
                {isBracelet &&
                  t(
                    'Quấn một dải giấy hoặc thước dây quanh cổ tay sát da nhưng không siết. Đo chiều dài dải giấy rồi cộng thêm 1.5 – 2 cm để vòng có độ cử động thoải mái.',
                    'Wrap a strip of paper snugly around your wrist. Measure in cm and add 1.5 – 2 cm for comfortable wrist movement.'
                  )}
              </p>
              {onOpenSizeGuide && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSizeGuide();
                  }}
                  className="mt-2 text-xs text-amber-300 hover:text-amber-100 underline font-medium block"
                >
                  {t('Mở bảng tính size chi tiết →', 'Open detailed size calculator →')}
                </button>
              )}
            </div>

            {/* Method 3 */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-300">
                  {t('Phương Pháp 3: Chọn Size Chuẩn Phổ Biến & Bảo Lưu Đổi Size', 'Method 3: Popular Standard Sizes with Free Exchange')}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-400/20 text-sky-300 border border-sky-400/30">
                  {t('AN TÂM 100%', '100% PEACE OF MIND')}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t(
                  'Nếu mua tặng hoặc chưa có dụng cụ đo: Bạn có thể chọn size chuẩn phổ biến (Nữ: Ni 11–13 / Dây 45cm; Nam: Ni 16–18 / Dây 50cm). Emoria cam kết hỗ trợ đổi size miễn phí trong 7 ngày và bảo toàn 100% dữ liệu kỷ niệm trên chip NFC.',
                  'For gifts or when unsure: choose standard popular sizes (Women: Ni 11–13 / 45cm chain; Men: Ni 16–18 / 50cm chain). Emoria offers free size exchanges within 7 days, fully preserving your NFC memory vault.'
                )}
              </p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            {t('Hệ thống AR xử lý hình ảnh hoàn toàn trên thiết bị của bạn.', 'AR processes video strictly on your local device.')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-amber-100 text-dark-950 font-bold hover:brightness-105 active:scale-95 transition-all text-xs"
          >
            {t('Đã Hiểu · Tiếp Tục', 'Got It · Continue')}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
