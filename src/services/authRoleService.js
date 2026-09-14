/**
 * EMORIA LUXURY - AUTH & ROLE SERVICE (RBAC)
 * Dựa trên nguồn danh tính Supabase Auth thật và quan hệ sở hữu theo từng tài nguyên.
 * TUYỆT ĐỐI KHÔNG tin role tự khai từ client, localStorage, hay passkey hardcoded.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

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
  isMaintenanceMode: true,
  maintenanceMessage: 'Không thể đọc trạng thái hệ thống từ máy chủ. Vui lòng thử lại sau.',
  vipPasscode: '',
};
let serverSystemAvailability = { ...UNAVAILABLE_SYSTEM };

/** Đọc trạng thái thật; lỗi server không được chuyển sang cấu hình Demo. */
export async function fetchSystemStatus() {
  if (!isSupabaseConfigured()) return { success: true, ...getSystemAvailability(), isDemo: true };
  try {
    const { data, error } = await supabase.rpc('rpc_get_system_status');
    if (error || data?.success !== true || typeof data.is_maintenance_mode !== 'boolean') {
      throw new Error(error?.message || data?.message || 'Phản hồi máy chủ không hợp lệ.');
    }
    serverSystemAvailability = {
      isMaintenanceMode: data.is_maintenance_mode,
      maintenanceMessage: data.maintenance_message || '',
      vipPasscode: '',
    };
    return { success: true, ...serverSystemAvailability };
  } catch (error) {
    serverSystemAvailability = { ...UNAVAILABLE_SYSTEM };
    return { success: false, ...serverSystemAvailability, error: error.message };
  }
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
  const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'maintenance_config').single();
  if (error || !data) throw new Error(error?.message || 'Không thể đọc cấu hình máy chủ.');
  const value = { ...data.value };
  if ('isMaintenanceMode' in partial) value.is_maintenance_mode = Boolean(partial.isMaintenanceMode);
  if ('maintenanceMessage' in partial) value.maintenance_message = partial.maintenanceMessage;
  const { data: saved, error: saveError } = await supabase.from('system_settings')
    .update({ value, updated_at: new Date().toISOString() }).eq('key', 'maintenance_config').select('key').single();
  if (saveError || !saved) throw new Error(saveError?.message || 'Không thể lưu cấu hình máy chủ.');
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

    // Kiểm tra quyền Admin trong bảng role_assignments phía server
    const { data: roleData, error } = await supabase
      .from('role_assignments')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = Boolean(roleData && !error);

    return {
      role: isAdmin ? ROLES.ADMIN : ROLES.GUEST, // Owner được xác định theo từng memory_space
      user: {
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name || user.email,
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
    const { data, error } = await supabase
      .from('memory_spaces')
      .select('owner_id')
      .eq('tag_uid', String(tagUid).toLowerCase().trim())
      .single();

    if (error || !data) return false;
    return data.owner_id === currentUserId;
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
