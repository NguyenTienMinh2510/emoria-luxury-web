import { createClient } from '@supabase/supabase-js';
import { labelWithQwen } from './aiService.js';
import {housePreviewPath,readHousePhoto} from './housePreview.js';

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

async function photoVersion(path, tagUid, client, isPreview=false) {
  const namespace = await client.rpc('rpc_house_photo_review_namespace', {p_tag:tagUid,p_path:path});
  if (namespace.error || typeof namespace.data !== 'boolean') throw fail(503,'Chưa xác minh được kho ảnh ngôi nhà. Hãy thử lại.');
  if (!namespace.data) throw fail(422,'Ảnh đang dùng chung đường dẫn với kho Memory Space. Hãy tải một bản ảnh mới vào ngôi nhà rồi xuất bản lại.');
  const photo = await readHousePhoto(path,tagUid,client,isPreview ? 2*1024*1024 : 8*1024*1024);
  if (!photo?.version || typeof photo.version !== 'string' || photo.version.length > 180) {
    throw fail(503,'Chưa xác minh được phiên bản ảnh ngôi nhà. Hãy thử xuất bản lại.');
  }
  return photo.version;
}

/**
 * Kiểm duyệt an toàn toàn bộ hình ảnh trong bản nháp Memory House trước khi xuất bản.
 * Đảm bảo các nội dung chia sẻ công khai lên mạng xã hội / postcard không dính nội dung độc hại.
 * @param {Object} c - Request context
 * @param {string} tagUid - Tag UID of memory space
 */
export async function moderateHousePhotos(c, tagUid, suppliedDraft = null) {
  if (!tagUid) return;
  const previewPath = housePreviewPath(suppliedDraft?.rooms);
  const suppliedPhotos=[...new Set([previewPath,...(suppliedDraft?.rooms || []).flatMap(room => (room.memories || []).map(memory => memory.photo_path))].filter(Boolean))];
  if (
    process.env.SKIP_AI_MODERATION === 'true' ||
    process.env.NODE_ENV === 'test' ||
    (process.env.SUPABASE_URL && process.env.SUPABASE_URL.includes('127.0.0.1'))
  ) {
    if (suppliedPhotos.length) {
      const client = serverClient();
      if (!client) throw fail(503,'Chưa cấu hình lưu trữ để duyệt ảnh ngôi nhà.');
      for (const path of suppliedPhotos) {
        const version = await photoVersion(path,tagUid,client,path===previewPath);
        const {error} = await client.from('house_photo_reviews').upsert({tag:tagUid,path,content_version:version,requested_by:c.user.id,request_id:crypto.randomUUID(),status:'ready',violations:[],model:'local-preview',policy_version:1,reviewed_at:new Date().toISOString()},{onConflict:'path'});
        if (error) throw fail(503,'Chưa lưu được trạng thái ảnh ngôi nhà. Hãy thử lại.');
      }
    }
    return;
  }

  // Lấy dữ liệu các phòng trong bản nháp hiện tại
  let draft = suppliedDraft;
  try {
    if (!draft) draft = await c.db(c.client.rpc('rpc_house_get_draft', { p_tag_uid: tagUid }));
  } catch (err) {
    // Nếu chưa có draft hoặc lỗi quyền, để rpc_house_publish xử lý
    return;
  }

  if (!draft || !Array.isArray(draft.rooms)) return;

  const photoPaths = [];
  if (previewPath) photoPaths.push(previewPath);
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
    throw fail(503,'Chưa cấu hình kiểm duyệt ảnh ngôi nhà để xuất bản.');
  }

  // Khử trùng lặp ảnh giữa các phòng
  const uniquePaths = [...new Set(photoPaths)];

  for (const path of uniquePaths) {
    const isPreview = path === previewPath;
    const version = await photoVersion(path,tagUid,client,isPreview);
    // 1. Kiểm tra bộ nhớ cache nhãn/kiểm duyệt đã có sẵn
    try {
      const { data: existing } = await client
        .from('house_photo_reviews')
        .select('status, violations, reason, content_version')
        .eq('path', path)
        .maybeSingle();

      if (existing && existing.content_version === version) {
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

    // 2. Đọc đúng tệp đã kiểm tra trong bucket ảnh của ngôi nhà.
    let fileBlob = null;
    try {
      let dl = await client.storage.from('emoria-event-media').download(path);
      if (!dl.error && dl.data) {
        fileBlob = dl.data;
      }
    } catch {
      fileBlob = null;
    }

    if (!fileBlob) {
      throw fail(422,'Không đọc được ảnh ngôi nhà. Hãy tải ảnh mới và xuất bản lại.');
    }

    // This service-only category allows an explicit 40/hour budget. The separate
    // owner key keeps public-view and publish request limits independent.
    let limit;
    try {
      limit = await client.rpc('rpc_check_rate_limit', {
        p_key:`house_public_share:house_photo_review:${c.user.id}`,
        p_max_burst:40,
        p_window_seconds:3600
      });
    } catch {
      throw fail(503,'Chưa kiểm tra được giới hạn duyệt ảnh. Hãy thử lại.');
    }
    if (limit.error || typeof limit.data?.allowed !== 'boolean') {
      throw fail(503,'Chưa kiểm tra được giới hạn duyệt ảnh. Hãy thử lại.');
    }
    if (!limit.data.allowed) {
      throw Object.assign(fail(429,'Bạn đã dùng hết 40 lượt duyệt ảnh ngôi nhà trong một giờ. Hãy thử lại sau.'), {
        code:'RATE_LIMIT_EXCEEDED',
        retryAfter:limit.data.retry_after
      });
    }

    // 3. Phân tích kiểm duyệt bằng Qwen3-VL
    try {
      const result = await labelWithQwen(fileBlob, { type: 'image' });
      if (await photoVersion(path,tagUid,client,isPreview) !== version) {
        throw fail(422,'Ảnh ngôi nhà đã thay đổi trong khi kiểm duyệt. Hãy tạo ảnh mới và xuất bản lại.');
      }
      if (!result.approved || (result.violations && result.violations.length > 0)) {
        // Lưu lịch sử vi phạm
        try {
          await client.from('house_photo_reviews').upsert({
            tag: tagUid,
            path,
            content_version:version,requested_by:c.user.id,request_id:crypto.randomUUID(),
            status: 'rejected',
            violations: result.violations,
            reason: result.reason || 'Hình ảnh vi phạm tiêu chuẩn an toàn cộng đồng.',
            model: result.model,
            policy_version: 1,
            reviewed_at:new Date().toISOString()
          }, { onConflict: 'path' });
        } catch {}

        throw fail(
          422,
          `Ảnh trong ngôi nhà (${path}) vi phạm tiêu chuẩn an toàn: ${result.reason || result.violations.join(', ')}. Vui lòng thay đổi ảnh trước khi xuất bản lên mạng xã hội.`
        );
      }

      // Lưu trạng thái đã duyệt an toàn
      try {
        const saved = await client.from('house_photo_reviews').upsert({
          tag: tagUid,
          path,
          content_version:version,requested_by:c.user.id,request_id:crypto.randomUUID(),
          status: 'ready',
          labels: result.labels,
          violations: [],
          model: result.model,
          policy_version: 1,
          reviewed_at:new Date().toISOString()
        }, { onConflict: 'path' });
        if (saved.error) throw fail(503,'Chưa lưu được trạng thái kiểm duyệt ảnh ngôi nhà.');
      } catch (err) { throw err; }

    } catch (err) {
      if (err.status === 422) throw err;
      throw fail(503,'Chưa kiểm duyệt được ảnh ngôi nhà. Hãy thử xuất bản lại.');
    }
  }
}
