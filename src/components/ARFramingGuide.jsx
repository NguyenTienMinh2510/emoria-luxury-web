import React from 'react';
import { Scan, Check, Sparkles, Lightbulb } from 'lucide-react';

/**
 * ARFramingGuide Component
 * Provides a luxury interactive HUD reticle & body/hand silhouette to guarantee
 * instant AI tracking lock for necklaces, rings, and bracelets.
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
        className="absolute top-3 right-3 z-20 px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-amber-200 border border-amber-300/30 backdrop-blur-md shadow-md transition-all"
        title={t('Bật khung căn chỉnh AR', 'Show AR framing guide')}
      >
        <Scan size={14} className="text-amber-300" />
        <span>{t('Hiện khung ngắm', 'Show Guide')}</span>
      </button>
    );
  }

  // Dynamic finger coordinates for ring reticle
  const fingerCoords = {
    index: { x: 42, y: 39, label: t('Ngón trỏ', 'Index') },
    middle: { x: 50, y: 35, label: t('Ngón giữa', 'Middle') },
    ring: { x: 58, y: 39, label: t('Ngón áp út', 'Ring') }
  };
  const activeFinger = fingerCoords[selectedFinger] || fingerCoords.ring;

  const statusColor = isTracking
    ? 'text-emerald-400 border-emerald-400'
    : isManual
    ? 'text-sky-300 border-sky-300'
    : 'text-amber-300 border-amber-300';

  const badgeBg = isTracking
    ? 'bg-emerald-950/80 border-emerald-400/50 text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
    : isManual
    ? 'bg-sky-950/80 border-sky-400/40 text-sky-200'
    : 'bg-black/75 border-amber-300/40 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.2)] animate-pulse';

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
      ? t('Khoảng cách lý tưởng: 25 - 40 cm', 'Ideal distance: 25 - 40 cm')
      : type === 'bracelet'
      ? t('Khoảng cách lý tưởng: 30 - 50 cm', 'Ideal distance: 30 - 50 cm')
      : t('Khoảng cách lý tưởng: 40 - 65 cm · Nhìn thẳng camera', 'Ideal distance: 40 - 65 cm · Face forward')
  );

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-between p-3 select-none">
      {/* Top Bar with Floating Pill & Toggle Button */}
      <div className="w-full flex items-center justify-between pointer-events-auto">
        <div className="flex-1 flex justify-center">
          <div className={`px-3.5 py-1.5 rounded-full border backdrop-blur-md text-xs font-medium flex items-center gap-2 transition-all duration-300 ${badgeBg}`}>
            {isTracking ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
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
          className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 bg-black/60 hover:bg-black/85 text-slate-300 hover:text-white border border-white/15 backdrop-blur-md shadow-md transition-all pointer-events-auto"
          title={t('Tắt khung căn chỉnh', 'Hide framing guide')}
        >
          <Scan size={13} className="text-amber-300" />
          <span>{t('Ẩn khung', 'Hide')}</span>
        </button>
      </div>

      {/* Center Reticle & Body/Hand Silhouette */}
      <div className="relative w-full h-full max-w-md max-h-[70dvh] flex items-center justify-center my-auto">
        {/* HUD 4-Corner Viewfinder Brackets */}
        <div className={`absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 rounded-tl-sm transition-colors duration-500 ${statusColor}`} />
        <div className={`absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 rounded-tr-sm transition-colors duration-500 ${statusColor}`} />
        <div className={`absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 rounded-bl-sm transition-colors duration-500 ${statusColor}`} />
        <div className={`absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 rounded-br-sm transition-colors duration-500 ${statusColor}`} />

        {/* Silhouette SVG Overlay with Smooth Auto-Dimming on Lock */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className={`w-full h-full transition-opacity duration-700 ${
            isTracking ? 'opacity-20 hover:opacity-70' : 'opacity-85'
          } ${statusColor}`}
        >
          {/* NECKLACE SILHOUETTE */}
          {type === 'necklace' && (
            <g fill="none">
              {/* Head / Face Oval */}
              <ellipse
                cx="50"
                cy="28"
                rx="13.5"
                ry="17"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="3 2"
              />
              {/* Subtle Face Center Crosshair */}
              <line x1="50" y1="25" x2="50" y2="31" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
              <line x1="47" y1="28" x2="53" y2="28" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />

              {/* Neck contour lines */}
              <path d="M 43 43 Q 43 51 40 55" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
              <path d="M 57 43 Q 57 51 60 55" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />

              {/* Shoulder arches matching MediaPipe span */}
              <path d="M 40 55 Q 30 57 15 72" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
              <path d="M 60 55 Q 70 57 85 72" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />

              {/* Left/Right shoulder anchor points */}
              <circle cx="24" cy="66" r="1.8" fill="currentColor" opacity="0.75" />
              <circle cx="76" cy="66" r="1.8" fill="currentColor" opacity="0.75" />

              {/* Sternum / Pendant Target Reticle */}
              <g transform="translate(50, 63)">
                <circle cx="0" cy="0" r="5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" className={isSearching ? 'animate-spin' : ''} />
                <circle cx="0" cy="0" r="1.5" fill="currentColor" />
                <path d="M -7 0 L -3.5 0 M 3.5 0 L 7 0 M 0 -7 L 0 -3.5 M 0 3.5 L 0 7" stroke="currentColor" strokeWidth="0.9" />
              </g>
            </g>
          )}

          {/* RING SILHOUETTE */}
          {type === 'ring' && (
            <g fill="none">
              {/* Open hand contour with wrist & spread fingers */}
              <path
                d="M 42 88 C 40 76, 32 70, 26 58 C 24 53, 27 50, 30 52 C 34 55, 37 60, 40 62 L 40 32 C 40 26, 45 26, 45 32 L 45 53 L 48 24 C 48 18, 53 18, 53 24 L 53 53 L 56 28 C 56 22, 61 22, 61 28 L 61 54 L 64 38 C 64 32, 69 32, 69 38 L 69 64 C 69 76, 62 82, 58 88"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="3 2"
              />

              {/* Target Ring Position Indicator on Selected Finger */}
              <g transform={`translate(${activeFinger.x}, ${activeFinger.y})`}>
                <circle cx="0" cy="0" r="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5" className={isSearching ? 'animate-ping' : ''} />
                <circle cx="0" cy="0" r="3.2" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="0" cy="0" r="1.2" fill="currentColor" />
                <text x="0" y="-7" textAnchor="middle" fill="currentColor" fontSize="3" fontWeight="bold">
                  ✦ {activeFinger.label}
                </text>
              </g>
            </g>
          )}

          {/* BRACELET SILHOUETTE */}
          {type === 'bracelet' && (
            <g fill="none">
              {/* Forearm & Wrist contour */}
              <path
                d="M 37 92 C 37 76, 40 58, 35 38 C 34 32, 41 28, 44 34 C 46 38, 47 44, 49 48"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="3 2"
              />
              <path
                d="M 63 92 C 63 76, 60 58, 65 38 C 66 32, 59 28, 56 34 C 54 38, 53 44, 51 48"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="3 2"
              />

              {/* Target Wristband Band Ellipse */}
              <ellipse
                cx="50"
                cy="66"
                rx="16"
                ry="6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeDasharray="3 1.5"
                className={isSearching ? 'animate-pulse' : ''}
              />
              <text x="50" y="78" textAnchor="middle" fill="currentColor" fontSize="3.2" fontWeight="bold">
                ✦ {t('Vị trí đeo lắc tay', 'Wristband zone')}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Sub-hint Guide (Lighting & Distance Tips) */}
      {subHint && (
        <div className="mb-8 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] text-slate-300 flex items-center gap-1.5 shadow-md">
          <Lightbulb size={12} className="text-amber-300 shrink-0" />
          <span>{subHint}</span>
        </div>
      )}
    </div>
  );
}
