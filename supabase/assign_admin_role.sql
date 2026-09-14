-- ==============================================================================
-- EMORIA LUXURY - SCRIPT GÁN QUYỀN ADMIN CHO TÀI KHOẢN
-- Chạy trên Supabase Dashboard -> SQL Editor sau khi bạn đã Đăng ký tài khoản trên web
-- ==============================================================================

DO $$
DECLARE
  v_admin_email TEXT := 'YOUR_ADMIN_EMAIL_HERE'; -- Thay thế bằng email tài khoản của bạn
  v_user_id UUID;
BEGIN
  -- Tìm user_id từ email trong auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(v_admin_email));
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản với email: %. Vui lòng đăng ký tài khoản trước trên trang web.', v_admin_email;
  END IF;

  -- Đảm bảo đã có bản ghi profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (v_user_id, v_admin_email, 'Quản Trị Viên EMORIA')
  ON CONFLICT (id) DO NOTHING;

  -- Gán vai trò admin
  INSERT INTO public.role_assignments (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Đã gán quyền Admin thành công cho tài khoản: % (UUID: %)', v_admin_email, v_user_id;
END $$;
