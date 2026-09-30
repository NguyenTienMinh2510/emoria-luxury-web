import {useLanguage} from '../i18n/LanguageProvider';
import {apiRequest} from '../services/apiClient.js';
import NfcTools from '../components/NfcTools';
import VideoLabelEditor from '../components/VideoLabelEditor';
import MemoryMediaEditor from '../components/MemoryMediaEditor';
import MemoryMovieEditor from '../components/MemoryMovieEditor';
import MemoryCinema from '../components/MemoryCinema';
import LuxuryUnboxingExperience from '../components/LuxuryUnboxingExperience';
import AiLetterMuseModal from '../components/AiLetterMuseModal';
import CuratedMelodiesModal from '../components/CuratedMelodiesModal';
import confetti from 'canvas-confetti';
import {callStore} from '../services/catalogService';
import {useStore} from '../components/StoreProvider';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SmartphoneNfc, Volume2, VolumeX, Play, Pause, Heart, Mail, 
  Share2, Lock, Unlock, Sparkles, Calendar, User, Eye, Send, 
  ChevronLeft, ChevronRight, CheckCircle2, ShieldCheck, Image as ImageIcon,
  Edit3, Key, Clock, AlertTriangle, Save, X, Loader2, ArrowLeft, Music, Feather, Film, Home, Upload
} from 'lucide-react';
import { getHouseDraft, getPublicHouseByTag, HOUSE_ROOMS_SPEC, HOUSE_THEMES } from '../services/eventService.js';
import { 
  fetchMemoryView, 
  verifyMemoryPin, 
  claimNfcOwnership, 
  updateMemorySpace, 
  submitGuestbookEntry, 
  getShowcaseMemoriesList 
} from '../services/memoryService';

export default function MemorySpaceView({ initialTag = 'emoria-lumen', onNavigateToHome, onNavigateToShop, currentUser, onOpenAuth, onSelectTag, onOpenPrivacy, onOpenHouseStudio }) {
  const {t, tBilingual, language}=useLanguage();
  const {settings}=useStore();
  const [editMedia,setEditMedia]=useState([]);
  const [videoConsent,setVideoConsent]=useState(false);
  const [tagInput,setTagInput]=useState('');
  const [introPath,setIntroPath]=useState(''),[extraLetters,setExtraLetters]=useState([]),[movieBusy,setMovieBusy]=useState(false),[movieDone,setMovieDone]=useState(false),[studioError,setStudioError]=useState(''),[guestEntries,setGuestEntries]=useState([]);
  const loadSequence=useRef(0);
  const [currentTag, setCurrentTag] = useState(initialTag);
  const [memoryData, setMemoryData] = useState(null);
  const [houseData, setHouseData] = useState(null);
  const [activeHouseRoomIndex, setActiveHouseRoomIndex] = useState(0);
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
  const [editAuthor, setEditAuthor] = useState('');
  const [editQuote, setEditQuote] = useState('');
  const [editLetter, setEditLetter] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [editAudioTitle, setEditAudioTitle] = useState('');
  const [editAudioUrl, setEditAudioUrl] = useState('');
  // 3 Hành động PIN rõ ràng: 'KEEP' | 'SET' | 'REMOVE' (Tránh xóa nhầm PIN khi update title)
  const [pinAction, setPinAction] = useState('KEEP');
  const [newPinCode, setNewPinCode] = useState('');
  const [editPinHint, setEditPinHint] = useState('');
  const [isSavingEditor, setIsSavingEditor] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [studioStep, setStudioStep] = useState(1);

  const studioProgress = useMemo(() => {
    let score = 0;
    if (editTitle?.trim()) score += 15;
    if (editAuthor?.trim() || editRecipient?.trim()) score += 15;
    if (editLetter?.trim()) score += 25;
    if (editAudioUrl?.trim()) score += 15;
    if (introPath?.trim()) score += 15;
    if (editMedia?.length > 0) score += 10;
    if (pinAction === 'KEEP' || (pinAction === 'SET' && newPinCode) || pinAction === 'REMOVE') score += 5;
    return Math.min(100, score);
  }, [editTitle, editAuthor, editRecipient, editLetter, editAudioUrl, introPath, editMedia, pinAction, newPinCode]);

  const [isPlaying,setIsPlaying]=useState(false),[audioError,setAudioError]=useState('');
  const audioRef=useRef(null);
  const letterVideoRef=useRef(null);

  // Letter Reveal State
  const [isLetterOpen, setIsLetterOpen] = useState(false);

  // Tự động phát video tâm sự ngay khi mở thư
  useEffect(() => {
    if (isLetterOpen && letterVideoRef.current) {
      const playPromise = letterVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (letterVideoRef.current) {
            letterVideoRef.current.muted = true;
            letterVideoRef.current.play().catch(() => {});
          }
        });
      }
    }
  }, [isLetterOpen, memoryData?.intro_video_url]);

  // Lightbox Media Preview
  const [fullScreenImage, setFullScreenImage] = useState(null);

  // Guestbook Form State
  const [guestAuthor, setGuestAuthor] = useState('');
  const [guestRelation, setGuestRelation] = useState('Người thương');
  const [guestMessage, setGuestMessage] = useState('');
  const [guestSuccess, setGuestSuccess] = useState(false);
  const [isSendingGuest, setIsSendingGuest] = useState(false);

  // Unboxing, AI Muse & Curated Melodies Modal States
  const [showUnboxing, setShowUnboxing] = useState(false);
  const [isAiMuseOpen, setIsAiMuseOpen] = useState(false);
  const [isCuratedMelodiesOpen, setIsCuratedMelodiesOpen] = useState(false);
  const [reactionSent, setReactionSent] = useState('');

  // Load showcase memories list for dropdown
  useEffect(() => {
    let active=true;
    const showcase=settings?.sandbox?getShowcaseMemoriesList():[];
    const request=currentUser?apiRequest('/me/memories'):Promise.resolve([]);
    request.then(data=>{if(active)setAllMemories([...(data||[]),...showcase].filter((m,i,all)=>all.findIndex(x=>x.tag_uid===m.tag_uid)===i));}).catch(()=>{if(active)setAllMemories(showcase);});
    return()=>{active=false;};
  }, [currentUser,settings?.sandbox]);

  // Fetch memory data on tag change
  const loadMemory = async (tag) => {
    const sequence=++loadSequence.current;
    setLoading(true);
    setMemoryData(null);
    setErrorMessage('');
    try {
      const res = await fetchMemoryView(tag);
      if(sequence!==loadSequence.current)return;
      if (res.success && res.data) {
        setMemoryData(res.data);
        // Pre-fill editor states
        setEditTitle(res.data.title || '');
        setEditAuthor(res.data.author || '');
        setEditQuote(res.data.quote || '');
        setEditLetter(res.data.letter || '');
        setEditRecipient(res.data.recipient || '');
        setEditAudioTitle(res.data.audio_title || '');
        setEditAudioUrl(res.data.audio_path || '');
        setIntroPath(res.data.intro_video_path||'');setExtraLetters(res.data.letters||[]);
        if(res.data.is_owner)setMovieDone(true);
        setEditMedia((res.data.studio_media||res.data.media_gallery||[]).filter(m=>m.path).map(m=>({path:m.path,type:m.type,caption:m.caption})));
        setPinAction('KEEP');
        setNewPinCode('');
        setEditPinHint(res.data.pin_hint || '');

        // Trigger unboxing ceremony for recipient/guest if not yet unboxed in this session
        const alreadyUnboxed = (typeof sessionStorage !== 'undefined') && sessionStorage.getItem('emoria_unboxed_' + tag);
        if (!res.data.is_owner && !alreadyUnboxed && !res.data.is_protected) {
          setShowUnboxing(true);
        }

        // Tải dữ liệu Ngôi Nhà Kỷ Niệm cho chip này
        setHouseData(null);
        if (res.data.is_owner) {
          // Chỉ owner mới được phép gọi getHouseDraft để xem/sửa bản nháp
          try {
            const draft = await getHouseDraft(tag);
            if (draft && Array.isArray(draft.rooms)) {
              setHouseData({ ...draft, is_owner_draft: true });
            }
          } catch {
            setHouseData(null);
          }
        } else {
          // Recipient hoặc Guest: TUYỆT ĐỐI KHÔNG gọi draft endpoint!
          // Gọi endpoint public lấy published House theo tag_uid
          try {
            const pubHouse = await getPublicHouseByTag(tag);
            if (pubHouse && Array.isArray(pubHouse.rooms)) {
              setHouseData({ ...pubHouse, is_published_snapshot: true });
            }
          } catch {
            // Chưa publish hoặc ở chế độ riêng tư -> set null để hiển thị empty state
            setHouseData(null);
          }
        }
      } else {
        setErrorMessage(res.message || t("Không thể tải dữ liệu kỷ vật.","Could not load this memory."));
      }
    } catch (err) {
      setErrorMessage(err.message || t("Lỗi khi tải dữ liệu.","Could not load data."));
    } finally {
      if(sequence!==loadSequence.current)return;
      setLoading(false);
      setIsPlaying(false);
      setAudioError('');
      setIsLetterOpen(false);
    }
  };

  useEffect(() => {
    setMovieDone(false);
    if(currentTag)loadMemory(currentTag);else setLoading(false);
  }, [currentTag,currentUser]);
  useEffect(()=>{setCurrentTag(initialTag);},[initialTag]);
  useEffect(()=>{if(isEditorOpen&&memoryData?.is_owner)callStore('rpc_memory_guestbook',{p_tag:currentTag}).then(res=>setGuestEntries(res||[])).catch(()=>{setGuestEntries((memoryData?.guestbook||[]).map(g=>({...g,author_name:g.author||g.author_name})));});},[isEditorOpen,currentTag,memoryData]);
  useEffect(()=>{const warn=e=>{if(isEditorOpen){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[isEditorOpen]);

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
        setShowUnboxing(true);
      } else {
        setPinError(result.message || t("Mã PIN bảo mật không chính xác.","Incorrect PIN."));
      }
    } catch (err) {
      setPinError(err.message || t("Lỗi khi xác thực mã PIN.","Could not verify PIN."));
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
      setClaimError(err.message || t("Lỗi khi nhận quyền sở hữu.","Could not claim ownership."));
    } finally {
      setIsClaiming(false);
    }
  };

  // Handle Save Editor
  const handleSaveEditor = async (e) => {
    e.preventDefault();
    if(movieBusy||isSavingEditor)return;
    setStudioError('');

    if (!editTitle?.trim()) {
      setStudioError(t("Vui lòng nhập tiêu đề kỷ niệm tại Bước 1.", "Please enter a memory title in Step 1."));
      setStudioStep(1);
      return;
    }
    if (pinAction === 'SET' && (!newPinCode || newPinCode.length < 4)) {
      setStudioError(t("Vui lòng nhập mã PIN mới gồm 4-6 chữ số tại Bước 3.", "Please enter a 4-6 digit PIN in Step 3."));
      setStudioStep(3);
      return;
    }

    setIsSavingEditor(true);

    try {
      await updateMemorySpace(currentTag, {
        version:memoryData.version,
        intro_video_path:introPath,
        letters:extraLetters,
        media_gallery:editMedia,
        title: editTitle,
        author: editAuthor,
        quote: editQuote,
        letter: editLetter,
        recipient: editRecipient,
        audio_title: editAudioTitle,
        audio_url: editAudioUrl,
        pin_action: pinAction,
        pin_code: pinAction === 'SET' ? newPinCode : null,
        pin_hint: pinAction === 'SET' ? (editPinHint.trim() || null) : (pinAction === 'REMOVE' ? null : (editPinHint.trim() || null)),
      });

      setSaveSuccess(true);
      await loadMemory(currentTag);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditorOpen(false);
      }, 1000);
    } catch (err) {
      setStudioError(err.message || t("Lỗi khi lưu thay đổi.","Could not save changes."));
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
      alert(err.message || t("Lỗi khi gửi lời chúc.","Could not send your message."));
    } finally {
      setIsSendingGuest(false);
    }
  };

  if(!currentTag)return (
    <div className="min-h-screen max-w-4xl mx-auto px-5 py-20 space-y-8">
      <div className="flex items-center gap-4">
        {onNavigateToHome && (
          <button className="text-slate-300 hover:text-white underline text-xs font-semibold flex items-center gap-1 cursor-pointer" onClick={onNavigateToHome}>
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("Trang chủ","Home")}</span>
          </button>
        )}
        {onNavigateToShop && (
          <button className="text-slate-400 hover:text-slate-200 underline text-xs cursor-pointer" onClick={onNavigateToShop}>
            {t("← Cửa hàng","← Shop")}
          </button>
        )}
      </div>
      <h1 className="font-serif text-4xl">{t('Kỷ vật của bạn','Your Memory Spaces')}</h1>
      <p className="text-slate-400">{t('Mở kỷ vật được cấp cho tài khoản ngay tại đây, không cần chip NFC. Chủ sở hữu có thể vào Studio; người nhận chỉ xem nội dung.','Open spaces assigned to your account here without an NFC chip. Owners can use Studio; recipients can view the content.')}</p>
      {!currentUser&&<button className="store-button" onClick={onOpenAuth}>{t('Đăng nhập để xem kỷ vật được cấp','Sign in to view your assigned memories')}</button>}
      <div className="grid sm:grid-cols-2 gap-4">
        {allMemories.map(m=><button key={m.tag_uid} className="text-left p-5 border border-white/15 rounded-2xl hover:bg-white/5" onClick={()=>{setCurrentTag(m.tag_uid);onSelectTag?.(m.tag_uid);}}><span className="font-serif text-xl">{m.title}</span><span className="block text-xs text-slate-400 mt-2">{m.jewelry_name||m.tag_uid}</span><span className="block text-sm mt-2 text-amber-200">{m.role==='owner'?t('Chủ sở hữu · có thể chỉnh sửa','Owner · can edit'):m.role==='recipient'?t('Người nhận · chỉ xem','Recipient · view only'):t('Kỷ vật mẫu','Demo memory')}</span></button>)}
      </div>
      {currentUser&&!allMemories.length&&<p>{t('Chưa có kỷ vật được cấp cho tài khoản này.','No memories have been assigned to this account yet.')}</p>}
      <details className="border border-white/15 rounded-xl p-4"><summary className="cursor-pointer">{t('Mở bằng chip NFC (tùy chọn)','Open with NFC chip (optional)')}</summary><NfcTools onRead={tag=>{setCurrentTag(tag);onSelectTag?.(tag);}}/></details>
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();const tag=tagInput.trim().toLowerCase();if(/^[a-z0-9-]{1,64}$/.test(tag)){setCurrentTag(tag);onSelectTag?.(tag);}}}>
        <label className="store-label">{t('Hoặc nhập mã kỷ vật bạn được chia sẻ','Or enter a shared memory ID')}<input required pattern="[a-zA-Z0-9-]{1,64}" className="store-input" value={tagInput} onChange={e=>setTagInput(e.target.value)} placeholder="emo-…"/></label>
        <button className="store-button">{t("Mở kỷ vật","Open memory")}</button>
      </form>
    </div>
  );
  if (loading) {
    return (
      <div className="w-full min-h-screen bg-dark-950 flex flex-col items-center justify-center text-slate-300 gap-3">
        <Sparkles className="w-8 h-8 animate-spin text-white" />
        <p className="font-serif text-sm uppercase tracking-widest">{t("Đang mở kỷ niệm của bạn…","Opening your memory…")}</p>
      </div>
    );
  }

  if (errorMessage || !memoryData) {
    return (
      <div className="w-full min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
        <h3 className="font-serif text-xl font-bold text-white mb-2">{t("Thông Báo Truy Xuất Kỷ Vật","Memory access")}</h3>
        <p className="text-xs text-slate-400 max-w-md mb-6">{errorMessage || t("Không tìm thấy dữ liệu.","No data found.")}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => loadMemory(currentTag)}
            className="px-6 py-2.5 rounded-full bg-white text-dark-950 font-bold text-xs uppercase cursor-pointer hover:bg-slate-200 transition-all"
          >
            {t("Thử tải lại kỷ vật","Reload memory")}
          </button>
          {onNavigateToHome && (
            <button
              onClick={onNavigateToHome}
              className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase border border-white/20 cursor-pointer transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t("Về Trang Chủ","Back to Home")}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const isTimedLock = memoryData.availability?.status === 'timed_lock';
  const isSuspended = memoryData.availability?.status === 'suspended';
  const isLockedByPin = memoryData.is_protected && !memoryData.is_unlocked;

  return (
    <div className="w-full min-h-screen bg-dark-950 text-slate-100 pt-24 pb-24 selection:bg-white/20">
      
      {memoryData.media_warning&&<p role="status" className="max-w-4xl mx-auto px-4 py-3 mb-4 text-sm text-amber-200">{memoryData.media_warning}</p>}
      {/* 0. Top Back Bar */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-4 flex items-center justify-between">
        {onNavigateToHome ? (
          <button
            onClick={onNavigateToHome}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/15 text-xs text-slate-200 hover:text-white transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("Quay lại Trang Chủ","Back to Home")}</span>
          </button>
        ) : <div />}
        {onNavigateToShop && (
          <button
            onClick={onNavigateToShop}
            className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            {t("Khám phá Cửa Hàng →","Explore the Shop →")}
          </button>
        )}
      </div>

      <details className="max-w-5xl mx-auto px-4 sm:px-6 mb-4"><summary className="cursor-pointer text-sm">{t("Mở kỷ vật khác bằng NFC","Open another memory with NFC")}</summary><NfcTools onRead={tag=>{setCurrentTag(tag);onSelectTag?.(tag);}} /></details>
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
                {memoryData.is_recipient&&!memoryData.is_owner&&<span className="text-sky-200 text-[9px]">{t('NGƯỜI NHẬN · CHỈ XEM','RECIPIENT · VIEW ONLY')}</span>}
                {memoryData.is_owner && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{t("CHỦ SỞ HỮU","OWNER")}</span>
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
          <div className="flex flex-col min-[480px]:flex-row w-full sm:w-auto min-w-0 gap-2">
            <select
              value={currentTag}
              aria-label={t("Chọn kỷ vật của bạn","Choose your memory")}
              onChange={(e) => {setCurrentTag(e.target.value);onSelectTag?.(e.target.value);}}
              className="w-full sm:max-w-64 min-h-11 min-w-0 px-3 py-1.5 text-sm rounded-xl bg-black/60 border border-white/20 text-slate-200 focus:outline-none focus:border-white/50 cursor-pointer"
            >
              {!allMemories.some(m=>m.tag_uid===currentTag)&&<option value={currentTag}>{t("Kỷ vật đang mở","Current memory")}</option>}
              {allMemories.map((m) => (
                <option key={m.tag_uid} value={m.tag_uid}>
                  {m.title} ({m.tag_uid})
                </option>
              ))}
            </select>

            {/* If Owner or Admin: Show Studio Button. If Not: Show Claim Chip Button */}
            {memoryData.is_owner ? (
              <>
                <button
                onClick={() => {
                  setEditTitle(memoryData.title || '');
                  setEditAuthor(memoryData.author || '');
                  setEditQuote(memoryData.quote || '');
                  setEditRecipient(memoryData.recipient || '');
                  setEditLetter(memoryData.letter || '');
                  setEditAudioTitle(memoryData.audio_title || '');
                  setEditAudioUrl(memoryData.audio_path || '');
                  setEditMedia((memoryData.studio_media || memoryData.media_gallery || []).filter(m => m.path).map(m => ({ path: m.path, type: m.type, caption: m.caption })));
                  setIntroPath(memoryData.intro_video_path || '');
                  setExtraLetters(memoryData.letters || []);
                  setPinAction('KEEP');
                  setNewPinCode('');
                  setEditPinHint(memoryData.pin_hint || '');
                  setStudioError('');
                  callStore('rpc_memory_guestbook', { p_tag: currentTag, p_action: 'list' }).then(res => setGuestEntries(res || [])).catch(() => {});
                  setStudioStep(1);
                  setIsEditorOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{t("Chỉnh Sửa (Studio)","Edit in Studio")}</span>
              </button>
              {onOpenHouseStudio && (
                <button
                  type="button"
                  onClick={() => onOpenHouseStudio(currentTag)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                  title={t("Mở Memory House Studio","Open Memory House Studio")}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">House Studio</span>
                </button>
              )}
            </>
            ) : !memoryData.is_recipient && (
              <button
                onClick={() => currentUser?setIsClaimModalOpen(true):onOpenAuth?.()}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white text-white hover:text-dark-950 border border-white/20 text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                title={t("Đăng ký quyền sở hữu chiếc trang sức này","Claim this memory")}
              >
                <Key className="w-3.5 h-3.5" />
                <span>{currentUser?t("Tôi là người chuẩn bị quà","I have a legacy claim code"):t('Đăng nhập để xem kỷ vật được cấp','Sign in to view your assigned memories')}</span>
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
              {t("Kỷ Vật Đang Được Niêm Phong","This memory is sealed")}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6 font-light">
              {t("Người tặng đã cài đặt chế độ hẹn giờ mở niêm phong cho chiếc trang sức này. Thời khắc cảm xúc sẽ chính thức mở ra vào:","The sender has scheduled this memory to open at:")}
            </p>

            <div className="p-4 rounded-2xl bg-black/60 border border-amber-500/30 text-amber-300 font-mono text-sm sm:text-base font-bold mb-6">
              ✦ {new Date(memoryData.availability.unlock_date || '2026-10-20').toLocaleString('vi-VN')} ✦
            </div>

            <p className="text-xs text-slate-400 italic">
              {t("“Một món quà bất ngờ luôn xứng đáng để chờ đợi từng giây phút.”","“Some surprises are worth waiting for.”")}
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
              {t("Kỷ Niệm Được Khóa Bảo Mật","Private memory")}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6 font-light">
              {t("Đăng nhập bằng tài khoản được cấp quyền hoặc nhập PIN do người tặng chia sẻ để mở kỷ vật riêng tư.","Sign in with an assigned account or enter the sender’s PIN to view this private memory.")}
            </p>

            {memoryData.pin_hint && (
              <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-amber-600/5 border border-amber-400/40 text-left shadow-lg">
                <div className="flex items-center gap-2 mb-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-300">
                    {t("Gợi ý từ người thương", "Clue from your sender")}
                  </span>
                </div>
                <p className="font-serif text-sm sm:text-base text-amber-100/95 italic leading-relaxed pl-2 border-l-2 border-amber-400/50 my-1.5">
                  “{memoryData.pin_hint}”
                </p>
                <p className="text-[10px] text-amber-300/70 mt-1">
                  {t("✦ Hãy nhớ lại dấu mốc hoặc kỷ niệm đặc biệt chỉ hai người mới biết.", "✦ Recall the shared milestone or intimate memory that only the two of you know.")}
                </p>
              </div>
            )}

            {!currentUser&&<button type="button" className="store-button mb-4 w-full" onClick={onOpenAuth}>{t('Đăng nhập tài khoản được cấp quyền','Sign in with an assigned account')}</button>}
            <form onSubmit={handleVerifyPin} className="space-y-4">
              <input
                type="password"
                maxLength={6}
                placeholder={t("Nhập mã PIN","Enter PIN")}
                aria-label={t("Mã PIN kỷ vật","Memory PIN")}
                inputMode="numeric"
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
                <span>{t("Mở Khóa Kỷ Niệm","Unlock memory")}</span>
              </button>
            </form>

            {onOpenPrivacy && (
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{t("Bảo mật dữ liệu cá nhân theo", "Data secured under")}</span>
                <button
                  type="button"
                  onClick={onOpenPrivacy}
                  className="text-amber-300 hover:text-amber-200 underline font-medium cursor-pointer"
                >
                  {t("Chính sách Emoria", "Emoria Privacy Policy")}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      ) : memoryData.intro_video_url && !movieDone ? (
        <MemoryCinema url={memoryData.intro_video_url} title={memoryData.title} recipient={memoryData.recipient} onComplete={()=>{setMovieDone(true);setIsLetterOpen(true);window.scrollTo({top:0,behavior:'smooth'});}} onRefresh={()=>loadMemory(currentTag)}/>
      ) : (
        /* 4. MAIN MEMORY SPACE (Đã mở khóa hoặc công khai) */
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="flex flex-wrap items-center gap-3">
            {memoryData.intro_video_url&&<button className="store-button" onClick={()=>{audioRef.current?.pause();setIsPlaying(false);setMovieDone(false);}}>▶ {memoryData.is_owner?t("Xem trải nghiệm người nhận","Preview recipient experience"):t("Xem lại bộ phim kỷ niệm","Replay memory film")}</button>}
            <button
              type="button"
              onClick={() => setShowUnboxing(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400/20 to-yellow-500/20 hover:from-amber-400/30 hover:to-yellow-500/30 text-amber-300 border border-amber-400/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Mail className="w-3.5 h-3.5 text-amber-300" />
              <span>{t("Nghi thức mở quà", "Unboxing ceremony")}</span>
            </button>
          </div>
          
          {/* A. Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-white/[0.06] via-white/[0.02] to-transparent border border-white/15 backdrop-blur-2xl text-center relative overflow-hidden shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                <Calendar className="w-3.5 h-3.5" />
                <span>{t("Kỷ niệm:","Memory:")} {memoryData.date || t("Chưa cập nhật","Not set")}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                <Eye className="w-3.5 h-3.5" />
                <span>{t("Lượt mở","Visits")} {memoryData.tap_count || 1} {t("lần","times")}</span>
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-metallic tracking-tight uppercase mb-4 leading-tight">
              {memoryData.title}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 font-light mb-6 flex items-center justify-center gap-2">
              <span>{t("Từ:","From:")} <strong className="text-white font-medium">{memoryData.author || 'Người thương'}</strong></span>
              <span>✦</span>
              <span>{t("Gửi đến:","To:")} <strong className="text-white font-medium">{memoryData.recipient || 'Người thương'}</strong></span>
            </p>

            {memoryData.quote && (
              <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-black/40 border border-white/10 italic text-slate-200 text-sm sm:text-base leading-relaxed relative">
                <span className="text-3xl text-white/30 font-serif absolute -top-3 left-4">“</span>
                <p className="px-3">{memoryData.quote}</p>
                <span className="text-3xl text-white/30 font-serif absolute -bottom-4 right-4">”</span>
              </div>
            )}
          </motion.div>

          {memoryData.audio_url&&<section className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 space-y-4"><h3 className="font-serif text-xl">{memoryData.audio_title||tBilingual("Giai điệu dành cho bạn","Music for you")}</h3><p className="text-sm text-slate-400">{t("Bật nhạc khi đọc những lá thư của chúng mình.","Play music while reading our letters.")}</p><audio key={memoryData.audio_url} ref={audioRef} controls preload="metadata" src={memoryData.audio_url} className="w-full" onError={()=>setAudioError(t("Chưa phát được audio. Bạn có thể tải lại kỷ vật rồi thử lại.","Audio could not play. Reload the memory and try again."))} onPlay={()=>setIsPlaying(true)} onPause={()=>setIsPlaying(false)}/>{audioError&&<p role="alert" className="text-amber-200 text-sm">{audioError} <button className="underline" onClick={()=>{setAudioError('');loadMemory(currentTag);}}>{t("Tải lại","Reload")}</button></p>}</section>}

          {/* C. Hand-written Secret Letter & Spotlight Video (Chỉ hiển thị khi đã mở khóa PIN thành công) */}
          {(memoryData.letter || memoryData.intro_video_url) && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-300" />
                  <h3 className="text-base font-bold text-white uppercase font-serif tracking-wide">
                    {tBilingual("Bức Thư Tay Mật Mã","A Private Letter")}
                  </h3>
                </div>

                <button
                  onClick={() => setIsLetterOpen(!isLetterOpen)}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white text-white hover:text-dark-950 border border-white/20 transition-all cursor-pointer"
                >
                  {isLetterOpen ? t("Gấp Thư Lại","Close letter") : t("Mở Niêm Phong","Open letter")}
                </button>
              </div>

              <AnimatePresence>
                {isLetterOpen ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden space-y-6"
                  >
                    {/* Video Tâm Sự - Spotlight Centerpiece tự bật khi mở thư */}
                    {memoryData.intro_video_url && (
                      <div className="rounded-2xl overflow-hidden border-2 border-amber-400/40 shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_35px_rgba(212,175,55,0.25)] bg-black">
                        <div className="px-4 py-2.5 bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent border-b border-white/10 flex items-center justify-between text-xs text-amber-200">
                          <span className="flex items-center gap-2 font-medium tracking-wide">
                            <Film className="w-4 h-4 text-amber-400 animate-pulse" />
                            <span>{tBilingual("Thước Phim Tâm Sự Cùng Bức Thư", "Heartfelt Video with Letter")}</span>
                          </span>
                          <span className="text-[10px] uppercase tracking-widest text-amber-300 font-semibold px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30">
                            {t("Tự động phát", "Auto Playing")}
                          </span>
                        </div>
                        <div className="relative aspect-video w-full bg-black">
                          <video
                            ref={letterVideoRef}
                            key={`letter-video-${memoryData.intro_video_url}`}
                            src={memoryData.intro_video_url}
                            autoPlay
                            playsInline
                            controls
                            preload="auto"
                            className="w-full h-full object-contain"
                            onPlay={() => {
                              audioRef.current?.pause();
                              setIsPlaying(false);
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Dòng Thư Tay */}
                    {memoryData.letter && (
                      <div className="p-6 sm:p-8 rounded-2xl bg-black/60 border border-white/15 text-slate-200 font-serif text-sm sm:text-base leading-relaxed whitespace-pre-line shadow-inner">
                        {memoryData.letter}
                        <div className="mt-8 pt-4 border-t border-white/10 text-right text-xs italic font-sans text-slate-400">
                          — {memoryData.author || t("Người gửi","Sender")}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div 
                    onClick={() => setIsLetterOpen(true)}
                    className="py-10 border border-dashed border-white/20 rounded-2xl text-center cursor-pointer hover:border-amber-400/50 transition-colors bg-black/20 group"
                  >
                    <Mail className="w-8 h-8 text-amber-300/70 group-hover:text-amber-300 mx-auto mb-2 transition-colors" />
                    <p className="text-sm font-semibold text-white">
                      {tBilingual("Lá thư tay & thước phim đã được giải mã","Letter & Film Unlocked")}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {tBilingual("Bấm vào đây để mở và đón nhận khoảnh khắc xúc động","Tap here to open and experience the heartfelt moments")}
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* D. Photo Gallery */}
          {memoryData.letters?.map((letter,index)=><details key={index} className="p-6 sm:p-8 rounded-3xl border border-white/15 bg-white/[0.03]"><summary className="font-serif text-xl cursor-pointer">✉ {letter.title}</summary><p className="font-serif whitespace-pre-wrap leading-loose text-slate-200 mt-6">{letter.body}</p></details>)}
          {memoryData.media_gallery && memoryData.media_gallery.length > 0 && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-white" />
                  <h3 className="text-base font-bold text-white uppercase font-serif">
                    {tBilingual("Khoảnh Khắc Kỷ Niệm (","Memory moments (")}{memoryData.media_gallery.length})
                  </h3>
                </div>

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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end pointer-events-none">
                      <p className="text-[11px] text-white line-clamp-2">{media.caption}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* D2. MEMORY HOUSE SHOWCASE (NGÔI NHÀ KỶ NIỆM CỦA ĐÔI MÌNH) */}
          <section className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-amber-950/20 via-white/[0.03] to-black/60 border border-amber-500/20 backdrop-blur-xl space-y-6 relative overflow-hidden shadow-2xl">
            {/* Ambient Background Glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 relative z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <Home className="w-4 h-4 text-amber-400" />
                  <span>✦ {tBilingual("NGÔI NHÀ KỶ NIỆM CỦA ĐÔI MÌNH", "OUR SACRED MEMORY HOUSE")} ✦</span>
                  {memoryData.is_owner && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      {houseData?.is_published ? t("Đã Xuất Bản", "Published") : t("Bản Nháp Của Bạn", "Your Draft")}
                    </span>
                  )}
                </div>
                <h3 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
                  {houseData?.title || tBilingual("Ngôi Nhà Kỷ Niệm Của Đôi Mình", "Our Memory House")}
                </h3>
                <p className="text-xs text-slate-300 font-light max-w-xl">
                  {t(
                    "Không gian lưu giữ những nấc thang cảm xúc và kỷ niệm đẹp đẽ nhất của tình yêu đôi lứa.",
                    "An intimate sanctuary preserving the cherished milestones of your journey together."
                  )}
                </p>
              </div>

              {onOpenHouseStudio && (memoryData.is_owner || (houseData && houseData.is_published_snapshot)) && (
                <button
                  type="button"
                  onClick={() => onOpenHouseStudio(currentTag)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-400 hover:bg-amber-300 text-dark-950 font-bold text-xs shadow-lg transition-all cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{memoryData.is_owner ? t("Mở & Quản Lý Trong Studio", "Manage in Studio") : t("Bước Vào Ngôi Nhà", "Enter Full House")}</span>
                </button>
              )}
            </div>

            {/* Content Logic: Owner vs Recipient/Guest */}
            {(!houseData || (!memoryData.is_owner && !houseData.is_published_snapshot)) ? (
              /* EMPTY STATE CHO GUEST HOẶC KHI CHƯA PUBLISH */
              <div className="py-12 border border-dashed border-white/15 rounded-3xl text-center space-y-3 bg-black/20 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto text-amber-300">
                  <Home className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md mx-auto px-4">
                  <p className="text-sm font-semibold text-white">
                    {memoryData.is_owner
                      ? t("Chưa có Ngôi Nhà Kỷ Niệm nào được tạo cho kỷ vật này.", "No Memory House created yet for this gift.")
                      : t("Ngôi Nhà Kỷ Niệm hiện chưa được xuất bản công khai.", "The Memory House for this memory is currently private.")}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {memoryData.is_owner
                      ? t("Hãy bước vào House Studio để xây dựng 5 căn phòng và tải lên những bức ảnh ngọt ngào đầu tiên.", "Step into House Studio to build 5 romantic rooms with your favorite moments.")
                      : t("Không gian ngôi nhà riêng tư đang được người tặng chăm chút. Hãy quay lại khi ngôi nhà được mở cửa nhé.", "The intimate sanctuary is being lovingly curated. Check back once it is published.")}
                  </p>
                </div>
                {memoryData.is_owner && onOpenHouseStudio && (
                  <button
                    type="button"
                    onClick={() => onOpenHouseStudio(currentTag)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-dark-950 text-xs font-bold hover:bg-slate-200 transition-colors shadow-sm cursor-pointer mt-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t("Khởi Tạo Ngôi Nhà Ngay", "Create Memory House")}</span>
                  </button>
                )}
              </div>
            ) : (
              /* PUBLISHED SNAPSHOT (GUEST/RECIPIENT) HOẶC OWNER DRAFT (OWNER) */
              <>
                {/* 5 Rooms Switcher */}
                <div className="overflow-x-auto pb-2 scrollbar-none relative z-10">
                  <div className="flex items-center gap-2 min-w-max">
                    {(houseData.rooms || []).map((room, idx) => {
                      const isSelected = activeHouseRoomIndex === idx;
                      const photoCount = room.memories?.length || 0;
                      return (
                        <button
                          key={room.id || idx}
                          type="button"
                          onClick={() => setActiveHouseRoomIndex(idx)}
                          className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-400 text-dark-950 border-amber-400 shadow-md'
                              : 'bg-black/40 border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          <span>{room.name || `Phòng ${idx + 1}`}</span>
                          {photoCount > 0 && (
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                              isSelected ? 'bg-dark-950 text-amber-300' : 'bg-white/10 text-slate-400'
                            }`}>
                              {photoCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Room Content */}
                {(() => {
                  const roomsList = houseData.rooms || [];
                  const currentActiveRoom = roomsList[activeHouseRoomIndex] || roomsList[0] || {};
                  const roomMemories = currentActiveRoom.memories || [];

                  return (
                    <div className="space-y-4 relative z-10">
                      {/* Room Note / Story */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                        <p className="text-xs uppercase tracking-wider text-amber-300/80 font-bold font-mono">
                          {currentActiveRoom.name || `Phòng ${activeHouseRoomIndex + 1}`}
                        </p>
                        <p className="font-serif text-sm sm:text-base text-slate-200 italic leading-relaxed">
                          {currentActiveRoom.note ? `“${currentActiveRoom.note}”` : `“Nơi lưu giữ những khoảnh khắc dịu dàng nhất của đôi mình.”`}
                        </p>
                      </div>

                      {/* Room Photos */}
                      {roomMemories.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {roomMemories.map((mem, memIdx) => (
                            <div
                              key={mem.id || memIdx}
                              onClick={() => mem.photo_url && setFullScreenImage({ url: mem.photo_url, caption: mem.caption || currentActiveRoom.name })}
                              className="bg-[#faf8f5] text-slate-800 rounded-2xl p-3 shadow-lg space-y-2 cursor-pointer hover:-translate-y-1 transition-transform group"
                            >
                              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-200">
                                {mem.photo_url ? (
                                  <img
                                    src={mem.photo_url}
                                    alt={mem.caption || currentActiveRoom.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                                    Ảnh đang tải
                                  </div>
                                )}
                              </div>
                              {mem.caption && (
                                <p className="text-[11px] text-slate-600 line-clamp-1 italic font-serif text-center px-1">
                                  {mem.caption}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-10 border border-dashed border-white/15 rounded-2xl text-center space-y-2 bg-black/20">
                          <Home className="w-8 h-8 text-amber-300/40 mx-auto" />
                          <p className="text-xs sm:text-sm text-slate-300 font-medium">
                            {t("Căn phòng này chưa có bức ảnh nào.", "This room has no photos yet.")}
                          </p>
                          {memoryData.is_owner && onOpenHouseStudio && (
                            <button
                              type="button"
                              onClick={() => onOpenHouseStudio(currentTag)}
                              className="text-xs text-amber-300 hover:text-amber-200 underline font-semibold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Upload className="w-3 h-3" />
                              <span>{t("Tải ảnh vào phòng này trong Studio", "Upload photo to this room")}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </section>

          {/* E. Guestbook (Sổ Lưu Niệm) */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
            <h3 className="text-base font-bold text-white uppercase font-serif mb-2 flex items-center gap-2">
              <Heart className="w-4 h-4 text-white fill-current" />
              <span>{tBilingual("Sổ Lưu Niệm & Lời Chúc Gửi Tới Kỷ Vật","Guestbook & wishes")}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              {t("Viết một lời nhắn cho người nhận. Lời nhắn sẽ xuất hiện sau khi người chuẩn bị quà duyệt.","Leave a message for the recipient. It will appear after the owner approves it.")}
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
                  {(memoryData.is_owner || memoryData.is_admin) && (
                    <div className="flex items-center justify-end gap-3 pt-2 mt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(`Xóa lời nhắn của "${entry.author}"?`)) {
                            try {
                              await callStore('rpc_memory_guestbook', { p_tag: currentTag, p_id: entry.id, p_action: 'delete' });
                              await loadMemory(currentTag);
                            } catch (err) {
                              alert(err.message || t("Lỗi khi xóa lời nhắn.","Could not delete the message."));
                            }
                          }
                        }}
                        className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
                      >
                        {t("Xóa lời nhắn này","Delete this message")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Heartfelt Sentiments to Gift Giver */}
            <div className="mb-6 p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
              <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5 font-serif">
                <Heart className="w-3.5 h-3.5 fill-amber-400/40 text-amber-300" />
                <span>{t("Gửi lời cảm xúc ấm áp đến người tặng quà:", "Send heartfelt warmth to the gift giver:")}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { textVi: 'Gửi một cái ôm ấm áp', textEn: 'Sending a warm hug' },
                  { textVi: 'Thương mến gửi trao', textEn: 'With all my love' },
                  { textVi: 'Món quà vô cùng ý nghĩa', textEn: 'Deeply touched by your gift' },
                  { textVi: 'Cảm ơn người thương', textEn: 'Thank you from my heart' }
                ].map((reaction, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={async () => {
                      try {
                        const authorName = guestAuthor || memoryData.recipient || (language === 'en' ? 'Beloved recipient' : 'Người nhận thương mến');
                        const msg = language === 'en' ? reaction.textEn : reaction.textVi;
                        await callStore('rpc_memory_guestbook', {
                          p_tag: currentTag,
                          p_action: 'add',
                          p_author: authorName,
                          p_relationship: language === 'en' ? 'Recipient' : 'Người nhận',
                          p_message: msg
                        });
                        setReactionSent(msg);
                        setTimeout(() => setReactionSent(''), 3000);
                        try { confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } }); } catch {}
                        loadMemory(currentTag);
                      } catch {
                        // fallback
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] hover:from-amber-400/20 hover:to-amber-500/10 text-slate-200 hover:text-amber-200 border border-white/10 hover:border-amber-400/40 text-xs font-medium transition-all active:scale-95 flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Heart className="w-3 h-3 text-amber-300/80 fill-amber-300/20" />
                    <span>{language === 'en' ? reaction.textEn : reaction.textVi}</span>
                  </button>
                ))}
              </div>
              {reactionSent && (
                <p className="text-[11px] text-emerald-300 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t("Đã gửi trọn vẹn yêu thương đến người tặng quà.", "Your warmth has been lovingly sent to the giver.")}</span>
                </p>
              )}
            </div>

            <form onSubmit={handleSendGuestbook} className="p-4 rounded-2xl bg-black/50 border border-white/15 space-y-3">
              <p className="text-xs font-semibold text-white">{t("Gửi thêm lời chúc mới:","Leave a wish:")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder={t("Tên của bạn...","Your name...")}
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
                placeholder={t("Viết lời nhắn gửi hoặc lời chúc yêu thương tại đây...","Write your message or wish here...")}
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
                    <span>{t("Đã lưu lời chúc, đang chờ duyệt.","Your message is awaiting approval.")}</span>
                  </span>
                ) : <span />}

                <button
                  type="submit"
                  disabled={isSendingGuest}
                  className="px-4 py-2 rounded-xl bg-white text-dark-950 text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow disabled:opacity-50"
                >
                  {isSendingGuest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{t("Lưu Lời Nhắn","Save message")}</span>
                </button>
              </div>
            </form>
          </div>

          {onNavigateToShop && memoryData.is_owner && (
            <div className="text-center pt-6">
              <button
                onClick={onNavigateToShop}
                className="px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/15 text-xs font-semibold tracking-wider uppercase transition-all"
              >
                {t("← Quay lại Cửa Hàng Trang Sức","← Back to the Shop")}
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
                <h3 className="font-bold text-white text-base uppercase">{t("Nhận Quyền Sở Hữu Chip NFC","Claim a legacy Memory Space")}</h3>
              </div>
              <button onClick={() => setIsClaimModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 font-light leading-relaxed">
              {t("Mỗi món trang sức Emoria đi kèm thẻ bảo hành kim loại chứa","For older gifts, use the")} <strong>{t("Mã Xác Nhận Claim Code","one-time claim code")}</strong> {t("một lần duy nhất. Nhập mã để gắn quyền sở hữu vào tài khoản của bạn.","provided with the gift to assign ownership to your account.")}
            </p>

            <form onSubmit={handleClaim} className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  {t("Mã nhận quyền được cung cấp cùng đơn hàng:","Claim code supplied with the order:")}
                </label>
                <input
                  type="text"
                  placeholder={t("Nhập mã nhận quyền","Enter claim code")}
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
                <span>{t("Xác Nhận Quyền Sở Hữu","Confirm ownership")}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OWNER STUDIO (CHỈNH SỬA TOÀN DIỆN & QUẢN LÝ PIN AN TOÀN) */}
      {isEditorOpen && (
        <div 
          className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
          onClick={() => {if(window.confirm(t("Đóng và bỏ thay đổi chưa lưu?","Close and discard unsaved changes?")))setIsEditorOpen(false);}}
        >
          <div 
            className="w-full max-w-2xl my-2 sm:my-8 p-4 sm:p-8 rounded-3xl bg-dark-900 border border-white/25 shadow-2xl text-slate-100 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-bold text-white text-lg uppercase font-serif">{t("Studio Quản Lý Kỷ Vật","Memory Studio")}</h3>
                  <p className="text-xs text-slate-400">{t("Chủ sở hữu Chip #","Memory owner #")}{memoryData.tag_uid}</p>
                </div>
              </div>
              <button onClick={() => {if(window.confirm(t("Đóng và bỏ thay đổi chưa lưu?","Close and discard unsaved changes?")))setIsEditorOpen(false);}} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress & Step Indicators */}
            <div className="mb-6 space-y-3 pb-4 border-b border-white/10">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{t("Hành trình Sáng tác Kỷ vật", "Memory Crafting Journey")}</span>
                </span>
                <span className="font-mono text-amber-300 font-bold text-xs">{t("Hoàn thiện", "Ready")}: {studioProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${studioProgress}%` }}
                />
              </div>

              {/* Step Navigation Tabs */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStudioStep(1)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                    studioStep === 1
                      ? 'bg-amber-400/15 border-amber-400/50 text-white shadow-sm'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300 flex items-center gap-1">
                    <Feather className="w-3 h-3" />
                    <span>{t("Bước 1", "Step 1")}</span>
                  </span>
                  <span className="text-xs font-medium line-clamp-1">{t("Lời Trao Gửi & Nhạc", "Message & Music")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStudioStep(2)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                    studioStep === 2
                      ? 'bg-amber-400/15 border-amber-400/50 text-white shadow-sm'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300 flex items-center gap-1">
                    <Film className="w-3 h-3" />
                    <span>{t("Bước 2", "Step 2")}</span>
                  </span>
                  <span className="text-xs font-medium line-clamp-1">{t("Khoảnh Khắc & Phim", "Moments & Film")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStudioStep(3)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                    studioStep === 3
                      ? 'bg-amber-400/15 border-amber-400/50 text-white shadow-sm'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{t("Bước 3", "Step 3")}</span>
                  </span>
                  <span className="text-xs font-medium line-clamp-1">{t("Niêm Phong & Xem Trước", "Seal & Preview")}</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveEditor} className="space-y-5 text-xs">
              {/* Notifications */}
              {studioError && (
                <div role="alert" className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{studioError}</span>
                </div>
              )}
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{t("Đã cập nhật dữ liệu kỷ vật an toàn!","Memory saved successfully!")}</span>
                </div>
              )}

              {/* BƯỚC 1: LỜI TRAO GỬI & NHẠC NỀN */}
              {studioStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">{t("Tiêu đề kỷ niệm:","Memory title:")}</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder={t("Ví dụ: Ánh Sáng Nơi Trái Tim","e.g. Lumen of the Heart")}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none focus:border-amber-400/50 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">{t("Tên người tặng / gửi (Từ: ...):","Sender name (From):")}</label>
                      <input
                        type="text"
                        value={editAuthor}
                        onChange={(e) => setEditAuthor(e.target.value)}
                        placeholder={t("Ví dụ: Minh Hoàng","e.g. Alex")}
                        className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">{t("Tên người nhận (Gửi đến: ...):","Recipient name (To):")}</label>
                      <input
                        type="text"
                        value={editRecipient}
                        onChange={(e) => setEditRecipient(e.target.value)}
                        placeholder={t("Ví dụ: Thiên Thanh","e.g. Taylor")}
                        className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">{t("Câu trích dẫn (Golden Quote):","Featured quote:")}</label>
                    <input
                      type="text"
                      value={editQuote}
                      onChange={(e) => setEditQuote(e.target.value)}
                      placeholder={t("“Dù ở bất cứ nơi đâu, em vẫn luôn là ánh sáng của anh.”", "“Wherever you are, you are my guiding light.”")}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-semibold">{t("Nội dung bức thư tay tâm sự (Riêng tư):","Private letter:")}</label>
                      <button
                        type="button"
                        onClick={() => setIsAiMuseOpen(true)}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 text-dark-950 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 shadow-sm hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                      >
                        <Feather className="w-3.5 h-3.5" />
                        <span>{t("Chắp bút thư tay", "Letter Muse")}</span>
                      </button>
                    </div>
                    <textarea
                      rows={6}
                      value={editLetter}
                      onChange={(e) => setEditLetter(e.target.value)}
                      placeholder={t("Viết những lời tâm sự chân thành gửi đến người thương...", "Write your deepest thoughts for your beloved...")}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-300 font-semibold">{t("Tên bản thu âm / bài hát:","Recording / song title:")}</label>
                        <button
                          type="button"
                          onClick={() => setIsCuratedMelodiesOpen(true)}
                          className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-300 border border-amber-400/30 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Music className="w-3 h-3" />
                          <span>{t("♫ Chọn từ kho nhạc", "♫ Curated Music")}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editAudioTitle}
                        onChange={(e) => setEditAudioTitle(e.target.value)}
                        placeholder={t("Ví dụ: Clair de Lune","e.g. Clair de Lune")}
                        className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">{t("Đường dẫn audio đã tải:","Uploaded audio path:")}</label>
                      <input
                        type="text"
                        value={editAudioUrl}
                        readOnly
                        placeholder={t("Chọn từ kho nhạc hoặc tải lên ở Bước 2","Select from library or upload in Step 2")}
                        className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-slate-300 focus:outline-none font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <section className="space-y-3 pt-2">
                    <h4 className="font-serif text-sm font-semibold text-slate-200">{t("Những lá thư bổ sung (Tùy chọn)","Additional letters (Optional)")}</h4>
                    {extraLetters.map((letter,index)=>(
                      <div key={index} className="space-y-2 p-3 border border-white/10 rounded-xl bg-black/30">
                        <label className="store-label">{t("Tiêu đề thư","Letter title")}<input className="store-input" required maxLength={200} value={letter.title} onChange={e=>setExtraLetters(prev=>prev.map((x,i)=>i===index?{...x,title:e.target.value}:x))}/></label>
                        <label className="store-label">{t("Nội dung","Content")}<textarea className="store-input" required maxLength={10000} rows={4} value={letter.body} onChange={e=>setExtraLetters(prev=>prev.map((x,i)=>i===index?{...x,body:e.target.value}:x))}/></label>
                        <button type="button" className="text-red-400 hover:text-red-300 text-[11px] underline cursor-pointer" onClick={()=>setExtraLetters(prev=>prev.filter((_,i)=>i!==index))}>{t("Gỡ thư này","Remove letter")}</button>
                      </div>
                    ))}
                    <button type="button" disabled={extraLetters.length>=10} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50" onClick={()=>setExtraLetters(prev=>[...prev,{title:t('Một lời nhắn dành cho bạn','A note for you'),body:''}])}>+ {t("Thêm thư tay khác","Add another letter")}</button>
                  </section>

                  {/* Step 1 Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {if(window.confirm(t("Đóng và bỏ thay đổi chưa lưu?","Close and discard unsaved changes?")))setIsEditorOpen(false);}}
                      className="px-4 py-2 rounded-xl bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                    >
                      {t("Hủy","Cancel")}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isSavingEditor||movieBusy}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
                      >
                        {t("Lưu nhanh","Quick save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudioStep(2)}
                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-dark-950 font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer shadow-silver-glow flex items-center gap-1.5 transition-all"
                      >
                        <span>{t("Tiếp tục: Khoảnh Khắc & Phim","Continue: Moments & Film")}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* BƯỚC 2: KHOẢNH KHẮC & PHIM KỶ NIỆM */}
              {studioStep === 2 && (
                <div className="space-y-4">
                  {memoryData.media_warning&&<p role="status" className="p-3 rounded-xl border border-amber-300/30 text-amber-200">{t("Một số tệp chưa phát được. Danh sách tệp đã lưu vẫn được giữ nguyên trong Studio; bạn có thể tải thêm hoặc thay thế video.","Some files cannot play yet. Your saved files remain in Studio; you can upload or replace media.")}</p>}
                  
                  <label className="flex gap-3 items-start p-4 rounded-xl border border-white/15 bg-black/30 text-xs leading-relaxed">
                    <input type="checkbox" checked={videoConsent} disabled={movieBusy} onChange={e=>setVideoConsent(e.target.checked)} className="mt-0.5 accent-amber-400" />
                    <span className="text-slate-300">{t("Tôi đồng ý gửi hình ảnh và video tải lên cho hệ thống AI để kiểm duyệt. Phương tiện vi phạm sẽ bị từ chối; quản trị viên xem được lịch sử tải, nhãn AI và lý do kiểm duyệt.","I consent to sending uploaded images and videos to the AI system for moderation. Violating content is rejected; administrators can see upload history, AI labels and moderation reasons.")}</span>
                  </label>

                  <div className="space-y-2">
                    <h4 className="font-serif text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-amber-300" />
                      <span>{t("Video đại diện (Phim kỷ niệm mở đầu)","Featured Intro Film")}</span>
                    </h4>
                    <MemoryMovieEditor tag={currentTag} path={introPath} onChange={setIntroPath} onBusy={setMovieBusy} videoConsent={videoConsent} onAddToGallery={item=>setEditMedia(prev=>[...prev,item])}/>
                  </div>

                  <div className="space-y-2 pt-2">
                    <h4 className="font-serif text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-amber-300" />
                      <span>{t("Bộ sưu tập hình ảnh & âm thanh kỷ vật","Photo Gallery & Audio")}</span>
                    </h4>
                    <MemoryMediaEditor tag={currentTag} items={editMedia} onChange={setEditMedia} audio={editAudioUrl} onAudio={setEditAudioUrl} onBusy={setMovieBusy} videoConsent={videoConsent}/>
                  </div>

                  <details className="p-3 border border-white/10 rounded-xl bg-black/20">
                    <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200 select-none">
                      {t("Xem thêm nhật ký tải lên & chẩn đoán kiểm duyệt","Upload status & moderation details")}
                    </summary>
                    <div className="mt-3">
                      <VideoLabelEditor key={currentTag} tag={currentTag} items={editMedia} introPath={introPath} onBusy={setMovieBusy} consent={videoConsent} refreshKey={movieBusy} onApproved={path=>setEditMedia(prev=>prev.some(m=>m.path===path)?prev:[...prev,{path,type:'video',caption:t("Video đã kiểm duyệt","Reviewed video")}])}/>
                    </div>
                  </details>

                  {/* Step 2 Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setStudioStep(1)}
                      className="px-4 py-2 rounded-xl bg-white/10 text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>{t("← Lời Trao Gửi","← Message & Music")}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isSavingEditor||movieBusy}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
                      >
                        {t("Lưu nhanh","Quick save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudioStep(3)}
                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-dark-950 font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer shadow-silver-glow flex items-center gap-1.5 transition-all"
                      >
                        <span>{t("Tiếp tục: Niêm Phong & Xem Trước","Continue: Seal & Preview")}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* BƯỚC 3: NIÊM PHONG & XEM TRƯỚC */}
              {studioStep === 3 && (
                <div className="space-y-4">
                  {/* Recipient Experience Preview Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-transparent border border-amber-400/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                    <div>
                      <p className="font-semibold text-white flex items-center gap-1.5 text-xs">
                        <Eye className="w-4 h-4 text-amber-300" />
                        <span>{t("Xem Trước Trải Nghiệm Người Nhận", "Preview Recipient Experience")}</span>
                      </p>
                      <p className="text-[11px] text-slate-300 font-light mt-0.5 leading-relaxed">
                        {t("Mở bức thư hoàng gia và phát phim kỷ niệm đúng như người nhận sẽ trải nghiệm khi chạm chip.", "Open the wax-sealed royal letter and watch the memory film exactly as your recipient will see it.")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditorOpen(false);
                        setShowUnboxing(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-dark-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-silver-glow"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{t("Xem Trước Ngay", "Preview Now")}</span>
                    </button>
                  </div>

                  {/* 3 HÀNH ĐỘNG PIN RÕ RÀNG: KEEP / SET / REMOVE */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-amber-300" />
                      <span>{t("Chính Sách Khóa Mã PIN Bảo Mật:","PIN privacy settings:")}</span>
                    </p>
                    
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
                        <span>{t("Giữ nguyên trạng thái PIN hiện tại","Keep current PIN settings")}</span>
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
                        <span>{t("Đặt / Đổi Mã PIN Mới","Set / change PIN")}</span>
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
                        <span>{t("Gỡ bỏ PIN (Công khai)","Remove PIN (public)")}</span>
                      </label>
                    </div>

                    {pinAction === 'KEEP' && memoryData?.is_protected && (
                      <div className="pt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-400/20 text-xs space-y-1">
                        <p className="text-slate-300">
                          <span className="text-amber-300 font-semibold">{t("Trạng thái:", "Status:")}</span> {t("Kỷ vật đang được bảo vệ bằng mã PIN.", "This memory is protected by a PIN.")}
                        </p>
                        {memoryData.pin_hint ? (
                          <p className="text-slate-300">
                            <span className="text-amber-300 font-semibold">{t("Gợi ý hiện tại:", "Current clue:")}</span> “{memoryData.pin_hint}”
                          </p>
                        ) : (
                          <p className="text-slate-400 italic">
                            {t("Chưa có câu đố / gợi ý nào được đặt.", "No riddle or clue is set.")}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400">
                          {t("Chọn 'Đặt / Đổi Mã PIN Mới' ở trên nếu bạn muốn cập nhật lại mật mã hoặc câu đố gợi ý.", "Select 'Set / change PIN' above if you wish to change your PIN or update the riddle.")}
                        </p>
                      </div>
                    )}

                    {pinAction === 'SET' && (
                      <div className="pt-2 space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-slate-300 font-medium block">
                            {t("1. Nhập Mã PIN mới (4-6 chữ số bí mật):", "1. New Secret PIN (4–6 digits):")}
                          </label>
                          <input
                            type="password"
                            maxLength={6}
                            value={newPinCode}
                            onChange={(e) => setNewPinCode(e.target.value)}
                            placeholder={t("Nhập 4-6 số...", "Enter 4–6 digits...")}
                            className="w-48 px-3 py-1.5 rounded-xl bg-black/80 border border-white/30 text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] text-slate-300 font-medium block">
                            {t("2. Gợi ý mật mã tinh tế (Câu đố tình yêu / kỷ niệm dành riêng cho người nhận):", "2. Subtle Clue / Riddle for your beloved:")}
                          </label>
                          <input
                            type="text"
                            maxLength={150}
                            value={editPinHint}
                            onChange={(e) => setEditPinHint(e.target.value)}
                            placeholder={t("Ví dụ: Ngày hai đứa mình lần đầu gặp nhau ở quán quen, 4 số năm sinh mèo cưng...", "e.g. The day we first met at our favorite cafe, four digits of our anniversary...")}
                            className="w-full px-3 py-2 rounded-xl bg-black/80 border border-white/30 text-white text-xs focus:outline-none focus:border-amber-400 placeholder-slate-500"
                          />
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/20 text-[11px] text-amber-200/90 leading-relaxed space-y-1">
                            <p className="font-semibold text-amber-300 flex items-center gap-1">
                              <span>✦ {t("Nguyên tắc gợi ý lãng mạn & bảo mật:", "Romantic & Safe Clue Rules:")}</span>
                            </p>
                            <p>
                              {t("• Hãy đặt câu hỏi hoặc gợi nhắc về một khoảnh khắc thiêng liêng chỉ có hai người hiểu (ví dụ: ngày kỷ niệm, địa danh hẹn hò đầu tiên).", "• Ask a question or recall an intimate memory only the two of you share (e.g. anniversary, first date location).")}
                            </p>
                            <p className="text-amber-400 font-medium">
                              {t("• Tuyệt đối KHÔNG viết thẳng các con số mật mã vào đây để người nhận được tận hưởng trọn vẹn cảm giác giải đố bất ngờ.", "• Do NOT write the raw PIN digits here directly so your recipient enjoys the sweet surprise of solving the clue.")}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {onOpenPrivacy && (
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3 text-xs text-slate-300">
                      <span className="flex items-center gap-2 text-[11px]">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{t("Kỷ vật được bảo vệ theo Chính sách bảo mật phần cứng & mã hóa Emoria.", "Protected under Emoria Hardware Security & Encryption Policy.")}</span>
                      </span>
                      <button
                        type="button"
                        onClick={onOpenPrivacy}
                        className="text-amber-300 hover:text-amber-200 underline text-[11px] font-medium cursor-pointer whitespace-nowrap"
                      >
                        {t("Xem Chính sách", "Privacy Policy")}
                      </button>
                    </div>
                  )}

                  {/* Quản lý sổ lưu niệm */}
                  <details className="p-4 border border-white/10 rounded-xl bg-black/30" open>
                    <summary className="cursor-pointer font-semibold text-slate-200">
                      {t("Quản lý sổ lưu niệm (","Manage guestbook (")}{guestEntries.length} {t("lời nhắn)","messages)")}
                    </summary>
                    <div className="space-y-3 mt-3">
                      {guestEntries.map(entry => (
                        <div key={entry.id} className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">{entry.author_name} ({entry.relationship || t("Khách","Guest")})</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] ${entry.is_hidden ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                              {entry.is_hidden ? t("Đang ẩn","Hidden") : t("Đang hiển thị","Visible")}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-slate-300">{entry.message}</p>
                          <div className="flex gap-4 text-xs pt-1">
                            <button
                              type="button"
                              className="text-amber-300 hover:underline cursor-pointer"
                              onClick={async () => {
                                try {
                                  const res = await callStore('rpc_memory_guestbook', { p_tag: currentTag, p_id: entry.id, p_action: entry.is_hidden ? 'approve' : 'hide' });
                                  setGuestEntries(res || []);
                                  await loadMemory(currentTag);
                                } catch (e) {
                                  setStudioError(e.message);
                                }
                              }}
                            >
                              {entry.is_hidden ? t("✓ Cho phép hiển thị","✓ Approve") : t("👁 Ẩn lời nhắn","👁 Hide message")}
                            </button>
                            <button
                              type="button"
                              className="text-red-400 hover:underline cursor-pointer"
                              onClick={async () => {
                                if (window.confirm(`Xóa vĩnh viễn lời nhắn của "${entry.author_name}"?`)) {
                                  try {
                                    const res = await callStore('rpc_memory_guestbook', { p_tag: currentTag, p_id: entry.id, p_action: 'delete' });
                                    setGuestEntries(res || []);
                                    await loadMemory(currentTag);
                                  } catch (e) {
                                    setStudioError(e.message);
                                  }
                                }
                              }}
                            >
                              {t("🗑 Xóa lời nhắn","🗑 Delete message")}
                            </button>
                          </div>
                        </div>
                      ))}
                      {!guestEntries.length && <p className="text-slate-400 text-xs">{t("Chưa có lời nhắn nào trong sổ lưu niệm.","No guestbook messages yet.")}</p>}
                    </div>
                  </details>

                  {/* Step 3 Navigation / Submit */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setStudioStep(2)}
                      className="px-4 py-2 rounded-xl bg-white/10 text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>{t("← Khoảnh Khắc & Phim","← Moments & Film")}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {if(window.confirm(t("Đóng và bỏ thay đổi chưa lưu?","Close and discard unsaved changes?")))setIsEditorOpen(false);}}
                        className="px-4 py-2 rounded-xl bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                      >
                        {t("Hủy","Cancel")}
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingEditor||movieBusy}
                        className="px-6 py-2 rounded-xl bg-white text-dark-950 font-bold uppercase tracking-wider hover:bg-slate-200 cursor-pointer shadow-silver-glow flex items-center gap-2 disabled:opacity-50 transition-all"
                      >
                        {isSavingEditor && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{t("Hoàn Tất & Lưu Thay Đổi","Save All Changes")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
              title={t("Đóng (ESC)","Close (ESC)")}
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

      {/* Luxury Unboxing Ceremony */}
      {showUnboxing && memoryData && (
        <LuxuryUnboxingExperience
          hasIntroVideo={Boolean(memoryData.intro_video_url)}
          onUnboxed={() => {
            setShowUnboxing(false);
            try { sessionStorage.setItem('emoria_unboxed_' + currentTag, '1'); } catch {}
            if (memoryData.intro_video_url) {
              setMovieDone(false);
            } else {
              setIsLetterOpen(true);
            }
          }}
        />
      )}

      {/* AI Letter Muse Modal */}
      <AiLetterMuseModal
        isOpen={isAiMuseOpen}
        onClose={() => setIsAiMuseOpen(false)}
        author={editAuthor}
        recipient={editRecipient}
        onApply={(letter) => setEditLetter(letter)}
      />

      {/* Curated Melodies Modal */}
      <CuratedMelodiesModal
        isOpen={isCuratedMelodiesOpen}
        onClose={() => setIsCuratedMelodiesOpen(false)}
        currentAudioUrl={editAudioUrl}
        onSelectMelody={({ title, url }) => {
          setEditAudioTitle(title);
          setEditAudioUrl(url);
        }}
      />

    </div>
  );
}
