import React, { useState, useEffect, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Heart, Sparkles, ArrowLeft, ArrowRight, Upload,
  Trash2, Share2, Copy, Check, Eye, Lock, Globe, RefreshCw,
  AlertCircle, CheckCircle2, Image as ImageIcon, Edit3, X,
  Maximize2, BookOpen, Compass, ShoppingBag, LayoutGrid
} from 'lucide-react';
import {
  getHouseDraft,
  saveHouseDraft,
  publishHouse,
  unpublishHouse,
  revokeHouseShare,
  getPublicHouse,
  getPublicHouseByTag,
  uploadEventPhoto,
  HOUSE_ROOMS_SPEC,
  HOUSE_THEMES
} from '../services/eventService.js';

// Visual theme configurations
const THEME_STYLES = {
  classic: {
    name: 'Cổ Điển Sang Trọng',
    bg: 'from-dark-950 via-dark-900 to-black',
    card: 'bg-white/[0.04] border-white/10 text-slate-100',
    accent: 'text-amber-300',
    polaroidBg: 'bg-[#faf8f5] text-slate-800'
  },
  warm_gold: {
    name: 'Ánh Kim Ấm Áp',
    bg: 'from-amber-950/40 via-dark-950 to-black',
    card: 'bg-amber-950/20 border-amber-500/20 text-amber-50',
    accent: 'text-amber-400',
    polaroidBg: 'bg-[#fffdf9] text-amber-950'
  },
  rose_romance: {
    name: 'Hoa Hồng Lãng Mạn',
    bg: 'from-rose-950/40 via-dark-950 to-black',
    card: 'bg-rose-950/20 border-rose-500/20 text-rose-50',
    accent: 'text-rose-400',
    polaroidBg: 'bg-[#fff5f6] text-rose-950'
  },
  midnight: {
    name: 'Đêm Huyền Bí',
    bg: 'from-indigo-950/40 via-slate-950 to-black',
    card: 'bg-indigo-950/20 border-indigo-500/20 text-indigo-50',
    accent: 'text-indigo-400',
    polaroidBg: 'bg-[#f4f7fb] text-slate-900'
  },
  minimal_dark: {
    name: 'Tối Giản Hiện Đại',
    bg: 'from-neutral-950 via-black to-neutral-950',
    card: 'bg-neutral-900/60 border-neutral-800 text-neutral-100',
    accent: 'text-white',
    polaroidBg: 'bg-[#ffffff] text-neutral-900'
  },
  editorial_cream: {
    name: 'Tạp Chí Nắng Mai',
    bg: 'from-stone-900 via-dark-950 to-black',
    card: 'bg-stone-900/40 border-stone-700/40 text-stone-100',
    accent: 'text-orange-200',
    polaroidBg: 'bg-[#faf6ee] text-stone-900'
  }
};

export default function MemoryHouseStudio({
  tagUid,
  shareId: initialShareId,
  onBack,
  onNavigateHome,
  onNavigateShop,
  onNavigateMemory,
  onSwitchStudio,
  currentUser
}) {
  const isPublicVisitor = Boolean(initialShareId) || !currentUser;

  // States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState(isPublicVisitor ? 'preview' : 'edit'); // 'edit' | 'preview'
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);

  // House Data
  const [houseTitle, setHouseTitle] = useState('Ngôi Nhà Kỷ Niệm Của Đôi Mình');
  const [selectedTheme, setSelectedTheme] = useState('warm_gold');
  const [rooms, setRooms] = useState(() =>
    HOUSE_ROOMS_SPEC.map((spec) => ({
      id: spec.id,
      name: spec.name,
      note: '',
      memories: []
    }))
  );
  const [isPublished, setIsPublished] = useState(false);
  const [currentShareId, setCurrentShareId] = useState(initialShareId || null);

  // UI Action States
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [uploadingRoomId, setUploadingRoomId] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);

  // Load House Data (either draft for owner or public snapshot for guest/share)
  const loadHouse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (initialShareId) {
        // Public share mode
        const publicData = await getPublicHouse(initialShareId);
        if (publicData.title) setHouseTitle(publicData.title);
        if (publicData.theme) setSelectedTheme(publicData.theme);
        if (Array.isArray(publicData.rooms)) {
          const enriched = publicData.rooms.map((r) => {
            const spec = HOUSE_ROOMS_SPEC.find((s) => s.id === r.id);
            return {
              ...r,
              name: r.name || spec?.name || r.id,
              memories: r.memories || []
            };
          });
          setRooms(enriched);
        }
        setIsPublished(true);
        setActiveTab('preview');
      } else if (tagUid && currentUser) {
        // Owner draft mode
        try {
          const draft = await getHouseDraft(tagUid);
          if (draft.title) setHouseTitle(draft.title);
          if (draft.theme) setSelectedTheme(draft.theme);
          setIsPublished(Boolean(draft.is_published));
          if (draft.share_id) setCurrentShareId(draft.share_id);

          if (Array.isArray(draft.rooms) && draft.rooms.length > 0) {
            const fullRooms = HOUSE_ROOMS_SPEC.map((spec) => {
              const existing = draft.rooms.find((r) => r.id === spec.id);
              return {
                id: spec.id,
                name: existing?.name || spec.name,
                note: existing?.note || '',
                memories: existing?.memories || []
              };
            });
            setRooms(fullRooms);
          }
        } catch (draftErr) {
          // Fallback to public published view if not owner of draft
          try {
            const publicData = await getPublicHouseByTag(tagUid);
            if (publicData.title) setHouseTitle(publicData.title);
            if (publicData.theme) setSelectedTheme(publicData.theme);
            if (Array.isArray(publicData.rooms)) {
              const enriched = publicData.rooms.map((r) => {
                const spec = HOUSE_ROOMS_SPEC.find((s) => s.id === r.id);
                return {
                  ...r,
                  name: r.name || spec?.name || r.id,
                  memories: r.memories || []
                };
              });
              setRooms(enriched);
            }
            setIsPublished(true);
            setActiveTab('preview');
          } catch {
            throw draftErr;
          }
        }
      } else if (tagUid) {
        // Guest mode (unauthenticated) - only read published snapshot, NEVER query draft
        const publicData = await getPublicHouseByTag(tagUid);
        if (publicData.title) setHouseTitle(publicData.title);
        if (publicData.theme) setSelectedTheme(publicData.theme);
        if (Array.isArray(publicData.rooms)) {
          const enriched = publicData.rooms.map((r) => {
            const spec = HOUSE_ROOMS_SPEC.find((s) => s.id === r.id);
            return {
              ...r,
              name: r.name || spec?.name || r.id,
              memories: r.memories || []
            };
          });
          setRooms(enriched);
        }
        setIsPublished(true);
        setActiveTab('preview');
      }
    } catch (err) {
      setError(err?.message || 'Không thể tải ngôi nhà kỷ niệm.');
    } finally {
      setLoading(false);
    }
  }, [initialShareId, tagUid, currentUser]);

  useEffect(() => {
    loadHouse();
  }, [loadHouse]);

  // Save Draft
  const handleSaveDraft = async (customRooms = rooms) => {
    if (!tagUid || isPublicVisitor) return;
    setIsSaving(true);
    setError('');
    try {
      await saveHouseDraft(tagUid, {
        title: houseTitle.trim() || 'Ngôi Nhà Kỷ Niệm Của Đôi Mình',
        theme: selectedTheme,
        rooms: customRooms
      });
      setSuccessMsg('Đã lưu bản nháp ngôi nhà thành công!');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err) {
      setError(err?.message || 'Lỗi khi lưu bản nháp.');
    } finally {
      setIsSaving(false);
    }
  };

  // Publish House
  const handlePublish = async () => {
    if (!tagUid || isPublicVisitor) return;
    setIsPublishing(true);
    setError('');
    try {
      // Save latest draft first
      await saveHouseDraft(tagUid, {
        title: houseTitle.trim() || 'Ngôi Nhà Kỷ Niệm Của Đôi Mình',
        theme: selectedTheme,
        rooms
      });
      const res = await publishHouse(tagUid);
      setIsPublished(true);
      if (res.share_id) {
        setCurrentShareId(res.share_id);
      }
      setSuccessMsg('Ngôi nhà đã được xuất bản! Bạn có thể chia sẻ liên kết này.');
    } catch (err) {
      setError(err?.message || 'Không thể xuất bản ngôi nhà.');
    } finally {
      setIsPublishing(false);
    }
  };

  // Unpublish House
  const handleUnpublish = async () => {
    if (!tagUid || isPublicVisitor) return;
    setError('');
    try {
      await unpublishHouse(tagUid);
      setIsPublished(false);
      setSuccessMsg('Ngôi nhà đã được chuyển về chế độ riêng tư.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err?.message || 'Không thể gỡ xuất bản.');
    }
  };

  // Revoke Share ID
  const handleRevokeShare = async () => {
    if (!tagUid || isPublicVisitor) return;
    setError('');
    try {
      const res = await revokeHouseShare(tagUid);
      if (res.share_id) {
        setCurrentShareId(res.share_id);
      }
      setIsRevokeModalOpen(false);
      setSuccessMsg('Đã thu hồi liên kết cũ và cấp mã liên kết mới an toàn.');
    } catch (err) {
      setError(err?.message || 'Không thể thu hồi liên kết.');
    }
  };

  // Photo Upload to Room
  const handlePhotoUpload = async (roomId, file) => {
    if (!file || !tagUid) return;
    setUploadingRoomId(roomId);
    setError('');
    try {
      const res = await uploadEventPhoto(tagUid, file);
      const nextRooms = rooms.map((r) => {
        if (r.id !== roomId) return r;
        const currentMems = r.memories || [];
        if (currentMems.length >= 10) {
          throw new Error('Mỗi phòng chỉ được chứa tối đa 10 khoảnh khắc.');
        }
        return {
          ...r,
          memories: [
            ...currentMems,
            {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              photo_path: res.path,
              photo_url: res.url,
              caption: '',
              date: new Date().toLocaleDateString('vi-VN')
            }
          ]
        };
      });
      setRooms(nextRooms);
      await handleSaveDraft(nextRooms);
      setSuccessMsg('Đã thêm ảnh vào phòng kỷ niệm!');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err) {
      setError(err?.message || 'Không thể tải ảnh lên phòng.');
    } finally {
      setUploadingRoomId(null);
    }
  };

  // Remove Photo
  const handleRemovePhoto = (roomId, photoIndex) => {
    const nextRooms = rooms.map((r) => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        memories: (r.memories || []).filter((_, idx) => idx !== photoIndex)
      };
    });
    setRooms(nextRooms);
  };

  // Update Photo Caption
  const handleUpdateCaption = (roomId, photoIndex, caption) => {
    const nextRooms = rooms.map((r) => {
      if (r.id !== roomId) return r;
      const mems = [...(r.memories || [])];
      mems[photoIndex] = { ...mems[photoIndex], caption: caption.slice(0, 500) };
      return { ...r, memories: mems };
    });
    setRooms(nextRooms);
  };

  // Update Room Note
  const handleUpdateRoomNote = (roomId, note) => {
    const nextRooms = rooms.map((r) => {
      if (r.id !== roomId) return r;
      return { ...r, note: note.slice(0, 1500) };
    });
    setRooms(nextRooms);
  };

  // Share URL
  const shareUrl = currentShareId
    ? `${window.location.origin}/?view=memory-house&share=${currentShareId}`
    : '';

  const handleCopyShareLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const themeStyle = THEME_STYLES[selectedTheme] || THEME_STYLES.warm_gold;
  const currentRoom = rooms[activeRoomIndex] || rooms[0];

  const handleGoHome = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/?view=home';
    }
  };

  const handleBackToMemory = () => {
    if (onNavigateMemory) {
      onNavigateMemory(tagUid);
    } else if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (onNavigateHome) {
      onNavigateHome();
    }
  };

  const handleSwitchToMatch = () => {
    if (onSwitchStudio) {
      onSwitchStudio('match');
    } else if (typeof window !== 'undefined') {
      window.location.href = `/?view=memory-match${tagUid ? `&tag=${encodeURIComponent(tagUid)}` : ''}`;
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center" role="status">
        <motion.div
          animate={{ scale: [1, 1.1, 1], rotate: [0, 4, -4, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400"
        >
          <Home className="w-8 h-8" />
        </motion.div>
        <p className="text-slate-300 font-medium">Đang chuẩn bị không gian Ngôi Nhà Kỷ Niệm...</p>
        <span className="sr-only">Đang tải ngôi nhà</span>
      </div>
    );
  }

  return (
    <div className={`w-full min-h-screen bg-gradient-to-b ${themeStyle.bg} text-slate-100 px-4 py-6 sm:py-10 transition-colors duration-500`}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Navigation Bar with Multi-Page Navigation */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleGoHome}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
              title="Về Trang Chủ Emoria"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Trang chủ</span>
            </button>

            <button
              onClick={handleBackToMemory}
              type="button"
              aria-label="Quay lại kỷ vật"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
              title="Quay lại không gian kỷ niệm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại kỷ vật</span>
            </button>

            <button
              onClick={handleSwitchToMatch}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium transition-colors cursor-pointer shrink-0"
              title="Chuyển sang Couple Match Studio"
            >
              <Heart className="w-3.5 h-3.5 fill-rose-300/30" />
              <span>Chuyển sang Match Studio</span>
            </button>

            {onNavigateShop && (
              <button
                onClick={onNavigateShop}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
                title="Xem Cửa Hàng & Bộ Sưu Tập"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Cửa hàng</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/10 border border-white/10 text-amber-300 flex items-center gap-1.5 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Memory House Studio</span>
            </span>

            {isPublished && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                <Globe className="w-3 h-3" />
                <span>Công khai</span>
              </span>
            )}

            {!isPublicVisitor && (
              <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-full border border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'edit'
                      ? 'bg-white text-dark-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Chỉnh sửa
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-white text-dark-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Dạo xem
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Notifications & Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-sm flex items-start gap-3 shadow-lg"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-300">Thông báo</p>
                <p className="mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-200 text-xs font-bold">
                ✕
              </button>
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-sm flex items-center gap-3 shadow-lg"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="font-medium">{successMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===================================================================== */}
        {/* PUBLIC SHARE BANNER (nếu đã publish và có share link)                 */}
        {/* ===================================================================== */}
        {isPublished && shareUrl && !isPublicVisitor && (
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Liên kết chia sẻ ngôi nhà</p>
                <p className="text-[11px] text-slate-300 truncate max-w-xs sm:max-w-md">{shareUrl}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Đã sao chép' : 'Sao chép link'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsRevokeModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                title="Đổi mã liên kết chia sẻ mới nếu muốn vô hiệu hóa liên kết cũ"
              >
                Đổi link
              </button>
              <button
                type="button"
                onClick={handleUnpublish}
                className="px-3 py-1.5 rounded-xl hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors cursor-pointer"
              >
                Gỡ công khai
              </button>
            </div>
          </div>
        )}

        {/* 5 Rooms Switcher Tabs */}
        <div className="overflow-x-auto pb-2 scrollbar-none">
          <div role="tablist" aria-label="5 phòng của ngôi nhà kỷ niệm" className="flex items-center gap-2 min-w-max">
            {rooms.map((room, idx) => {
              const isSelected = activeRoomIndex === idx;
              const photoCount = room.memories?.length || 0;
              return (
                <button
                  key={room.id}
                  role="tab"
                  id={`room-tab-${room.id}`}
                  aria-selected={isSelected}
                  aria-controls={`room-panel-${room.id}`}
                  onClick={() => setActiveRoomIndex(idx)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-dark-950 border-white shadow-lg'
                      : 'bg-black/30 border-white/10 text-slate-300 hover:border-white/25 hover:bg-white/5'
                  }`}
                >
                  <span>{room.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isSelected ? 'bg-black/15 text-dark-950' : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {photoCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* TAB 1: EDIT MODE (Chủ sở hữu chỉnh sửa nội dung và tải ảnh)             */}
        {/* ===================================================================== */}
        {activeTab === 'edit' && !isPublicVisitor && (
          <section id={`room-panel-${currentRoom.id}`} role="tabpanel" aria-labelledby={`room-tab-${currentRoom.id}`}>
            {/* Desktop 2-column layout: Trái là Live Preview khung ngôi nhà, Phải là form chỉnh sửa. Mobile: Live Preview nằm trên. */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

              {/* CỘT TRÁI: KHUNG NGÔI NHÀ LIVE PREVIEW (Desktop: lg:col-span-5 sticky, Mobile: trên) */}
              <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
                <div className={`p-5 sm:p-6 rounded-3xl border ${themeStyle.card} bg-gradient-to-br from-black/85 via-black/70 to-black/90 backdrop-blur-2xl shadow-2xl relative overflow-hidden space-y-4 transition-all duration-300`}>
                  <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

                  {/* Header / Plaque Khung Ngôi Nhà */}
                  <div className="relative z-10 flex flex-col border-b border-white/10 pb-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-300 font-mono">
                          LIVE PREVIEW
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('preview')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 hover:bg-white text-white hover:text-dark-950 border border-white/20 text-[11px] font-bold transition-all cursor-pointer shadow-sm group"
                      >
                        <Eye className="w-3 h-3 text-amber-300 group-hover:text-dark-950 transition-colors" />
                        <span>Dạo xem</span>
                      </button>
                    </div>

                    {/* Architectural Frame Header */}
                    <div className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2 text-xs text-amber-300 font-serif">
                        <Home className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="font-bold">Khung Ngôi Nhà (5 Phòng)</span>
                      </div>
                      <span className="text-[11px] text-slate-300 font-medium">
                        {rooms.filter(r => (r.memories?.length || 0) > 0).length}/5 có ảnh
                      </span>
                    </div>

                    {/* Tên ngôi nhà & Theme */}
                    <div className="space-y-1 text-left pt-1">
                      <h3 className="font-serif text-lg sm:text-xl font-bold text-white tracking-wide transition-all line-clamp-1">
                        {houseTitle.trim() || 'Ngôi Nhà Kỷ Niệm Của Đôi Mình'}
                      </h3>
                      <p className="text-xs text-slate-400 font-light flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>Tông màu: <strong className={themeStyle.accent}>{themeStyle.name}</strong></span>
                        <span>·</span>
                        <span>Đã có ảnh: <strong className="text-white font-medium">{rooms.filter(r => (r.memories?.length || 0) > 0).length}/5 phòng</strong></span>
                      </p>
                    </div>
                  </div>

                  {/* 5 Rooms Architecture Grid (beginning, first, little-things, memories, next-chapter) */}
                  <div className="space-y-2 relative z-10">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>5 căn phòng (Nhấp phòng để sửa):</span>
                      <span className="text-amber-300/80 italic font-serif text-[10px]">Cập nhật tức thì ✦</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
                      {rooms.map((room, idx) => {
                        const isSelected = activeRoomIndex === idx;
                        const photoCount = room.memories?.length || 0;
                        const firstPhoto = photoCount > 0 ? room.memories[0].photo_url : null;

                        return (
                          <div
                            key={room.id}
                            onClick={() => setActiveRoomIndex(idx)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setActiveRoomIndex(idx); e.preventDefault(); } }}
                            className={`group relative rounded-2xl p-2.5 border transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden text-left ${
                              isSelected
                                ? 'bg-white/[0.09] border-amber-400 ring-2 ring-amber-400/30 shadow-lg scale-[1.01]'
                                : 'bg-black/40 border-white/10 hover:border-white/30 hover:bg-white/[0.04]'
                            }`}
                          >
                            {/* Room Header Badge */}
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isSelected
                                  ? 'bg-amber-400 text-dark-950'
                                  : 'bg-white/10 text-slate-300'
                              }`}>
                                Phòng {idx + 1}
                              </span>
                              {photoCount > 0 ? (
                                <span className="text-[10px] text-emerald-300 font-medium flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{photoCount} ảnh</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500 italic">Trống</span>
                              )}
                            </div>

                            {/* Thumbnail or Clean Empty State (NO fake placeholders) */}
                            <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden bg-white/5 border border-white/10 mb-1.5 flex items-center justify-center">
                              {firstPhoto ? (
                                <>
                                  <img
                                    src={firstPhoto}
                                    alt={room.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  />
                                  {photoCount > 1 && (
                                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-mono text-white border border-white/20">
                                      +{photoCount - 1}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-center p-2">
                                  <ImageIcon className="w-5 h-5 text-slate-600 mx-auto mb-1 group-hover:text-amber-300/60 transition-colors" />
                                  <span className="text-[9px] text-slate-500 block leading-tight">Chưa có ảnh</span>
                                </div>
                              )}
                            </div>

                            {/* Room Name */}
                            <p className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                              {room.name}
                            </p>

                            {/* Selected Indicator */}
                            {isSelected && (
                              <div className="mt-1 pt-1 border-t border-amber-400/30 flex items-center justify-between text-[10px] text-amber-300 font-semibold">
                                <span>✦ Đang sửa</span>
                                <Edit3 className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ghi chú phòng hiện tại */}
                  <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 text-xs space-y-1 relative z-10">
                    <div className="flex items-center justify-between text-[11px] text-amber-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Edit3 className="w-3 h-3 text-amber-400" />
                        <span>Ghi chú: {currentRoom.name}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Phòng {activeRoomIndex + 1}/5</span>
                    </div>
                    <p className="text-slate-300 italic line-clamp-3 text-[11px] leading-relaxed">
                      {currentRoom.note?.trim() ? `“${currentRoom.note}”` : 'Chưa có ghi chú cho căn phòng này.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: FORM CHỈNH SỬA (Settings + Room Editor + Bottom Actions) */}
              <div className="lg:col-span-7 space-y-6">
                {/* House Title & Theme Settings */}
                <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-xl space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Tên ngôi nhà của bạn</label>
                      <input
                        type="text"
                        value={houseTitle}
                        onChange={(e) => setHouseTitle(e.target.value)}
                        placeholder="Ví dụ: Tổ Ấm Của Minh & Thảo"
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-amber-400 focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Tông màu chủ đạo (Theme)</label>
                      <select
                        value={selectedTheme}
                        onChange={(e) => setSelectedTheme(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-dark-900 border border-white/10 text-white text-sm focus:border-amber-400 focus:outline-none transition-colors cursor-pointer"
                      >
                        {HOUSE_THEMES.map((themeKey) => (
                          <option key={themeKey} value={themeKey} className="bg-dark-950 text-white">
                            {THEME_STYLES[themeKey]?.name || themeKey}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Current Room Editor Card */}
                <div className="bg-black/40 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                    <div>
                      <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">Phòng {activeRoomIndex + 1} / 5</span>
                      <h2 className="text-2xl font-serif font-bold text-white mt-0.5">{currentRoom.name}</h2>
                      <p className="text-xs text-slate-400 mt-1">
                        {HOUSE_ROOMS_SPEC.find((s) => s.id === currentRoom.id)?.description}
                      </p>
                    </div>

                    {/* Upload Button */}
                    {(currentRoom.memories?.length || 0) < 10 && (
                      <label className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-dark-950 font-bold text-xs shadow-lg transition-all cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>{uploadingRoomId === currentRoom.id ? 'Đang tải...' : 'Thêm ảnh kỷ niệm'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={uploadingRoomId === currentRoom.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(currentRoom.id, file);
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {/* Room Note / Intro */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Ghi chú / Lời tựa cho căn phòng này ({currentRoom.note?.length || 0}/1500)
                    </label>
                    <textarea
                      rows={3}
                      value={currentRoom.note || ''}
                      onChange={(e) => handleUpdateRoomNote(currentRoom.id, e.target.value)}
                      placeholder="Viết vài dòng tâm sự dịu dàng cho căn phòng này..."
                      className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm focus:border-amber-400 focus:outline-none transition-colors resize-none"
                    />
                  </div>

                  {/* Polaroid Photo Cards Grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                      <span>Khoảnh khắc trong phòng ({currentRoom.memories?.length || 0}/10 ảnh)</span>
                    </div>

                    {(!currentRoom.memories || currentRoom.memories.length === 0) ? (
                      <div className="py-12 border border-dashed border-white/15 rounded-3xl text-center flex flex-col items-center justify-center">
                        <ImageIcon className="w-10 h-10 text-slate-600 mb-3" />
                        <p className="text-sm font-medium text-slate-400">Chưa có bức ảnh nào trong căn phòng này</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                          Hãy chọn một bức ảnh kỷ niệm gắn liền với giai đoạn này để lấp đầy căn phòng nhé.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {currentRoom.memories.map((mem, memIdx) => (
                          <div
                            key={mem.id || memIdx}
                            className={`${themeStyle.polaroidBg} rounded-2xl p-4 shadow-xl space-y-3 transition-transform hover:-translate-y-1 duration-300 relative group`}
                          >
                            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-200">
                              <img
                                src={mem.photo_url}
                                alt={mem.caption || `Kỷ niệm ${memIdx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => setLightboxPhoto(mem.photo_url)}
                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Phóng to ảnh"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Caption input */}
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={mem.caption || ''}
                                onChange={(e) => handleUpdateCaption(currentRoom.id, memIdx, e.target.value)}
                                placeholder="Ghi chú ngọt ngào..."
                                className="w-full px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/10 text-xs font-serif focus:border-amber-600 focus:outline-none"
                              />
                              <div className="flex items-center justify-between text-[10px] opacity-60 px-1">
                                <span>{mem.date || 'Khoảnh khắc'}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(currentRoom.id, memIdx)}
                                  className="text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                                >
                                  Xóa ảnh
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => handleSaveDraft()}
                    disabled={isSaving}
                    className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/15 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Đang lưu...' : 'Lưu bản nháp'}
                  </button>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm border border-white/10 transition-all cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Xem thử</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-dark-950 font-bold text-sm shadow-xl shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Globe className="w-4 h-4" />
                      <span>{isPublishing ? 'Đang xuất bản...' : isPublished ? 'Cập Nhật Xuất Bản' : 'Xuất Bản Ngôi Nhà'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: PREVIEW & PUBLIC TOUR (Dạo thăm 5 căn phòng)                   */}
        {/* ===================================================================== */}
        {activeTab === 'preview' && (
          <section aria-labelledby="house-tour-title" className="space-y-8 animate-fadeIn">
            {/* Room Header & Atmospheric Note */}
            <div className="text-center max-w-2xl mx-auto space-y-3 py-6">
              <span className={`text-xs uppercase tracking-widest font-bold ${themeStyle.accent}`}>
                Phòng {activeRoomIndex + 1} / 5
              </span>
              <h2 id="house-tour-title" className="text-3xl sm:text-4xl font-serif font-bold text-white">
                {currentRoom.name}
              </h2>
              {currentRoom.note ? (
                <p className="text-sm sm:text-base font-serif italic text-slate-300 leading-relaxed max-w-xl mx-auto pt-1">
                  "{currentRoom.note}"
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  {HOUSE_ROOMS_SPEC.find((s) => s.id === currentRoom.id)?.description}
                </p>
              )}
            </div>

            {/* Gallery of Polaroids */}
            {(!currentRoom.memories || currentRoom.memories.length === 0) ? (
              <div className="py-16 text-center border border-white/10 rounded-3xl bg-black/20">
                <Heart className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Căn phòng này chưa được bài trí kỷ niệm nào.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {currentRoom.memories.map((mem, idx) => (
                  <motion.div
                    key={mem.id || idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className={`${themeStyle.polaroidBg} rounded-2xl p-4 shadow-2xl space-y-3 cursor-pointer transform hover:scale-[1.02] hover:-rotate-1 transition-all duration-300`}
                    onClick={() => setLightboxPhoto(mem.photo_url)}
                  >
                    <div className="aspect-square w-full rounded-xl overflow-hidden bg-slate-200">
                      <img
                        src={mem.photo_url}
                        alt={mem.caption || `Kỷ niệm ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="pt-1 text-center">
                      <p className="text-sm font-serif italic font-medium leading-snug">
                        {mem.caption || 'Khoảnh khắc yêu thương'}
                      </p>
                      <p className="text-[10px] opacity-50 uppercase tracking-widest mt-1">
                        {mem.date || 'Emoria Memory'}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Room Navigation Stepper */}
            <div className="flex items-center justify-between gap-4 pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={() => setActiveRoomIndex((prev) => Math.max(0, prev - 1))}
                disabled={activeRoomIndex === 0}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs sm:text-sm font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Phòng trước</span>
              </button>

              <span className="text-xs font-semibold text-slate-400">
                {activeRoomIndex + 1} / {rooms.length}
              </span>

              <button
                type="button"
                onClick={() => setActiveRoomIndex((prev) => Math.min(rooms.length - 1, prev + 1))}
                disabled={activeRoomIndex === rooms.length - 1}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs sm:text-sm font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span>Phòng tiếp</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}

        {/* Lightbox Modal */}
        <AnimatePresence>
          {lightboxPhoto && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
              onClick={() => setLightboxPhoto(null)}
            >
              <button
                type="button"
                aria-label="Đóng ảnh phóng to"
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={lightboxPhoto}
                alt="Phóng to ảnh kỷ niệm"
                className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Revoke Share Confirmation Modal */}
        <AnimatePresence>
          {isRevokeModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md bg-dark-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Thu hồi liên kết chia sẻ cũ?</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Hệ thống sẽ cấp một liên kết chia sẻ hoàn toàn mới. Bất kỳ ai có liên kết cũ sẽ không thể xem ngôi nhà của bạn được nữa.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRevokeModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleRevokeShare}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg transition-colors cursor-pointer"
                  >
                    Xác nhận đổi link mới
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
