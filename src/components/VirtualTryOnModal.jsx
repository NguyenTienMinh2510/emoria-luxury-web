import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider';
import { apiRequest } from '../services/apiClient.js';
import { NecklaceTracker } from '../services/arNecklaceTracker.js';
import { HandTracker } from '../services/arHandTracker.js';
import { tryOnConfig } from '../services/tryOnConfig.js';
import { previewSizeForVariant } from '../services/jewelrySizing.js';
import ARFramingGuide from './ARFramingGuide.jsx';
import ARPlacementGuideModal from './ARPlacementGuideModal.jsx';
import JewelrySizeGuideModal from './JewelrySizeGuideModal.jsx';

export default function VirtualTryOnModal({ product, settings, onClose, onAddToCart, initialSize }) {
  const { t } = useLanguage(),
    video = useRef(),
    canvas = useRef(),
    engine = useRef(),
    dialog = useRef(),
    alive = useRef(true),
    close = useRef(onClose),
    guideOpen = useRef(false);
  close.current = onClose;
  const [config, setConfig] = useState(null),
    [status, setStatus] = useState('intro'),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(false),
    [retry, setRetry] = useState(0);
  const [manual, setManual] = useState(false),
    [added, setAdded] = useState(false),
    [photo, setPhoto] = useState(null);
  const [trySize, setTrySize] = useState(17),
    [selectedFinger, setSelectedFinger] = useState('ring');
  const [showGuide, setShowGuide] = useState(true);
  const [fitScale, setFitScale] = useState(1);
  const [pendantScale, setPendantScale] = useState(1);
  const [distanceMetrics, setDistanceMetrics] = useState({ status: 'searching', score: 50, label: '' });
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [showPlacementGuide, setShowPlacementGuide] = useState(false);
  guideOpen.current = showSizeGuide || showPlacementGuide;
  const [size, setSize] = useState(initialSize || product.variants?.find(v => v.stock > 0)?.size || '');
  const variant = product.variants?.find(v => v.size === size),
    canBuy = !!onAddToCart && settings?.sales_enabled && product.active && variant?.stock > 0;
  const active = ['tracking', 'searching', 'loading-model', 'manual', 'manual-fallback'].includes(status);
  const isHand = config?.type === 'ring' || config?.type === 'bracelet';

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const key = e => {
      if (guideOpen.current) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const nodes = [
          ...dialog.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href]')
        ].filter(n => n.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const pause = () => {
      if (document.hidden && engine.current) {
        engine.current.stop();
        engine.current = null;
        setStatus('paused');
      }
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('visibilitychange', pause);
    return () => {
      alive.current = false;
      engine.current?.stop();
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('visibilitychange', pause);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setError('');
    const applyConfig = data => {
      setConfig(data);
      setTrySize(previewSizeForVariant(size, data?.type) || data?.defaultSize || data?.defaultLength || 45);
      if (data?.finger) setSelectedFinger(data.finger);
    };
    apiRequest('/products/' + encodeURIComponent(product.id) + '/try-on')
      .then(data => {
        if (!cancelled) {
          applyConfig(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = tryOnConfig(product.id, product);
          if (fallback) {
            applyConfig(fallback);
          } else {
            setLoadError(true);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [product.id, retry]);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo]
  );

  useEffect(() => {
    if (!engine.current) return;
    if (isHand) {
      engine.current.setOptions({ size: trySize, scale: fitScale, offset: 0, finger: selectedFinger });
    } else {
      engine.current.setOptions({ length: trySize, scale: fitScale, pendantScale });
    }
  }, [trySize, selectedFinger, fitScale, pendantScale, isHand, config?.type]);

  async function start() {
    if (!config || status === 'starting') return;
    engine.current?.stop();
    setError('');
    setStatus('starting');
    setManual(false);
    const onStateChange = next => {
      if (alive.current) {
        setStatus(next);
        if (next === 'manual-fallback') setManual(true);
      }
    };
    const tracker = isHand
      ? new HandTracker(video.current, canvas.current, config, onStateChange, setDistanceMetrics)
      : new NecklaceTracker(video.current, canvas.current, config, onStateChange, setDistanceMetrics);

    engine.current = tracker;
    if (isHand) {
      tracker.setOptions({ size: trySize, scale: fitScale, offset: 0, finger: selectedFinger });
    } else {
      tracker.setOptions({ length: trySize, scale: fitScale, pendantScale });
    }

    try {
      await tracker.start();
    } catch (e) {
      if (!alive.current || engine.current !== tracker) return;
      setStatus('error');
      setError(
        e.name === 'Unsupported3DError'
          ? t(
              'Thiết bị chưa bật WebGL2 để thử model 3D. Hãy bật tăng tốc đồ họa hoặc dùng trình duyệt khác.',
              'WebGL2 is unavailable. Enable hardware acceleration or try another browser.'
            )
          : e.name === 'ModelLoadError'
          ? t('Chưa tải được model 3D. Hãy kiểm tra kết nối rồi thử lại.', 'Could not load the 3D model. Check your connection and retry.')
          : e.name === 'NotAllowedError'
          ? t(
              'Camera chưa được cấp quyền. Cho phép camera trong cài đặt trình duyệt rồi thử lại.',
              'Camera permission was denied. Allow camera access in browser settings and try again.'
            )
          : e.name === 'NotFoundError'
          ? t('Không tìm thấy camera trên thiết bị.', 'No camera was found on this device.')
          : e.name === 'NotReadableError'
          ? t('Camera đang được ứng dụng khác sử dụng. Đóng ứng dụng đó rồi thử lại.', 'Camera is in use by another app. Close it and retry.')
          : t('Không mở được camera. Hãy thử Safari hoặc Chrome qua HTTPS.', 'Camera could not start. Try Safari or Chrome over HTTPS.')
      );
    }
  }

  async function capture() {
    try {
      const blob = await engine.current.snapshot();
      if (alive.current) setPhoto(URL.createObjectURL(blob));
    } catch {
      setError(
        isHand
          ? t('Chờ nhận diện bàn tay hoặc chọn căn chỉnh thủ công trước khi chụp.', 'Wait for hand tracking or switch to manual placement before capturing.')
          : t('Chờ nhận diện vai hoặc chọn căn chỉnh thủ công trước khi chụp.', 'Wait for shoulder tracking or switch to manual placement before capturing.')
      );
    }
  }

  const labels = {
    intro:
      config?.type === 'ring'
        ? t('Gương trải nghiệm nhẫn', 'Your ring mirror')
        : config?.type === 'bracelet'
        ? t('Gương trải nghiệm vòng tay', 'Your bracelet mirror')
        : t('Gương trải nghiệm trang sức', 'Your jewelry mirror'),
    starting: t('Đang mở camera…', 'Opening camera…'),
    'loading-model': t('Đang tải bộ nhận diện trên thiết bị…', 'Loading on-device tracking…'),
    tracking:
      isHand
        ? config?.type === 'bracelet'
          ? t('Đã nhận diện cổ tay', 'Wrist detected')
          : t('Đã nhận diện bàn tay', 'Hand detected')
        : t('Đã nhận diện vai & cổ', 'Shoulders & neck detected'),
    searching:
      isHand
        ? config?.type === 'bracelet'
          ? t('Giơ cổ tay và bàn tay trước camera', 'Show your wrist and hand to the camera')
          : t('Giơ bàn tay trước camera, xòe nhẹ các ngón tay', 'Show your hand facing the camera, spread fingers slightly')
        : t('Lùi nhẹ để camera thấy cả hai vai', 'Step back until both shoulders are visible'),
    manual: t('Căn chỉnh thủ công', 'Manual placement'),
    'manual-fallback': t('Thiết bị chưa chạy được nhận diện tự động. Bạn vẫn có thể căn chỉnh thủ công.', 'Automatic tracking is unavailable here. You can still adjust placement manually.'),
    paused: t('Camera đã tắt khi rời trang', 'Camera stopped while the page was hidden'),
    error: t('Camera chưa sẵn sàng', 'Camera unavailable')
  };

  const previewImage =
    product.image ||
    product.image_url ||
    product.images?.[0] ||
    config?.referenceImage ||
    (config?.type === 'ring'
      ? '/assets/product_horizon.png'
      : config?.type === 'bracelet'
      ? '/assets/product_pulse.png'
      : '/assets/catalog/emoria-faith.png');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-2 sm:p-5 flex items-center justify-center"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        inert={showSizeGuide || showPlacementGuide ? true : undefined}
        translate="no"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tryon-title"
        className="notranslate w-full max-w-5xl max-h-[96dvh] overflow-y-auto rounded-3xl bg-[#101216] border border-white/15 text-slate-100 shadow-2xl outline-none"
      >
        <header className="sticky top-0 z-10 bg-[#101216] px-5 py-3 flex items-center justify-between border-b border-white/10">
          <div>
            <p className="text-[10px] uppercase tracking-[.25em] text-amber-100/70 font-mono">
              EMORIA · {config?.type === 'ring' ? 'AR RING EXPERIENCE' : config?.type === 'bracelet' ? 'AR BRACELET EXPERIENCE' : 'AR JEWELRY EXPERIENCE'}
            </p>
            <h2 id="tryon-title" className="font-serif text-xl">
              {product.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Đóng gương AR', 'Close AR mirror')}
            className="min-w-11 min-h-11 grid place-items-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </header>

        <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Main AR Viewport */}
          <div className="relative bg-[#0b0d12] min-h-[300px] md:min-h-[500px] flex items-center justify-center overflow-hidden rounded-2xl m-3 border border-white/10 shadow-2xl">
            <div className="relative w-full h-full flex items-center justify-center">
              <video ref={video} playsInline muted autoPlay aria-hidden="true" className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" />
              <canvas
                ref={canvas}
                aria-label={t('Gương AR trực tiếp', 'Live AR mirror')}
                className={`max-w-full max-h-[65dvh] md:max-h-[75dvh] w-auto h-auto object-contain rounded-xl block ${active ? '' : 'invisible'}`}
              />
              {active && (
                <ARFramingGuide
                  type={config?.type || 'necklace'}
                  status={status}
                  distanceMetrics={distanceMetrics}
                  selectedFinger={selectedFinger}
                  showGuide={showGuide}
                  onToggleGuide={() => setShowGuide(prev => !prev)}
                  trySize={trySize}
                  onSelectSize={setTrySize}
                  availableSizes={isHand ? config?.previewSizes : config?.previewLengths}
                  pendantScale={pendantScale}
                  onSelectPendantScale={setPendantScale}
                  t={t}
                />
              )}
            </div>

            {/* Waiting / Standby Screen (!active) */}
            {!active && (
              <div className="absolute inset-0 flex flex-col items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-[#141822] via-[#0d1017] to-black text-center z-10 overflow-y-auto">
                {/* Header Tag */}
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono tracking-widest text-amber-200 uppercase font-semibold">
                  EMORIA PRIVATE SALON · AR EXPERIENCE
                </div>

                {/* Central Visual Showcase & Placement Schematic */}
                <div className="flex flex-col items-center gap-3 my-auto py-2 w-full max-w-md">
                  {/* Jewelry Avatar */}
                  <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-radial from-amber-400/15 via-white/[0.03] to-transparent border border-white/15 p-3 shadow-2xl flex items-center justify-center backdrop-blur-xl">
                    <img
                      src={previewImage}
                      alt={product.name}
                      className="w-full h-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]"
                    />
                  </div>

                  <div className="space-y-0.5">
                    <h3 className="font-serif text-xl sm:text-2xl text-white font-bold">
                      {labels[status] || product.name}
                    </h3>
                    <p className="text-[11px] text-amber-200/80 font-mono tracking-wider uppercase">
                      {config?.type === 'ring'
                        ? t('Bạc Ý S925 · Đúc Nguyên Khối · Chip Kỷ Niệm NFC', 'Italian S925 · Solid Cast · NFC Memory Space')
                        : config?.type === 'bracelet'
                        ? t('Bạc Ý S925 · Hoàn Thiện Tinh Xảo · Chip Kỷ Niệm NFC', 'Italian S925 · Fine Finish · NFC Memory Space')
                        : t('Bạc Ý S925 · Khắc Kỷ Niệm NFC · Chuẩn Rơi Thanh Lịch', 'Italian S925 · NFC Memory Space · Elegant Drop')}
                    </p>
                  </div>

                  {/* Visual Setup Blueprint Diagram */}
                  <div className="w-full p-3 rounded-2xl bg-black/60 border border-amber-400/25 text-left space-y-2 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/10 pb-1 text-[10px] font-mono text-amber-300 font-bold uppercase tracking-wider">
                      <span>{t('SƠ ĐỒ THIẾT LẬP CAMERA CHUẨN', 'OPTIMAL CAMERA SETUP SCHEMATIC')}</span>
                      <span>100% TRỰC QUAN</span>
                    </div>

                    {/* SVG Technical Blueprint Diagram */}
                    <div className="w-full h-20 sm:h-24 bg-white/[0.02] rounded-xl border border-white/5 flex items-center justify-center p-1">
                      <svg viewBox="0 0 300 70" className="w-full h-full">
                        {/* Device / Phone */}
                        <rect x="25" y="15" width="22" height="40" rx="3" fill="#1E293B" stroke="#FCD34D" strokeWidth="1.5" />
                        <line x1="36" y1="20" x2="36" y2="20.1" stroke="#FCD34D" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="36" cy="48" r="2" fill="#FCD34D" />

                        {/* Light Direction Ray */}
                        <path d="M 10 35 L 20 35" stroke="#FCD34D" strokeWidth="1.2" strokeDasharray="2 1" />
                        <text x="16" y="11" fill="#FCD34D" fontSize="7" fontFamily="monospace">
                          ÁNH SÁNG
                        </text>

                        {/* Distance Arrow & Measurement */}
                        <line x1="52" y1="35" x2="218" y2="35" stroke="#FCD34D" strokeWidth="1" strokeDasharray="3 2" />
                        <polygon points="52,32 47,35 52,38" fill="#FCD34D" />
                        <polygon points="218,32 223,35 218,38" fill="#FCD34D" />
                        <rect x="95" y="27" width="80" height="16" rx="3" fill="#000000" stroke="#FCD34D" strokeWidth="0.8" />
                        <text x="135" y="38" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold" fontFamily="monospace">
                          {config?.type === 'ring' ? '25 – 40 CM' : config?.type === 'bracelet' ? '30 – 50 CM' : '50 – 70 CM'}
                        </text>

                        {/* Subject (Bust for necklace, Hand for ring/bracelet) */}
                        {config?.type === 'necklace' ? (
                          <g transform="translate(245, 35)">
                            <ellipse cx="0" cy="-14" rx="8" ry="10" fill="none" stroke="#FFFFFF" strokeWidth="1.2" />
                            <path d="M -18 18 C -12 6, -6 0, 0 0 C 6 0, 12 6, 18 18" fill="none" stroke="#FFFFFF" strokeWidth="1.2" />
                            <circle cx="0" cy="8" r="2.5" fill="#FCD34D" />
                          </g>
                        ) : (
                          <g transform="translate(245, 35)">
                            <path d="M -10 15 L -6 0 L -2 -14 L 3 -14 L 6 0 L 10 15 Z" fill="none" stroke="#FFFFFF" strokeWidth="1.2" />
                            <ellipse cx="0" cy="-2" rx="4" ry="2" stroke="#FCD34D" strokeWidth="1.2" fill="none" />
                          </g>
                        )}
                      </svg>
                    </div>

                    {/* 3 Concrete Setup Metrics */}
                    <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
                      <div className="p-1.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-slate-400 block text-[9px] uppercase">{t('CỰ LY', 'DISTANCE')}</span>
                        <strong className="text-amber-200">
                          {config?.type === 'ring' ? '25 – 40 cm' : config?.type === 'bracelet' ? '30 – 50 cm' : '50 – 70 cm'}
                        </strong>
                      </div>
                      <div className="p-1.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-slate-400 block text-[9px] uppercase">{t('GÓC MÁY', 'CAMERA ANGLE')}</span>
                        <strong className="text-amber-200">
                          {config?.type === 'necklace' ? 'Ngang mắt' : 'Chếch 45°'}
                        </strong>
                      </div>
                      <div className="p-1.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-slate-400 block text-[9px] uppercase">{t('ÁNH SÁNG', 'LIGHTING')}</span>
                        <strong className="text-amber-200">{t('Thuận chiều', 'Forward')}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Direct Action Button (No icons, pure luxury typography) */}
                <div className="w-full max-w-md space-y-2 pt-1 pointer-events-auto">
                  <button
                    disabled={!config || status === 'starting'}
                    onClick={start}
                    className="w-full min-h-12 rounded-xl bg-gradient-to-r from-amber-100 via-white to-amber-200 text-dark-950 font-bold hover:brightness-105 active:scale-[0.99] disabled:opacity-40 flex items-center justify-center uppercase tracking-wider text-xs sm:text-sm shadow-[0_4px_25px_rgba(252,211,77,0.3)] transition-all font-mono"
                  >
                    {status === 'starting' ? t('Đang mở camera…', 'Opening camera…') : t('Bật Camera Trải Nghiệm Ngay', 'Start Live AR Try-On')}
                  </button>

                  <div className="flex items-center justify-center gap-3 text-[11px] text-slate-400">
                    <button
                      type="button"
                      onClick={() => setShowPlacementGuide(true)}
                      className="hover:text-amber-200 underline transition-colors"
                    >
                      {t('Cẩm nang đặt camera chi tiết', 'Detailed placement guide')}
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setShowSizeGuide(true)}
                      className="hover:text-amber-200 underline transition-colors"
                    >
                      {t('Bảng thông số chọn size', 'Size calculation table')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {active && (
              <div
                className="absolute left-3 right-3 bottom-3 rounded-xl px-3 py-1.5 bg-black/85 text-xs text-center border border-white/10 shadow-lg z-20 backdrop-blur-sm pointer-events-none font-mono"
                role="status"
              >
                {labels[status]}
              </div>
            )}
          </div>

          {/* Right Sidebar Controls */}
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-300 border-l-2 border-emerald-400 pl-2.5">
              {t(
                'BẢO MẬT: Hình ảnh chỉ xử lý trực tiếp trên thiết bị của bạn, không gửi về máy chủ. Camera tắt khi đóng gương.',
                'SECURITY: Camera video is processed locally on your device. Camera turns off when closing the mirror.'
              )}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowPlacementGuide(true)}
                className="min-h-11 rounded-xl border border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10 text-amber-200 text-xs font-semibold flex items-center justify-center transition-colors p-2 text-center"
              >
                {t('Cẩm nang đặt cam', 'Placement Guide')}
              </button>
              <button
                type="button"
                onClick={() => setShowSizeGuide(true)}
                className="min-h-11 rounded-xl border border-white/20 hover:bg-white/5 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center transition-colors p-2 text-center"
              >
                {t('Bảng đo size chi tiết', 'Detailed Size Table')}
              </button>
            </div>

            {loadError && (
              <div role="alert" className="text-sm text-amber-200">
                {t('Chưa tải được cấu hình AR cho sản phẩm.', 'Could not load this product’s AR configuration.')}{' '}
                <button className="underline min-h-11" onClick={() => setRetry(n => n + 1)}>
                  {t('Thử lại', 'Retry')}
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-amber-200">
                {error}
              </p>
            )}

            {!active && (
              <button
                disabled={!config || status === 'starting'}
                onClick={start}
                className="w-full min-h-12 rounded-xl bg-gradient-to-r from-amber-100 via-white to-amber-200 text-dark-950 font-bold hover:brightness-105 active:scale-[0.99] disabled:opacity-40 flex items-center justify-center uppercase tracking-wider text-xs shadow-lg transition-all font-mono"
              >
                {status === 'starting' ? t('Đang mở camera…', 'Opening camera…') : t('Bật Camera Trải Nghiệm', 'Start Live AR')}
              </button>
            )}

            {active && (
              <>
                <p className="text-xs text-slate-300">
                  {t(
                    'Trang sức tự bám theo vị trí nhận diện. Giữ đủ sáng và di chuyển chậm. AR giúp xem dáng đeo, không thay thế dụng cụ đo y khoa.',
                    'Jewelry follows detected landmarks. Use good lighting and move slowly. AR previews the style.'
                  )}
                </p>

                {config?.type === 'ring' && (
                  <fieldset>
                    <legend className="text-sm mb-2">{t('Ngón tay đeo nhẫn', 'Wear on finger')}</legend>
                    <div className="flex gap-2">
                      {[
                        ['index', t('Trỏ', 'Index')],
                        ['middle', t('Giữa', 'Middle')],
                        ['ring', t('Áp út', 'Ring')]
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          aria-pressed={selectedFinger === key}
                          onClick={() => setSelectedFinger(key)}
                          className={`min-h-11 flex-1 rounded-xl border ${
                            selectedFinger === key ? 'bg-white text-black font-bold' : 'border-white/20'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <label className="block text-sm">
                  {t('Size xem thử', 'Preview size')}
                  <select
                    className="w-full mt-2 min-h-11 rounded-xl bg-slate-900 border border-white/20 px-3 font-mono"
                    value={trySize}
                    onChange={e => setTrySize(Number(e.target.value))}
                  >
                    {[...new Set([...(isHand ? config.previewSizes || [] : config.previewLengths || [config.defaultLength || 45]), trySize])]
                      .sort((a, b) => a - b)
                      .map(n => (
                        <option key={n} value={n}>
                          {n} {config.type === 'ring' ? 'mm' : 'cm'}
                        </option>
                      ))}
                  </select>
                  <span className="text-xs text-slate-400">
                    {config.type === 'ring'
                      ? t('Đường kính lòng nhẫn · không phải số đo từ camera.', 'Inner ring diameter · not a camera measurement.')
                      : config.type === 'necklace'
                      ? t('Chiều dài dây, chưa gồm mặt trang sức.', 'Chain length, excluding the pendant.')
                      : t('Chiều dài vòng, không phải chu vi cổ tay.', 'Bracelet length, not wrist circumference.')}
                  </span>
                </label>

                {config?.type === 'necklace' && (
                  <div className="space-y-1.5 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-200">
                        {t('Độ rõ mặt dây chuyền', 'Pendant detail zoom')}
                      </span>
                      <span className="text-xs font-mono font-bold text-white">
                        {Math.round(pendantScale * 100)}%
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[
                        [1, t('1.0x Chuẩn', '1.0x Standard')],
                        [1.25, t('1.25x Rõ', '1.25x Sharp')],
                        [1.5, t('1.5x Chi tiết', '1.5x Detail')]
                      ].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPendantScale(val)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                            Math.abs(pendantScale - val) < 0.05
                              ? 'bg-amber-400 text-black font-bold'
                              : 'bg-white/10 text-slate-300 hover:bg-white/20'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      {t(
                        'Phóng to mặt dây để quan sát rõ giác cắt đá, biểu tượng NFC & hoa văn.',
                        'Enlarge pendant to inspect gemstone facets, NFC emblem and details.'
                      )}
                    </p>
                  </div>
                )}

                <details className="text-xs text-slate-300">
                  <summary className="min-h-11 cursor-pointer py-3">{t('Tinh chỉnh độ vừa', 'Fine-tune the fit')}</summary>
                  <label className="block">
                    {t('Hiệu chỉnh tỷ lệ ước lượng', 'Adjust estimated scale')} · {Math.round(fitScale * 100)}%
                    <input
                      className="block w-full min-h-11"
                      type="range"
                      min="0.8"
                      max="1.2"
                      step="0.01"
                      value={fitScale}
                      onChange={e => setFitScale(Number(e.target.value))}
                    />
                  </label>
                  <button className="underline min-h-11" onClick={() => setFitScale(1)}>
                    {t('Đặt lại 100%', 'Reset to 100%')}
                  </button>
                  <p>{t('Chỉ hiệu chỉnh hình xem thử, không đổi số đo sản phẩm.', 'Adjusts the preview only, not the product dimensions.')}</p>
                </details>

                <label className="text-xs flex items-center gap-2 min-h-11">
                  <input type="checkbox" checked={showGuide} onChange={e => setShowGuide(e.target.checked)} />
                  {t('Hiện khung ngắm định vị cơ thể', 'Show body framing guide')}
                </label>

                {manual && (
                  <p className="text-xs text-amber-200">
                    {t('Đang xem mẫu cố định giữa hình; chưa bám theo cơ thể.', 'The model is centered; body tracking is unavailable.')}{' '}
                    {engine.current?.workerReady && (
                      <button
                        className="underline min-h-11"
                        onClick={() => {
                          engine.current.setManual(false);
                          setManual(false);
                        }}
                      >
                        {t('Bật lại nhận diện', 'Resume tracking')}
                      </button>
                    )}
                  </p>
                )}

                <button
                  disabled={!['tracking', 'manual', 'manual-fallback'].includes(status)}
                  onClick={capture}
                  className="w-full min-h-11 rounded-xl border border-white/25 flex items-center justify-center uppercase font-mono tracking-wider text-xs disabled:opacity-40 hover:bg-white/10 transition-colors"
                >
                  {t('Chụp ảnh gương', 'Capture mirror')}
                </button>
              </>
            )}

            <p className="text-[11px] text-slate-400">
              {t(
                'Mô phỏng trải nghiệm trang sức AR để tham khảo phong cách. Size xem thử trên camera không tự thay đổi phiên bản mua trong đơn hàng.',
                'AR preview style reference. Preview size does not automatically change the variant in cart.'
              )}
              {product.unitsPerItem === 2 ? ' ' + t('Combo hiển thị một chiếc để thử.', 'The duo set previews one item.') : ''}
            </p>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <label className="block text-xs">
                {t('Phiên bản mua', 'Purchase variant')}
                <select
                  value={size}
                  onChange={e => {
                    setSize(e.target.value);
                    setAdded(false);
                    const physical = previewSizeForVariant(e.target.value, config?.type);
                    if (physical) setTrySize(physical);
                  }}
                  className="w-full mt-2 min-h-11 rounded-xl bg-slate-900 border border-white/20 px-3 font-mono"
                >
                  {product.variants?.map(v => (
                    <option key={v.size} value={v.size} disabled={v.stock <= 0}>
                      {v.size}
                      {v.stock <= 0 ? ' · ' + t('Hết hàng', 'Sold out') : ''}
                    </option>
                  ))}
                </select>
              </label>

              <p className="font-serif text-xl">{product.formattedPrice}</p>

              <button
                disabled={!canBuy}
                onClick={() => {
                  onAddToCart({ ...product, size, isGift: false }, 1);
                  setAdded(true);
                }}
                className="w-full min-h-12 bg-amber-100 text-black rounded-xl font-bold uppercase tracking-wider text-xs flex items-center justify-center disabled:opacity-40 shadow-silver-glow font-mono transition-all"
              >
                {added
                  ? t('Đã thêm vào giỏ', 'Added to cart')
                  : canBuy
                  ? t('Thêm vào giỏ', 'Add to cart')
                  : t('Chưa có hàng để bán', 'Currently unavailable')}
              </button>
            </div>
          </div>
        </div>

        {photo && (
          <div className="mx-5 mb-5 p-3 rounded-xl border border-white/15 flex gap-4 items-center bg-black/60">
            <img src={photo} alt={t('Ảnh thử vừa chụp', 'Your captured try-on')} className="w-20 max-h-28 object-contain rounded-lg" />
            <div className="flex-1">
              <p className="text-xs text-slate-400">{t('Ảnh chỉ lưu khi bạn bấm tải xuống.', 'The photo is saved only when you download it.')}</p>
              <a
                href={photo}
                download={`EMORIA-${product.id}-try-on.jpg`}
                className="inline-flex items-center gap-2 min-h-11 underline text-amber-200 text-xs font-mono font-bold"
              >
                {t('Tải ảnh về máy', 'Download photo')}
              </a>
            </div>
            <button
              className="min-h-11 min-w-11 grid place-items-center text-slate-400 hover:text-white"
              aria-label={t('Bỏ ảnh vừa chụp', 'Discard photo')}
              onClick={() => setPhoto(null)}
            >
              <X size={17} />
            </button>
          </div>
        )}

        <JewelrySizeGuideModal
          isOpen={showSizeGuide}
          onClose={() => setShowSizeGuide(false)}
          onApplySize={setTrySize}
          previewSizes={config?.type === 'ring' ? config.previewSizes : undefined}
          initialCategory={config?.type === 'necklace' ? 'Dây chuyền' : config?.type === 'bracelet' ? 'Vòng tay' : 'Nhẫn'}
        />

        <ARPlacementGuideModal
          isOpen={showPlacementGuide}
          onClose={() => setShowPlacementGuide(false)}
          category={config?.type}
          onOpenSizeGuide={() => setShowSizeGuide(true)}
        />
      </section>
    </div>,
    document.body
  );
}
