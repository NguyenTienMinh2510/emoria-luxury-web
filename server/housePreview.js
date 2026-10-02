import {eventAdmin} from './eventGateway.js';
import {signEventPaths} from './eventMedia.js';

const fail = message => Object.assign(new Error(message), {status:422});
const previewPaths = rooms => (Array.isArray(rooms) ? rooms : []).map(room => room.share_preview_path).filter(value => value != null);
export const housePreviewPath = rooms => previewPaths(rooms)[0] || null;

export async function readHousePhoto(path, tagUid, client, maxSize = 8 * 1024 * 1024) {
  if (typeof path !== 'string' || path.length > 500 || !/^[-a-zA-Z0-9_./]+$/.test(path) ||
    path.split('/').some(part => !part || part === '.' || part === '..') || path.split('/')[0].toLowerCase() !== String(tagUid).toLowerCase().trim()) {
    throw fail('Ảnh phải thuộc đúng ngôi nhà.');
  }
  const {data, error} = await client.storage.from('emoria-event-media').info(path);
  const type = data?.contentType || data?.metadata?.mimetype;
  const size = Number(data?.size ?? data?.metadata?.size);
  if (error || !['image/jpeg','image/png','image/webp'].includes(type) || !Number.isFinite(size) || size <= 0 || size > maxSize) {
    throw fail('Ảnh ngôi nhà phải là JPEG, PNG hoặc WebP với dung lượng hợp lệ.');
  }
  return {path, version:data.version, lastModified:data.lastModified || data.updatedAt};
}

export async function readHousePreview(rooms, tagUid, client) {
  const paths = previewPaths(rooms);
  if (!paths.length) return null;
  const path = paths[0];
  if (paths.length !== 1 || typeof path !== 'string' || path.length > 180 ||
    !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path) || path.split('/')[0] !== String(tagUid).toLowerCase().trim()) {
    throw fail('Ảnh toàn cảnh phải thuộc đúng ngôi nhà, mỗi ngôi nhà chỉ dùng một ảnh.');
  }
  try { return await readHousePhoto(path,tagUid,client,2 * 1024 * 1024); }
  catch {
    throw fail('Ảnh toàn cảnh phải là ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 2 MB.');
  }
}

export async function validateHousePreview(rooms, tagUid, client) {
  return (await readHousePreview(rooms,tagUid,client))?.path || null;
}

async function ownerTagForHouse({shareId,tagUid},admin) {
  if (tagUid) return tagUid;
  const {data,error} = await admin.from('memory_houses').select('memory_spaces!inner(tag_uid)').eq('share_id',shareId).maybeSingle();
  return error ? null : data?.memory_spaces?.tag_uid;
}

const frozenBeforePublish = (photo,view) => {
  const modifiedAt = Date.parse(photo?.lastModified), publishedAt = Date.parse(view?.published_at);
  return typeof photo?.version === 'string' && !!photo.version && Number.isFinite(modifiedAt) && Number.isFinite(publishedAt) && modifiedAt <= publishedAt;
};

// Only frozen, version-reviewed paths from the accepted public snapshot may be signed.
export async function approvedHousePhotoPaths(paths,view,identity,client=null) {
  const snapshotPaths = new Set((view?.rooms || []).flatMap(room => (room.memories || []).map(memory => memory.photo_path)).filter(Boolean));
  const requested = [...new Set(paths)].filter(path => snapshotPaths.has(path));
  if (!requested.length) return [];
  try {
    const admin=client || eventAdmin(), ownerTag=await ownerTagForHouse(identity,admin);
    if (!ownerTag) return [];
    const {data,error}=await admin.from('house_photo_reviews').select('path,status,violations,content_version').eq('tag',ownerTag).eq('status','ready').in('path',requested);
    if (error) return [];
    const approvals=new Map((data || []).filter(row => row.content_version && !row.violations?.length).map(row => [row.path,row.content_version]));
    const checked=await Promise.all(requested.map(async path => {
      if (!approvals.has(path)) return null;
      try {
        const photo=await readHousePhoto(path,ownerTag,admin);
        return frozenBeforePublish(photo,view) && photo.version===approvals.get(path) ? path : null;
      } catch { return null; }
    }));
    return checked.filter(Boolean);
  } catch { return []; }
}

// Called only after the published-house RPC accepts this share ID/tag.
export async function attachHousePreview(view, {shareId, tagUid}, client = null) {
  const path = housePreviewPath(view?.rooms);
  if (!path) return view;
  try {
    const admin = client || eventAdmin();
    const ownerTag = await ownerTagForHouse({shareId,tagUid},admin);
    if (!ownerTag) return view;
    const preview = await readHousePreview(view.rooms,ownerTag,admin);
    // A label belongs to reviewed bytes, and an existing snapshot cannot acquire a
    // later replacement even if that replacement is separately approved.
    if (!frozenBeforePublish(preview,view)) return view;
    const {data, error} = await admin.from('house_photo_reviews').select('status, violations, content_version').eq('tag',ownerTag).eq('path',path).eq('status','ready').maybeSingle();
    if (error || data?.status !== 'ready' || data.content_version !== preview.version || data.violations?.length) return view;
    const signed = await signEventPaths([path],120);
    if (signed[path]) view.preview_image = signed[path];
  } catch { /* Missing/invalid/unapproved previews use the labeled illustration. */ }
  return view;
}
