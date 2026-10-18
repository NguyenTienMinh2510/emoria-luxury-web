/**
 * EMORIA LUXURY - AUTH & ROLE SERVICE (RBAC)
 * Dựa trên nguồn danh tính Supabase Auth thật và quan hệ sở hữu theo từng tài nguyên.
 * TUYỆT ĐỐI KHÔNG tin role tự khai từ client, localStorage, hay passkey hardcoded.
 */

import {apiRequest} from './apiClient.js';
import { supabase, isSupabaseConfigured, fetchPublicSystemStatus } from '../lib/supabaseClient.js';
import {createRequestBudget} from './requestBudget.js';

export const ROLES = {
  ADMIN: 'admin',
  NFC_OWNER: 'nfc_owner',
  MEMORY_VIEWER: 'memory_viewer',
  GUEST: 'guest',
};

const SYSTEM_AVAILABILITY_KEY = 'emoria_system_availability_v1';
const DEFAULT_SYSTEM_AVAILABILITY = {
  isMaintenanceMode: false,
  maintenanceMessage: 'Hệ thống EMORIA đang tạm đóng cửa để phục vụ đợt nâng cấp Private Salon cao cấp.',
  vipPasscode: 'EMORIAVIP',
};

let memorySystemAvailability = { ...DEFAULT_SYSTEM_AVAILABILITY };
const UNAVAILABLE_SYSTEM = {
  isMaintenanceMode: false,
  isUnavailable: true,
  maintenanceMessage: 'Kết nối máy chủ đang gián đoạn. Bạn vẫn có thể xem trang; các thao tác cần máy chủ sẽ được kiểm tra khi kết nối lại.',
  vipPasscode: '',
};
let serverSystemAvailability = { ...UNAVAILABLE_SYSTEM };

/** Đọc trạng thái thật; lỗi server không được chuyển sang cấu hình Demo. */
export async function fetchSystemStatus({signal,timeoutMs=12000}={}) {
  if (!isSupabaseConfigured()) return { success: true, ...getSystemAvailability(), isDemo: true };
  const budget=createRequestBudget({signal,timeoutMs});
  try {
    let data;
    try {
      data = await budget.wait(fetchPublicSystemStatus({signal:budget.signal,timeoutMs:8000}));
      if (data?.success !== true || typeof data.is_maintenance_mode !== 'boolean') throw new Error('Phản hồi máy chủ không hợp lệ.');
    } catch {
      budget.signal.throwIfAborted();
      data = await budget.wait(apiRequest('/system/status', { anonymous: true,signal:budget.signal }));
    }
    if (data?.success !== true || typeof data.is_maintenance_mode !== 'boolean') {
      throw new Error(data?.message || 'Phản hồi máy chủ không hợp lệ.');
    }
    serverSystemAvailability = {
      isMaintenanceMode: data.is_maintenance_mode,
      isUnavailable: false,
      maintenanceMessage: data.maintenance_message || '',
      vipPasscode: '',
    };
    return { success: true, ...serverSystemAvailability };
  } catch (error) {
    // A confirmed maintenance state remains closed during a later outage.
    serverSystemAvailability = { ...serverSystemAvailability, ...UNAVAILABLE_SYSTEM, isMaintenanceMode:serverSystemAvailability.isMaintenanceMode };
    return { success: false, ...serverSystemAvailability, error: error.message };
  } finally {budget.dispose();}
}

/**
 * Lấy cấu hình tính khả dụng toàn hệ thống (Bảo trì / VIP Private Salon Gate)
 */
export function getSystemAvailability() {
  if (isSupabaseConfigured()) return { ...serverSystemAvailability };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(SYSTEM_AVAILABILITY_KEY);
      if (raw) return { ...DEFAULT_SYSTEM_AVAILABILITY, ...JSON.parse(raw) };
    }
  } catch (e) {
    // ignore
  }
  return { ...memorySystemAvailability };
}

/**
 * Cập nhật cấu hình tính khả dụng toàn hệ thống
 * @param {Partial<typeof DEFAULT_SYSTEM_AVAILABILITY>} partial 
 */
export function updateSystemAvailability(partial = {}) {
  if (isSupabaseConfigured()) return updateServerSystemAvailability(partial);
  const current = getSystemAvailability();
  const updated = { ...current, ...partial };
  memorySystemAvailability = updated;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SYSTEM_AVAILABILITY_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    // ignore
  }
  return updated;
}

async function updateServerSystemAvailability(partial) {
  if ('vipPasscode' in partial) throw new Error('Đổi mã VIP trên máy chủ chưa được hỗ trợ.');
  await apiRequest('/admin/system/maintenance',{method:'PATCH',body:partial});
  const result = await fetchSystemStatus();
  if (!result.success) throw new Error(result.error);
  return getSystemAvailability();
}

/**
 * Lấy nhanh phiên làm việc tức thời từ cache (dùng cho render ban đầu)
 */
export function getCurrentAuthSession() {
  return {
    role: ROLES.GUEST,
    user: null,
    isAdmin: false,
  };
}

/**
 * Lấy vai trò thực tế của phiên hiện tại từ Supabase Auth & Role Assignments
 * @returns {Promise<{ role: string, user: Object|null, isAdmin: boolean }>}
 */
export async function resolveCurrentSessionRole() {
  if (!isSupabaseConfigured()) {
    return {
      role: ROLES.GUEST,
      user: null,
      isAdmin: false,
    };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return {
        role: ROLES.GUEST,
        user: null,
        isAdmin: false,
      };
    }

    const user = session.user;

    if (user.is_anonymous === true) {
      return {role:ROLES.GUEST, user:null, isAdmin:false, isAnonymous:true, anonymousUserId:user.id};
    }

    let isAdmin = false;
    let profile = null;
    try {
      const sessionData = await apiRequest('/me/session');
      isAdmin = sessionData?.isAdmin === true;
      profile = sessionData?.profile || null;
    } catch {
      try {
        const [adminRes, profileRes] = await Promise.all([
          supabase.rpc('is_admin'),
          supabase.from('profiles').select('full_name, phone, birthday, gender, address, bio, avatar_url').eq('id', user.id).maybeSingle()
        ]);
        isAdmin = adminRes?.data === true;
        profile = profileRes?.data || null;
      } catch {}
    }

    return {
      role: isAdmin ? ROLES.ADMIN : ROLES.GUEST, // Owner được xác định theo từng memory_space
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || user.user_metadata?.full_name || user.email,
        phone: profile?.phone || user.user_metadata?.phone || '',
        birthday: profile?.birthday || '',
        gender: profile?.gender || '',
        address: profile?.address || '',
        bio: profile?.bio || '',
        avatarUrl: profile?.avatar_url || '',
      },
      isAdmin,
    };
  } catch (err) {
    console.warn('[AuthRoleService] Lỗi khi giải mã phiên:', err.message);
    return {
      role: ROLES.GUEST,
      user: null,
      isAdmin: false,
    };
  }
}

/**
 * Kiểm tra xem người dùng hiện tại có quyền sở hữu (Owner) đối với một tag chip cụ thể không
 * @param {string} tagUid 
 * @param {string} currentUserId 
 */
export async function checkMemoryOwnership(tagUid, currentUserId) {
  if (!tagUid || !currentUserId || !isSupabaseConfigured()) {
    return false;
  }

  try {
    const data=await apiRequest(`/memories/${encodeURIComponent(String(tagUid).toLowerCase().trim())}/ownership`);
    return data.isOwner===true;
  } catch (e) {
    return false;
  }
}

/**
 * Đăng xuất khỏi hệ thống
 */
export async function signOutUser() {
  if (isSupabaseConfigured()) {
    await supabase.auth.signOut();
  }
}
