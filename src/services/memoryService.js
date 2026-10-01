/**
 * EMORIA LUXURY - UNIFIED MEMORY SERVICE
 * Một nguồn dữ liệu duy nhất tương tác với Supabase RPC và PostgreSQL RLS.
 * Bảo vệ triệt để quyền riêng tư: Thư tay và Media nhạy cảm chỉ được tải sau khi có Grant Token hợp lệ.
 */

import {apiRequest} from './apiClient.js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

// Bộ nhớ đệm tạm thời cho phiên làm việc (In-memory Session Grants)
const activeSessionGrants = new Map();
const demoGrants = new Map();

function getDemoAvailabilityError(mem) {
  const { status, unlock_date } = mem.availability || {};
  const unlockAt = Date.parse(unlock_date);
  if (status === 'suspended' || (status === 'timed_lock' && (!Number.isFinite(unlockAt) || Date.now() < unlockAt))) {
    return { success: false, message: 'Kỷ niệm hiện chưa khả dụng.', availability: mem.availability };
  }
  return null;
}

/**
 * Hash cho dữ liệu demo; xác thực PIN thật chỉ chạy qua pgcrypto trên server.
 * @param {string} str 
 */
export async function sha256(str) {
  if (globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Lấy Grant Token hiện tại của một tagUid trong phiên
 * @param {string} tagUid 
 */
export function getStoredGrantToken(tagUid) {
  return activeSessionGrants.get(String(tagUid).toLowerCase().trim()) || null;
}

/**
 * Lưu Grant Token cho phiên làm việc
 * @param {string} tagUid 
 * @param {string} token 
 */
export function setStoredGrantToken(tagUid, token) {
  activeSessionGrants.set(String(tagUid).toLowerCase().trim(), token);
}

/**
 * Dữ liệu demo công khai, chỉ dùng khi chưa cấu hình Supabase.
 * Nội dung trong bundle không phải kho dữ liệu riêng tư hay cơ chế xác thực thật.
 */
const OFFLINE_SEED_MEMORIES = {
  'emoria-lumen': {
    tag_uid: 'emoria-lumen',
    jewelry_name: 'Dây Chuyền S925 Emoria Lumen',
    title: 'Dưới Ánh Hoàng Hôn Santorini',
    date: '14 Tháng 02, 2025',
    author: 'Minh Hoàng',
    recipient: 'Bảo Trâm',
    quote: 'Mỗi ánh sao đêm nay đều lưu giữ trọn vẹn lời hẹn ước của đôi ta dưới hoàng hôn rực rỡ.',
    letter: 'Gửi người con gái anh yêu nhất, chiếc dây chuyền bạc S925 Lumen này lưu giữ trọn vẹn khoảnh khắc hoàng hôn ngày hôm ấy tại Santorini...',
    audio_title: 'Bản Dạ Khúc Hoàng Hôn (Acoustic)',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=melody-of-nature-110481.mp3',
    is_protected: false,
    availability: { status: 'available', unlock_date: null },
    media_gallery: [
      {
        id: 'med-1',
        url: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Hoàng hôn tuyệt mỹ trên vịnh biển Santorini',
      },
      {
        id: 'med-2',
        url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        type: 'video',
        caption: 'Khoảnh khắc hoa nở rộ cùng lời ước nguyện dưới ánh chiều',
      },
      {
        id: 'med-3',
        url: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Tay trong tay và lời hẹn ước trăm năm',
      }
    ],
    guestbook: [
      {
        id: 'gb-1',
        author: 'Minh Hoàng',
        relationship: 'Người tặng',
        message: 'Mãi mãi bên nhau em nhé!',
        created_at: '14/02/2025 18:30'
      },
      {
        id: 'gb-2',
        author: 'Hồng Ánh',
        relationship: 'Bạn thân',
        message: 'Chúc hai bạn mãi hạnh phúc và ngọt ngào như ngày đầu!',
        created_at: '15/02/2025 09:15'
      }
    ]
  },
  'emoria-pulse': {
    tag_uid: 'emoria-pulse',
    jewelry_name: 'Vòng Tay S925 Emoria Pulse',
    title: 'Nhịp Đập Đầu Tiên',
    date: '20 Tháng 10, 2024',
    author: 'Khánh An',
    recipient: 'Hương Giang',
    quote: 'Dù ở bất kỳ phương trời nào, chiếc vòng sẽ luôn nhắc nhở về nhịp đập trái tim ta dành cho nhau.',
    // Nội dung mật chỉ trả về sau khi mở khóa PIN
    _private_letter: 'Gửi Hương Giang, kỷ niệm 1000 ngày bên nhau. Cảm ơn em đã luôn là ánh sáng dịu êm nhất cuộc đời anh...',
    _pin_hash: '40510175845988f13f6162ed8526f0b09f73384467fa855e1e79b44a56562a58', // SHA-256 của '1000'
    pin_hint: 'Kỷ niệm bao nhiêu ngày yêu thương của hai đứa mình?',
    audio_title: 'VoiceMemo - Lời Thì Thầm 1000 Ngày',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/11/06/audio_29114f6b21.mp3?filename=lofi-study-112191.mp3',
    is_protected: true,
    availability: { status: 'available', unlock_date: null },
    media_gallery: [
      {
        id: 'med-p1',
        url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Nụ cười rạng rỡ của em ngày đầu đông'
      },
      {
        id: 'med-p2',
        url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        type: 'video',
        caption: 'Thước phim kỷ niệm 1000 ngày yêu thương'
      }
    ],
    guestbook: [
      {
        id: 'gb-p1',
        author: 'Khánh An',
        relationship: 'Người tặng',
        message: 'Mỗi nhịp đập nơi cổ tay sẽ luôn có anh kề bên em.',
        created_at: '20/10/2024 20:00'
      }
    ]
  },
  'emoria-horizon': {
    tag_uid: 'emoria-horizon',
    jewelry_name: 'Nhẫn Đôi S925 Emoria Horizon',
    title: 'Tọa Độ Chân Trời Vĩnh Cửu',
    date: '20 Tháng 10, 2026',
    author: 'Đức Huy',
    recipient: 'Thanh Nhã',
    quote: 'Chân trời không phải là điểm kết thúc, mà là nơi hai linh hồn hòa làm một.',
    _private_letter: 'Thanh Nhã thân yêu, chiếc nhẫn này ghi dấu tọa độ giao thừa của đôi ta...',
    audio_title: 'Giai Điệu Giao Thừa & Nguyện Ước',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=sweet-love-121471.mp3',
    is_protected: false,
    availability: { status: 'timed_lock', unlock_date: '2026-10-20T18:00:00.000Z' },
    media_gallery: [],
    guestbook: []
  }
};

/**
 * Lấy dữ liệu hiển thị Kỷ Niệm từ Supabase RPC
 * @param {string} tagUid 
 * @param {string} grantToken 
 */
export async function fetchMemoryView(tagUid, grantToken = null) {
  if (!tagUid) throw new Error('Thiếu mã định danh chip NFC.');
  const cleanTag = String(tagUid).toLowerCase().trim();
  const token = grantToken || getStoredGrantToken(cleanTag);

  // REST endpoint keeps the database access and grant checks on the server.
  if (isSupabaseConfigured()) {
    try {
      const data = await apiRequest(`/memories/${encodeURIComponent(cleanTag)}/access`,{method:'POST',body:{grant:token||null}});
      if (data) {
        data.media_gallery=(data.media_gallery||[]).map(m=>({...m,path:m.url?.startsWith('storage://')?m.url.slice(10):null}));
        // Studio edits the saved collection, not the subset whose playback URLs loaded.
        if(data.is_owner||data.is_admin)data.studio_media=data.media_gallery.map(m=>({...m}));
        data.audio_path=data.audio_url;
        if(data.is_unlocked && (data.intro_video_path || data.audio_url?.startsWith('storage://') || data.media_gallery.some(m=>m.path))){
          let signed=data.media_signing;
          // Keep compatibility with an older API during deployment/cache transitions.
          if(!signed?.urls){
          const session=await supabase.auth.getSession();
          const response=await fetch('/api/memory-media',{method:'POST',headers:{'Content-Type':'application/json',...(session.data.session?{Authorization:`Bearer ${session.data.session.access_token}`}:{})},body:JSON.stringify({tag:cleanTag,grant:token||null}),signal:AbortSignal.timeout(20000)});
          signed=await response.json();if(!response.ok)return {success:false,message:signed.error};
          }
          delete data.media_signing;
          data.media_warning=signed.warning||null;
          data.media_gallery=data.media_gallery.filter(m=>!signed.blocked?.includes(m.path)&&(!m.path||signed.urls[m.path])).map(m=>({...m,url:m.path?signed.urls[m.path]:m.url}));
          if(data.audio_url?.startsWith('storage://'))data.audio_url=signed.urls[data.audio_url.slice(10)];
          if(data.intro_video_path)data.intro_video_url=signed.urls[data.intro_video_path]||null;
        }
        return {
          success: data.success === true,
          message: data.message,
          availability: data.availability,
          data,
          source: 'rest_api',
        };
      }
      return { success: false, message: 'Phản hồi máy chủ không hợp lệ.' };
    } catch (err) {
      return { success: false, message: err.message, source: 'rest_api' };
    }
  }

  // 2. Demo khi chưa cấu hình server; không cấp quyền Owner/Admin cục bộ.
  const mem = OFFLINE_SEED_MEMORIES[cleanTag];
  if (!mem) {
    return {
      success: false,
      message: `Không tìm thấy kỷ vật mang mã chip ${tagUid}`,
    };
  }

  const unavailable = getDemoAvailabilityError(mem);
  if (unavailable) return unavailable;
  const grant = demoGrants.get(token);
  const isUnlocked = !mem.is_protected || Boolean(grant && grant.tag === cleanTag && grant.expiresAt > Date.now());
  const sanitized = {
    success: true,
    tag_uid: mem.tag_uid,
    jewelry_name: mem.jewelry_name,
    title: mem.title,
    date: mem.date,
    quote: mem.quote,
    author: mem.author,
    recipient: mem.recipient,
    audio_title: mem.audio_title,
    audio_url: mem.audio_url,
    is_protected: mem.is_protected,
    pin_hint: mem.is_protected && mem.pin_hint ? mem.pin_hint : null,
    is_unlocked: isUnlocked,
    // CHỐNG RÒ RỈ: Nếu chưa mở khóa thì letter là NULL
    letter: isUnlocked ? (mem.letter || mem._private_letter) : null,
    availability: mem.availability,
    tap_count: 12,
    media_gallery: (mem.media_gallery || []).filter(media => !media.is_private || isUnlocked),
    guestbook: mem.guestbook || [],
  };

  return {
    success: true,
    data: sanitized,
    source: 'offline_protected_seed',
  };
}

/**
 * Xác thực mã PIN bảo mật
 * @param {string} tagUid 
 * @param {string} enteredPin 
 */
export async function verifyMemoryPin(tagUid, enteredPin) {
  if (!tagUid || !enteredPin) {
    return { success: false, message: 'Vui lòng nhập mã PIN bảo mật.' };
  }

  const cleanTag = String(tagUid).toLowerCase().trim();

  // The server/database validates PIN and limits repeated attempts.
  if (isSupabaseConfigured()) {
    try {
      const data = await apiRequest(`/memories/${encodeURIComponent(cleanTag)}/grants`,{method:'POST',body:{pin:enteredPin.trim()}});
      if (data) {
        if (data.success && data.grant_token) {
          setStoredGrantToken(cleanTag, data.grant_token);
        }
        return data;
      }
      return { success: false, message: 'Phản hồi máy chủ không hợp lệ.' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // 2. Mô phỏng PIN trên dữ liệu demo công khai, không xác thực dữ liệu thật.
  const mem = OFFLINE_SEED_MEMORIES[cleanTag];
  if (!mem) return { success: false, message: 'Kỷ vật không tồn tại.' };
  const unavailable = getDemoAvailabilityError(mem);
  if (unavailable) return unavailable;

  if (!mem.is_protected) {
    return { success: true, message: 'Kỷ niệm công khai.' };
  }

  const inputHash = await sha256(enteredPin.trim());
  if (mem._pin_hash && mem._pin_hash === inputHash) {
    const fakeToken = globalThis.crypto.randomUUID();
    demoGrants.set(fakeToken, { tag: cleanTag, expiresAt: Date.now() + 7200000 });
    setStoredGrantToken(cleanTag, fakeToken);
    return {
      success: true,
      grant_token: fakeToken,
      message: 'Mở khóa thành công.',
    };
  }

  return { success: false, message: 'Mã PIN bảo mật không chính xác.' };
}

/**
 * Nhận quyền sở hữu chip NFC (Claim Ownership)
 * @param {string} tagUid 
 * @param {string} claimCode 
 */
export async function claimNfcOwnership(tagUid, claimCode) {
  if (!tagUid || !claimCode) {
    throw new Error('Vui lòng cung cấp mã chip và mã claim bảo mật.');
  }

  const cleanTag = String(tagUid).toLowerCase().trim();

  if (isSupabaseConfigured()) {
    const data = await apiRequest(`/memories/${encodeURIComponent(cleanTag)}/claims`,{method:'POST',body:{code:claimCode.trim()}});
    return data;
  }

  // Offline mock claim verification
  const validClaims = {
    'emoria-lumen': 'OWNER-LUMEN-2025',
    'emoria-pulse': 'OWNER-PULSE-2024',
    'emoria-horizon': 'OWNER-HORIZON-2025',
  };

  if (validClaims[cleanTag] === claimCode.trim()) {
    return { success: true, message: 'Đã nhận quyền sở hữu chip NFC thành công!' };
  }

  throw new Error('Mã claim bảo mật không chính xác.');
}

/**
 * Cập nhật nội dung kỷ niệm (Server xác minh Owner)
 * @param {string} tagUid 
 * @param {Object} payload { title, quote, letter, recipient, audio_title, audio_url, pin_action, pin_code }
 */
export async function updateMemorySpace(tagUid, payload) {
  const cleanTag = String(tagUid).toLowerCase().trim();

  if (isSupabaseConfigured()) {
    const data = await apiRequest(`/memories/${encodeURIComponent(cleanTag)}`,{method:'PATCH',body:payload});
    if(!data?.success)throw new Error(data?.message || 'Không lưu được kỷ vật.');
    return data;
  }

  // Offline update in memory
  const mem = OFFLINE_SEED_MEMORIES[cleanTag];
  if (!mem) throw new Error('Kỷ vật không tồn tại.');

  if (payload.title) mem.title = payload.title;
  if (payload.quote) mem.quote = payload.quote;
  if (payload.letter) {
    mem.letter = payload.letter;
    mem._private_letter = payload.letter;
  }
  if (payload.author) mem.author = payload.author;
  if (payload.recipient) mem.recipient = payload.recipient;
  if (payload.audio_title) mem.audio_title = payload.audio_title;
  if (payload.audio_url) mem.audio_url = payload.audio_url;

  if (payload.pin_action === 'SET' && payload.pin_code) {
    mem.is_protected = true;
    mem._pin_hash = await sha256(payload.pin_code.trim());
    mem.pin_hint = payload.pin_hint ? String(payload.pin_hint).trim() : null;
  } else if (payload.pin_action === 'REMOVE') {
    mem.is_protected = false;
    mem._pin_hash = null;
    mem.pin_hint = null;
  }
  if (payload.pin_action === 'SET' || payload.pin_action === 'REMOVE') {
    for (const [token, grant] of demoGrants) {
      if (grant.tag === cleanTag) demoGrants.delete(token);
    }
    setStoredGrantToken(cleanTag, null);
  }

  return { success: true, message: 'Cập nhật thành công!' };
}

/**
 * Gửi lời chúc vào sổ lưu bút
 * @param {string} tagUid 
 * @param {{ author: string, relationship: string, message: string }} messageData 
 */
export async function submitGuestbookEntry(tagUid, messageData) {
  if (!messageData.author?.trim() || !messageData.message?.trim()) {
    throw new Error('Vui lòng điền đầy đủ tên và lời nhắn.');
  }

  const cleanTag = String(tagUid).toLowerCase().trim();

  if (isSupabaseConfigured()) {
    return apiRequest(`/memories/${encodeURIComponent(cleanTag)}/guestbook`,{method:'POST',body:{grant:getStoredGrantToken(cleanTag)||null,name:messageData.author.trim(),message:messageData.message.trim(),relationship:messageData.relationship||''}});
  }

  // Offline fallback
  const mem = OFFLINE_SEED_MEMORIES[cleanTag];
  if (mem) {
    const newEntry = {
      id: `gb-${Date.now()}`,
      author: messageData.author.trim(),
      relationship: messageData.relationship || 'Người thương',
      message: messageData.message.trim(),
      created_at: 'Vừa xong',
    };
    mem.guestbook = [newEntry, ...(mem.guestbook || [])];
    return { success: true, data: newEntry };
  }

  throw new Error('Không tìm thấy kỷ vật.');
}

/**
 * Lấy danh sách tất cả các kỷ niệm mẫu (Public Showcase)
 */
export function getShowcaseMemoriesList() {
  return Object.values(OFFLINE_SEED_MEMORIES).map(m => ({
    tag_uid: m.tag_uid,
    jewelry_name: m.jewelry_name,
    title: m.title,
    date: m.date,
    quote: m.quote,
    is_protected: m.is_protected,
    availability: m.availability,
  }));
}

/**
 * Lấy danh sách toàn bộ kỷ vật phục vụ Admin Panel
 */
export function getAllShowcaseMemories() {
  return Object.values(OFFLINE_SEED_MEMORIES).map(m => ({
    tagUid: m.tag_uid,
    jewelryName: m.jewelry_name,
    title: m.title,
    ownerSecret: m.owner_secret || 'PROTECTED_BY_CLAIM_CODE',
    availability: m.availability || { status: 'available' },
  }));
}

/**
 * Cập nhật tính khả dụng của chip NFC (Dành cho Admin)
 * @param {string} tagUid 
 * @param {{ status: string, unlockDate?: string, message?: string }} availability 
 */
export async function updateMemoryAvailability(tagUid, availability) {
  const cleanTag = String(tagUid).toLowerCase().trim();

  if (isSupabaseConfigured()) {
    try {
      await apiRequest(`/admin/memories/${encodeURIComponent(cleanTag)}/availability`,{method:'PATCH',body:{status:availability.status,unlockDate:availability.unlockDate||null}});
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  const mem = OFFLINE_SEED_MEMORIES[cleanTag];
  if (mem) {
    mem.availability = {
      status: availability.status,
      unlock_date: availability.unlockDate || null,
      message: availability.message || null,
    };
  }

  return { success: true };
}
