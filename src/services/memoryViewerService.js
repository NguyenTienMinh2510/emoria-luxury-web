// Compatibility mapping for the existing modal; all access uses the unified service.
import { fetchMemoryView, updateMemorySpace } from './memoryService.js';

export async function getMemoryByTag(tagUid, token = null) {
  const result = await fetchMemoryView(tagUid, token);
  if (!result.success) throw new Error(result.message);
  const m = result.data;
  return { ...result, data: {
    tagUid: m.tag_uid, title: m.title, date: m.date, author: m.author,
    quote: m.quote, message: m.letter, audioName: m.audio_title,
    mediaUrls: m.media_gallery || [], isRegistered: true, isOwner: m.is_owner === true,
  } };
}

export async function updateMemory(tagUid, payload) {
  // The legacy modal cannot persist galleries through the text-only RPC.
  if ('mediaUrls' in payload) {
    const current = await getMemoryByTag(tagUid);
    if (JSON.stringify(payload.mediaUrls) !== JSON.stringify(current.data.mediaUrls)) {
      throw new Error('Lưu album từ cửa sổ cũ chưa được hỗ trợ. Vui lòng dùng Memory Space.');
    }
  }
  const result = await updateMemorySpace(tagUid, {
    title: payload.title, quote: payload.quote, letter: payload.message, pin_action: 'KEEP',
  });
  if (!result?.success) throw new Error(result?.message || 'Không thể lưu kỷ niệm.');
  return getMemoryByTag(tagUid);
}
