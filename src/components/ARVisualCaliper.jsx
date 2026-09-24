import React, { useState } from 'react';
import { Ruler, ChevronDown, ChevronUp, Maximize2, ShieldCheck, Sparkles, Sliders } from 'lucide-react';

/**
 * ARVisualCaliper Component
 * 
 * Interactive on-screen luxury digital caliper & metric ruler overlay for AR try-on.
 * Renders precision caliper jaws, millimeter tick marks, dimension arrows,
 * and live steppers directly over the AR viewport.
 */
export default function ARVisualCaliper({
  type = 'necklace',
  length = 45,
  setLength,
  trySize = 17,
  setTrySize,
  getNiLabel,
  showCaliper = true,
  onToggleCaliper,
  onOpenScreenCaliper,
  t,
  isLive = false
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeMode, setActiveMode] = useState('caliper'); // 'caliper' | 'ruler'

  if (!showCaliper) {
    return (
      <button
        type="button"
        onClick={onToggleCaliper}
        className="absolute top-3 left-3 z-30 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 bg-black/80 hover:bg-black text-amber-200 border border-amber-400/50 backdrop-blur-md shadow-xl transition-all pointer-events-auto group"
        title={t('Bật thước đo kỹ thuật số AR', 'Show AR digital caliper')}
      >
        <Ruler size={14} className="text-amber-300 group-hover:scale-110 transition-transform" />
        <span className="font-semibold">{t('📐 Hiện Thước Đo AR', '📐 Show AR Caliper')}</span>
      </button>
    );
  }

  // Ring calculations
  const ringDiameterMm = Number(trySize) || 17.0;
  const ringCircumferenceMm = (ringDiameterMm * Math.PI).toFixed(1);
  const ringBandThicknessMm = 1.8; // Comfort fit standard
  const ringBandWidthMm = 3.8;

  // Necklace calculations
  const necklaceLengthCm = Number(length) || 45;
  const necklaceDropLabel = necklaceLengthCm <= 40
    ? t('Sát cổ (Choker)', 'Collarbone (Choker)')
    : necklaceLengthCm <= 47
    ? t('Ngang ngực trên (Chuẩn)', 'Mid-chest (Standard)')
    : t('Dáng dài sâu (Matinee)', 'Plunge drop (Matinee)');

  // Bracelet calculations
  const wristCircumferenceCm = Number(trySize) || 16.0;
  const wristApproxDiameterMm = ((wristCircumferenceCm * 10) / Math.PI).toFixed(1);

  return (
    <div className="absolute top-2 left-2 right-2 sm:right-auto sm:max-w-md z-30 pointer-events-none select-none transition-all duration-300">
      <div className="rounded-2xl bg-dark-950/90 border border-amber-400/40 backdrop-blur-xl shadow-2xl p-3 text-slate-100 pointer-events-auto space-y-2.5">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Ruler size={13} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-200/80 font-bold">
                  {t('THƯỚC ĐO AR ĐIỆN TỬ', 'AR DIGITAL CALIPER')}
                </span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-xs font-bold text-white leading-none">
                {type === 'ring'
                  ? t('Đo Đai Nhẫn & Đường Kính Trong', 'Ring Inner Diameter & Band')
                  : type === 'necklace'
                  ? t('Đo Độ Rủ & Chiều Dài Dây', 'Necklace Drop & Chain Length')
                  : t('Đo Chu Vi Cổ Tay & Độ Cử Động', 'Wrist Sizing & Ease Gauge')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMinimized(prev => !prev)}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-colors text-xs"
              title={isMinimized ? t('Mở rộng thước đo', 'Expand caliper') : t('Thu gọn thước đo', 'Minimize caliper')}
            >
              {isMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            <button
              type="button"
              onClick={onToggleCaliper}
              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] text-slate-400 hover:text-white transition-colors"
              title={t('Tắt thước đo', 'Hide caliper')}
            >
              {t('Ẩn', 'Hide')}
            </button>
          </div>
        </div>

        {/* Primary Digital Readout & Quick Steppers */}
        <div className="flex items-center justify-between gap-3 bg-black/40 rounded-xl p-2.5 border border-white/5">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              {type === 'ring' ? t('Đường kính lòng trong (Ø)', 'Inner Diameter (Ø)') : type === 'necklace' ? t('Chiều dài dây chuyền', 'Chain Length') : t('Chu vi vòng đeo', 'Circumference')}
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-mono text-xl font-bold text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.3)]">
                {type === 'ring' ? `Ø ${ringDiameterMm.toFixed(1)} mm` : type === 'necklace' ? `${necklaceLengthCm} cm` : `${wristCircumferenceCm.toFixed(1)} cm`}
              </span>
              <span className="text-xs font-semibold text-amber-200/90 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30">
                {type === 'ring' ? (getNiLabel ? getNiLabel(ringDiameterMm) : `Ni ${ringDiameterMm}`) : type === 'necklace' ? '+5cm chờ' : '+3cm phụ'}
              </span>
            </div>
          </div>

          {/* Quick On-Screen Stepper Buttons */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => {
                if (type === 'ring' && setTrySize) setTrySize(s => Math.max(14.5, Number((s - 0.2).toFixed(1))));
                else if (type === 'necklace' && setLength) setLength(l => Math.max(36, l - 1));
                else if (type === 'bracelet' && setTrySize) setTrySize(s => Math.max(14.0, Number((s - 0.2).toFixed(1))));
              }}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-base flex items-center justify-center transition-all"
              title={type === 'necklace' ? t('Thu ngắn 1 cm', 'Shorten 1 cm') : t('Giảm kích thước', 'Decrease size')}
            >
              -
            </button>
            <button
              type="button"
              onClick={() => {
                if (type === 'ring' && setTrySize) setTrySize(s => Math.min(21.0, Number((s + 0.2).toFixed(1))));
                else if (type === 'necklace' && setLength) setLength(l => Math.min(54, l + 1));
                else if (type === 'bracelet' && setTrySize) setTrySize(s => Math.min(19.0, Number((s + 0.2).toFixed(1))));
              }}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-base flex items-center justify-center transition-all"
              title={type === 'necklace' ? t('Kéo dài 1 cm', 'Extend 1 cm') : t('Tăng kích thước', 'Increase size')}
            >
              +
            </button>
          </div>
        </div>

        {/* Expanded Graphical Caliper Elements (Only if not minimized) */}
        {!isMinimized && (
          <div className="space-y-2.5 pt-0.5">
            {/* Visual Caliper / Ruler Graphic */}
            {type === 'ring' && (
              <div className="p-3 bg-dark-900/80 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>{t('Chu vi ngón (C = π × d):', 'Circumference:')} <strong className="text-white font-mono">{ringCircumferenceMm} mm</strong></span>
                  <span>{t('Đai nhẫn:', 'Band:')} <strong className="text-amber-200 font-mono">3.8 × 1.8 mm</strong></span>
                </div>

                {/* Graphical Vernier Caliper Jaws for Ring Diameter */}
                <div className="relative h-12 bg-black/70 rounded-lg border border-white/15 flex items-center justify-center px-4 overflow-hidden">
                  {/* Caliper Left Jaw */}
                  <div className="h-9 w-2 bg-gradient-to-r from-slate-400 to-slate-200 rounded-l shadow" />
                  
                  {/* Metric Span with Dimension Arrow */}
                  <div className="flex-1 max-w-[180px] h-6 flex items-center justify-center relative mx-1">
                    <div className="absolute inset-x-0 h-[1.5px] bg-amber-400/80" />
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 border-y-4 border-y-transparent border-r-6 border-r-amber-400" />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 border-y-4 border-y-transparent border-l-6 border-l-amber-400" />
                    <span className="font-mono text-[10px] font-bold text-amber-300 bg-dark-950 px-1.5 py-0.2 rounded border border-amber-400/40 z-10 shadow">
                      Ø {ringDiameterMm.toFixed(1)} mm
                    </span>
                  </div>

                  {/* Caliper Right Jaw */}
                  <div className="h-9 w-2 bg-gradient-to-l from-slate-400 to-slate-200 rounded-r shadow" />
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>{t('Độ dày Comfort Fit: 1.8mm vòm tròn', 'Comfort Fit Thickness: 1.8mm domed')}</span>
                  <span className="text-emerald-400 font-medium">{t('Không cấn kẽ tay', 'Zero finger pinch')}</span>
                </div>
              </div>
            )}

            {type === 'necklace' && (
              <div className="p-3 bg-dark-900/80 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>{t('Vị trí độ rủ:', 'Hang drop:')} <strong className="text-amber-200">{necklaceDropLabel}</strong></span>
                  <span>{t('Charm NFC:', 'NFC Charm:')} <strong className="text-white font-mono">Ø 12 × 3.5 mm</strong></span>
                </div>

                {/* Graphical Hang Ruler Gauge */}
                <div className="relative h-10 bg-black/70 rounded-lg border border-white/15 px-3 flex items-center justify-between overflow-hidden">
                  {/* Milimeter Tick Marks Background */}
                  <div className="absolute inset-x-2 bottom-1 h-3 flex justify-between items-end opacity-40">
                    {Array.from({ length: 19 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-[1px] bg-slate-300 ${i % 5 === 0 ? 'h-3' : 'h-1.5'}`}
                      />
                    ))}
                  </div>

                  {/* Dynamic Drop Cursor */}
                  <div
                    style={{
                      left: `${((necklaceLengthCm - 36) / (54 - 36)) * 82 + 9}%`
                    }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center z-10 transition-all duration-150"
                  >
                    <div className="w-2.5 h-2.5 rotate-45 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] border border-white" />
                    <span className="font-mono text-[9px] font-bold text-amber-200 bg-black/90 px-1 rounded mt-0.5">
                      {necklaceLengthCm}cm
                    </span>
                  </div>

                  <span className="text-[9px] text-slate-400 z-10 font-mono">36cm</span>
                  <span className="text-[9px] text-amber-300/80 z-10 font-mono">45cm (Chuẩn)</span>
                  <span className="text-[9px] text-slate-400 z-10 font-mono">54cm</span>
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>{t('Neo cố định 2 đầu vai', 'Fixed to shoulder collar')}</span>
                  <span className="text-cyan-300 font-medium">{t('Độ rủ hạ dần theo chiều dài', 'Drop extends naturally')}</span>
                </div>
              </div>
            )}

            {type === 'bracelet' && (
              <div className="p-3 bg-dark-900/80 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>{t('Đường kính cổ tay:', 'Approx. diameter:')} <strong className="text-white font-mono">~{wristApproxDiameterMm} mm</strong></span>
                  <span>{t('Độ cử động:', 'Ease:')} <strong className="text-emerald-300">+1.2 cm</strong></span>
                </div>

                {/* Graphical Wrist Span Bar */}
                <div className="relative h-10 bg-black/70 rounded-lg border border-white/15 px-3 flex items-center justify-between overflow-hidden">
                  <div
                    style={{
                      left: `${((wristCircumferenceCm - 14.0) / (19.0 - 14.0)) * 82 + 9}%`
                    }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center z-10 transition-all duration-150"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] border border-white" />
                    <span className="font-mono text-[9px] font-bold text-amber-200 bg-black/90 px-1 rounded mt-0.5">
                      {wristCircumferenceCm.toFixed(1)}cm
                    </span>
                  </div>

                  <span className="text-[9px] text-slate-400 z-10 font-mono">14cm (Mảnh)</span>
                  <span className="text-[9px] text-amber-300/80 z-10 font-mono">16cm (Chuẩn)</span>
                  <span className="text-[9px] text-slate-400 z-10 font-mono">19cm</span>
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>{t('Tỉ lệ chuẩn 1:1 theo số đo', '1:1 scale by wrist specs')}</span>
                  <span className="text-emerald-400 font-medium">{t('Không tì cấn mạch máu', 'Zero blood vessel pinch')}</span>
                </div>
              </div>
            )}

            {/* Link to Full 1:1 Physical Screen Caliper Modal */}
            {onOpenScreenCaliper && (
              <button
                type="button"
                onClick={onOpenScreenCaliper}
                className="w-full py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-amber-200 hover:text-white border border-white/10 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Maximize2 size={12} className="text-amber-300" />
                <span>{t('Mở Thước Đo Màn Hình 1:1 Vật Lý (Căn Bằng Thẻ ATM)', 'Open 1:1 Physical Screen Caliper (ATM Calibrated)')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
