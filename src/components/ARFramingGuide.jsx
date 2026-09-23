import React from 'react';
import { Scan, Check, Sparkles, Lightbulb } from 'lucide-react';

/**
 * ARFramingGuide Component
 * Provides a calibrated luxury HUD reticle & body/hand silhouette to guarantee
 * instant AI tracking lock for necklaces, rings, and bracelets.
 * 
 * Sized to match real-world camera framing without shrinking or causing jewelry offset.
 */
export default function ARFramingGuide({
  type = 'necklace',
  status = 'searching',
  selectedFinger = 'ring',
  showGuide = true,
  onToggleGuide,
  t
}) {
  const isTracking = status === 'tracking';
  const isSearching = status === 'searching';
  const isLoading = status === 'starting' || status === 'loading-model';
  const isManual = status === 'manual' || status === 'manual-fallback';

  if (!showGuide) {
    return (
      <button
        type="button"
        onClick={onToggleGuide}
        className="absolute top-3 right-3 z-20 px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-amber-200 border border-amber-300/40 backdrop-blur-md shadow-md transition-all pointer-events-auto"
        title={t('Bật khung căn chỉnh AR', 'Show AR framing guide')}
      >
        <Scan size={14} className="text-amber-300" />
        <span>{t('Hiện khung ngắm', 'Show Guide')}</span>
      </button>
    );
  }

  // Dynamic finger coordinates for ring reticle (calibrated to full frame)
  const fingerCoords = {
    index: { x: 38, y: 38, label: t('Ngón trỏ', 'Index') },
    middle: { x: 50, y: 32, label: t('Ngón giữa', 'Middle') },
    ring: { x: 62, y: 38, label: t('Ngón áp út', 'Ring') }
  };
  const activeFinger = fingerCoords[selectedFinger] || fingerCoords.ring;

  const statusColor = isTracking
    ? 'text-emerald-400 border-emerald-400'
    : isManual
    ? 'text-sky-300 border-sky-300'
    : 'text-amber-300 border-amber-300';

  const badgeBg = isTracking
    ? 'bg-emerald-950/85 border-emerald-400/60 text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
    : isManual
    ? 'bg-sky-950/80 border-sky-400/40 text-sky-200'
    : 'bg-black/80 border-amber-300/50 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.25)] animate-pulse';

  const hintText = isTracking
    ? t('✦ Đã khóa vị trí hoàn hảo · AR đang hiển thị', '✦ Target locked · AR Active')
    : isManual
    ? t('Căn chỉnh thủ công theo ý thích', 'Manual placement mode')
    : isLoading
    ? t('Đang khởi động cảm biến AR...', 'Initializing AR tracking...')
    : type === 'ring'
    ? t('Giơ bàn tay xòe nhẹ vào giữa khung viền', 'Show open hand centered inside guide')
    : type === 'bracelet'
    ? t('Đưa cổ tay hướng thẳng vào khung viền', 'Place wrist facing directly into guide')
    : t('Căn chỉnh đầu & hai vai vào khung viền', 'Align face & shoulders inside guide');

  const subHint = isSearching && (
    type === 'ring'
      ? t('Khoảng cách: 25 - 40 cm · Xòe nhẹ các ngón tay', 'Distance: 25 - 40 cm · Spread fingers slightly')
      : type === 'bracelet'
      ? t('Khoảng cách: 30 - 50 cm · Đưa cổ tay hướng camera', 'Distance: 30 - 50 cm · Face wrist to camera')
      : t('Khoảng cách: 45 - 65 cm · Thấy rõ 2 vai & nhìn thẳng', 'Distance: 45 - 65 cm · Face forward with both shoulders')
  );

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-between p-2 sm:p-3 select-none">
      {/* Top Bar with Status Pill & Toggle Button */}
      <div className="w-full flex items-center justify-between pointer-events-auto">
        <div className="flex-1 flex justify-center">
          <div className={`px-3 py-1.5 rounded-full border backdrop-blur-md text-xs font-medium flex items-center gap-2 transition-all duration-300 ${badgeBg}`}>
            {isTracking ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : isSearching ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              </span>
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>{hintText}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleGuide}
          className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 bg-black/60 hover:bg-black/85 text-slate-300 hover:text-white border border-white/15 backdrop-blur-md shadow-md transition-all pointer-events-auto ml-2 shrink-0"
          title={t('Tắt khung căn chỉnh', 'Hide framing guide')}
        >
          <Scan size={13} className="text-amber-300" />
          <span>{t('Ẩn khung', 'Hide')}</span>
        </button>
      </div>

      {/* Center Reticle & Calibrated Silhouette */}
      <div className="relative w-full h-full flex items-center justify-center my-auto">
        {/* HUD 4-Corner Viewfinder Brackets */}
        <div className={`absolute top-1 left-1 w-6 h-6 border-t-2 border-l-2 rounded-tl-sm transition-colors duration-500 ${statusColor}`} />
        <div className={`absolute top-1 right-1 w-6 h-6 border-t-2 border-r-2 rounded-tr-sm transition-colors duration-500 ${statusColor}`} />
        <div className={`absolute bottom-1 left-1 w-6 h-6 border-b-2 border-l-2 rounded-bl-sm transition-colors duration-500 ${statusColor}`} />
        <div className={`absolute bottom-1 right-1 w-6 h-6 border-b-2 border-r-2 rounded-br-sm transition-colors duration-500 ${statusColor}`} />

        {/* Silhouette SVG calibrated 1:1 with camera aspect ratio */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={`w-full h-full transition-opacity duration-700 ${
            isTracking ? 'opacity-0' : 'opacity-85'
          } ${statusColor}`}
        >
          {/* NECKLACE SILHOUETTE - Generous, natural proportions matching real webcam framing */}
          {type === 'necklace' && (
            <g fill="none">
              {/* Natural Head / Face Oval (occupies upper 42% of view) */}
              <ellipse
                cx="50"
                cy="26"
                rx="16"
                ry="21"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="3 2"
              />
              {/* Face Center Mark */}
              <line x1="50" y1="23" x2="50" y2="29" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
              <line x1="47" y1="26" x2="53" y2="26" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />

              {/* Neck contour lines */}
              <path d="M 42 45 Q 41 52 38 56" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
              <path d="M 58 45 Q 59 52 62 56" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />

              {/* Broad, natural shoulder arches spanning 94% of frame width */}
              <path d="M 38 56 C 26 58, 12 66, 3 82" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
              <path d="M 62 56 C 74 58, 88 66, 97 82" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />

              {/* Left/Right shoulder anchor points (span ~ 64% of frame, MediaPipe optimal zone) */}
              <circle cx="18" cy="70" r="1.8" fill="currentColor" opacity="0.75" />
              <circle cx="82" cy="70" r="1.8" fill="currentColor" opacity="0.75" />

              {/* Subtle chain hanging curve */}
              <path d="M 42 53 Q 50 70 58 53" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />

              {/* Pendant Target Reticle (placed at y=70, matching exact pendantPose resting point) */}
              {!isTracking && (
                <g transform="translate(50, 70)">
                  <circle cx="0" cy="0" r="4.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5" className="animate-spin" />
                  <circle cx="0" cy="0" r="1.5" fill="currentColor" />
                  <path d="M -7 0 L -3.5 0 M 3.5 0 L 7 0 M 0 -7 L 0 -3.5 M 0 3.5 L 0 7" stroke="currentColor" strokeWidth="0.9" />
                  <text x="0" y="9.5" textAnchor="middle" fill="currentColor" fontSize="3.2" fontWeight="600">
                    ✦ {t('Vị trí mặt dây', 'Pendant target')}
                  </text>
                </g>
              )}
            </g>
          )}

          {/* RING SILHOUETTE - Full hand contour at natural distance */}
          {type === 'ring' && (
            <g fill="none">
              {/* Generous open hand contour */}
              <path
                d="M 40 90 C 38 78, 28 72, 20 60 C 18 54, 22 51, 26 53 C 31 56, 34 62, 38 64 L 38 30 C 38 24, 44 24, 44 30 L 44 52 L 47 22 C 47 16, 53 16, 53 22 L 53 52 L 56 26 C 56 20, 62 20, 62 26 L 62 53 L 65 36 C 65 30, 71 30, 71 36 L 71 63 C 71 76, 62 83, 60 90"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeDasharray="3 2"
              />

              {/* Target Ring Position Indicator on Selected Finger */}
              {!isTracking && (
                <g transform={`translate(${activeFinger.x}, ${activeFinger.y})`}>
                  <circle cx="0" cy="0" r="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5" className="animate-ping" />
                  <circle cx="0" cy="0" r="3.2" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="0" cy="0" r="1.2" fill="currentColor" />
                  <text x="0" y="-7" textAnchor="middle" fill="currentColor" fontSize="3.3" fontWeight="bold">
                    ✦ {activeFinger.label}
                  </text>
                </g>
              )}
            </g>
          )}

          {/* BRACELET SILHOUETTE */}
          {type === 'bracelet' && (
            <g fill="none">
              {/* Forearm & Wrist contour */}
              <path
                d="M 33 94 C 33 76, 38 56, 32 36 C 31 30, 39 26, 42 32 C 45 36, 46 42, 49 46"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeDasharray="3 2"
              />
              <path
                d="M 67 94 C 67 76, 62 56, 68 36 C 69 30, 61 26, 58 32 C 55 36, 54 42, 51 46"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeDasharray="3 2"
              />

              {/* Target Wristband Band Ellipse */}
              {!isTracking && (
                <g>
                  <ellipse
                    cx="50"
                    cy="68"
                    rx="19"
                    ry="6.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeDasharray="3 1.5"
                    className="animate-pulse"
                  />
                  <text x="50" y="80" textAnchor="middle" fill="currentColor" fontSize="3.4" fontWeight="bold">
                    ✦ {t('Vị trí đeo lắc tay', 'Wristband zone')}
                  </text>
                </g>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Sub-hint Guide (Lighting & Distance Tips) */}
      {subHint && (
        <div className="mb-7 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[11px] text-slate-300 flex items-center gap-1.5 shadow-md">
          <Lightbulb size={12} className="text-amber-300 shrink-0" />
          <span>{subHint}</span>
        </div>
      )}
    </div>
  );
}
