import React, { useState, useEffect } from 'react';
import { X, Ruler, Sparkles, Check, Info, Heart, ShieldCheck, ChevronRight } from 'lucide-react';
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
