import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SmartphoneNfc, Volume2, VolumeX, Play, Pause, Heart, Mail, 
  Share2, Lock, Unlock, Sparkles, Calendar, User, Eye, Send, 
  ChevronLeft, ChevronRight, CheckCircle2, ShieldCheck, Image as ImageIcon,
  Edit3, Key, Clock, AlertTriangle, Save, X, Loader2
} from 'lucide-react';
import { 
  fetchMemoryView, 
  verifyMemoryPin, 
  claimNfcOwnership, 
  updateMemorySpace, 
  submitGuestbookEntry, 
  getShowcaseMemoriesList 
} from '../services/memoryService';

export default function MemorySpaceView({ initialTag = 'emoria-lumen', onNavigateToShop, currentUser }) {
  const [currentTag, setCurrentTag] = useState(initialTag);
  const [memoryData, setMemoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [allMemories, setAllMemories] = useState([]);

  // PIN Unlock State
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Claim Ownership Modal State
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimCodeInput, setClaimCodeInput] = useState('');
  const [claimError, setClaimError] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  // Studio Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editQuote, setEditQuote] = useState('');
  const [editLetter, setEditLetter] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [editAudioTitle, setEditAudioTitle] = useState('');
  const [editAudioUrl, setEditAudioUrl] = useState('');
  // 3 Hành động PIN rõ ràng: 'KEEP' | 'SET' | 'REMOVE' (Tránh xóa nhầm PIN khi update title)
  const [pinAction, setPinAction] = useState('KEEP');
  const [newPinCode, setNewPinCode] = useState('');
  const [isSavingEditor, setIsSavingEditor] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [durationTime, setDurationTime] = useState('2:15');
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Letter Reveal State
  const [isLetterOpen, setIsLetterOpen] = useState(false);

  // Lightbox Media Preview
  const [fullScreenImage, setFullScreenImage] = useState(null);

  // Guestbook Form State
  const [guestAuthor, setGuestAuthor] = useState('');
  const [guestRelation, setGuestRelation] = useState('Người thương');
  const [guestMessage, setGuestMessage] = useState('');
  const [guestSuccess, setGuestSuccess] = useState(false);
  const [isSendingGuest, setIsSendingGuest] = useState(false);

  // Load showcase memories list for dropdown
  useEffect(() => {
    setAllMemories(getShowcaseMemoriesList());
  }, []);

  // Fetch memory data on tag change
  const loadMemory = async (tag) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetchMemoryView(tag);
      if (res.success && res.data) {
        setMemoryData(res.data);
        // Pre-fill editor states
        setEditTitle(res.data.title || '');
        setEditQuote(res.data.quote || '');
        setEditLetter(res.data.letter || '');
        setEditRecipient(res.data.recipient || '');
        setEditAudioTitle(res.data.audio_title || '');
        setEditAudioUrl(res.data.audio_url || '');
        setPinAction('KEEP');
        setNewPinCode('');
      } else {
        setErrorMessage(res.message || 'Không thể tải dữ liệu kỷ vật.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Lỗi khi tải dữ liệu.');
    } finally {
      setLoading(false);
      setIsPlaying(false);
      setAudioProgress(0);
      setIsLetterOpen(false);
    }
  };

  useEffect(() => {
    loadMemory(currentTag);
  }, [currentTag]);

  // Audio Play / Pause handler
  const togglePlayAudio = () => {
    if (!audioRef.current && memoryData?.audio_url) {
      audioRef.current = new Audio(memoryData.audio_url);
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

  // Handle PIN Unlock
  const handleVerifyPin = async (e) => {
    e.preventDefault();
    setPinError('');
    setIsVerifyingPin(true);

    try {
      const result = await verifyMemoryPin(currentTag, pinInput);
      if (result.success) {
        // Sau khi đúng PIN -> Fetch lại dữ liệu với Grant Token để nhận nội dung thư thật
        await loadMemory(currentTag);
        setPinInput('');
      } else {
        setPinError(result.message || 'Mã PIN bảo mật không chính xác.');
      }
    } catch (err) {
      setPinError(err.message || 'Lỗi khi xác thực mã PIN.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Handle Claim Ownership
  const handleClaim = async (e) => {
    e.preventDefault();
    setClaimError('');
    setIsClaiming(true);

    try {
      const res = await claimNfcOwnership(currentTag, claimCodeInput);
      if (res.success) {
        alert(res.message);
        setIsClaimModalOpen(false);
        setClaimCodeInput('');
        await loadMemory(currentTag);
      } else {
        setClaimError(res.message);
      }
    } catch (err) {
      setClaimError(err.message || 'Lỗi khi nhận quyền sở hữu.');
    } finally {
      setIsClaiming(false);
    }
  };

  // Handle Save Editor
  const handleSaveEditor = async (e) => {
    e.preventDefault();
    setIsSavingEditor(true);

    try {
      await updateMemorySpace(currentTag, {
        title: editTitle,
        quote: editQuote,
        letter: editLetter,
        recipient: editRecipient,
        audio_title: editAudioTitle,
        audio_url: editAudioUrl,
        pin_action: pinAction,
        pin_code: pinAction === 'SET' ? newPinCode : null,
      });

      setSaveSuccess(true);
      await loadMemory(currentTag);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditorOpen(false);
      }, 1000);
    } catch (err) {
      alert(err.message || 'Lỗi khi lưu thay đổi.');
    } finally {
      setIsSavingEditor(false);
    }
  };

  // Handle Submit Guestbook
  const handleSendGuestbook = async (e) => {
    e.preventDefault();
    if (!guestAuthor.trim() || !guestMessage.trim()) return;

    setIsSendingGuest(true);
    try {
      await submitGuestbookEntry(currentTag, {
        author: guestAuthor,
        relationship: guestRelation,
        message: guestMessage,
      });

      setGuestAuthor('');
      setGuestMessage('');
      setGuestSuccess(true);
      await loadMemory(currentTag);
      setTimeout(() => setGuestSuccess(false), 4000);
    } catch (err) {
      alert(err.message || 'Lỗi khi gửi lời chúc.');
    } finally {
      setIsSendingGuest(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-dark-950 flex flex-col items-center justify-center text-slate-300 gap-3">
        <Sparkles className="w-8 h-8 animate-spin text-white" />
        <p className="font-serif text-sm uppercase tracking-widest">Đang kết nối vi chip kỷ niệm NFC...</p>
      </div>
    );
  }

  if (errorMessage || !memoryData) {
    return (
      <div className="w-full min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
        <h3 className="font-serif text-xl font-bold text-white mb-2">Thông Báo Truy Xuất Kỷ Vật</h3>
        <p className="text-xs text-slate-400 max-w-md mb-6">{errorMessage || 'Không tìm thấy dữ liệu.'}</p>
        <button
          onClick={() => loadMemory('emoria-lumen')}
          className="px-6 py-2.5 rounded-full bg-white text-dark-950 font-bold text-xs uppercase"
        >
          Trở về Kỷ Niệm Demo Mẫu
        </button>
      </div>
    );
  }

  const isTimedLock = memoryData.availability?.status === 'timed_lock';
  const isSuspended = memoryData.availability?.status === 'suspended';
  const isLockedByPin = memoryData.is_protected && !memoryData.is_unlocked;

  return (
    <div className="w-full min-h-screen bg-dark-950 text-slate-100 pt-24 pb-24 selection:bg-white/20">
      
      {/* 1. Header Toolbar */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-silver-glow animate-pulse">
              <SmartphoneNfc className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <span>EMORIA MEMORY VAULT</span>
                {memoryData.is_admin && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-red-500/20 text-red-300 border border-red-500/30">ADMIN</span>
                )}
                {memoryData.is_owner && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">CHỦ SỞ HỮU</span>
                )}
              </p>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>{memoryData.jewelry_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono">
                  #{memoryData.tag_uid}
                </span>
              </h2>
            </div>
          </div>

          {/* Right Selector & Owner Studio Buttons */}
          <div className="flex items-center gap-2">
            <select
              value={currentTag}
              onChange={(e) => setCurrentTag(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl bg-black/60 border border-white/20 text-slate-200 focus:outline-none focus:border-white/50 cursor-pointer"
            >
              {allMemories.map((m) => (
                <option key={m.tag_uid} value={m.tag_uid}>
                  {m.title} ({m.tag_uid})
                </option>
              ))}
            </select>

            {/* If Owner: Show Studio Button. If Not: Show Claim Chip Button */}
            {memoryData.is_owner || memoryData.is_admin ? (
              <button
                onClick={() => setIsEditorOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Chỉnh Sửa (Studio)</span>
              </button>
            ) : (
              <button
                onClick={() => setIsClaimModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white text-white hover:text-dark-950 border border-white/20 text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                title="Đăng ký quyền sở hữu chiếc trang sức này"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Nhận Quyền Sở Hữu</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* 2. TIMED LOCK AVAILABILITY GATE */}
      {isTimedLock && !memoryData.is_owner && !memoryData.is_admin ? (
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
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6 font-light">
              Người tặng đã cài đặt chế độ hẹn giờ mở niêm phong cho chiếc trang sức này. Thời khắc cảm xúc sẽ chính thức mở ra vào:
            </p>

            <div className="p-4 rounded-2xl bg-black/60 border border-amber-500/30 text-amber-300 font-mono text-sm sm:text-base font-bold mb-6">
              ✦ {new Date(memoryData.availability.unlock_date || '2026-10-20').toLocaleString('vi-VN')} ✦
            </div>

            <p className="text-xs text-slate-400 italic">
              “Một món quà bất ngờ luôn xứng đáng để chờ đợi từng giây phút.”
            </p>
          </motion.div>
        </div>
      ) : isLockedByPin ? (
        /* 3. PIN SECURITY SCREEN (CHỐNG RÒ RỈ: KHÔNG CÓ LETTER TRONG STATE TRƯỚC KHI GIẢI MÃ) */
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
            <p className="text-xs text-slate-300 leading-relaxed mb-6 font-light">
              Không gian kỷ niệm này được cài đặt mã PIN bảo vệ riêng tư. Vui lòng nhập mã để giải mã chip NFC.
            </p>

            <form onSubmit={handleVerifyPin} className="space-y-4">
              <input
                type="password"
                maxLength={6}
                placeholder="Nhập mã PIN (Gợi ý demo: 1000)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full text-center text-xl tracking-[0.4em] px-4 py-3 rounded-xl bg-black/60 border border-white/25 text-white placeholder-slate-500 focus:outline-none focus:border-white/60 font-mono"
              />

              {pinError && (
                <p className="text-xs text-red-400">{pinError}</p>
              )}

              <button
                type="submit"
                disabled={isVerifyingPin}
                className="w-full py-3 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-silver-glow disabled:opacity-50"
              >
                {isVerifyingPin ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                <span>Mở Khóa Kỷ Niệm</span>
              </button>
            </form>
          </motion.div>
        </div>
      ) : (
        /* 4. MAIN MEMORY SPACE (Đã mở khóa hoặc công khai) */
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
                <span>Kỷ niệm: {memoryData.date || 'Chưa cập nhật'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                <Eye className="w-3.5 h-3.5" />
                <span>Đã chạm {memoryData.tap_count || 1} lần</span>
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-metallic tracking-tight uppercase mb-4 leading-tight">
              {memoryData.title}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 font-light mb-6 flex items-center justify-center gap-2">
              <span>Từ: <strong className="text-white font-medium">{memoryData.author || 'Người thương'}</strong></span>
              <span>✦</span>
              <span>Gửi đến: <strong className="text-white font-medium">{memoryData.recipient || 'Người thương'}</strong></span>
            </p>

            {memoryData.quote && (
              <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-black/40 border border-white/10 italic text-slate-200 text-sm sm:text-base leading-relaxed relative">
                <span className="text-3xl text-white/30 font-serif absolute -top-3 left-4">“</span>
                <p className="px-3">{memoryData.quote}</p>
                <span className="text-3xl text-white/30 font-serif absolute -bottom-4 right-4">”</span>
              </div>
            )}
          </motion.div>

          {/* B. Audio Voice & Melody Player */}
          {memoryData.audio_url && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-white" />
                    <span>Bản Ghi Âm Thanh Kỷ Niệm</span>
                  </p>
                  <h3 className="text-base font-bold text-white mt-1">
                    {memoryData.audio_title || 'Giai Điệu & Lời Thì Thầm'}
                  </h3>
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  {currentTime} / {durationTime}
                </div>
              </div>

              {/* Waveform Visualizer Simulation */}
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

          {/* C. Hand-written Secret Letter (Chỉ hiển thị khi đã mở khóa PIN thành công) */}
          {memoryData.letter && (
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
                        — {memoryData.author || 'Người gửi'}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div 
                    onClick={() => setIsLetterOpen(true)}
                    className="py-10 border border-dashed border-white/20 rounded-2xl text-center cursor-pointer hover:border-white/50 transition-colors bg-black/20"
                  >
                    <Mail className="w-8 h-8 text-white/50 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-white">Lá thư tay đã được giải mã</p>
                    <p className="text-xs text-slate-400 mt-1">Bấm vào đây để mở đọc những dòng tâm sự vĩnh cửu</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* D. Photo Gallery */}
          {memoryData.media_gallery && memoryData.media_gallery.length > 0 && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-white" />
                  <h3 className="text-base font-bold text-white uppercase font-serif">
                    Khoảnh Khắc Kỷ Niệm ({memoryData.media_gallery.length})
                  </h3>
                </div>
                <p className="text-xs text-slate-400">Độ phân giải siêu nét HD</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {memoryData.media_gallery.map((media, idx) => (
                  <div
                    key={media.id || idx}
                    onClick={() => setFullScreenImage(media)}
                    className="group relative aspect-4/3 rounded-2xl overflow-hidden bg-black/50 border border-white/15 cursor-pointer hover:border-white/50 transition-all"
                  >
                    {media.type === 'video' ? (
                      <div className="w-full h-full relative">
                        <video
                          src={media.url}
                          muted
                          loop
                          playsInline
                          onMouseOver={(e) => e.target.play().catch(() => {})}
                          onMouseOut={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/70 border border-white/20 text-[10px] text-white flex items-center gap-1 backdrop-blur-md">
                          <Play className="w-2.5 h-2.5 fill-white" />
                          <span className="font-semibold tracking-wider">VIDEO</span>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={media.url}
                        alt={media.caption}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end pointer-events-none">
                      <p className="text-[11px] text-white line-clamp-2">{media.caption}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* E. Guestbook (Sổ Lưu Niệm) */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
            <h3 className="text-base font-bold text-white uppercase font-serif mb-2 flex items-center gap-2">
              <Heart className="w-4 h-4 text-white fill-current" />
              <span>Sổ Lưu Niệm & Lời Chúc Gửi Tới Kỷ Vật</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Mỗi lời nhắn gửi tại đây sẽ được lưu trữ vĩnh viễn trong cơ sở dữ liệu Supabase gắn với chip NFC này.
            </p>

            <div className="space-y-3 mb-6">
              {memoryData.guestbook?.map((entry) => (
                <div key={entry.id} className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white">
                      {entry.author} <span className="text-slate-400 font-normal">({entry.relationship})</span>
                    </span>
                    <span className="text-[10px] text-slate-500">{entry.created_at}</span>
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
                    <span>Đã lưu lời chúc thành công!</span>
                  </span>
                ) : <span />}

                <button
                  type="submit"
                  disabled={isSendingGuest}
                  className="px-4 py-2 rounded-xl bg-white text-dark-950 text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow disabled:opacity-50"
                >
                  {isSendingGuest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
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

      {/* MODAL 1: CLAIM NFC OWNERSHIP (NHẬN QUYỀN SỞ HỮU CHIP) */}
      {isClaimModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setIsClaimModalOpen(false)}
        >
          <div 
            className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/20 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base uppercase">Nhận Quyền Sở Hữu Chip NFC</h3>
              </div>
              <button onClick={() => setIsClaimModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 font-light leading-relaxed">
              Mỗi món trang sức Emoria đi kèm thẻ bảo hành kim loại chứa <strong>Mã Xác Nhận Claim Code</strong> một lần duy nhất. Nhập mã để gắn quyền sở hữu vào tài khoản của bạn.
            </p>

            <form onSubmit={handleClaim} className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Mã Claim Bảo Mật (Gợi ý demo: {currentTag === 'emoria-lumen' ? 'OWNER-LUMEN-2025' : 'OWNER-PULSE-2024'}):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: OWNER-LUMEN-2025"
                  value={claimCodeInput}
                  onChange={(e) => setClaimCodeInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono uppercase focus:outline-none focus:border-white/50"
                  required
                />
              </div>

              {claimError && <p className="text-xs text-red-400">{claimError}</p>}

              <button
                type="submit"
                disabled={isClaiming}
                className="w-full py-2.5 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase hover:bg-slate-200 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isClaiming && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Xác Nhận Quyền Sở Hữu</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OWNER STUDIO (CHỈNH SỬA TOÀN DIỆN & QUẢN LÝ PIN AN TOÀN) */}
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
                  <h3 className="font-bold text-white text-lg uppercase font-serif">Studio Quản Lý Kỷ Vật</h3>
                  <p className="text-xs text-slate-400">Chủ sở hữu Chip #{memoryData.tag_uid}</p>
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
                <label className="text-slate-300 font-semibold block mb-1">Câu trích dẫn (Golden Quote):</label>
                <input
                  type="text"
                  value={editQuote}
                  onChange={(e) => setEditQuote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Nội dung bức thư tay tâm sự (Riêng tư):</label>
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
                  <label className="text-slate-300 font-semibold block mb-1">Link âm thanh (MP3 URL):</label>
                  <input
                    type="text"
                    value={editAudioUrl}
                    onChange={(e) => setEditAudioUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* 3 HÀNH ĐỘNG PIN RÕ RÀNG: KEEP / SET / REMOVE (CHỐNG MẤT PIN KHI UPDATE TITLE) */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 mt-4">
                <p className="font-semibold text-white">Chính Sách Khóa Mã PIN Bảo Mật:</p>
                
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pinAction"
                      value="KEEP"
                      checked={pinAction === 'KEEP'}
                      onChange={() => setPinAction('KEEP')}
                      className="accent-white"
                    />
                    <span>Giữ nguyên trạng thái PIN hiện tại</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pinAction"
                      value="SET"
                      checked={pinAction === 'SET'}
                      onChange={() => setPinAction('SET')}
                      className="accent-white"
                    />
                    <span>Đặt / Đổi Mã PIN Mới</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pinAction"
                      value="REMOVE"
                      checked={pinAction === 'REMOVE'}
                      onChange={() => setPinAction('REMOVE')}
                      className="accent-white"
                    />
                    <span>Gỡ bỏ PIN (Công khai)</span>
                  </label>
                </div>

                {pinAction === 'SET' && (
                  <div className="pt-2">
                    <label className="text-[11px] text-slate-300 block mb-1">Nhập Mã PIN mới (4-6 chữ số):</label>
                    <input
                      type="password"
                      maxLength={6}
                      value={newPinCode}
                      onChange={(e) => setNewPinCode(e.target.value)}
                      placeholder="Nhập 4-6 số..."
                      className="w-48 px-3 py-1.5 rounded-xl bg-black/80 border border-white/30 text-white font-mono text-center tracking-widest text-sm focus:outline-none"
                      required={pinAction === 'SET'}
                    />
                  </div>
                )}
              </div>

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đã cập nhật dữ liệu kỷ vật an toàn!</span>
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
                  disabled={isSavingEditor}
                  className="px-6 py-2 rounded-xl bg-white text-dark-950 font-bold uppercase tracking-wider hover:bg-slate-200 cursor-pointer shadow-silver-glow flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingEditor && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Lưu Thay Đổi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Preview */}
      {fullScreenImage && (
        <div
          onClick={() => setFullScreenImage(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full max-h-[90vh] flex flex-col items-center relative"
          >
            <button
              onClick={() => setFullScreenImage(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/10 hover:bg-white text-white hover:text-dark-950 transition-all cursor-pointer"
              title="Đóng (ESC)"
            >
              <X className="w-5 h-5" />
            </button>

            {fullScreenImage.type === 'video' ? (
              <video
                src={fullScreenImage.url}
                controls
                autoPlay
                playsInline
                className="max-h-[75vh] w-auto max-w-full rounded-2xl border border-white/20 shadow-2xl bg-black"
              />
            ) : (
              <img
                src={fullScreenImage.url}
                alt={fullScreenImage.caption}
                className="max-h-[80vh] w-auto object-contain rounded-2xl border border-white/20 shadow-2xl"
              />
            )}
            <p className="text-xs sm:text-sm text-slate-200 mt-4 text-center font-light px-4">
              {fullScreenImage.caption}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
