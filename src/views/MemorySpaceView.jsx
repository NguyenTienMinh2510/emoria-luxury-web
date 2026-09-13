import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SmartphoneNfc, Volume2, VolumeX, Play, Pause, Heart, Mail, 
  Share2, Lock, Unlock, Sparkles, Calendar, User, Eye, Send, 
  ChevronLeft, ChevronRight, CheckCircle2, ShieldCheck, Image as ImageIcon,
  Edit3, Key, Clock, AlertTriangle, Save, X
} from 'lucide-react';
import { 
  getAllShowcaseMemories, 
  getMemoryByTag, 
  verifyAccessPin, 
  addGuestbookMessage, 
  logNfcTap, 
  getTapStats,
  updateMemoryContent,
  updateMemoryAvailability 
} from '../services/memoryBackendService';
import { 
  getCurrentAuthSession, 
  canEditMemoryTag, 
  verifyAndLoginOwner, 
  ROLES 
} from '../services/authRoleService';

export default function MemorySpaceView({ initialTag = 'emoria-lumen', onNavigateToShop }) {
  const [currentTag, setCurrentTag] = useState(initialTag);
  const [memoryData, setMemoryData] = useState(null);
  const [allMemories, setAllMemories] = useState([]);
  
  // Auth Session State
  const [authSession, setAuthSession] = useState(getCurrentAuthSession());
  const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
  const [ownerKeyInput, setOwnerKeyInput] = useState('');
  const [ownerError, setOwnerError] = useState('');

  // Memory Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editQuote, setEditQuote] = useState('');
  const [editLetter, setEditLetter] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [editAudioTitle, setEditAudioTitle] = useState('');
  const [editAudioUrl, setEditAudioUrl] = useState('');
  const [editIsProtected, setEditIsProtected] = useState(false);
  const [editPinCode, setEditPinCode] = useState('');
  const [editSaveSuccess, setEditSaveSuccess] = useState(false);

  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [durationTime, setDurationTime] = useState('2:15');
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Security PIN State
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Letter Reveal State
  const [isLetterOpen, setIsLetterOpen] = useState(false);

  // Gallery Modal State
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [fullScreenImage, setFullScreenImage] = useState(null);

  // Guestbook Form State
  const [guestAuthor, setGuestAuthor] = useState('');
  const [guestRelation, setGuestRelation] = useState('Người thương');
  const [guestMessage, setGuestMessage] = useState('');
  const [guestSuccess, setGuestSuccess] = useState(false);

  // NFC Tap Stats
  const [tapStats, setTapStats] = useState({ tapCount: 1, lastTappedAt: new Date().toISOString() });

  // Load all showcase memories
  useEffect(() => {
    const list = getAllShowcaseMemories();
    setAllMemories(list);
  }, []);

  // When tag changes, fetch memory details & check security
  useEffect(() => {
    const mem = getMemoryByTag(currentTag);
    if (mem) {
      setMemoryData(mem);
      const stats = logNfcTap(currentTag);
      setTapStats(stats);

      // Check PIN lock
      if (mem.isProtected) {
        setIsLocked(true);
        setPinInput('');
        setPinError('');
      } else {
        setIsLocked(false);
      }
      setIsLetterOpen(false);
      setIsPlaying(false);
      setAudioProgress(0);
      setActiveMediaIndex(0);

      // Populate editor initial values
      setEditTitle(mem.title || '');
      setEditQuote(mem.quote || '');
      setEditLetter(mem.letter || '');
      setEditRecipient(mem.recipient || '');
      setEditAudioTitle(mem.audioTitle || '');
      setEditAudioUrl(mem.audioUrl || '');
      setEditIsProtected(Boolean(mem.isProtected));
      setEditPinCode(mem.pinCode || '');
    }
  }, [currentTag]);

  // Check editing privileges
  const hasEditPermission = canEditMemoryTag(currentTag);

  // Audio Play / Pause handler
  const togglePlayAudio = () => {
    if (!audioRef.current && memoryData?.audioUrl) {
      audioRef.current = new Audio(memoryData.audioUrl);
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setAudioProgress(0);
        clearInterval(progressIntervalRef.current);
      };
    }

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      clearInterval(progressIntervalRef.current);
    } else {
      audioRef.current?.play().then(() => {
        setIsPlaying(true);
        progressIntervalRef.current = setInterval(() => {
          if (audioRef.current) {
            const current = audioRef.current.currentTime;
            const dur = audioRef.current.duration || 135;
            setAudioProgress((current / dur) * 100);
            
            const mins = Math.floor(current / 60);
            const secs = Math.floor(current % 60);
            setCurrentTime(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
          }
        }, 300);
      }).catch(err => {
        console.warn('Audio playback prevented by browser auto-play policy:', err);
      });
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [currentTag]);

  // Unlock PIN handler
  const handleUnlockPin = (e) => {
    e.preventDefault();
    setPinError('');
    const result = verifyAccessPin(currentTag, pinInput);
    if (result.success) {
      setIsLocked(false);
    } else {
      setPinError(result.message);
    }
  };

  // Submit Guestbook message
  const handleSendGuestbook = (e) => {
    e.preventDefault();
    if (!guestAuthor.trim() || !guestMessage.trim()) return;

    try {
      addGuestbookMessage(currentTag, {
        author: guestAuthor,
        relationship: guestRelation,
        message: guestMessage,
      });
      const updated = getMemoryByTag(currentTag);
      setMemoryData(updated);
      setGuestAuthor('');
      setGuestMessage('');
      setGuestSuccess(true);
      setTimeout(() => setGuestSuccess(false), 4000);
    } catch (err) {
      alert(err.message);
    }
  };

  // Owner Authentication
  const handleVerifyOwner = (e) => {
    e.preventDefault();
    setOwnerError('');
    try {
      const newSession = verifyAndLoginOwner(currentTag, ownerKeyInput);
      setAuthSession(newSession);
      setIsOwnerModalOpen(false);
      setIsEditorOpen(true);
      setOwnerKeyInput('');
    } catch (err) {
      setOwnerError(err.message);
    }
  };

  // Save Editor changes
  const handleSaveEditor = (e) => {
    e.preventDefault();
    try {
      const result = updateMemoryContent(currentTag, {
        title: editTitle,
        quote: editQuote,
        letter: editLetter,
        recipient: editRecipient,
        audioTitle: editAudioTitle,
        audioUrl: editAudioUrl,
        isProtected: editIsProtected,
        pinCode: editPinCode,
      });
      setMemoryData(result.memory);
      setEditSaveSuccess(true);
      setTimeout(() => {
        setEditSaveSuccess(false);
        setIsEditorOpen(false);
      }, 1200);
    } catch (err) {
      alert(err.message);
    }
  };

  if (!memoryData) {
    return (
      <div className="w-full min-h-screen bg-dark-950 flex items-center justify-center text-slate-300">
        <Sparkles className="w-6 h-6 animate-spin text-white mr-2" />
        <span>Đang kết nối vi chip kỷ niệm NFC...</span>
      </div>
    );
  }

  // Check Availability Status
  const isTimedLock = memoryData.availability?.status === 'timed_lock';
  const isSuspended = memoryData.availability?.status === 'suspended';

  return (
    <div className="w-full min-h-screen bg-dark-950 text-slate-100 pt-24 pb-24 selection:bg-white/20">
      
      {/* 1. Header Toolbar: Tag Switcher, Role Indicator & Owner Studio Button */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-silver-glow animate-pulse">
              <SmartphoneNfc className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <span>EMORIA MEMORY VAULT</span>
                {authSession.role === ROLES.ADMIN && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-red-500/20 text-red-300 border border-red-500/30">ADMIN</span>
                )}
                {hasEditPermission && authSession.role !== ROLES.ADMIN && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">CHỦ SỞ HỮU</span>
                )}
              </p>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>{memoryData.jewelryName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/10">
                  Tag #{memoryData.tagUid}
                </span>
              </h2>
            </div>
          </div>

          {/* Right Actions: Quick Switch & Owner Studio Button */}
          <div className="flex items-center gap-2">
            <select
              value={currentTag}
              onChange={(e) => setCurrentTag(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl bg-black/60 border border-white/20 text-slate-200 focus:outline-none focus:border-white/50 cursor-pointer"
            >
              {allMemories.map((m) => (
                <option key={m.tagUid} value={m.tagUid}>
                  {m.title} ({m.tagUid})
                </option>
              ))}
            </select>

            {/* Owner Edit Button */}
            {hasEditPermission ? (
              <button
                onClick={() => setIsEditorOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Chỉnh Sửa (Owner Studio)</span>
              </button>
            ) : (
              <button
                onClick={() => setIsOwnerModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white text-white hover:text-dark-950 border border-white/20 text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                title="Đăng nhập dành cho chủ nhân chiếc trang sức"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Quyền Chủ Nhân</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* 2. TIMED LOCK AVAILABILITY GATE (Niêm phong hẹn giờ) */}
      {isTimedLock && !hasEditPermission ? (
        <div className="max-w-lg mx-auto px-4 my-16 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 sm:p-10 rounded-3xl bg-white/[0.04] border border-white/15 backdrop-blur-2xl shadow-2xl relative overflow-hidden"
          >
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 text-amber-300">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>

            <h3 className="font-serif text-2xl font-bold text-white mb-2 uppercase">
              Kỷ Vật Đang Được Niêm Phong
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
              Người tặng đã cài đặt chế độ hẹn giờ mở niêm phong cho chiếc trang sức này. Thời khắc cảm xúc sẽ chính thức mở ra vào:
            </p>

            <div className="p-4 rounded-2xl bg-black/60 border border-amber-500/30 text-amber-300 font-mono text-sm sm:text-base font-bold mb-6">
              ✦ 18:00 — Ngày 20 Tháng 10 Năm 2026 ✦
            </div>

            <p className="text-xs text-slate-400 italic mb-6">
              “Một món quà bất ngờ luôn đáng để chờ đợi từng giây phút.”
            </p>

            <button
              onClick={() => setIsOwnerModalOpen(true)}
              className="text-xs text-slate-300 hover:text-white underline underline-offset-4 cursor-pointer"
            >
              Bạn là chủ nhân muốn mở niêm phong sớm? Nhập mã Secret Key
            </button>
          </motion.div>
        </div>
      ) : isSuspended && !hasEditPermission ? (
        /* 3. SUSPENDED GATE */
        <div className="max-w-md mx-auto px-4 my-16 text-center">
          <div className="p-8 rounded-3xl bg-white/[0.04] border border-white/15 backdrop-blur-2xl">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h3 className="font-serif text-xl font-bold text-white mb-2">Kỷ Niệm Tạm Thời Bị Khóa</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Kỷ vật này hiện đang được chủ sở hữu chuyển sang chế độ lưu trữ riêng tư.
            </p>
            <button
              onClick={() => setIsOwnerModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase"
            >
              Xác thực quyền chủ nhân
            </button>
          </div>
        </div>
      ) : isLocked ? (
        /* 4. PIN SECURITY SCREEN (If Protected) */
        <div className="max-w-md mx-auto px-4 my-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 rounded-3xl bg-white/[0.04] border border-white/15 backdrop-blur-2xl text-center shadow-2xl relative overflow-hidden"
          >
            <div className="w-16 h-16 rounded-full bg-white/10 border border-white/30 flex items-center justify-center mx-auto mb-4 text-white shadow-silver-glow">
              <Lock className="w-8 h-8 stroke-1" />
            </div>

            <h3 className="font-serif text-2xl font-bold text-white mb-2 uppercase">
              Kỷ Niệm Được Khóa Bảo Mật
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Không gian kỷ niệm này được cài đặt mã PIN bảo vệ riêng tư giữa hai người. Vui lòng nhập mã để giải mã chip NFC.
            </p>

            <form onSubmit={handleUnlockPin} className="space-y-4">
              <input
                type="password"
                maxLength={6}
                placeholder="Nhập mã PIN (Gợi ý: 1000)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full text-center text-xl tracking-[0.4em] px-4 py-3 rounded-xl bg-black/60 border border-white/25 text-white placeholder-slate-500 focus:outline-none focus:border-white/60 font-mono"
              />

              {pinError && (
                <p className="text-xs text-red-400">{pinError}</p>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-silver-glow"
              >
                <Unlock className="w-4 h-4" />
                <span>Mở Khóa Kỷ Niệm</span>
              </button>
            </form>
          </motion.div>
        </div>
      ) : (
        /* 5. MAIN MEMORY SPACE (Unlocked) */
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-10">
          
          {/* A. Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-white/[0.06] via-white/[0.02] to-transparent border border-white/15 backdrop-blur-2xl text-center relative overflow-hidden shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                <Calendar className="w-3.5 h-3.5" />
                <span>Kỷ niệm: {memoryData.date}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                <Eye className="w-3.5 h-3.5" />
                <span>Đã chạm {tapStats.tapCount || 1} lần</span>
              </span>
              {isTimedLock && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Chế độ hẹn giờ (Đang mở cho Chủ sở hữu)</span>
                </span>
              )}
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-metallic tracking-tight uppercase mb-4 leading-tight">
              {memoryData.title}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 font-light mb-6 flex items-center justify-center gap-2">
              <span>Từ: <strong className="text-white font-medium">{memoryData.author}</strong></span>
              <span>✦</span>
              <span>Gửi đến: <strong className="text-white font-medium">{memoryData.recipient || 'Người thương'}</strong></span>
            </p>

            <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-black/40 border border-white/10 italic text-slate-200 text-sm sm:text-base leading-relaxed relative">
              <span className="text-3xl text-white/30 font-serif absolute -top-3 left-4">“</span>
              <p className="px-3">{memoryData.quote}</p>
              <span className="text-3xl text-white/30 font-serif absolute -bottom-4 right-4">”</span>
            </div>
          </motion.div>

          {/* B. Audio Player */}
          {memoryData.audioUrl && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-white" />
                    <span>Bản Ghi Âm Thanh Kỷ Niệm</span>
                  </p>
                  <h3 className="text-base font-bold text-white mt-1">
                    {memoryData.audioTitle || 'Giai Điệu & Lời Thì Thầm'}
                  </h3>
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  {currentTime} / {memoryData.audioDuration || durationTime}
                </div>
              </div>

              <div className="flex items-center gap-1 h-12 my-4 px-2 bg-black/30 rounded-xl overflow-hidden">
                {Array.from({ length: 48 }).map((_, idx) => {
                  const isActive = (idx / 48) * 100 <= audioProgress;
                  const baseHeight = Math.sin(idx * 0.4) * 50 + 50;
                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-full transition-all duration-200 ${
                        isActive ? 'bg-white shadow-silver-glow' : 'bg-white/20'
                      }`}
                      style={{
                        height: isPlaying ? `${Math.max(15, (baseHeight * (isPlaying ? 0.9 : 0.5)))}%` : '20%',
                      }}
                    />
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={togglePlayAudio}
                  className="px-5 py-2.5 rounded-full bg-white text-dark-950 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-2 cursor-pointer shadow-silver-glow"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      <span>Tạm Dừng</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Lắng Nghe</span>
                    </>
                  )}
                </button>

                <p className="text-xs text-slate-400 italic">
                  Chạm vi chip NFC trên trang sức để phát trực tiếp
                </p>
              </div>
            </div>
          )}

          {/* C. Hand-written Secret Letter */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-white" />
                <h3 className="text-base font-bold text-white uppercase font-serif">
                  Bức Thư Tay Mật Mã
                </h3>
              </div>

              <button
                onClick={() => setIsLetterOpen(!isLetterOpen)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white text-white hover:text-dark-950 border border-white/20 transition-all cursor-pointer"
              >
                {isLetterOpen ? 'Gấp Thư Lại' : 'Mở Niêm Phong'}
              </button>
            </div>

            <AnimatePresence>
              {isLetterOpen ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 sm:p-8 rounded-2xl bg-black/60 border border-white/15 text-slate-200 font-serif text-sm sm:text-base leading-relaxed whitespace-pre-line shadow-inner">
                    {memoryData.letter}
                    <div className="mt-8 pt-4 border-t border-white/10 text-right text-xs italic font-sans text-slate-400">
                      — {memoryData.author}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div 
                  onClick={() => setIsLetterOpen(true)}
                  className="py-10 border border-dashed border-white/20 rounded-2xl text-center cursor-pointer hover:border-white/50 transition-colors bg-black/20"
                >
                  <Mail className="w-8 h-8 text-white/50 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-white">Lá thư tay đang được niêm phong mật</p>
                  <p className="text-xs text-slate-400 mt-1">Bấm vào đây để mở đọc những dòng tâm sự vĩnh cửu</p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* D. Photo Gallery */}
          {memoryData.mediaGallery && memoryData.mediaGallery.length > 0 && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-white" />
                  <h3 className="text-base font-bold text-white uppercase font-serif">
                    Khoảnh Khắc Kỷ Niệm ({memoryData.mediaGallery.length})
                  </h3>
                </div>
                <p className="text-xs text-slate-400">Độ phân giải siêu nét HD</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {memoryData.mediaGallery.map((media, idx) => (
                  <div
                    key={media.id || idx}
                    onClick={() => setFullScreenImage(media)}
                    className="group relative aspect-4/3 rounded-2xl overflow-hidden bg-black/50 border border-white/15 cursor-pointer hover:border-white/50 transition-all"
                  >
                    <img
                      src={media.url}
                      alt={media.caption}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                      <p className="text-[11px] text-white line-clamp-2">{media.caption}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* E. Guestbook */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
            <h3 className="text-base font-bold text-white uppercase font-serif mb-2 flex items-center gap-2">
              <Heart className="w-4 h-4 text-white fill-current" />
              <span>Sổ Lưu Niệm & Lời Chúc Gửi Tới Kỷ Vật</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Mỗi lời nhắn gửi tại đây sẽ được lưu trữ vĩnh viễn trong kho dữ liệu gắn với chip NFC này.
            </p>

            <div className="space-y-3 mb-6">
              {memoryData.guestbook?.map((entry) => (
                <div key={entry.id} className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white">
                      {entry.author} <span className="text-slate-400 font-normal">({entry.relationship})</span>
                    </span>
                    <span className="text-[10px] text-slate-500">{entry.createdAt}</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{entry.message}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendGuestbook} className="p-4 rounded-2xl bg-black/50 border border-white/15 space-y-3">
              <p className="text-xs font-semibold text-white">Gửi thêm lời chúc mới:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Tên của bạn..."
                  value={guestAuthor}
                  onChange={(e) => setGuestAuthor(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-xs text-white focus:outline-none"
                  required
                />
                <select
                  value={guestRelation}
                  onChange={(e) => setGuestRelation(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-xs text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="Người thương">Người thương</option>
                  <option value="Bạn thân">Bạn thân</option>
                  <option value="Gia đình">Gia đình</option>
                  <option value="Người tri kỷ">Người tri kỷ</option>
                </select>
              </div>

              <textarea
                placeholder="Viết lời nhắn gửi hoặc lời chúc yêu thương tại đây..."
                rows={3}
                value={guestMessage}
                onChange={(e) => setGuestMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-xs text-white focus:outline-none"
                required
              />

              <div className="flex items-center justify-between pt-1">
                {guestSuccess ? (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Đã lưu lời chúc vào chip thành công!</span>
                  </span>
                ) : <span />}

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-white text-dark-950 text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Lưu Lời Nhắn</span>
                </button>
              </div>
            </form>
          </div>

          {onNavigateToShop && (
            <div className="text-center pt-6">
              <button
                onClick={onNavigateToShop}
                className="px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/15 text-xs font-semibold tracking-wider uppercase transition-all"
              >
                ← Quay lại Cửa Hàng Trang Sức
              </button>
            </div>
          )}

        </div>
      )}

      {/* MODAL 1: OWNER SECRET KEY LOGIN MODAL */}
      {isOwnerModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setIsOwnerModalOpen(false)}
        >
          <div 
            className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/20 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base uppercase">Xác Thực Chủ Sở Hữu Kỷ Vật</h3>
              </div>
              <button onClick={() => setIsOwnerModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Nhập mã khóa bí mật (Owner Secret Key) in trên thẻ bảo hành kim loại Emoria đi kèm chiếc trang sức để kích hoạt quyền chỉnh sửa.
            </p>

            <form onSubmit={handleVerifyOwner} className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Mã Khóa Bí Mật (Gợi ý: {memoryData.ownerSecret || '1000'}):</label>
                <input
                  type="text"
                  placeholder="Ví dụ: OWNER-LUMEN-2025 hoặc PIN"
                  value={ownerKeyInput}
                  onChange={(e) => setOwnerKeyInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono focus:outline-none focus:border-white/50 uppercase"
                />
              </div>

              {ownerError && <p className="text-xs text-red-400">{ownerError}</p>}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase hover:bg-slate-200 transition-all cursor-pointer"
              >
                Mở Studio Chỉnh Sửa
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OWNER MEMORY STUDIO (EDITOR) */}
      {isEditorOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsEditorOpen(false)}
        >
          <div 
            className="w-full max-w-2xl my-8 p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/25 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-bold text-white text-lg uppercase font-serif">Studio Chỉnh Sửa Kỷ Vật</h3>
                  <p className="text-xs text-slate-400">Quyền Chủ Sở Hữu Chip #{memoryData.tagUid}</p>
                </div>
              </div>
              <button onClick={() => setIsEditorOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditor} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Tiêu đề kỷ niệm:</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Người nhận kỷ vật:</label>
                <input
                  type="text"
                  value={editRecipient}
                  onChange={(e) => setEditRecipient(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Câu trích dẫn ngắn (Golden Quote):</label>
                <input
                  type="text"
                  value={editQuote}
                  onChange={(e) => setEditQuote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Nội dung bức thư tay tâm sự:</label>
                <textarea
                  rows={6}
                  value={editLetter}
                  onChange={(e) => setEditLetter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Tên bản thu âm / bài hát:</label>
                  <input
                    type="text"
                    value={editAudioTitle}
                    onChange={(e) => setEditAudioTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Link âm thanh (MP3 / Audio URL):</label>
                  <input
                    type="text"
                    value={editAudioUrl}
                    onChange={(e) => setEditAudioUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Security PIN toggle */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">Khóa Mã PIN Bảo Mật Cá Nhân</p>
                    <p className="text-[11px] text-slate-400">Yêu cầu người xem phải nhập đúng mã PIN mới được giải mã.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editIsProtected}
                    onChange={(e) => setEditIsProtected(e.target.checked)}
                    className="w-5 h-5 rounded cursor-pointer accent-white"
                  />
                </div>

                {editIsProtected && (
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Cài đặt Mã PIN (4-6 số):</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={editPinCode}
                      onChange={(e) => setEditPinCode(e.target.value)}
                      placeholder="Ví dụ: 1000"
                      className="w-40 px-3 py-1.5 rounded-xl bg-black/80 border border-white/30 text-white font-mono text-center tracking-widest text-sm focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {editSaveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đã lưu thành công mọi thay đổi vào chip NFC!</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-slate-300 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-white text-dark-950 font-bold uppercase tracking-wider hover:bg-slate-200 cursor-pointer shadow-silver-glow"
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview */}
      {fullScreenImage && (
        <div
          onClick={() => setFullScreenImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={fullScreenImage.url}
              alt={fullScreenImage.caption}
              className="max-h-[80vh] w-auto object-contain rounded-2xl border border-white/20 shadow-2xl"
            />
            <p className="text-xs sm:text-sm text-slate-200 mt-4 text-center font-light">
              {fullScreenImage.caption}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
