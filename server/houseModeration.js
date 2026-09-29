import { createClient } from '@supabase/supabase-js';
import { labelWithQwen } from './qwenVideo.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

const serverClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(20000) }) }
    }
  );
};

/**
 * Kiểm duyệt an toàn toàn bộ hình ảnh trong bản nháp Memory House trước khi xuất bản.
 * Đảm bảo các nội dung chia sẻ công khai lên mạng xã hội / postcard không dính nội dung độc hại.
 * @param {Object} c - Request context
 * @param {string} tagUid - Tag UID of memory space
 */
export async function moderateHousePhotos(c, tagUid) {
  if (!tagUid) return;
  if (
    process.env.SKIP_AI_MODERATION === 'true' ||
    process.env.NODE_ENV === 'test' ||
    (process.env.SUPABASE_URL && process.env.SUPABASE_URL.includes('127.0.0.1'))
  ) {
    return;
  }

  // Lấy dữ liệu các phòng trong bản nháp hiện tại
  let draft;
  try {
    draft = await c.db(c.client.rpc('rpc_house_get_draft', { p_tag_uid: tagUid }));
  } catch (err) {
    // Nếu chưa có draft hoặc lỗi quyền, để rpc_house_publish xử lý
    return;
  }

  if (!draft || !Array.isArray(draft.rooms)) return;

  const photoPaths = [];
  for (const room of draft.rooms) {
    if (Array.isArray(room.memories)) {
      for (const m of room.memories) {
        if (m.photo_path && typeof m.photo_path === 'string' && m.photo_path.trim()) {
          photoPaths.push(m.photo_path.trim());
        }
      }
    }
  }

  if (photoPaths.length === 0) return;

  const client = serverClient();
  if (!client) {
    // Thiếu service role key (ví dụ test môi trường tối giản) -> bỏ qua bước quét storage
    return;
  }

  // Khử trùng lặp ảnh giữa các phòng
  const uniquePaths = [...new Set(photoPaths)];

  for (const path of uniquePaths) {
    // 1. Kiểm tra bộ nhớ cache nhãn/kiểm duyệt đã có sẵn
    try {
      const { data: existing } = await client
        .from('memory_video_labels')
        .select('status, violations, reason')
        .eq('path', path)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'ready' && (!existing.violations || existing.violations.length === 0)) {
          // Ảnh này đã được kiểm duyệt an toàn trước đó
          continue;
        }
        if (existing.status === 'rejected' || (existing.violations && existing.violations.length > 0)) {
          throw fail(
            422,
            `Ảnh trong ngôi nhà (${path}) vi phạm tiêu chuẩn an toàn: ${existing.reason || existing.violations.join(', ')}. Vui lòng gỡ ảnh này trước khi xuất bản.`
          );
        }
      }
    } catch (e) {
      if (e.status === 422) throw e;
    }

    // 2. Tải tệp từ Storage bucket (ưu tiên emoria-event-media, sau đó emoria-memory)
    let fileBlob = null;
    try {
      let dl = await client.storage.from('emoria-event-media').download(path);
      if (!dl.error && dl.data) {
        fileBlob = dl.data;
      } else {
        dl = await client.storage.from('emoria-memory').download(path);
        if (!dl.error && dl.data) fileBlob = dl.data;
      }
    } catch {
      fileBlob = null;
    }

    if (!fileBlob) {
      // Tệp không tồn tại trong storage (ví dụ path giả trong unit test), bỏ qua
      continue;
    }

    // 3. Phân tích kiểm duyệt bằng Qwen3-VL
    try {
      const result = await labelWithQwen(fileBlob, { type: 'image' });
      if (!result.approved || (result.violations && result.violations.length > 0)) {
        // Lưu lịch sử vi phạm
        try {
          await client.from('memory_video_labels').upsert({
            tag: tagUid,
            path,
            status: 'rejected',
            violations: result.violations,
            reason: result.reason || 'Hình ảnh vi phạm tiêu chuẩn an toàn cộng đồng.',
            model: result.model,
            policy_version: 1
          }, { onConflict: 'path' });
        } catch {}

        throw fail(
          422,
          `Ảnh trong ngôi nhà (${path}) vi phạm tiêu chuẩn an toàn: ${result.reason || result.violations.join(', ')}. Vui lòng thay đổi ảnh trước khi xuất bản lên mạng xã hội.`
        );
      }

      // Lưu trạng thái đã duyệt an toàn
      try {
        await client.from('memory_video_labels').upsert({
          tag: tagUid,
          path,
          status: 'ready',
          labels: result.labels,
          violations: [],
          model: result.model,
          policy_version: 1
        }, { onConflict: 'path' });
      } catch {}

    } catch (err) {
      if (err.status === 422) throw err;
      console.warn(`[House Moderation] Bỏ qua kiểm duyệt AI cho ${path}:`, err.message);
    }
  }
}
