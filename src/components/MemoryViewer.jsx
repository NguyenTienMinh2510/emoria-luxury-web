import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  SmartphoneNfc,
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  Pause,
  Volume2,
  Trash2,
  Save,
  CheckCircle2,
  Copy,
  Share2,
  X,
  Edit3,
  Calendar,
  User,
  ShieldCheck,
  Plus,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { getMemoryByTag, updateMemory } from '../services/nfcService';
import { uploadMedia } from '../services/storageService';
import { supabase } from '../lib/supabaseClient';

export default function MemoryViewer({ tagUid: propTag, token: propToken, onClose, currentUser }) {
  // Read params from URL query or props
  const [tagUid, setTagUid] = useState(propTag || 'emoria-lumen');
  const [token, setToken] = useState(propToken || null);
  
  const [memory, setMemory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editQuote, setEditQuote] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editMediaList, setEditMediaList] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const fileInputRef = useRef(null);

  // Audio simulation
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Selected media for lightbox preview
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Read URL query params if present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlTag = urlParams.get('tag') || urlParams.get('memory') || propTag;
    const urlToken = urlParams.get('token') || propToken;

    if (urlTag) setTagUid(urlTag);
    if (urlToken) setToken(urlToken);
  }, [propTag, propToken]);

  // Load memory data
  useEffect(() => {
    let isMounted = true;
    async function fetchMemory() {
      setLoading(true);
      setError(null);
      try {
        const res = await getMemoryByTag(tagUid, token);
        if (isMounted) {
          setMemory(res.data);
          setEditTitle(res.data.title || '');
          setEditQuote(res.data.quote || '');
          setEditMessage(res.data.message || '');
          setEditMediaList(res.data.mediaUrls || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Không thể tải dữ liệu ký ức NFC.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (tagUid) {
      fetchMemory();
    }
    return () => {
      isMounted = false;
    };
  }, [tagUid, token]);

  // Handle file upload
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgressText(`Đang tải lên ${files.length} tệp lên emoria-media...`);

    try {
      const uploadPromises = files.map(async (file) => {
        const res = await uploadMedia(file, `memories/${tagUid}`);
        return {
          url: res.publicUrl,
          type: res.fileType,
          caption: file.name.replace(/\.[^/.]+$/, ''),
        };
      });

      const uploadedResults = await Promise.all(uploadPromises);
      const updatedList = [...editMediaList, ...uploadedResults];
      setEditMediaList(updatedList);

      // Auto save
      await updateMemory(tagUid, {
        title: editTitle,
        quote: editQuote,
        message: editMessage,
        mediaUrls: updatedList,
      });

      setMemory((prev) => ({ ...prev, mediaUrls: updatedList }));

      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#ffffff', '#cbd5e1', '#94a3b8'],
      });
    } catch (err) {
      alert(err.message || 'Tải tệp lên thất bại');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove media item
  const handleRemoveMedia = (indexToRemove) => {
    const updated = editMediaList.filter((_, idx) => idx !== indexToRemove);
    setEditMediaList(updated);
  };

  // Save changes
  const handleSaveMemory = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);

    try {
      const res = await updateMemory(tagUid, {
        title: editTitle,
        quote: editQuote,
        message: editMessage,
        mediaUrls: editMediaList,
      });

      setMemory(res.data);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);

      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ffffff', '#cbd5e1', '#94a3b8', '#38bdf8'],
      });
    } catch (err) {
      alert(err.message || 'Lỗi lưu thông tin kỷ niệm.');
    } finally {
      setIsSaving(false);
    }
  };

  // Copy shareable link
  const handleCopyShareLink = () => {
    const origin = window.location.origin;
    const shareUrl = `${origin}?tag=${encodeURIComponent(tagUid)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/90 backdrop-blur-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 border-3 border-slate-200 border-t-transparent rounded-full animate-spin shadow-silver-glow" />
          <div className="space-y-1">
            <h3 className="font-serif text-lg font-bold text-metallic">Đang Giải Mã Chip NFC S925</h3>
            <p className="text-xs text-slate-400">Đang đồng bộ hóa Memory Space từ Supabase...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !memory) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/90 backdrop-blur-2xl">
        <div className="max-w-md w-full rounded-3xl glass-panel p-6 border border-white/20 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 text-red-400 flex items-center justify-center">
            <X className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Không tìm thấy Kỷ niệm NFC</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{error || 'Mã chip không tồn tại hoặc đã bị thu hồi quyền truy cập.'}</p>
          <button
            onClick={onClose || (() => window.history.replaceState({}, '', window.location.pathname))}
            className="px-6 py-2.5 rounded-full bg-white text-dark-950 font-bold text-xs"
          >
            Quay lại trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-dark-950/90 backdrop-blur-2xl overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: "spring", damping: 25 }}
        className="relative w-full max-w-4xl my-auto rounded-3xl glass-panel p-5 sm:p-8 md:p-10 border border-white/20 shadow-2xl bg-dark-900/95 overflow-hidden text-slate-100"
      >
        {/* Background Ambient Glows */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-slate-400/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Actions */}
        <div className="flex items-center justify-between pb-5 mb-6 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-slate-200 shadow-inner">
              <SmartphoneNfc className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-[0.2em] font-bold text-slate-400 uppercase">
                  EMORIA Memory Space
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold flex items-center gap-1 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> NFC S925 Verified
                </span>
              </div>
              <h2 className="text-base sm:text-xl font-serif font-bold text-metallic">
                Mã Định Danh: #{memory.tagUid.toUpperCase()}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Share Link Button */}
            <button
              onClick={handleCopyShareLink}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="Sao chép liên kết chạm NFC"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline text-emerald-400">Đã sao chép</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Chia sẻ</span>
                </>
              )}
            </button>

            {/* Toggle Edit Button */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-medium ${
                isEditing
                  ? 'bg-white text-dark-950 border-white font-bold'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">{isEditing ? 'Hủy chỉnh sửa' : 'Chỉnh sửa'}</span>
            </button>

            {/* Close Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-colors"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* EDIT MODE VIEW */}
        {isEditing ? (
          <form onSubmit={handleSaveMemory} className="space-y-6 relative z-10">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-slate-300" />
                Chỉnh Sửa Nội Dung Kỷ Niệm
              </h3>

              <div className="space-y-1">
                <label htmlFor="memory-title" className="text-xs font-medium text-slate-300">Tiêu đề kỷ niệm</label>
                <input
                  id="memory-title"
                  name="title"
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Ví dụ: Lời Hẹn Ước Dưới Hoàng Hôn"
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm text-white"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="memory-quote" className="text-xs font-medium text-slate-300">Câu trích dẫn ngắn (Quote)</label>
                <input
                  id="memory-quote"
                  name="quote"
                  type="text"
                  value={editQuote}
                  onChange={(e) => setEditQuote(e.target.value)}
                  placeholder="Ví dụ: Mỗi khoảnh khắc bên em đều là một món quà..."
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm text-white italic"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="memory-message" className="text-xs font-medium text-slate-300">Thư gửi bí mật / Thông điệp đầy đủ</label>
                <textarea
                  id="memory-message"
                  name="message"
                  rows={4}
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  placeholder="Viết lời nhắn gửi trân quý đến người nhận..."
                  className="w-full p-4 rounded-xl glass-input text-sm text-white leading-relaxed resize-none"
                />
              </div>
            </div>

            {/* Media Upload & Manager */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-slate-300" />
                    Bộ Sưu Tập Ảnh &amp; Video (Supabase Storage)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Lưu trữ vào bucket <code className="text-slate-200 font-mono">emoria-media</code> (Ảnh &lt;15MB, Video &lt;50MB)
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-colors flex items-center gap-2 shadow-silver-glow"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{uploadProgressText || 'Đang tải...'}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Ảnh / Video</span>
                    </>
                  )}
                </button>
                <input
                  id="memory-file-input"
                  name="mediaFiles"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {/* Media Previews in Edit Mode */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                {editMediaList.map((item, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-xl overflow-hidden border border-white/15 bg-black/40 aspect-square flex items-center justify-center"
                  >
                    {item.type === 'video' ? (
                      <video src={item.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={item.url} alt={item.caption || 'Memory media'} className="w-full h-full object-cover" />
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveMedia(idx)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      title="Xóa tệp này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-[10px] text-white backdrop-blur-sm">
                      {item.type === 'video' ? 'Video' : 'Ảnh'}
                    </span>
                  </div>
                ))}

                {editMediaList.length === 0 && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="col-span-full py-8 border-2 border-dashed border-white/15 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-white/40 transition-colors"
                  >
                    <Upload className="w-8 h-8 text-slate-500 mb-2" />
                    <p className="text-xs font-medium text-slate-300">Chưa có ảnh/video nào</p>
                    <p className="text-[11px] text-slate-500">Nhấn vào đây để tải lên ảnh hoặc video kỷ niệm</p>
                  </div>
                )}
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-slate-200 via-white to-slate-300 text-dark-950 font-bold text-xs flex items-center gap-2 shadow-silver-glow hover:brightness-110 active:scale-95 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang lưu vào Supabase...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Lưu Kỷ Niệm Mới</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* READ-ONLY DISPLAY VIEW (Dark Luxury) */
          <div className="space-y-8 relative z-10">
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Kỷ niệm đã được cập nhật thành công lên Supabase Cloud!</span>
              </motion.div>
            )}

            {/* Main Title & Metadata */}
            <div className="text-center space-y-2">
              <h1 className="text-2xl sm:text-4xl font-serif font-bold text-metallic tracking-wide">
                {memory.title}
              </h1>
              <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> {memory.date}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" /> {memory.author}
                </span>
              </div>
            </div>

            {/* Quote Card */}
            {memory.quote && (
              <div className="relative p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-white/[0.06] via-white/[0.02] to-white/[0.06] border border-white/15 text-center shadow-inner">
                <span className="text-2xl text-slate-400 font-serif leading-none opacity-40">“</span>
                <p className="text-sm sm:text-base font-sans font-medium text-slate-200 italic leading-relaxed px-4">
                  {memory.quote}
                </p>
                <span className="text-2xl text-slate-400 font-serif leading-none opacity-40">”</span>
              </div>
            )}

            {/* Media Gallery */}
            {memory.mediaUrls && memory.mediaUrls.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    Kho Báu Kỷ Niệm ({memory.mediaUrls.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">Chạm để xem kích thước đầy đủ</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                  {memory.mediaUrls.map((item, idx) => (
                    <motion.div
                      key={idx}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedMedia(item)}
                      className="relative rounded-2xl overflow-hidden border border-white/15 shadow-lg bg-dark-950 aspect-square cursor-pointer group"
                    >
                      {item.type === 'video' ? (
                        <>
                          <video src={item.url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-white/80 text-dark-950 flex items-center justify-center shadow-lg">
                              <Play className="w-4 h-4 ml-0.5" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <img
                          src={item.url}
                          alt={item.caption || 'Kỷ niệm'}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      )}

                      {/* Hover Overlay with caption */}
                      <div className="absolute inset-0 bg-gradient-to-t from-dark-950/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                        <p className="text-xs font-semibold text-white truncate">{item.caption || 'Kỷ niệm quý giá'}</p>
                        <span className="text-[10px] text-slate-400 capitalize">{item.type}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Secret Message / Letter */}
            {memory.message && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Thông Điệp Gửi Trao
                </h3>
                <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.04] border border-white/10 text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-sans">
                  {memory.message}
                </div>
              </div>
            )}

            {/* Audio Voice Memo Player */}
            {memory.audioName && (
              <div className="p-4 sm:p-5 rounded-2xl bg-dark-950/80 border border-white/15 flex items-center justify-between shadow-silver-glow">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                    className="w-11 h-11 rounded-full bg-white text-dark-950 flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
                  >
                    {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-white">{memory.audioName}</h4>
                    <p className="text-xs text-slate-400">
                      {isPlayingAudio ? 'Đang phát giọng nói lưu giữ...' : `${memory.audioDuration || '0:45'} • Voice Note`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Wave simulation */}
                  <div className="hidden sm:flex items-center gap-1">
                    {[16, 28, 12, 32, 20, 36, 14, 24].map((h, i) => (
                      <span
                        key={i}
                        style={{ height: isPlayingAudio ? `${h}px` : '6px' }}
                        className="w-1 rounded-full bg-slate-300 transition-all duration-300"
                      />
                    ))}
                  </div>
                  <Volume2 className={`w-5 h-5 ${isPlayingAudio ? 'text-white animate-pulse' : 'text-slate-500'}`} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Lightbox for single media */}
        <AnimatePresence>
          {selectedMedia && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl"
              onClick={() => setSelectedMedia(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative max-w-4xl max-h-[85vh] rounded-2xl overflow-hidden border border-white/20 bg-dark-950"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setSelectedMedia(null)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black transition-colors z-20"
                >
                  <X className="w-5 h-5" />
                </button>

                {selectedMedia.type === 'video' ? (
                  <video src={selectedMedia.url} controls autoPlay className="max-h-[80vh] w-auto mx-auto" />
                ) : (
                  <img
                    src={selectedMedia.url}
                    alt={selectedMedia.caption || 'Kỷ niệm'}
                    className="max-h-[80vh] w-auto object-contain mx-auto"
                  />
                )}

                {selectedMedia.caption && (
                  <div className="p-4 bg-dark-900 border-t border-white/10 text-center text-xs text-slate-300">
                    {selectedMedia.caption}
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
