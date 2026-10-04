import { readFile } from 'node:fs/promises';
import {join} from 'node:path';
import restHandler from './v1.js';
import { createShareUrl } from '../src/services/shareLinks.js';

const clean = (value, limit = 240) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const tag = value => /^[a-zA-Z0-9-]{1,64}$/.test(value || '');
const imageUrl = (value, origin) => {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    const local = host => ['localhost','127.0.0.1','[::1]'].includes(host);
    return url.protocol === 'https:' || url.origin === origin || url.protocol === 'http:' && local(url.hostname) && local(new URL(origin).hostname) ? url.href : null;
  } catch { return null; }
};

// Reuse the public API's access checks, revocation and moderation; never forward a user session.
async function readPublicResource(path, method, body, req) {
  let result;
  await restHandler({ method: method || 'GET', url: `/api/v1${path}`, body,
    socket:req.socket,
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for':req.headers['x-vercel-forwarded-for'], 'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1' },
  }, { setHeader() {}, end(raw) { result = { status: this.statusCode, data: JSON.parse(raw) }; } });
  if (result.status !== 200 || result.data?.success === false) throw new Error('Shared content unavailable');
  return result.data;
}

export async function getShareMetadata(query, origin, read = readPublicResource, req = { headers: {} }) {
  const meta = { title: 'EMORIA — Một chạm mở ký ức', description: 'Trang sức S925 và những không gian lưu giữ kỷ niệm của bạn.',
    image: '/assets/hero_hand.png', imageAlt: 'Trang sức kỷ niệm EMORIA', type: 'website', url: createShareUrl(query, origin) };
  let kind = '';
  const isMatch = query.get('view') === 'memory-match' || query.get('match') || query.get('invite');
  const isHouse = query.get('view') === 'memory-house' || query.get('share');
  try {
    if (query.get('policy') === 'privacy' || query.get('privacy') === 'true') {
      Object.assign(meta, { title: 'Chính sách bảo mật — EMORIA', description: 'Tìm hiểu cách EMORIA bảo vệ tài khoản, ảnh, thư tay, dữ liệu NFC và quyền kiểm soát ký ức của bạn.', image: '/share/privacy.png', imageAlt: 'Quyền riêng tư và bảo vệ ký ức tại EMORIA' });
    } else if (isHouse && !isMatch) {
      kind = 'Ngôi nhà kỷ niệm';
      const share = query.get('share'), memoryTag = query.get('tag');
      if (!(share && /^[\w-]{1,64}$/.test(share)) && !tag(memoryTag)) throw new Error('Missing public house');
      const house = await read(share ? `/events/houses/share/${encodeURIComponent(share)}` : `/events/houses/tag/${encodeURIComponent(memoryTag)}`, 'GET', undefined, req);
      const rooms = Array.isArray(house.rooms) ? house.rooms : [];
      const note = rooms.map(room => clean(room.note, 130)).find(Boolean);
      Object.assign(meta, { title: `${clean(house.title, 120) || kind} — Memory House`,
        description: `Ghé thăm ngôi nhà 3D “${clean(house.title, 120) || 'Nhà của chúng mình'}”, khám phá ${rooms.length || 5} góc kỷ niệm và gửi lời nhắn cho chủ nhà.${note ? ` ${note}` : ''}`,
        image: imageUrl(house.preview_image,origin) || '/memoryhouse/models/house-preview.png', imageAlt: `${house.preview_image ? 'Ảnh toàn cảnh 3D' : 'Ảnh minh họa mô hình 3D'} — ${clean(house.title, 120) || kind}` });
    } else if (isMatch) {
      kind = 'Lời mời Mismatch';
      const match = query.get('match'), invite = query.get('invite');
      if (!uuid(match) || !/^[\w-]{16,256}$/.test(invite || '')) throw new Error('Missing match invitation');
      const game = await read(`/events/matches/${encodeURIComponent(match)}/view?invite=${encodeURIComponent(invite)}`, 'GET', undefined, req);
      if (!['active', 'completed'].includes(game.status)) throw new Error('Inactive match');
      const names = [game.owner_name, game.partner_name].map(name => clean(name, 50)).filter(Boolean).join(' và ');
      Object.assign(meta, { title: `${clean(game.title, 120) || 'Chơi vui cùng nhau'} — Mismatch`,
        description: `${game.status === 'completed' ? 'Xem lại lượt chơi' : 'Lời mời tham gia'} “${clean(game.title, 100) || 'Chơi vui cùng nhau'}”${names ? ` của ${names}` : ''}: ${game.total_questions || game.questions?.length || 7} câu hỏi để hiểu nhau hơn.`,
        image: game.questions?.map(question => imageUrl(question.image_url, origin)).find(Boolean) || '/share/mismatch.png', imageAlt: `Lời mời chơi Mismatch — ${clean(game.title, 120)}` });
    } else if (query.get('article')) {
      kind = 'Bài viết';
      const slug = query.get('article');
      if (!/^[\w-]{1,200}$/.test(slug)) throw new Error('Invalid article');
      const { article } = await read(`/articles/${encodeURIComponent(slug)}`, 'GET', undefined, req);
      if (!article) throw new Error('Missing article');
      Object.assign(meta, { title: `${clean(article.title, 140)} — EMORIA`, description: clean(article.excerpt) || `Đọc bài viết “${clean(article.title, 140)}”${article.category ? ` trong chuyên mục ${clean(article.category, 80)}` : ''}.`,
        image: imageUrl(article.cover_image, origin) || '/share/memory.png', imageAlt: clean(article.title, 140), type: 'article' });
    } else if (query.get('tag') || query.get('memory') || query.get('chip')) {
      kind = 'Kỷ vật Memory Space';
      let memoryTag = query.get('tag') || query.get('memory');
      if (query.get('chip')) {
        if (!uuid(query.get('chip'))) throw new Error('Invalid chip');
        memoryTag = (await read(`/nfc-chips/${encodeURIComponent(query.get('chip'))}`, 'GET', undefined, req)).tag_uid;
      }
      if (!tag(memoryTag)) throw new Error('Invalid memory');
      const memory = await read(`/memories/${encodeURIComponent(memoryTag)}/access`, 'POST', { grant: null }, req);
      const isPublic = memory.is_unlocked === true && memory.is_protected === false;
      Object.assign(meta, { title: `${clean(memory.title, 120) || kind} — Memory Space`,
        description: `${memory.date ? `${clean(memory.date, 50)} · ` : ''}${isPublic ? clean(memory.quote) || 'Mở kỷ vật để xem những hình ảnh và lời nhắn được chia sẻ.' : 'Kỷ vật riêng tư. Người nhận mở liên kết và xác thực để xem ảnh, thư tay và những kỷ niệm dành riêng cho mình.'}`,
        image: isPublic ? memory.media_gallery?.filter(item => item.type === 'image' && item.is_private !== true).map(item => imageUrl(item.url?.startsWith('storage://') ? memory.media_signing?.urls?.[item.url.slice(10)] : item.url, origin)).find(Boolean) || '/share/memory.png' : '/share/memory.png', imageAlt: 'Kỷ vật và câu chuyện trong Memory Space' });
    }
  } catch {
    Object.assign(meta, { title: `${kind || 'Nội dung chia sẻ'} — EMORIA`, description: 'Liên kết này cần quyền truy cập hoặc hiện không còn được chia sẻ. Mở liên kết để kiểm tra trạng thái mới nhất.', image: '/share/memory.png', imageAlt: 'Nội dung chia sẻ EMORIA' });
  }
  meta.description = clean(meta.description, 320);
  meta.image = imageUrl(meta.image, origin) || new URL('/share/memory.png', origin).href;
  return meta;
}

export function injectShareMetadata(html, meta) {
  const image = new URL(meta.url); image.searchParams.set('preview', 'image');
  const values = { 'og:site_name': 'EMORIA', 'og:locale': 'vi_VN', 'og:type': meta.type, 'og:title': meta.title,
    'og:description': meta.description, 'og:url': meta.url, 'og:image': image.href, 'og:image:alt': meta.imageAlt };
  const tags = Object.entries(values).map(([property, content]) => `<meta property="${property}" content="${escape(content)}" />`).join('\n');
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(meta.title)}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i, '')
    .replace('</head>', `<meta name="description" content="${escape(meta.description)}" />\n<meta name="robots" content="noindex, nofollow" />\n<link rel="canonical" href="${escape(meta.url)}" />\n${tags}\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:title" content="${escape(meta.title)}" />\n<meta name="twitter:description" content="${escape(meta.description)}" />\n<meta name="twitter:image" content="${escape(image.href)}" />\n</head>`);
}

export function createShareHandler(readIndex = () => readFile(join(process.cwd(),'dist','index.html'), 'utf8')) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.statusCode = 405; res.end(); return; }
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host) ? 'http' : 'https';
    let origin;
    try { origin = new URL(`${protocol}://${host}`).origin; } catch { res.statusCode = 400; res.end(); return; }
    const url = new URL(req.originalUrl || req.url, origin);
    if (url.search.length > 4096) { res.statusCode = 414; res.end(); return; }
    const meta = await getShareMetadata(url.searchParams, origin, readPublicResource, req);
    if (url.searchParams.get('preview') === 'image') { res.setHeader('Location', meta.image); res.statusCode = 302; res.end(); return; }
    try {
      const html = injectShareMetadata(await readIndex(req), meta);
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : html);
    } catch { res.statusCode = 503; res.end('Trang chia sẻ đang được cập nhật. Vui lòng thử lại.'); }
  };
}

export default createShareHandler();
