/**
 * EMORIA LUXURY - ROLE & AVAILABILITY SERVICE
 * Quản lý hệ thống phân quyền 4 vai trò (Admin, NFC Owner, Memory Viewer, Guest)
 * và kiểm soát tính khả dụng của hệ thống (Maintenance / VIP Private Gate).
 */

export const ROLES = {
  ADMIN: 'admin',
  NFC_OWNER: 'nfc_owner',
  MEMORY_VIEWER: 'memory_viewer',
  GUEST: 'guest',
};

const ROLE_STORAGE_KEY = 'emoria_auth_role_v1';
const SYSTEM_AVAILABILITY_KEY = 'emoria_system_availability_v1';

// Mặc định cài đặt tính khả dụng hệ thống
const DEFAULT_SYSTEM_CONFIG = {
  isMaintenanceMode: false,
  maintenanceMessage: 'Không gian Emoria Luxury đang trong phiên bảo dưỡng định kỳ để nâng cấp trải nghiệm chế tác trang sức.',
  vipPasscode: 'EMORIAVIP',
  allowVipBypass: true,
};

/**
 * Lấy cấu hình tính khả dụng hệ thống
 */
export function getSystemAvailability() {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(SYSTEM_AVAILABILITY_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Khong the doc system availability tu localStorage', e);
  }
  return { ...DEFAULT_SYSTEM_CONFIG };
}

/**
 * Cập nhật cấu hình tính khả dụng (Chỉ Admin)
 * @param {Object} newConfig 
 */
export function updateSystemAvailability(newConfig) {
  const current = getSystemAvailability();
  const updated = { ...current, ...newConfig };
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SYSTEM_AVAILABILITY_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    console.error('Khong the luu system availability', e);
  }
  return updated;
}

/**
 * Lấy phiên người dùng và vai trò hiện tại
 * @returns {{ role: string, user: Object|null, ownedTags: string[] }}
 */
export function getCurrentAuthSession() {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(ROLE_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Khong the doc role storage', e);
  }

  // Mặc định là Khách vãng lai (Guest)
  return {
    role: ROLES.GUEST,
    user: null,
    ownedTags: [],
  };
}

/**
 * Lưu phiên người dùng
 * @param {Object} session 
 */
export function persistAuthSession(session) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(session));
    }
  } catch (e) {
    console.error('Khong the luu role storage', e);
  }
}

/**
 * Chuyển đổi vai trò nhanh (Phục vụ trải nghiệm & kiểm thử đa vai trò)
 * @param {string} targetRole - 'admin' | 'nfc_owner' | 'memory_viewer' | 'guest'
 * @param {Object} extraInfo - { tagUid, name }
 */
export function switchRole(targetRole, extraInfo = {}) {
  let session = {
    role: targetRole,
    user: null,
    ownedTags: [],
  };

  if (targetRole === ROLES.ADMIN) {
    session.user = {
      name: 'Quản Trị Viên EMORIA',
      email: 'admin@emoria.vn',
      permissions: ['all'],
    };
  } else if (targetRole === ROLES.NFC_OWNER) {
    const activeTag = extraInfo.tagUid || 'emoria-lumen';
    session.user = {
      name: extraInfo.name || 'Chủ Sở Hữu Kỷ Vật',
      email: 'owner@emoria.vn',
    };
    session.ownedTags = [activeTag];
  } else if (targetRole === ROLES.MEMORY_VIEWER) {
    session.user = {
      name: extraInfo.name || 'Khách Xem Kỷ Niệm (NFC Tapped)',
      viewingTag: extraInfo.tagUid || 'emoria-lumen',
    };
  } else {
    // Guest
    session.role = ROLES.GUEST;
  }

  persistAuthSession(session);
  return session;
}

/**
 * Đăng nhập quyền Quản trị viên (Admin)
 * @param {string} passkey 
 */
export function loginAsAdmin(passkey) {
  const cleanKey = String(passkey || '').trim();
  if (cleanKey === 'admin123' || cleanKey === 'emoria@2026' || cleanKey === 'admin') {
    return switchRole(ROLES.ADMIN);
  }
  throw new Error('Mã quản trị viên (Admin Passkey) không chính xác.');
}

/**
 * Xác thực quyền Chủ Sở Hữu chip NFC
 * @param {string} tagUid 
 * @param {string} ownerSecret 
 */
export function verifyAndLoginOwner(tagUid, ownerSecret) {
  const cleanTag = String(tagUid).toLowerCase().trim();
  const cleanSecret = String(ownerSecret).trim();

  // Khóa bí mật mặc định của các kỷ vật mẫu
  const VALID_SECRETS = {
    'emoria-lumen': 'OWNER-LUMEN-2025',
    'emoria-pulse': 'OWNER-PULSE-2024',
    'emoria-horizon': 'OWNER-HORIZON-2025',
  };

  if (VALID_SECRETS[cleanTag] && VALID_SECRETS[cleanTag] === cleanSecret) {
    return switchRole(ROLES.NFC_OWNER, { tagUid: cleanTag, name: `Chủ Nhân ${cleanTag}` });
  }

  // Cho phép mã PIN khớp với pin bảo mật cũng có thể định danh là chủ nhân
  if (cleanSecret === '1000' && cleanTag === 'emoria-pulse') {
    return switchRole(ROLES.NFC_OWNER, { tagUid: cleanTag, name: 'Khánh An (Chủ Nhân Pulse)' });
  }

  throw new Error('Mã khóa sở hữu (Owner Secret Key) không hợp lệ đối với kỷ vật này.');
}

/**
 * Kiểm tra xem người dùng hiện tại có quyền chỉnh sửa tagUid này không
 * @param {string} tagUid 
 */
export function canEditMemoryTag(tagUid) {
  const session = getCurrentAuthSession();
  if (session.role === ROLES.ADMIN) return true;
  if (session.role === ROLES.NFC_OWNER && session.ownedTags?.includes(String(tagUid).toLowerCase().trim())) {
    return true;
  }
  return false;
}

/**
 * Đăng xuất về vai trò Khách vãng lai (Guest)
 */
export function logoutToGuest() {
  return switchRole(ROLES.GUEST);
}
