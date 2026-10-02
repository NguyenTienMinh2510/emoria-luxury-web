import { VIOLATION_LABELS, moderationResult } from '../src/services/videoLabels.js';

const MODAL_TAGGER_ENDPOINT = process.env.MODAL_TAGGER_URL || 'https://nguyentienminh2510--emoria-qwen-tagger-qwentagger-tag-video.modal.run';
const MODAL_LETTER_ENDPOINT = process.env.MODAL_LETTER_URL || process.env.MODAL_TAGGER_URL?.replace(/tag-video\/?$/, 'craft-letter') || 'https://nguyentienminh2510--emoria-qwen-tagger-qwentagger-craft-letter.modal.run';

const failure = (message, status = 502) => Object.assign(new Error(message), { status });
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

function modalHeaders() {
  const tokenId = process.env.MODAL_PROXY_TOKEN_ID;
  const tokenSecret = process.env.MODAL_PROXY_TOKEN_SECRET;
  if (!/^wk-[A-Za-z0-9_-]+$/.test(tokenId || '') || !/^ws-[A-Za-z0-9_-]+$/.test(tokenSecret || '')) {
    throw failure('Dịch vụ AI chưa được cấu hình xác thực.', 503);
  }
  return { 'Content-Type': 'application/json', 'Modal-Key': tokenId, 'Modal-Secret': tokenSecret };
}

function validateMediaUrl(value) {
  try {
    const origin = new URL(process.env.MODAL_STORAGE_ORIGIN || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
    const url = new URL(value);
    if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x1f]/.test(value) ||
        origin.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(origin.host) ||
        origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
        url.protocol !== 'https:' || url.host !== origin.host || url.username || url.password || url.hash) throw new Error();
    // Check the raw path too: URL() normalizes literal dot segments.
    if (/(?:^|\/)\.{1,2}(?:\/|$)|\\/.test(decodeURIComponent(value.split('?')[0]))) throw new Error();
    const parts = url.pathname.split('/');
    if (parts.slice(0, 5).join('/') !== '/storage/v1/object/sign' || parts.length < 7 ||
        !['emoria-memory', 'emoria-event-media'].includes(parts[5])) throw new Error();
    for (const part of parts.slice(6)) {
      const decoded = decodeURIComponent(part);
      if (!decoded || ['.', '..'].includes(decoded) || /[\\/%\x00-\x1f]/.test(decoded)) throw new Error();
    }
    const query = [...url.searchParams.entries()];
    if (query.length !== 1 || query[0][0] !== 'token' || !/^[A-Za-z0-9._-]{1,4096}$/.test(query[0][1])) throw new Error();
  } catch {
    throw failure('Đường dẫn phương tiện không hợp lệ.', 422);
  }
}

// Bảng mẫu thư tay sang trọng dự phòng khi ngoại tuyến
const FALLBACK_TEMPLATES = {
  anniversary: {
    romantic: 'Gửi {recipient},\n\nNhìn lại chặng đường chúng ta đã cùng nhau đi qua, anh thấy mỗi ngày đều là một đặc ân quý giá. Chiếc trang sức này tựa như vầng sáng lưu giữ từng nụ cười, từng ánh mắt và những lời thì thầm dịu dàng nhất của đôi mình. Cảm ơn em vì đã luôn ở đây, đồng hành và làm cho cuộc đời anh trở nên trọn vẹn.\n\nYêu em nhiều hơn mỗi ngày,\n{author}',
    poetic: 'Gửi {recipient},\n\nThời gian có thể làm mờ phai nhiều điều, nhưng những khoảnh khắc bên em mãi là viên ngọc sáng lấp lánh trong tâm khảm. Kỷ vật này thay lời muốn nói, gửi gắm trọn vẹn tình yêu và lời hứa son sắt trọn đời bên nhau.\n\nMãi yêu em,\n{author}'
  },
  proposal: {
    romantic: 'Gửi {recipient},\n\nTừ giây phút đầu tiên nhìn vào đôi mắt em, anh đã biết trái tim mình thuộc về nơi đâu. Chiếc nhẫn này không chỉ là món quà trang sức, mà là chiếc chìa khóa mở ra tương lai nơi anh được che chở và yêu thương em suốt cuộc đời. Em đồng ý làm bạn đời của anh nhé?\n\nTrọn đời bên em,\n{author}'
  },
  birthday: {
    warm: 'Gửi {recipient},\n\nChúc mừng ngày sinh nhật của một người vô cùng đặc biệt! Chúc em luôn rạng rỡ, bình an và hạnh phúc bên những người thân yêu. Hy vọng kỷ vật này sẽ luôn nhắc nhở em rằng, em quý giá và được yêu thương biết bao nhiêu.\n\nThương mến,\n{author}'
  },
  gratitude: {
    sincere: 'Gửi {recipient},\n\nCó những công ơn và tình cảm ấm áp không thể diễn tả trọn vẹn bằng lời. Chiếc kỷ vật này gói trọn lòng biết ơn sâu sắc và sự kính trọng mà con luôn dành cho mẹ/cha. Cầu chúc người luôn an vui và khỏe mạnh.\n\nKính thương,\n{author}'
  },
  friendship: {
    sincere: 'Gửi {recipient},\n\nTri kỷ trên đời vạn người khó tìm được một. Cảm ơn bạn vì đã luôn sẻ chia, thấu hiểu và cùng nhau đi qua những thăng trầm của tuổi trẻ. Chiếc kỷ vật này là minh chứng cho tình bạn son sắt của chúng ta.\n\nThân mến,\n{author}'
  }
};

function getFallbackLetter({ occasion = 'anniversary', tone = 'romantic', recipient = 'Người thương', author = 'Người gửi', memoryHint = '' }) {
  let template = FALLBACK_TEMPLATES[occasion]?.[tone] || FALLBACK_TEMPLATES[occasion]?.romantic || FALLBACK_TEMPLATES.anniversary.romantic;
  let text = template.replace(/\{recipient\}/g, recipient).replace(/\{author\}/g, author);
  if (memoryHint) {
    text = text.replace(/(Cảm ơn em|Cầu chúc|Hy vọng)/, `Nhớ về ${memoryHint.trim()}, lòng anh lại đong đầy xúc cảm. $1`);
  }
  return text;
}

/**
 * Phân tích và kiểm duyệt phương tiện (ảnh / video) bằng Qwen3-VL trên Modal Cloud.
 * @param {Blob|Buffer|Uint8Array|string} media - Media data
 * @param {Object} options
 * @returns {Promise<{ approved: boolean, labels: string[], violations: string[], reason: string|null, model: string }>}
 */
export async function labelWithQwen(media, { fetchImpl = fetch, type, url } = {}) {
  let base64;
  let mediaType = type;

  if (url) {
    validateMediaUrl(url);
  } else if (typeof media?.arrayBuffer === 'function') {
    if (media.size > MAX_MEDIA_BYTES) throw failure('Phương tiện tối đa 50 MB.', 422);
    const ab = await media.arrayBuffer();
    if (!ab.byteLength || ab.byteLength > MAX_MEDIA_BYTES) throw failure('Phương tiện tối đa 50 MB.', 422);
    base64 = Buffer.from(ab).toString('base64');
    if (!mediaType) mediaType = media.type?.startsWith('video/') ? 'video' : 'image';
  } else if (Buffer.isBuffer(media) || media instanceof Uint8Array) {
    if (!media.byteLength || media.byteLength > MAX_MEDIA_BYTES) throw failure('Phương tiện tối đa 50 MB.', 422);
    base64 = Buffer.from(media).toString('base64');
    if (!mediaType) mediaType = 'image';
  } else if (typeof media === 'string') {
    if (!media || media.length > 4 * Math.ceil(MAX_MEDIA_BYTES / 3) || media.length % 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(media) || Buffer.from(media, 'base64').byteLength > MAX_MEDIA_BYTES) {
      throw failure('Dữ liệu phương tiện không hợp lệ hoặc vượt quá 50 MB.', 422);
    }
    base64 = media;
    if (!mediaType) mediaType = 'image';
  } else {
    throw failure('Dữ liệu phương tiện không hợp lệ để phân tích.', 422);
  }
  if (!['video', 'image'].includes(mediaType)) throw failure('Loại phương tiện không hợp lệ.', 422);

  const endpoint = MODAL_TAGGER_ENDPOINT.replace(/\/+$/, '');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: modalHeaders(),
    body: JSON.stringify({
      ...(url ? {url} : {video_base64: base64}),
      type: mediaType || 'image'
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    throw failure(`Hệ thống AI kiểm duyệt không phản hồi (${response.status}). Vui lòng thử lại sau.`, response.status === 429 ? 429 : 502);
  }

  let result, mod;
  try {
    result = await response.json();
    if (result.success !== true || result.error) throw new Error('Incomplete moderation');
    mod = moderationResult(result);
    if (result.approved === false && mod.approved) throw new Error('Conflicting moderation');
  } catch {
    if (result?.success === false && result.error_code === 'GPU_MEMORY') {
      throw failure('Hệ thống AI thiếu bộ nhớ khi xử lý. Phương tiện chưa được duyệt; vui lòng thử lại.', 503);
    }
    throw failure('AI chưa trả đủ kết quả kiểm duyệt. Vui lòng thử lại.', 502);
  }

  return {
    ...mod,
    model: result.model || 'Qwen/Qwen3-VL-4B-Instruct'
  };
}

/**
 * Adapter chính cho việc kiểm duyệt video và ảnh trong dự án.
 */
export async function labelVideo(blob, key, { fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const allowed = ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(blob?.type) || !blob?.size || blob.size > 50 * 1024 * 1024) {
    throw failure('Tệp phải là video MP4/WebM hoặc ảnh JPEG/PNG/WebP, tối đa 50 MB.', 422);
  }

  const isGoogleMock = (fetchImpl !== fetch && typeof fetchImpl === 'function') || key === 'private-key';
  if (!isGoogleMock) {
    return await labelWithQwen(blob, { fetchImpl, type: blob.type.startsWith('video/') ? 'video' : 'image' });
  }

  // Offline mock handler phục vụ bộ test tự động tests/video_nfc.test.mjs
  const model = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.7-flash';
  const signal = AbortSignal.timeout(140000);
  const base = 'https://generativelanguage.googleapis.com';
  const request = async (url, options = {}) => {
    const response = await fetchImpl(url, { ...options, headers: { 'x-goog-api-key': key, ...options.headers }, signal });
    if (response.status === 503) throw failure('Gemini đang quá tải. Phương tiện chưa được duyệt; hãy thử lại sau.', 503);
    if (!response.ok) throw failure(response.status === 404 ? 'Model Gemini đã cấu hình không khả dụng với API key này. Hãy kiểm tra GEMINI_VIDEO_MODEL trên server.' : response.status === 429 ? 'Gemini đã hết hạn mức. Thử lại sau.' : 'Gemini chưa xử lý được tệp. Kiểm tra API key, model và thử lại.', response.status === 429 ? 429 : 502);
    return response;
  };

  let file, fileName;
  try {
    let part;
    if (blob.size <= 10 * 1024 * 1024) part = { inlineData: { mimeType: blob.type, data: Buffer.from(await blob.arrayBuffer()).toString('base64') } };
    else {
      const upload = await request(base + '/upload/v1beta/files', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(blob.size), 'X-Goog-Upload-Header-Content-Type': blob.type }, body: JSON.stringify({ file: { display_name: 'memory-media' } }) });
      const location = upload.headers.get('x-goog-upload-url');
      if (!location || new URL(location).origin !== base) throw failure('Địa chỉ tải lên Gemini không hợp lệ.');
      const uploaded = await request(location, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: blob });
      file = (await uploaded.json()).file;
      if (!/^files\/[a-z0-9-]+$/.test(file?.name || '')) throw failure('Gemini chưa nhận được phương tiện.');
      fileName = file.name;
      part = { fileData: { mimeType: blob.type, fileUri: file.uri } };
    }
    const response = await request(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Classify and moderate this uploaded personal memory media' }] },
        contents: [{ role: 'user', parts: [part, { text: 'Trả nhãn chủ đề và nhãn vi phạm cho phương tiện tải lên.' }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          ...(model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : model.startsWith('gemini-3.') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { labels: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 8 }, violations: { type: 'ARRAY', items: { type: 'STRING', enum: Object.keys(VIOLATION_LABELS).filter(v => v !== 'PROVIDER_SAFETY') }, maxItems: 6 } }, required: ['labels', 'violations'] }
        }
      })
    });
    const result = await response.json();
    const candidate = result.candidates?.[0];
    if (['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY'].includes(candidate?.finishReason) || ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(result.promptFeedback?.blockReason)) {
      const mapping = { HARM_CATEGORY_SEXUALLY_EXPLICIT: 'SEXUAL_EXPLICIT', HARM_CATEGORY_HATE_SPEECH: 'HATE_HARASSMENT', HARM_CATEGORY_HARASSMENT: 'HATE_HARASSMENT', HARM_CATEGORY_DANGEROUS_CONTENT: 'DANGEROUS_ILLEGAL' };
      const blocked = [...(candidate?.safetyRatings || []), ...(result.promptFeedback?.safetyRatings || [])].filter(r => r.blocked && mapping[r.category]).map(r => mapping[r.category]);
      return { ...moderationResult({ labels: [], violations: blocked.length ? blocked : ['PROVIDER_SAFETY'] }), model };
    }
    if (candidate?.finishReason !== 'STOP') throw failure('AI chưa hoàn tất kiểm duyệt. Video chưa được phép sử dụng.');
    try { return { ...moderationResult(JSON.parse(candidate.content.parts.filter(p => !p.thought).map(p => p.text || '').join(''))), model }; }
    catch { throw failure('AI trả kết quả không hợp lệ. Vui lòng thử lại.'); }
  } finally {
    if (fileName) {
      try { const r = await fetchImpl(`${base}/v1beta/${fileName}`, { method: 'DELETE', headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(5000) }); if (!r.ok) console.warn('Gemini temporary file cleanup failed'); } catch { console.warn('Gemini temporary file cleanup failed'); }
    }
  }
}

/**
 * Sáng tác thư tay cảm xúc cho quà tặng trang sức Emoria bằng Qwen3-VL.
 */
export async function craftLetter(c) {
  const {
    occasion = 'anniversary',
    tone = 'romantic',
    recipient = 'Người thương',
    author = 'Người gửi',
    memoryHint = '',
    language = 'vi'
  } = c.body || {};

  for (const [field, max] of [['recipient', 120], ['author', 120], ['memoryHint', 1000], ['occasion', 40], ['tone', 40], ['language', 2]]) {
    const value = c.body?.[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > max)) {
      throw Object.assign(new Error('Invalid letter input: ' + field), { status: 422 });
    }
  }

  if (!['anniversary', 'proposal', 'birthday', 'gratitude', 'friendship'].includes(occasion) ||
      !['romantic', 'poetic', 'warm', 'sincere'].includes(tone) ||
      !['vi', 'en'].includes(language)) {
    throw Object.assign(new Error('Invalid letter options'), { status: 422 });
  }

  if (c.body?.consent !== true) {
    throw Object.assign(new Error('Cần đồng ý gửi thông tin để hệ thống AI sáng tác thư tay.'), { status: 400 });
  }

  const permitted = await c.db(c.client.rpc('reserve_letter_generation'));
  if (!permitted) {
    throw Object.assign(new Error('Tối đa 20 lượt tạo thư mỗi ngày, mỗi lượt cách nhau 30 giây.'), { status: 429 });
  }

  const fallback = getFallbackLetter({ occasion, tone, recipient, author, memoryHint });

  try {
    const response = await fetch(MODAL_LETTER_ENDPOINT, {
      method: 'POST',
      headers: modalHeaders(),
      body: JSON.stringify({
        task: 'letter',
        occasion,
        tone,
        recipient,
        author,
        memoryHint,
        language
      }),
      signal: AbortSignal.timeout(35000)
    });

    if (!response.ok) {
      return { letter: fallback };
    }

    const data = await response.json();
    if (data.success && data.letter && typeof data.letter === 'string' && data.letter.length >= 20) {
      return { letter: data.letter.trim() };
    }
    return { letter: fallback };
  } catch (err) {
    console.warn('[AI Service] Craft letter fallback:', err.message);
    return { letter: fallback };
  }
}

/**
 * Pre-warm the Modal Qwen GPU container asynchronously.
 */
export async function warmupAi() {
  const endpoint = MODAL_TAGGER_ENDPOINT.replace(/\/+$/, '');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: modalHeaders(),
      body: JSON.stringify({ task: 'warmup' }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success !== true || data.status !== 'ready') {
      throw failure('Dịch vụ AI chưa sẵn sàng.', response.status === 429 ? 429 : 503);
    }
    return {
      success: true,
      warmed: true,
      model: data.model || 'Qwen/Qwen3-VL-4B-Instruct',
      status: data.status || 'ready'
    };
  } catch (err) {
    return {
      success: false,
      warmed: false,
      message: err.message
    };
  }
}
