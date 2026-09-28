import React, { useState, useEffect, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Heart, Sparkles, ArrowLeft, ArrowRight, CheckCircle2, Copy,
  Share2, RefreshCw, AlertCircle, Plus, Trash2, Image as ImageIcon,
  Check, Lock, Unlock, HelpCircle, Trophy, Flame, Home, ShoppingBag
} from 'lucide-react';
import {
  createMatch,
  saveMatchQuestions,
  beginMatch,
  saveMatchProgress,
  submitMatch,
  getMatchView,
  listMatches,
  uploadEventPhoto,
  DEFAULT_MATCH_QUESTIONS
} from '../services/eventService.js';

export default function MemoryMatchStudio({
  tagUid,
  matchId: initialMatchId,
  inviteToken: initialInviteToken,
  onBack,
  onNavigateHome,
  onNavigateShop,
  onNavigateMemory,
  onSwitchStudio,
  currentUser
}) {
  const [matchId, setMatchId] = useState(initialMatchId || null);
  const [inviteToken, setInviteToken] = useState(initialInviteToken || '');
  const [viewData, setViewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Mode: 'editor' (owner editing draft) | 'player' (playing match) | 'history' (viewing list)
  const [studioMode, setStudioMode] = useState(initialInviteToken ? 'player' : 'editor');

  // Draft editing state
  const [draftTitle, setDraftTitle] = useState('Couple Match: Thấu Hiểu Đôi Lứa');
  const [partnerName, setPartnerName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [questions, setQuestions] = useState(DEFAULT_MATCH_QUESTIONS.slice(0, 5));
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [uploadingImageIndex, setUploadingImageIndex] = useState(null);

  // Match playing state (1 question per screen)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeMatchesList, setActiveMatchesList] = useState([]);

  const radioGroupId = useId();

  // Load match view data or create new draft
  const loadMatchData = useCallback(async (targetId, tokenToUse) => {
    if (!targetId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getMatchView(targetId, { inviteToken: tokenToUse || inviteToken });
      setViewData(data);
      if (data.status === 'draft') {
        setStudioMode('editor');
        if (data.questions && data.questions.length >= 3) {
          setQuestions(data.questions);
        }
        if (data.title) setDraftTitle(data.title);
        if (data.partner_name) setPartnerName(data.partner_name);
        if (data.owner_name) setOwnerName(data.owner_name);
      } else {
        setStudioMode('player');
        // Restore progress answers if any
        if (Array.isArray(data.my_answers)) {
          setAnswers(data.my_answers);
        } else if (Array.isArray(data.questions)) {
          setAnswers(new Array(data.questions.length).fill(null));
        }
        // If completed, trigger subtle celebratory confetti
        if (data.status === 'completed') {
          try {
            confetti({
              particleCount: 60,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#f43f5e', '#fb7185', '#fda4af', '#fef08a']
            });
          } catch {}
        }
      }
    } catch (err) {
      setError(err?.message || 'Không thể tải thông tin lượt chơi.');
    } finally {
      setLoading(false);
    }
  }, [inviteToken]);

  // Initial load
  useEffect(() => {
    if (matchId) {
      loadMatchData(matchId, inviteToken);
    } else if (tagUid && currentUser) {
      // Check existing matches for this memory space
      setLoading(true);
      listMatches(tagUid)
        .then((list) => {
          setActiveMatchesList(list || []);
          if (list && list.length > 0) {
            // Pick most recent active or draft match
            const recent = list[0];
            setMatchId(recent.id);
            loadMatchData(recent.id, '');
          } else {
            setLoading(false);
            setStudioMode('editor');
          }
        })
        .catch(() => {
          setLoading(false);
          setStudioMode('editor');
        });
    } else {
      setLoading(false);
    }
  }, [matchId, tagUid, currentUser, loadMatchData, inviteToken]);

  // Handle creating a brand new match draft
  const handleCreateNewMatch = async () => {
    if (!tagUid) {
      setError('Cần mã kỷ vật để tạo thử thách.');
      return;
    }
    setError('');
    setIsSavingDraft(true);
    try {
      const created = await createMatch({
        tagUid,
        title: draftTitle.trim() || 'Couple Match',
        partnerName: partnerName.trim() || null,
        ownerName: ownerName.trim() || null
      });
      setMatchId(created.id);
      // Save initial questions
      await saveMatchQuestions(created.id, {
        questions,
        title: draftTitle.trim() || 'Couple Match',
        partner_name: partnerName.trim() || null,
        owner_name: ownerName.trim() || null
      });
      setSuccessMsg('Đã tạo bản nháp thử thách mới!');
      await loadMatchData(created.id, '');
    } catch (err) {
      setError(err?.message || 'Lỗi khi tạo lượt chơi.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle saving questions in draft
  const handleSaveDraft = async () => {
    if (!matchId) {
      await handleCreateNewMatch();
      return;
    }
    if (questions.length < 3 || questions.length > 7) {
      setError('Số câu hỏi phải từ 3 đến 7 câu.');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text?.trim()) {
        setError(`Câu hỏi số ${i + 1} chưa có nội dung.`);
        return;
      }
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
        setError(`Câu hỏi số ${i + 1} cần có từ 2 đến 4 đáp án.`);
        return;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j]?.trim()) {
          setError(`Đáp án số ${j + 1} của câu ${i + 1} còn để trống.`);
          return;
        }
      }
    }

    setError('');
    setIsSavingDraft(true);
    try {
      await saveMatchQuestions(matchId, {
        questions,
        title: draftTitle.trim() || 'Couple Match',
        partner_name: partnerName.trim() || null,
        owner_name: ownerName.trim() || null
      });
      setSuccessMsg('Đã lưu nội dung câu hỏi thành công.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err?.message || 'Không thể lưu câu hỏi.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Start match & generate invite token
  const handleBeginMatch = async () => {
    if (!matchId) {
      setError('Vui lòng lưu bản nháp trước.');
      return;
    }
    setError('');
    setIsStartingMatch(true);
    try {
      // Ensure questions are saved first
      await saveMatchQuestions(matchId, {
        questions,
        title: draftTitle.trim() || 'Couple Match',
        partner_name: partnerName.trim() || null,
        owner_name: ownerName.trim() || null
      });
      const res = await beginMatch(matchId);
      if (res.invite_token) {
        setInviteToken(res.invite_token);
      }
      setSuccessMsg('Lượt chơi đã kích hoạt! Hãy gửi liên kết cho người ấy.');
      await loadMatchData(matchId, '');
    } catch (err) {
      setError(err?.message || 'Không thể bắt đầu lượt chơi.');
    } finally {
      setIsStartingMatch(false);
    }
  };

  // Handle uploading question image
  const handleQuestionImageUpload = async (qIndex, file) => {
    if (!file || !tagUid) return;
    setUploadingImageIndex(qIndex);
    setError('');
    try {
      const res = await uploadEventPhoto(tagUid, file);
      setQuestions((prev) => {
        const next = [...prev];
        next[qIndex] = {
          ...next[qIndex],
          image_path: res.path,
          image_url: res.url
        };
        return next;
      });
      setSuccessMsg('Đã tải ảnh câu hỏi lên.');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err) {
      setError(err?.message || 'Tải ảnh thất bại.');
    } finally {
      setUploadingImageIndex(null);
    }
  };

  // Handle question option select
  const handleSelectOption = (optionIndex) => {
    const updated = [...answers];
    while (updated.length <= currentQuestionIndex) {
      updated.push(null);
    }
    updated[currentQuestionIndex] = optionIndex;
    setAnswers(updated);

    // Auto-save progress in background
    if (matchId) {
      saveMatchProgress(matchId, {
        answers: updated,
        inviteToken
      }).catch(() => {});
    }
  };

  // Submit all answers
  const handleSubmitMatch = async () => {
    if (!matchId) return;
    const activeQuestions = viewData?.questions || questions;
    const answeredCount = answers.filter((a) => a !== null && a !== undefined).length;
    if (answeredCount < activeQuestions.length) {
      setError(`Bạn mới trả lời ${answeredCount}/${activeQuestions.length} câu. Hãy hoàn thành tất cả các câu trước khi nộp nhé!`);
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await submitMatch(matchId, {
        answers,
        inviteToken
      });
      setSuccessMsg('Đã nộp bài thành công!');
      await loadMatchData(matchId, inviteToken);
    } catch (err) {
      setError(err?.message || 'Không thể nộp bài.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard navigation for answering questions
  useEffect(() => {
    if (studioMode !== 'player' || viewData?.my_submitted || viewData?.status === 'completed') return;

    const handleKeyDown = (e) => {
      const activeQuestions = viewData?.questions || questions;
      const currentQ = activeQuestions[currentQuestionIndex];
      if (!currentQ) return;

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= currentQ.options.length) {
        handleSelectOption(num - 1);
      } else if (e.key === 'ArrowRight' && currentQuestionIndex < activeQuestions.length - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentQuestionIndex > 0) {
        setCurrentQuestionIndex((prev) => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [studioMode, viewData, questions, currentQuestionIndex, answers]);

  // Copy share invite link
  const inviteLink = matchId && viewData?.invite_token
    ? `${window.location.origin}/?view=memory-match&match=${matchId}&invite=${viewData.invite_token}`
    : inviteToken
    ? `${window.location.origin}/?view=memory-match&match=${matchId}&invite=${inviteToken}`
    : '';

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleNativeShare = () => {
    if (!inviteLink) return;
    if (navigator.share) {
      navigator.share({
        title: viewData?.title || 'Couple Match - Emoria',
        text: 'Emoria gửi bạn lời mời tham gia Thử Thách Thấu Hiểu Đôi Lứa!',
        url: inviteLink
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  // Helper question manipulation
  const addQuestion = () => {
    if (questions.length >= 7) return;
    setQuestions((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        text: 'Câu hỏi mới dành cho hai đứa?',
        options: ['Lựa chọn A', 'Lựa chọn B', 'Lựa chọn C'],
        image_path: null,
        image_url: null
      }
    ]);
  };

  const removeQuestion = (idx) => {
    if (questions.length <= 3) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const addOption = (qIdx) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = { ...next[qIdx] };
      if (q.options.length < 4) {
        q.options = [...q.options, `Lựa chọn ${String.fromCharCode(65 + q.options.length)}`];
        next[qIdx] = q;
      }
      return next;
    });
  };

  const removeOption = (qIdx, optIdx) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = { ...next[qIdx] };
      if (q.options.length > 2) {
        q.options = q.options.filter((_, i) => i !== optIdx);
        next[qIdx] = q;
      }
      return next;
    });
  };

  // Render Loading
  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center" role="status">
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400"
        >
          <Heart className="w-8 h-8 fill-rose-500/30" />
        </motion.div>
        <p className="text-slate-300 font-medium">Đang tải không gian Couple Match...</p>
        <span className="sr-only">Đang tải dữ liệu lượt chơi</span>
      </div>
    );
  }

  // Active questions list based on viewData or local draft
  const activeQuestions = viewData?.questions || questions;
  const currentQ = activeQuestions[currentQuestionIndex] || activeQuestions[0];
  const totalQuestions = activeQuestions.length;
  const progressPercent = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:py-10 text-slate-100">
      {/* Top Header Bar with Multi-Page Navigation */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onBack || onNavigateMemory}
            type="button"
            aria-label="Quay lại không gian kỷ niệm"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại</span>
          </button>

          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              title="Về Trang Chủ Emoria"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Trang chủ</span>
            </button>
          )}

          {onNavigateShop && (
            <button
              onClick={onNavigateShop}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              title="Xem Cửa Hàng & Bộ Sưu Tập"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cửa hàng</span>
            </button>
          )}

          {onSwitchStudio && (
            <button
              onClick={() => onSwitchStudio('house')}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-medium transition-colors cursor-pointer"
              title="Chuyển sang Memory House Studio"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">House Studio</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Couple Match Studio</span>
        </div>

        {viewData?.status === 'draft' && currentUser && (
          <button
            onClick={() => setStudioMode(studioMode === 'editor' ? 'player' : 'editor')}
            type="button"
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            {studioMode === 'editor' ? 'Xem trước khi chơi' : 'Sửa câu hỏi'}
          </button>
        )}
      </header>

      {/* Notifications / Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-sm flex items-start gap-3 shadow-lg"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300">Đã xảy ra lỗi</p>
              <p className="mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => setError('')}
              className="text-red-400 hover:text-red-200 text-xs font-bold"
              aria-label="Đóng thông báo lỗi"
            >
              ✕
            </button>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-sm flex items-center gap-3 shadow-lg"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="font-medium">{successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODE 1: DRAFT EDITOR (Chủ sở hữu soạn thảo câu hỏi)                      */}
      {/* ========================================================================= */}
      {studioMode === 'editor' && (
        <section aria-labelledby="draft-editor-title" className="space-y-6">
          <div className="bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
            <div className="max-w-xl">
              <span className="text-xs uppercase tracking-widest text-rose-400 font-bold">Biên Soạn Thử Thách</span>
              <h1 id="draft-editor-title" className="text-2xl sm:text-3xl font-serif font-bold text-white mt-1">
                Tạo Câu Hỏi Thấu Hiểu Cho Cặp Đôi
              </h1>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                Tạo từ 3 đến 7 câu hỏi ngọt ngào. Hai bạn sẽ trả lời độc lập và cùng mở khóa kết quả đối chiếu sau khi cả hai hoàn thành.
              </p>
            </div>

            {/* General Meta Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10">
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Tiêu đề thử thách</label>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Ví dụ: Đôi mình hiểu nhau đến đâu?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-rose-400 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Tên của bạn</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Bạn"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-rose-400 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Tên người ấy</label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Người thương"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-rose-400 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Questions Editor Accordion */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Danh sách câu hỏi</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                  {questions.length}/7 câu
                </span>
              </h2>
              {questions.length < 7 && (
                <button
                  type="button"
                  onClick={addQuestion}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 py-1 px-3 rounded-full bg-rose-500/10 border border-rose-500/20 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm câu hỏi</span>
                </button>
              )}
            </div>

            {questions.map((q, qIndex) => (
              <div
                key={q.id || qIndex}
                className="bg-black/40 border border-white/10 rounded-2xl p-5 space-y-4 transition-all hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center text-xs font-bold">
                      {qIndex + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Câu hỏi {qIndex + 1}
                    </span>
                  </div>
                  {questions.length > 3 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIndex)}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      title="Xóa câu hỏi này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Question Text */}
                <input
                  type="text"
                  value={q.text}
                  onChange={(e) => {
                    const text = e.target.value;
                    setQuestions((prev) => {
                      const next = [...prev];
                      next[qIndex] = { ...next[qIndex], text };
                      return next;
                    });
                  }}
                  placeholder="Nhập nội dung câu hỏi..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium focus:border-rose-400 focus:outline-none transition-colors"
                />

                {/* Optional Image */}
                <div className="flex items-center gap-3">
                  {q.image_url ? (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/20 group">
                      <img src={q.image_url} alt="Ảnh câu hỏi" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setQuestions((prev) => {
                            const next = [...prev];
                            next[qIndex] = { ...next[qIndex], image_path: null, image_url: null };
                            return next;
                          });
                        }}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity cursor-pointer"
                      >
                        Xóa
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 cursor-pointer transition-colors">
                      <ImageIcon className="w-4 h-4 text-rose-400" />
                      <span>{uploadingImageIndex === qIndex ? 'Đang tải...' : 'Thêm ảnh minh họa'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={uploadingImageIndex === qIndex}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleQuestionImageUpload(qIndex, file);
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Options List */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span>Các đáp án lựa chọn ({q.options.length}/4)</span>
                    {q.options.length < 4 && (
                      <button
                        type="button"
                        onClick={() => addOption(qIndex)}
                        className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                      >
                        + Thêm đáp án
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2">
                        <span className="w-6 text-center text-xs font-bold text-slate-500">
                          {String.fromCharCode(65 + optIndex)}.
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setQuestions((prev) => {
                              const next = [...prev];
                              const opts = [...next[qIndex].options];
                              opts[optIndex] = val;
                              next[qIndex] = { ...next[qIndex], options: opts };
                              return next;
                            });
                          }}
                          placeholder={`Đáp án ${optIndex + 1}`}
                          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:border-rose-400 focus:outline-none transition-colors"
                        />
                        {q.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(qIndex, optIndex)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Xóa lựa chọn"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold border border-white/15 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingDraft ? 'Đang lưu bản nháp...' : 'Lưu bản nháp'}
            </button>

            <button
              type="button"
              onClick={handleBeginMatch}
              disabled={isStartingMatch || isSavingDraft}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-sm shadow-xl shadow-rose-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <Heart className="w-4 h-4 fill-white" />
              <span>{isStartingMatch ? 'Đang kích hoạt...' : 'Kích Hoạt & Lấy Link Gửi Người Ấy'}</span>
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: ACTIVE GAMEPLAY (1 câu hỏi trên mỗi màn hình)                     */}
      {/* ========================================================================= */}
      {studioMode === 'player' && viewData?.status !== 'completed' && !viewData?.my_submitted && (
        <section aria-labelledby="active-match-title" className="space-y-6">
          {/* Partner Invite Header Alert (nếu là Owner tạo phòng) */}
          {inviteLink && !initialInviteToken && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Liên kết gửi cho người ấy</p>
                  <p className="text-xs text-slate-300">Người ấy sẽ mở link này trên điện thoại để trả lời độc lập.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Đã sao chép' : 'Sao chép link'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  aria-label="Chia sẻ link mời"
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Stepper Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
              <span className="text-rose-300">Câu {currentQuestionIndex + 1} / {totalQuestions}</span>
              <span>{Math.round(progressPercent)}% Hoàn thành</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Single Question Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/10 rounded-3xl p-6 sm:p-10 backdrop-blur-2xl shadow-2xl space-y-6"
            >
              {/* Optional Question Image */}
              {currentQ.image_url && (
                <div className="w-full max-h-64 sm:max-h-80 rounded-2xl overflow-hidden border border-white/15 shadow-inner mb-4">
                  <img
                    src={currentQ.image_url}
                    alt={`Minh họa câu hỏi ${currentQuestionIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Question Text */}
              <div>
                <span className="text-xs uppercase tracking-widest font-bold text-rose-400">
                  Câu hỏi {currentQuestionIndex + 1}
                </span>
                <h2 id="active-match-title" className="text-xl sm:text-2xl font-serif font-bold text-white mt-2 leading-relaxed">
                  {currentQ.text}
                </h2>
              </div>

              {/* Options Radio Group */}
              <div
                role="radiogroup"
                aria-labelledby="active-match-title"
                className="grid grid-cols-1 gap-3 pt-2"
              >
                {currentQ.options.map((optionText, optIdx) => {
                  const isSelected = answers[currentQuestionIndex] === optIdx;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectOption(optIdx)}
                      className={`group relative flex items-center justify-between p-4 sm:p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                        isSelected
                          ? 'bg-rose-500/20 border-rose-500 text-white shadow-lg shadow-rose-500/10'
                          : 'bg-black/30 border-white/10 hover:border-white/25 hover:bg-white/5 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 pr-4">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-rose-500 text-white'
                              : 'bg-white/10 text-slate-400 group-hover:bg-white/15'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="text-sm sm:text-base font-medium leading-snug">
                          {optionText}
                        </span>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? 'border-rose-400 bg-rose-500 text-white'
                            : 'border-white/20 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Stepper Navigation Buttons */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Câu trước</span>
            </button>

            {currentQuestionIndex < totalQuestions - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-dark-950 font-bold text-sm shadow-silver-glow hover:bg-slate-200 transition-all cursor-pointer"
              >
                <span>Câu tiếp theo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitMatch}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-sm shadow-xl shadow-rose-500/25 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Đang nộp bài...' : 'Hoàn Thành & Nộp Bài'}</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: WAITING FOR PARTNER (Người này đã nộp, đợi nửa kia)               */}
      {/* ========================================================================= */}
      {studioMode === 'player' && viewData?.status !== 'completed' && viewData?.my_submitted && (
        <section aria-labelledby="waiting-screen-title" className="text-center py-12 px-6 space-y-6">
          <div className="max-w-md mx-auto bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/10 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl">
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
              className="w-20 h-20 mx-auto rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-6 shadow-xl shadow-rose-500/10"
            >
              <Heart className="w-10 h-10 fill-rose-500/40" />
            </motion.div>

            <h2 id="waiting-screen-title" className="text-2xl font-serif font-bold text-white mb-2">
              Bạn Đã Hoàn Thành! ✨
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Đáp án của bạn đã được niêm phong an toàn. Đang chờ người thương hoàn tất lượt chơi để cùng hé lộ mức độ đồng điệu nhé!
            </p>

            {inviteLink && (
              <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                <p className="text-xs text-slate-400">Nếu người ấy chưa nhận được link:</p>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 transition-colors cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Đã sao chép link mời!' : 'Sao chép liên kết cho người ấy'}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => loadMatchData(matchId, inviteToken)}
              className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer shadow-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Kiểm tra xem người ấy đã nộp chưa</span>
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* MODE 4: REVEAL SCREEN (Cả hai đã hoàn thành)                              */}
      {/* ========================================================================= */}
      {viewData?.status === 'completed' && (
        <section aria-labelledby="reveal-screen-title" className="space-y-8 animate-fadeIn">
          {/* Hero Match Score Card */}
          <div className="relative overflow-hidden bg-gradient-to-b from-rose-950/40 via-purple-950/30 to-black/60 border border-rose-500/30 rounded-3xl p-8 sm:p-12 text-center backdrop-blur-2xl shadow-2xl">
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-lg mx-auto space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase tracking-widest">
                <Trophy className="w-4 h-4" />
                <span>Kết Quả Thấu Hiểu Đôi Lứa</span>
              </div>

              <h2 id="reveal-screen-title" className="text-3xl sm:text-4xl font-serif font-bold text-white">
                {viewData.title || 'Couple Match'}
              </h2>

              {/* Big Score Display */}
              <div className="py-6">
                <div className="inline-flex items-baseline gap-2">
                  <span className="text-6xl sm:text-7xl font-serif font-black bg-gradient-to-r from-rose-300 via-pink-200 to-amber-200 bg-clip-text text-transparent">
                    {viewData.match_percentage ?? 100}%
                  </span>
                </div>
                <p className="text-lg font-medium text-rose-200 mt-2">
                  {viewData.match_percentage >= 90
                    ? 'Tâm đầu ý hợp tuyệt đối! Hai tâm hồn sinh ra dành cho nhau 💕'
                    : viewData.match_percentage >= 70
                    ? 'Đồng điệu tuyệt vời! Rất nhiều thói quen và ước mơ chung ✨'
                    : viewData.match_percentage >= 50
                    ? 'Sự bù trừ ngọt ngào! Khác biệt để yêu nhau nhiều hơn 🌸'
                    : 'Hành trình thú vị để cùng khám phá và thấu hiểu nhau hơn 🌱'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Trùng khớp {viewData.match_count || 0} trên tổng số {viewData.total_questions || 0} câu hỏi.
                </p>
              </div>

              {/* Share Result Action */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer shadow-lg"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Chia sẻ khoảnh khắc ngọt ngào</span>
                </button>
                {currentUser && tagUid && (
                  <button
                    type="button"
                    onClick={() => {
                      setMatchId(null);
                      setStudioMode('editor');
                      setQuestions(DEFAULT_MATCH_QUESTIONS.slice(0, 5));
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tạo lượt chơi mới</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Breakdown: Question by Question Comparison */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white px-2">Chi tiết từng câu trả lời của hai bạn</h3>

            <div className="space-y-4">
              {(viewData.reveal || []).map((item, idx) => {
                const isMatched = item.is_match;
                return (
                  <div
                    key={idx}
                    className={`p-6 rounded-2xl border transition-all ${
                      isMatched
                        ? 'bg-rose-950/20 border-rose-500/30'
                        : 'bg-black/30 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Câu {idx + 1}
                      </span>
                      {isMatched ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold">
                          <Heart className="w-3.5 h-3.5 fill-rose-300" />
                          <span>Đồng điệu!</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Góc nhìn riêng biệt</span>
                      )}
                    </div>

                    <p className="text-base font-semibold text-white mb-4">{item.question_text}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/5">
                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          {viewData.owner_name || 'Chủ sở hữu'}
                        </span>
                        <p className="text-sm font-medium text-rose-200">
                          {item.owner_answer_text || 'Chưa trả lời'}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          {viewData.partner_name || 'Người thương'}
                        </span>
                        <p className="text-sm font-medium text-pink-200">
                          {item.partner_answer_text || 'Chưa trả lời'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
