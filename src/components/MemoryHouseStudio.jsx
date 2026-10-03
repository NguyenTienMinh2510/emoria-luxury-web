import React, { useState, useEffect, useCallback, useRef } from 'react';
import {createPortal} from 'react-dom';
import MemoryHouse3D from './MemoryHouse3D.jsx';
import {createDraftQueue} from '../services/draftQueue.js';
import {setDecorationPhoto, createCozyHouseRooms} from '../services/house3d.js';
import {createShareUrl} from '../services/shareLinks.js';
import {captureHouseShareFile} from '../services/houseSharePreview.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Heart, Sparkles, ArrowLeft, ArrowRight, Upload,
  Copy, Check, Eye, Globe, RefreshCw,
  AlertCircle, CheckCircle2, Image as ImageIcon, X,
  Maximize2,
  Loader2, GripVertical, ChevronLeft, ChevronRight,
  Mail, MessageSquare, Send, Flag, ShoppingBag
} from 'lucide-react';
import {
  renderPostcardCanvas,
  downloadPostcardFile,
  sharePostcard,
  POSTCARD_FORMATS,
  POSTCARD_TEMPLATES
} from '../services/postcardGenerator.js';
import {
  getHouseDraft, restoreHouseLayout,
  saveHouseDraft,
  publishHouse,
  unpublishHouse,
  revokeHouseShare,
  getPublicHouse,
  getPublicHouseByTag,
  uploadEventPhoto,
  HOUSE_ROOMS_SPEC,
  HOUSE_THEMES,
  trackEventAction,
  submitContentReport, sendHouseReply, getHouseReplies
} from '../services/eventService.js';

// Helper: Map saved rooms while preserving storytelling order and ensuring all 5 rooms exist
function mapOrderedRooms(savedRooms, {newHouse = false} = {}) {
  if (!Array.isArray(savedRooms) || !savedRooms.length) {
    const empty=HOUSE_ROOMS_SPEC.map(spec=>({id:spec.id,name:spec.name,note:'',memories:[],decorations:[],lighting:'day'}));
    return newHouse ? createCozyHouseRooms(empty) : empty;
  }
  const ids=[...new Set([...savedRooms.map(r=>r.id),...HOUSE_ROOMS_SPEC.map(r=>r.id)])];
  return ids.filter(id=>HOUSE_ROOMS_SPEC.some(r=>r.id===id)).map(id=>{
    const existing=savedRooms.find(r=>r.id===id);
    return {...existing,id,name:existing?.name || HOUSE_ROOMS_SPEC.find(r=>r.id===id).name,note:existing?.note || '',memories:existing?.memories || [],decorations:existing?.decorations || [],lighting:existing?.lighting || 'day'};
  });
}

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
  navigationDirtyRef,
  currentUser
}) {
  const [canEdit, setCanEdit] = useState(Boolean(currentUser) && !initialShareId);
  const isPublicVisitor = Boolean(initialShareId) || !currentUser || !canEdit;

  // States
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const loadSequence = useRef(0);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState(isPublicVisitor ? 'preview' : 'edit'); // 'edit' | 'preview'
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);

  // House Data
  const [houseTitle, setHouseTitle] = useState('Ngôi Nhà Kỷ Niệm Của Đôi Mình');
  const [selectedTheme, setSelectedTheme] = useState('warm_gold');
  const [rooms, setRooms] = useState(() => mapOrderedRooms([]));
  const [layoutPreview, setLayoutPreview] = useState(null);
  const [canRestoreLayout, setCanRestoreLayout] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [planLayout, setPlanLayout] = useState(null);
  const [isPublished, setIsPublished] = useState(false);
  const latestRooms = useRef(rooms);
  latestRooms.current = rooms;
  const [currentShareId, setCurrentShareId] = useState(initialShareId || null);

  // Autosave & Concurrency States
  const [autosaveState, setAutosaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const isDirty = useRef(false);
  useEffect(() => {
    if (!navigationDirtyRef) return;
    navigationDirtyRef.current = isDirty;
    return () => { if (navigationDirtyRef.current === isDirty) navigationDirtyRef.current = null; };
  }, [navigationDirtyRef]);
  const saveRevision = useRef(0);
  const saveQueue = useRef(null);
  const latestHouse = useRef(null);
  latestHouse.current={title:houseTitle.trim()||'Ngôi Nhà Kỷ Niệm Của Đôi Mình',theme:selectedTheme,rooms};
  function resetSaveQueue(revision=0){
    const tag=tagUid;
    saveQueue.current=createDraftQueue((payload,expected_revision)=>saveHouseDraft(tag,{...payload,expected_revision}));
    saveQueue.current.reset(revision);
  }
  async function persistHouse(payload,{retry=false}={}){
    if(!saveQueue.current)throw new Error('Ngôi nhà chưa tải xong.');
    const result=await saveQueue.current.enqueue(payload,{retry});
    if(JSON.stringify(payload)===JSON.stringify(latestHouse.current)&&!saveQueue.current.pending){isDirty.current=false;setAutosaveState('saved');}
    return result;
  }
  const isInitialLoad = useRef(true);

  // UI Action States
  const [isSaving, setIsSaving] = useState(false);
  const [publishStage, setPublishStage] = useState('');
  const [publishElapsed, setPublishElapsed] = useState(0);
  const isPublishing = Boolean(publishStage);
  const publishDialogRef = useRef(null);
  useEffect(() => {
    if (!isPublishing) { publishDialogRef.current?.close(); return; }
    publishDialogRef.current?.showModal();
    setPublishElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setPublishElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isPublishing]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [uploadingRoomId, setUploadingRoomId] = useState(null);
  const [lightboxData, setLightboxData] = useState(null);
  const [likedPhotos, setLikedPhotos] = useState(() => new Set());
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('inappropriate_content');
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [heartPopping, setHeartPopping] = useState(false);
  const lastFocusedElement = useRef(null);
  const lightboxRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);

  // Chặng C: Love Letter at Journey's End & Visitor Guestbook States
  const [isLetterModalOpen, setIsLetterModalOpen] = useState(false);
  const [isGuestbookModalOpen, setIsGuestbookModalOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [guestSubmitted, setGuestSubmitted] = useState(false);
  const [guestEntries, setGuestEntries] = useState([]);
  const [hasSentHeart, setHasSentHeart] = useState(false);

  // Chặng D: Postcard / Social Share Card State
  const captureHouse3DRef = useRef(null);
  const postcardCanvasRef = useRef(null);
  const [isPostcardModalOpen, setIsPostcardModalOpen] = useState(false);
  const postcardTriggerRef = useRef(null);
  useEffect(() => {
    if (!isPostcardModalOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; postcardTriggerRef.current?.focus(); };
  }, [isPostcardModalOpen]);
  const [postcardTemplate, setPostcardTemplate] = useState('polaroid');
  const [postcardFormat, setPostcardFormat] = useState('square');
  const [postcardTheme, setPostcardTheme] = useState('dark');
  const [postcardPhoto, setPostcardPhoto] = useState('');
  const [postcardCaption, setPostcardCaption] = useState('');
  const [postcardCoupleNames, setPostcardCoupleNames] = useState('');
  const [postcardDate, setPostcardDate] = useState('');
  const [postcardIncludeQR, setPostcardIncludeQR] = useState(true);
  const [postcardCaptureDataUrl, setPostcardCaptureDataUrl] = useState('');
  const [isRenderingPostcard, setIsRenderingPostcard] = useState(false);
  const [postcardShareStatus, setPostcardShareStatus] = useState('');

  // Load House Data (either draft for owner or public snapshot for guest/share)
  const loadHouse = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLayoutPreview(null); setCanRestoreLayout(false);
    setLoading(true);
    setCanEdit(false);
    setLoadError('');
    setError('');
    try {
      if (initialShareId) {
        // Public share mode
        const publicData = await getPublicHouse(initialShareId);
        if (sequence !== loadSequence.current) return;
        if (publicData.title) setHouseTitle(publicData.title);
        if (publicData.theme) setSelectedTheme(publicData.theme);
        if (Array.isArray(publicData.rooms)) {
          setRooms(mapOrderedRooms(publicData.rooms));
        }
        setIsPublished(true);
        setActiveTab('preview');
        trackEventAction('house_opened_share', 'house', initialShareId, `dedupe:house:${initialShareId}:open`);
      } else if (tagUid && currentUser) {
        // Owner draft mode
        try {
          const draft = await getHouseDraft(tagUid);
          if (sequence !== loadSequence.current) return;
          resetSaveQueue(draft.draft_revision||0);
          setCanEdit(true);
          setActiveTab('edit');
          if (draft.title) setHouseTitle(draft.title);
          if (draft.theme) setSelectedTheme(draft.theme);
          setIsPublished(Boolean(draft.is_published));
          setCurrentShareId(draft.share_id || null);

          setRooms(mapOrderedRooms(draft.rooms,{newHouse:draft.exists === false}));
          setCanRestoreLayout(Boolean(draft.can_restore_layout));
        } catch (draftErr) {
          if (sequence !== loadSequence.current) return;
          if (draftErr.status !== 403) throw draftErr;
          // Fallback to public published view if not owner of draft
          try {
            const publicData = await getPublicHouseByTag(tagUid);
            if (sequence !== loadSequence.current) return;
            if (publicData.title) setHouseTitle(publicData.title);
            if (publicData.theme) setSelectedTheme(publicData.theme);
            if (Array.isArray(publicData.rooms)) {
              setRooms(mapOrderedRooms(publicData.rooms));
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
        if (sequence !== loadSequence.current) return;
        if (publicData.title) setHouseTitle(publicData.title);
        if (publicData.theme) setSelectedTheme(publicData.theme);
        if (Array.isArray(publicData.rooms)) {
          setRooms(mapOrderedRooms(publicData.rooms));
        }
        setIsPublished(true);
        setActiveTab('preview');
      }
    } catch (err) {
      if (sequence === loadSequence.current) setLoadError(err?.message || 'Không thể tải ngôi nhà kỷ niệm.');
    } finally {
      if (sequence !== loadSequence.current) return;
      setLoading(false);
      isInitialLoad.current = true;
      isDirty.current = false;
      setAutosaveState('saved');
    }
  }, [initialShareId, tagUid, currentUser]);

  useEffect(() => {
    loadHouse();
    return () => { loadSequence.current += 1; };
  }, [loadHouse]);

  // Debounced Autosave (800-1200ms) after changes
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (isPublicVisitor || !canEdit || !tagUid) return;

    isDirty.current = true;
    saveRevision.current += 1;
    const currentRev = saveRevision.current;
    setAutosaveState('saving');

    const timer = setTimeout(async () => {
      try {
        await persistHouse({...latestHouse.current,rooms:latestRooms.current});
        if (currentRev === saveRevision.current) {
          isDirty.current = false;
          setAutosaveState('saved');
        }
      } catch (err) {
        setError(err.message);
        if (currentRev === saveRevision.current) {
          setAutosaveState('error');
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [houseTitle, selectedTheme, rooms, isPublicVisitor, canEdit, tagUid]);

  // Warn on dirty before leaving page
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

  // Save Draft (Manual or programmatic)
  const handleSaveDraft = async (customRooms = rooms) => {
    if (!tagUid || isPublicVisitor) return;
    setIsSaving(true);
    setAutosaveState('saving');
    setError('');
    try {
      await persistHouse({...latestHouse.current,rooms:customRooms},{retry:true});
      setSuccessMsg('Đã lưu bản nháp ngôi nhà thành công!');
      setTimeout(() => setSuccessMsg(''), 2500);
      return true;
    } catch (err) {
      setAutosaveState('error');
      setError(err?.message || 'Lỗi khi lưu bản nháp.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Publish House
  const handlePublish = async () => {
    if (!tagUid || isPublicVisitor || isPublishing || layoutPreview || layoutBusy) return;
    setPublishStage('capturing');
    setError('');
    setSuccessMsg('');
    try {
      const original = latestHouse.current;
      const preview = await captureHouseShareFile(captureHouse3DRef.current,original);
      const uploaded = await uploadEventPhoto(tagUid.toLowerCase().trim(),preview);
      if(JSON.stringify(original)!==JSON.stringify(latestHouse.current))throw new Error('Bạn vừa chỉnh sửa thêm. Hãy chờ lưu rồi xuất bản lại.');
      const nextRooms = original.rooms.map((room,index) => {
        const {share_preview_path,...rest} = room;
        return index === 0 ? {...rest,share_preview_path:uploaded.path} : rest;
      });
      const payload = {...original,rooms:nextRooms};
      latestRooms.current = nextRooms;
      latestHouse.current = payload;
      setRooms(nextRooms);
      setPublishStage('saving');
      await persistHouse(payload,{retry:true});
      await saveQueue.current.flush();
      if(JSON.stringify(payload)!==JSON.stringify(latestHouse.current))throw new Error('Bạn vừa chỉnh sửa thêm. Hãy chờ lưu rồi xuất bản lại.');
      setPublishStage('reviewing');
      const res = await publishHouse(tagUid);
      setIsPublished(true);
      if (res.share_id) {
        setCurrentShareId(res.share_id);
      }
      setSuccessMsg('Ngôi nhà đã được xuất bản! Bạn có thể chia sẻ liên kết này.');
    } catch (err) {
      setError(err?.message || 'Không thể xuất bản ngôi nhà.');
    } finally {
      setPublishStage('');
    }
  };

  async function previewLayout(options) {
    if(!planLayout || layoutBusy) return;
    const original=latestHouse.current;
    setLayoutBusy(true); setError('');
    try {
      await saveQueue.current.flush();
      const plan=await planLayout(original.rooms,options);
      if(JSON.stringify(original)!==JSON.stringify(latestHouse.current)) throw new Error('Bạn vừa chỉnh sửa thêm. Hãy thử xem trước lại.');
      if(plan.added || options?.rearrange) setLayoutPreview(plan);
      else setError('Chưa có chỗ trống phù hợp. Hãy sắp xếp lại đồ trước khi nâng cấp.');
    } catch(err) { setError(err.message); }
    finally {setLayoutBusy(false);}
  }

  async function applyLayoutPreview() {
    if (!layoutPreview || layoutBusy || isPublicVisitor) return;
    setLayoutBusy(true); setError('');
    try {
      await persistHouse({...latestHouse.current,rooms:layoutPreview.rooms});
      setRooms(layoutPreview.rooms); setLayoutPreview(null); setCanRestoreLayout(true);
      setSuccessMsg('Đã lưu bố cục mới. Bản công khai chỉ đổi khi bạn xuất bản.');
    } catch (err) { setError(err.message); }
    finally { setLayoutBusy(false); }
  }
  async function restoreLayout() {
    if (layoutBusy || isPublicVisitor) return;
    setLayoutBusy(true); setError('');
    try {
      await saveQueue.current.flush();
      await restoreHouseLayout(tagUid,saveQueue.current.revision);
      await loadHouse();
      setSuccessMsg('Đã khôi phục bố cục trước nâng cấp; ảnh và lời nhắn hiện tại vẫn được giữ.');
    } catch (err) { setError(err.message); }
    finally { setLayoutBusy(false); }
  }

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
      setIsPublished(false);
      setSuccessMsg('Đã thu hồi liên kết cũ và cấp mã liên kết mới an toàn.');
    } catch (err) {
      setError(err?.message || 'Không thể thu hồi liên kết.');
    }
  };

  // Photo Upload to Room
  const handlePhotoUpload = async (roomId, file, decorationTarget) => {
    if (!file || !tagUid || isPublicVisitor || uploadingRoomId) return;
    if ((latestRooms.current.find(r => r.id === roomId)?.memories?.length || 0) >= 10) {
      setError('Mỗi phòng chỉ được chứa tối đa 10 khoảnh khắc.');
      return;
    }
    setUploadingRoomId(roomId);
    setError('');
    try {
      const res = await uploadEventPhoto(tagUid, file);
      let createdMemory = null;
      const nextRooms = latestRooms.current.map((r) => {
        if (r.id !== roomId) return r;
        const currentMems = r.memories || [];
        if (currentMems.length >= 10) {
          throw new Error('Mỗi phòng chỉ được chứa tối đa 10 khoảnh khắc.');
        }
        createdMemory = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          photo_path: res.path,
          photo_url: res.url,
          caption: '',
          date: new Date().toLocaleDateString('vi-VN')
        };
        const next = {
          ...r,
          memories: [...currentMems, createdMemory]
        };
        return decorationTarget
          ? setDecorationPhoto(next, decorationTarget.slot, decorationTarget.item, decorationTarget.index, createdMemory.id)
          : next;
      });
      setRooms(nextRooms);
      const saved = await handleSaveDraft(nextRooms);
      if(saved) setSuccessMsg('Đã thêm ảnh vào phòng kỷ niệm!');
      setTimeout(() => setSuccessMsg(''), 2500);
      return createdMemory;
    } catch (err) {
      setError(err?.message || 'Không thể tải ảnh lên phòng.');
    } finally {
      setUploadingRoomId(null);
    }
  };

  // Reorder Photos within Room
  const handleMovePhoto = (roomId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const nextRooms = rooms.map((r) => {
      if (r.id !== roomId) return r;
      const mems = [...(r.memories || [])];
      if (toIndex < 0 || toIndex >= mems.length) return r;
      const [item] = mems.splice(fromIndex, 1);
      mems.splice(toIndex, 0, item);
      return { ...r, memories: mems };
    });
    setRooms(nextRooms);
  };

  // Remove Photo (with safe cleanup of decoration references)
  const handleRemovePhoto = (roomId, photoIndex) => {
    const nextRooms = rooms.map((r) => {
      if (r.id !== roomId) return r;
      const removedMem = r.memories?.[photoIndex];
      const nextMems = (r.memories || []).filter((_, idx) => idx !== photoIndex);
      let nextDecor = r.decorations;
      if (removedMem?.id && Array.isArray(r.decorations)) {
        nextDecor = r.decorations.map((d) => {
          if (!Array.isArray(d.photos)) return d;
          return {
            ...d,
            photos: d.photos.map((pId) => (pId === removedMem.id ? null : pId))
          };
        });
      }
      return {
        ...r,
        memories: nextMems,
        decorations: nextDecor
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

  // Update Journey's End Love Letter (Chặng C)
  const handleUpdateJourneyLetter = (field, value) => {
    const nextRooms = rooms.map((r) => {
      if (r.id !== 'next-chapter') return r;
      const cur = r.journey_letter || {
        title: 'Gửi người thương ở tương lai',
        content: '',
        author: '',
        date: '',
        is_shared: true
      };
      return {
        ...r,
        journey_letter: { ...cur, [field]: value }
      };
    });
    setRooms(nextRooms);
    isDirty.current = true;
  };

  // Visitor Love Reaction & Guestbook (Chặng C)
  const replyRequest = useRef(null);
  const handleSendVisitorHeart = async () => {
    try{await sendHouseReply({share_id:currentShareId,tag_uid:tagUid,kind:'heart',name:'Khách ghé thăm',message:'',request_id:crypto.randomUUID()});setHasSentHeart(true);setSuccessMsg('Đã gửi trái tim đến chủ nhà!');}
    catch(err){setError(err.message);}
  };
  const handleSendGuestMessage = async e => {
    e.preventDefault();if(!guestName.trim()||!guestMessage.trim())return;
    replyRequest.current ||= crypto.randomUUID();
    try{
      await sendHouseReply({share_id:currentShareId,tag_uid:tagUid,kind:'message',name:guestName.trim(),message:guestMessage.trim(),request_id:replyRequest.current});
      setGuestSubmitted(true);replyRequest.current=null;setGuestName('');setGuestMessage('');
    }catch(err){setError(err.message);setGuestSubmitted(false);}
  };
  useEffect(()=>{if(canEdit&&tagUid)getHouseReplies(tagUid).then(setGuestEntries).catch(err=>setError(err.message));},[canEdit,tagUid,isGuestbookModalOpen]);

  // Share URL
  const shareUrl = currentShareId
    ? createShareUrl({view:'memory-house',share:currentShareId})
    : '';

  const handleCopyShareLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      trackEventAction('house_copy_link', 'house', tagUid || currentShareId || 'house');
    }).catch(() => setError('Không thể sao chép. Hãy chọn và sao chép liên kết ngôi nhà đang hiển thị.'));
  };

  const themeStyle = THEME_STYLES[selectedTheme] || THEME_STYLES.warm_gold;
  const currentRoom = rooms[activeRoomIndex] || rooms[0];

  // Postcard handlers (Chặng D)
  const openPostcardModal = useCallback(() => {
    if (isPublicVisitor && !isPublished) {
      setError('Ngôi nhà này hiện đang ở chế độ riêng tư, chưa thể tạo thiệp chia sẻ.');
      return;
    }
    postcardTriggerRef.current = document.activeElement;

    const currentRoomPhotos = currentRoom?.memories || [];
    const allPhotos = rooms.flatMap((r) => r.memories || []);
    const initialPhoto = currentRoomPhotos[0]?.photo_url || allPhotos[0]?.photo_url || '';

    setPostcardPhoto(initialPhoto);
    setPostcardCoupleNames(houseTitle || 'Nhà của chúng mình');
    setPostcardCaption(currentRoom?.note?.trim() || currentRoomPhotos[0]?.caption || 'Cùng nhau gom lại những khoảnh khắc dịu dàng nhất.');
    setPostcardDate(currentRoomPhotos[0]?.date || new Date().toLocaleDateString('vi-VN'));
    setPostcardShareStatus('');

    if (captureHouse3DRef.current) {
      try {
        const snap = captureHouse3DRef.current();
        if (snap) setPostcardCaptureDataUrl(snap);
      } catch (err) {
        console.warn('Could not capture 3D snapshot:', err);
      }
    }

    setIsPostcardModalOpen(true);
  }, [isPublicVisitor, isPublished, currentRoom, rooms, houseTitle]);

  // Live Canvas Postcard preview update
  useEffect(() => {
    if (!isPostcardModalOpen || !postcardCanvasRef.current) return;
    let cancelled = false;
    setIsRenderingPostcard(true);

    renderPostcardCanvas({
      template: postcardTemplate,
      aspectRatio: postcardFormat,
      themeMode: postcardTheme,
      houseTitle,
      coupleNames: postcardCoupleNames,
      roomName: currentRoom?.name || 'Ngôi Nhà Kỷ Niệm',
      caption: postcardCaption,
      date: postcardDate,
      photoUrl: postcardPhoto,
      houseCaptureDataUrl: postcardCaptureDataUrl,
      publicUrl: (isPublished && postcardIncludeQR) ? shareUrl : null,
      isPublished,
      canvasElement: postcardCanvasRef.current
    }).then(() => {
      if (!cancelled) setIsRenderingPostcard(false);
    }).catch((err) => {
      console.warn('[Postcard] Render preview error:', err);
      if (!cancelled) setIsRenderingPostcard(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    isPostcardModalOpen,
    postcardTemplate,
    postcardFormat,
    postcardTheme,
    postcardPhoto,
    postcardCaption,
    postcardCoupleNames,
    postcardDate,
    postcardIncludeQR,
    postcardCaptureDataUrl,
    isPublished,
    shareUrl,
    houseTitle,
    currentRoom
  ]);

  const handleSharePostcard = async () => {
    if (!postcardCanvasRef.current) return;
    setPostcardShareStatus('sharing');
    try {
      const res = await sharePostcard({
        canvas: postcardCanvasRef.current,
        title: `${houseTitle || 'Ngôi Nhà Kỷ Niệm'} - EMORIA`,
        text: `Thiệp “${houseTitle || 'Ngôi Nhà Kỷ Niệm'}” của ${postcardCoupleNames || 'chúng mình'}${postcardDate ? ` · ${postcardDate}` : ''}${postcardCaption ? `: ${postcardCaption}` : ''}. Ghé thăm ngôi nhà 3D tại EMORIA nhé!`,
        url: isPublished ? shareUrl : ''
      });
      if (res.success) {
        if (res.method === 'web-share-file' || res.method === 'web-share-url') {
          setPostcardShareStatus('shared');
        } else {
          setPostcardShareStatus(res.copied ? 'downloaded-copied' : 'downloaded');
        }
        trackEventAction('house_postcard_shared', 'house', tagUid || currentShareId || 'house', null, { template: postcardTemplate, format: postcardFormat });
      } else if (res.cancelled) {
        setPostcardShareStatus('');
      }
    } catch (err) {
      console.warn('Share postcard error:', err);
      downloadPostcardFile(postcardCanvasRef.current, `emoria-postcard-${Date.now()}.png`);
      setPostcardShareStatus('downloaded');
    }
  };

  const handleDownloadPostcard = () => {
    if (!postcardCanvasRef.current) return;
    const nameSlug = (postcardCoupleNames || 'emoria').toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    downloadPostcardFile(postcardCanvasRef.current, `emoria-postcard-${nameSlug}-${Date.now()}.png`);
    setPostcardShareStatus('downloaded');
    trackEventAction('house_postcard_download', 'house', tagUid || currentShareId || 'house', null, { template: postcardTemplate, format: postcardFormat });
  };

  const handleBackToMemory = () => {
    if(!navigationDirtyRef&&isDirty.current&&!window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))return;
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
    if(!navigationDirtyRef&&isDirty.current&&!window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))return;
    if (onSwitchStudio) {
      onSwitchStudio('match');
    } else if (typeof window !== 'undefined') {
      window.location.href = `/?view=memory-match${tagUid ? `&tag=${encodeURIComponent(tagUid)}` : ''}`;
    }
  };

  const handleGoHome = () => {
    if(!navigationDirtyRef&&isDirty.current&&!window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))return;
    if (onNavigateHome) {
      onNavigateHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  // Lightbox Handlers & Gestures (Chặng B)
  const handleOpenLightbox = useCallback((photoOrUrl, rId = null) => {
    lastFocusedElement.current = document.activeElement;
    if (!photoOrUrl) {
      setLightboxData(null);
      return;
    }
    const targetUrl = typeof photoOrUrl === 'string' ? photoOrUrl : photoOrUrl.photo_url;
    const currentRoomId = rId || (typeof photoOrUrl === 'object' && photoOrUrl.roomId) || currentRoom.id;
    const roomMemories = (latestRooms.current.find((r) => r.id === currentRoomId)?.memories || []).filter((m) => m.photo_url);
    const foundIndex = roomMemories.findIndex((m) => m.photo_url === targetUrl);

    if (foundIndex >= 0) {
      const mem = roomMemories[foundIndex];
      setLightboxData({
        photoUrl: mem.photo_url,
        caption: mem.caption || '',
        date: mem.date || '',
        roomId: currentRoomId,
        photoIndex: foundIndex,
        total: roomMemories.length
      });
    } else {
      setLightboxData({
        photoUrl: targetUrl,
        caption: (typeof photoOrUrl === 'object' && photoOrUrl.caption) || '',
        date: (typeof photoOrUrl === 'object' && photoOrUrl.date) || '',
        roomId: currentRoomId,
        photoIndex: 0,
        total: 1
      });
    }
  }, [currentRoom.id]);

  const handleCloseLightbox = useCallback(() => {
    setLightboxData(null);
    if (lastFocusedElement.current && typeof lastFocusedElement.current.focus === 'function') {
      lastFocusedElement.current.focus();
    }
  }, []);

  const handleLightboxNavigate = useCallback((direction) => {
    setLightboxData((prev) => {
      if (!prev) return null;
      const roomMemories = (latestRooms.current.find((r) => r.id === prev.roomId)?.memories || []).filter((m) => m.photo_url);
      if (roomMemories.length <= 1) return prev;
      let newIdx = prev.photoIndex + (direction === 'next' ? 1 : -1);
      if (newIdx < 0) newIdx = roomMemories.length - 1;
      if (newIdx >= roomMemories.length) newIdx = 0;
      const mem = roomMemories[newIdx];
      return {
        photoUrl: mem.photo_url,
        caption: mem.caption || '',
        date: mem.date || '',
        roomId: prev.roomId,
        photoIndex: newIdx,
        total: roomMemories.length
      };
    });
  }, []);

  const handleToggleHeart = useCallback((photoUrl) => {
    setLikedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoUrl)) next.delete(photoUrl);
      else next.add(photoUrl);
      return next;
    });
    setHeartPopping(true);
    setTimeout(() => setHeartPopping(false), 600);
  }, []);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) handleLightboxNavigate('prev');
      else handleLightboxNavigate('next');
    }
  };

  // Keyboard navigation & Focus trap for Lightbox
  useEffect(() => {
    if (!lightboxData) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseLightbox();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleLightboxNavigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleLightboxNavigate('next');
      } else if (e.key === 'Tab') {
        const focusable = lightboxRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxData, handleCloseLightbox, handleLightboxNavigate]);

  useEffect(() => {
    if (lightboxData && lightboxRef.current) {
      const closeBtn = lightboxRef.current.querySelector('button[data-close-lightbox="true"]');
      closeBtn?.focus();
    }
  }, [lightboxData]);

  // Loading State
  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 pt-28 text-center" role="status">
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

  if (loadError) return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 p-6 pt-28 text-center text-slate-200">
      <h1 className="text-xl font-semibold">Chưa mở được House Studio</h1>
      <p role="alert">{loadError}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="store-button" onClick={loadHouse}>Thử tải lại</button>
        <button type="button" className="store-button" onClick={handleBackToMemory}>Quay lại kỷ vật</button>
      </div>
    </div>
  );

  return (
    <div className={`w-full min-h-screen bg-gradient-to-b ${themeStyle.bg} text-slate-100 px-4 pt-24 sm:pt-28 pb-16 transition-colors duration-500`}>
      <dialog ref={publishDialogRef} onCancel={e => e.preventDefault()} aria-labelledby="house-publish-title" aria-describedby="house-publish-description" aria-busy={isPublishing}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-amber-400/30 bg-stone-950 p-6 text-center text-slate-100 shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
        <Loader2 className="mx-auto mb-4 h-9 w-9 animate-spin text-amber-300" aria-hidden="true" />
        <h2 id="house-publish-title" className="font-serif text-xl font-bold">{publishStage === 'capturing' ? 'Đang tạo ảnh toàn cảnh' : publishStage === 'saving' ? 'Đang lưu ngôi nhà' : 'AI đang duyệt ảnh'}</h2>
        <p id="house-publish-description" role="status" className="mt-3 text-sm leading-relaxed text-slate-300">
          {publishStage === 'capturing' ? 'Đang tạo ảnh toàn cảnh ngôi nhà 3D để hiển thị khi chia sẻ liên kết.' : publishStage === 'saving' ? 'Đang lưu những thay đổi mới nhất trước khi xuất bản.' : 'Hệ thống đang kiểm tra ảnh trước khi chia sẻ công khai. Lần đầu có thể lâu hơn vì AI cần khởi động.'}
        </p>
        {/* ponytail: broad estimate; use measured per-image timings when available. */}
        <p className="mt-3 text-sm text-amber-200">{publishStage === 'reviewing' ? 'Ước tính: khoảng 30 giây–3 phút, tùy số ảnh và thời gian khởi động AI.' : 'Ước tính: vài giây.'}</p>
        <p className="mt-2 text-xs tabular-nums text-slate-400">Đã chờ {publishElapsed} giây</p>
        <p className="mt-3 text-xs text-amber-200">Vui lòng giữ trang này mở. Kết quả sẽ hiển thị khi hoàn tất.</p>
      </dialog>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Header Bar with Multi-Page Navigation & Studio Switcher */}
        <header className="sticky top-20 sm:top-24 z-30 bg-stone-950/95 backdrop-blur-md rounded-2xl p-3 sm:p-3.5 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between gap-3 min-w-0 border border-white/10 shadow-lg" aria-label="Điều hướng studio">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBackToMemory}
              aria-label="Quay lại kỷ vật"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              title="Quay lại không gian kỷ niệm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kỷ vật</span>
            </button>

            <button
              type="button"
              onClick={handleGoHome}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              title="Về Trang Chủ Emoria"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Trang chủ</span>
            </button>

            {onNavigateShop && (
              <button
                type="button"
                onClick={() => {if(navigationDirtyRef||!isDirty.current||window.confirm('Thay đổi chưa lưu xong. Bạn vẫn muốn rời studio?'))onNavigateShop();}}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                title="Xem Cửa Hàng & Bộ Sưu Tập"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Cửa hàng</span>
              </button>
            )}
          </div>

          {/* Central Segmented Studio Control */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-black/50 border border-white/10 backdrop-blur-md self-start md:self-center" role="group" aria-label="Chuyển đổi Studio">
            <button
              type="button"
              onClick={handleSwitchToMatch}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] text-xs font-medium tracking-wide transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              title="Chuyển sang Couple Match Studio"
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-300" />
              <span>Match Studio</span>
            </button>

            <button
              type="button"
              aria-current="page"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/15 text-white font-medium text-xs tracking-wide shadow-sm border border-white/20 select-none cursor-default"
              title="Đang ở Memory House Studio (Không gian 3D)"
            >
              <Home className="w-3.5 h-3.5 text-amber-300" />
              <span>House Studio</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {!isPublicVisitor && activeTab === 'edit' && (
              <div className="shrink-0">
                {autosaveState === 'saving' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] text-slate-300 border border-white/10 text-[11px] font-medium">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-300" />
                    <span>Đang lưu...</span>
                  </span>
                )}
                {autosaveState === 'saved' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px] font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Đã lưu</span>
                  </span>
                )}
                {autosaveState === 'error' && (
                  <button
                    type="button"
                    onClick={() => handleSaveDraft()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-medium transition-colors cursor-pointer"
                    title="Bấm để thử lưu lại"
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span>Chưa lưu — thử lại</span>
                  </button>
                )}
              </div>
            )}

            {isPublished && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px] font-medium shrink-0">
                <Globe className="w-3 h-3" />
                <span>Công khai</span>
              </span>
            )}

            {!isPublicVisitor && activeTab === 'preview' && (
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className="inline-flex items-center px-3 py-1.5 min-h-[36px] rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                Quay lại chỉnh sửa
              </button>
            )}

            {(!isPublicVisitor || isPublished) && (
              <button
                type="button"
                onClick={openPostcardModal}
                aria-label="Xuất Postcard"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 min-h-[36px] rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-300/30 text-amber-200 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-sm select-none"
                title="Tạo thiệp bưu thiếp kỷ niệm để chia sẻ lên mạng xã hội"
              >
                <Mail className="w-3.5 h-3.5 text-amber-300" />
                <span>Xuất Postcard</span>
                <span aria-hidden="true" className="text-xs text-amber-400/80">↗</span>
              </button>
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
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Đã sao chép' : 'Sao chép link'}</span>
              </button>
              <details className="relative text-xs text-slate-300"><summary className="cursor-pointer p-2">Quản lý liên kết</summary><div className="flex flex-wrap gap-2 mt-2">              <button
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
              </button></div></details>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 1: EDIT MODE (Chủ sở hữu chỉnh sửa nội dung và tải ảnh)             */}
        {/* ===================================================================== */}
        {!isPublicVisitor && activeTab === 'edit' && <p className="text-sm text-slate-400">Chọn một phòng bên dưới, thêm ảnh và lời nhắn, rồi xuất bản để chia sẻ. Mọi thay đổi được tự động lưu.</p>}
        {!isPublicVisitor && activeTab === 'edit' && <section aria-label="Nâng cấp bố cục" className="rounded-2xl border border-white/15 p-4 space-y-3">
          <p className="text-sm text-slate-300">Bố cục Cozy giữ nguyên đồ cũ, ảnh và vị trí tùy chỉnh, rồi bổ sung vào chỗ còn trống. Bạn có thể khôi phục bố cục trước nâng cấp.</p>
          <div className="flex flex-wrap gap-3">
            {!layoutPreview && rooms.some(r=>r.furnishingVersion!==2) && <button type="button" disabled={!planLayout || layoutBusy || isPublishing || autosaveState==='saving'} className="min-h-11 rounded-xl border border-amber-300/40 px-4 text-amber-200 disabled:opacity-40" onClick={()=>previewLayout()}>Xem trước bố cục Cozy</button>}
            {!layoutPreview && rooms.some(r=>r.furnishingVersion!==2) && <button type="button" disabled={!planLayout || layoutBusy || isPublishing || autosaveState==='saving'} className="min-h-11 rounded-xl bg-amber-200 px-4 text-stone-950 disabled:opacity-40" onClick={()=>previewLayout({rearrange:true})}>Xem trước sắp xếp H05</button>}
            {layoutBusy && <p role="status" className="w-full text-sm text-amber-200">Đang kiểm tra vị trí và lưu bố cục…</p>}
            {layoutPreview && <>
              <p className="w-full text-sm text-amber-200">Xem trước bố cục với {layoutPreview.added} món bổ sung; {layoutPreview.skipped.length} món chưa có chỗ phù hợp. Chưa lưu thay đổi.</p>
              <button type="button" disabled={layoutBusy} onClick={applyLayoutPreview} className="min-h-11 rounded-xl bg-amber-200 px-4 text-stone-950">Áp dụng và lưu bố cục</button>
              <button type="button" disabled={layoutBusy} onClick={()=>setLayoutPreview(null)} className="min-h-11 rounded-xl border border-white/20 px-4">Hủy xem trước</button>
            </>}
            {canRestoreLayout && !layoutPreview && <button type="button" disabled={layoutBusy || isPublishing || autosaveState==='saving'} onClick={restoreLayout} className="min-h-11 rounded-xl border border-white/20 px-4">Khôi phục bố cục trước nâng cấp</button>}
          </div>
        </section>}
        <MemoryHouse3D
          rooms={layoutPreview?.rooms || rooms} title={houseTitle} theme={selectedTheme}
          activeRoomId={currentRoom.id}
          onSelectRoom={id=>{const index=rooms.findIndex(r=>r.id===id);if(index>=0)setActiveRoomIndex(index);}}
          onRoomsChange={setRooms} onPhoto={handleOpenLightbox}
          onUploadPhoto={handlePhotoUpload} uploading={Boolean(uploadingRoomId)}
          readOnly={isPublicVisitor || activeTab !== 'edit' || Boolean(layoutPreview) || layoutBusy}
          onRegisterCapture={(fn) => { captureHouse3DRef.current = fn; }}
          onRegisterLayoutPlanner={fn=>setPlanLayout(()=>fn)}
        />
        {activeTab === 'edit' && !isPublicVisitor && (
          <section aria-label={`Ảnh và lời nhắn · ${currentRoom.name}`}>
            <div className="space-y-5">
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

                  {/* Polaroid Photo Cards Grid with Reordering & Drag-and-drop */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                      <span>Khoảnh khắc trong phòng ({currentRoom.memories?.length || 0}/10 ảnh)</span>
                      <span className="text-[10px] text-amber-300/80">Kéo thả hoặc dùng mũi tên để sắp xếp</span>
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
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', String(memIdx));
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const from = Number(e.dataTransfer.getData('text/plain'));
                              if (!isNaN(from)) handleMovePhoto(currentRoom.id, from, memIdx);
                            }}
                            className={`${themeStyle.polaroidBg} rounded-2xl p-4 shadow-xl space-y-3 transition-transform hover:-translate-y-1 duration-300 relative group cursor-grab active:cursor-grabbing`}
                          >
                            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-200">
                              <img
                                src={mem.photo_url}
                                alt={mem.caption || `Kỷ niệm ${memIdx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-mono flex items-center gap-1 backdrop-blur-sm">
                                <GripVertical className="w-3 h-3 text-amber-300" />
                                <span>#{memIdx + 1}</span>
                              </div>
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
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                value={mem.caption || ''}
                                onChange={(e) => handleUpdateCaption(currentRoom.id, memIdx, e.target.value)}
                                placeholder="Ghi chú ngọt ngào..."
                                className="w-full px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/10 text-xs font-serif focus:border-amber-600 focus:outline-none"
                              />
                              <div className="flex items-center justify-between text-[10px] opacity-75 px-1 pt-1">
                                {/* Photo Reorder Buttons */}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleMovePhoto(currentRoom.id, memIdx, memIdx - 1)}
                                    disabled={memIdx === 0}
                                    className="px-1.5 py-0.5 rounded bg-black/10 hover:bg-black/20 text-dark-900 disabled:opacity-20 cursor-pointer font-bold"
                                    title="Di chuyển ảnh về trước"
                                  >
                                    ←
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMovePhoto(currentRoom.id, memIdx, memIdx + 1)}
                                    disabled={memIdx === (currentRoom.memories?.length || 1) - 1}
                                    className="px-1.5 py-0.5 rounded bg-black/10 hover:bg-black/20 text-dark-900 disabled:opacity-20 cursor-pointer font-bold"
                                    title="Di chuyển ảnh ra sau"
                                  >
                                    →
                                  </button>
                                </div>
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

                  {/* Journey's End Love Letter Editor (Chặng C) */}
                  {currentRoom.id === 'next-chapter' && (
                    <details className="p-4 sm:p-5 rounded-2xl bg-amber-500/[0.06] border border-amber-400/25 space-y-4">
                      <summary className="cursor-pointer text-sm text-amber-200">Thêm phong thư gửi tương lai (tùy chọn)</summary>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">💌</span>
                          <div>
                            <h4 className="font-serif font-bold text-amber-200 text-sm">
                              Phong thư cuối hành trình (Gửi tương lai)
                            </h4>
                            <p className="text-[11px] text-slate-400">
                              Lời nhắn tâm tình đọng lại sau chuyến thăm 5 căn phòng kỷ niệm.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsLetterModalOpen(true)}
                          className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 text-xs font-semibold border border-amber-400/30 transition-colors cursor-pointer self-start sm:self-auto"
                        >
                          Xem thử phong thư
                        </button>
                      </div>

                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            Tiêu đề phong thư
                          </label>
                          <input
                            type="text"
                            maxLength={100}
                            value={currentRoom.journey_letter?.title || ''}
                            onChange={(e) => handleUpdateJourneyLetter('title', e.target.value)}
                            placeholder="Gửi người thương ở tương lai..."
                            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            Nội dung bức thư ({currentRoom.journey_letter?.content?.length || 0}/1500)
                          </label>
                          <textarea
                            rows={4}
                            maxLength={1500}
                            value={currentRoom.journey_letter?.content || ''}
                            onChange={(e) => handleUpdateJourneyLetter('content', e.target.value)}
                            placeholder="Viết những lời chân thành nhất dành tặng người ấy..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none leading-relaxed resize-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Ký tên người gửi
                            </label>
                            <input
                              type="text"
                              maxLength={60}
                              value={currentRoom.journey_letter?.author || ''}
                              onChange={(e) => handleUpdateJourneyLetter('author', e.target.value)}
                              placeholder="Tên của bạn hoặc cả hai..."
                              className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Ngày viết thư
                            </label>
                            <input
                              type="text"
                              maxLength={30}
                              value={currentRoom.journey_letter?.date || ''}
                              onChange={(e) => handleUpdateJourneyLetter('date', e.target.value)}
                              placeholder="28.09.2026..."
                              className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 pt-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentRoom.journey_letter?.is_shared ?? true}
                            onChange={(e) => handleUpdateJourneyLetter('is_shared', e.target.checked)}
                            className="rounded border-white/20 bg-white/10 text-amber-500 focus:ring-0 cursor-pointer"
                          />
                          <span className="text-xs text-slate-300">
                            Cho phép khách ghé thăm mở đọc bức thư này ở cuối chuyến tham quan
                          </span>
                        </label>
                      </div>
                    </details>
                  )}
                </div>

                {/* House Title & Theme Settings */}
                <details className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-300">Tên ngôi nhà & tông màu</summary>
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
                </details>

                <details className="rounded-2xl border border-white/10 p-4 space-y-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-300">Lời nhắn của khách & quyền riêng tư</summary>
                  <label className="block text-sm">Ai có thể gửi lời nhắn khi ghé nhà?
                    <select className="block mt-2 bg-stone-900 p-2 rounded-lg" value={rooms.find(r=>r.id==='beginning')?.reply_policy||'off'} onChange={e=>setRooms(prev=>prev.map(r=>r.id==='beginning'?{...r,reply_policy:e.target.value}:r))}>
                      <option value="off">Tắt lời nhắn</option><option value="visitors">Người có liên kết nhà</option><option value="signed_in">Người đã đăng nhập</option>
                    </select>
                  </label><p className="text-xs text-stone-400">Thay đổi có hiệu lực với khách sau khi xuất bản. Chỉ bạn xem được lời hồi đáp.</p>
                  <button type="button" onClick={()=>getHouseReplies(tagUid).then(setGuestEntries).catch(e=>setError(e.message))} className="text-sm text-amber-200">Làm mới lời hồi đáp</button>
                  {guestEntries.map(entry=><article key={entry.id} className="border-t border-white/10 py-2 text-sm"><strong>{entry.name}</strong><p>{entry.is_hidden?'Lời nhắn đã được ẩn':entry.kind==='heart'?'♥':entry.message}</p><button type="button" className="text-xs text-rose-300" onClick={()=>submitContentReport('guestbook',entry.id,'other','Chủ nhà báo cáo lời nhắn').then(()=>setSuccessMsg('Đã gửi báo cáo')).catch(e=>setError(e.message))}>Báo cáo lời nhắn</button></article>)}
                </details>
                {/* Bottom Actions Bar */}
                <div className="space-y-3 pt-4 border-t border-white/10">
                {(isPublishing || error || successMsg) && (
                  <p role={error ? 'alert' : 'status'} className={`text-sm ${error ? 'text-red-300' : 'text-emerald-300'}`}>
                    {isPublishing ? 'Đang lưu và kiểm tra ảnh để xuất bản. Vui lòng chờ…' : error || successMsg}
                  </p>
                )}
                {isPublished && shareUrl && <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm text-amber-200 underline">Mở liên kết ngôi nhà đã xuất bản ↗</a>}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    {autosaveState === 'error' && <button
                      type="button"
                      onClick={() => handleSaveDraft()}
                      disabled={isSaving}
                      className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/15 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? 'Đang lưu...' : 'Thử lưu lại'}
                    </button>}
                    {autosaveState === 'saved' && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã tự động lưu</span>
                      </span>
                    )}
                    {autosaveState === 'saving' && (
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang tự động lưu...</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className="inline-flex items-center justify-center gap-2 px-3 py-3 text-slate-300 hover:text-white font-semibold text-sm underline underline-offset-4 transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Xem thử</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPublishing || Boolean(layoutPreview) || layoutBusy}
                      aria-label={isPublishing ? 'Đang xuất bản' : isPublished ? 'Cập nhật xuất bản' : 'Xuất Bản Ngôi Nhà'}
                      className="group flex-1 sm:flex-none min-w-0 inline-flex items-center justify-between gap-5 px-5 py-3 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 hover:from-white hover:to-amber-300 text-stone-950 border border-amber-100/50 shadow-[0_8px_28px_rgba(245,158,11,0.22)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span className="text-left"><span className="block text-[9px] font-semibold uppercase tracking-[0.16em]">Mở cửa đón người thương</span><span className="block font-serif font-bold text-base">{isPublishing ? 'Đang xuất bản...' : isPublished ? 'Cập nhật xuất bản' : 'Xuất bản ngôi nhà'}</span></span>
                      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stone-900/20 text-xl transition-transform group-hover:translate-x-1">→</span>
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
                    onClick={() => handleOpenLightbox(mem, currentRoom.id)}
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

            {/* Journey's End Section: Love Letter & Guestbook (Chặng C) */}
            {activeRoomIndex === rooms.length - 1 && (
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-amber-500/[0.08] via-black/40 to-rose-500/[0.08] border border-amber-400/30 backdrop-blur-xl shadow-2xl space-y-6 text-center max-w-2xl mx-auto">
                <div className="space-y-2">
                  <span className="text-3xl animate-bounce inline-block">💌</span>
                  <h3 className="text-xl sm:text-2xl font-serif font-bold text-white">
                    Kết Thúc Chuyến Thăm Ngôi Nhà Kỷ Niệm
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                    Cảm ơn bạn đã đồng hành qua 5 căn phòng ngập tràn yêu thương và ký ức của đôi mình.
                  </p>
                </div>

                {/* Love Letter Opener */}
                {rooms.find((r) => r.id === 'next-chapter')?.journey_letter?.is_shared && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsLetterModalOpen(true)}
                      className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-dark-950 font-bold text-sm shadow-xl shadow-amber-500/20 transition-all cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Mail className="w-4 h-4" />
                      <span>Mở Phong Thư Cuối Hành Trình</span>
                    </button>
                  </div>
                )}

                {/* "Mình đã ghé nhà" Guestbook & Heart Reaction */}
                <div className="pt-6 border-t border-white/10 space-y-4">
                  <h4 className="text-sm font-serif font-bold text-amber-200">
                    Để lại lời hồi đáp "Mình đã ghé nhà"
                  </h4>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleSendVisitorHeart}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        hasSentHeart
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-lg shadow-rose-500/20'
                          : 'bg-white/10 border-white/15 text-white hover:bg-white/15'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${hasSentHeart ? 'fill-rose-500 text-rose-500' : ''}`} />
                      <span>{hasSentHeart ? 'Đã gửi tim yêu thương ♥' : 'Thả tim cho đôi bạn'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsGuestbookModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4 text-amber-300" />
                      <span>Gửi lời chúc mừng</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Lightbox Modal with Gestures, Keyboard Nav, Caption, Heart Pop, and Focus Trap (Chặng B) */}
        <AnimatePresence>
          {lightboxData && (
            <motion.div
              ref={lightboxRef}
              role="dialog"
              aria-modal="true"
              aria-label="Xem ảnh kỷ niệm chi tiết"
              tabIndex={-1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 select-none focus:outline-none"
              onClick={handleCloseLightbox}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Top Bar: Counter, Room Name, Close button */}
              <div className="flex items-center justify-between z-10 w-full max-w-5xl mx-auto pt-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/10 text-slate-300 border border-white/10">
                    {lightboxData.total > 1 ? `${lightboxData.photoIndex + 1} / ${lightboxData.total}` : '1 / 1'}
                  </span>
                  <span className="text-xs font-serif text-amber-300/80">
                    {rooms.find((r) => r.id === lightboxData.roomId)?.name || 'Kỷ niệm'}
                  </span>
                </div>
                <button
                  type="button"
                  data-close-lightbox="true"
                  aria-label="Đóng ảnh phóng to"
                  onClick={handleCloseLightbox}
                  className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer hover:rotate-90 duration-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Content Area: Prev Button, Image, Next Button */}
              <div className="relative flex-1 flex items-center justify-center my-auto w-full max-w-5xl mx-auto overflow-hidden">
                {lightboxData.total > 1 && (
                  <button
                    type="button"
                    aria-label="Ảnh trước"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLightboxNavigate('prev');
                    }}
                    className="absolute left-2 sm:left-4 z-20 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer hover:scale-110 active:scale-95"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}

                <motion.div
                  key={lightboxData.photoUrl}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="relative max-w-full max-h-[72vh] flex items-center justify-center p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={lightboxData.photoUrl}
                    alt={lightboxData.caption || 'Ảnh kỷ niệm'}
                    className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                  />
                </motion.div>

                {lightboxData.total > 1 && (
                  <button
                    type="button"
                    aria-label="Ảnh tiếp theo"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLightboxNavigate('next');
                    }}
                    className="absolute right-2 sm:right-4 z-20 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer hover:scale-110 active:scale-95"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                )}
              </div>

              {/* Bottom Caption & Heart Reaction Bar */}
              <div
                className="w-full max-w-xl mx-auto p-4 rounded-2xl bg-white/[0.06] border border-white/15 backdrop-blur-xl flex items-center justify-between gap-4 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-serif italic text-white truncate">
                    {lightboxData.caption || 'Khoảnh khắc ngọt ngào bên nhau'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {lightboxData.date || 'Emoria Memory Space'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <motion.button
                    type="button"
                    aria-label={likedPhotos.has(lightboxData.photoUrl) ? 'Bỏ thích ảnh' : 'Thả tim ảnh'}
                    onClick={() => handleToggleHeart(lightboxData.photoUrl)}
                    animate={heartPopping ? { scale: [1, 1.4, 0.9, 1.1, 1] } : { scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className={`p-2.5 rounded-full border transition-all cursor-pointer ${
                      likedPhotos.has(lightboxData.photoUrl)
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-lg shadow-rose-500/20'
                        : 'bg-white/10 border-white/10 text-white hover:text-rose-300 hover:bg-white/15'
                    }`}
                  >
                    <Heart
                      className={`w-5 h-5 transition-transform ${
                        likedPhotos.has(lightboxData.photoUrl) ? 'fill-rose-500 text-rose-500' : ''
                      }`}
                    />
                  </motion.button>
                </div>
              </div>
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

        {/* Journey's End Love Letter Modal (Chặng C) */}
        <AnimatePresence>
          {isLetterModalOpen && (() => {
            const letter = rooms.find((r) => r.id === 'next-chapter')?.journey_letter || {
              title: 'Gửi người thương ở tương lai',
              content: 'Cảm ơn vì đã luôn ở bên, lắng nghe và đồng hành cùng nhau qua từng chặng đường cuộc sống.',
              author: 'Đôi Mình',
              date: 'Mãi Mãi'
            };
            return (
              <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="w-full max-w-lg bg-[#fbf6ee] text-[#4a362a] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden border-4 border-[#e5d4be]"
                >
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-rose-300 to-amber-500" />

                  {/* Wax Seal Badge */}
                  <div className="flex items-center justify-between border-b border-[#e5d4be] pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-red-800 text-amber-200 font-serif font-bold text-xs flex items-center justify-center shadow-md border-2 border-red-900">
                        EM
                      </div>
                      <span className="text-[11px] uppercase tracking-widest font-mono font-bold text-[#8c6b53]">
                        Phong Thư Cuối Hành Trình
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLetterModalOpen(false)}
                      className="p-1 rounded-full text-[#8c6b53] hover:text-[#4a362a] transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Letter Content */}
                  <div className="space-y-4 font-serif">
                    <h3 className="text-xl sm:text-2xl font-bold text-[#35251c] text-center leading-snug">
                      "{letter.title || 'Gửi người thương ở tương lai'}"
                    </h3>

                    <p className="text-sm sm:text-base italic leading-relaxed text-[#4a362a] whitespace-pre-wrap max-h-[50vh] overflow-y-auto px-2">
                      {letter.content || 'Ngôi nhà kỷ niệm là nơi lưu giữ từng nhịp đập yêu thương. Dù thời gian trôi qua bao lâu, những khoảnh khắc ngọt ngào bên nhau vẫn luôn vẹn nguyên như ngày đầu.'}
                    </p>

                    <div className="pt-4 border-t border-[#e5d4be] flex items-center justify-between text-xs text-[#8c6b53] font-medium">
                      <span>{letter.date || 'Hôm nay & Mai sau'}</span>
                      <span className="font-bold font-serif text-sm text-[#4a362a]">
                        — {letter.author || 'Đôi Mình'}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => setIsLetterModalOpen(false)}
                      className="px-6 py-2.5 rounded-2xl bg-[#4a362a] text-[#fbf6ee] hover:bg-[#35251c] text-xs font-bold transition-colors cursor-pointer shadow-md"
                    >
                      Gấp lại phong thư
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>

        {/* Visitor Guestbook Modal (Chặng C) */}
        <AnimatePresence>
          {isGuestbookModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md bg-dark-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Gửi Lời Chúc Mừng</h3>
                      <p className="text-[11px] text-slate-400">Lưu lại dấu ấn ghé thăm ngôi nhà kỷ niệm</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGuestbookModalOpen(false)}
                    className="p-1 rounded-full text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {guestSubmitted ? (
                  <div className="py-8 text-center space-y-2">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                    <h4 className="text-base font-bold text-white">Đã gửi lời chúc thành công!</h4>
                    <p className="text-xs text-slate-300">Chủ nhà sẽ nhận được lời chúc ấm áp của bạn.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSendGuestMessage} className="space-y-3.5 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Tên hoặc biệt danh của bạn
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={50}
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Ví dụ: Bạn thân, Em gái, ..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Lời nhắn yêu thương ({guestMessage.length}/300)
                      </label>
                      <textarea
                        required
                        rows={3}
                        maxLength={300}
                        value={guestMessage}
                        onChange={(e) => setGuestMessage(e.target.value)}
                        placeholder="Chúc hai bạn mãi hạnh phúc và trọn vẹn yêu thương..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:border-amber-400 focus:outline-none resize-none leading-relaxed"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsGuestbookModalOpen(false)}
                        className="px-4 py-2 text-xs text-slate-400 hover:text-white font-medium cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-dark-950 text-xs font-bold shadow-lg transition-colors cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Gửi lời chúc</span>
                      </button>
                    </div>
                  </form>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Postcard & Social Share Card Modal (Chặng D) */}
          {isPostcardModalOpen && createPortal(
            <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-6">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                role="dialog" aria-modal="true" aria-label="Tạo thiệp kỷ niệm"
                onKeyDown={e => {
                  if (e.key === 'Escape') setIsPostcardModalOpen(false);
                  if (e.key !== 'Tab') return;
                  const controls = [...e.currentTarget.querySelectorAll('button, input, textarea')].filter(el => !el.disabled);
                  const first = controls[0], last = controls.at(-1);
                  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
                  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
                }}
                className="w-full min-w-0 max-w-4xl bg-dark-900 border border-white/15 rounded-3xl p-3 sm:p-7 shadow-2xl relative flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4 shrink-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/20 to-rose-400/20 text-amber-300 flex items-center justify-center border border-amber-400/30">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white font-serif">
                        Tạo Thiệp Kỷ Niệm (Postcard Social)
                      </h3>
                      <p className="hidden sm:block text-[11px] text-slate-400">
                        Xuất ảnh chất lượng cao 1080p sẵn sàng đăng Story, Feed hoặc gửi cho người thương
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPostcardModalOpen(false)}
                    aria-label="Đóng thiệp kỷ niệm" autoFocus
                    className="shrink-0 p-2.5 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body: 2 Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 min-w-0 overflow-y-auto overscroll-contain flex-1 pr-1 scrollbar-thin">
                  {/* Left Column: Live Canvas Preview */}
                  <div className="lg:col-span-6 min-w-0 flex flex-col items-center justify-center bg-black/50 p-3 rounded-2xl border border-white/10 relative">
                    {isRenderingPostcard && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-10 rounded-2xl">
                        <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
                      </div>
                    )}
                    <canvas
                      ref={postcardCanvasRef}
                      className="max-h-[40dvh] sm:max-h-[55dvh] w-full min-w-0 max-w-full rounded-xl shadow-2xl border border-white/10 object-contain"
                    />
                    <p className="text-[10px] text-slate-500 mt-2 font-mono">
                      Kích thước xuất: {POSTCARD_FORMATS[postcardFormat]?.width} × {POSTCARD_FORMATS[postcardFormat]?.height} px
                    </p>
                  </div>

                  {/* Right Column: Controls */}
                  <div className="lg:col-span-6 min-w-0 space-y-4 text-xs">
                    {/* Template Picker */}
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Mẫu thiệp</label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.values(POSTCARD_TEMPLATES).map((tmpl) => (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => setPostcardTemplate(tmpl.id)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              postcardTemplate === tmpl.id
                                ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <span className="font-bold block text-xs">{tmpl.name}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5 line-clamp-1">{tmpl.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Format / Aspect Ratio */}
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Tỉ lệ khung hình</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPostcardFormat('square')}
                          className={`p-2 rounded-xl border font-semibold transition-all cursor-pointer text-center ${
                            postcardFormat === 'square'
                              ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          1:1 Vuông (Feed Post)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPostcardFormat('story')}
                          className={`p-2 rounded-xl border font-semibold transition-all cursor-pointer text-center ${
                            postcardFormat === 'story'
                              ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          9:16 Dọc (Story / Reels)
                        </button>
                      </div>
                    </div>

                    {/* Theme Mode */}
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Tông màu thiệp</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPostcardTheme('dark')}
                          className={`p-2 rounded-xl border font-semibold transition-all cursor-pointer text-center ${
                            postcardTheme === 'dark'
                              ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          ✦ Đêm Sang Trọng (Obsidian)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPostcardTheme('light')}
                          className={`p-2 rounded-xl border font-semibold transition-all cursor-pointer text-center ${
                            postcardTheme === 'light'
                              ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          ☀ Ánh Sáng Ấm (Champagne)
                        </button>
                      </div>
                    </div>

                    {/* Photo selection if polaroid */}
                    {postcardTemplate === 'polaroid' && (
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1.5">
                          Chọn ảnh kỷ niệm hiển thị ({rooms.flatMap(r => r.memories || []).length} ảnh)
                        </label>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                          {rooms.flatMap(r => r.memories || []).map((m, idx) => (
                            <button
                              key={m.id || idx}
                              type="button"
                              onClick={() => {
                                setPostcardPhoto(m.photo_url);
                                if (m.caption) setPostcardCaption(m.caption);
                                if (m.date) setPostcardDate(m.date);
                              }}
                              className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                                postcardPhoto === m.photo_url ? 'border-amber-400 scale-105' : 'border-white/15 opacity-60 hover:opacity-100'
                              }`}
                            >
                              <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Editable fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">Tên hai người / Tiêu đề</label>
                        <input
                          type="text"
                          maxLength={50}
                          value={postcardCoupleNames}
                          onChange={(e) => setPostcardCoupleNames(e.target.value)}
                          placeholder="Minh & Thảo..."
                          className="w-full px-3 py-1.5 rounded-xl bg-white/5 border border-white/15 text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">Ngày kỷ niệm</label>
                        <input
                          type="text"
                          maxLength={30}
                          value={postcardDate}
                          onChange={(e) => setPostcardDate(e.target.value)}
                          placeholder="29.09.2026..."
                          className="w-full px-3 py-1.5 rounded-xl bg-white/5 border border-white/15 text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">Lời tựa ngắn ({postcardCaption.length}/140)</label>
                      <textarea
                        rows={2}
                        maxLength={140}
                        value={postcardCaption}
                        onChange={(e) => setPostcardCaption(e.target.value)}
                        placeholder="Viết một câu chúc hoặc trích dẫn tình yêu..."
                        className="w-full px-3 py-1.5 rounded-xl bg-white/5 border border-white/15 text-white focus:border-amber-400 focus:outline-none resize-none leading-relaxed"
                      />
                    </div>

                    {/* QR Code Option */}
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={postcardIncludeQR && isPublished}
                          disabled={!isPublished}
                          onChange={(e) => setPostcardIncludeQR(e.target.checked)}
                          className="rounded border-white/20 bg-white/10 text-amber-500 focus:ring-0 disabled:opacity-40"
                        />
                        <span className="font-semibold text-slate-200">
                          Đính kèm mã QR quét để ghé thăm nhà
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-400 pl-5">
                        {isPublished
                          ? 'Mã QR chuẩn quốc tế cho phép bạn bè quét camera trực tiếp để vào thăm 5 căn phòng.'
                          : '✦ Ngôi nhà đang ở chế độ riêng tư (Draft). Thiệp sẽ hiển thị dấu niêm phong kỷ niệm riêng tư thay vì mã QR công khai.'}
                      </p>
                    </div>

                    {/* Status feedback */}
                    {postcardShareStatus === 'shared' && (
                      <p className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Đã mở chia sẻ thành công!
                      </p>
                    )}
                    {postcardShareStatus === 'downloaded' && (
                      <p className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Đã tải ảnh thiệp về máy của bạn!
                      </p>
                    )}
                    {postcardShareStatus === 'downloaded-copied' && (
                      <p className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Đã tải ảnh và sao chép liên kết vào clipboard!
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 mt-3 shrink-0 pb-[env(safe-area-inset-bottom)]">
                  <p className="hidden sm:block text-[11px] text-slate-400 italic text-center sm:text-left">
                    Lưu ý: Tệp ảnh sau khi bạn tải xuống hoặc chia sẻ sẽ được lưu trên thiết bị của bạn.
                  </p>

                  <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadPostcard}
                      className="min-w-0 flex flex-col justify-center items-start px-3 py-2.5 rounded-xl bg-stone-100 hover:bg-white text-stone-900 border border-white/30 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-[9px] uppercase tracking-wider">Giữ một bản cho mình</span>
                      <span className="font-serif text-sm font-bold">Tải ảnh PNG ↓</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSharePostcard}
                      disabled={postcardShareStatus === 'sharing'}
                      className="min-w-0 flex flex-col justify-center items-start px-3 py-2.5 rounded-xl bg-gradient-to-br from-amber-100 to-amber-400 hover:from-white hover:to-amber-300 text-stone-950 border border-amber-100/40 shadow-lg shadow-amber-500/15 transition-all cursor-pointer disabled:opacity-50 text-left"
                    >
                      <span className="text-[9px] uppercase tracking-wider">Gửi đến người thương</span>
                      <span className="font-serif text-sm font-bold">{postcardShareStatus === 'sharing' ? 'Đang chia sẻ...' : 'Chia sẻ thiệp ↗'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          , document.body)}

        {/* Visitor Content Report Entrypoint */}
        {(isPublicVisitor || !canEdit) && (
          <div className="flex justify-end pt-4 pb-2">
            <button
              type="button"
              onClick={() => {
                setShowReportModal(true);
                setReportSuccess(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-rose-400 text-xs transition-colors cursor-pointer border border-white/5"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Báo cáo nội dung</span>
            </button>
          </div>
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
                        await submitContentReport('house', initialShareId || currentShareId || tagUid || 'house', reportReason, reportDetails);
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
                      Nếu bạn phát hiện hình ảnh, ghi chú hoặc lời nhắn trong ngôi nhà này vi phạm tiêu chuẩn cộng đồng, vui lòng cho chúng tôi biết:
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
                        placeholder="Mô tả cụ thể phòng hoặc hình ảnh vi phạm..."
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
    </div>
  );
}
