import { createClient } from '@supabase/supabase-js';
import {approvedHousePhotoPaths} from './housePreview.js';

export async function signPublishedHousePaths(paths,view,identity) {
  const approved=await approvedHousePhotoPaths(paths,view,identity);
  return signEventPaths(approved,120);
}

/**
 * Tạo Signed URLs có thời hạn cho danh sách ảnh thuộc bucket private 'emoria-event-media'
 * @param {string[]} paths Mảng các đường dẫn ảnh (ví dụ: ['emo-tag/photo1.jpg'])
 * @param {number} expiresIn Thời hạn tính bằng giây (mặc định 3600s = 1 giờ)
 * @returns {Promise<Record<string, string>>} Object ánh xạ { [path]: signedUrl }
 */
export async function signEventPaths(paths, expiresIn = 3600) {
  if (!Array.isArray(paths) || paths.length === 0) return {};
  const validPaths = [...new Set(paths.filter(p => typeof p === 'string' && p.trim().length > 0).map(p => p.trim()))];
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
  try {
    const { data, error } = await admin.storage.from('emoria-event-media').createSignedUrls(validPaths, expiresIn);
    if (!error) {
      for (const row of data || []) {
        if (!row.error && validPaths.includes(row.path) && (row.signedUrl || row.signedURL)) {
          result[row.path] = row.signedUrl || row.signedURL;
        }
      }
    }
  } catch {
    // Storage failure must never create a fake token or expose an unsigned path.
  }

  return result;
}

/**
 * Gắn signed URL cho các câu hỏi của Couple Match. Giữ image_path cho chủ sở hữu
 * để lưu bản nháp; xóa raw storage path cho khách/partner.
 */
export function enrichMatchQuestionsWithSignedUrls(questions, signedMap = {}, { ownerDraft = false } = {}) {
  if (!Array.isArray(questions)) return questions;
  return questions.map(q => {
    const copy = { ...q };
    if (copy.image_path) {
      // Chỉ gán image_url nếu có signed URL thật từ storage service
      copy.image_url = signedMap[copy.image_path] || null;
      // Chỉ bản nháp của chủ sở hữu mới cần giữ image_path để sửa/autosave
      if (!ownerDraft) delete copy.image_path;
    } else {
      copy.image_url = null;
    }
    return copy;
  });
}

/**
 * Gắn signed URL cho Memory House. Giữ photo_path cho chủ nhà để lưu lại bản nháp;
 * loại bỏ đường dẫn này khỏi snapshot trả về khách.
 */
export function enrichHouseRoomsWithSignedUrls(rooms, signedMap = {}, {ownerDraft=false} = {}) {
  if (!Array.isArray(rooms)) return rooms;
  return rooms.map(r => {
    const roomCopy = { ...r };
    if (!ownerDraft) delete roomCopy.share_preview_path;
    if (!ownerDraft && roomCopy.journey_letter) {
      if (roomCopy.journey_letter.is_shared !== true) {
        delete roomCopy.journey_letter;
      }
    }
    roomCopy.memories = (r.memories || []).map(m => {
      const copy = { ...m };
      if (copy.photo_path) {
        // Chỉ gán photo_url nếu có signed URL thật từ storage service
        copy.photo_url = signedMap[copy.photo_path] || null;
        // Chỉ bản nháp đã xác thực quyền chủ sở hữu cần giữ định danh ảnh.
        if (!ownerDraft) delete copy.photo_path;
      } else {
        copy.photo_url = null;
      }
      return copy;
    });
    return roomCopy;
  });
}
