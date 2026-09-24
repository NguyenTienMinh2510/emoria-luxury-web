import React, { useState, useEffect } from 'react';
import { X, Ruler, Sparkles, Check, Info, Heart, ShieldCheck, ChevronRight, Sliders, CreditCard, RotateCcw } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider';

export default function JewelrySizeGuideModal({ isOpen, onClose, initialCategory = 'Nhẫn' }) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [activeTab, setActiveTab] = useState(() => {
    if (initialCategory === 'Vòng tay') return 'bracelet';
    if (initialCategory === 'Dây chuyền') return 'necklace';
    return 'ring';
  });

  // Interactive Ring Size Calculator
  const [userCircumference, setUserCircumference] = useState(53.4);

  // 1:1 Screen Caliper & Physical Ring Sizer (Standard ISO 7810 card = 85.60mm x 53.98mm)
  const [cardWidthPx, setCardWidthPx] = useState(324); // ~3.785 px/mm (Standard 96 DPI screen)
  const [calibratedDiameterMm, setCalibratedDiameterMm] = useState(17.0);
  const [caliperJawMm, setCaliperJawMm] = useState(12.0);
  const pxPerMm = cardWidthPx / 85.60;

  const getNiFromDiameter = (d) => {
    const num = Number(d);
    if (num < 15.3) return 'Ni 7-8';
    if (num < 15.8) return 'Ni 9';
    if (num < 16.3) return 'Ni 10';
    if (num < 16.8) return 'Ni 11-12';
    if (num < 17.3) return 'Ni 13 (Chuẩn nữ)';
    if (num < 17.8) return 'Ni 14-15';
    if (num < 18.3) return 'Ni 16 (Chuẩn nam)';
    if (num < 18.8) return 'Ni 17-18';
    if (num < 19.3) return 'Ni 19';
    return 'Ni 20+';
  };

  useEffect(() => {
    if (initialCategory === 'Vòng tay') setActiveTab('bracelet');
    else if (initialCategory === 'Dây chuyền') setActiveTab('necklace');
    else setActiveTab('ring');
  }, [initialCategory, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Ring size chart data
  const ringSizes = [
    { diameter: 16.0, circumference: 50.3, vnNi: 'Ni 10', usSize: '5.5', target: t('Ngón út nam / Ngón áp út nữ thon nhỏ', 'Pinky / Slim female ring finger') },
    { diameter: 16.5, circumference: 51.8, vnNi: 'Ni 11-12', usSize: '6.0', target: t('Ngón áp út nữ vừa vặn', 'Standard female ring finger') },
    { diameter: 17.0, circumference: 53.4, vnNi: 'Ni 13', usSize: '6.5', target: t('Chuẩn nữ Việt Nam phổ biến (Khuyên dùng)', 'Most popular female standard (Recommended)') },
    { diameter: 17.5, circumference: 55.0, vnNi: 'Ni 14-15', usSize: '7.0', target: t('Ngón trỏ nữ / Ngón áp út nam mảnh', 'Female index / Slim male ring finger') },
    { diameter: 18.0, circumference: 56.5, vnNi: 'Ni 16', usSize: '7.5 - 8.0', target: t('Chuẩn nam Việt Nam / Ngón trỏ & giữa', 'Standard male / Index & middle finger') },
    { diameter: 18.5, circumference: 58.1, vnNi: 'Ni 17-18', usSize: '8.5', target: t('Ngón giữa nam / Tay đầy đặn', 'Male middle finger / Full hands') },
    { diameter: 19.0, circumference: 59.7, vnNi: 'Ni 19', usSize: '9.0', target: t('Ngón cái nam / Bàn tay to khỏe', 'Male thumb / Large hands') },
  ];

  // Calculate closest ring size based on slider
  const closestRing = ringSizes.reduce((prev, curr) => 
    Math.abs(curr.circumference - userCircumference) < Math.abs(prev.circumference - userCircumference) ? curr : prev
  , ringSizes[0]);

  return (
    <div 
      className="fixed inset-0 z-[95] bg-dark-950/85 backdrop-blur-xl p-3 sm:p-6 flex items-center justify-center overflow-y-auto"
      onClick={onClose}
    >
      <section 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="size-guide-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[92dvh] overflow-y-auto rounded-3xl border border-white/20 bg-[#101216] p-5 sm:p-8 text-slate-100 shadow-2xl"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          aria-label={t('Đóng hướng dẫn chọn size', 'Close size guide')}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-300">
            <Ruler size={20} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-amber-200/70 font-semibold">
              EMORIA LUXURY · SIZING EXPERTISE
            </p>
            <h2 id="size-guide-title" className="font-serif text-2xl sm:text-3xl text-white font-bold">
              {t('Bảng Đo Số Đo & Hướng Dẫn Chọn Size Chuẩn', 'Jewelry Measurement & Size Guide')}
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-6 max-w-2xl">
          {t(
            'Mỗi tác phẩm trang sức Emoria được chế tác với tỷ lệ công thái học hoàn hảo. Tham khảo số đo chi tiết bên dưới để chọn đúng kích cỡ ưng ý nhất.',
            'Each Emoria jewelry piece is crafted with ergonomic precision. Check the dimensions below to find your perfect fit.'
          )}
        </p>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 pb-4 border-b border-white/10 mb-6">
          {[
            { id: 'ring', label: t('💍 Nhẫn (Ni & Chu vi)', '💍 Rings (Size & Ni)') },
            { id: 'necklace', label: t('✨ Dây Chuyền (Độ rủ & Chiều dài)', '✨ Necklaces (Length & Drop)') },
            { id: 'bracelet', label: t('💫 Vòng Tay (Cổ tay & Xích phụ)', '💫 Bracelets (Wrist & Extension)') },
            { id: 'gift', label: t('🎁 Bí Quyết Chọn Size Tặng Quà', '🎁 Gift Sizing Secrets') },
            { id: 'caliper', label: t('📐 Thước Đo Màn Hình 1:1 Chuẩn (Caliper)', '📐 1:1 Screen Caliper Tool') },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all min-h-[44px] ${
                activeTab === tab.id
                  ? 'bg-amber-100 text-dark-950 font-bold shadow-silver-glow'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: RINGS */}
        {activeTab === 'ring' && (
          <div className="space-y-6">
            {/* Interactive Calculator Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border border-amber-400/20">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-amber-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} /> {t('Tra cứu nhanh Ni nhẫn theo chu vi ngón', 'Interactive Finger Size Finder')}
                </span>
                <span className="text-sm font-serif font-bold text-white">
                  {t('Chu vi đã đo:', 'Measured:')} <span className="text-amber-300 text-lg">{userCircumference.toFixed(1)} mm</span>
                </span>
              </div>
              <input
                type="range"
                min="48"
                max="62"
                step="0.1"
                value={userCircumference}
                onChange={(e) => setUserCircumference(Number(e.target.value))}
                className="w-full h-2 rounded-lg bg-dark-950 accent-amber-300 cursor-pointer"
                aria-label="Finger circumference slider"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-2">
                <span>48 mm (Ni nhỏ)</span>
                <span>53.4 mm (Chuẩn nữ)</span>
                <span>56.5 mm (Chuẩn nam)</span>
                <span>62 mm (Ni lớn)</span>
              </div>

              {/* Result Callout */}
              <div className="mt-4 p-3.5 rounded-xl bg-dark-950/80 border border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-slate-400">{t('Size khuyên chọn:', 'Recommended Size:')}</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-serif font-bold text-amber-200">{closestRing.vnNi}</span>
                    <span className="text-xs text-slate-300">({t('Đường kính trong', 'Inner diameter')}: <strong>{closestRing.diameter} mm</strong> · Size {closestRing.usSize} US)</span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <span className="inline-block px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-200 border border-amber-400/20">
                    {closestRing.target}
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Steps Guide */}
            <div>
              <h3 className="font-serif text-lg text-white font-semibold mb-3">
                {t('3 Bước tự đo chu vi ngón tay tại nhà chuẩn xác', '3 Steps to measure finger size at home')}
              </h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-8 h-8 rounded-lg bg-white/10 text-amber-300 font-bold flex items-center justify-center mb-2 text-sm">
                    1
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">{t('Dùng dải giấy nhỏ', 'Use a paper strip')}</h4>
                  <p className="text-xs text-slate-400">
                    {t('Cắt một dải giấy rộng khoảng 5mm. Quấn quanh phần dày nhất của ngón tay (thường là khớp ngón tay).', 'Cut a 5mm paper strip. Wrap it around the widest part of your finger (usually the knuckle).')}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-8 h-8 rounded-lg bg-white/10 text-amber-300 font-bold flex items-center justify-center mb-2 text-sm">
                    2
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">{t('Đánh dấu điểm giao', 'Mark the overlap')}</h4>
                  <p className="text-xs text-slate-400">
                    {t('Siết vừa khít, không quá chặt cũng không lỏng. Dùng bút mảnh đánh dấu điểm hai đầu giấy giao nhau.', 'Fit snugly, not too tight. Use a fine pen to mark exactly where the paper overlaps.')}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-8 h-8 rounded-lg bg-white/10 text-amber-300 font-bold flex items-center justify-center mb-2 text-sm">
                    3
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">{t('Đo bằng thước kẻ', 'Measure with ruler')}</h4>
                  <p className="text-xs text-slate-400">
                    {t('Trải thẳng dải giấy lên thước phẳng và đọc chiều dài tính theo milimet (mm). Đối chiếu bảng bên dưới.', 'Lay the paper flat on a ruler and read the length in millimetres. Compare with the table below.')}
                  </p>
                </div>
              </div>
            </div>

            {/* Sizing Table */}
            <div>
              <h3 className="font-serif text-lg text-white font-semibold mb-3">
                {t('Bảng quy đổi Ni nhẫn tiêu chuẩn Emoria', 'Emoria Standard Ring Conversion Chart')}
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-dark-950/60">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-white/5 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10">
                    <tr>
                      <th className="p-3 font-semibold">{t('Size AR / ĐK trong', 'AR Size / Inner Ø')}</th>
                      <th className="p-3 font-semibold">{t('Chu vi ngón (mm)', 'Circumference')}</th>
                      <th className="p-3 font-semibold">{t('Ni Việt Nam', 'Vietnam Ni')}</th>
                      <th className="p-3 font-semibold">{t('Size US', 'US Size')}</th>
                      <th className="p-3 font-semibold">{t('Đối tượng khuyên dùng', 'Best For')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {ringSizes.map(r => (
                      <tr key={r.diameter} className={r.vnNi.includes('Ni 13') ? 'bg-amber-400/5 font-semibold text-amber-200' : 'hover:bg-white/5'}>
                        <td className="p-3 font-serif font-bold text-white">{r.diameter} mm</td>
                        <td className="p-3">{r.circumference} mm</td>
                        <td className="p-3 font-bold text-amber-300">{r.vnNi}</td>
                        <td className="p-3">{r.usSize}</td>
                        <td className="p-3 text-slate-400">{r.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 text-xs text-slate-400 bg-white/5 p-3.5 rounded-xl border border-white/10">
              <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>{t('Mẹo chuyên gia: Nếu khớp ngón tay của bạn to hơn phần gốc ngón, hãy lấy số đo trung bình giữa khớp và gốc để nhẫn đeo qua được khớp mà vẫn ôm vừa ngón.', 'Expert tip: If your knuckle is larger than the base of your finger, take the average of both measurements so the ring slides over smoothly and sits securely.')}</span>
            </div>
          </div>
        )}

        {/* TAB 2: NECKLACES */}
        {activeTab === 'necklace' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  length: '40 cm',
                  name: t('Dáng Sát Cổ (Choker)', 'Choker / Collarbone Fit'),
                  drop: t('Chạm nhẹ xương quai xanh', 'Resting on the collarbone'),
                  desc: t('Tôn nét cổ thanh mảnh và bờ vai thon. Rất hợp với áo cổ tim, áo cúp ngực hoặc sơ mi mở cúc trên.', 'Accentuates neck and shoulders. Perfect with V-necks, off-shoulder tops, or open collars.'),
                  arTip: t('Thích hợp khi muốn mặt charm NFC nằm cao, dễ chạm điện thoại nhanh.', 'Great for high placement and quick phone tap.')
                },
                {
                  length: '45 cm',
                  badge: t('Tiêu Chuẩn Emoria', 'Emoria Standard'),
                  name: t('Dáng Tiêu Chuẩn (Princess)', 'Princess / Standard Fit'),
                  drop: t('Rủ ngang hõm ngực trên (xương quai xanh +4cm)', 'Mid-chest drop (+4cm below collarbone)'),
                  desc: t('Chiều dài vàng tôn dáng cho mọi phụ nữ. Phù hợp 99% trang phục từ áo thun, váy dạ hội đến công sở.', 'The golden length for all women. Complements 99% of outfits from tees to evening gowns.'),
                  arTip: t('Chiều dài mặc định của sản phẩm Emoria Lumen, Faith, Sen.', 'Default length of Emoria Lumen, Faith, Sen.')
                },
                {
                  length: '50 cm',
                  name: t('Dáng Dài Thanh Thoát (Matinee)', 'Matinee / Long Drop'),
                  drop: t('Rủ sâu dưới xương quai xanh 6-8cm', 'Deep plunge (6-8cm below collarbone)'),
                  desc: t('Tạo cảm giác thon gọn kéo dài vóc dáng. Cực kỳ ấn tượng khi đeo ngoài áo cổ lọ hoặc layer nhiều lớp.', 'Elongates the silhouette. Stunning worn over turtlenecks or layered with shorter chains.'),
                  arTip: t('Có thể đạt được trực tiếp bằng xích nối dài 5cm tặng kèm.', 'Easily achieved with the included 5cm extension chain.')
                }
              ].map(item => (
                <div key={item.length} className={`p-5 rounded-2xl border flex flex-col justify-between ${item.badge ? 'bg-gradient-to-b from-amber-500/10 to-transparent border-amber-400/30 shadow-lg' : 'bg-white/5 border-white/10'}`}>
                  <div>
                    {item.badge && (
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-400 text-dark-950 font-bold text-[10px] uppercase tracking-wider mb-2">
                        {item.badge}
                      </span>
                    )}
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-serif text-2xl font-bold text-white">{item.length}</h4>
                      <span className="text-xs text-amber-200/80 font-medium">{item.drop}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-200 mt-1 mb-2">{item.name}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 text-[11px] text-amber-200/70 flex items-center gap-1.5">
                    <Sparkles size={12} /> {item.arTip}
                  </div>
                </div>
              ))}
            </div>

            {/* Exclusive Emoria Extension Feature */}
            <div className="p-5 rounded-2xl bg-dark-950/80 border border-white/15 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-400" size={18} />
                <h4 className="text-sm font-semibold text-white">
                  {t('Thiết Kế Độc Quyền: Tặng Kèm Đoạn Xích Tăng Đơ 5cm Bạc S925', 'Exclusive Feature: Free 5cm S925 Extension Chain')}
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t(
                  'Bạn không bao giờ phải lo lắng về việc dây chuyền quá ngắn hay quá dài: Mọi dây chuyền của Emoria đều được đúc sẵn đoạn xích chờ dài 5cm. Bạn có thể tự do cài khóa ở nấc 45cm (ôm vừa xinh) hoặc nới dài ra 47cm, 50cm tùy theo trang phục ngày hôm đó!',
                  'Never worry about chain length: All Emoria necklaces feature an integrated 5cm extension chain. Fasten at 45cm for a classic fit or extend to 50cm to match your neckline.'
                )}
              </p>
              <div className="grid sm:grid-cols-3 gap-2 pt-2 text-[11px] text-slate-400">
                <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                  <strong className="text-slate-200 block">{t('Độ dày dây', 'Chain Thickness')}</strong> 1.2 mm (Dây xích mắt dẹt S925 bền chắc)
                </div>
                <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                  <strong className="text-slate-200 block">{t('Mặt charm NFC', 'NFC Charm Dimensions')}</strong> Ø 12 mm x 3.5 mm (Trọng lượng ~4.8g)
                </div>
                <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                  <strong className="text-slate-200 block">{t('Khóa cài', 'Clasp Type')}</strong> Khóa càng cua (Lobster Clasp) tiêu chuẩn Thụy Sĩ
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BRACELETS */}
        {activeTab === 'bracelet' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-serif text-lg text-white font-semibold mb-2">
                {t('Cách đo chu vi cổ tay chuẩn xác (+1.5 cm cử động)', 'How to measure wrist circumference (+1.5 cm ease)')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                {t(
                  'Dùng thước dây quấn sát vòng cổ tay ngay dưới mắt cá xương tay. Nếu không có thước dây, bạn có thể dùng một sợi dây nhỏ rồi đo lại bằng thước kẻ. Lấy số đo đó cộng thêm 1.0 - 1.5 cm để có size vòng đeo thoải mái nhất.',
                  'Wrap a measuring tape snugly around your wrist just below the wrist bone. Add 1.0 - 1.5 cm to your wrist measurement for the ideal comfortable bracelet size.'
                )}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { size: '15 cm', wrist: '14.0 - 14.8 cm', name: t('Cổ tay mảnh khảnh', 'Petite Wrist'), desc: t('Dành cho bạn nữ cổ tay nhỏ nhắn, thích ôm vừa vặn.', 'For slim female wrists who prefer a neat fit.') },
                { size: '16 cm', wrist: '14.9 - 15.8 cm', name: t('Tiêu Chuẩn Nữ', 'Standard Female'), desc: t('Kích cỡ phổ biến nhất cho 80% phụ nữ Việt Nam.', 'The most popular size for 80% of Vietnamese women.') },
                { size: '17 cm', wrist: '15.9 - 16.8 cm', name: t('Cổ tay vừa / Đeo lỏng', 'Medium / Loose Fit'), desc: t('Cổ tay nữ đầy đặn hoặc bạn nam cổ tay thon gọn.', 'Fuller female wrists or lean male wrists.') },
                { size: '18 cm', wrist: '16.9 - 18.0 cm', name: t('Tiêu Chuẩn Nam', 'Standard Male'), desc: t('Dành cho nam giới hoặc người có khung xương to khỏe.', 'For men or larger bone structures.') }
              ].map(b => (
                <div key={b.size} className={`p-4 rounded-2xl border ${b.size === '16 cm' ? 'bg-amber-500/10 border-amber-400/30' : 'bg-white/5 border-white/10'}`}>
                  <span className="text-xl font-serif font-bold text-amber-200">{b.size}</span>
                  <div className="text-xs font-semibold text-white mt-1">{b.name}</div>
                  <div className="text-[11px] text-amber-300/80 mt-0.5">{t('Cổ tay:', 'Wrist:')} {b.wrist}</div>
                  <p className="text-xs text-slate-400 mt-2">{b.desc}</p>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <ShieldCheck className="text-emerald-400 w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-white">{t('Xích phụ tăng đơ 3cm tích hợp sẵn', 'Built-in 3cm Extension Chain')}</p>
                <p className="text-slate-400">
                  {t('Tất cả vòng tay Emoria Pulse và Horizon đều tích hợp sẵn 3 nấc xích phụ 3cm, cho phép bạn nới rộng hoặc thu gọn 1.5 - 3cm dễ dàng.', 'All Emoria Pulse and Horizon bracelets include 3cm extension links, allowing you to tighten or loosen by 1.5 - 3cm anytime.')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: GIFTS */}
        {activeTab === 'gift' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-pink-500/10 to-transparent border border-amber-400/30">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="text-rose-400 fill-rose-400" size={20} />
                <h3 className="font-serif text-xl font-bold text-white">
                  {t('Bí Quyết Chọn Size Kín Đáo Khi Tặng Quà Người Ấy', 'Secret Sizing Tips for Surprising Your Loved One')}
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t(
                  'Bạn muốn tặng một món quà bất ngờ nhưng không thể hỏi trực tiếp size? Dưới đây là các phương pháp bảo mật 100% từ chuyên gia Emoria:',
                  'Want to surprise your partner without giving away the secret? Follow these tried-and-tested methods from Emoria experts:'
                )}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <h4 className="text-sm font-semibold text-amber-200 flex items-center gap-1.5">
                  <Check size={16} /> {t('Mượn nhẫn cũ để đo đường kính lòng trong', 'Measure an existing ring')}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('Mượn chiếc nhẫn người ấy đang đeo vừa ở ngón định tặng, đặt lên một tờ giấy trắng, dùng bút chì vẽ theo đường tròn lòng trong rồi đo đường kính bằng thước kẻ (mm).', 'Take a ring they currently wear on the target finger, trace the inner circle onto paper, and measure the inner diameter in mm.')}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <h4 className="text-sm font-semibold text-amber-200 flex items-center gap-1.5">
                  <Check size={16} /> {t('Lựa chọn Dây Chuyền Emoria (An toàn tuyệt đối)', 'Choose Emoria Necklaces (Freesize & Safe)')}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('Dây chuyền Emoria Lumen hoặc Faith với chuẩn 45cm + 5cm xích chờ phù hợp với 100% dáng cổ phụ nữ mà không cần biết số đo trước.', 'Emoria Lumen or Faith with 45cm + 5cm extension fits 100% of women effortlessly without knowing their size in advance.')}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <h4 className="text-sm font-semibold text-amber-200 flex items-center gap-1.5">
                  <Check size={16} /> {t('Quy tắc size chuẩn phụ nữ Việt Nam', 'Vietnamese female standard baseline')}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('Nếu người ấy có vóc dáng trung bình (45kg - 55kg): Nhẫn chọn Ni 13 (17mm); Vòng tay chọn 16cm. Đây là thông số chuẩn xác cho 80% trường hợp.', 'For average builds (45kg - 55kg): Ring Ni 13 (17mm); Bracelet 16cm. This is accurate for over 80% of recipients.')}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <h4 className="text-sm font-semibold text-amber-200 flex items-center gap-1.5">
                  <Check size={16} /> {t('Chính sách đổi size miễn phí 7 ngày', 'Free 7-Day Size Exchange')}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('Emoria hỗ trợ đổi size miễn phí trong vòng 7 ngày nếu không vừa ngón hoặc cổ tay, giữ nguyên không gian kỷ niệm NFC đã thiết lập.', 'Emoria provides free size exchanges within 7 days while preserving your initialized NFC memory space.')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: 1:1 Screen Caliper & Physical Ring Sizer */}
        {activeTab === 'caliper' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Step 1: Calibration using ATM/CCCD card */}
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-amber-400/20 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-300 font-bold text-xs flex items-center justify-center border border-amber-400/30">1</span>
                    <h3 className="font-semibold text-lg text-white">
                      {t('Chuẩn Hóa Tỷ Lệ Màn Hình 1:1 Bằng Thẻ ATM / CCCD', 'Calibrate 1:1 Screen Scale with ATM / ID Card')}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    {t(
                      'Tất cả thẻ ATM ngân hàng và CCCD đều theo chuẩn quốc tế ISO/IEC 7810 ID-1 (chiều dài chính xác 85.60 mm). Đặt thẻ thật của bạn lên khung bên dưới và kéo thanh trượt để mép khung vừa khít thẻ thật.',
                      'All standard bank and ID cards follow ISO/IEC 7810 ID-1 (width exactly 85.60 mm). Place your physical card on the outline below and adjust the slider until it fits perfectly.'
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setCardWidthPx(324)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 hover:text-white transition-colors self-start sm:self-auto border border-white/10"
                >
                  <RotateCcw size={13} />
                  <span>{t('Đặt lại mặc định (96 DPI)', 'Reset (96 DPI)')}</span>
                </button>
              </div>

              {/* Slider for card width */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Sliders size={13} className="text-amber-300" />
                    {t('Kéo để căn chỉnh chiều rộng khung:', 'Drag to align frame width:')}
                  </span>
                  <span className="font-mono text-amber-300 font-bold">
                    {cardWidthPx} px · {(pxPerMm).toFixed(2)} px/mm
                  </span>
                </div>
                <input
                  type="range"
                  min="240"
                  max="440"
                  step="1"
                  value={cardWidthPx}
                  onChange={(e) => setCardWidthPx(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                  aria-label={t('Thanh trượt căn chỉnh kích thước thẻ', 'Card width calibration slider')}
                />
              </div>

              {/* Physical Card Silhouette */}
              <div className="flex flex-col items-center justify-center p-4 bg-dark-900/60 rounded-2xl border border-white/5 overflow-x-auto">
                <p className="text-[11px] text-amber-200/80 mb-3 text-center flex items-center gap-1.5 font-medium">
                  <CreditCard size={14} />
                  {t('Đặt thẻ ATM / CCCD vật lý của bạn đè lên khung viền vàng này:', 'Place your physical bank/ID card over this golden outline:')}
                </p>
                <div
                  style={{
                    width: `${cardWidthPx}px`,
                    height: `${(cardWidthPx * 53.98) / 85.60}px`,
                    maxWidth: '100%',
                  }}
                  className="relative rounded-[12px] border-2 border-dashed border-amber-400/80 bg-gradient-to-br from-amber-500/10 via-white/5 to-transparent flex flex-col items-center justify-center p-4 text-center select-none shadow-lg shadow-amber-500/5 transition-[width,height] duration-75"
                >
                  <div className="absolute top-3 left-4 w-8 h-6 rounded bg-amber-400/30 border border-amber-300/40" />
                  <span className="font-mono font-bold text-xs tracking-wider text-amber-200">
                    ISO/IEC 7810 (85.60 mm × 53.98 mm)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">
                    {t('Mép thẻ thật trùng khít 4 cạnh viền nét đứt này', 'Align real card edges with this dotted border')}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 2: Physical Ring Sizer On Screen */}
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 space-y-6">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-400/30">2</span>
                <h3 className="font-semibold text-lg text-white">
                  {t('Ướm Nhẫn Thật Lên Màn Hình (Thước Tròn 1:1)', 'Place Real Ring On Screen (1:1 Circle Sizer)')}
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                {t(
                  'Đặt chiếc nhẫn bạn hoặc người ấy đang đeo vừa ngón lên vòng tròn bên dưới. Tinh chỉnh đường kính sao cho vòng tròn màu bạc vừa khít LÒNG TRONG (đường kính trong) của nhẫn.',
                  'Place your existing ring onto the circle below. Adjust the slider until the silver circle fits exactly inside the inner rim of your ring.'
                )}
              </p>

              <div className="grid md:grid-cols-2 gap-6 items-center">
                {/* Visual Ring Circle */}
                <div className="flex flex-col items-center justify-center p-8 bg-dark-900/60 rounded-2xl border border-white/5 min-h-[220px]">
                  <div
                    style={{
                      width: `${calibratedDiameterMm * pxPerMm}px`,
                      height: `${calibratedDiameterMm * pxPerMm}px`,
                    }}
                    className="rounded-full border-2 border-white bg-radial from-amber-400/20 via-white/10 to-transparent shadow-silver-glow flex flex-col items-center justify-center transition-all duration-75 relative"
                  >
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-amber-400/40" />
                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-amber-400/40" />
                    <span className="font-mono text-xs font-bold text-white bg-dark-950/80 px-2 py-0.5 rounded-full z-10 border border-white/10 shadow">
                      Ø {calibratedDiameterMm.toFixed(1)} mm
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 text-center">
                    {t('Đặt lòng trong nhẫn thật trùng khít đường viền trắng', 'Match ring inner edge to the white rim')}
                  </p>
                </div>

                {/* Ring Controls & Readout */}
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{t('Đường kính lòng trong (Ø):', 'Inner Diameter (Ø):')}</span>
                      <span className="font-mono text-lg font-bold text-amber-300">
                        {calibratedDiameterMm.toFixed(1)} mm
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{t('Chu vi lòng trong (C = π × d):', 'Circumference (C = π × d):')}</span>
                      <span className="font-mono text-sm font-semibold text-slate-200">
                        {(calibratedDiameterMm * Math.PI).toFixed(1)} mm
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <span className="text-xs font-medium text-amber-200">{t('Size chuẩn Việt Nam:', 'Vietnam Ni Standard:')}</span>
                      <span className="font-bold text-base text-amber-300 bg-amber-400/10 px-3 py-1 rounded-lg border border-amber-400/30">
                        {getNiFromDiameter(calibratedDiameterMm)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{t('Tinh chỉnh đường kính (14.5 – 21.5 mm):', 'Fine-tune diameter (14.5 – 21.5 mm):')}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCalibratedDiameterMm((prev) => Math.max(14.5, +(prev - 0.1).toFixed(1)))}
                          className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                          title="-0.1 mm"
                        >
                          -
                        </button>
                        <button
                          onClick={() => setCalibratedDiameterMm((prev) => Math.min(21.5, +(prev + 0.1).toFixed(1)))}
                          className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                          title="+0.1 mm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="14.5"
                      max="21.5"
                      step="0.1"
                      value={calibratedDiameterMm}
                      onChange={(e) => setCalibratedDiameterMm(Number(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                      aria-label={t('Thanh trượt đường kính nhẫn', 'Ring diameter slider')}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Interactive Vernier Caliper Gauge for Emoria Specs */}
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 space-y-6">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-400/20 text-emerald-300 font-bold text-xs flex items-center justify-center border border-emerald-400/30">3</span>
                <h3 className="font-semibold text-lg text-white">
                  {t('Thước Kẹp Điện Tử 1:1 Kiểm Tra Độ Dày & Chi Tiết Kim Hoàn', 'Digital Vernier Caliper 1:1 for Jewelry Specifications')}
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                {t(
                  'Chọn nhanh một bộ phận bất kỳ của trang sức Emoria bên dưới để xem độ mở ngàm thước kẹp thực tế trên màn hình (tỷ lệ 1:1 chuẩn mm sau khi đã căn chỉnh thẻ ở Bước 1).',
                  'Select any Emoria component below to view its physical caliper opening at 1:1 scale on your screen.'
                )}
              </p>

              {/* Presets for Emoria jewelry components */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: t('Đai nhẫn dày 1.8mm (Comfort Fit)', 'Ring band 1.8mm thick'), mm: 1.8 },
                  { label: t('Bản đai nhẫn 3.8mm', 'Ring band width 3.8mm'), mm: 3.8 },
                  { label: t('Mắt dây chuyền 1.2mm', 'Chain link 1.2mm'), mm: 1.2 },
                  { label: t('Đường kính Charm NFC 12.0mm', 'NFC Charm 12.0mm Ø'), mm: 12.0 },
                  { label: t('Độ dày Charm 4 lớp 3.5mm', '4-Layer Charm 3.5mm thick'), mm: 3.5 },
                ].map((spec) => (
                  <button
                    key={spec.mm + spec.label}
                    onClick={() => setCaliperJawMm(spec.mm)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                      Math.abs(caliperJawMm - spec.mm) < 0.05
                        ? 'bg-amber-400/20 text-amber-200 border-amber-400/50 shadow'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {spec.label}
                  </button>
                ))}
              </div>

              {/* Digital Caliper Visual Gauge */}
              <div className="p-5 bg-dark-900/60 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t('Khoảng cách ngàm kẹp thực tế:', 'Physical Jaw Gap:')}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-3 py-0.5 rounded-lg shadow-inner">
                      {caliperJawMm.toFixed(1)} mm
                    </span>
                  </div>
                </div>

                {/* Visual Caliper Jaws */}
                <div className="relative h-20 bg-dark-950/90 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden px-4">
                  {/* Left Jaw */}
                  <div className="h-14 w-4 bg-gradient-to-r from-slate-400 to-slate-200 rounded-l flex items-center justify-end pr-0.5 shadow-md">
                    <div className="w-1 h-10 bg-slate-600 rounded-sm" />
                  </div>

                  {/* Measuring Gap (Exact 1:1 Scale in mm) */}
                  <div
                    style={{ width: `${Math.max(2, caliperJawMm * pxPerMm)}px` }}
                    className="h-10 bg-emerald-500/20 border-y border-emerald-400/50 flex items-center justify-center relative transition-all duration-75 min-w-[2px]"
                  >
                    <div className="absolute inset-x-0 h-[1px] bg-emerald-400/80" />
                    {caliperJawMm * pxPerMm > 35 && (
                      <span className="font-mono text-[10px] text-emerald-300 font-bold bg-dark-950/90 px-1 rounded z-10">
                        {caliperJawMm.toFixed(1)}mm
                      </span>
                    )}
                  </div>

                  {/* Right Jaw */}
                  <div className="h-14 w-4 bg-gradient-to-l from-slate-400 to-slate-200 rounded-r flex items-center justify-start pl-0.5 shadow-md">
                    <div className="w-1 h-10 bg-slate-600 rounded-sm" />
                  </div>
                </div>

                {/* Caliper Jaw Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{t('Kéo điều chỉnh ngàm thước tự do (0.5 – 30.0 mm):', 'Freely adjust caliper jaw (0.5 – 30.0 mm):')}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCaliperJawMm((prev) => Math.max(0.5, +(prev - 0.2).toFixed(1)))}
                        className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center text-xs"
                      >
                        -
                      </button>
                      <button
                        onClick={() => setCaliperJawMm((prev) => Math.min(30.0, +(prev + 0.2).toFixed(1)))}
                        className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="30.0"
                    step="0.1"
                    value={caliperJawMm}
                    onChange={(e) => setCaliperJawMm(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                    aria-label={t('Thanh trượt ngàm kẹp thước đo', 'Caliper jaw slider')}
                  />
                </div>
              </div>
            </div>

            {/* Step 4: Metallurgy & Ergonomics Technical Reference */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-white/[0.04] to-amber-500/[0.03] border border-amber-400/20 space-y-4">
              <h4 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                <ShieldCheck size={18} className="text-amber-300" />
                {t('Tiêu Chuẩn Cơ Khí & Vật Lý Kim Hoàn Tại Emoria', 'Emoria Metallurgy & Physics Engineering Standards')}
              </h4>
              <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
                <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                  <p className="font-semibold text-white">💎 {t('Chuẩn Đai Nhẫn Comfort Fit (1.8mm)', 'Comfort Fit Ring Band (1.8mm)')}</p>
                  <p className="text-slate-400 text-[11px]">
                    {t(
                      'Đai nhẫn được vát cong lòng trong (domed inner surface) 1.8mm giúp giảm ma sát khi đeo qua khớp ngón tay và hoàn toàn không gây cấn khi gập bàn tay làm việc.',
                      'A domed 1.8mm inner profile glides smoothly over knuckles with zero friction or finger pinching.'
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                  <p className="font-semibold text-white">📡 {t('Cấu Trúc Charm 4 Lớp Chống Nhiễu (3.5mm)', '4-Layer Shielded NFC Charm (3.5mm)')}</p>
                  <p className="text-slate-400 text-[11px]">
                    {t(
                      'Gồm đá CZ/Men bảo vệ (1.1mm) + Chip NTAG215 (0.4mm) + Tấm chắn từ Ferrite 0.3mm (chống nhiễu kim loại bạc) + Khung đế Bạc S925 đúc nguyên khối chống nước IP68 (1.2mm).',
                      'Enamel/CZ top (1.1mm) + NTAG215 (0.4mm) + Ferrite RF shield (0.3mm) + IP68 S925 silver base (1.2mm).'
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                  <p className="font-semibold text-white">✨ {t('Dây Chuyền 45cm + 5cm Chờ Tự Do', '45cm + 5cm Adaptable Chain')}</p>
                  <p className="text-slate-400 text-[11px]">
                    {t(
                      'Độ rủ tiêu chuẩn chạm xương quai xanh (clavicle). 5cm xích chờ cho phép bạn tùy chỉnh độ rủ xuống ngực trên tùy theo cổ áo sơ mi, váy hay áo len.',
                      'Hangs naturally at the clavicle. The 5cm extender allows tailoring the drop to any neckline style.'
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                  <p className="font-semibold text-white">💫 {t('Quy Tắc Độ Cử Động Vòng Tay (+1.2cm)', 'Bracelet Ease of Movement (+1.2cm)')}</p>
                  <p className="text-slate-400 text-[11px]">
                    {t(
                      'Chu vi cổ tay thực tế luôn cần cộng thêm +1.2cm đến +1.5cm để khi gập cổ tay hoặc di chuột máy tính hạt charm không tì cấn vào mạch máu.',
                      'Wrist circumference is intentionally sized with +1.2cm to +1.5cm ease to prevent any pressure when typing.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-amber-300" size={16} />
            <span>{t('Cam kết Bạc S925 chuẩn định lượng · Bảo hành đánh bóng trọn đời', 'Certified S925 Sterling Silver · Lifetime polish warranty')}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white text-dark-950 font-bold hover:bg-slate-200 transition-colors shadow-silver-glow"
          >
            {t('Đã hiểu · Trở lại mua hàng', 'Got it · Back to shopping')}
          </button>
        </div>
      </section>
    </div>
  );
}
