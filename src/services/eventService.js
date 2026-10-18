import {apiRequest} from './apiClient.js';
import {supabase} from '../lib/supabaseClient.js';
import {serializeHouseRooms} from './house3d.js';
import {getAnalyticsConsent} from './analyticsService.js';
import {uploadReservedMedia} from './storageUpload.js';

import {getTopicQuestions} from './matchQuestionBank.js';

export const DEFAULT_MATCH_QUESTIONS = getTopicQuestions('lifestyle',7);

export function getGuestHouseStatus() {
  return apiRequest('/events/guest-house/status', {anonymous:true});
}

export function openGuestHouse() {
  return apiRequest('/events/guest-house/open', {method:'POST'});
}

export function setGuestHouseEnabled(enabled) {
  return apiRequest('/admin/system/guest-house', {method:'PATCH', body:{enabled}});
}

/**
 * 5 góc/phòng cố định trong Memory House Studio
 */
export const HOUSE_ROOMS_SPEC = [
  {
    id: 'beginning',
    name: 'Ngày bắt đầu',
    description: 'Khoảnh khắc đầu tiên hai ánh mắt chạm nhau và câu chuyện bắt đầu'
  },
  {
    id: 'first',
    name: 'Lần đầu của đôi mình',
    description: 'Cái nắm tay, buổi hẹn, chuyến đi đầu tiên ngập tràn bỡ ngỡ'
  },
  {
    id: 'little-things',
    name: 'Điều nhỏ xíu',
    description: 'Những cử chỉ dịu dàng, tin nhắn quan tâm và khoảnh khắc thường nhật'
  },
  {
    id: 'memories',
    name: 'Miền ký ức',
    description: 'Những dấu mốc đáng nhớ, thử thách cùng vượt qua và nụ cười rạng rỡ'
  },
  {
    id: 'next-chapter',
    name: 'Chương tiếp theo',
    description: 'Lời hứa ngày mai, ước mơ chung và hành trình tương lai'
  }
];

export const HOUSE_THEMES = [
  'classic',
  'warm_gold',
  'rose_romance',
  'midnight',
  'minimal_dark',
  'editorial_cream'
];

// ============================================================================
// MEMORY MATCH STUDIO API FUNCTIONS
// ============================================================================

/**
 * Tạo một lượt chơi Match Studio mới (bản nháp)
 */
export async function createMatch({ tagUid, tag_uid, title = 'Mismatch', partnerName, partner_name, ownerName, owner_name } = {}) {
  const tag = tagUid || tag_uid;
  return apiRequest('/events/matches', {
    method: 'POST',
    body: {
      tag_uid: tag || null,
      title,
      partner_name: partnerName || partner_name || null,
      owner_name: ownerName || owner_name || null
    }
  });
}

/**
 * Lưu bộ câu hỏi nháp cho lượt chơi (3-7 câu)
 */
export async function saveMatchQuestions(matchId, payload) {
  if (!matchId) throw new Error('Vui lòng cung cấp mã lượt chơi.');
  let body;
  if (Array.isArray(payload)) {
    body = { questions: payload, expected_revision: 0 };
  } else if (payload && typeof payload === 'object') {
    body = {
      questions: payload.questions,
      expected_revision: payload.expected_revision ?? 0,
      title: payload.title,
      partner_name: payload.partnerName ?? payload.partner_name,
      owner_name: payload.ownerName ?? payload.owner_name
    };
  } else {
    throw new Error('Dữ liệu câu hỏi không hợp lệ.');
  }

  return apiRequest(`/events/matches/${encodeURIComponent(matchId)}/questions`, {
    method: 'PUT',
    body
  });
}

/**
 * Bắt đầu lượt chơi và sinh invite token cho đối tác (chỉ Owner)
 */
export async function beginMatch(matchId) {
  if (!matchId) throw new Error('Vui lòng cung cấp mã lượt chơi.');
  return apiRequest(`/events/matches/${encodeURIComponent(matchId)}/begin`, {
    method: 'POST',
    body: {}
  });
}

export async function cancelMatch(matchId) {
  if (!matchId) throw new Error('Vui lòng cung cấp mã lượt chơi.');
  return apiRequest(`/events/matches/${encodeURIComponent(matchId)}/cancel`, {method:'POST', body:{}});
}

/**
 * Lưu tiến độ trả lời (Owner hoặc Partner có inviteToken)
 */
export async function saveMatchProgress(matchId, { answers, inviteToken, invite_token, expected_revision } = {}) {
  if (!matchId) throw new Error('Vui lòng cung cấp mã lượt chơi.');
  if (!Array.isArray(answers)) throw new Error('Dữ liệu tiến độ phải là một mảng.');
  return apiRequest(`/events/matches/${encodeURIComponent(matchId)}/progress`, {
    method: 'POST',
    body: {
      answers,
      expected_revision: expected_revision ?? 0,
      invite_token: inviteToken || invite_token || null
    }
  });
}

/**
 * Nộp bài chính thức (chỉ nộp một lần, tính lũy đẳng)
 */
export async function submitMatch(matchId, { answers, inviteToken, invite_token } = {}) {
  if (!matchId) throw new Error('Vui lòng cung cấp mã lượt chơi.');
  if (!Array.isArray(answers)) throw new Error('Dữ liệu đáp án phải là một mảng.');
  return apiRequest(`/events/matches/${encodeURIComponent(matchId)}/submit`, {
    method: 'POST',
    body: {
      answers,
      invite_token: inviteToken || invite_token || null
    }
  });
}

/**
 * Xem trạng thái / kết quả lượt chơi (bảo mật: không lộ đáp án người kia trước reveal)
 */
export async function getMatchView(matchId, options = {}) {
  if (!matchId) throw new Error('Vui lòng cung cấp mã lượt chơi.');
  const token = typeof options === 'string'
    ? options
    : (options.inviteToken || options.invite_token || options.invite || '');
  const query = token ? `?invite=${encodeURIComponent(token)}` : '';
  return apiRequest(`/events/matches/${encodeURIComponent(matchId)}/view${query}`, {
    method: 'GET'
  });
}

/**
 * Lấy danh sách các lượt chơi của một kỷ vật (dành cho Owner xem lịch sử/replay)
 */
export async function listMatches(tagUid) {
  return apiRequest(tagUid ? `/memories/${encodeURIComponent(tagUid)}/matches` : '/events/matches', {
    method: 'GET'
  });
}

// ============================================================================
// MEMORY HOUSE STUDIO API FUNCTIONS
// ============================================================================

/**
 * Tải bản nháp Memory House dành cho Owner
 */
export async function getHouseDraft(tagUid) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest(`/memories/${encodeURIComponent(tagUid)}/house/draft`, {
    method: 'GET'
  });
}

/**
 * Lưu bản nháp Memory House (5 phòng cố định, tối đa 10 ảnh/phòng)
 */
export async function saveHouseDraft(tagUid, { title, theme, rooms, expected_revision } = {}) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest(`/memories/${encodeURIComponent(tagUid)}/house/draft`, {
    method: 'PUT',
    body: {
      title,
      theme,
      rooms: serializeHouseRooms(rooms),
      expected_revision: expected_revision ?? 0
    }
  });
}

/**
 * Xuất bản Memory House (đóng băng snapshot, sinh share_id)
 */
export async function publishHouse(tagUid,{onProgress=()=>{},signal}={}) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  let job=await apiRequest(`/memories/${encodeURIComponent(tagUid)}/house/publish`, {
    method: 'POST',
    body: {},
    signal
  });
  if(!job.job_id)return job;
  const base=`/memories/${encodeURIComponent(tagUid)}/house/jobs/${encodeURIComponent(job.job_id)}`;
  // Each HTTP call handles one durable task. Cron also progresses the job when
  // the page closes; reopening/resubmitting this revision returns the same job.
  const end=Date.now()+30*60*1000;
  while(Date.now()<end){
    signal?.throwIfAborted();
    onProgress(job);
    if(job.status==='published')return job.result;
    if(['failed','superseded'].includes(job.status))throw new Error(job.reason==='technical'?'AI tạm thời chưa xử lý được ảnh. Tiến độ đã lưu; hãy xuất bản lại để tiếp tục.':job.reason||'Bản nháp đã thay đổi. Hãy xuất bản lại.');
    try {job=await apiRequest(base+'/run',{method:'POST',body:{},timeoutMs:170000,signal});}
    catch(error){if(signal?.aborted)throw error;if(![429,502,503,504].includes(error.status))throw error;}
    onProgress(job);
    if(job.status==='published')return job.result;
    await new Promise((resolve,reject)=>{
      const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(signal.reason);};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},Math.max(2,Math.min(60,job.retry_after||5))*1000);
      signal?.addEventListener('abort',stop,{once:true});
    });
    job=await apiRequest(base,{signal});
  }
  throw new Error('Tiến độ xuất bản đã lưu và vẫn được xử lý. Bạn có thể quay lại để xem kết quả.');
}

export const restoreHouseLayout=(tagUid,expected_revision)=>apiRequest(`/memories/${encodeURIComponent(tagUid)}/house/restore-layout`,{method:'POST',body:{expected_revision}});

/**
 * Hủy xuất bản Memory House (chuyển sang chế độ riêng tư)
 */
export async function unpublishHouse(tagUid) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest(`/memories/${encodeURIComponent(tagUid)}/house/unpublish`, {
    method: 'POST',
    body: {}
  });
}

/**
 * Thu hồi liên kết chia sẻ (sinh share_id mới, chặn vĩnh viễn liên kết cũ)
 */
export async function revokeHouseShare(tagUid) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest(`/memories/${encodeURIComponent(tagUid)}/house/revoke`, {
    method: 'POST',
    body: {}
  });
}

/**
 * Đọc công khai Memory House qua Share ID (chỉ đọc snapshot đã lọc, không lộ dữ liệu NFC)
 */
export async function getPublicHouse(shareId) {
  if (!shareId) throw new Error('Vui lòng cung cấp mã liên kết chia sẻ.');
  return apiRequest(`/events/houses/share/${encodeURIComponent(shareId)}`, {
    method: 'GET'
  });
}

/**
 * Đọc công khai Memory House theo mã tag_uid khi đã được xuất bản (cho luồng quét NFC)
 */
export async function getPublicHouseByTag(tagUid) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest(`/events/houses/tag/${encodeURIComponent(tagUid)}`, {
    method: 'GET'
  });
}

/**
 * Tải ảnh lên bucket 'emoria-event-media' cho Match hoặc House Studio
 * Tuân thủ RLS: lưu tại `${tagUid}/${filename}`
 */
export async function uploadEventPhoto(tagUid, file) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  if (!file) throw new Error('Vui lòng chọn tệp ảnh.');
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Chỉ hỗ trợ tệp ảnh JPEG, PNG hoặc WebP.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Dung lượng ảnh tối đa là 8 MB.');
  }
  const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const ext = extMap[file.type] || 'jpg';
  const cleanTag = tagUid.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const path = `${cleanTag}/${filename}`;

  await uploadReservedMedia('emoria-event-media',path,file);

  let signedUrl = null;
  try {
    const { data: signData } = await supabase.storage.from('emoria-event-media').createSignedUrl(path, 3600);
    signedUrl = signData?.signedUrl || null;
  } catch {
    signedUrl = null;
  }

  return {
    path,
    url: signedUrl
  };
}

/**
 * Yêu cầu Backend ký danh sách đường dẫn ảnh private
 */
export async function signEventMedia(paths) {
  if (!paths || (Array.isArray(paths) && paths.length === 0)) return {};
  const pathList = Array.isArray(paths) ? paths : [paths];
  const res = await apiRequest('/events/media/sign', {
    method: 'POST',
    body: { paths: pathList }
  });
  return res?.signed || {};
}

/**
 * Gửi tracking sự kiện (deduplicated & rate-limited)
 * Fire-and-forget: không chặn luồng giao diện người dùng nếu tracking gặp lỗi
 */
let eventSession;
export async function trackEventAction(eventName, resourceType, resourceId, dedupeKey = null, metadata = {}, inviteToken = null) {
  if(getAnalyticsConsent() !== 'granted')return;
  eventSession ||= crypto.randomUUID();
  if (!eventName || !resourceType || !resourceId) return;
  try {
    return await apiRequest('/events/analytics/track', {
      method: 'POST',
      body: {
        event_name: eventName,
        resource_type: resourceType,
        resource_id: String(resourceId),
        session_id: eventSession,
        event_id: /opened/.test(eventName)?undefined:crypto.randomUUID(),
        invite_token: inviteToken
      }
    });
  } catch (err) {
    // Non-blocking for client
    console.debug('[Event Tracking]', eventName, err?.message);
    return null;
  }
}

/**
 * Báo cáo nội dung vi phạm (cho khách hoặc người dùng)
 */
export async function submitContentReport(resourceType, resourceId, reason, details = '', inviteToken = null) {
  if (!resourceType || !resourceId || !reason) {
    throw new Error('Vui lòng chọn loại nội dung và lý do báo cáo.');
  }
  return apiRequest('/events/reports', {
    method: 'POST',
    body: {
      resource_type: resourceType,
      resource_id: String(resourceId),
      reason,
      details: details || null,
      invite_token: inviteToken
    }
  });
}

/**
 * Quản trị viên: Lấy danh sách báo cáo nội dung
 */
export async function adminListReports(status = null, limit = 50, offset = 0) {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  query.set('limit', String(limit));
  query.set('offset', String(offset));
  return apiRequest(`/admin/events/reports?${query.toString()}`, {
    method: 'GET'
  });
}

/**
 * Quản trị viên: Xử lý báo cáo (ẩn, khôi phục, bỏ qua)
 */
export async function adminModerateContent(reportId, action, reason = '') {
  if (!reportId || !action) throw new Error('Vui lòng cung cấp mã báo cáo và hành động.');
  return apiRequest('/admin/events/moderate', {
    method: 'POST',
    body: {
      report_id: reportId,
      action,
      reason: reason || null
    }
  });
}

/**
 * Quản trị viên: Thống kê và phễu chuyển đổi sự kiện
 */
export async function adminGetAnalyticsSummary(days = 30) {
  return apiRequest(`/admin/events/analytics/summary?days=${encodeURIComponent(days)}`, {
    method: 'GET'
  });
}


export const sendHouseReply=body=>apiRequest("/events/houses/replies",{method:"POST",body});
export const getHouseReplies=tag=>apiRequest(`/memories/${encodeURIComponent(tag)}/house/replies`);
