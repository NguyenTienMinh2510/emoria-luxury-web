import React, { useState } from 'react';

/**
 * Helper: Converts ring inner diameter (mm) to Vietnamese standard Ni size.
 */
function mmToNi(mm) {
  if (!mm) return 13;
  const table = [
    { mm: 14.8, ni: 7 }, { mm: 15.1, ni: 8 }, { mm: 15.3, ni: 9 }, { mm: 15.6, ni: 10 },
    { mm: 16.0, ni: 11 }, { mm: 16.2, ni: 12 }, { mm: 16.5, ni: 13 }, { mm: 16.8, ni: 14 },
    { mm: 17.2, ni: 15 }, { mm: 17.5, ni: 16 }, { mm: 17.8, ni: 17 }, { mm: 18.2, ni: 18 },
    { mm: 18.5, ni: 19 }, { mm: 18.8, ni: 20 }, { mm: 19.2, ni: 21 }, { mm: 19.5, ni: 22 }
  ];
  const closest = table.reduce((prev, curr) =>
    Math.abs(curr.mm - mm) < Math.abs(prev.mm - mm) ? curr : prev
  );
  return closest.ni;
}

/**
 * ARFramingGuide Component
 * Fully visual on-screen AR guide:
 * - HUD camera placement metrics (distance & angle)
 * - Visual sweet-spot distance meter
 * - Concrete calibrated silhouette matching camera stream
 * - Direct on-screen visual measurement tools (caliper gauge for rings, drop scale for necklaces)
 * - Zero decorative icons or emojis, clean luxury typography
 */
export default function ARFramingGuide({
  type = 'necklace',
  status = 'searching',
  distanceMetrics = { status: 'searching', score: 50, ratio: 0, label: '' },
  selectedFinger = 'ring',
  showGuide = true,
  onToggleGuide,
  trySize = 17,
  onSelectSize,
  availableSizes,
  pendantScale = 1,
  onSelectPendantScale,
  t
}) {
  const [showRuler, setShowRuler] = useState(true);

  const isTracking = status === 'tracking';
  const isSearching = status === 'searching';
  const isLoading = status === 'starting' || status === 'loading-model';
  const isManual = status === 'manual' || status === 'manual-fallback';

  // Distance & angle specs
  const placementSpec = {
    ring: {
      distance: '25 – 40 cm',
      angle: 'Chếch 45°',
      lighting: 'Thuận chiều'
    },
    necklace: {
      distance: '50 – 70 cm',
      angle: 'Ngang tầm mắt',
      lighting: 'Đối diện phía trước'
    },
    bracelet: {
      distance: '30 – 50 cm',
      angle: 'Chếch 45°',
      lighting: 'Thuận chiều'
    }
  }[type] || { distance: '40 – 60 cm', angle: 'Trực diện', lighting: 'Thuận chiều' };

  // Status colors based on true quantitative distance
  const statusColor = distanceMetrics.status === 'optimal'
    ? 'text-emerald-400 border-emerald-400'
    : distanceMetrics.status === 'too-close'
    ? 'text-rose-400 border-rose-400'
    : distanceMetrics.status === 'too-far'
    ? 'text-amber-300 border-amber-300'
    : isTracking
    ? 'text-emerald-400 border-emerald-400'
    : isManual
    ? 'text-sky-300 border-sky-300'
    : 'text-amber-300 border-amber-300';

  const badgeBg = distanceMetrics.status === 'optimal'
    ? 'bg-emerald-950/90 border-emerald-400/60 text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
    : distanceMetrics.status === 'too-close'
    ? 'bg-rose-950/90 border-rose-400/60 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
    : distanceMetrics.status === 'too-far'
    ? 'bg-amber-950/90 border-amber-300/60 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.35)]'
    : isManual
    ? 'bg-sky-950/85 border-sky-400/40 text-sky-200'
    : 'bg-black/85 border-amber-300/50 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.25)]';

  const statusText = distanceMetrics.status === 'optimal'
    ? t('CỰ LY ĐẠT CHUẨN · BÁM TỌA ĐỘ', 'OPTIMAL DISTANCE · TARGET LOCKED')
    : distanceMetrics.status === 'too-close'
    ? t('QUÁ GẦN · LÙI RA XA CAMERA', 'TOO CLOSE · MOVE BACK')
    : distanceMetrics.status === 'too-far'
    ? t('QUÁ XA · TIẾN LẠI GẦN HƠN', 'TOO FAR · MOVE CLOSER')
    : isTracking
    ? t('ĐÃ BÁM TỌA ĐỘ · ĐẠT CHUẨN', 'LOCKED ON TARGET · TRACKING ACTIVE')
    : isManual
    ? t('CĂN CHỈNH THỦ CÔNG · MẪU TẠI TRUNG TÂM', 'MANUAL FIT · CENTERED')
    : isLoading
    ? t('ĐANG KHỞI TẠO CẢM BIẾN...', 'INITIALIZING SENSOR...')
    : type === 'ring'
    ? t('ĐƯA BÀN TAY VÀO KHUNG ĐO · GÓC 45°', 'ALIGN HAND TO FRAME · 45° ANGLE')
    : type === 'bracelet'
    ? t('ĐƯA CỔ TAY VÀO KHUNG ĐO', 'ALIGN WRIST TO FRAME')
    : t('CĂN CHỈNH ĐẦU & HAI VAI VÀO KHUNG', 'ALIGN HEAD & SHOULDERS TO FRAME');

  // Ring finger target coordinates
  const fingerCoords = {
    index: { x: 38, y: 38, label: t('Ngón trỏ', 'Index') },
    middle: { x: 50, y: 32, label: t('Ngón giữa', 'Middle') },
    ring: { x: 62, y: 38, label: t('Ngón áp út', 'Ring') }
  };
  const activeFinger = fingerCoords[selectedFinger] || fingerCoords.ring;

  // Necklace milestone drop lines
  const necklaceMilestones = [
    { length: 40, label: t('40 cm (Choker · Sát quai xanh)', '40 cm (Choker · Collarbone)'), y: 53 },
    { length: 45, label: t('45 cm (Chuẩn Emoria Classic)', '45 cm (Emoria Classic)'), y: 64 },
    { length: 50, label: t('50 cm (Ngực trên · Thanh lịch)', '50 cm (Upper bust · Elegant)'), y: 76 },
    { length: 60, label: t('60 cm (Dáng dài · Quý phái)', '60 cm (Long drop · Statement)'), y: 88 }
  ];

  // Quick ring sizing presets
  const ringPresets = availableSizes && availableSizes.length > 0
    ? availableSizes
    : [15, 16, 16.5, 17, 17.5, 18, 19];

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-2 sm:p-3 select-none">
      {/* ========================================================
          TOP HUD BAR: STATUS, PLACEMENT METRICS & CONTROLS
          ======================================================== */}
      <div className="w-full flex flex-col gap-1.5 pointer-events-auto">
        <div className="w-full flex items-center justify-between gap-2">
          {/* Status Indicator */}
          <div className={`px-3 py-1 rounded-full border backdrop-blur-md text-[11px] font-mono tracking-wider font-semibold flex items-center gap-2 transition-all ${badgeBg}`}>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                distanceMetrics.status === 'optimal'
                  ? 'bg-emerald-400'
                  : distanceMetrics.status === 'too-close'
                  ? 'bg-rose-400 animate-ping'
                  : distanceMetrics.status === 'too-far'
                  ? 'bg-amber-400 animate-ping'
                  : isTracking
                  ? 'bg-emerald-400'
                  : 'bg-amber-400 animate-ping'
              }`}
            />
            <span>{statusText}</span>
          </div>

          {/* Direct Controls (No icons, clean buttons) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowRuler(prev => !prev)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase border backdrop-blur-md transition-all ${
                showRuler
                  ? 'bg-amber-400/20 text-amber-200 border-amber-400/50'
                  : 'bg-black/60 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              {showRuler ? t('Tắt thước đo', 'Hide ruler') : t('Thước đo trực quan', 'Visual ruler')}
            </button>

            <button
              type="button"
              onClick={onToggleGuide}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase border backdrop-blur-md transition-all ${
                showGuide
                  ? 'bg-white/15 text-white border-white/30'
                  : 'bg-black/60 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              {showGuide ? t('Ẩn khung ngắm', 'Hide guide') : t('Hiện khung ngắm', 'Show guide')}
            </button>
          </div>
        </div>

        {/* Visual Placement & Quantitative Distance HUD */}
        {showGuide && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/85 border border-white/10 backdrop-blur-md text-[10px] font-mono text-slate-300">
            <div className="flex items-center gap-3">
              <span>
                <strong className="text-amber-300 uppercase">{t('Cự ly:', 'Dist:')}</strong> {placementSpec.distance}
              </span>
              <span className="hidden sm:inline text-white/30">|</span>
              <span className="hidden sm:inline">
                <strong className="text-amber-300 uppercase">{t('Góc:', 'Angle:')}</strong> {placementSpec.angle}
              </span>
            </div>

            {/* Real Quantitative Dynamic Sweet-Spot Meter */}
            <div className="flex flex-col gap-1 w-full sm:w-72 bg-black/60 rounded-lg p-1.5 border border-white/10">
              <div className="flex items-center justify-between text-[8px] uppercase tracking-wider font-mono">
                <span className={distanceMetrics.status === 'too-close' ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                  {t('Quá Gần', 'Too Close')}
                </span>
                <span className={distanceMetrics.status === 'optimal' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {t('Đạt Chuẩn', 'Optimal')} ({placementSpec.distance})
                </span>
                <span className={distanceMetrics.status === 'too-far' ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                  {t('Quá Xa', 'Too Far')}
                </span>
              </div>

              {/* Slider Track with target sweet spot zone in center (35% to 65%) */}
              <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden flex items-center">
                {/* Visual Sweet Spot Target Band */}
                <div className="absolute left-[35%] right-[35%] top-0 bottom-0 bg-emerald-500/25 border-x border-emerald-400/50" />

                {/* Quantitative Real-time Pin/Dot */}
                <div
                  className={`absolute w-3.5 h-3.5 rounded-full -ml-[7px] transition-all duration-300 shadow-md ${
                    distanceMetrics.status === 'optimal'
                      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] scale-110'
                      : distanceMetrics.status === 'too-close'
                      ? 'bg-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.9)] scale-105'
                      : distanceMetrics.status === 'too-far'
                      ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)] scale-105'
                      : 'bg-slate-500 opacity-40'
                  }`}
                  style={{
                    left: `${Math.max(5, Math.min(95, distanceMetrics.score || 50))}%`
                  }}
                />
              </div>

              {/* Quantitative Feedback Text */}
              <div className="flex items-center justify-between text-[9px] font-mono">
                <span className="text-slate-400">
                  {t('TỶ LỆ:', 'SCALE:')} <strong className="text-white">{distanceMetrics.ratio ? (distanceMetrics.ratio * 100).toFixed(0) + '%' : '--'}</strong>
                </span>
                <span
                  className={`font-bold uppercase tracking-wider ${
                    distanceMetrics.status === 'optimal'
                      ? 'text-emerald-300'
                      : distanceMetrics.status === 'too-close'
                      ? 'text-rose-300 animate-pulse'
                      : distanceMetrics.status === 'too-far'
                      ? 'text-amber-300 animate-pulse'
                      : 'text-slate-400'
                  }`}
                >
                  {distanceMetrics.label || (isTracking ? t('ĐẠT CHUẨN', 'OPTIMAL') : t('ĐANG ĐỊNH VỊ...', 'POSITIONING...'))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          CENTER VIEWPORT: CALIBRATED SILHOUETTE & TARGETS
          ======================================================== */}
      <div className="relative w-full h-full flex items-center justify-center my-auto">
        {/* 4-Corner Viewfinder Brackets */}
        {showGuide && (
          <>
            <div className={`absolute top-1 left-1 w-5 h-5 border-t-2 border-l-2 rounded-tl-sm transition-colors duration-500 ${statusColor}`} />
            <div className={`absolute top-1 right-1 w-5 h-5 border-t-2 border-r-2 rounded-tr-sm transition-colors duration-500 ${statusColor}`} />
            <div className={`absolute bottom-1 left-1 w-5 h-5 border-b-2 border-l-2 rounded-bl-sm transition-colors duration-500 ${statusColor}`} />
            <div className={`absolute bottom-1 right-1 w-5 h-5 border-b-2 border-r-2 rounded-br-sm transition-colors duration-500 ${statusColor}`} />
          </>
        )}

        {/* Silhouette SVG calibrated to camera stream */}
        {showGuide && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className={`w-full h-full transition-opacity duration-700 ${
              isTracking ? 'opacity-0' : 'opacity-85'
            } ${statusColor}`}
          >
            {/* NECKLACE SILHOUETTE */}
            {type === 'necklace' && (
              <g fill="none">
                {/* Face & Head Oval */}
                <ellipse cx="50" cy="26" rx="16" ry="21" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
                <line x1="50" y1="22" x2="50" y2="30" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
                <line x1="46" y1="26" x2="54" y2="26" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />

                {/* Neck Lines */}
                <path d="M 42 45 Q 41 52 38 56" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
                <path d="M 58 45 Q 59 52 62 56" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />

                {/* Shoulders */}
                <path d="M 38 56 C 26 58, 12 66, 3 82" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
                <path d="M 62 56 C 74 58, 88 66, 97 82" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />

                {/* Shoulder Anchor Points */}
                <circle cx="18" cy="70" r="1.8" fill="currentColor" opacity="0.75" />
                <circle cx="82" cy="70" r="1.8" fill="currentColor" opacity="0.75" />

                {/* Collarbone / Pendant Center Mark */}
                <g transform="translate(50, 64)">
                  <circle cx="0" cy="0" r="4.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5" />
                  <circle cx="0" cy="0" r="1.5" fill="currentColor" />
                  <path d="M -6 0 L -3 0 M 3 0 L 6 0 M 0 -6 L 0 -3 M 0 3 L 0 6" stroke="currentColor" strokeWidth="0.8" />
                  <text x="0" y="8.5" textAnchor="middle" fill="currentColor" fontSize="3" fontWeight="bold">
                    VỊ TRÍ MẶT DÂY
                  </text>
                </g>
              </g>
            )}

            {/* RING SILHOUETTE */}
            {type === 'ring' && (
              <g fill="none">
                <path
                  d="M 40 90 C 38 78, 28 72, 20 60 C 18 54, 22 51, 26 53 C 31 56, 34 62, 38 64 L 38 30 C 38 24, 44 24, 44 30 L 44 52 L 47 22 C 47 16, 53 16, 53 22 L 53 52 L 56 26 C 56 20, 62 20, 62 26 L 62 53 L 65 36 C 65 30, 71 30, 71 36 L 71 63 C 71 76, 62 83, 60 90"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeDasharray="3 2"
                />

                {/* Target Finger Indicator */}
                <g transform={`translate(${activeFinger.x}, ${activeFinger.y})`}>
                  <circle cx="0" cy="0" r="4.8" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5" />
                  <circle cx="0" cy="0" r="1.5" fill="currentColor" />
                  <text x="0" y="-7" textAnchor="middle" fill="currentColor" fontSize="3.2" fontWeight="bold">
                    {activeFinger.label.toUpperCase()} · Ni {mmToNi(trySize)}
                  </text>
                </g>
              </g>
            )}

            {/* BRACELET SILHOUETTE */}
            {type === 'bracelet' && (
              <g fill="none">
                <path d="M 33 94 C 33 76, 38 56, 32 36 C 31 30, 39 26, 42 32 C 45 36, 46 42, 49 46" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 2" />
                <path d="M 67 94 C 67 76, 62 56, 68 36 C 69 30, 61 26, 58 32 C 55 36, 54 42, 51 46" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 2" />
                <ellipse cx="50" cy="68" rx="19" ry="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 1.5" />
                <text x="50" y="80" textAnchor="middle" fill="currentColor" fontSize="3.4" fontWeight="bold">
                  VỊ TRÍ ĐEO VÒNG
                </text>
              </g>
            )}
          </svg>
        )}

        {/* ========================================================
            ON-SCREEN VISUAL MEASUREMENT OVERLAYS (RULER / CALIPER)
            ======================================================== */}
        {showRuler && (
          <div className="absolute inset-0 pointer-events-auto">
            {/* NECKLACE: DIRECT ON-SCREEN DROP SCALE */}
            {type === 'necklace' && (
              <div className="absolute inset-0 flex flex-col justify-between py-6 px-4">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                  {necklaceMilestones.map(m => {
                    const isSelected = Number(trySize) === m.length;
                    return (
                      <g
                        key={m.length}
                        onClick={() => onSelectSize && onSelectSize(m.length)}
                        className="cursor-pointer group"
                      >
                        {/* Horizontal milestone drop line */}
                        <line
                          x1="12"
                          y1={m.y}
                          x2="88"
                          y2={m.y}
                          stroke={isSelected ? '#FCD34D' : '#FFFFFF'}
                          strokeWidth={isSelected ? '0.9' : '0.4'}
                          strokeDasharray={isSelected ? 'none' : '2 2'}
                          opacity={isSelected ? 1 : 0.45}
                        />
                        {/* Milestone Tick & Label */}
                        <circle
                          cx="12"
                          cy={m.y}
                          r={isSelected ? 1.6 : 1}
                          fill={isSelected ? '#FCD34D' : '#FFFFFF'}
                        />
                        <rect
                          x="15"
                          y={m.y - 2.8}
                          width="70"
                          height="5.6"
                          fill={isSelected ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.4)'}
                          rx="1"
                        />
                        <text
                          x="17"
                          y={m.y + 1.2}
                          fill={isSelected ? '#FCD34D' : '#94A3B8'}
                          fontSize={isSelected ? '3.2' : '2.7'}
                          fontWeight={isSelected ? 'bold' : 'normal'}
                          fontFamily="monospace"
                        >
                          {isSelected ? '● ' : '○ '}{m.label} {isSelected ? ' [ĐANG CHỌN]' : ''}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            {/* RING: DIRECT ON-SCREEN 1:1 CIRCULAR CALIPER */}
            {type === 'ring' && (
              <div className="absolute bottom-2 left-2 right-2 sm:left-auto sm:right-3 sm:bottom-3 max-w-xs bg-black/85 border border-amber-400/40 rounded-2xl p-3 backdrop-blur-xl shadow-2xl space-y-2">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold">
                    {t('THƯỚC ĐO NI NHẪN TRỰC QUAN', 'VISUAL RING CALIPER')}
                  </span>
                  <span className="text-xs font-mono font-bold text-white">
                    {trySize} mm · Ni {mmToNi(trySize)}
                  </span>
                </div>

                {/* Calibrated Visual Circle Indicator */}
                <div className="flex items-center gap-3 py-1">
                  <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      {/* Outer calibrated ring */}
                      <circle cx="50" cy="50" r="44" stroke="#FCD34D" strokeWidth="2" strokeDasharray="3 2" fill="none" opacity="0.8" />
                      {/* Crosshairs */}
                      <line x1="50" y1="10" x2="50" y2="90" stroke="#FCD34D" strokeWidth="0.8" opacity="0.3" />
                      <line x1="10" y1="50" x2="90" y2="50" stroke="#FCD34D" strokeWidth="0.8" opacity="0.3" />
                      <circle cx="50" cy="50" r="2" fill="#FCD34D" />
                    </svg>
                    <span className="absolute text-[9px] font-mono text-amber-200 font-bold">
                      Ø {trySize}
                    </span>
                  </div>

                  <div className="flex-1 space-y-1 text-[10px] text-slate-300">
                    <p className="leading-tight text-white font-medium">
                      {t('Áp nhẫn cũ lên vòng tròn để so khớp đường kính lòng trong.', 'Place ring on screen to match inside diameter.')}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {t('Chu vi lòng nhẫn:', 'Circumference:')} {(trySize * Math.PI).toFixed(1)} mm
                    </p>
                  </div>
                </div>

                {/* Quick Ni Selection Buttons */}
                <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-white/10">
                  {ringPresets.map(s => {
                    const isSel = Number(trySize) === Number(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onSelectSize && onSelectSize(Number(s))}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono shrink-0 transition-colors ${
                          isSel
                            ? 'bg-amber-400 text-black font-bold'
                            : 'bg-white/10 text-slate-300 hover:bg-white/20'
                        }`}
                      >
                        Ni {mmToNi(Number(s))} ({s}mm)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BRACELET: DIRECT ON-SCREEN WRIST CALIPER */}
            {type === 'bracelet' && (
              <div className="absolute bottom-2 left-2 right-2 sm:left-auto sm:right-3 sm:bottom-3 max-w-xs bg-black/85 border border-amber-400/40 rounded-2xl p-3 backdrop-blur-xl shadow-2xl space-y-2">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold">
                    {t('CỮ ĐO VÒNG TAY TRỰC QUAN', 'VISUAL BRACELET GAUGE')}
                  </span>
                  <span className="text-xs font-mono font-bold text-white">
                    {trySize} cm
                  </span>
                </div>
                <div className="flex items-center gap-1 pt-1">
                  {[15, 16.5, 18].map(len => {
                    const isSel = Number(trySize) === len;
                    return (
                      <button
                        key={len}
                        type="button"
                        onClick={() => onSelectSize && onSelectSize(len)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition-colors ${
                          isSel
                            ? 'bg-amber-400 text-black font-bold'
                            : 'bg-white/10 text-slate-300 hover:bg-white/20'
                        }`}
                      >
                        {len} cm {len === 15 ? t('(Nhỏ)', '(S)') : len === 16.5 ? t('(Vừa)', '(M)') : t('(Rộng)', '(L)')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* NECKLACE: DIRECT ON-SCREEN PENDANT CLARITY / DETAIL ZOOM */}
            {type === 'necklace' && (
              <div className="absolute bottom-2 left-2 right-2 sm:left-auto sm:right-3 sm:bottom-3 max-w-xs bg-black/85 border border-amber-400/40 rounded-2xl p-3 backdrop-blur-xl shadow-2xl space-y-2 pointer-events-auto">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold">
                    {t('ĐỘ RÕ MẶT DÂY CHUYỀN', 'PENDANT DETAIL CLARITY')}
                  </span>
                  <span className="text-xs font-mono font-bold text-white">
                    {Math.round((pendantScale || 1) * 100)}%
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 leading-tight">
                  {t('Phóng to mặt dây để quan sát rõ giác cắt đá, biểu tượng NFC & hoa văn.', 'Enlarge pendant to inspect gemstone facets, NFC emblem and details.')}
                </p>
                <div className="flex items-center gap-1 pt-0.5">
                  {[
                    { scale: 1, label: t('1.0x Chuẩn', '1.0x Standard') },
                    { scale: 1.25, label: t('1.25x Rõ', '1.25x Sharp') },
                    { scale: 1.5, label: t('1.5x Chi tiết', '1.5x Detail') }
                  ].map(preset => {
                    const isSel = Math.abs((pendantScale || 1) - preset.scale) < 0.05;
                    return (
                      <button
                        key={preset.scale}
                        type="button"
                        onClick={() => onSelectPendantScale && onSelectPendantScale(preset.scale)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition-colors ${
                          isSel
                            ? 'bg-amber-400 text-black font-bold'
                            : 'bg-white/10 text-slate-300 hover:bg-white/20'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          BOTTOM HINT BAR: CONCRETE VISUAL POINTER
          ======================================================== */}
      {isSearching && (
        <div className="self-center mb-1 px-3 py-1 rounded-full bg-black/85 backdrop-blur-md border border-white/15 text-[11px] font-mono text-slate-200 shadow-xl pointer-events-auto">
          {type === 'ring'
            ? t('CỰ LY: 25 - 40 CM · XÒE NHẸ CÁC NGÓN TAY HƯỚNG VỀ CAMERA', 'DIST: 25 - 40 CM · SPREAD FINGERS TOWARDS CAMERA')
            : type === 'bracelet'
            ? t('CỰ LY: 30 - 50 CM · ĐƯA CỔ TAY NGANG TẦM KHUNG NGẮM', 'DIST: 30 - 50 CM · PLACE WRIST LEVEL WITH GUIDE')
            : t('CỰ LY: 50 - 70 CM · CAMERA NGANG TẦM MẮT · THẤY TRỌN HAI VAI', 'DIST: 50 - 70 CM · CAMERA AT EYE LEVEL · BOTH SHOULDERS VISIBLE')}
        </div>
      )}
    </div>
  );
}
