-- ==============================================================================
-- EMORIA LUXURY - PRODUCTION SCHEMA DEPLOYMENT SCRIPT
-- Dùng để chạy trực tiếp trên Supabase Dashboard -> SQL Editor
-- Phiên bản: 14/09/2026
-- Đã loại bỏ hoàn toàn auth shim và dữ liệu seed demo
-- ==============================================================================

BEGIN;

-- 1. Bật Extensions cần thiết
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TẠO CÁC BẢNG CƠ SỞ (CORE TABLES)
-- ==============================================================================

-- 2.1 Bảng Profiles (Liên kết với Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Bảng Role Assignments (Phân quyền Admin đáng tin cậy phía server)
CREATE TABLE IF NOT EXISTS public.role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES public.profiles(id),
    UNIQUE(user_id, role)
);

-- 2.3 Bảng Memory Spaces (Kho dữ liệu Kỷ niệm của từng chip NFC)
CREATE TABLE IF NOT EXISTS public.memory_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_uid VARCHAR(64) UNIQUE NOT NULL,
    jewelry_name TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT,
    quote TEXT,
    author_name TEXT,
    recipient_name TEXT,
    letter TEXT,
    audio_title TEXT,
    audio_url TEXT,
    is_protected BOOLEAN DEFAULT FALSE,
    pin_hash TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    claim_code_hash TEXT,
    availability_status TEXT DEFAULT 'available' CHECK (availability_status IN ('available', 'timed_lock', 'suspended')),
    unlock_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 Bảng Khóa thử sai PIN (Rate Limiting)
CREATE TABLE IF NOT EXISTS public.memory_pin_failures (
    memory_id UUID PRIMARY KEY REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    failed_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5 Bảng Memory Media (Ảnh & Video của Kỷ vật)
CREATE TABLE IF NOT EXISTS public.memory_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    type TEXT DEFAULT 'image' CHECK (type IN ('image', 'video', 'audio')),
    caption TEXT,
    order_index INT DEFAULT 0,
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 Bảng Guestbook Entries (Sổ lưu bút & Lời chúc gửi vào kỷ vật)
CREATE TABLE IF NOT EXISTS public.guestbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    relationship TEXT,
    message TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 Bảng Access Grants (Quyền truy cập có thời hạn cấp sau khi nhập đúng PIN)
CREATE TABLE IF NOT EXISTS public.access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    grant_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    grant_type TEXT DEFAULT 'viewer' CHECK (grant_type IN ('viewer', 'owner')),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.8 Bảng NFC Tap Events (Nhật ký số lần chạm thẻ chip vật lý)
CREATE TABLE IF NOT EXISTS public.nfc_tap_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    device_type TEXT,
    user_agent TEXT,
    tapped_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.9 Bảng System Settings (Cấu hình khả dụng toàn trang - Bảo trì / VIP Salon)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id)
);

-- 2.10 Bảng Orders (Đơn hàng mua sắm trang sức)
CREATE TABLE IF NOT EXISTS public.orders (
    id VARCHAR(32) PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT NOT NULL,
    city TEXT DEFAULT 'Hồ Chí Minh',
    note TEXT,
    payment_method TEXT DEFAULT 'cod' CHECK (payment_method IN ('cod', 'vietqr')),
    payment_ref TEXT,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending_payment', 'confirmed', 'crafting_nfc', 'shipping', 'completed', 'cancelled')),
    subtotal NUMERIC NOT NULL,
    gift_wrap_fee NUMERIC DEFAULT 0,
    shipping_fee NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    final_total NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.11 Bảng Order Items (Chi tiết các sản phẩm trong đơn)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(32) NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    size TEXT NOT NULL,
    unit_price NUMERIC NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    is_gift BOOLEAN DEFAULT FALSE,
    image_url TEXT
);

-- 2.12 Bảng Sản Phẩm Checkout & Biến Thể Tồn Kho (Atomic Checkout)
CREATE TABLE IF NOT EXISTS public.checkout_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price BIGINT NOT NULL CHECK (price > 0),
    image_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.checkout_variants (
    product_id TEXT REFERENCES public.checkout_products(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    PRIMARY KEY (product_id, size)
);

CREATE TABLE IF NOT EXISTS public.checkout_requests (
    request_id UUID PRIMARY KEY,
    actor_id UUID,
    payload JSONB NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. CÁC HÀM TIỆN ÍCH & TRIGGERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_pin_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guestbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_tap_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_requests ENABLE ROW LEVEL SECURITY;

-- 4.1 Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 4.2 Role Assignments
DROP POLICY IF EXISTS "Admins can view role assignments" ON public.role_assignments;
CREATE POLICY "Admins can view role assignments" ON public.role_assignments FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage role assignments" ON public.role_assignments;
CREATE POLICY "Admins can manage role assignments" ON public.role_assignments FOR ALL USING (public.is_admin());

-- 4.3 Memory Spaces
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.memory_spaces FROM anon, authenticated;
GRANT SELECT (id, tag_uid, jewelry_name, availability_status, unlock_at) ON public.memory_spaces TO anon, authenticated;
GRANT UPDATE (availability_status, unlock_at, updated_at) ON public.memory_spaces TO authenticated;

DROP POLICY IF EXISTS "Public read memory metadata" ON public.memory_spaces;
CREATE POLICY "Public read memory metadata" ON public.memory_spaces FOR SELECT
  USING (availability_status = 'available' OR owner_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "Admins can update memory availability" ON public.memory_spaces;
CREATE POLICY "Admins can update memory availability" ON public.memory_spaces FOR UPDATE
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4.4 Guestbook
DROP POLICY IF EXISTS "Anyone can view approved guestbook entries" ON public.guestbook_entries;
CREATE POLICY "Anyone can view approved guestbook entries" ON public.guestbook_entries FOR SELECT USING (NOT is_hidden);
DROP POLICY IF EXISTS "Anyone can submit guestbook entries" ON public.guestbook_entries;
CREATE POLICY "Anyone can submit guestbook entries" ON public.guestbook_entries FOR INSERT
  WITH CHECK (length(trim(author_name)) > 0 AND length(trim(message)) > 0);
DROP POLICY IF EXISTS "Owners can manage guestbook entries of their memory" ON public.guestbook_entries;
CREATE POLICY "Owners can manage guestbook entries of their memory" ON public.guestbook_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM public.memory_spaces m WHERE m.id = guestbook_entries.memory_id AND (m.owner_id = auth.uid() OR public.is_admin())));

-- 4.5 System Settings
DROP POLICY IF EXISTS "Anyone can read system settings" ON public.system_settings;
CREATE POLICY "Anyone can read system settings" ON public.system_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only admins can modify system settings" ON public.system_settings;
CREATE POLICY "Only admins can modify system settings" ON public.system_settings FOR ALL USING (public.is_admin());

-- 4.6 Orders & Order Items
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "Only admins can update orders status" ON public.orders;
CREATE POLICY "Only admins can update orders status" ON public.orders FOR UPDATE USING (public.is_admin());
REVOKE INSERT ON public.orders, public.order_items FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;
CREATE POLICY "Users can view their order items" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (o.user_id = auth.uid() OR public.is_admin())));

-- 4.7 Checkout Products & Variants
DROP POLICY IF EXISTS catalog_read ON public.checkout_products;
CREATE POLICY catalog_read ON public.checkout_products FOR SELECT TO anon, authenticated USING (active OR public.is_admin());
DROP POLICY IF EXISTS stock_read ON public.checkout_variants;
CREATE POLICY stock_read ON public.checkout_variants FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS catalog_admin ON public.checkout_products;
CREATE POLICY catalog_admin ON public.checkout_products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS stock_admin ON public.checkout_variants;
CREATE POLICY stock_admin ON public.checkout_variants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.checkout_products, public.checkout_variants TO anon, authenticated;
REVOKE ALL ON public.checkout_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.memory_pin_failures FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 5. CÁC HÀM NGHIỆP VỤ BẢO MẬT (SECURITY RPC FUNCTIONS)
-- ==============================================================================

-- 5.1 rpc_get_memory_view
CREATE OR REPLACE FUNCTION public.rpc_get_memory_view(p_tag_uid TEXT, p_grant_token UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mem RECORD;
  v_is_owner BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_has_valid_grant BOOLEAN := FALSE;
  v_can_see_private BOOLEAN := FALSE;
  v_media JSONB;
  v_guestbook JSONB;
  v_tap_count BIGINT;
BEGIN
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy kỷ vật mang mã chip ' || p_tag_uid);
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_is_owner := COALESCE(v_mem.owner_id = auth.uid(), FALSE);
    v_is_admin := public.is_admin();
  END IF;

  IF p_grant_token IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id AND grant_token = p_grant_token AND expires_at > NOW()
    ) INTO v_has_valid_grant;
    v_is_owner := v_is_owner OR EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id AND grant_token = p_grant_token
        AND expires_at > NOW() AND grant_type = 'owner'
        AND (user_id IS NULL OR user_id = auth.uid())
    );
  END IF;

  IF NOT v_is_owner AND (
    v_mem.availability_status = 'suspended'
    OR (v_mem.availability_status = 'timed_lock' AND (v_mem.unlock_at IS NULL OR NOW() < v_mem.unlock_at))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ niệm hiện chưa khả dụng.',
      'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at));
  END IF;

  IF NOT v_mem.is_protected OR v_is_owner OR v_has_valid_grant THEN
    v_can_see_private := TRUE;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'url', url, 'type', type, 'caption', caption, 'order_index', order_index
  ) ORDER BY order_index ASC), '[]'::jsonb)
  INTO v_media
  FROM public.memory_media
  WHERE memory_id = v_mem.id AND (NOT is_private OR v_can_see_private);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'author', author_name, 'relationship', relationship, 'message', message,
    'created_at', to_char(created_at, 'DD/MM/YYYY HH24:MI')
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_guestbook
  FROM public.guestbook_entries
  WHERE memory_id = v_mem.id AND NOT is_hidden;

  SELECT COUNT(*) INTO v_tap_count FROM public.nfc_tap_events WHERE memory_id = v_mem.id;

  RETURN jsonb_build_object(
    'success', true,
    'tag_uid', v_mem.tag_uid,
    'jewelry_name', v_mem.jewelry_name,
    'title', v_mem.title,
    'date', v_mem.date,
    'quote', v_mem.quote,
    'author', v_mem.author_name,
    'recipient', v_mem.recipient_name,
    'audio_title', v_mem.audio_title,
    'audio_url', v_mem.audio_url,
    'is_protected', v_mem.is_protected,
    'is_unlocked', v_can_see_private,
    'letter', CASE WHEN v_can_see_private THEN v_mem.letter ELSE NULL END,
    'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at),
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'tap_count', v_tap_count,
    'media_gallery', v_media,
    'guestbook', v_guestbook
  );
END;
$$;

-- 5.2 rpc_verify_memory_pin (Rate Limiting)
CREATE OR REPLACE FUNCTION public.rpc_verify_memory_pin(p_tag_uid TEXT, p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_mem RECORD;
  v_grant_token UUID;
  v_fail RECORD;
BEGIN
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ vật không tồn tại.');
  END IF;

  INSERT INTO public.memory_pin_failures (memory_id) VALUES (v_mem.id)
  ON CONFLICT (memory_id) DO NOTHING;
  SELECT * INTO v_fail FROM public.memory_pin_failures WHERE memory_id = v_mem.id FOR UPDATE;

  IF v_fail.locked_until IS NOT NULL THEN
    IF NOW() < v_fail.locked_until THEN
      RETURN jsonb_build_object('success', false, 'message', 'Mã PIN đã bị khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau.');
    ELSE
      UPDATE public.memory_pin_failures SET failed_count = 0, locked_until = NULL, last_attempt_at = NOW() WHERE memory_id = v_mem.id;
      v_fail.failed_count := 0;
      v_fail.locked_until := NULL;
    END IF;
  END IF;

  IF NOT COALESCE(v_mem.owner_id = auth.uid(), FALSE) AND (
    v_mem.availability_status = 'suspended'
    OR (v_mem.availability_status = 'timed_lock' AND (v_mem.unlock_at IS NULL OR NOW() < v_mem.unlock_at))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ niệm hiện chưa khả dụng.');
  END IF;

  IF NOT v_mem.is_protected THEN
    RETURN jsonb_build_object('success', true, 'message', 'Kỷ niệm công khai.');
  END IF;

  IF p_pin IS NULL OR v_mem.pin_hash IS NULL OR v_mem.pin_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
     OR crypt(p_pin, v_mem.pin_hash) IS DISTINCT FROM v_mem.pin_hash THEN
    IF v_fail.failed_count + 1 >= 5 THEN
      UPDATE public.memory_pin_failures SET failed_count = 5, locked_until = NOW() + INTERVAL '15 minutes', last_attempt_at = NOW() WHERE memory_id = v_mem.id;
      RETURN jsonb_build_object('success', false, 'message', 'Mã PIN đã bị khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau.');
    ELSE
      UPDATE public.memory_pin_failures SET failed_count = failed_count + 1, last_attempt_at = NOW() WHERE memory_id = v_mem.id;
      RETURN jsonb_build_object('success', false, 'message', 'Mã PIN bảo mật không chính xác.');
    END IF;
  END IF;

  UPDATE public.memory_pin_failures SET failed_count = 0, locked_until = NULL, last_attempt_at = NOW() WHERE memory_id = v_mem.id;

  v_grant_token := gen_random_uuid();
  INSERT INTO public.access_grants (memory_id, grant_token, grant_type, user_id, expires_at)
  VALUES (v_mem.id, v_grant_token, 'viewer', auth.uid(), NOW() + INTERVAL '2 hours');

  RETURN jsonb_build_object(
    'success', true,
    'grant_token', v_grant_token,
    'expires_at', NOW() + INTERVAL '2 hours',
    'expires_in_seconds', 7200,
    'message', 'Mở khóa thành công.'
  );
END;
$$;

-- 5.3 rpc_claim_nfc_chip (Chống nhận trùng)
CREATE OR REPLACE FUNCTION public.rpc_claim_nfc_chip(p_tag_uid TEXT, p_claim_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_mem RECORD;
  v_input_hash TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để nhận quyền sở hữu chip NFC.');
  END IF;
  IF p_claim_code IS NULL OR length(trim(p_claim_code)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Mã nhận quyền sở hữu không hợp lệ.');
  END IF;

  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid)) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Mã chip không tồn tại.');
  END IF;

  IF v_mem.owner_id IS NOT NULL THEN
    IF v_mem.owner_id = auth.uid() THEN
      RETURN jsonb_build_object('success', true, 'message', 'Bạn đã là chủ sở hữu của chiếc trang sức này.');
    ELSE
      RETURN jsonb_build_object('success', false, 'message', 'Chiếc trang sức này đã có người sở hữu.');
    END IF;
  END IF;

  v_input_hash := encode(digest(trim(p_claim_code), 'sha256'), 'hex');
  IF v_mem.claim_code_hash IS NOT NULL AND v_mem.claim_code_hash <> v_input_hash THEN
    RETURN jsonb_build_object('success', false, 'message', 'Mã bảo mật nhận quyền sở hữu (Claim Code) không chính xác.');
  END IF;

  UPDATE public.memory_spaces SET owner_id = auth.uid(), updated_at = NOW() WHERE id = v_mem.id;
  RETURN jsonb_build_object('success', true, 'message', 'Đã nhận quyền sở hữu thành công! Bạn có thể chỉnh sửa không gian kỷ niệm này.');
END;
$$;

-- 5.4 rpc_update_memory_space
CREATE OR REPLACE FUNCTION public.rpc_update_memory_space(p_tag_uid TEXT, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_mem RECORD;
  v_pin_action TEXT;
  v_new_pin TEXT;
  v_new_pin_hash TEXT;
BEGIN
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ vật không tồn tại.');
  END IF;

  IF NOT COALESCE(v_mem.owner_id = auth.uid(), FALSE) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Bạn không phải là chủ nhân của kỷ vật này.');
  END IF;

  v_pin_action := p_payload->>'pin_action';
  v_new_pin := p_payload->>'pin_code';
  v_new_pin_hash := v_mem.pin_hash;

  IF v_pin_action = 'SET' AND v_new_pin IS NOT NULL AND length(trim(v_new_pin)) >= 4 THEN
    v_new_pin_hash := crypt(trim(v_new_pin), gen_salt('bf', 10));
    v_mem.is_protected := TRUE;
  ELSIF v_pin_action = 'REMOVE' THEN
    v_new_pin_hash := NULL;
    v_mem.is_protected := FALSE;
  END IF;

  IF v_new_pin_hash IS DISTINCT FROM v_mem.pin_hash THEN
    DELETE FROM public.access_grants WHERE memory_id = v_mem.id AND grant_type = 'viewer';
  END IF;

  UPDATE public.memory_spaces SET
    title = COALESCE(p_payload->>'title', title),
    quote = COALESCE(p_payload->>'quote', quote),
    letter = COALESCE(p_payload->>'letter', letter),
    author_name = COALESCE(p_payload->>'author', author_name),
    recipient_name = COALESCE(p_payload->>'recipient', recipient_name),
    audio_title = COALESCE(p_payload->>'audio_title', audio_title),
    audio_url = COALESCE(p_payload->>'audio_url', audio_url),
    is_protected = v_mem.is_protected,
    pin_hash = v_new_pin_hash,
    updated_at = NOW()
  WHERE id = v_mem.id;

  RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thành công.');
END;
$$;

-- 5.5 rpc_moderate_guestbook
CREATE OR REPLACE FUNCTION public.rpc_moderate_guestbook(p_entry_id UUID, p_is_hidden BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_is_hidden IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Yêu cầu không hợp lệ hoặc chưa đăng nhập.');
  END IF;
  UPDATE public.guestbook_entries e SET is_hidden = p_is_hidden
  WHERE e.id = p_entry_id AND (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.memory_spaces m WHERE m.id = e.memory_id AND m.owner_id = auth.uid()
  ));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không có quyền quản lý lời nhắn này hoặc lời nhắn không tồn tại.');
  END IF;
  RETURN jsonb_build_object('success', true, 'is_hidden', p_is_hidden);
END;
$$;

-- 5.6 rpc_get_system_status
CREATE OR REPLACE FUNCTION public.rpc_get_system_status()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_config JSONB;
BEGIN
  SELECT value INTO v_config FROM public.system_settings WHERE key = 'maintenance_config';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Chưa có cấu hình bảo trì trên máy chủ.');
  END IF;
  RETURN jsonb_build_object('success', true,
    'is_maintenance_mode', COALESCE((v_config->>'is_maintenance_mode')::boolean, true),
    'maintenance_message', COALESCE(v_config->>'maintenance_message', 'Hệ thống đang bảo trì.'));
END;
$$;

-- 5.7 rpc_create_order (Atomic Checkout)
CREATE OR REPLACE FUNCTION public.rpc_create_order(p_request_id UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  previous public.checkout_requests;
  line jsonb;
  product public.checkout_products;
  qty integer;
  variant text;
  available integer;
  subtotal bigint := 0;
  gift bigint := 0;
  shipping bigint;
  method text := p_payload->>'paymentMethod';
  order_status text;
  order_id text := 'EMO-' || replace(gen_random_uuid()::text, '-', '')::varchar(28);
  normalized_items jsonb := '[]'::jsonb;
  response jsonb;
  phone text := regexp_replace(coalesce(p_payload->>'phone',''), '[^0-9]', '', 'g');
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing checkout request ID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO previous FROM public.checkout_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF previous.actor_id IS DISTINCT FROM auth.uid() OR previous.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Checkout request conflict';
    END IF;
    RETURN previous.response;
  END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid items'; END IF;
  IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50
    OR length(trim(coalesce(p_payload->>'customerName',''))) NOT BETWEEN 1 AND 200
    OR length(trim(coalesce(p_payload->>'address',''))) NOT BETWEEN 1 AND 1000
    OR length(phone) NOT BETWEEN 9 AND 11
    OR method IS NULL OR method NOT IN ('cod','vietqr') THEN
    RAISE EXCEPTION 'Invalid checkout details';
  END IF;
  IF coalesce((p_payload->>'hasGiftBox')::boolean,false) THEN gift := 35000; END IF;
  order_status := CASE WHEN method = 'vietqr' THEN 'pending_payment' ELSE 'confirmed' END;

  FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'id', value->>'size'
  LOOP
    IF coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    qty := (line->>'quantity')::integer;
    variant := coalesce(nullif(trim(line->>'size'),''),'Tiêu chuẩn');
    SELECT * INTO product FROM public.checkout_products WHERE id = line->>'id' AND active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive product'; END IF;
    SELECT stock INTO available FROM public.checkout_variants WHERE product_id = product.id AND size = variant FOR UPDATE;
    IF NOT FOUND OR available < qty THEN RAISE EXCEPTION 'Variant unavailable or insufficient stock'; END IF;
    UPDATE public.checkout_variants SET stock = stock - qty WHERE product_id = product.id AND size = variant;
    subtotal := subtotal + product.price * qty;
    IF coalesce((line->>'isGift')::boolean,false) THEN gift := 35000; END IF;
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'id',product.id,'name',product.name,'price',product.price,'quantity',qty,
      'size',variant,'image',product.image_url,'isGift',coalesce((line->>'isGift')::boolean,false)));
  END LOOP;
  shipping := CASE WHEN subtotal >= 1000000 THEN 0 ELSE 30000 END;
  INSERT INTO public.orders(id,user_id,customer_name,phone,email,address,city,note,payment_method,status,subtotal,gift_wrap_fee,shipping_fee,final_total)
  VALUES(order_id,auth.uid(),trim(p_payload->>'customerName'),phone,p_payload->>'email',trim(p_payload->>'address'),
    coalesce(p_payload->>'city','Hồ Chí Minh'),p_payload->>'note',method,order_status,subtotal,gift,shipping,subtotal+gift+shipping);
  INSERT INTO public.order_items(order_id,product_id,product_name,size,unit_price,quantity,is_gift,image_url)
  SELECT order_id, value->>'id',value->>'name',value->>'size',(value->>'price')::bigint,
    (value->>'quantity')::integer,(value->>'isGift')::boolean,value->>'image'
  FROM jsonb_array_elements(normalized_items);
  response := jsonb_build_object('success',true,'order',jsonb_build_object(
    'id',order_id,'customerName',trim(p_payload->>'customerName'),'phone',phone,'email',p_payload->>'email',
    'address',trim(p_payload->>'address'),'city',p_payload->>'city','note',p_payload->>'note',
    'paymentMethod',method,'status',order_status,'createdAt',now(),'items',normalized_items,
    'totals',jsonb_build_object('subtotal',subtotal,'giftWrapFee',gift,'shippingFee',shipping,'finalTotal',subtotal+gift+shipping),
    'statusTimeline',jsonb_build_array(jsonb_build_object('status',order_status,'time',now(),'description','Đơn hàng đã được tiếp nhận'))));
  INSERT INTO public.checkout_requests(request_id,actor_id,payload,response) VALUES(p_request_id,auth.uid(),p_payload,response);
  RETURN response;
END;
$$;

-- 5.8 Phân Quyền Thực Thi Hàm (Permissions)
REVOKE ALL ON FUNCTION public.rpc_get_memory_view(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_memory_view(TEXT, UUID) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_verify_memory_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_verify_memory_pin(TEXT, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_claim_nfc_chip(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_claim_nfc_chip(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_update_memory_space(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_memory_space(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_moderate_guestbook(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_moderate_guestbook(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_get_system_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_system_status() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_create_order(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_order(UUID, JSONB) TO anon, authenticated;

-- ==============================================================================
-- 6. DỮ LIỆU CẤU HÌNH BAN ĐẦU (INITIAL CONFIG & CATALOG)
-- ==============================================================================

-- 6.1 Cấu hình bảo trì mặc định (Hệ thống mở)
INSERT INTO public.system_settings (key, value)
VALUES ('maintenance_config', '{
  "is_maintenance_mode": false,
  "maintenance_message": "Không gian Emoria Luxury đang trong phiên bảo dưỡng định kỳ."
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 6.2 Catalog 6 Sản Phẩm Chuẩn (Giá niêm yết chính hãng, khớp mã sản phẩm trên UI)
INSERT INTO public.checkout_products (id, name, price, image_url, active) VALUES
('emoria-pulse', 'EMORIA PULSE', 269000, '/assets/product_pulse.png', true),
('emoria-horizon', 'EMORIA HORIZON', 279000, '/assets/product_horizon.png', true),
('emoria-halo', 'EMORIA HALO', 229000, '/assets/product_halo.png', true),
('emoria-lumen', 'EMORIA LUMEN', 299000, '/assets/product_lumen.png', true),
('emoria-solaris-keyring', 'EMORIA SOLARIS KEYRING', 189000, '/assets/product_halo.png', true),
('emoria-celestial-duo', 'EMORIA CELESTIAL DUO', 349000, '/assets/summer_box.png', true)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 7. HỆ THỐNG BÀI VIẾT, BÌNH LUẬN & TƯƠNG TÁC (ARTICLES & ENGAGEMENT)
-- ==============================================================================
-- ==============================================================================
-- EMORIA LUXURY - BÀI VIẾT, BÌNH LUẬN, TƯƠNG TÁC & QUẢN TRỊ (ARTICLES & ENGAGEMENT)
-- Phiên bản: 20260914_articles_system
-- Mô tả: Cung cấp đầy đủ cơ sở dữ liệu, RLS và RPC cho bài viết tin tức/câu chuyện,
--        hệ thống bình luận 1 cấp có kiểm duyệt, thích bài viết, lưu bài viết riêng tư,
--        báo cáo vi phạm, và quản trị xuất bản cho Admin.
-- ==============================================================================

-- 1. BẢNG BÀI VIẾT (ARTICLES)
CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    cover_image TEXT,
    category TEXT NOT NULL DEFAULT 'Câu chuyện EMORIA',
    tags TEXT[] DEFAULT '{}',
    author_name TEXT DEFAULT 'EMORIA',
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at TIMESTAMPTZ,
    view_count BIGINT DEFAULT 0,
    likes_count BIGINT DEFAULT 0,
    related_product_ids TEXT[] DEFAULT '{}',
    allow_comments BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG BÌNH LUẬN BÀI VIẾT (ARTICLE COMMENTS - HỖ TRỢ TRẢ LỜI 1 CẤP)
CREATE TABLE IF NOT EXISTS public.article_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.article_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG THÍCH BÀI VIẾT (ARTICLE LIKES)
CREATE TABLE IF NOT EXISTS public.article_likes (
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (article_id, user_id)
);

-- 4. BẢNG LƯU BÀI VIẾT (ARTICLE BOOKMARKS - HOÀN TOÀN RIÊNG TƯ)
CREATE TABLE IF NOT EXISTS public.article_bookmarks (
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (article_id, user_id)
);

-- 5. BẢNG BÁO CÁO VI PHẠM BÌNH LUẬN (COMMENT REPORTS)
CREATE TABLE IF NOT EXISTS public.comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES public.article_comments(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (comment_id, reporter_id)
);

-- ==============================================================================
-- 6. BẬT ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

-- 6.1 Policies cho Articles
-- Khách vãng lai và user thường chỉ đọc bài đã published; Admin đọc tất cả (draft, archived)
DROP POLICY IF EXISTS articles_public_read ON public.articles;
CREATE POLICY articles_public_read ON public.articles FOR SELECT
    USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS articles_admin_manage ON public.articles;
CREATE POLICY articles_admin_manage ON public.articles FOR ALL
    TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6.2 Policies cho Article Comments
-- Người khác chỉ thấy comment approved trên bài published; Chính chủ thấy comment của mình; Admin thấy hết
DROP POLICY IF EXISTS comments_read ON public.article_comments;
CREATE POLICY comments_read ON public.article_comments FOR SELECT
    USING (
        (status = 'approved' AND EXISTS (
            SELECT 1 FROM public.articles a WHERE a.id = article_comments.article_id AND a.status = 'published'
        ))
        OR user_id = auth.uid()
        OR public.is_admin()
    );

DROP POLICY IF EXISTS comments_insert ON public.article_comments;
CREATE POLICY comments_insert ON public.article_comments FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND length(trim(content)) BETWEEN 1 AND 2000
        AND EXISTS (
            SELECT 1 FROM public.articles a 
            WHERE a.id = article_comments.article_id 
              AND a.status = 'published' 
              AND a.allow_comments = TRUE
        )
    );

DROP POLICY IF EXISTS comments_owner_update ON public.article_comments;
CREATE POLICY comments_owner_update ON public.article_comments FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS comments_owner_delete ON public.article_comments;
CREATE POLICY comments_owner_delete ON public.article_comments FOR DELETE
    TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- 6.3 Policies cho Article Likes
DROP POLICY IF EXISTS likes_read ON public.article_likes;
CREATE POLICY likes_read ON public.article_likes FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS likes_manage ON public.article_likes;
CREATE POLICY likes_manage ON public.article_likes FOR ALL
    TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6.4 Policies cho Article Bookmarks (Tuyệt đối riêng tư)
DROP POLICY IF EXISTS bookmarks_private ON public.article_bookmarks;
CREATE POLICY bookmarks_private ON public.article_bookmarks FOR ALL
    TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6.5 Policies cho Comment Reports
DROP POLICY IF EXISTS reports_insert ON public.comment_reports;
CREATE POLICY reports_insert ON public.comment_reports FOR INSERT
    TO authenticated
    WITH CHECK (reporter_id = auth.uid() AND length(trim(reason)) > 0);

DROP POLICY IF EXISTS reports_admin_read ON public.comment_reports;
CREATE POLICY reports_admin_read ON public.comment_reports FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Phân quyền cơ sở
GRANT SELECT ON public.articles, public.article_comments, public.article_likes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_bookmarks TO authenticated;
GRANT INSERT ON public.article_comments, public.article_likes, public.comment_reports TO authenticated;
GRANT SELECT ON public.comment_reports TO authenticated;

-- ==============================================================================
-- 7. CÁC HÀM NGHIỆP VỤ BẢO MẬT (SECURITY RPC FUNCTIONS)
-- ==============================================================================

-- 7.1 Lấy danh sách bài viết đã xuất bản (kèm lọc danh mục, tìm kiếm và phân trang)
CREATE OR REPLACE FUNCTION public.rpc_get_published_articles(
    p_category TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_limit INT DEFAULT 10,
    p_offset INT DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_total BIGINT;
    v_articles JSONB;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM public.articles
    WHERE status = 'published'
      AND (p_category IS NULL OR p_category = '' OR p_category = 'Tất cả' OR category = p_category)
      AND (p_search IS NULL OR p_search = '' OR (
          title ILIKE '%' || p_search || '%' OR excerpt ILIKE '%' || p_search || '%'
      ));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'slug', slug,
        'title', title,
        'excerpt', excerpt,
        'cover_image', cover_image,
        'category', category,
        'tags', tags,
        'author_name', author_name,
        'published_at', published_at,
        'view_count', view_count,
        'likes_count', likes_count,
        'allow_comments', allow_comments
    ) ORDER BY published_at DESC NULLS LAST, created_at DESC), '[]'::jsonb)
    INTO v_articles
    FROM (
        SELECT *
        FROM public.articles
        WHERE status = 'published'
          AND (p_category IS NULL OR p_category = '' OR p_category = 'Tất cả' OR category = p_category)
          AND (p_search IS NULL OR p_search = '' OR (
              title ILIKE '%' || p_search || '%' OR excerpt ILIKE '%' || p_search || '%'
          ))
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT LEAST(p_limit, 50) OFFSET GREATEST(p_offset, 0)
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'total', v_total,
        'articles', v_articles
    );
END;
$$;

-- 7.2 Lấy chi tiết bài viết (chỉ bài published, hoặc bài nháp nếu là Admin)
CREATE OR REPLACE FUNCTION public.rpc_get_article_detail(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_article RECORD;
    v_is_liked BOOLEAN := FALSE;
    v_is_bookmarked BOOLEAN := FALSE;
    v_comments JSONB;
BEGIN
    SELECT * INTO v_article
    FROM public.articles
    WHERE slug = lower(trim(p_slug));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy bài viết.');
    END IF;

    -- Nếu không phải published và caller không phải admin -> từ chối
    IF v_article.status <> 'published' AND NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết hiện không khả dụng.');
    END IF;

    -- Tăng lượt xem an toàn khi bài published
    IF v_article.status = 'published' THEN
        UPDATE public.articles SET view_count = view_count + 1 WHERE id = v_article.id;
    END IF;

    -- Kiểm tra like & bookmark của caller
    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.article_likes WHERE article_id = v_article.id AND user_id = auth.uid()
        ) INTO v_is_liked;

        SELECT EXISTS (
            SELECT 1 FROM public.article_bookmarks WHERE article_id = v_article.id AND user_id = auth.uid()
        ) INTO v_is_bookmarked;
    END IF;

    -- Lấy danh sách bình luận (approved hoặc của chính caller nếu đang pending)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'parent_id', c.parent_id,
        'author_name', COALESCE(p.full_name, 'Khách hàng EMORIA'),
        'author_avatar', p.avatar_url,
        'content', c.content,
        'status', c.status,
        'created_at', to_char(c.created_at, 'DD/MM/YYYY HH24:MI'),
        'is_mine', (auth.uid() IS NOT NULL AND c.user_id = auth.uid())
    ) ORDER BY c.created_at ASC), '[]'::jsonb)
    INTO v_comments
    FROM public.article_comments c
    LEFT JOIN public.profiles p ON p.id = c.user_id
    WHERE c.article_id = v_article.id
      AND (c.status = 'approved' OR (auth.uid() IS NOT NULL AND c.user_id = auth.uid()) OR public.is_admin());

    RETURN jsonb_build_object(
        'success', true,
        'article', jsonb_build_object(
            'id', v_article.id,
            'slug', v_article.slug,
            'title', v_article.title,
            'excerpt', v_article.excerpt,
            'content', v_article.content,
            'cover_image', v_article.cover_image,
            'category', v_article.category,
            'tags', v_article.tags,
            'author_name', v_article.author_name,
            'status', v_article.status,
            'published_at', v_article.published_at,
            'view_count', v_article.view_count + CASE WHEN v_article.status = 'published' THEN 1 ELSE 0 END,
            'likes_count', v_article.likes_count,
            'related_product_ids', v_article.related_product_ids,
            'allow_comments', v_article.allow_comments,
            'is_liked', v_is_liked,
            'is_bookmarked', v_is_bookmarked
        ),
        'comments', v_comments
    );
END;
$$;

-- 7.3 Thích / Bỏ thích bài viết nguyên tử
CREATE OR REPLACE FUNCTION public.rpc_toggle_article_like(p_article_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_liked BOOLEAN;
    v_count BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để thích bài viết.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.articles WHERE id = p_article_id AND status = 'published') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết không tồn tại hoặc chưa xuất bản.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.article_likes WHERE article_id = p_article_id AND user_id = auth.uid()) THEN
        DELETE FROM public.article_likes WHERE article_id = p_article_id AND user_id = auth.uid();
        v_liked := FALSE;
    ELSE
        INSERT INTO public.article_likes (article_id, user_id) VALUES (p_article_id, auth.uid());
        v_liked := TRUE;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.article_likes WHERE article_id = p_article_id;
    UPDATE public.articles SET likes_count = v_count WHERE id = p_article_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_liked', v_liked,
        'likes_count', v_count
    );
END;
$$;

-- 7.4 Lưu / Bỏ lưu bài viết (Bookmark cá nhân)
CREATE OR REPLACE FUNCTION public.rpc_toggle_article_bookmark(p_article_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_bookmarked BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để lưu bài viết.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.articles WHERE id = p_article_id AND status = 'published') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết không tồn tại hoặc chưa xuất bản.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.article_bookmarks WHERE article_id = p_article_id AND user_id = auth.uid()) THEN
        DELETE FROM public.article_bookmarks WHERE article_id = p_article_id AND user_id = auth.uid();
        v_bookmarked := FALSE;
    ELSE
        INSERT INTO public.article_bookmarks (article_id, user_id) VALUES (p_article_id, auth.uid());
        v_bookmarked := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_bookmarked', v_bookmarked,
        'message', CASE WHEN v_bookmarked THEN 'Đã lưu bài viết vào tài khoản.' ELSE 'Đã bỏ lưu bài viết.' END
    );
END;
$$;

-- 7.5 Thêm bình luận hoặc trả lời 1 cấp
CREATE OR REPLACE FUNCTION public.rpc_add_article_comment(
    p_article_id UUID,
    p_content TEXT,
    p_parent_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_art RECORD;
    v_parent RECORD;
    v_comment_id UUID;
    v_default_status TEXT := 'pending'; -- Mặc định chờ duyệt để bảo vệ nội dung
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để bình luận.');
    END IF;

    IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nội dung bình luận không được để trống.');
    END IF;

    IF length(trim(p_content)) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bình luận không được vượt quá 2000 ký tự.');
    END IF;

    SELECT * INTO v_art FROM public.articles WHERE id = p_article_id AND status = 'published';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết không tồn tại hoặc chưa xuất bản.');
    END IF;

    IF NOT v_art.allow_comments THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết này hiện đã đóng phần bình luận.');
    END IF;

    -- Kiểm tra parent_id: chỉ cho phép trả lời 1 cấp
    IF p_parent_id IS NOT NULL THEN
        SELECT * INTO v_parent FROM public.article_comments WHERE id = p_parent_id AND article_id = p_article_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Bình luận gốc không tồn tại.');
        END IF;
        -- Ngăn chặn lồng nhiều cấp: Nếu parent_id bản thân nó đã có parent_id thì từ chối
        IF v_parent.parent_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Hệ thống chỉ hỗ trợ phản hồi 1 cấp.');
        END IF;
    END IF;

    -- Nếu là Admin thì bình luận tự động approved
    IF public.is_admin() THEN
        v_default_status := 'approved';
    END IF;

    INSERT INTO public.article_comments (article_id, user_id, parent_id, content, status)
    VALUES (p_article_id, auth.uid(), p_parent_id, trim(p_content), v_default_status)
    RETURNING id INTO v_comment_id;

    RETURN jsonb_build_object(
        'success', true,
        'comment_id', v_comment_id,
        'status', v_default_status,
        'message', CASE 
            WHEN v_default_status = 'approved' THEN 'Bình luận đã được đăng thành công.'
            ELSE 'Bình luận đã được gửi và đang chờ ban quản trị kiểm duyệt.'
        END
    );
END;
$$;

-- 7.6 Kiểm duyệt bình luận (Dành cho Admin)
CREATE OR REPLACE FUNCTION public.rpc_moderate_article_comment(
    p_comment_id UUID,
    p_status TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Yêu cầu quyền Quản trị viên.');
    END IF;

    IF p_status NOT IN ('approved', 'hidden', 'deleted') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Trạng thái kiểm duyệt không hợp lệ.');
    END IF;

    UPDATE public.article_comments
    SET status = p_status, updated_at = NOW()
    WHERE id = p_comment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy bình luận.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã cập nhật trạng thái bình luận thành công.');
END;
$$;

-- 7.7 Quản trị bài viết: Tạo / Sửa / Xuất bản (Dành cho Admin)
CREATE OR REPLACE FUNCTION public.rpc_save_article_admin(
    p_article_id UUID,
    p_payload JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_slug TEXT;
    v_status TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Yêu cầu quyền Quản trị viên.');
    END IF;

    v_slug := lower(trim(COALESCE(p_payload->>'slug', '')));
    IF length(v_slug) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Đường dẫn tĩnh (Slug) không được để trống.');
    END IF;

    v_status := COALESCE(p_payload->>'status', 'draft');
    IF v_status NOT IN ('draft', 'published', 'archived') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Trạng thái bài viết không hợp lệ.');
    END IF;

    IF p_article_id IS NOT NULL THEN
        -- Cập nhật bài viết hiện có
        UPDATE public.articles SET
            slug = v_slug,
            title = COALESCE(p_payload->>'title', title),
            excerpt = COALESCE(p_payload->>'excerpt', excerpt),
            content = COALESCE(p_payload->>'content', content),
            cover_image = COALESCE(p_payload->>'cover_image', cover_image),
            category = COALESCE(p_payload->>'category', category),
            author_name = COALESCE(p_payload->>'author_name', author_name),
            status = v_status,
            allow_comments = COALESCE((p_payload->>'allow_comments')::boolean, allow_comments),
            published_at = CASE 
                WHEN v_status = 'published' AND published_at IS NULL THEN NOW() 
                ELSE published_at 
            END,
            updated_at = NOW()
        WHERE id = p_article_id
        RETURNING id INTO v_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy bài viết để cập nhật.');
        END IF;
    ELSE
        -- Tạo mới bài viết
        INSERT INTO public.articles (
            slug, title, excerpt, content, cover_image, category, author_name,
            author_id, status, allow_comments, published_at
        ) VALUES (
            v_slug,
            COALESCE(p_payload->>'title', 'Bài viết mới'),
            p_payload->>'excerpt',
            COALESCE(p_payload->>'content', ''),
            p_payload->>'cover_image',
            COALESCE(p_payload->>'category', 'Câu chuyện EMORIA'),
            COALESCE(p_payload->>'author_name', 'EMORIA'),
            auth.uid(),
            v_status,
            COALESCE((p_payload->>'allow_comments')::boolean, TRUE),
            CASE WHEN v_status = 'published' THEN NOW() ELSE NULL END
        )
        RETURNING id INTO v_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'article_id', v_id,
        'slug', v_slug,
        'status', v_status,
        'message', 'Đã lưu bài viết thành công.'
    );
END;
$$;

-- Phân quyền thực thi RPC
REVOKE ALL ON FUNCTION public.rpc_get_published_articles(TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_published_articles(TEXT, TEXT, INT, INT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_article_detail(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_article_detail(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_toggle_article_like(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_article_like(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_toggle_article_bookmark(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_article_bookmark(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_add_article_comment(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_article_comment(UUID, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_moderate_article_comment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_moderate_article_comment(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_save_article_admin(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_article_admin(UUID, JSONB) TO authenticated;

COMMIT;
