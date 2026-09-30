import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Heart, Sparkles, ArrowLeft, ArrowRight, CheckCircle2, Copy,
  Share2, RefreshCw, AlertCircle, Plus, Trash2, Image as ImageIcon,
  Check, Lock, Unlock, HelpCircle, Trophy, Flame, Home, ShoppingBag,
  Loader2, GripVertical, ChevronUp, ChevronDown, Flag
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
  trackEventAction,
  submitContentReport
} from '../services/eventService.js';
import {
  MATCH_TOPICS,
  QUESTION_POOL,
  formatMatchQuestion,
  getTopicQuestions,
  getRandomReplacement,
  getComplementaryInsight,
  getPlayedQuestions,
  recordPlayedQuestions
} from '../services/matchQuestionBank.js';
import {createDraftQueue} from '../services/draftQueue.js';
import {watchMatch} from '../services/matchStream.js';

export default function MemoryMatchStudio({
  tagUid,
  matchId: initialMatchId,
  inviteToken: initialInviteToken,
  onBack,
  onNavigateHome,
  onNavigateShop,
  onNavigateMemory,
  onSwitchStudio,
  onOpenAuth,
  onMatchChange,
  currentUser
}) {
  const [matchId, setMatchId] = useState(initialMatchId || null);
  const [accessInviteToken, setAccessInviteToken] = useState(initialInviteToken || '');
  const [shareInviteToken, setShareInviteToken] = useState('');
  const [viewData, setViewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Mode: 'editor' (owner editing draft) | 'player' (playing match) | 'history' (viewing list)
  const [studioMode, setStudioMode] = useState(initialInviteToken ? 'player' : 'editor');

  // Draft editing state
  const [draftTitle, setDraftTitle] = useState('Mismatch: Chơi Vui Cùng Nhau');
  const [partnerName, setPartnerName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('lifestyle');
  const [questions, setQuestions] = useState(() => getTopicQuestions('lifestyle', 5));
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [uploadingImageIndex, setUploadingImageIndex] = useState(null);

  // Handlers for Topic Packs and Question Reroll
  const handleSelectTopic = (topicId) => {
    setSelectedTopic(topicId);
    const playedTexts = getPlayedQuestions(currentUser);
    const newQuestions = getTopicQuestions(topicId, 5, playedTexts);
    setQuestions(newQuestions);
    const topicObj = MATCH_TOPICS.find(t => t.id === topicId);
    if (topicObj) {
      setDraftTitle(`Mismatch: ${topicObj.title}`);
    }
    isDirty.current = true;
    setAutosaveState('saving');
  };

  const handleRerollQuestion = (index) => {
    const currentTexts = questions.map(q => q.text);
    const replacement = getRandomReplacement(selectedTopic, currentTexts);
    const updated = [...questions];
    updated[index] = {
      ...updated[index],
      text: replacement.text,
      options: replacement.options,
      image_path: null,
      image_url: null
    };
    setQuestions(updated);
    isDirty.current = true;
    setAutosaveState('saving');
  };

  // Autosave state
  const [autosaveState, setAutosaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const isDirty = useRef(false);
  const isInitialLoad = useRef(true);
  const saveRevision = useRef(0);
  const justCreatedIdRef = useRef(null);
  const draftQueue=useRef(null),progressQueue=useRef(null),creating=useRef(null);
  function resetQueues(id,data,token){
    draftQueue.current=createDraftQueue((payload,expected_revision)=>saveMatchQuestions(id,{...payload,expected_revision}));
    draftQueue.current.reset(data.draft_revision||0);
    progressQueue.current=createDraftQueue(async(payload,expected_revision)=>{
      const result=await saveMatchProgress(id,{...payload,inviteToken:token || undefined,expected_revision});
      return {...result,draft_revision:result.progress_revision};
    });
    progressQueue.current.reset(data.progress_revision||0);
  }
  async function persistDraft(payload,retry=false){
    if(!draftQueue.current)throw new Error('Bản nháp chưa tải xong.');
    const result = await draftQueue.current.enqueue(payload,{retry});
    if(JSON.stringify(payload)===JSON.stringify(draftPayload())&&!draftQueue.current.pending){isDirty.current=false;setAutosaveState('saved');}
    return result;
  }
  function draftPayload(){const d=latestDraftRef.current;return {questions:d.questions,title:d.title.trim()||'Mismatch',partner_name:d.partnerName.trim()||null,owner_name:d.ownerName.trim()||null};}
  const latestDraftRef = useRef({
    title: draftTitle,
    partnerName,
    ownerName,
    questions,
    matchId
  });

  latestDraftRef.current = {
      title: draftTitle,
      partnerName,
      ownerName,
      questions,
      matchId
    };

  // Match playing state (1 question per screen)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeMatchesList, setActiveMatchesList] = useState([]);
  const [partnerNotice, setPartnerNotice] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('inappropriate_content');
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const radioGroupId = useId();

  // Load match view data or create new draft
  const loadMatchData = useCallback(async (targetId, tokenToUse) => {
    if (!targetId) return;
    setLoading(true);
    setViewData(null);
    isInitialLoad.current = true;
    setError('');
    const effectiveToken = tokenToUse !== undefined ? tokenToUse : accessInviteToken;
    try {
      const data = await getMatchView(targetId, { inviteToken: effectiveToken || undefined });
      resetQueues(targetId, data, effectiveToken || '');
      setViewData(data);
      if (data.invite_token) {
        setShareInviteToken(data.invite_token);
      }
      if (effectiveToken) {
        trackEventAction('match_invite_opened', 'match', targetId, null, {}, effectiveToken);
      }
      if (data.status === 'draft') {
        setStudioMode('editor');
        if (Array.isArray(data.questions)) {
          if(data.questions.length) {
            setQuestions(data.questions);
            setSelectedTopic(MATCH_TOPICS.find(t => data.questions.every(q => QUESTION_POOL[t.id].some(p => p.text === q.text)))?.id || null);
          }
        }
        if (data.title) setDraftTitle(data.title);
        setPartnerName(data.partner_name || '');
        setOwnerName(data.owner_name || '');
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
  }, [accessInviteToken]);

  // Initial load
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    if (justCreatedIdRef.current === 'new' && !matchId) {
      justCreatedIdRef.current = null;
      return;
    }
    if (justCreatedIdRef.current !== null && justCreatedIdRef.current === matchId) {
      justCreatedIdRef.current = null;
      return;
    }
    if (matchId) {
      loadMatchData(matchId, accessInviteToken);
    } else if (currentUser) {
      // Account history includes earlier rounds attached to owned memories.
      setLoading(true);
      listMatches()
        .then((list) => {
          setActiveMatchesList(list || []);
          if (list && list.length > 0) {
            // Pick most recent active or draft match
            const recent = list.find(m => m.status === 'draft') || list[0];
            setMatchId(recent.id);
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
  }, [matchId, tagUid, currentUser, loadMatchData, accessInviteToken]);

  // Autosave debouncer (1000ms)
  useEffect(() => {
    if (loading) return;
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (studioMode !== 'editor' || loading || isStartingMatch || !currentUser) return;

    isDirty.current = true;
    setAutosaveState('saving');
    const currentRev = ++saveRevision.current;

    const timer = setTimeout(async () => {
      try {
        const payload = {
          questions: latestDraftRef.current.questions,
          title: latestDraftRef.current.title.trim() || 'Mismatch',
          partner_name: latestDraftRef.current.partnerName.trim() || null,
          owner_name: latestDraftRef.current.ownerName.trim() || null
        };
        if(!matchId){await handleCreateNewMatch();return;}
        await persistDraft(payload);
        if (saveRevision.current === currentRev) {
          isDirty.current = false;
          setAutosaveState('saved');
        }
      } catch (err) {
        if (saveRevision.current === currentRev) {
          setAutosaveState('error');setError(err.message);
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [draftTitle, partnerName, ownerName, questions, studioMode, matchId, loading, isStartingMatch, currentUser]);

  // Warn before leaving if dirty
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Authoritative private broadcasts relayed by our authenticated SSE endpoint.
  useEffect(()=>{
    if(!currentUser||!matchId||viewData?.status!=='active'||viewData?.both_submitted)return;
    let stopped=false,pending=false;
    const refresh=async()=>{if(stopped||pending||document.visibilityState==='hidden')return;pending=true;
      try{const data=await getMatchView(matchId,{inviteToken: accessInviteToken || undefined});if(!stopped){setViewData(data);if(data.both_submitted)setPartnerNotice('Người cùng chơi đã hoàn thành. Cùng mở kết quả nhé!');}}
      catch(err){if(!stopped)setError(err.message);}finally{pending=false;}};
    const disconnect=watchMatch(matchId,accessInviteToken,()=>refresh(),refresh);
    const timer=setInterval(refresh,15000);
    window.addEventListener('focus',refresh);
    return()=>{stopped=true;disconnect();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[matchId,accessInviteToken,viewData?.status,viewData?.both_submitted,currentUser]);

  // Handle creating a brand new match draft
  const handleCreateNewMatch = () => {
    if(creating.current)return creating.current;
    creating.current=(async()=>{
    if (!currentUser) {
      setError('Đăng nhập để tạo lượt chơi.');
      return;
    }
    setError('');
    setIsSavingDraft(true);
    setAutosaveState('saving');
    try {
      const created = await createMatch({
        title: draftTitle.trim() || 'Mismatch',
        partnerName: partnerName.trim() || null,
        ownerName: ownerName.trim() || null
      });
      const createdId = created.match_id;
      if (!createdId) throw new Error('Máy chủ chưa trả mã lượt chơi. Hãy thử lại.');
      justCreatedIdRef.current = createdId;
      resetQueues(createdId,{draft_revision:0},'');
      setMatchId(createdId);
      onMatchChange?.(createdId);
      // Save initial questions
      await persistDraft(draftPayload());
      setSuccessMsg('Đã tạo bản nháp thử thách mới!');
      setViewData({status:'draft'});
      return createdId;
    } catch (err) {
      setAutosaveState('error');
      setError(err?.message || 'Lỗi khi tạo lượt chơi.');
    } finally {
      setIsSavingDraft(false);
    }
    })().finally(()=>{creating.current=null;});return creating.current;
  };

  // Reorder questions
  const handleMoveQuestion = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  // Handle saving questions in draft (allows drafting without blocking prematurely)
  const handleSaveDraft = async (customQuestions) => {
    const qsToSave = customQuestions || questions;
    if (qsToSave.length > 10) {
      setError('Số câu hỏi trong bản nháp không được vượt quá 10 câu.');
      return false;
    }
    if (!matchId) {
      return Boolean(await handleCreateNewMatch());
    }

    setError('');
    setIsSavingDraft(true);
    setAutosaveState('saving');
    try {
      await persistDraft({
        questions: qsToSave,
        title: draftTitle.trim() || 'Mismatch',
        partner_name: partnerName.trim() || null,
        owner_name: ownerName.trim() || null
      },true);
      setSuccessMsg('Đã lưu nội dung câu hỏi thành công.');
      setTimeout(() => setSuccessMsg(''), 2500);
      return true;
    } catch (err) {
      setAutosaveState('error');
      setError(err?.message || 'Không thể lưu câu hỏi.');
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Start match & generate invite token (enforces strict 3-7 questions & non-empty options)
  const handleBeginMatch = async () => {
    if(uploadingImageIndex !== null)return;
    if (!ownerName.trim() || !partnerName.trim()) {
      setError('Hãy nhập tên của cả hai người để câu hỏi luôn nói rõ đang hỏi về ai.');
      return;
    }
    if (questions.length < 3 || questions.length > 7) {
      setError('Số câu hỏi để bắt đầu thử thách phải từ 3 đến 7 câu.');
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
        if (typeof q.options[j] !== 'string' || !q.options[j].trim()) {
          setError(`Đáp án số ${j + 1} của câu ${i + 1} còn để trống.`);
          return;
        }
      }
    }
    setError('');
    setIsStartingMatch(true);
    try {
      const targetId = matchId || await handleCreateNewMatch();
      if(!targetId)return;
      // Ensure questions are saved first
      await persistDraft({
        questions,
        title: draftTitle.trim() || 'Mismatch',
        partner_name: partnerName.trim() || null,
        owner_name: ownerName.trim() || null
      },true);
      if(isDirty.current)throw new Error('Bạn vừa chỉnh sửa thêm. Hãy chờ lưu rồi bắt đầu lại.');
      const res = await beginMatch(targetId);
      recordPlayedQuestions(currentUser, questions.map(q => q.text));
      if (res.invite_token) {
        setShareInviteToken(res.invite_token);
      }
      setSuccessMsg('Lượt chơi đã kích hoạt! Hãy gửi liên kết cho người cùng chơi.');
      await loadMatchData(targetId, '');
    } catch (err) {
      setError(err?.message || 'Không thể bắt đầu lượt chơi.');
    } finally {
      setIsStartingMatch(false);
    }
  };

  // Handle uploading question image
  const handleQuestionImageUpload = async (qIndex, file) => {
    if (!file || !currentUser) return;
    const targetId = questions[qIndex]?.id;
    setUploadingImageIndex(qIndex);
    setError('');
    try {
      const res = await uploadEventPhoto(viewData?.tag_uid || `match_${currentUser}`, file);
      setQuestions((prev) => {
        const next = [...prev];
        const index = next.findIndex(q => q.id === targetId);
        if(index < 0)return prev;
        next[index] = {
          ...next[index],
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
    if(isSubmitting || viewData?.my_submitted)return;
    const updated = [...answers];
    while (updated.length <= currentQuestionIndex) {
      updated.push(null);
    }
    updated[currentQuestionIndex] = optionIndex;
    setAnswers(updated);

    // Auto-save progress in background
    if (matchId) {
      setAutosaveState('saving');isDirty.current=true;
      progressQueue.current?.enqueue({answers:updated}).then(()=>{
        if(!progressQueue.current.pending){isDirty.current=false;setAutosaveState('saved');}
      }).catch(err=>{setError(err.message);setAutosaveState('error');});
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
      await progressQueue.current?.flush();
      await submitMatch(matchId, {
        answers,
        inviteToken: accessInviteToken || undefined
      });
      setSuccessMsg('Đã nộp bài thành công!');
      await loadMatchData(matchId, accessInviteToken);
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
  const activeShareToken = shareInviteToken || viewData?.invite_token || accessInviteToken;
  const inviteLink = matchId && activeShareToken
    ? `${window.location.origin}/?view=memory-match&match=${matchId}&invite=${activeShareToken}`
    : '';

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      if (matchId) trackEventAction('house_copy_link', 'match', matchId);
    });
  };

  const handleNativeShare = () => {
    if (!inviteLink) return;
    if (navigator.share) {
      navigator.share({
        title: viewData?.title || 'Mismatch - Emoria',
        text: 'Emoria gửi bạn lời mời tham gia Thử Thách Chơi Vui Cùng Nhau!',
        url: inviteLink
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  // Helper question manipulation
  const addQuestion = () => {
    if (questions.length >= 10) return;
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
    if (questions.length <= 1) return;
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

  if (!currentUser) return (
    <section className="max-w-xl mx-auto p-8 pt-28 space-y-4 text-center">
      <h1 className="text-3xl font-bold">Mismatch · Chơi cùng người quen</h1>
      <p>Đăng nhập để tạo hoặc tham gia lượt chơi. Không cần sở hữu Memory Space.</p>
      <button type="button" onClick={onOpenAuth} className="px-6 py-3 rounded-xl bg-rose-500 text-white font-bold">Đăng nhập để chơi</button>
    </section>
  );

  // Render Loading
  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 pt-28 text-center" role="status">
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400"
        >
          <Heart className="w-8 h-8 fill-rose-500/30" />
        </motion.div>
        <p className="text-slate-300 font-medium">Đang tải không gian Mismatch...</p>
        <span className="sr-only">Đang tải dữ liệu lượt chơi</span>
      </div>
    );
  }

  // Active questions list based on viewData or local draft
  const activeQuestions = viewData?.questions || questions;
  const currentQ = activeQuestions[currentQuestionIndex] || activeQuestions[0];
  const totalQuestions = activeQuestions.length;
  const progressPercent = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

  const handleGoHome = () => {
    if(isDirty.current&&!window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))return;
    if (onNavigateHome) {
      onNavigateHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/?view=home';
    }
  };

  const handleBackToMemory = () => {
    if(isDirty.current&&!window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))return;
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

  const handleSwitchToHouse = () => {
    if(isDirty.current&&!window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))return;
    if (onSwitchStudio) {
      onSwitchStudio('house');
    } else if (typeof window !== 'undefined') {
      window.location.href = `/?view=memory-house${tagUid ? `&tag=${encodeURIComponent(tagUid)}` : ''}`;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pt-24 sm:pt-28 pb-16 text-slate-100">
      {/* Top Header Bar with Multi-Page Navigation */}
      <header className="sticky top-20 sm:top-24 z-30 bg-stone-950/95 backdrop-blur-md rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border border-white/10 shadow-xl" aria-label="Điều hướng studio">
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
            onClick={handleSwitchToHouse}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium transition-colors cursor-pointer shrink-0"
            title="Chuyển sang Memory House Studio"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Chuyển sang House Studio</span>
          </button>

          {onNavigateShop && (
            <button
              onClick={() => {if(!isDirty.current||window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))onNavigateShop();}}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
              title="Xem Cửa Hàng & Bộ Sưu Tập"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Cửa hàng</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mismatch Studio</span>
          </div>

          {studioMode === 'editor' && (
            <div className="shrink-0">
              {autosaveState === 'saving' && (
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Đang lưu...</span>
                </span>
              )}
              {autosaveState === 'saved' && (
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Đã lưu</span>
                </span>
              )}
              {autosaveState === 'error' && (
                <button
                  type="button"
                  onClick={() => handleSaveDraft()}
                  className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 hover:text-rose-200 border border-rose-500/30 flex items-center gap-1 cursor-pointer"
                  title="Bấm để thử lưu lại"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Chưa lưu — thử lại</span>
                </button>
              )}
            </div>
          )}

          {viewData?.status === 'draft' && currentUser && (
            <button
              onClick={() => setStudioMode(studioMode === 'editor' ? 'player' : 'editor')}
              type="button"
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer shrink-0"
            >
              {studioMode === 'editor' ? 'Xem trước khi chơi' : 'Chọn chủ đề'}
            </button>
          )}
        </div>
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

      <p className="mb-5 text-sm text-slate-300 rounded-xl bg-white/5 p-4">
        {viewData?.role && <span className="block mb-1 text-rose-200">Bạn đang chơi ở vai trò {viewData.role === 'owner' ? 'người tạo' : 'người được mời'}.</span>}
        Người tạo: <strong>{(studioMode === 'editor' ? ownerName : viewData?.owner_name) || 'Người tạo lượt chơi'}</strong> · Người được mời: <strong>{(studioMode === 'editor' ? partnerName : viewData?.partner_name) || 'Người được mời'}</strong>.
        {' '}Cả hai trả lời về đúng người được nhắc trong câu hỏi, kể cả khi câu hỏi nói về chính mình.
      </p>
      {studioMode === 'player' && viewData?.status === 'active' && (
        <div role="status" aria-live="polite" className="mb-5 p-4 rounded-xl border border-rose-400/30 text-rose-200">
          {viewData.other_submitted ? 'Người cùng chơi đã nộp bài.' : viewData.other_answered_count > 0
            ? `Người cùng chơi đã trả lời ${viewData.other_answered_count}/${viewData.total_questions} câu${viewData.other_answered_count === viewData.total_questions ? ', đang chờ nộp bài' : ''}.`
            : viewData.other_opened_at ? 'Người cùng chơi đã mở lượt chơi, chưa trả lời câu nào.' : 'Chưa ghi nhận người cùng chơi mở link.'}
          <p className="text-xs text-slate-400 mt-1">Tiến độ đã lưu; đáp án chỉ mở sau khi cả hai nộp bài.</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: DRAFT EDITOR (Người tạo soạn thảo câu hỏi)                      */}
      {/* ========================================================================= */}
      {studioMode === 'editor' && (!matchId || viewData?.status === 'draft') && (
        <section aria-labelledby="draft-editor-title">
          <fieldset disabled={isStartingMatch} className="min-w-0 space-y-6">
          <div className="bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
            <div className="max-w-xl">
              <span className="text-xs uppercase tracking-widest text-rose-400 font-bold">Ai cũng có chuyện để chơi cùng nhau</span>
              <h1 id="draft-editor-title" className="text-2xl sm:text-3xl font-serif font-bold text-white mt-1">
                Chọn Chủ Đề · Hiểu Nhau Thêm Chút
              </h1>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                Chọn một chủ đề, EMORIA chuẩn bị câu hỏi cho hai bạn. Cùng trả lời độc lập và mở kết quả sau khi cả hai hoàn thành.
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
                <label htmlFor="match-owner-name" className="block text-xs font-medium text-slate-300 mb-1.5">Tên người tạo lượt chơi</label>
                <input
                  id="match-owner-name"
                  type="text"
                  maxLength={80}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Bạn"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-rose-400 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label htmlFor="match-partner-name" className="block text-xs font-medium text-slate-300 mb-1.5">Tên người được mời</label>
                <input
                  id="match-partner-name"
                  type="text"
                  maxLength={80}
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Người được mời"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-rose-400 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-serif text-white">Chọn chủ đề — chơi cùng ai cũng được</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Chủ đề Mismatch">
              {MATCH_TOPICS.map(topic => <button key={topic.id} type="button" onClick={() => handleSelectTopic(topic.id)}
                disabled={isStartingMatch || uploadingImageIndex !== null} aria-pressed={selectedTopic === topic.id}
                className={`text-left p-4 rounded-2xl border bg-gradient-to-br ${topic.color} ${selectedTopic === topic.id ? 'ring-2 ring-rose-300' : ''} disabled:opacity-50`}>
                <span className="text-2xl mr-2">{topic.emoji}</span><span className="font-semibold">{topic.title}</span>
                <span className="block text-xs text-slate-300 mt-2">{topic.tagline}</span>
              </button>)}
            </div>
            <p className="text-sm text-slate-300">EMORIA chọn sẵn 5 câu hỏi. Bạn có thể đổi câu khác trong cùng chủ đề và chơi lại để thử những câu chưa gặp.</p>
            {!selectedTopic && questions.length > 0 && <p className="text-xs text-amber-200">Bộ câu hỏi từ bản nháp trước vẫn được giữ lại. Chọn chủ đề để thay bằng một bộ mới.</p>}
            {questions.map((q, qIndex) => <article key={q.id || qIndex} className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-white">{qIndex + 1}. {formatMatchQuestion(q.text, ownerName, partnerName)}</h3>
                {selectedTopic && <button type="button" onClick={() => handleRerollQuestion(qIndex)} disabled={isStartingMatch || uploadingImageIndex !== null}
                  className="shrink-0 text-xs text-rose-300 border border-rose-300/30 rounded-full px-3 py-2 disabled:opacity-50">Đổi câu khác</button>}
              </div>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-slate-300">{q.options.map((option,i) => <li key={i} className="rounded-xl bg-black/20 px-3 py-2">{String.fromCharCode(65+i)}. {option}</li>)}</ul>
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


            </article>)}
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleSaveDraft()}
                disabled={isSavingDraft}
                className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold border border-white/15 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingDraft ? 'Đang lưu bản nháp...' : 'Lưu bản nháp'}
              </button>
              {autosaveState === 'saved' && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Đã tự động lưu</span>
                </span>
              )}
              {autosaveState === 'saving' && (
                <span className="text-xs text-rose-300 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tự động lưu...</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleBeginMatch}
              disabled={isStartingMatch || isSavingDraft || uploadingImageIndex !== null || !currentUser}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-sm shadow-xl shadow-rose-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <Heart className="w-4 h-4 fill-white" />
              <span>{isStartingMatch ? 'Đang kích hoạt...' : 'Kích Hoạt & Lấy Link Gửi Bạn Chơi'}</span>
            </button>
          </div>
          </fieldset>
        </section>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: ACTIVE GAMEPLAY (1 câu hỏi trên mỗi màn hình)                     */}
      {/* ========================================================================= */}
      {studioMode === 'player' && viewData && viewData.status !== 'completed' && !viewData.my_submitted && (
        <section aria-labelledby="active-match-title" className="space-y-6">
          {/* Partner Invite Header Alert (nếu là Owner tạo phòng) */}
          {inviteLink && viewData?.role === 'owner' && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Liên kết gửi cho người cùng chơi</p>
                  <p className="text-xs text-slate-300">Người cùng chơi sẽ mở link này trên điện thoại để trả lời độc lập.</p>
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
                  {formatMatchQuestion(currentQ.text, viewData.owner_name, viewData.partner_name)}
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
              Đáp án của bạn đã được niêm phong an toàn. Đang chờ người cùng chơi hoàn tất lượt chơi để cùng hé lộ mức độ đồng điệu nhé!
            </p>

            {inviteLink && (
              <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                <p className="text-xs text-slate-400">Nếu người cùng chơi chưa nhận được link:</p>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 transition-colors cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Đã sao chép link mời!' : 'Sao chép liên kết cho người cùng chơi'}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => loadMatchData(matchId, accessInviteToken)}
              className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer shadow-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Kiểm tra xem người cùng chơi đã nộp chưa</span>
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
                <span>Kết Quả Chơi Vui Cùng Nhau</span>
              </div>

              <h2 id="reveal-screen-title" className="text-3xl sm:text-4xl font-serif font-bold text-white">
                {viewData.title || 'Mismatch'}
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
                    ? 'Đoán ý quá chuẩn! Có chuyện nào hai người chưa kể nhau nghe không? 🎉'
                    : viewData.match_percentage >= 70
                    ? 'Khá hiểu nhau rồi! Xem câu nào vẫn gây bất ngờ nhé ✨'
                    : viewData.match_percentage >= 50
                    ? 'Có vài pha đoán trật đáng để hỏi lại đây 😄'
                    : 'Hành trình thú vị để cùng khám phá và thấu hiểu nhau hơn 🌱'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Trùng khớp {viewData.match_count || 0} trên tổng số {viewData.total_questions || 0} câu hỏi. Điểm chỉ để vui, không đánh giá mối quan hệ.
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
                  <span>Chia sẻ lượt chơi</span>
                </button>
                {currentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      justCreatedIdRef.current = 'new';
                      draftQueue.current = null;
                      progressQueue.current = null;
                      isInitialLoad.current = false;
                      isDirty.current = false;
                      setError('');
                      setSuccessMsg('');
                      setPartnerNotice('');
                      setAutosaveState('idle');
                      setViewData(null);
                      setAccessInviteToken('');
                      setShareInviteToken('');
                      setAnswers([]);
                      setCurrentQuestionIndex(0);
                      setMatchId(null);
                      onMatchChange?.(null);
                      setStudioMode('editor');
                      handleSelectTopic(selectedTopic || 'lifestyle');
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

                    <p className="text-base font-semibold text-white mb-4">{formatMatchQuestion(item.question_text, viewData.owner_name, viewData.partner_name)}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/5">
                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          {viewData.owner_name || 'Người tạo'}
                        </span>
                        <p className="text-sm font-medium text-rose-200">
                          {item.owner_answer_text || 'Chưa trả lời'}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          {viewData.partner_name || 'Người được mời'}
                        </span>
                        <p className="text-sm font-medium text-pink-200">
                          {item.partner_answer_text || 'Chưa trả lời'}
                        </p>
                      </div>
                    </div>
                    {!isMatched && <p className="mt-3 text-sm text-slate-300">{getComplementaryInsight(item.question_text,item.owner_answer_text,item.partner_answer_text,viewData.owner_name || 'Người tạo',viewData.partner_name || 'Người được mời').advice}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {/* Realtime Partner Submitted Toast */}
      <AnimatePresence>
        {partnerNotice && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm p-4 rounded-2xl bg-gradient-to-r from-rose-900/90 to-purple-900/90 border border-rose-500/40 text-white shadow-2xl backdrop-blur-xl flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-rose-500/30 flex items-center justify-center shrink-0 text-rose-300">
              <Sparkles className="w-5 h-5 animate-spin" />
            </div>
            <div className="flex-1 text-xs">
              <p className="font-bold text-sm text-rose-200">Tin nhắn mới ✨</p>
              <p className="text-slate-200 mt-0.5">{partnerNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setPartnerNotice('')}
              className="text-slate-400 hover:text-white p-1 cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Utility: Report Content Button */}
      {matchId && (
        <footer className="mt-12 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
          <span>EMORIA Mismatch Studio</span>
          <button
            type="button"
            onClick={() => {
              setShowReportModal(true);
              setReportSuccess(false);
            }}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" />
            <span>Báo cáo nội dung</span>
          </button>
        </footer>
      )}

      {/* Content Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <Flag className="w-4 h-4" />
                  <span>Báo Cáo Nội Dung Vi Phạm</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {reportSuccess ? (
                <div className="text-center py-6 space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <p className="text-sm font-semibold text-white">Đã gửi báo cáo thành công</p>
                  <p className="text-xs text-slate-400">
                    Cảm ơn bạn. Ban quản trị sẽ nhanh chóng xem xét và xử lý để bảo vệ môi trường văn minh.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="mt-4 px-6 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setIsReporting(true);
                    try {
                      await submitContentReport('match', matchId, reportReason, reportDetails, initialInviteToken);
                      setReportSuccess(true);
                    } catch (err) {
                      alert(err?.message || 'Lỗi khi gửi báo cáo.');
                    } finally {
                      setIsReporting(false);
                    }
                  }}
                  className="space-y-4 text-xs"
                >
                  <p className="text-slate-300">
                    Nếu bạn phát hiện câu hỏi hoặc hình ảnh trong thử thách này vi phạm tiêu chuẩn cộng đồng, vui lòng cho chúng tôi biết:
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-slate-400 font-semibold block">Lý do báo cáo:</label>
                    <select
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-rose-400"
                    >
                      <option value="inappropriate_content">Nội dung không phù hợp văn hóa</option>
                      <option value="harassment">Quấy rối / Đả kích cá nhân</option>
                      <option value="copyright">Vi phạm quyền riêng tư / Bản quyền</option>
                      <option value="spam">Spam / Quảng cáo</option>
                      <option value="other">Lý do khác</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-400 font-semibold block">Chi tiết bổ sung (tùy chọn):</label>
                    <textarea
                      rows={3}
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      placeholder="Mô tả cụ thể câu hỏi hoặc hình ảnh vi phạm..."
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setShowReportModal(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isReporting}
                      className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold disabled:opacity-50 cursor-pointer"
                    >
                      {isReporting ? 'Đang gửi...' : 'Gửi báo cáo'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
