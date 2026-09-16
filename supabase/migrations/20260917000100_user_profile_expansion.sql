-- ==============================================================================
-- EMORIA LUXURY - USER PROFILE EXPANSION MIGRATION
-- Migration: 20260917000100_user_profile_expansion
-- Description: Mở rộng bảng profiles với các trường thông tin cơ bản:
--              số điện thoại, ngày sinh, giới tính, địa chỉ, tiểu sử,
--              cùng các hàm RPC bảo mật cho phép người dùng tự xem và cập nhật hồ sơ.
-- ==============================================================================

-- 1. Bổ sung các cột thông tin mới vào bảng public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- 2. Đảm bảo chính sách RLS cho phép người dùng tự thêm/sửa hồ sơ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 3. Hàm RPC lấy thông tin hồ sơ của người dùng hiện tại (an toàn qua auth.uid())
CREATE OR REPLACE FUNCTION public.rpc_get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_res jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Chưa đăng nhập');
  END IF;

  -- Đảm bảo đã có bản ghi trong bảng profiles
  INSERT INTO public.profiles (id, email, full_name)
  SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', email)
  FROM auth.users
  WHERE id = v_user_id
  ON CONFLICT (id) DO NOTHING;

  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'phone', p.phone,
    'birthday', p.birthday,
    'gender', p.gender,
    'address', p.address,
    'bio', p.bio,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_res
  FROM public.profiles p
  WHERE p.id = v_user_id;

  RETURN v_res;
END;
$$;

-- 4. Hàm RPC cập nhật thông tin hồ sơ của người dùng hiện tại
CREATE OR REPLACE FUNCTION public.rpc_update_my_profile(
  p_full_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_birthday TEXT DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bday date := NULL;
  v_res jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bạn chưa đăng nhập vào tài khoản.';
  END IF;

  -- Chuyển đổi an toàn chuỗi ngày sinh sang DATE
  IF p_birthday IS NOT NULL AND TRIM(p_birthday) <> '' THEN
    BEGIN
      v_bday := p_birthday::date;
    EXCEPTION WHEN OTHERS THEN
      v_bday := NULL;
    END;
  END IF;

  -- Cập nhật hoặc thêm mới vào bảng profiles
  INSERT INTO public.profiles (
    id, email, full_name, phone, birthday, gender, address, bio, avatar_url, updated_at
  )
  SELECT
    id,
    email,
    COALESCE(p_full_name, raw_user_meta_data->>'full_name', email),
    p_phone,
    v_bday,
    p_gender,
    p_address,
    p_bio,
    p_avatar_url,
    NOW()
  FROM auth.users
  WHERE id = v_user_id
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(p_full_name, profiles.full_name),
    phone = p_phone,
    birthday = v_bday,
    gender = p_gender,
    address = p_address,
    bio = p_bio,
    avatar_url = p_avatar_url,
    updated_at = NOW();

  -- Đồng bộ tên vào auth.users user_metadata
  IF p_full_name IS NOT NULL AND TRIM(p_full_name) <> '' THEN
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{full_name}',
      to_jsonb(TRIM(p_full_name))
    )
    WHERE id = v_user_id;
  END IF;

  -- Lấy lại profile mới nhất
  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'phone', p.phone,
    'birthday', p.birthday,
    'gender', p.gender,
    'address', p.address,
    'bio', p.bio,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_res
  FROM public.profiles p
  WHERE p.id = v_user_id;

  RETURN v_res;
END;
$$;

-- Phân quyền thực thi cho anon và authenticated
GRANT EXECUTE ON FUNCTION public.rpc_get_my_profile() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
