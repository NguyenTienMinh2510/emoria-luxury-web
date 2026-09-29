import { VIOLATION_LABELS, moderationResult } from '../src/services/videoLabels.js';

const MODAL_ENDPOINT = process.env.MODAL_TAGGER_URL || 'https://nguyentienminh2510--emoria-qwen-tagger-qwentagger-tag-video.modal.run';
const failure = (message, status = 502) => Object.assign(new Error(message), { status });

/**
 * Call Modal Qwen3-VL cloud endpoint to analyze video/image and moderate content.
 * @param {Blob|Buffer|Uint8Array|string} media - Media data (Blob, Buffer, or base64)
 * @param {Object} options
 * @param {Function} [options.fetchImpl] - Fetch function implementation
 * @param {string} [options.type] - 'video' or 'image'
 * @returns {Promise<{ approved: boolean, labels: string[], violations: string[], reason: string|null, model: string }>}
 */
export async function labelWithQwen(media, { fetchImpl = fetch, type } = {}) {
  let base64;
  let mediaType = type;

  if (typeof media?.arrayBuffer === 'function') {
    const ab = await media.arrayBuffer();
    base64 = Buffer.from(ab).toString('base64');
    if (!mediaType) mediaType = media.type?.startsWith('video/') ? 'video' : 'image';
  } else if (Buffer.isBuffer(media) || media instanceof Uint8Array) {
    base64 = Buffer.from(media).toString('base64');
    if (!mediaType) mediaType = 'image';
  } else if (typeof media === 'string') {
    base64 = media;
    if (!mediaType) mediaType = 'image';
  } else {
    throw failure('Dữ liệu phương tiện không hợp lệ để phân tích.', 422);
  }

  const endpoint = MODAL_ENDPOINT.replace(/\/+$/, '');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_base64: base64,
      type: mediaType || 'image'
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    throw failure(`Hệ thống AI kiểm duyệt không phản hồi (${response.status}). Vui lòng thử lại sau.`, response.status === 429 ? 429 : 502);
  }

  const result = await response.json();
  if (result.success === false && result.error && (!result.violations || result.violations.length === 0)) {
    throw failure(`Lỗi kiểm duyệt AI: ${result.error}`, 502);
  }

  const mod = moderationResult({
    labels: Array.isArray(result.labels) ? result.labels : [],
    violations: Array.isArray(result.violations) ? result.violations : []
  });

  return {
    ...mod,
    model: result.model || 'Qwen/Qwen3-VL-4B-Instruct'
  };
}
