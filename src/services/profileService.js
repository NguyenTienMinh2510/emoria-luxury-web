import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * Lấy thông tin hồ sơ của người dùng hiện tại từ Supabase
 * @returns {Promise<{success: boolean, profile?: object, message?: string}>}
 */
export async function getMyProfile() {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Chưa cấu hình Supabase.' };
  }

  try {
    const { data, error } = await supabase.rpc('rpc_get_my_profile');
    if (error) {
      // Fallback nếu RPC chưa sẵn sàng: truy vấn trực tiếp bảng profiles
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, message: 'Chưa đăng nhập.' };

      const { data: profileRow, error: selectErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (selectErr) throw selectErr;
      return {
        success: true,
        profile: profileRow || {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email,
        }
      };
    }

    if (data?.error) {
      return { success: false, message: data.error };
    }

    return { success: true, profile: data };
  } catch (err) {
    console.error('[ProfileService] getMyProfile error:', err);
    return { success: false, message: err.message || 'Lỗi khi tải hồ sơ.' };
  }
}

/**
 * Cập nhật thông tin hồ sơ của người dùng
 * @param {object} param0
 * @param {string} [param0.fullName]
 * @param {string} [param0.phone]
 * @param {string} [param0.birthday] - Định dạng YYYY-MM-DD
 * @param {string} [param0.gender] - 'Nam' | 'Nữ' | 'Khác'
 * @param {string} [param0.address]
 * @param {string} [param0.bio]
 * @param {string} [param0.avatarUrl]
 * @returns {Promise<{success: boolean, profile?: object, message?: string}>}
 */
export async function updateMyProfile({
  fullName,
  phone,
  birthday,
  gender,
  address,
  bio,
  avatarUrl,
}) {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Chưa cấu hình Supabase.' };
  }

  try {
    const payload = {
      p_full_name: fullName?.trim() || null,
      p_phone: phone?.trim() || null,
      p_birthday: birthday?.trim() || null,
      p_gender: gender || null,
      p_address: address?.trim() || null,
      p_bio: bio?.trim() || null,
      p_avatar_url: avatarUrl?.trim() || null,
    };

    const { data, error } = await supabase.rpc('rpc_update_my_profile', payload);

    if (error) {
      // Fallback nếu RPC lỗi: update trực tiếp bảng profiles
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, message: 'Chưa đăng nhập.' };

      const updateData = {
        full_name: payload.p_full_name,
        phone: payload.p_phone,
        birthday: payload.p_birthday ? payload.p_birthday : null,
        gender: payload.p_gender,
        address: payload.p_address,
        bio: payload.p_bio,
        avatar_url: payload.p_avatar_url,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedRow, error: directErr } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single();

      if (directErr) throw directErr;

      // Đồng bộ user metadata
      if (payload.p_full_name) {
        await supabase.auth.updateUser({
          data: { full_name: payload.p_full_name }
        });
      }

      return { success: true, profile: updatedRow };
    }

    return { success: true, profile: data };
  } catch (err) {
    console.error('[ProfileService] updateMyProfile error:', err);
    return { success: false, message: err.message || 'Lỗi khi cập nhật hồ sơ.' };
  }
}
