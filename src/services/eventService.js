import {apiRequest} from './apiClient.js';
import {supabase} from '../lib/supabaseClient.js';
import {serializeHouseRooms} from './house3d.js';
import {getAnalyticsConsent} from './analyticsService.js';

/**
 * 7 câu hỏi gợi ý mặc định cho Couple Match Studio (thấu hiểu nhau)
 * 3-7 câu, 2-4 lựa chọn mỗi câu.
 */
export const DEFAULT_MATCH_QUESTIONS = [
  {
    id: 1,
    text: 'Kỷ niệm hẹn hò nào khiến bạn nhớ nhất?',
    options: ['Buổi hẹn đầu tiên ngượng ngùng', 'Chuyến đi xa cùng nhau', 'Một tối giản dị dạo phố', 'Khoảnh khắc vượt qua khó khăn cùng nhau'],
    image_path: null
  },
  {
    id: 2,
    text: 'Thói quen nhỏ nào của đối phương khiến bạn mỉm cười?',
    options: ['Cách nói chuyện ngây ngô', 'Cái nắm tay ấm áp bất ngờ', 'Sự chu đáo trong từng việc nhỏ', 'Biểu cảm đáng yêu lúc dỗi hờn'],
    image_path: null
  },
  {
    id: 3,
    text: 'Món ăn nào cả hai luôn muốn gọi mỗi khi đi ăn cùng nhau?',
    options: ['Món ăn đường phố quen thuộc', 'Bữa tối lãng mạn nhẹ nhàng', 'Đồ ngọt và trà sữa', 'Tự nấu ăn ấm cúng tại nhà'],
    image_path: null
  },
  {
    id: 4,
    text: 'Nếu có một ngày cuối tuần hoàn hảo, hai bạn sẽ?',
    options: ['Cùng xem phim và trò chuyện tại nhà', 'Đi cà phê chụp ảnh góc phố quen', 'Khám phá một vùng đất mới', 'Cùng nhau đi mua sắm và ăn uống'],
    image_path: null
  },
  {
    id: 5,
    text: 'Giai điệu nào nhắc bạn nhớ về tình yêu của hai đứa?',
    options: ['Bản tình ca nhẹ nhàng acoustic', 'Một bài hát sôi động lúc đi đường', 'Giai điệu nhạc phim từng xem chung', 'Tiếng mưa rơi yên bình bên nhau'],
    image_path: null
  },
  {
    id: 6,
    text: 'Điều gì đối phương làm khiến bạn cảm thấy an tâm nhất?',
    options: ['Luôn lắng nghe và thấu hiểu', 'Luôn có mặt khi bạn cần', 'Sự kiên nhẫn và dịu dàng', 'Lời động viên chân thành'],
    image_path: null
  },
  {
    id: 7,
    text: 'Ước mơ lớn nhất hai bạn muốn cùng nhau thực hiện là gì?',
    options: ['Xây dựng một tổ ấm nhỏ tràn ngập tiếng cười', 'Cùng đi du lịch khắp thế giới', 'Cùng đạt được mục tiêu sự nghiệp', 'Bình yên bên nhau qua năm tháng'],
    image_path: null
  }
];

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
export async function createMatch({ tagUid, tag_uid, title = 'Couple Match', partnerName, partner_name, ownerName, owner_name } = {}) {
  const tag = tagUid || tag_uid;
  if (!tag) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest('/events/matches', {
    method: 'POST',
    body: {
      tag_uid: tag,
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
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest(`/memories/${encodeURIComponent(tagUid)}/matches`, {
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
export async function publishHouse(tagUid) {
  if (!tagUid) throw new Error('Vui lòng cung cấp mã kỷ vật.');
  return apiRequest(`/memories/${encodeURIComponent(tagUid)}/house/publish`, {
    method: 'POST',
    body: {}
  });
}

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

  const { error } = await supabase.storage.from('emoria-event-media').upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;

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
