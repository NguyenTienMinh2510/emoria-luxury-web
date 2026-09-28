import { createClient } from '@supabase/supabase-js';

/**
 * Tạo Signed URLs có thời hạn cho danh sách ảnh thuộc bucket private 'emoria-event-media'
 * @param {string[]} paths Mảng các đường dẫn ảnh (ví dụ: ['emo-tag/photo1.jpg'])
 * @param {number} expiresIn Thời hạn tính bằng giây (mặc định 3600s = 1 giờ)
 * @returns {Promise<Record<string, string>>} Object ánh xạ { [path]: signedUrl }
 */
export async function signEventPaths(paths, expiresIn = 3600) {
  if (!Array.isArray(paths) || paths.length === 0) return {};
  const validPaths = paths.filter(p => typeof p === 'string' && p.trim().length > 0);
  if (validPaths.length === 0) return {};

  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !serviceKey) {
    throw Object.assign(
      new Error('Dịch vụ lưu trữ chưa được cấu hình (thiếu SUPABASE_SERVICE_ROLE_KEY).'),
      { status: 500, code: 'STORAGE_CONFIG_MISSING' }
    );
  }

  const admin = createClient(base, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) })
    }
  });

  const result = {};
  await Promise.all(
    validPaths.map(async (path) => {
      const cleanPath = path.trim();
      try {
        const { data, error } = await admin.storage
          .from('emoria-event-media')
          .createSignedUrl(cleanPath, expiresIn);
        if (!error && (data?.signedUrl || data?.signedURL)) {
          result[cleanPath] = data.signedUrl || data.signedURL;
        }
      } catch {
        // Lỗi storage: không tạo fallback token giả, để trống URL cho path này
      }
    })
  );

  return result;
}

/**
 * Gắn signed URL cho các câu hỏi của Couple Match và xóa raw private photo_path
 */
export function enrichMatchQuestionsWithSignedUrls(questions, signedMap = {}) {
  if (!Array.isArray(questions)) return questions;
  return questions.map(q => {
    const copy = { ...q };
    if (copy.image_path) {
      // Chỉ gán image_url nếu có signed URL thật từ storage service
      copy.image_url = signedMap[copy.image_path] || null;
      // Xóa raw storage path để không lộ internal key ra frontend
      delete copy.image_path;
    } else {
      copy.image_url = null;
    }
    return copy;
  });
}

/**
 * Gắn signed URL cho các kỷ niệm trong 5 phòng của Memory House và xóa raw private photo_path
 */
export function enrichHouseRoomsWithSignedUrls(rooms, signedMap = {}) {
  if (!Array.isArray(rooms)) return rooms;
  return rooms.map(r => ({
    ...r,
    memories: (r.memories || []).map(m => {
      const copy = { ...m };
      if (copy.photo_path) {
        // Chỉ gán photo_url nếu có signed URL thật từ storage service
        copy.photo_url = signedMap[copy.photo_path] || null;
        // Xóa raw storage path để bảo vệ namespace
        delete copy.photo_path;
      } else {
        copy.photo_url = null;
      }
      return copy;
    })
  }));
}

