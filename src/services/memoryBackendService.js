/**
 * EMORIA LUXURY - MEMORY SPACE BACKEND SERVICE
 * Quản lý kho lưu trữ dữ liệu kỷ niệm (Memory Vault), giải mã chip NFC,
 * bảo mật mã PIN, kiểm soát tính khả dụng (Timed Lock / Suspended),
 * sổ lưu bút và quyền chỉnh sửa của chủ sở hữu.
 */

const STORAGE_KEY = 'emoria_memories_v1';
const TAP_STATS_KEY = 'emoria_nfc_tap_stats_v1';

// Dữ liệu kỷ niệm mẫu ban đầu chuẩn Dark Luxury với cấu hình tính khả dụng & phân quyền
const SEED_MEMORIES = {
  'emoria-lumen': {
    tagUid: 'emoria-lumen',
    jewelryName: 'Dây Chuyền S925 Emoria Lumen',
    title: 'Dưới Ánh Hoàng Hôn Santorini',
    date: '14 Tháng 02, 2025',
    author: 'Minh Hoàng',
    recipient: 'Bảo Trâm',
    quote: 'Mỗi ánh sao đêm nay đều lưu giữ trọn vẹn lời hẹn ước của đôi ta dưới hoàng hôn rực rỡ.',
    letter: `Gửi người con gái anh yêu nhất,\n\nChiếc dây chuyền bạc S925 Lumen này không chỉ là một món trang sức. Nó chứa đựng toàn bộ khoảnh khắc hoàng hôn ngày hôm ấy tại Santorini — khi gió biển Địa Trung Hải thổi qua làn tóc em và anh biết mình đã tìm thấy bến đỗ bình yên nhất cuộc đời.\n\nBất cứ khi nào em cần một điểm tựa, hãy chạm chiếc điện thoại vào mặt dây chuyền. Giọng nói và bài ca này sẽ luôn bên cạnh em, nhắc nhở rằng tình yêu anh dành cho em là vĩnh cửu.`,
    audioTitle: 'Bản Dạ Khúc Hoàng Hôn (Acoustic)',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=melody-of-nature-110481.mp3',
    audioDuration: '2:15',
    mediaGallery: [
      {
        id: 'med-1',
        url: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Hoàng hôn tuyệt mỹ trên vịnh biển Santorini nơi lời hẹn ước được cất lên',
      },
      {
        id: 'med-2',
        url: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Chiếc nhẫn và sợi dây chuyền lấp lánh dưới ánh nến',
      },
      {
        id: 'med-3',
        url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Con đường đá trắng dẫn lối đến tình yêu vĩnh cửu',
      }
    ],
    isProtected: false,
    pinCode: null,
    ownerSecret: 'OWNER-LUMEN-2025',
    // Tính khả dụng: Đang mở bình thường
    availability: {
      status: 'available', // 'available' | 'timed_lock' | 'suspended'
      unlockDate: null,
      message: 'Kỷ niệm đang khả dụng để chiêm ngưỡng.',
    },
    guestbook: [
      {
        id: 'gb-1',
        author: 'Minh Hoàng',
        relationship: 'Người tặng',
        message: 'Mãi mãi bên nhau em nhé!',
        createdAt: '14/02/2025 18:30',
      },
      {
        id: 'gb-2',
        author: 'Bảo Trâm',
        relationship: 'Chủ sở hữu',
        message: 'Cảm ơn anh vì món quà ý nghĩa nhất cuộc đời em.',
        createdAt: '14/02/2025 21:15',
      }
    ]
  },
  'emoria-pulse': {
    tagUid: 'emoria-pulse',
    jewelryName: 'Vòng Tay S925 Emoria Pulse',
    title: 'Nhịp Đập Đầu Tiên',
    date: '20 Tháng 10, 2024',
    author: 'Khánh An',
    recipient: 'Hương Giang',
    quote: 'Dù ở bất kỳ phương trời nào, chiếc vòng sẽ luôn nhắc nhở về nhịp đập trái tim ta dành cho nhau.',
    letter: `Gửi Hương Giang,\n\nKỷ niệm 1000 ngày bên nhau. Cảm ơn em đã luôn là ánh sáng dịu êm và bình yên nhất trong cuộc đời anh. Chiếc vòng tay S925 Pulse được đúc khắc vi mô nhịp tim ngày đầu tiên ta gặp lại nhau.\n\nChạm nhẹ mỗi ngày để biết trái tim anh luôn cùng nhịp đập với em.`,
    audioTitle: 'VoiceMemo - Lời Thì Thầm 1000 Ngày',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/11/06/audio_29114f6b21.mp3?filename=lofi-study-112191.mp3',
    audioDuration: '1:45',
    mediaGallery: [
      {
        id: 'med-p1',
        url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Nụ cười rạng rỡ của em ngày đầu đông Hà Nội',
      },
      {
        id: 'med-p2',
        url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Từng bước chân ta cùng đi qua bao thăng trầm',
      }
    ],
    isProtected: true,
    pinCode: '1000', // Mã PIN bảo mật
    ownerSecret: 'OWNER-PULSE-2024',
    // Tính khả dụng: Đang mở nhưng yêu cầu mã PIN
    availability: {
      status: 'available',
      unlockDate: null,
      message: 'Kỷ niệm yêu cầu mã PIN bảo mật cá nhân.',
    },
    guestbook: [
      {
        id: 'gb-p1',
        author: 'Khánh An',
        relationship: 'Bạn trai',
        message: 'Hãy luôn giữ nụ cười trên môi em nhé!',
        createdAt: '20/10/2024 09:00',
      }
    ]
  },
  'emoria-horizon': {
    tagUid: 'emoria-horizon',
    jewelryName: 'Nhẫn Đôi S925 Emoria Horizon',
    title: 'Tọa Độ Chân Trời Vĩnh Cửu',
    date: '20 Tháng 10, 2026',
    author: 'Đức Huy',
    recipient: 'Thanh Nhã',
    quote: 'Chân trời không phải là điểm kết thúc, mà là nơi hai linh hồn hòa làm một.',
    letter: `Thanh Nhã thân yêu,\n\nNhẫn Horizon này mang theo lời hẹn ước của đôi ta tại tọa độ nơi chúng ta cùng ngắm chân trời rực rỡ nhất.\n\nThời khắc mở niêm phong đang đếm ngược đến ngày kỷ niệm chính thức của chúng mình!`,
    audioTitle: 'Giai Điệu Giao Thừa & Nguyện Ước',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=sweet-love-121471.mp3',
    audioDuration: '3:02',
    mediaGallery: [
      {
        id: 'med-h1',
        url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=85',
        type: 'image',
        caption: 'Pháo hoa rực rỡ và bàn tay đôi ta đan chặt',
      }
    ],
    isProtected: false,
    pinCode: null,
    ownerSecret: 'OWNER-HORIZON-2025',
    // Tính khả dụng: Niêm phong hẹn giờ (Chưa đến thời điểm mở)
    availability: {
      status: 'timed_lock',
      unlockDate: '2026-10-20T18:00:00.000Z',
      message: 'Kỷ niệm đang được niêm phong hẹn giờ đến ngày kỷ niệm 20/10/2026.',
    },
    guestbook: [
      {
        id: 'gb-h1',
        author: 'Đức Huy',
        relationship: 'Chồng yêu',
        message: 'Chờ đón ngày trọng đại của chúng ta em nhé!',
        createdAt: '01/01/2026 00:05',
      }
    ]
  }
};

/**
 * Lấy toàn bộ kho lưu trữ kỷ niệm
 * @returns {Record<string, Object>}
 */
function getMemoriesStore() {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.warn('[MemoryBackendService] Khong the doc localStorage:', err);
  }
  return { ...SEED_MEMORIES };
}

/**
 * Lưu kho kỷ niệm
 */
function persistMemories(store) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
  } catch (err) {
    console.error('[MemoryBackendService] Khong the ghi localStorage:', err);
  }
}

/**
 * Lấy danh sách tất cả các kỷ niệm mẫu cho Showcase Vault
 */
export function getAllShowcaseMemories() {
  const store = getMemoriesStore();
  return Object.values(store);
}

/**
 * Lấy chi tiết kỷ niệm theo Tag UID
 * @param {string} tagUid 
 */
export function getMemoryByTag(tagUid) {
  if (!tagUid) return null;
  const cleanTag = String(tagUid).toLowerCase().trim();
  const store = getMemoriesStore();
  return store[cleanTag] || null;
}

/**
 * Xác thực mã PIN bảo vệ của kỷ niệm
 * @param {string} tagUid 
 * @param {string} enteredPin 
 */
export function verifyAccessPin(tagUid, enteredPin) {
  const memory = getMemoryByTag(tagUid);
  if (!memory) {
    return { success: false, message: 'Kỷ niệm không tồn tại.' };
  }

  if (!memory.isProtected || !memory.pinCode) {
    return { success: true, message: 'Kỷ niệm công khai.' };
  }

  if (String(enteredPin).trim() === String(memory.pinCode).trim()) {
    return { success: true, message: 'Mở khóa thành công.' };
  }

  return { success: false, message: 'Mã PIN bảo mật không chính xác.' };
}

/**
 * Cập nhật nội dung kỷ niệm (Dành riêng cho Chủ sở hữu hoặc Admin)
 * @param {string} tagUid 
 * @param {Object} updatedFields 
 */
export function updateMemoryContent(tagUid, updatedFields) {
  const cleanTag = String(tagUid).toLowerCase().trim();
  const store = getMemoriesStore();
  const memory = store[cleanTag];

  if (!memory) {
    throw new Error(`Không tìm thấy kỷ vật mang mã chip ${tagUid}`);
  }

  const updatedMemory = {
    ...memory,
    title: updatedFields.title ?? memory.title,
    quote: updatedFields.quote ?? memory.quote,
    letter: updatedFields.letter ?? memory.letter,
    recipient: updatedFields.recipient ?? memory.recipient,
    author: updatedFields.author ?? memory.author,
    audioTitle: updatedFields.audioTitle ?? memory.audioTitle,
    audioUrl: updatedFields.audioUrl ?? memory.audioUrl,
    isProtected: updatedFields.isProtected ?? memory.isProtected,
    pinCode: updatedFields.isProtected ? (updatedFields.pinCode ?? memory.pinCode) : null,
    updatedAt: new Date().toISOString(),
  };

  store[cleanTag] = updatedMemory;
  persistMemories(store);

  return {
    success: true,
    message: 'Cập nhật nội dung kỷ vật thành công!',
    memory: updatedMemory,
  };
}

/**
 * Cài đặt tính khả dụng cho kỷ niệm (Available, Timed Lock, Suspended)
 * @param {string} tagUid 
 * @param {{ status: 'available'|'timed_lock'|'suspended', unlockDate?: string, message?: string }} availabilityConfig 
 */
export function updateMemoryAvailability(tagUid, availabilityConfig) {
  const cleanTag = String(tagUid).toLowerCase().trim();
  const store = getMemoriesStore();
  const memory = store[cleanTag];

  if (!memory) {
    throw new Error(`Không tìm thấy kỷ vật mang mã chip ${tagUid}`);
  }

  memory.availability = {
    status: availabilityConfig.status || 'available',
    unlockDate: availabilityConfig.unlockDate || null,
    message: availabilityConfig.message || 'Trạng thái kỷ niệm đã được cập nhật.',
  };

  store[cleanTag] = memory;
  persistMemories(store);

  return {
    success: true,
    message: 'Cập nhật trạng thái khả dụng của kỷ vật thành công!',
    availability: memory.availability,
  };
}

/**
 * Ghi lời chúc mới vào sổ lưu bút của kỷ niệm
 * @param {string} tagUid 
 * @param {Object} messageData - { author, relationship, message }
 */
export function addGuestbookMessage(tagUid, messageData) {
  if (!messageData.author || !messageData.author.trim()) {
    throw new Error('Vui lòng nhập tên người gửi.');
  }

  if (!messageData.message || !messageData.message.trim()) {
    throw new Error('Vui lòng nhập nội dung lời chúc hoặc tâm sự.');
  }

  const store = getMemoriesStore();
  const cleanTag = String(tagUid).toLowerCase().trim();
  const memory = store[cleanTag];

  if (!memory) {
    throw new Error(`Không tìm thấy kỷ niệm gắn với chip ${tagUid}`);
  }

  const newMessage = {
    id: `gb-${Date.now()}`,
    author: messageData.author.trim(),
    relationship: messageData.relationship || 'Người thương',
    message: messageData.message.trim(),
    createdAt: new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date()),
  };

  memory.guestbook = [newMessage, ...(memory.guestbook || [])];
  store[cleanTag] = memory;
  persistMemories(store);

  return {
    success: true,
    message: 'Đã lưu lời chúc thành công vào chip kỷ niệm!',
    data: newMessage,
  };
}

/**
 * Ghi nhận số lượt chạm NFC và thống kê
 * @param {string} tagUid 
 * @param {string} deviceType 
 */
export function logNfcTap(tagUid, deviceType = 'SmartPhone') {
  const cleanTag = String(tagUid).toLowerCase().trim();
  let stats = {};

  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(TAP_STATS_KEY);
      if (raw) stats = JSON.parse(raw);
    }
  } catch (e) {
    // ignore
  }

  const currentCount = (stats[cleanTag]?.tapCount || 0) + 1;
  stats[cleanTag] = {
    tapCount: currentCount,
    lastTappedAt: new Date().toISOString(),
    deviceType,
  };

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TAP_STATS_KEY, JSON.stringify(stats));
    }
  } catch (e) {
    // ignore
  }

  return {
    tagUid: cleanTag,
    totalTaps: currentCount,
    lastTappedAt: stats[cleanTag].lastTappedAt,
  };
}

/**
 * Lấy thống kê số lần chạm NFC của một kỷ vật
 * @param {string} tagUid 
 */
export function getTapStats(tagUid) {
  const cleanTag = String(tagUid).toLowerCase().trim();
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(TAP_STATS_KEY);
      if (raw) {
        const stats = JSON.parse(raw);
        return stats[cleanTag] || { tapCount: 1, lastTappedAt: new Date().toISOString() };
      }
    }
  } catch (e) {
    // ignore
  }
  return { tapCount: 1, lastTappedAt: new Date().toISOString() };
}
