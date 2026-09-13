import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

// Default mock memories for showcase & local demo experience
const DEFAULT_MEMORIES = {
  'emoria-lumen': {
    tagUid: 'emoria-lumen',
    title: 'Dưới Ánh Hoàng Hôn Santorini',
    date: '14.02.2025',
    author: 'Minh Hoàng',
    quote: 'Mỗi ánh sao đêm nay đều lưu giữ trọn vẹn lời hẹn ước của đôi ta dưới hoàng hôn rực rỡ.',
    message: 'Gửi người anh yêu nhất. Chiếc vòng S925 Lumen này chứa đựng khoảnh khắc chúng ta cùng nhìn về một tương lai, nơi tình yêu mãi tỏa sáng như viên ngọc quý.',
    audioName: 'Loi_Chuc_Santorini.mp3',
    audioDuration: '0:45',
    mediaUrls: [
      {
        url: '/assets/product_lumen.png',
        type: 'image',
        caption: 'Mặt dây chuyền S925 Lumen khắc vi mô',
      },
      {
        url: '/assets/summer_box.png',
        type: 'image',
        caption: 'Hộp kỷ niệm sơn mài cao cấp EMORIA',
      },
    ],
    ownerEmail: 'owner@emoria.vn',
    isRegistered: true,
  },
  'emoria-pulse': {
    tagUid: 'emoria-pulse',
    title: 'Nhịp Đập Đầu Tiên',
    date: '20.10.2024',
    author: 'Khánh An',
    quote: 'Dù ở bất kỳ phương trời nào, chiếc vòng sẽ luôn nhắc nhở về nhịp đập trái tim ta dành cho nhau.',
    message: 'Kỷ niệm 1000 ngày bên nhau. Cảm ơn em đã luôn là ánh sáng dịu êm và bình yên nhất trong cuộc đời anh.',
    audioName: 'VoiceMemo_Pulse.mp3',
    audioDuration: '1:12',
    mediaUrls: [
      {
        url: '/assets/product_pulse.png',
        type: 'image',
        caption: 'Vòng tay S925 Pulse tích hợp Chip NFC',
      },
    ],
    ownerEmail: 'owner@emoria.vn',
    isRegistered: true,
  },
  'emoria-halo': {
    tagUid: 'emoria-halo',
    title: 'Vòng Hào Quang Tình Bạn',
    date: '08.03.2025',
    author: 'Nhóm Bạn Thân',
    quote: 'Thời gian trôi qua, thanh xuân vẫn ở lại trong từng khoảnh khắc chúng ta cùng cười.',
    message: 'Món quà gửi đến cô gái tuyệt vời nhất nhóm. Chúc bạn luôn rạng rỡ và tỏa sáng như vầng hào quang.',
    mediaUrls: [
      {
        url: '/assets/product_halo.png',
        type: 'image',
        caption: 'Vòng tay bạc S925 Halo men lam ngọc',
      },
    ],
    ownerEmail: 'owner@emoria.vn',
    isRegistered: true,
  },
};

// In-memory local storage cache for edits during the session
const localMemoryStore = new Map();

/**
 * Fetch memory data by tag UID and security token
 * @param {string} tagUid 
 * @param {string} token 
 */
export async function getMemoryByTag(tagUid, token = null) {
  if (!tagUid) {
    throw new Error('Thiếu mã định danh chip NFC (tagUid).');
  }

  const cleanTag = String(tagUid).toLowerCase().trim();

  // 1. Check local in-memory store first
  if (localMemoryStore.has(cleanTag)) {
    return {
      success: true,
      data: localMemoryStore.get(cleanTag),
      source: 'local_cache',
    };
  }

  // 2. Query Supabase database if configured
  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('nfc_tags')
        .select('*')
        .eq('tag_uid', cleanTag)
        .maybeSingle();

      const { data, error } = await query;

      if (!error && data) {
        // Validate token if tag has private token
        if (data.access_token && token && data.access_token !== token) {
          throw new Error('Mã xác thực chip NFC không hợp lệ hoặc đã hết hạn.');
        }

        const normalizedData = {
          tagUid: data.tag_uid,
          title: data.title || 'Kỷ Niệm EMORIA',
          date: data.created_at ? new Date(data.created_at).toLocaleDateString('vi-VN') : 'Mới cập nhật',
          author: data.author_name || 'Người thương',
          quote: data.quote || '',
          message: data.message || '',
          audioName: data.audio_name || null,
          mediaUrls: Array.isArray(data.media_urls)
            ? data.media_urls
            : typeof data.media_urls === 'string'
            ? JSON.parse(data.media_urls)
            : [],
          ownerEmail: data.owner_email || null,
          isRegistered: true,
        };

        localMemoryStore.set(cleanTag, normalizedData);
        return { success: true, data: normalizedData, source: 'supabase' };
      }
    } catch (err) {
      console.warn('[NFC Service] Supabase query notice:', err.message);
    }
  }

  // 3. Fallback to default demo memories or generate on-the-fly memory
  const defaultMemory = DEFAULT_MEMORIES[cleanTag] || {
    tagUid: cleanTag,
    title: 'Kỷ Niệm Vĩnh Cửu EMORIA',
    date: new Date().toLocaleDateString('vi-VN'),
    author: 'Chủ sở hữu EMORIA',
    quote: 'Mỗi món trang sức là một câu chuyện tình yêu được khắc ghi vĩnh cửu.',
    message: 'Chào mừng bạn đến với Memory Space của chip NFC S925. Nơi đây lưu giữ những hình ảnh, thông điệp và cảm xúc vô giá.',
    mediaUrls: [
      {
        url: '/assets/product_lumen.png',
        type: 'image',
        caption: 'Trang sức bạc S925 NFC Nguyên Bản',
      },
    ],
    ownerEmail: 'user@emoria.vn',
    isRegistered: false,
  };

  localMemoryStore.set(cleanTag, defaultMemory);
  return { success: true, data: defaultMemory, source: 'default_demo' };
}

/**
 * Update memory contents for a tag
 * @param {string} tagUid 
 * @param {object} payload { title, message, quote, mediaUrls, author, newMediaUrls }
 */
export async function updateMemory(tagUid, payload) {
  if (!tagUid) {
    throw new Error('Thiếu mã định danh chip NFC.');
  }

  const cleanTag = String(tagUid).toLowerCase().trim();
  const current = (await getMemoryByTag(cleanTag)).data;

  const updatedMedia = [
    ...(payload.mediaUrls || current.mediaUrls || []),
    ...(payload.newMediaUrls || []),
  ];

  const updatedData = {
    ...current,
    title: payload.title !== undefined ? payload.title : current.title,
    message: payload.message !== undefined ? payload.message : current.message,
    quote: payload.quote !== undefined ? payload.quote : current.quote,
    author: payload.author !== undefined ? payload.author : current.author,
    mediaUrls: updatedMedia,
    updatedAt: new Date().toISOString(),
  };

  // Update in-memory store
  localMemoryStore.set(cleanTag, updatedData);

  // Sync to Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('nfc_tags')
        .upsert(
          {
            tag_uid: cleanTag,
            title: updatedData.title,
            message: updatedData.message,
            quote: updatedData.quote,
            author_name: updatedData.author,
            media_urls: updatedData.mediaUrls,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tag_uid' }
        );

      if (error) {
        console.warn('[NFC Update DB Note]', error.message);
      }
    } catch (err) {
      console.warn('[NFC Update DB Error]', err);
    }
  }

  return { success: true, data: updatedData };
}
