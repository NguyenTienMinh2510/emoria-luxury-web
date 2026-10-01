import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {SupabaseClient} from '@supabase/supabase-js';
import fs from 'node:fs';
import handler from '../api/v1.js';
import {streamMatch} from '../server/eventGateway.js';
import {watchMatch} from '../src/services/matchStream.js';
import {supabase} from '../src/lib/supabaseClient.js';
import * as eventService from '../src/services/eventService.js';

// Setup test environment
process.env.SUPABASE_URL = 'https://fixture-event-studios.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'fixture-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-role-key';

const originalFetch = globalThis.fetch;

// Helper to make API requests to handler (simulating Vite / Vercel API routing)
async function apiCall(method, path, body, token, options = {}) {
  const payloadStr = options.raw !== undefined ? options.raw : (body === undefined ? undefined : JSON.stringify(body));
  const req = Readable.from(payloadStr === undefined ? [] : [payloadStr]);
  const contentType = options.contentType !== undefined ? options.contentType : (payloadStr === undefined ? undefined : 'application/json');
  Object.assign(req, {
    method,
    url: path,
    headers: {
      ...(contentType ? {'content-type': contentType} : {}),
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      ...(options.headers || {})
    },
    ...(body !== undefined && options.raw === undefined ? {body} : {})
  });
  const headers = {};
  let result;
  const res = {
    setHeader(k, v) { headers[k] = v; },
    end(raw) {
      result = { status: this.statusCode, body: raw ? JSON.parse(raw) : null, headers };
    }
  };
  await handler(req, res);
  return result;
}

console.log('================================================================');
console.log('  EMORIA LUXURY - EVENT STUDIOS BEHAVIOR & API TEST SUITE');
console.log('================================================================\n');

// In-memory simulated state representing Supabase tables and RLS boundary
const state = {
  users: {
    'token-owner-a': { id: 'user-owner-a', email: 'owner@emoria.test' },
    'token-owner-b': { id: 'user-owner-b', email: 'other@emoria.test' },
    'token-recipient': { id: 'user-recipient', email: 'recipient@emoria.test' },
    'token-admin': { id: 'user-admin', email: 'admin@emoria.test', is_admin: true }
  },
  memories: {
    'emo-heart': {
      id: 'mem-uuid-1',
      tag_uid: 'emo-heart',
      title: 'Our First Ring',
      owner_id: 'user-owner-a',
      letter: 'Top secret love letter',
      pin_hash: '$2a$10$abcdefghijklmnopqrstuv',
      availability_status: 'available',
      admin_suspended: false
    },
    'emo-foreign': {
      id: 'mem-uuid-2',
      tag_uid: 'emo-foreign',
      title: 'Foreign Ring',
      owner_id: 'user-owner-a',
      availability_status: 'available',
      admin_suspended: false
    }
  },
  recipients: [
    { memory_id: 'mem-uuid-1', user_id: 'user-recipient' }
  ],
  matches: {},
  houses: {},
  storageObjects: {
    'emoria-event-media': new Set(['emo-heart/img1.jpg', 'emo-heart/img2.jpg', 'emo-heart/room1.jpg', 'emo-foreign/pic1.jpg'])
  },
    rateLimits: {},
    reports: {},
    analyticsEvents: [],
    dedupeKeys: new Set(),
    replies: []
  };

  let currentMatchCounter = 1;

  // Simulated RPC runner reproducing exact PostgreSQL semantics from 20260928072518_event_studios.sql & 20260929060533_event_studios_completion.sql
  function runSimulatedRpc(name, args, callerUserId) {
    if (name === 'rpc_event_dispatch') {
      const action = args.p_action;
      const a = args.p_args || {};
      const caller = args.p_caller || callerUserId || null;

      if (action.startsWith('rpc_match_') && a.p_match_id) {
        const match = state.matches[a.p_match_id];
        const matchMemory = match && state.memories[match.tag_uid];
        if (match && action === 'rpc_match_save_questions' && matchMemory && matchMemory.owner_id !== caller) {
          return { error: { code: '42501', message: 'Từ chối quyền: Bạn không phải chủ nhân hiện tại của kỷ vật này' } };
        }
        if (match && action === 'rpc_match_save_questions' && match.status !== 'draft') {
          return { error: { code: '22023', message: 'Không thể sửa đổi câu hỏi khi lượt chơi đã bắt đầu' } };
        }
        if (match && action === 'rpc_match_save_progress' && a.p_invite_token && match.partner_token_hash !== 'hash-' + a.p_invite_token) {
          return { error: { code: '42501', message: 'Mã mời tham gia không chính xác hoặc đã hết hiệu lực' } };
        }
        let rev = match.draft_revision || 0;
        if (action === 'rpc_match_save_progress' || action === 'rpc_match_submit') {
          const isPartner = Boolean(a.p_invite_token);
          rev = isPartner ? (match.partner_revision || 0) : (match.owner_revision || 0);
        }
        if (a.expected_revision !== undefined && a.expected_revision !== null) {
          if (Number(a.expected_revision) !== Number(rev)) {
            return { error: { code: 'P0001', message: 'DRAFT_CONFLICT: Bản này đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' } };
          }
        } else if (rev > 0 && (action === 'rpc_match_save_questions' || action === 'rpc_match_save_progress')) {
          return { error: { code: 'P0001', message: 'DRAFT_CONFLICT: Bản này đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' } };
        }
      }

      if (action === 'rpc_house_save_draft' && a.p_tag_uid) {
        const mem = state.memories[a.p_tag_uid?.toLowerCase()?.trim()];
        const house = mem ? state.houses[mem.id] : null;
        const currentRev = house?.draft_revision || 0;
        if (a.expected_revision !== undefined && a.expected_revision !== null) {
          if (Number(a.expected_revision) !== Number(currentRev)) {
            return { error: { code: 'P0001', message: 'DRAFT_CONFLICT: Ngôi nhà đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' } };
          }
        } else if (currentRev > 0) {
          return { error: { code: 'P0001', message: 'DRAFT_CONFLICT: Ngôi nhà đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' } };
        }
      }

      if (action === 'house_reply') {
        const h = Object.values(state.houses).find(item => item.share_id === a.share_id) ||
                  (a.tag_uid ? state.houses[state.memories[a.tag_uid?.toLowerCase()?.trim()]?.id] : null);
        if (!h) return { error: { code: 'P0002', message: 'Không tìm thấy ngôi nhà' } };
        const view = runSimulatedRpc('rpc_house_public_view', { p_share_id: h.share_id }, caller);
        if (view.error) return view;
        const beginningRoom = view.data?.rooms?.find(r => r.id === 'beginning');
        const policy = beginningRoom?.reply_policy || 'visitors';
        if (policy === 'off' || (policy === 'signed_in' && !caller)) {
          return { error: { code: '42501', message: 'Chủ nhà chưa cho phép gửi lời nhắn này' } };
        }
        if (!a.name || a.name.trim().length === 0 || a.name.length > 80 || (a.message && a.message.length > 1000) || !['heart', 'message'].includes(a.kind)) {
          return { error: { code: '22023', message: 'Lời nhắn không hợp lệ' } };
        }
        if (!state.replies) state.replies = [];
        state.replies.push({
          id: crypto.randomUUID(),
          house_id: h.id,
          name: a.name.trim(),
          message: a.message || '',
          kind: a.kind,
          created_at: new Date().toISOString(),
          read_at: null
        });
        return { data: { success: true } };
      }

      if (action === 'house_replies') {
        const mem = state.memories[a.p_tag_uid?.toLowerCase()?.trim()];
        if (!mem) return { error: { code: 'P0002', message: 'Không tìm thấy kỷ vật' } };
        if (!caller || mem.owner_id !== caller) {
          return { error: { code: '42501', message: 'Từ chối quyền: Bạn không phải chủ nhân kỷ vật này' } };
        }
        const h = state.houses[mem.id];
        if (!h) return { data: [] };
        const replies = (state.replies || []).filter(r => r.house_id === h.id);
        replies.forEach(r => { if (!r.read_at) r.read_at = new Date().toISOString(); });
        return { data: replies.map(({ id, name, message, kind, created_at, read_at }) => ({ id, name, message, kind, created_at, read_at })) };
      }

      const res = runSimulatedRpc(action, a, caller);
      if (res.error) return res;

      // Bump revisions on successful write mutations
      if (action === 'rpc_match_save_questions' && a.p_match_id) {
        const m = state.matches[a.p_match_id];
        if (m) m.draft_revision = (m.draft_revision || 0) + 1;
      } else if (action === 'rpc_match_save_progress' && a.p_match_id) {
        const m = state.matches[a.p_match_id];
        if (m) {
          const isPartner = Boolean(a.p_invite_token);
          if (isPartner) m.partner_revision = (m.partner_revision || 0) + 1;
          else m.owner_revision = (m.owner_revision || 0) + 1;
        }
      } else if (action === 'rpc_house_save_draft' && a.p_tag_uid) {
        const mem = state.memories[a.p_tag_uid?.toLowerCase()?.trim()];
        const h = mem ? state.houses[mem.id] : null;
        if (h) h.draft_revision = (h.draft_revision || 0) + 1;
      }

      // Attach revisions to return object
      let outData = res.data;
      if (typeof outData === 'object' && outData !== null && !Array.isArray(outData)) {
        if (action.startsWith('rpc_match_') && a.p_match_id) {
          const m = state.matches[a.p_match_id];
          if (m) {
            const isPartner = Boolean(a.p_invite_token);
            outData = {
              ...outData,
              draft_revision: m.draft_revision || 0,
              progress_revision: isPartner ? (m.partner_revision || 0) : (m.owner_revision || 0)
            };
          }
        }
        if (action.startsWith('rpc_house_') && a.p_tag_uid) {
          const mem = state.memories[a.p_tag_uid?.toLowerCase()?.trim()];
          const h = mem ? state.houses[mem.id] : null;
          if (h) {
            outData = {
              ...outData,
              draft_revision: h.draft_revision || 0
            };
          }
        }
      }
      return { data: outData };
    }

    if (name === 'rpc_match_create') {
      const mem = state.memories[args.p_tag_uid?.toLowerCase()?.trim()];
      if (!mem) return { error: { code: 'P0002', message: 'Không tìm thấy kỷ vật mang mã chip ' + args.p_tag_uid } };
      if (!callerUserId || mem.owner_id !== callerUserId) {
        return { error: { code: '42501', message: 'Từ chối quyền: Bạn không phải chủ nhân hiện tại của kỷ vật này' } };
      }
    const matchId = crypto.randomUUID();
    state.matches[matchId] = {
      id: matchId,
      memory_id: mem.id,
      tag_uid: mem.tag_uid,
      title: args.p_title || 'Couple Match',
      partner_name: args.p_partner_name || null,
      owner_name: args.p_owner_name || null,
      status: 'draft',
      questions: [],
      partner_token_hash: null,
      raw_token: null,
      owner_answers: null,
      owner_submitted_at: null,
      partner_answers: null,
      partner_submitted_at: null,
      score: null
    };
    return { data: { success: true, match_id: matchId, status: 'draft', title: state.matches[matchId].title } };
  }

  if (name === 'rpc_match_save_questions') {
    const match = state.matches[args.p_match_id];
    if (!match) return { error: { code: 'P0002', message: 'Lượt chơi không tồn tại' } };
    const mem = Object.values(state.memories).find(m => m.id === match.memory_id);
    if (!callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Chỉ chủ sở hữu kỷ vật mới có quyền sửa câu hỏi' } };
    }
    if (match.status !== 'draft') {
      return { error: { code: '22023', message: 'Không thể sửa đổi câu hỏi khi lượt chơi đã bắt đầu' } };
    }
    if (!Array.isArray(args.p_questions) || args.p_questions.length > 10) {
      return { error: { code: '22023', message: 'Số lượng câu hỏi trong bản nháp tối đa là 10 câu' } };
    }
    // Validate image paths
    for (let i = 0; i < args.p_questions.length; i++) {
      const q = args.p_questions[i];
      if (q.image_path) {
        const prefix = q.image_path.split('/')[0]?.toLowerCase();
        if (prefix !== match.tag_uid || !state.storageObjects['emoria-event-media'].has(q.image_path)) {
          return { error: { code: '22023', message: `Đường dẫn ảnh của câu hỏi ${i + 1} không hợp lệ hoặc không tồn tại trong bucket emoria-event-media` } };
        }
      }
    }
    match.questions = JSON.parse(JSON.stringify(args.p_questions));
    return { data: { success: true, match_id: match.id, questions_count: match.questions.length } };
  }

  if (name === 'rpc_match_get_draft') {
    const match = state.matches[args.p_match_id];
    if (!match) return { error: { code: 'P0002', message: 'Lượt chơi không tồn tại' } };
    const mem = Object.values(state.memories).find(m => m.id === match.memory_id);
    if (!callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Chỉ chủ sở hữu kỷ vật mới có quyền đọc bản nháp' } };
    }
    return {
      data: {
        success: true,
        match_id: match.id,
        tag_uid: match.tag_uid,
        title: match.title,
        partner_name: match.partner_name,
        owner_name: match.owner_name,
        status: match.status,
        questions: match.questions
      }
    };
  }

  if (name === 'rpc_match_begin') {
    const match = state.matches[args.p_match_id];
    if (!match) return { error: { code: 'P0002', message: 'Lượt chơi không tồn tại' } };
    const mem = Object.values(state.memories).find(m => m.id === match.memory_id);
    if (!callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Chỉ chủ sở hữu kỷ vật mới có quyền bắt đầu lượt chơi' } };
    }
    if (match.status !== 'draft') {
      return { error: { code: '22023', message: 'Lượt chơi này đã được bắt đầu trước đó' } };
    }
    if (match.questions.length < 3 || match.questions.length > 7) {
      return { error: { code: '22023', message: 'Cần thiết lập từ 3 đến 7 câu hỏi trước khi bắt đầu' } };
    }
    const rawToken = 'invite-token-' + Math.random().toString(36).slice(2);
    const tokenHash = 'hash-' + rawToken;
    match.status = 'active';
    match.partner_token_hash = tokenHash;
    match.raw_token = rawToken;
    return { data: { success: true, match_id: match.id, status: 'active', invite_token: rawToken } };
  }

  if (name === 'rpc_match_save_progress') {
    const match = state.matches[args.p_match_id];
    if (!match) return { error: { code: 'P0002', message: 'Lượt chơi không tồn tại' } };
    const mem = Object.values(state.memories).find(m => m.id === match.memory_id);
    let role = null;
    if (args.p_invite_token) {
      if (match.partner_token_hash === 'hash-' + args.p_invite_token) role = 'partner';
      else return { error: { code: '42501', message: 'Mã mời tham gia không chính xác hoặc đã hết hiệu lực' } };
    } else if (callerUserId && mem.owner_id === callerUserId) {
      role = 'owner';
    } else {
      return { error: { code: '42501', message: 'Từ chối quyền: Bạn không có quyền truy cập lượt chơi này' } };
    }
    if (role === 'owner' && match.owner_submitted_at) return { error: { code: '22023', message: 'Bạn đã nộp đáp án chính thức, không thể sửa đổi tiến độ' } };
    if (role === 'partner' && match.partner_submitted_at) return { error: { code: '22023', message: 'Bạn đã nộp đáp án chính thức, không thể sửa đổi tiến độ' } };

    if (role === 'owner') match.owner_answers = args.p_answers;
    else match.partner_answers = args.p_answers;
    return { data: { success: true, role, saved_count: args.p_answers.length } };
  }

  if (name === 'rpc_match_submit') {
    const match = state.matches[args.p_match_id];
    if (!match) return { error: { code: 'P0002', message: 'Lượt chơi không tồn tại' } };
    const mem = Object.values(state.memories).find(m => m.id === match.memory_id);
    let role = null;
    if (args.p_invite_token) {
      if (match.partner_token_hash === 'hash-' + args.p_invite_token) role = 'partner';
      else return { error: { code: '42501', message: 'Mã mời tham gia không chính xác' } };
    } else if (callerUserId && mem.owner_id === callerUserId) {
      role = 'owner';
    } else {
      return { error: { code: '42501', message: 'Từ chối quyền: Bạn không có quyền truy cập lượt chơi này' } };
    }

    const qCount = match.questions.length;
    // Idempotent check
    if ((role === 'owner' && match.owner_submitted_at) || (role === 'partner' && match.partner_submitted_at)) {
      const bothSubmitted = Boolean(match.owner_submitted_at && match.partner_submitted_at);
      return { data: { success: true, already_submitted: true, both_submitted: bothSubmitted, score: bothSubmitted ? match.score : null, total_questions: qCount } };
    }

    if (!Array.isArray(args.p_answers) || args.p_answers.length !== qCount) {
      return { error: { code: '22023', message: `Bạn phải trả lời đầy đủ tất cả ${qCount} câu hỏi để nộp bài` } };
    }

    for (let i = 0; i < qCount; i++) {
      const idx = args.p_answers[i];
      if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= match.questions[i].options.length) {
        return { error: { code: '22023', message: `Lựa chọn ${idx} không hợp lệ cho câu ${i + 1}` } };
      }
    }

    if (role === 'owner') {
      match.owner_answers = args.p_answers;
      match.owner_submitted_at = new Date().toISOString();
    } else {
      match.partner_answers = args.p_answers;
      match.partner_submitted_at = new Date().toISOString();
    }

    const bothSubmitted = Boolean(match.owner_submitted_at && match.partner_submitted_at);
    if (bothSubmitted) {
      let score = 0;
      for (let i = 0; i < qCount; i++) {
        if (match.owner_answers[i] === match.partner_answers[i]) score++;
      }
      match.score = score;
      match.status = 'completed';
    }

    return { data: { success: true, submitted: true, both_submitted: bothSubmitted, score: bothSubmitted ? match.score : null, total_questions: qCount } };
  }

  if (name === 'rpc_match_get_view') {
    const match = state.matches[args.p_match_id];
    if (!match) return { error: { code: 'P0002', message: 'Lượt chơi không tồn tại' } };
    if (match.is_hidden) return { error: { code: '42501', message: 'Lượt chơi này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' } };
    const mem = Object.values(state.memories).find(m => m.id === match.memory_id);
    let role = null;
    if (args.p_invite_token) {
      if (match.partner_token_hash === 'hash-' + args.p_invite_token) role = 'partner';
      else return { error: { code: '42501', message: 'Mã mời tham gia không chính xác' } };
    } else if (callerUserId && mem.owner_id === callerUserId) {
      role = 'owner';
    } else {
      return { error: { code: '42501', message: 'Từ chối quyền truy cập' } };
    }

    const bothSubmitted = Boolean(match.owner_submitted_at && match.partner_submitted_at);
    const isOwner = role === 'owner';
    const mySubmitted = isOwner ? Boolean(match.owner_submitted_at) : Boolean(match.partner_submitted_at);
    const otherSubmitted = isOwner ? Boolean(match.partner_submitted_at) : Boolean(match.owner_submitted_at);
    const myAnswers = isOwner ? match.owner_answers : match.partner_answers;
    const otherAnswers = bothSubmitted ? (isOwner ? match.partner_answers : match.owner_answers) : null;

    return {
      data: {
        success: true,
        match_id: match.id,
        title: match.title,
        partner_name: match.partner_name,
        owner_name: match.owner_name,
        status: match.status,
        questions: match.questions,
        my_role: role,
        my_submitted: mySubmitted,
        my_answers: myAnswers,
        other_submitted: otherSubmitted,
        other_answers: otherAnswers,
        both_submitted: bothSubmitted,
        score: bothSubmitted ? match.score : null,
        total_questions: match.questions.length
      }
    };
  }

  if (name === 'rpc_match_list') {
    const mem = state.memories[args.p_tag_uid?.toLowerCase()?.trim()];
    if (!mem) return { error: { code: 'P0002', message: 'Kỷ vật không tồn tại' } };
    if (!callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Từ chối quyền: Bạn không phải chủ nhân của kỷ vật này' } };
    }
    const list = Object.values(state.matches).filter(m => m.memory_id === mem.id).map(m => ({
      id: m.id,
      title: m.title,
      partner_name: m.partner_name,
      owner_name: m.owner_name,
      status: m.status,
      score: m.score,
      total_questions: m.questions.length,
      owner_submitted: Boolean(m.owner_submitted_at),
      partner_submitted: Boolean(m.partner_submitted_at)
    }));
    return { data: list };
  }

  if (name === 'rpc_house_save_draft') {
    const mem = state.memories[args.p_tag_uid?.toLowerCase()?.trim()];
    if (!mem) return { error: { code: 'P0002', message: 'Kỷ vật không tồn tại' } };
    if (!callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Chỉ chủ sở hữu kỷ vật mới có quyền lưu ngôi nhà kỷ niệm' } };
    }
    if (args.p_rooms) {
      if (args.p_rooms.length > 5) return { error: { code: '22023', message: 'Ngôi nhà có tối đa 5 phòng cố định' } };
      for (const r of args.p_rooms) {
        if (!['beginning', 'first', 'little-things', 'memories', 'next-chapter'].includes(r.id)) {
          return { error: { code: '22023', message: 'Mã phòng không hợp lệ' } };
        }
        for (const m of (r.memories || [])) {
          const prefix = m.photo_path?.split('/')[0]?.toLowerCase();
          if (prefix !== mem.tag_uid || !state.storageObjects['emoria-event-media'].has(m.photo_path)) {
            return { error: { code: '22023', message: `Ảnh ${m.photo_path} không hợp lệ hoặc không tồn tại trong bucket emoria-event-media` } };
          }
        }
        if (r.decorations) {
          if (!Array.isArray(r.decorations)) {
            return { error: { code: '22023', message: 'Đồ trang trí phải là danh sách' } };
          }
          if (Buffer.byteLength(JSON.stringify(r.decorations)) > 131072) {
            return { error: { code: '22023', message: 'Dung lượng đồ trang trí vượt quá giới hạn 128KB' } };
          }
          const boundsMap = {
            'beginning':     { minX: -4.20, maxX: -1.40, minY: 0.10, maxY: 2.60, minZ: -1.35, maxZ: 1.35 },
            'first':         { minX: -1.40, maxX: 1.40,  minY: 0.10, maxY: 2.60, minZ: -1.35, maxZ: 1.35 },
            'little-things': { minX: 1.40,  maxX: 4.20,  minY: 0.10, maxY: 2.60, minZ: -1.35, maxZ: 1.35 },
            'memories':      { minX: -3.60, maxX: 0.00,  minY: 2.20, maxY: 4.70, minZ: -1.35, maxZ: 1.35 },
            'next-chapter':  { minX: 0.00,  maxX: 3.60,  minY: 2.20, maxY: 4.70, minZ: -1.35, maxZ: 1.35 }
          };
          const b = boundsMap[r.id] || { minX: -4.5, maxX: 4.5, minY: 0.1, maxY: 4.8, minZ: -1.4, maxZ: 1.4 };
          const margin = 0.06;

          const supportedSurfacesMap = {
            calendar: ['table', 'wall'],
            cat: ['floor', 'table'],
            nameplate: ['table', 'shelf', 'floor'],
            plant: ['floor', 'table', 'shelf'],
            mugs: ['table', 'shelf'],
            lamp: ['table', 'shelf', 'floor'],
            vase: ['table', 'shelf'],
            album: ['table', 'shelf'],
            bunting: ['wall', 'ceiling'],
            frame: ['wall', 'table'],
            birdcage: ['table', 'floor', 'shelf'],
            candles: ['table', 'shelf']
          };

          for (const d of r.decorations) {
            if (!d || typeof d !== 'object') {
              return { error: { code: '22023', message: 'Đồ trang trí không hợp lệ' } };
            }
            if (!supportedSurfacesMap[d.item]) {
              return { error: { code: '22023', message: 'Món đồ trang trí không hợp lệ' } };
            }
            if (d.surface && !supportedSurfacesMap[d.item].includes(d.surface)) {
              return { error: { code: '22023', message: `Món ${d.item} không thể đặt trên ${d.surface}` } };
            }
            if (d.position) {
              if (!Array.isArray(d.position) || d.position.length !== 3 || !d.position.every(n => typeof n === 'number' && Number.isFinite(n))) {
                return { error: { code: '22023', message: 'Tọa độ vị trí phải là số hữu hạn' } };
              }
              const [px, py, pz] = d.position;
              if (px < b.minX + margin || px > b.maxX - margin || py < b.minY - 0.05 || py > b.maxY - margin || pz < b.minZ + margin || pz > b.maxZ - margin) {
                return { error: { code: '22023', message: 'Vị trí đồ trang trí vượt quá giới hạn căn phòng' } };
              }
            }
            if (d.scale !== undefined) {
              const sc = typeof d.scale === 'number' ? [d.scale] : (Array.isArray(d.scale) ? d.scale : null);
              if (!sc || sc.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0.3 || n > 3.0)) {
                return { error: { code: '22023', message: 'Tỷ lệ thu phóng phải nằm trong khoảng 0.3 đến 3.0' } };
              }
            }
            if (d.parent_id) {
              if (d.id && d.id === d.parent_id) {
                return { error: { code: '22023', message: 'Đồ trang trí không thể làm vật đỡ cho chính nó' } };
              }
              const parentObj = r.decorations.find(p => (p.id && p.id === d.parent_id) || (p.slot && p.slot === d.parent_id));
              if (!parentObj) {
                return { error: { code: '22023', message: `Vật đỡ ${d.parent_id} không tồn tại trong cùng phòng` } };
              }
              if (!['table', 'desk', 'shelf', 'carpet', 'album', 'nameplate'].includes(parentObj.item)) {
                return { error: { code: '22023', message: `Món đồ ${parentObj.item} không thể làm vật đỡ cho món đồ khác` } };
              }
              const visited = new Set([d.id, d.parent_id]);
              let curr = parentObj.parent_id;
              while (curr) {
                if (visited.has(curr)) {
                  return { error: { code: '22023', message: 'Phát hiện chu trình tham chiếu vật đỡ' } };
                }
                visited.add(curr);
                const nextP = r.decorations.find(p => p.id === curr);
                if (!nextP) break;
                curr = nextP.parent_id;
              }
            }
          }
        }
      }
    }
    const existing = state.houses[mem.id] || { memory_id: mem.id, is_published: false, share_id: null, published_snapshot: null };
    existing.title = args.p_title || existing.title || 'Our Memory House';
    existing.theme = args.p_theme || existing.theme || 'classic';
    existing.rooms_draft = args.p_rooms || existing.rooms_draft || [];
    state.houses[mem.id] = existing;
    return { data: { success: true, house_id: 'house-' + mem.id } };
  }

  if (name === 'rpc_house_get_draft') {
    const mem = state.memories[args.p_tag_uid?.toLowerCase()?.trim()];
    if (!mem) return { error: { code: 'P0002', message: 'Kỷ vật không tồn tại' } };
    if (!callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Chỉ chủ sở hữu kỷ vật mới có quyền xem bản nháp này' } };
    }
    const h = state.houses[mem.id];
    if (!h) {
      return { data: { success: true, exists: false, title: 'Our Memory House', theme: 'classic', rooms: [], is_published: false, share_id: null } };
    }
    return {
      data: {
        success: true,
        exists: true,
        title: h.title,
        theme: h.theme,
        rooms: h.rooms_draft,
        is_published: h.is_published,
        share_id: h.share_id
      }
    };
  }

  if (name === 'rpc_house_publish') {
    const mem = state.memories[args.p_tag_uid?.toLowerCase()?.trim()];
    if (!mem) return { error: { code: 'P0002', message: 'Chưa tạo dữ liệu ngôi nhà cho kỷ vật này' } };
    if (!callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Chỉ chủ sở hữu kỷ vật mới có quyền xuất bản' } };
    }
    const h = state.houses[mem.id];
    if (!h) return { error: { code: 'P0002', message: 'Chưa tạo dữ liệu ngôi nhà cho kỷ vật này' } };
    let totalMemories = 0;
    for (const r of (h.rooms_draft || [])) totalMemories += (r.memories || []).length;
    if (totalMemories < 1) return { error: { code: '22023', message: 'Cần ít nhất một kỷ niệm ảnh để xuất bản ngôi nhà' } };

    h.share_id = h.share_id || 'share-' + Math.random().toString(36).slice(2, 14);
    h.is_published = true;
    h.published_snapshot = {
      title: h.title,
      theme: h.theme,
      rooms: JSON.parse(JSON.stringify(h.rooms_draft)),
      published_at: new Date().toISOString()
    };
    return { data: { success: true, is_published: true, share_id: h.share_id } };
  }

  if (name === 'rpc_house_unpublish') {
    const mem = state.memories[args.p_tag_uid?.toLowerCase()?.trim()];
    if (!mem || !callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Không tìm thấy ngôi nhà kỷ niệm hoặc không có quyền thao tác' } };
    }
    const h = state.houses[mem.id];
    if (h) h.is_published = false;
    return { data: { success: true, is_published: false } };
  }

  if (name === 'rpc_house_revoke_share') {
    const mem = state.memories[args.p_tag_uid?.toLowerCase()?.trim()];
    if (!mem || !callerUserId || mem.owner_id !== callerUserId) {
      return { error: { code: '42501', message: 'Không tìm thấy ngôi nhà kỷ niệm hoặc không có quyền thao tác' } };
    }
    const h = state.houses[mem.id];
    if (h) {
      h.is_published = false;
      h.share_id = 'share-' + Math.random().toString(36).slice(2, 14);
    }
    return { data: { success: true, is_published: false, revoked: true } };
  }

  if (name === 'rpc_house_public_view') {
    const shareId = args.p_share_id?.trim();
    if (!shareId) return { error: { code: '22023', message: 'Mã liên kết không hợp lệ' } };
    const h = Object.values(state.houses).find(item => item.share_id === shareId);
    if (!h) return { error: { code: 'P0002', message: 'Không tìm thấy ngôi nhà kỷ niệm hoặc liên kết đã bị thu hồi' } };
    if (!h.is_published) return { error: { code: '42501', message: 'Không gian ngôi nhà này hiện đang ở chế độ riêng tư' } };
    if (h.is_hidden) return { error: { code: '42501', message: 'Không gian ngôi nhà này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' } };
    const mem = Object.values(state.memories).find(m => m.id === h.memory_id);
    if (mem.availability_status === 'suspended' || mem.admin_suspended) {
      return { error: { code: '42501', message: 'Kỷ niệm này hiện đang tạm ngưng truy cập' } };
    }
    return {
      data: {
        success: true,
        title: h.published_snapshot.title,
        theme: h.published_snapshot.theme,
        rooms: h.published_snapshot.rooms,
        published_at: h.published_snapshot.published_at
      }
    };
  }

  if (name === 'rpc_house_tag_public_view') {
    const tag = args.p_tag_uid?.toLowerCase()?.trim();
    if (!tag) return { error: { code: '22023', message: 'Mã kỷ vật không hợp lệ' } };
    const mem = state.memories[tag];
    if (!mem) return { error: { code: 'P0002', message: 'Không tìm thấy ngôi nhà kỷ niệm cho kỷ vật này' } };
    const h = state.houses[mem.id];
    if (!h) return { error: { code: 'P0002', message: 'Không tìm thấy ngôi nhà kỷ niệm cho kỷ vật này' } };
    if (!h.is_published) return { error: { code: '42501', message: 'Không gian ngôi nhà này hiện đang ở chế độ riêng tư' } };
    if (h.is_hidden) return { error: { code: '42501', message: 'Không gian ngôi nhà này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' } };
    if (mem.availability_status === 'suspended' || mem.admin_suspended) {
      return { error: { code: '42501', message: 'Kỷ niệm này hiện đang tạm ngưng truy cập' } };
    }
    if (!h.published_snapshot) return { error: { code: 'P0002', message: 'Chưa có bản xuất bản nào khả dụng' } };
    return {
      data: {
        success: true,
        title: h.published_snapshot.title,
        theme: h.published_snapshot.theme,
        rooms: h.published_snapshot.rooms,
        published_at: h.published_snapshot.published_at
      }
    };
  }

  if (name === 'rpc_my_memories') {
    if (!callerUserId) return { data: [] };
    const list = Object.values(state.memories)
      .filter(m => m.owner_id === callerUserId || (state.recipients || []).some(r => r.memory_id === m.id && r.user_id === callerUserId))
      .map(m => ({
        tag_uid: m.tag_uid,
        title: m.title,
        jewelry_name: 'Jewelry',
        role: m.owner_id === callerUserId ? 'owner' : 'recipient',
        admin_suspended: m.admin_suspended || false
      }));
    return { data: list };
  }

  if (name === 'is_admin') {
    return { data: callerUserId === 'user-admin' };
  }

  if (name === 'rpc_check_rate_limit') {
    const key = args.p_key;
    const maxBurst = args.p_max_burst || 10;
    const windowSeconds = args.p_window_seconds || 60;
    if (!state.rateLimits) state.rateLimits = {};
    const now = Date.now();
    const entry = state.rateLimits[key] || { count: 0, resetAt: now + windowSeconds * 1000 };
    if (now > entry.resetAt) {
      entry.count = 1;
      entry.resetAt = now + windowSeconds * 1000;
    } else {
      entry.count++;
    }
    state.rateLimits[key] = entry;
    const allowed = entry.count <= maxBurst;
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      data: {
        allowed,
        current_count: entry.count,
        max_burst: maxBurst,
        retry_after: retryAfter
      }
    };
  }

  if (name === 'rpc_track_event_action') {
    if (!state.analyticsEvents) state.analyticsEvents = [];
    if (!state.dedupeKeys) state.dedupeKeys = new Set();
    const dedupe = args.p_dedupe_key;
    if (dedupe) {
      if (state.dedupeKeys.has(dedupe)) {
        return { data: { success: true, deduped: true } };
      }
      state.dedupeKeys.add(dedupe);
    }
    state.analyticsEvents.push({
      id: crypto.randomUUID(),
      event_name: args.p_event_name,
      resource_type: args.p_resource_type,
      resource_id: args.p_resource_id,
      dedupe_key: dedupe || null,
      metadata: args.p_metadata || {},
      created_at: new Date().toISOString()
    });
    return { data: { success: true, tracked: true } };
  }

  if (name === 'rpc_get_event_analytics_summary') {
    if (callerUserId !== 'user-admin') {
      return { error: { code: '42501', message: 'Chỉ quản trị viên mới có quyền xem báo cáo thống kê' } };
    }
    const events = state.analyticsEvents || [];
    const counts = {};
    for (const ev of events) {
      counts[ev.event_name] = (counts[ev.event_name] || 0) + 1;
    }
    return {
      data: {
        success: true,
        days: args.p_days || 30,
        total_events: events.length,
        events_by_type: counts,
        funnel_match: {
          invite_opened: counts['match_invite_opened'] || 0,
          started: counts['match_started'] || 0,
          owner_completed: counts['match_owner_completed'] || 0,
          partner_completed: counts['match_partner_completed'] || 0,
          both_completed: counts['match_both_completed'] || 0
        },
        funnel_house: {
          published: counts['house_published'] || 0,
          opened_share: counts['house_opened_share'] || 0,
          share_clicked: counts['house_share_click'] || 0,
          copy_link: counts['house_copy_link'] || 0,
          postcard_download: counts['house_postcard_download'] || 0,
          postcard_shared: counts['house_postcard_shared'] || 0
        },
        daily_trends: [
          { date: new Date().toISOString().slice(0, 10), count: events.length }
        ],
        updated_at: new Date().toISOString()
      }
    };
  }

  if (name === 'rpc_submit_content_report') {
    if (!['house', 'match', 'guestbook'].includes(args.p_resource_type)) {
      return { error: { code: '22023', message: 'Loại tài nguyên báo cáo không hợp lệ' } };
    }
    if (!['inappropriate_content', 'harassment', 'copyright', 'spam', 'other'].includes(args.p_reason)) {
      return { error: { code: '22023', message: 'Lý do báo cáo không hợp lệ' } };
    }
    if (!state.reports) state.reports = {};
    const reportId = crypto.randomUUID();
    state.reports[reportId] = {
      id: reportId,
      resource_type: args.p_resource_type,
      resource_id: args.p_resource_id,
      reason: args.p_reason,
      details: args.p_details || null,
      status: 'pending',
      admin_notes: null,
      created_at: new Date().toISOString(),
      reviewed_at: null
    };
    return { data: { success: true, report_id: reportId, status: 'pending' } };
  }

  if (name === 'rpc_admin_list_reports') {
    if (callerUserId !== 'user-admin') {
      return { error: { code: '42501', message: 'Chỉ quản trị viên mới có quyền xem danh sách báo cáo' } };
    }
    let list = Object.values(state.reports || {});
    if (args.p_status) {
      list = list.filter(r => r.status === args.p_status);
    }
    return { data: { success: true, reports: list } };
  }

  if (name === 'rpc_admin_moderate_content') {
    if (callerUserId !== 'user-admin') {
      return { error: { code: '42501', message: 'Chỉ quản trị viên mới có quyền kiểm duyệt nội dung' } };
    }
    if (!['hide', 'restore', 'dismiss'].includes(args.p_action)) {
      return { error: { code: '22023', message: 'Hành động kiểm duyệt không hợp lệ' } };
    }
    const report = state.reports?.[args.p_report_id];
    if (!report) {
      return { error: { code: 'P0002', message: 'Báo cáo vi phạm không tồn tại' } };
    }
    if (args.p_action === 'hide') {
      report.status = 'hidden';
      report.admin_notes = args.p_reason || 'Vi phạm tiêu chuẩn';
      report.reviewed_at = new Date().toISOString();
      if (report.resource_type === 'house') {
        const h = Object.values(state.houses).find(item => item.share_id === report.resource_id) ||
                  state.houses[state.memories[report.resource_id]?.id];
        if (h) h.is_hidden = true;
      } else if (report.resource_type === 'match') {
        const m = state.matches[report.resource_id];
        if (m) m.is_hidden = true;
      }
    } else if (args.p_action === 'restore') {
      report.status = 'restored';
      report.admin_notes = args.p_reason || 'Đã khôi phục';
      report.reviewed_at = new Date().toISOString();
      if (report.resource_type === 'house') {
        const h = Object.values(state.houses).find(item => item.share_id === report.resource_id) ||
                  state.houses[state.memories[report.resource_id]?.id];
        if (h) h.is_hidden = false;
      } else if (report.resource_type === 'match') {
        const m = state.matches[report.resource_id];
        if (m) m.is_hidden = false;
      }
    } else if (args.p_action === 'dismiss') {
      report.status = 'dismissed';
      report.admin_notes = args.p_reason || 'Bác bỏ';
      report.reviewed_at = new Date().toISOString();
    }
    return { data: { success: true, action: args.p_action } };
  }

  return { error: { code: '42883', message: 'Function not found: ' + name } };
}

// Intercept fetch calls made by api/v1.js to Supabase
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const headers = new Headers(init.headers);
  const authHeader = headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer /i, '');
  const callerUser = state.users[token] || null;

  if (url.endsWith('/auth/v1/user')) {
    if (!callerUser) return Response.json({ message: 'Invalid token' }, { status: 401 });
    return Response.json(callerUser);
  }

  if (url.endsWith('/storage/v1/object/sign/emoria-event-media')) {
    if (token !== 'fixture-service-role-key') {
      return Response.json({ message: 'Unauthorized storage request' }, { status: 401 });
    }
    const { paths } = JSON.parse(init.body);
    return Response.json(paths.map(path => ({path, error:null, signedURL:`/object/sign/emoria-event-media/${path}?token=verified-mock-signer-token`})));
  }
  if (url.includes('/storage/v1/object/sign/emoria-event-media/')) {
    if (token !== 'fixture-service-role-key') {
      return Response.json({ message: 'Unauthorized storage request: missing or invalid service_role key' }, { status: 401 });
    }
    const pathPart = decodeURIComponent(url.split('/storage/v1/object/sign/emoria-event-media/')[1].split('?')[0]);
    return Response.json({
      signedURL: `/object/sign/emoria-event-media/${pathPart}?token=verified-mock-signer-token`
    });
  }

  if (url.includes('/rpc/')) {
    const rpcName = url.split('/rpc/')[1].split('?')[0];
    const body = init.body ? JSON.parse(init.body) : {};
    const res = runSimulatedRpc(rpcName, body, callerUser?.id || null);
    if (res.error) return Response.json(res.error, { status: 400 });
    return Response.json(res.data);
  }

  return Response.json({ message: 'Not found' }, { status: 404 });
};

async function runTests() {
  try {
    // --------------------------------------------------------------------------
    // Test 1: Owner tạo và reload Match draft
    // --------------------------------------------------------------------------
    console.log('--- Test 1: Owner tạo và reload Match draft ---');
    const createRes = await apiCall('POST', '/api/v1/events/matches', {
      tag_uid: 'emo-heart',
      title: 'Kỷ niệm chúng mình',
      partner_name: 'Lan',
      owner_name: 'Minh'
    }, 'token-owner-a');
    assert.equal(createRes.status, 201, 'Owner tạo match thành công với mã 201');
    assert.equal(createRes.body.success, true);
    const matchId = createRes.body.match_id;
    assert.ok(matchId, 'Nhận được match_id');

    // Lưu 3 câu hỏi
    const sampleQuestions = [
      { id: 1, text: 'Lần đầu gặp ở đâu?', options: ['Quán trà', 'Công viên', 'Thư viện'], image_path: 'emo-heart/img1.jpg' },
      { id: 2, text: 'Ai ngỏ lời trước?', options: ['Minh', 'Lan', 'Cả hai cùng lúc'], image_path: null },
      { id: 3, text: 'Chuyến đi xa đầu tiên?', options: ['Đà Lạt', 'Hà Giang', 'Vũng Tàu'], image_path: 'emo-heart/img2.jpg' }
    ];
    const saveQRes = await apiCall('PUT', `/api/v1/events/matches/${matchId}/questions`, {
      questions: sampleQuestions
    }, 'token-owner-a');
    assert.equal(saveQRes.status, 200, 'Lưu câu hỏi thành công');
    assert.equal(saveQRes.body.questions_count, 3);

    // Reload draft
    const draftRes = await apiCall('GET', `/api/v1/events/matches/${matchId}/draft`, undefined, 'token-owner-a');
    assert.equal(draftRes.status, 200);
    assert.equal(draftRes.body.title, 'Kỷ niệm chúng mình');
    assert.equal(draftRes.body.questions.length, 3);
    assert.equal(draftRes.body.questions[0].text, 'Lần đầu gặp ở đâu?');
    console.log('  [PASS] Test 1: Owner tạo và reload Match draft thành công.');

    // --------------------------------------------------------------------------
    // Test 2: Recipient / foreign owner / anonymous không được ghi
    // --------------------------------------------------------------------------
    console.log('--- Test 2: Recipient/foreign owner/anonymous không được ghi ---');
    // Anonymous tạo match
    const anonRes = await apiCall('POST', '/api/v1/events/matches', { tag_uid: 'emo-heart' });
    assert.equal(anonRes.status, 401, 'Anonymous không được tạo match (401)');

    // Recipient tạo match
    const recipRes = await apiCall('POST', '/api/v1/events/matches', { tag_uid: 'emo-heart' }, 'token-recipient');
    assert.equal(recipRes.status, 403, 'Recipient bị từ chối tạo match (403)');

    // Foreign owner sửa câu hỏi của match này
    const foreignSave = await apiCall('PUT', `/api/v1/events/matches/${matchId}/questions`, {
      questions: sampleQuestions
    }, 'token-owner-b');
    assert.equal(foreignSave.status, 403, 'Foreign owner bị chặn sửa câu hỏi (403)');

    // Recipient xem draft
    const recipDraft = await apiCall('GET', `/api/v1/events/matches/${matchId}/draft`, undefined, 'token-recipient');
    assert.equal(recipDraft.status, 403, 'Recipient không được xem draft (403)');
    console.log('  [PASS] Test 2: Recipient, foreign owner và anonymous bị chặn ghi chính xác.');

    // --------------------------------------------------------------------------
    // Test 3: Begin khóa câu hỏi & sinh token mời
    // --------------------------------------------------------------------------
    console.log('--- Test 3: Begin khóa câu hỏi ---');
    const beginRes = await apiCall('POST', `/api/v1/events/matches/${matchId}/begin`, {}, 'token-owner-a');
    assert.equal(beginRes.status, 200);
    assert.equal(beginRes.body.status, 'active');
    const inviteToken = beginRes.body.invite_token;
    assert.ok(inviteToken, 'Owner nhận được invite_token khi begin');

    // Thử sửa câu hỏi sau khi đã begin -> Phải bị từ chối
    const editAfterBegin = await apiCall('PUT', `/api/v1/events/matches/${matchId}/questions`, {
      questions: sampleQuestions
    }, 'token-owner-a');
    assert.equal(editAfterBegin.status, 422, 'Sửa câu hỏi sau khi begin bị từ chối với 422');
    console.log('  [PASS] Test 3: Begin khóa câu hỏi và sinh invite token an toàn.');

    // --------------------------------------------------------------------------
    // Test 4: Partner dùng invite token
    // --------------------------------------------------------------------------
    console.log('--- Test 4: Partner dùng invite token ---');
    // Partner lưu tiến độ nháp câu 1 và 2 (anonymous kèm invite_token)
    const partnerProgress = await apiCall('POST', `/api/v1/events/matches/${matchId}/progress`, {
      answers: [0, 1],
      invite_token: inviteToken
    });
    assert.equal(partnerProgress.status, 200, 'Partner lưu tiến độ nháp thành công');
    assert.equal(partnerProgress.body.role, 'partner');

    // Partner dùng sai token -> 403
    const badTokenRes = await apiCall('POST', `/api/v1/events/matches/${matchId}/progress`, {
      answers: [0, 1],
      invite_token: 'fake-invalid-token'
    });
    assert.equal(badTokenRes.status, 403, 'Sai invite token bị từ chối với 403');
    console.log('  [PASS] Test 4: Partner dùng invite token hợp lệ được chấp nhận, sai bị từ chối.');

    // --------------------------------------------------------------------------
    // Test 5: Mỗi người chỉ thấy answer của mình trước reveal
    // --------------------------------------------------------------------------
    console.log('--- Test 5: Mỗi người chỉ thấy answer của mình trước reveal ---');
    // Owner nộp bài chính thức: [0, 1, 0]
    const ownerSubmit = await apiCall('POST', `/api/v1/events/matches/${matchId}/submit`, {
      answers: [0, 1, 0]
    }, 'token-owner-a');
    assert.equal(ownerSubmit.status, 200);
    assert.equal(ownerSubmit.body.submitted, true);
    assert.equal(ownerSubmit.body.both_submitted, false, 'Chưa cả hai nộp bài');
    assert.equal(ownerSubmit.body.score, null, 'Score chưa xuất hiện trước reveal');

    // Owner xem lại lượt chơi
    const ownerView = await apiCall('GET', `/api/v1/events/matches/${matchId}/view`, undefined, 'token-owner-a');
    assert.equal(ownerView.status, 200);
    assert.equal(ownerView.body.my_submitted, true);
    assert.deepEqual(ownerView.body.my_answers, [0, 1, 0]);
    assert.equal(ownerView.body.other_submitted, false);
    assert.equal(ownerView.body.other_answers, null, 'Không lộ đáp án partner');
    assert.equal(ownerView.body.score, null);

    // Partner xem lượt chơi bằng invite token
    const partnerView = await apiCall('GET', `/api/v1/events/matches/${matchId}/view?invite=${inviteToken}`);
    assert.equal(partnerView.status, 200);
    assert.equal(partnerView.body.my_role, 'partner');
    assert.equal(partnerView.body.my_submitted, false);
    assert.equal(partnerView.body.other_submitted, true);
    assert.equal(partnerView.body.other_answers, null, 'Không lộ đáp án owner cho partner trước khi submit');
    assert.equal(partnerView.body.score, null);
    console.log('  [PASS] Test 5: Bí mật đáp án được bảo toàn tuyệt đối trước khi cả hai nộp bài.');

    // --------------------------------------------------------------------------
    // Test 6: Cả hai submit thì score đúng
    // --------------------------------------------------------------------------
    console.log('--- Test 6: Cả hai submit thì score đúng ---');
    // Partner nộp [0, 2, 0]:
    // Câu 1: Owner=0, Partner=0 -> Trùng (1)
    // Câu 2: Owner=1, Partner=2 -> Khác
    // Câu 3: Owner=0, Partner=0 -> Trùng (1)
    // Tổng số câu trùng = 2 / 3
    const partnerSubmit = await apiCall('POST', `/api/v1/events/matches/${matchId}/submit`, {
      answers: [0, 2, 0],
      invite_token: inviteToken
    });
    assert.equal(partnerSubmit.status, 200);
    assert.equal(partnerSubmit.body.both_submitted, true);
    assert.equal(partnerSubmit.body.score, 2, 'Tính đúng 2 câu trùng khớp');

    // Sau khi cả hai hoàn thành, get view trả về đáp án đối phương và điểm số
    const finalOwnerView = await apiCall('GET', `/api/v1/events/matches/${matchId}/view`, undefined, 'token-owner-a');
    assert.equal(finalOwnerView.body.both_submitted, true);
    assert.equal(finalOwnerView.body.score, 2);
    assert.deepEqual(finalOwnerView.body.other_answers, [0, 2, 0]);

    const finalPartnerView = await apiCall('GET', `/api/v1/events/matches/${matchId}/view?invite=${inviteToken}`);
    assert.equal(finalPartnerView.body.both_submitted, true);
    assert.equal(finalPartnerView.body.score, 2);
    assert.deepEqual(finalPartnerView.body.other_answers, [0, 1, 0]);
    console.log('  [PASS] Test 6: Cả hai submit thì score tính chính xác (2/3) và reveal cho cả hai bên.');

    // --------------------------------------------------------------------------
    // Test 7: Submit lặp lại không làm thay đổi answer (Lũy đẳng)
    // --------------------------------------------------------------------------
    console.log('--- Test 7: Submit lặp lại không làm thay đổi answer ---');
    const repeatSubmit = await apiCall('POST', `/api/v1/events/matches/${matchId}/submit`, {
      answers: [2, 2, 2], // cố tình nộp bộ khác
      invite_token: inviteToken
    });
    assert.equal(repeatSubmit.status, 200);
    assert.equal(repeatSubmit.body.already_submitted, true);

    // Kiểm tra view vẫn giữ nguyên điểm số 2 và đáp án ban đầu
    const checkView = await apiCall('GET', `/api/v1/events/matches/${matchId}/view?invite=${inviteToken}`);
    assert.equal(checkView.body.score, 2);
    assert.deepEqual(checkView.body.my_answers, [0, 2, 0]);
    console.log('  [PASS] Test 7: Submit lặp lại xử lý lũy đẳng, không thay đổi đáp án ban đầu.');

    // --------------------------------------------------------------------------
    // Test 8: Sai answer index hoặc thiếu câu bị từ chối
    // --------------------------------------------------------------------------
    console.log('--- Test 8: Sai answer index bị từ chối ---');
    // Tạo 1 match mới để test validation
    const m2 = await apiCall('POST', '/api/v1/events/matches', { tag_uid: 'emo-heart' }, 'token-owner-a');
    await apiCall('PUT', `/api/v1/events/matches/${m2.body.match_id}/questions`, { questions: sampleQuestions }, 'token-owner-a');
    await apiCall('POST', `/api/v1/events/matches/${m2.body.match_id}/begin`, {}, 'token-owner-a');

    // Index 99 ngoài phạm vi options
    const outOfBounds = await apiCall('POST', `/api/v1/events/matches/${m2.body.match_id}/submit`, {
      answers: [0, 99, 0]
    }, 'token-owner-a');
    assert.equal(outOfBounds.status, 422, 'Option index 99 bị từ chối với 422');

    // Thiếu câu hỏi (chỉ nộp 2/3 câu)
    const incomplete = await apiCall('POST', `/api/v1/events/matches/${m2.body.match_id}/submit`, {
      answers: [0, 1]
    }, 'token-owner-a');
    assert.equal(incomplete.status, 422, 'Thiếu đáp án bị từ chối với 422');
    console.log('  [PASS] Test 8: Index lựa chọn sai hoặc thiếu đáp án bị từ chối chính xác.');

    // --------------------------------------------------------------------------
    // Test 9: House private mặc định & bảo vệ draft riêng tư
    // --------------------------------------------------------------------------
    console.log('--- Test 9: House private mặc định ---');
    const roomsPayload = [
      {
        id: 'beginning',
        name: 'Ngày bắt đầu',
        memories: [{ id: 'item-1', photo_path: 'emo-heart/room1.jpg', note: 'Ngày đầu tiên bên nhau', title: 'Hẹn hò' }]
      },
      {
        id: 'first',
        name: 'Lần đầu của đôi mình',
        memories: []
      }
    ];

    const saveHouse = await apiCall('PUT', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Nhà của Minh & Lan',
      theme: 'rose_romance',
      rooms: roomsPayload
    }, 'token-owner-a');
    assert.equal(saveHouse.status, 200, 'Lưu nháp House thành công');

    // Owner thấy draft
    const draftHouse = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-a');
    assert.equal(draftHouse.status, 200);
    assert.equal(draftHouse.body.is_published, false, 'Nhà mới tạo ở chế độ private mặc định');
    assert.equal(draftHouse.body.title, 'Nhà của Minh & Lan');

    // Recipient hoặc Anonymous cố đọc draft -> BỊ CHẶN 401 hoặc 403
    const draftAnon = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft');
    assert.equal(draftAnon.status, 401, 'Anonymous không có quyền đọc draft (401)');

    const draftOther = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-b');
    assert.equal(draftOther.status, 403, 'Recipient/foreign owner không có quyền đọc draft (403)');

    // Chưa publish thì route public theo tag trả 403 (chế độ riêng tư)
    const pubTagBefore = await apiCall('GET', '/api/v1/events/houses/tag/emo-heart');
    assert.equal(pubTagBefore.status, 403, 'Chưa publish thì route public theo tag trả 403 (chế độ riêng tư)');
    console.log('  [PASS] Test 9: Ngôi nhà kỷ niệm ở chế độ private mặc định, bảo vệ draft riêng tư.');

    // --------------------------------------------------------------------------
    // Test 10: Publish trả snapshot public đã lọc (cả share_id và tag_uid)
    // --------------------------------------------------------------------------
    console.log('--- Test 10: Publish trả snapshot public đã lọc ---');
    const pubRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/publish', {}, 'token-owner-a');
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.is_published, true);
    const shareId = pubRes.body.share_id;
    assert.ok(shareId, 'Nhận được share_id');

    // Public xem nhà qua share_id
    const pubView = await apiCall('GET', `/api/v1/events/houses/share/${shareId}`);
    assert.equal(pubView.status, 200, 'Người xem công khai mở được nhà đã xuất bản qua share_id');
    assert.equal(pubView.body.title, 'Nhà của Minh & Lan');
    assert.equal(pubView.body.theme, 'rose_romance');
    assert.ok(Array.isArray(pubView.body.rooms));
    assert.equal(pubView.body.rooms[0].memories[0].note, 'Ngày đầu tiên bên nhau');

    // Public / Recipient xem nhà qua tag_uid (luồng quét NFC)
    const pubTagView = await apiCall('GET', '/api/v1/events/houses/tag/emo-heart');
    assert.equal(pubTagView.status, 200, 'Người xem công khai / quét NFC mở được nhà đã xuất bản qua tag_uid');
    assert.equal(pubTagView.body.title, 'Nhà của Minh & Lan');
    assert.equal(pubTagView.body.theme, 'rose_romance');
    assert.ok(Array.isArray(pubTagView.body.rooms));
    assert.equal(pubTagView.body.rooms[0].memories[0].note, 'Ngày đầu tiên bên nhau');
    console.log('  [PASS] Test 10: Xuất bản tạo share_id và hiển thị snapshot public chuẩn xác cho cả share_id và tag_uid.');

    // --------------------------------------------------------------------------
    // Test 11: Unpublish / revoke chặn link cũ và chặn tag_uid public
    // --------------------------------------------------------------------------
    console.log('--- Test 11: Unpublish / revoke chặn link cũ ---');
    // Unpublish
    const unpubRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/unpublish', {}, 'token-owner-a');
    assert.equal(unpubRes.status, 200);

    // Link cũ xem lúc này phải bị 403 (private)
    const blockedView1 = await apiCall('GET', `/api/v1/events/houses/share/${shareId}`);
    assert.equal(blockedView1.status, 403, 'Unpublish chặn truy cập link công khai (403)');

    // Route public tag lúc này cũng bị 403
    const blockedTag1 = await apiCall('GET', '/api/v1/events/houses/tag/emo-heart');
    assert.equal(blockedTag1.status, 403, 'Unpublish chặn truy cập route public tag (403)');

    // Revoke share
    const revokeRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/revoke', {}, 'token-owner-a');
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.body.revoked, true);

    // Link cũ sau revoke bị 404 (liên kết bị thu hồi vĩnh viễn)
    const blockedView2 = await apiCall('GET', `/api/v1/events/houses/share/${shareId}`);
    assert.equal(blockedView2.status, 404, 'Revoke chặn vĩnh viễn share_id cũ với 404');

    // Route public tag sau revoke cũng bị 403 (vì đang unpublished)
    const blockedTag2 = await apiCall('GET', '/api/v1/events/houses/tag/emo-heart');
    assert.equal(blockedTag2.status, 403, 'Revoke/unpublish làm tag snapshot không còn truy cập được (403)');
    console.log('  [PASS] Test 11: Unpublish và revoke thu hồi chia sẻ an toàn cho cả share_id và tag_uid.');

    // --------------------------------------------------------------------------
    // Test 12: Public không thấy tag_uid, PIN, letter hoặc NFC gallery
    // --------------------------------------------------------------------------
    console.log('--- Test 12: Public không thấy dữ liệu nhạy cảm NFC ---');
    // Publish lại để có share link mới
    const pubRes2 = await apiCall('POST', '/api/v1/memories/emo-heart/house/publish', {}, 'token-owner-a');
    const shareId2 = pubRes2.body.share_id;
    const pubView2 = await apiCall('GET', `/api/v1/events/houses/share/${shareId2}`);

    assert.equal(pubView2.status, 200);
    assert.equal(pubView2.body.tag_uid, undefined, 'Không được trả về trường tag_uid của chip');
    assert.equal(pubView2.body.memory_id, undefined, 'Không được trả về memory_id');
    assert.equal(pubView2.body.pin_hash, undefined, 'Không được trả về pin_hash');
    assert.equal(pubView2.body.letter, undefined, 'Không được trả về letter');
    assert.equal(pubView2.body.media_gallery, undefined, 'Không được trả về media_gallery NFC');
    const pubStr = JSON.stringify(pubView2.body);
    assert.ok(!pubStr.includes('Top secret love letter'), 'Không được rò rỉ thư riêng (letter)');
    assert.ok(!pubStr.includes('$2a$10$'), 'Không được rò rỉ hash PIN');
    console.log('  [PASS] Test 12: Dữ liệu nhạy cảm NFC (letter, PIN, tag_uid) được niêm phong hoàn toàn.');

    // --------------------------------------------------------------------------
    // Test 13: Foreign image path bị từ chối
    // --------------------------------------------------------------------------
    console.log('--- Test 13: Foreign image path bị từ chối ---');
    // Thử thêm kỷ niệm có ảnh của chip khác
    const badRooms = [
      {
        id: 'beginning',
        name: 'Ngày bắt đầu',
        memories: [{ id: 'bad-1', photo_path: 'other-chip/private.jpg', note: 'Hack' }]
      }
    ];
    const houseRev = (await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-a')).body.draft_revision || 0;
    const foreignPhotoRes = await apiCall('PUT', '/api/v1/memories/emo-heart/house/draft', {
      rooms: badRooms,
      expected_revision: houseRev
    }, 'token-owner-a');
    assert.equal(foreignPhotoRes.status, 422, 'Đường dẫn ảnh thuộc namespace chip khác bị từ chối (422)');

    // Tương tự trong match question (dùng draft match m3 mới)
    const m3 = await apiCall('POST', '/api/v1/events/matches', { tag_uid: 'emo-heart' }, 'token-owner-a');
    const badMatchQ = await apiCall('PUT', `/api/v1/events/matches/${m3.body.match_id}/questions`, {
      questions: [
        { id: 1, text: 'Q1', options: ['A', 'B'], image_path: 'other-chip/photo.jpg' },
        { id: 2, text: 'Q2', options: ['A', 'B'], image_path: null },
        { id: 3, text: 'Q3', options: ['A', 'B'], image_path: null }
      ]
    }, 'token-owner-a');
    assert.equal(badMatchQ.status, 422, 'Ảnh câu hỏi thuộc chip khác bị từ chối (422)');
    assert.ok(badMatchQ.body.error.message.includes('không hợp lệ hoặc không tồn tại trong bucket emoria-event-media'));
    console.log('  [PASS] Test 13: Ảnh ngoại lai (foreign image path) bị chặn ở cả Match và House.');

    // --------------------------------------------------------------------------
    // Test 14: Owner đổi chủ thì quyền cũ không còn hiệu lực
    // --------------------------------------------------------------------------
    console.log('--- Test 14: Owner đổi chủ thì quyền cũ không còn hiệu lực ---');
    // Giả lập chuyển chủ sở hữu kỷ vật emo-heart sang User B
    state.memories['emo-heart'].owner_id = 'user-owner-b';

    // Chủ cũ (User A) thử xem draft House
    const oldOwnerDraft = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-a');
    assert.equal(oldOwnerDraft.status, 403, 'Chủ cũ bị từ chối xem draft House sau khi đổi chủ (403)');

    // Chủ cũ thử tạo match mới
    const oldOwnerCreate = await apiCall('POST', '/api/v1/events/matches', { tag_uid: 'emo-heart' }, 'token-owner-a');
    assert.equal(oldOwnerCreate.status, 403, 'Chủ cũ bị từ chối tạo Match mới (403)');

    // Chủ mới (User B) truy cập thành công
    const newOwnerDraft = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-b');
    assert.equal(newOwnerDraft.status, 200, 'Chủ mới truy cập draft House thành công');
    console.log('  [PASS] Test 14: Đổi chủ lập tức thu hồi toàn bộ quyền của chủ cũ theo dynamic RLS.');

    // --------------------------------------------------------------------------
    // Test 15: Kiểm tra service frontend (src/services/eventService.js)
    // --------------------------------------------------------------------------
    console.log('--- Test 15: Kiểm tra src/services/eventService.js ---');
    assert.equal(typeof eventService.createMatch, 'function');
    assert.equal(typeof eventService.saveMatchQuestions, 'function');
    assert.equal(typeof eventService.beginMatch, 'function');
    assert.equal(typeof eventService.saveMatchProgress, 'function');
    assert.equal(typeof eventService.submitMatch, 'function');
    assert.equal(typeof eventService.getMatchView, 'function');
    assert.equal(typeof eventService.listMatches, 'function');
    assert.equal(typeof eventService.getHouseDraft, 'function');
    assert.equal(typeof eventService.saveHouseDraft, 'function');
    assert.equal(typeof eventService.publishHouse, 'function');
    assert.equal(typeof eventService.unpublishHouse, 'function');
    assert.equal(typeof eventService.revokeHouseShare, 'function');
    assert.equal(typeof eventService.getPublicHouse, 'function');
    assert.equal(typeof eventService.getPublicHouseByTag, 'function');
    assert.equal(eventService.DEFAULT_MATCH_QUESTIONS.length, 7);
    assert.equal(eventService.HOUSE_ROOMS_SPEC.length, 5);

    // Kiểm tra không dùng localStorage trong file eventService.js
    const eventServiceCode = fs.readFileSync('src/services/eventService.js', 'utf8');
    assert.ok(!eventServiceCode.includes('localStorage'), 'eventService tuyệt đối không dùng localStorage');
    assert.ok(!eventServiceCode.includes('sessionStorage'), 'eventService tuyệt đối không dùng sessionStorage');
    console.log('  [PASS] Test 15: Service frontend export đầy đủ 12 hàm, không leak storage.');

    // --------------------------------------------------------------------------
    // Test 16: Decimal / out-of-range answers rejected
    // --------------------------------------------------------------------------
    console.log('--- Test 16: Decimal & non-integer answers bị từ chối ---');
    const mDecimal = await apiCall('POST', '/api/v1/events/matches', { tag_uid: 'emo-heart' }, 'token-owner-b');
    await apiCall('PUT', `/api/v1/events/matches/${mDecimal.body.match_id}/questions`, { questions: sampleQuestions }, 'token-owner-b');
    await apiCall('POST', `/api/v1/events/matches/${mDecimal.body.match_id}/begin`, {}, 'token-owner-b');

    // Decimal 1.5 in submit
    const decSubmit = await apiCall('POST', `/api/v1/events/matches/${mDecimal.body.match_id}/submit`, {
      answers: [0, 1.5, 0]
    }, 'token-owner-b');
    assert.equal(decSubmit.status, 422, 'Decimal 1.5 phải bị từ chối với 422');

    // Negative -0.5 in submit
    const negSubmit = await apiCall('POST', `/api/v1/events/matches/${mDecimal.body.match_id}/submit`, {
      answers: [-0.5, 0, 0]
    }, 'token-owner-b');
    assert.equal(negSubmit.status, 422, 'Số âm -0.5 phải bị từ chối với 422');

    // Decimal in progress
    const decProg = await apiCall('POST', `/api/v1/events/matches/${mDecimal.body.match_id}/progress`, {
      answers: [0, 1.5, null]
    }, 'token-owner-b');
    assert.equal(decProg.status, 422, 'Tiến độ decimal 1.5 phải bị từ chối với 422');
    console.log('  [PASS] Test 16: Decimal (1.5, -0.5) và giá trị không nguyên bị chặn với status 422.');

    // --------------------------------------------------------------------------
    // Test 17: Signed image URL & raw path stripping
    // --------------------------------------------------------------------------
    console.log('--- Test 17: Signed image URL & raw path stripping ---');
    const questionsWithImage = [
      { id: 1, text: 'Q1', options: ['A', 'B'], image_path: 'emo-heart/img1.jpg' },
      { id: 2, text: 'Q2', options: ['C', 'D'], image_path: null },
      { id: 3, text: 'Q3', options: ['E', 'F'], image_path: 'emo-heart/img2.jpg' }
    ];
    const mImg = await apiCall('POST', '/api/v1/events/matches', { tag_uid: 'emo-heart' }, 'token-owner-b');
    await apiCall('PUT', `/api/v1/events/matches/${mImg.body.match_id}/questions`, { questions: questionsWithImage }, 'token-owner-b');

    const draftImg = await apiCall('GET', `/api/v1/events/matches/${mImg.body.match_id}/draft`, undefined, 'token-owner-b');
    assert.equal(draftImg.status, 200);
    assert.ok(draftImg.body.questions[0].image_url, 'image_url phải có giá trị signed');
    assert.equal(draftImg.body.questions[0].image_path, 'emo-heart/img1.jpg', 'owner draft phải giữ raw image_path để sửa và autosave không mất ảnh');
    assert.ok(draftImg.body.questions[0].image_url.includes('token=verified-mock-signer-token'), 'image_url phải đến từ signer thật');

    // Begin match và kiểm tra view của partner: raw image_path PHẢI được xóa sạch khỏi public/partner
    const beginImg = await apiCall('POST', `/api/v1/events/matches/${mImg.body.match_id}/begin`, {}, 'token-owner-b');
    assert.equal(beginImg.status, 200);
    const viewPartner = await apiCall('GET', `/api/v1/events/matches/${mImg.body.match_id}/view?invite=${beginImg.body.invite_token}`);
    assert.equal(viewPartner.status, 200);
    assert.equal(viewPartner.body.questions[0].image_path, undefined, 'raw image_path phải được xóa sạch khỏi view partner/public');
    assert.ok(viewPartner.body.questions[0].image_url, 'partner view nhận signed image_url');

    // Publish house to test public photo signed URL
    const rePub = await apiCall('POST', '/api/v1/memories/emo-heart/house/publish', {}, 'token-owner-b');
    assert.equal(rePub.status, 200);
    const pubShare = await apiCall('GET', `/api/v1/events/houses/share/${rePub.body.share_id}`);
    assert.equal(pubShare.status, 200);
    const pubRoom1 = pubShare.body.rooms.find(r => r.id === 'beginning');
    assert.ok(pubRoom1.memories[0].photo_url, 'photo_url phải có giá trị signed');
    assert.equal(pubRoom1.memories[0].photo_path, undefined, 'raw photo_path phải được xóa sạch khỏi snapshot public');
    assert.ok(pubRoom1.memories[0].photo_url.includes('token=verified-mock-signer-token'), 'photo_url công khai phải đến từ signer thật');

    // Test missing SUPABASE_SERVICE_ROLE_KEY: không trả token giả, bỏ ảnh với null
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const draftNoKey = await apiCall('GET', `/api/v1/events/matches/${mImg.body.match_id}/draft`, undefined, 'token-owner-b');
      assert.equal(draftNoKey.status, 200);
      assert.equal(draftNoKey.body.questions[0].image_url, null, 'Khi thiếu key, image_url phải là null, không trả token giả');
      assert.equal(draftNoKey.body.questions[0].image_path, 'emo-heart/img1.jpg', 'Raw image_path trong draft chủ nhà vẫn giữ nguyên để không mất liên kết');

      const signNoKey = await apiCall('POST', '/api/v1/events/media/sign', {
        paths: ['emo-heart/img1.jpg']
      }, 'token-owner-b');
      assert.equal(signNoKey.status, 500, 'Khi thiếu key, /events/media/sign phải trả lỗi cấu hình 500');
      const errNoKeyMsg = signNoKey.body.error?.message || signNoKey.body.error || '';
      assert.ok(errNoKeyMsg.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Phải thông báo rõ thiếu key');
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
    console.log('  [PASS] Test 17: Ảnh private được ký signed URL có thời hạn, không dùng token giả khi thiếu key.');

    // --------------------------------------------------------------------------
    // Test 18: POST /events/media/sign endpoint
    // --------------------------------------------------------------------------
    console.log('--- Test 18: Media signing endpoint an toàn & xác minh quyền sở hữu ---');
    // Owner b ký path thuộc memory của mình (emo-heart) -> Thành công 200
    const signOk = await apiCall('POST', '/api/v1/events/media/sign', {
      paths: ['emo-heart/img1.jpg']
    }, 'token-owner-b');
    assert.equal(signOk.status, 200);
    assert.ok(signOk.body.signed['emo-heart/img1.jpg'].includes('token=verified-mock-signer-token'), 'Signed URL phải do signer xác nhận');

    // Owner b cố gắng ký path hợp lệ nhưng thuộc memory của Owner a (emo-foreign) -> Phải bị từ chối 403 Forbidden!
    const signForeign = await apiCall('POST', '/api/v1/events/media/sign', {
      paths: ['emo-foreign/pic1.jpg']
    }, 'token-owner-b');
    assert.equal(signForeign.status, 403, 'Path thuộc tag của owner khác phải bị từ chối 403');
    const errForeignMsg = signForeign.body.error?.message || signForeign.body.error || '';
    assert.ok(errForeignMsg.includes('Từ chối quyền'), 'Thông báo từ chối quyền rõ ràng');

    // Path traversal -> 400
    const signTraversal = await apiCall('POST', '/api/v1/events/media/sign', {
      paths: ['../etc/passwd']
    }, 'token-owner-b');
    assert.equal(signTraversal.status, 400, 'Path traversal phải bị từ chối 400');

    // Empty paths -> 400
    const signEmpty = await apiCall('POST', '/api/v1/events/media/sign', {
      paths: []
    }, 'token-owner-b');
    assert.equal(signEmpty.status, 400, 'Empty paths phải bị từ chối 400');
    console.log('  [PASS] Test 18: /events/media/sign xác minh quyền sở hữu, chặn path của owner khác và chặn traversal.');

    // --------------------------------------------------------------------------
    // Test 19: Kiểm tra không leak storage trong UI components
    // --------------------------------------------------------------------------
    console.log('--- Test 19: UI Component Security & Clean State ---');
    const matchStudioCode = fs.readFileSync('src/components/MemoryMatchStudio.jsx', 'utf8');
    assert.ok(!matchStudioCode.includes('localStorage'), 'MemoryMatchStudio không được dùng localStorage');
    assert.ok(!matchStudioCode.includes('sessionStorage'), 'MemoryMatchStudio không được dùng sessionStorage');
    assert.ok(matchStudioCode.includes('role="radiogroup"'), 'MemoryMatchStudio có ARIA radiogroup');
    assert.ok(matchStudioCode.includes('role="radio"'), 'MemoryMatchStudio có ARIA radio');

    const houseStudioCode = fs.readFileSync('src/components/MemoryHouseStudio.jsx', 'utf8');
    assert.ok(!houseStudioCode.includes('localStorage'), 'MemoryHouseStudio không được dùng localStorage');
    assert.ok(!houseStudioCode.includes('sessionStorage'), 'MemoryHouseStudio không được dùng sessionStorage');
    const house3DCode = fs.readFileSync('src/components/MemoryHouse3D.jsx', 'utf8');
    assert.ok(house3DCode.includes('aria-label="Chọn phòng trong nhà 3D"') && house3DCode.includes('aria-pressed={r.id === room?.id}'), 'Room selector exposes its label and selected state');
    console.log('  [PASS] Test 19: UI Components sạch, không lưu storage riêng tư, tuân thủ accessibility.');

    // --------------------------------------------------------------------------
    // Test 20: Kiểm tra JSON không hợp lệ trả lỗi 400 rõ ràng
    // --------------------------------------------------------------------------
    console.log('--- Test 20: Kiểm tra JSON không hợp lệ trả lỗi 400 rõ ràng ---');
    const badJsonEndpoints = [
      { method: 'POST', path: '/api/v1/events/matches', token: 'token-owner-a' },
      { method: 'PUT', path: `/api/v1/events/matches/${createRes.body.match_id}/questions`, token: 'token-owner-a' },
      { method: 'POST', path: `/api/v1/events/matches/${createRes.body.match_id}/begin`, token: 'token-owner-a' },
      { method: 'POST', path: '/api/v1/memories/emo-heart/house/draft', token: 'token-owner-a' },
      { method: 'PUT', path: '/api/v1/memories/emo-heart/house/draft', token: 'token-owner-a' },
      { method: 'POST', path: '/api/v1/memories/emo-heart/house/publish', token: 'token-owner-a' }
    ];

    for (const ep of badJsonEndpoints) {
      // 1. Gửi chuỗi JSON hỏng (malformed syntax)
      const resBadSyntax = await apiCall(ep.method, ep.path, undefined, ep.token, {
        raw: '{invalid json...',
        contentType: 'application/json'
      });
      assert.equal(resBadSyntax.status, 400, `${ep.method} ${ep.path} phải trả về 400 khi JSON sai cú pháp`);
      assert.equal(resBadSyntax.body?.error?.message, 'Dữ liệu yêu cầu không hợp lệ.', 'Thông báo lỗi phải là: Dữ liệu yêu cầu không hợp lệ.');

      // 2. Gửi mảng JSON thay vì object
      const resArray = await apiCall(ep.method, ep.path, undefined, ep.token, {
        raw: '[1, 2, 3]',
        contentType: 'application/json'
      });
      assert.equal(resArray.status, 400, `${ep.method} ${ep.path} phải trả về 400 khi body là array`);
      assert.equal(resArray.body?.error?.message, 'Dữ liệu yêu cầu không hợp lệ.');
    }
    console.log('  [PASS] Test 20: Toàn bộ route event trả 400 "Dữ liệu yêu cầu không hợp lệ." khi JSON sai cú pháp.');

    // --------------------------------------------------------------------------
    // Test 21: Kiểm tra luồng Guest & NFC public House ---
    // --------------------------------------------------------------------------
    console.log('--- Test 21: Kiểm tra luồng Guest & NFC public House ---');
    // Guest truy vấn draft bằng tag_uid bị chặn 401
    const guestDraftRes = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, null);
    assert.equal(guestDraftRes.status, 401, 'Guest không được phép gọi endpoint draft');

    // Lưu đầy đủ 5 phòng và xuất bản bởi chủ hiện tại (user-owner-b)
    const all5Rooms = [
      { id: 'beginning', name: 'Ngày bắt đầu', memories: [{ id: 'm1', photo_path: 'emo-heart/room1.jpg', note: 'Khởi đầu' }] },
      { id: 'first', name: 'Lần đầu của đôi mình', memories: [] },
      { id: 'little-things', name: 'Điều nhỏ xíu', memories: [] },
      { id: 'memories', name: 'Miền ký ức', memories: [] },
      { id: 'next-chapter', name: 'Chương tiếp theo', memories: [] }
    ];
    const curHouseDraft = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-b');
    await apiCall('PUT', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Nhà Đầy Đủ 5 Phòng',
      theme: 'warm_gold',
      rooms: all5Rooms,
      expected_revision: curHouseDraft.body?.draft_revision
    }, 'token-owner-b');
    const pubBRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/publish', {}, 'token-owner-b');
    assert.equal(pubBRes.status, 200, 'Owner B xuất bản thành công');

    const guestPublishedRes = await apiCall('GET', '/api/v1/events/houses/tag/emo-heart', undefined, null);
    assert.equal(guestPublishedRes.status, 200, 'Guest đọc được published snapshot khi đã xuất bản');
    assert.ok(Array.isArray(guestPublishedRes.body.rooms), 'Có danh sách rooms trong snapshot');
    assert.equal(guestPublishedRes.body.rooms.length, 5, 'Snapshot chứa đủ 5 phòng');
    assert.equal(guestPublishedRes.body.draft, undefined, 'Không lộ draft riêng tư');
    assert.equal(guestPublishedRes.body.pin_hash, undefined, 'Không lộ pin_hash');
    assert.equal(guestPublishedRes.body.letter, undefined, 'Không lộ thư tay riêng tư');
    console.log('  [PASS] Test 21: Guest chỉ được xem snapshot đã publish qua tag_uid, không lộ draft hay thông tin NFC.');

    // --------------------------------------------------------------------------
    // Test 22: Kiểm tra Navigation & Live Preview UI Code Structure
    // --------------------------------------------------------------------------
    console.log('--- Test 22: Navigation & Live Preview UI Code Structure ---');
    assert.ok(matchStudioCode.includes('Trang chủ'), 'Match Studio có nút Trang chủ');
    assert.ok(matchStudioCode.includes('Quay lại kỷ vật'), 'Match Studio có nút Quay lại kỷ vật');
    assert.ok(matchStudioCode.includes('onClick={handleSwitchToHouse}') && matchStudioCode.includes('<span>House Studio</span>'), 'Match Studio keeps the House navigation handler and visible label');
    for (const code of [matchStudioCode, houseStudioCode]) {
      assert.ok(code.includes('role="group" aria-label="Chuyển đổi Studio"') && code.includes('aria-current="page"'), 'Studio navigation exposes its group and current page');
      assert.ok(!code.includes('role="tablist"') && !code.includes('role="tab"'), 'View navigation uses native buttons rather than an incomplete tab pattern');
    }
    assert.ok(houseStudioCode.includes('onClick={handleSwitchToMatch}') && houseStudioCode.includes('<span>Match Studio</span>'), 'House Studio keeps the requested Match navigation action');

    assert.ok(houseStudioCode.includes('Quay lại kỷ vật'), 'House keeps return navigation');
    assert.ok(!houseStudioCode.includes('LIVE PREVIEW'), 'Duplicate preview is removed');
    assert.ok(houseStudioCode.includes('Chưa có bức ảnh'), 'Empty room explains how to start');
    assert.ok(!houseStudioCode.includes('via.placeholder.com'), 'Không dùng ảnh placeholder giả');
    assert.ok(!houseStudioCode.includes('placeholder.png'), 'Không dùng ảnh placeholder giả');
    console.log('  [PASS] Test 22: House navigation is simplified and rooms keep a clear empty state.');

    // --------------------------------------------------------------------------
    // Test 23: Chặng A - Autosave, Draft Questions vs Begin Match, Reordering ---
    // --------------------------------------------------------------------------
    console.log('--- Test 23: Chặng A - Autosave, Draft Questions vs Begin Match, Reordering ---');
    // UI Code checks
    assert.ok(matchStudioCode.includes('autosaveState'), 'Match Studio có state autosaveState');
    assert.ok(matchStudioCode.includes('handleMoveQuestion'), 'Match Studio có handleMoveQuestion');
    assert.ok(matchStudioCode.includes('GripVertical'), 'Match Studio có icon kéo thả GripVertical');
    assert.ok(matchStudioCode.includes('ChevronUp'), 'Match Studio có nút di chuyển ChevronUp');
    assert.ok(matchStudioCode.includes('ChevronDown'), 'Match Studio có nút di chuyển ChevronDown');

    assert.ok(houseStudioCode.includes('autosaveState'), 'House Studio có state autosaveState');
    assert.ok(houseStudioCode.includes('mapOrderedRooms'), 'House Studio có hàm giữ thứ tự mapOrderedRooms');
    assert.ok(houseStudioCode.includes('handleMovePhoto'), 'House Studio có hàm đổi thứ tự ảnh handleMovePhoto');
    assert.ok(houseStudioCode.includes('GripVertical'), 'House Studio có icon kéo thả GripVertical');

    // Create match for testing draft questions
    const draftMatchRes = await apiCall('POST', '/api/v1/events/matches', {
      tag_uid: 'emo-heart',
      title: 'Thử thách draft test'
    }, 'token-owner-b');
    assert.equal(draftMatchRes.status, 201, 'Tạo match draft thành công');
    const dMatchId = draftMatchRes.body.match_id || draftMatchRes.body.id;

    // Lưu draft với 1 câu hỏi (chưa đủ 3 câu) -> Bắt buộc phải THÀNH CÔNG (200) để không chặn autosave khi đang gõ
    const save1QuestionRes = await apiCall('PUT', `/api/v1/events/matches/${dMatchId}/questions`, {
      questions: [
        { id: 1, text: 'Câu 1 duy nhất', options: ['A', 'B'] }
      ]
    }, 'token-owner-b');
    assert.equal(save1QuestionRes.status, 200, 'Lưu bản nháp với 1 câu hỏi phải được chấp nhận để autosave hoạt động');

    // Thử bắt đầu lượt chơi (begin) khi chỉ có 1 câu hỏi -> Phải BỊ TỪ CHỐI (422)
    const beginInvalidRes = await apiCall('POST', `/api/v1/events/matches/${dMatchId}/begin`, {}, 'token-owner-b');
    assert.equal(beginInvalidRes.status, 422, 'Bắt đầu match khi chỉ có 1 câu hỏi phải bị từ chối');
    assert.ok(beginInvalidRes.body?.error?.message?.includes('3 đến 7'), 'Báo lỗi rõ ràng phải có từ 3 đến 7 câu hỏi');

    // Lưu đầy đủ 3 câu hỏi hợp lệ
    const save3QuestionsRes = await apiCall('PUT', `/api/v1/events/matches/${dMatchId}/questions`, {
      expected_revision: save1QuestionRes.body?.draft_revision,
      questions: [
        { id: 1, text: 'Câu hỏi 1?', options: ['A', 'B'] },
        { id: 2, text: 'Câu hỏi 2?', options: ['A', 'B', 'C'] },
        { id: 3, text: 'Câu hỏi 3?', options: ['X', 'Y'] }
      ]
    }, 'token-owner-b');
    assert.equal(save3QuestionsRes.status, 200, 'Lưu 3 câu hỏi thành công');

    // Kích hoạt lượt chơi khi đã có 3 câu hỏi hợp lệ -> Phải THÀNH CÔNG (200)
    const beginValidRes = await apiCall('POST', `/api/v1/events/matches/${dMatchId}/begin`, {}, 'token-owner-b');
    assert.equal(beginValidRes.status, 200, 'Bắt đầu match thành công với 3 câu hỏi');
    assert.ok(beginValidRes.body?.invite_token, 'Trả về mã invite_token sau khi kích hoạt');
    console.log('  [PASS] Test 23: Chặng A đã kiểm chứng hoàn hảo autosave, phân tách draft/begin validation và reordering.');

    // --------------------------------------------------------------------------
    // Test 24: Chặng E & F - Rate Limiting Enforcement (HTTP 429 & Retry-After)
    // --------------------------------------------------------------------------
    console.log('--- Test 24: Chặng E & F - Rate Limiting Enforcement ---');
    // POST /events/reports có rate limit burst: 5 reqs / 60s per IP
    const reportPayload = {
      resource_type: 'match',
      resource_id: dMatchId,
      reason: 'spam',
      details: 'Spam report test'
    };

    // Gửi 5 requests liên tiếp -> Cả 5 phải thành công (201)
    for (let i = 1; i <= 5; i++) {
      const repRes = await apiCall('POST', '/api/v1/events/reports', reportPayload, null);
      assert.equal(repRes.status, 201, `Gửi báo cáo lần ${i} nằm trong giới hạn cho phép (201)`);
    }

    // Gửi request thứ 6 từ cùng IP -> Bắt buộc phải bị chặn với mã 429 và Retry-After header
    const repResBurst = await apiCall('POST', '/api/v1/events/reports', reportPayload, null);
    assert.equal(repResBurst.status, 429, 'Vượt quá burst limit phải trả về HTTP 429');
    assert.equal(repResBurst.body?.error?.code, 'RATE_LIMIT_EXCEEDED', 'Mã lỗi là RATE_LIMIT_EXCEEDED');
    assert.ok(repResBurst.headers['Retry-After'] || repResBurst.headers['retry-after'], 'Phải có header Retry-After');
    console.log('  [PASS] Test 24: Rate limiting enforcement chặn chính xác và trả về HTTP 429 kèm Retry-After.');

    // --------------------------------------------------------------------------
    // Test 25: Chặng E & F - Content Reporting & Admin Moderation Lifecycle
    // --------------------------------------------------------------------------
    console.log('--- Test 25: Content Reporting & Admin Moderation Lifecycle ---');
    // Xuất bản một ngôi nhà để test kiểm duyệt
    const housePubRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/publish', {}, 'token-owner-b');
    assert.equal(housePubRes.status, 200, 'Xuất bản ngôi nhà thành công');
    const houseShareId = housePubRes.body.share_id;
    assert.ok(houseShareId, 'Nhận được share_id');

    // Khách xem nhà bình thường (200 OK)
    const pubViewBefore = await apiCall('GET', `/api/v1/events/houses/share/${houseShareId}`, undefined, null);
    assert.equal(pubViewBefore.status, 200, 'Khách xem được ngôi nhà trước khi kiểm duyệt');

    // Khách gửi báo cáo vi phạm nội dung
    // Dùng IP khác để không bị vướng rate limit của Test 24
    const reportHouseRes = await apiCall('POST', '/api/v1/events/reports', {
      resource_type: 'house',
      resource_id: houseShareId,
      reason: 'inappropriate_content',
      details: 'Chứa hình ảnh chưa phù hợp'
    }, null, { headers: { 'x-forwarded-for': '192.168.1.50' } });
    assert.equal(reportHouseRes.status, 201, 'Gửi báo cáo thành công với status 201');
    const repId = reportHouseRes.body.report_id;
    assert.ok(repId, 'Nhận được report_id');

    // User thường (non-admin) cố tình truy cập hàng đợi báo cáo -> 403 Forbidden
    const nonAdminGetReports = await apiCall('GET', '/api/v1/admin/events/reports', undefined, 'token-owner-a');
    assert.equal(nonAdminGetReports.status, 403, 'Người dùng không phải admin bị từ chối xem báo cáo');

    // Admin truy cập hàng đợi báo cáo -> 200 OK
    const adminGetReports = await apiCall('GET', '/api/v1/admin/events/reports', undefined, 'token-admin');
    assert.equal(adminGetReports.status, 200, 'Admin lấy danh sách báo cáo thành công');
    assert.ok(Array.isArray(adminGetReports.body.reports), 'Trả về mảng danh sách báo cáo');
    const targetedReport = adminGetReports.body.reports.find(r => r.id === repId);
    assert.ok(targetedReport, 'Tìm thấy báo cáo vừa tạo trong danh sách của Admin');
    assert.equal(targetedReport.status, 'pending', 'Trạng thái ban đầu là pending');

    // Admin kiểm duyệt: Ẩn nội dung vi phạm (action: hide)
    const moderateHideRes = await apiCall('POST', '/api/v1/admin/events/moderate', {
      report_id: repId,
      action: 'hide',
      reason: 'Tạm ẩn theo phản ánh người dùng'
    }, 'token-admin');
    assert.equal(moderateHideRes.status, 200, 'Admin ẩn nội dung thành công');
    assert.equal(moderateHideRes.body.action, 'hide');

    // Khách truy cập lại ngôi nhà đã bị ẩn -> Bị từ chối với mã 403 / thông báo tạm ẩn
    const pubViewAfterHide = await apiCall('GET', `/api/v1/events/houses/share/${houseShareId}`, undefined, null);
    assert.equal(pubViewAfterHide.status, 403, 'Ngôi nhà đã bị tạm ẩn phải trả về 403');
    assert.ok(pubViewAfterHide.body?.error?.message?.includes('tạm ẩn'), 'Thông báo rõ ràng nội dung đã bị tạm ẩn');

    // Admin kiểm tra lại và khôi phục nội dung (action: restore)
    const moderateRestoreRes = await apiCall('POST', '/api/v1/admin/events/moderate', {
      report_id: repId,
      action: 'restore',
      reason: 'Đã xác minh nội dung hợp lệ'
    }, 'token-admin');
    assert.equal(moderateRestoreRes.status, 200, 'Admin khôi phục nội dung thành công');

    // Khách truy cập lại -> Xem được bình thường (200 OK)
    const pubViewAfterRestore = await apiCall('GET', `/api/v1/events/houses/share/${houseShareId}`, undefined, null);
    assert.equal(pubViewAfterRestore.status, 200, 'Ngôi nhà được khôi phục xem lại bình thường');
    console.log('  [PASS] Test 25: Chu trình Báo cáo vi phạm & Kiểm duyệt Admin (Report -> List -> Hide -> Block -> Restore) hoạt động chuẩn xác.');

    // --------------------------------------------------------------------------
    // Test 26: Chặng E & F - Event Analytics Tracking Ingestion & Funnel Aggregation
    // --------------------------------------------------------------------------
    console.log('--- Test 26: Event Analytics Tracking & Funnel Aggregation ---');
    // Gửi tracking events hợp lệ
    const track1 = await apiCall('POST', '/api/v1/events/analytics/track', {
      event_name: 'match_invite_opened',
      resource_type: 'match',
      resource_id: dMatchId,
      dedupe_key: `dedupe:match:${dMatchId}:open:test-client-1`,
      metadata: { referrer: 'zalo' }
    }, null, { headers: { 'x-forwarded-for': '192.168.1.80' } });
    assert.equal(track1.status, 200, 'Ghi nhận event analytics thành công');
    assert.equal(track1.body.tracked, true);

    // Gửi lại event trùng lặp (dedupe_key) -> Không bị trùng lặp số liệu
    const track1Dup = await apiCall('POST', '/api/v1/events/analytics/track', {
      event_name: 'match_invite_opened',
      resource_type: 'match',
      resource_id: dMatchId,
      dedupe_key: `dedupe:match:${dMatchId}:open:test-client-1`,
      metadata: { referrer: 'zalo' }
    }, null, { headers: { 'x-forwarded-for': '192.168.1.80' } });
    assert.equal(track1Dup.status, 200, 'Gửi lại event trùng lặp thành công');
    assert.equal(track1Dup.body.deduped, true, 'Hệ thống nhận diện đã khử trùng lặp (deduped)');

    // Ingest thêm các sự kiện phễu
    await apiCall('POST', '/api/v1/events/analytics/track', {
      event_name: 'house_opened_share',
      resource_type: 'house',
      resource_id: houseShareId
    }, null, { headers: { 'x-forwarded-for': '192.168.1.81' } });

    await apiCall('POST', '/api/v1/events/analytics/track', {
      event_name: 'house_postcard_shared',
      resource_type: 'house',
      resource_id: houseShareId
    }, null, { headers: { 'x-forwarded-for': '192.168.1.82' } });

    // Non-admin truy cập thống kê -> 403
    const nonAdminSummary = await apiCall('GET', '/api/v1/admin/events/analytics/summary', undefined, 'token-owner-a');
    assert.equal(nonAdminSummary.status, 403, 'Non-admin bị từ chối xem thống kê');

    // Admin truy cập báo cáo phân tích tổng hợp -> 200 OK
    const adminSummary = await apiCall('GET', '/api/v1/admin/events/analytics/summary?days=7', undefined, 'token-admin');
    assert.equal(adminSummary.status, 200, 'Admin lấy báo cáo phân tích thành công');
    assert.ok(adminSummary.body.total_events >= 3, 'Tổng số event được ghi nhận');
    assert.ok(adminSummary.body.funnel_match, 'Báo cáo có funnel_match');
    assert.ok(adminSummary.body.funnel_house, 'Báo cáo có funnel_house');
    assert.equal(adminSummary.body.funnel_match.invite_opened >= 1, true, 'Funnel match ghi nhận invite_opened');
    assert.equal(adminSummary.body.funnel_house.opened_share >= 1, true, 'Funnel house ghi nhận opened_share');
    assert.equal(adminSummary.body.funnel_house.postcard_shared >= 1, true, 'Funnel house ghi nhận postcard_shared');

    // Kiểm tra code giao diện EventModerationAdmin.jsx và AdminPanelModal.jsx
    const eventModerationAdminCode = fs.readFileSync('src/components/EventModerationAdmin.jsx', 'utf8');
    const adminPanelModalCode = fs.readFileSync('src/components/AdminPanelModal.jsx', 'utf8');
    assert.ok(eventModerationAdminCode.includes('báo cáo vi phạm'), 'Giao diện có tab báo cáo vi phạm');
    assert.ok(eventModerationAdminCode.includes('Thống kê & Phễu sự kiện'), 'Giao diện có tab Thống kê & Phễu sự kiện');
    assert.ok(eventModerationAdminCode.includes('Ẩn nội dung vi phạm'), 'Giao diện có nút Ẩn nội dung vi phạm');
    assert.ok(eventModerationAdminCode.includes('Khôi phục hiển thị'), 'Giao diện có nút Khôi phục hiển thị');
    assert.ok(eventModerationAdminCode.includes('Bỏ qua báo cáo'), 'Giao diện có nút Bỏ qua báo cáo');
    assert.ok(adminPanelModalCode.includes('Sự Kiện & Báo Cáo'), 'AdminPanelModal có tab Sự Kiện & Báo Cáo');
    assert.ok(adminPanelModalCode.includes('<EventModerationAdmin'), 'AdminPanelModal render component EventModerationAdmin');
    console.log('  [PASS] Test 26: Event Analytics ingestion, deduplication, funnels và Admin Dashboard tích hợp hoàn thiện.');

    // --------------------------------------------------------------------------
    // Test 27: Chặng E & F - Realtime Broadcast Signal & Smart Polling Fallback
    // --------------------------------------------------------------------------
    console.log('--- Test 27: Realtime Broadcast Signal & Smart Polling Fallback ---');
    // Match Studio: Kiểm tra realtime SSE relay, lightweight signal, focus refetch, polling fallback
    const matchStreamCode = fs.readFileSync('src/services/matchStream.js', 'utf8');
    assert.ok(matchStudioCode.includes('watchMatch(matchId'), 'Match Studio kết nối authenticated realtime stream per match');
    assert.ok(matchStreamCode.includes('/api/v1/events/matches/'), 'Stream service gọi endpoint an toàn');
    assert.ok(matchStreamCode.includes('stream'), 'Stream service thiết lập SSE connection');
    assert.ok(matchStudioCode.includes('getMatchView(matchId'), 'Realtime trigger authenticated refetch chứ không tin payload thô');
    assert.ok(matchStudioCode.includes("addEventListener('focus'"), 'Có listener window focus để đồng bộ tab');
    assert.ok(matchStudioCode.includes('setInterval('), 'Có smart polling fallback');
    assert.ok(matchStudioCode.includes('Báo cáo nội dung'), 'Match Studio có nút báo cáo nội dung');

    // Exercise the real route, private relay and browser SSE parser; SQL ownership/races have live DB coverage.
    const fixtureFetch = globalThis.fetch, previousChannel = SupabaseClient.prototype.channel;
    const previousRemoveChannel = SupabaseClient.prototype.removeChannel, previousSession = supabase.auth.getSession;
    const previousDocument = globalThis.document;
    let cancelArgs, cancelBurst, broadcast, removed = false, disconnect, deadline;
    try {
      globalThis.fetch = async (input, init = {}) => {
        const args = init.body ? JSON.parse(init.body) : {};
        if (String(input).endsWith('/rpc/rpc_check_rate_limit') && args.p_key.includes(':rpc_match_cancel')) cancelBurst = args.p_max_burst;
        if (String(input).endsWith('/rpc/rpc_event_dispatch') && args.p_action === 'rpc_match_cancel') {
          cancelArgs = args;
          return Response.json({success:true, status:'archived', cancelled:true});
        }
        return fixtureFetch(input, init);
      };
      assert.equal((await apiCall('POST', `/api/v1/events/matches/${matchId}/cancel`, {}, null)).status, 401);
      assert.equal((await apiCall('POST', '/api/v1/events/matches/not-a-uuid/cancel', {}, 'token-owner-b')).status, 400);
      assert.equal((await apiCall('POST', `/api/v1/events/matches/${matchId}/cancel`, {}, 'token-owner-b')).status, 200);
      assert.deepEqual(cancelArgs, {p_action:'rpc_match_cancel', p_args:{p_match_id:matchId}, p_caller:'user-owner-b'});
      assert.equal(cancelBurst, 30, 'Cancel uses the write limit');

      const streamedMatch = Object.values(state.matches).find(match => !match.is_hidden && match.partner_token_hash);
      assert.ok(streamedMatch, 'Fixture has a valid partner invitation');
      SupabaseClient.prototype.channel = function (name, options) {
        assert.equal(name, `emoria-match:${streamedMatch.id}`);
        assert.equal(options.config.private, true);
        return {on(type, filter, listener) {
          assert.equal(type, 'broadcast');assert.equal(filter.event, 'changed');broadcast = listener;return this;
        }, subscribe() {queueMicrotask(() => broadcast({payload:{cancelled:true}}));return this;}};
      };
      SupabaseClient.prototype.removeChannel = async () => {removed = true;};
      const frames = [], res = new EventEmitter();let ended = 0;
      Object.assign(res, {setHeader() {}, flushHeaders() {}, write(frame) {frames.push(frame);}, end() {ended++;}});
      deadline = setTimeout(() => res.emit('close'), 1000);
      await streamMatch({params:[streamedMatch.id], body:{invite_token:streamedMatch.partner_token_hash.slice(5)},
        user:null, ip:'cancel-stream-fixture', res, db:async result => {
          const {data,error} = await result;assert.ifError(error);return data;
        }});
      clearTimeout(deadline);
      assert.deepEqual(frames, ['event: cancelled\ndata: {"status":"archived"}\n\n'], 'Authorized partner gets only terminal status, never answers');
      assert.equal(ended, 1);assert.equal(removed, true, 'Cancel closes the response and removes the private channel');

      globalThis.document = {visibilityState:'visible'};
      supabase.auth.getSession = async () => ({data:{session:null}});
      let requestSignal, requests = 0, fallbacks = 0;
      globalThis.fetch = async (url, init) => {requests++;requestSignal = init.signal;return new Response(frames.join(''));};
      const terminal = await new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('Browser did not handle cancellation SSE')), 1000);
        disconnect = watchMatch(streamedMatch.id, 'valid-invite', resolve, () => {fallbacks++;});
      });
      assert.deepEqual(terminal, {status:'archived'});
      assert.equal(requestSignal.aborted, true, 'Terminal cancellation aborts reconnection');
      assert.equal(requests, 1);assert.equal(fallbacks, 0);
    } finally {
      clearTimeout(deadline);disconnect?.();globalThis.fetch = fixtureFetch;
      SupabaseClient.prototype.channel = previousChannel;SupabaseClient.prototype.removeChannel = previousRemoveChannel;
      supabase.auth.getSession = previousSession;globalThis.document = previousDocument;
    }

    // House Studio: Kiểm tra báo cáo nội dung và event tracking
    assert.ok(houseStudioCode.includes('submitContentReport('), 'House Studio có nút và modal báo cáo nội dung');
    assert.ok(houseStudioCode.includes('house_opened_share'), 'House Studio track event house_opened_share');
    assert.ok(houseStudioCode.includes('house_copy_link'), 'House Studio track event house_copy_link');
    assert.ok(houseStudioCode.includes('house_postcard_download'), 'House Studio track event house_postcard_download');
    assert.ok(houseStudioCode.includes('house_postcard_shared'), 'House Studio track event house_postcard_shared');

    // Service exports kiểm tra không rò rỉ secret / storage paths
    assert.ok(eventServiceCode.includes('trackEventAction'), 'eventService export trackEventAction');
    assert.ok(eventServiceCode.includes('submitContentReport'), 'eventService export submitContentReport');
    assert.ok(eventServiceCode.includes('adminListReports'), 'eventService export adminListReports');
    assert.ok(eventServiceCode.includes('adminModerateContent'), 'eventService export adminModerateContent');
    assert.ok(eventServiceCode.includes('adminGetAnalyticsSummary'), 'eventService export adminGetAnalyticsSummary');
    assert.ok(!eventServiceCode.includes('service_role'), 'eventService tuyệt đối không chứa service_role key');

    console.log('  [PASS] Test 27: Realtime lightweight broadcast, smart polling fallback và content reporting đồng bộ hoàn hảo.');

    // --------------------------------------------------------------------------
    // Test 28: Freeform House V2 - HTTP API Draft, Reload, Publish & Strict Validations
    // --------------------------------------------------------------------------
    console.log('\n--- Test 28: Freeform House V2 - HTTP API Draft, Reload, Publish & Strict Validations ---');
    // 1. Tạo 40 món đồ tự do (> 30 items)
    const freeform40 = [];
    for (let i = 1; i <= 40; i++) {
      freeform40.push({
        id: `decor_inst_${i}`,
        item: 'cat',
        surface: 'floor',
        position: [-2.8, 0.15, 0.0],
        rotation: (i * 10) % 360,
        scale: 1.0
      });
    }

    const housePayload40 = {
      title: 'Our Freeform Home',
      theme: 'warm_gold',
      rooms: [
        {
          id: 'beginning',
          name: 'Phòng Khởi Đầu',
          lighting: 'sunset',
          decorations: freeform40,
          memories: [{ id: 'mem1', photo_path: 'emo-heart/room1.jpg' }]
        }
      ]
    };

    // 2. Lưu draft với 40 món đồ qua HTTP API
    const curDraft28 = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-b');
    const save40Res = await apiCall('POST', '/api/v1/memories/emo-heart/house/draft', {
      ...housePayload40,
      expected_revision: curDraft28.body?.draft_revision
    }, 'token-owner-b');
    assert.equal(save40Res.status, 200, 'Lưu draft với 40 món đồ thành công qua HTTP API');

    // 3. Reload draft qua HTTP API
    const reload40Res = await apiCall('GET', '/api/v1/memories/emo-heart/house/draft', undefined, 'token-owner-b');
    assert.equal(reload40Res.status, 200, 'Reload draft thành công');
    assert.equal(reload40Res.body.rooms[0].decorations.length, 40, 'Reload bảo toàn đầy đủ 40 món đồ không bị cắt gọt');

    // 4. Publish và xem public snapshot
    const pub40Res = await apiCall('POST', '/api/v1/memories/emo-heart/house/publish', {}, 'token-owner-b');
    assert.equal(pub40Res.status, 200, 'Publish house thành công');

    const publicViewRes = await apiCall('GET', '/api/v1/events/houses/tag/emo-heart', undefined, null);
    assert.equal(publicViewRes.status, 200, 'Xem public snapshot thành công');
    assert.equal(publicViewRes.body.rooms[0].decorations.length, 40, 'Public snapshot hiển thị đủ 40 món đồ');

    // 5. Kiểm tra dữ liệu sai bị từ chối với status 422:
    const errRev = reload40Res.body.draft_revision;

    // 5a. Tọa độ X vượt giới hạn phòng beginning (X=0.5 thuộc phòng first)
    const badXRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Bad Room',
      theme: 'classic',
      expected_revision: errRev,
      rooms: [{
        id: 'beginning',
        decorations: [{ id: 'bad_x', item: 'cat', surface: 'floor', position: [0.5, 0.15, 0.0] }]
      }]
    }, 'token-owner-b');
    assert.equal(badXRes.status, 422, 'Tọa độ X ngoài bounds phòng bị từ chối');

    // 5b. Bề mặt không tương thích (nến đặt trên sàn)
    const badSurfaceRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Bad Surface',
      theme: 'classic',
      expected_revision: errRev,
      rooms: [{
        id: 'beginning',
        decorations: [{ id: 'candle_floor', item: 'candles', surface: 'floor', position: [-2.8, 0.15, 0.0] }]
      }]
    }, 'token-owner-b');
    assert.equal(badSurfaceRes.status, 422, 'Nến đặt trên sàn bị từ chối');

    // 5c. Tự làm vật đỡ cho chính nó (self-parent)
    const selfParentRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Self Parent',
      theme: 'classic',
      expected_revision: errRev,
      rooms: [{
        id: 'beginning',
        decorations: [{ id: 'self_p', item: 'album', surface: 'table', position: [-2.8, 0.51, 0.0], parent_id: 'self_p' }]
      }]
    }, 'token-owner-b');
    assert.equal(selfParentRes.status, 422, 'Tự làm vật đỡ cho chính nó bị từ chối');

    // 5d. Vật đỡ không tồn tại trong phòng
    const ghostParentRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Ghost Parent',
      theme: 'classic',
      expected_revision: errRev,
      rooms: [{
        id: 'beginning',
        decorations: [{ id: 'child', item: 'mugs', surface: 'table', position: [-2.8, 0.51, 0.0], parent_id: 'no_such_parent' }]
      }]
    }, 'token-owner-b');
    assert.equal(ghostParentRes.status, 422, 'Vật đỡ không tồn tại bị từ chối');

    // 5e. Vật đỡ không có khả năng đỡ đồ (ví dụ: mèo đỡ cốc)
    const catParentRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Cat Parent',
      theme: 'classic',
      expected_revision: errRev,
      rooms: [{
        id: 'beginning',
        decorations: [
          { id: 'cat_p', item: 'cat', surface: 'floor', position: [-2.8, 0.15, 0.0] },
          { id: 'mug_child', item: 'mugs', surface: 'table', position: [-2.8, 0.51, 0.0], parent_id: 'cat_p' }
        ]
      }]
    }, 'token-owner-b');
    assert.equal(catParentRes.status, 422, 'Món đồ không có khả năng đỡ đồ bị từ chối');

    // 5f. Chu trình tham chiếu vật đỡ (A -> B -> C -> A)
    const cycleRes = await apiCall('POST', '/api/v1/memories/emo-heart/house/draft', {
      title: 'Cycle Parent',
      theme: 'classic',
      expected_revision: errRev,
      rooms: [{
        id: 'beginning',
        decorations: [
          { id: 'itemA', item: 'album', surface: 'table', position: [-2.8, 0.51, 0.0], parent_id: 'itemB' },
          { id: 'itemB', item: 'nameplate', surface: 'table', position: [-2.8, 0.51, 0.0], parent_id: 'itemC' },
          { id: 'itemC', item: 'album', surface: 'table', position: [-2.8, 0.51, 0.0], parent_id: 'itemA' }
        ]
      }]
    }, 'token-owner-b');
    assert.equal(cycleRes.status, 422, 'Chu trình tham chiếu nhiều cấp bị từ chối');

    console.log('  [PASS] Test 28: Freeform House V2 HTTP API draft, reload, publish và toàn bộ validation được kiểm chứng hoàn hảo.');

    console.log('\n================================================================');
    console.log('  TẤT CẢ 28/28 BEHAVIOR, SECURITY & UI ASSERTIONS ĐẠT KẾT QUẢ PASS');
    console.log('================================================================');

  } finally {
    globalThis.fetch = originalFetch;
  }
}

await runTests();
