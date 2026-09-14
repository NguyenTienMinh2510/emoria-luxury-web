-- ==============================================================================
-- EMORIA LUXURY - POSTGRESQL SCHEMA & ROW LEVEL SECURITY (RLS) MIGRATION
-- Version: 20260913_init_emoria_schema
-- Description: Khởi tạo toàn bộ cơ sở dữ liệu xác thực, quản lý quyền sở hữu chip NFC,
--              bảo mật mã PIN không rò rỉ, phân quyền 4 vai trò, kiểm soát tính khả dụng,
--              và quản lý đơn hàng.
-- ==============================================================================

-- 1. Bật Extensions cần thiết
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TẠO CÁC BẢNG CƠ SỞ (CORE TABLES)
-- ==============================================================================

-- 2.1 Bảng Profiles (Liên kết chặt với Supabase Auth)
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
    letter TEXT, -- Nội dung riêng tư (Private)
    audio_title TEXT,
    audio_url TEXT,
    is_protected BOOLEAN DEFAULT FALSE,
    pin_hash TEXT, -- bcrypt với salt qua pgcrypto (Không lưu plaintext)
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    claim_code_hash TEXT, -- Mã xác nhận quyền sở hữu ngẫu nhiên có hash
    availability_status TEXT DEFAULT 'available' CHECK (availability_status IN ('available', 'timed_lock', 'suspended')),
    unlock_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 Bảng Memory Media (Ảnh & Video của Kỷ vật)
CREATE TABLE IF NOT EXISTS public.memory_pin_failures (
    memory_id UUID PRIMARY KEY REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    failed_count INT NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.memory_pin_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memory_pin_failures FROM PUBLIC, anon, authenticated;

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

-- 2.5 Bảng Guestbook Entries (Sổ lưu bút & Lời chúc gửi vào kỷ vật)
CREATE TABLE IF NOT EXISTS public.guestbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    relationship TEXT,
    message TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 Bảng Access Grants (Quyền truy cập có thời hạn cấp sau khi nhập đúng PIN)
CREATE TABLE IF NOT EXISTS public.access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    grant_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    grant_type TEXT DEFAULT 'viewer' CHECK (grant_type IN ('viewer', 'owner')),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 Bảng NFC Tap Events (Nhật ký số lần chạm thẻ chip vật lý)
CREATE TABLE IF NOT EXISTS public.nfc_tap_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
    device_type TEXT,
    user_agent TEXT,
    tapped_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.8 Bảng System Settings (Cấu hình khả dụng toàn trang - Bảo trì / VIP Salon)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id)
);

-- 2.9 Bảng Orders (Đơn hàng mua sắm trang sức)
CREATE TABLE IF NOT EXISTS public.orders (
    id VARCHAR(32) PRIMARY KEY, -- e.g. EMO-849201
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

-- 2.10 Bảng Order Items (Chi tiết các sản phẩm trong đơn)
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

-- ==============================================================================
-- 3. CÁC HÀM TIỆN ÍCH PHÂN QUYỀN (HELPER FUNCTIONS)
-- ==============================================================================

-- Kiểm tra xem caller hiện tại có phải là Admin hay không
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

-- Tự động đồng bộ profile khi có user mới từ Supabase Auth
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
ALTER TABLE public.memory_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guestbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_tap_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 4.1 Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 4.2 Role Assignments Policies (Chỉ Admin mới được xem và gán quyền)
CREATE POLICY "Admins can view role assignments" 
  ON public.role_assignments FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can manage role assignments" 
  ON public.role_assignments FOR ALL USING (public.is_admin());

-- 4.3 Memory Spaces Policies
-- RLS lọc hàng, không lọc cột: nội dung và secrets chỉ được đọc qua RPC.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.memory_spaces FROM anon, authenticated;
GRANT SELECT (id, tag_uid, jewelry_name, availability_status, unlock_at) ON public.memory_spaces TO anon, authenticated;
GRANT UPDATE (availability_status, unlock_at, updated_at) ON public.memory_spaces TO authenticated;

CREATE POLICY "Public read memory metadata"
  ON public.memory_spaces FOR SELECT
  USING (
    availability_status = 'available' 
    OR owner_id = auth.uid() 
    OR public.is_admin()
  );

CREATE POLICY "Admins can update memory availability"
  ON public.memory_spaces FOR UPDATE
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4.4 Guestbook Policies
CREATE POLICY "Anyone can view approved guestbook entries"
  ON public.guestbook_entries FOR SELECT
  USING (NOT is_hidden);

CREATE POLICY "Anyone can submit guestbook entries"
  ON public.guestbook_entries FOR INSERT
  WITH CHECK (length(trim(author_name)) > 0 AND length(trim(message)) > 0);

CREATE POLICY "Owners can manage guestbook entries of their memory"
  ON public.guestbook_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.memory_spaces m
      WHERE m.id = guestbook_entries.memory_id AND (m.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- 4.5 System Settings Policies
CREATE POLICY "Anyone can read system settings"
  ON public.system_settings FOR SELECT USING (public.is_admin());

CREATE POLICY "Only admins can modify system settings"
  ON public.system_settings FOR ALL USING (public.is_admin());

-- 4.6 Orders Policies
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Anyone can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (length(trim(customer_name)) > 0 AND length(trim(phone)) >= 9);

CREATE POLICY "Only admins can update orders status"
  ON public.orders FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Users can view their order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND (o.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ==============================================================================
-- 5. CÁC HÀM NGHIỆP VỤ BẢO MẬT (SECURITY RPC FUNCTIONS)
-- ==============================================================================

-- 5.1 Lấy dữ liệu hiển thị Kỷ Niệm (CHỐNG RÒ RỈ THƯ & SECRET KHI CHƯA MỞ PIN)
CREATE OR REPLACE FUNCTION public.rpc_get_memory_view(p_tag_uid TEXT, p_grant_token UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- 1. Tìm memory space
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy kỷ vật mang mã chip ' || p_tag_uid);
  END IF;

  -- 2. Admin chỉ quản lý vận hành, không mặc nhiên có quyền đọc riêng tư.
  IF auth.uid() IS NOT NULL THEN
    v_is_owner := COALESCE(v_mem.owner_id = auth.uid(), FALSE);
    v_is_admin := public.is_admin();
  END IF;

  -- 3. Kiểm tra Access Grant Token
  IF p_grant_token IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id 
        AND grant_token = p_grant_token 
        AND expires_at > NOW()
    ) INTO v_has_valid_grant;
    v_is_owner := v_is_owner OR EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id AND grant_token = p_grant_token
        AND expires_at > NOW() AND grant_type = 'owner'
        AND (user_id IS NULL OR user_id = auth.uid())
    );
  END IF;

  -- Viewer grant và vai trò Admin không được vượt qua gate khả dụng.
  IF NOT v_is_owner AND (
    v_mem.availability_status = 'suspended'
    OR (v_mem.availability_status = 'timed_lock'
        AND (v_mem.unlock_at IS NULL OR NOW() < v_mem.unlock_at))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ niệm hiện chưa khả dụng.',
      'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at));
  END IF;

  -- 4. Xác định quyền xem thư tay và private media
  IF NOT v_mem.is_protected OR v_is_owner OR v_has_valid_grant THEN
    v_can_see_private := TRUE;
  END IF;

  -- 5. Lấy danh sách Media
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'url', url,
    'type', type,
    'caption', caption,
    'order_index', order_index
  ) ORDER BY order_index ASC), '[]'::jsonb)
  INTO v_media
  FROM public.memory_media
  WHERE memory_id = v_mem.id AND (NOT is_private OR v_can_see_private);

  -- 6. Lấy danh sách Guestbook
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'author', author_name,
    'relationship', relationship,
    'message', message,
    'created_at', to_char(created_at, 'DD/MM/YYYY HH24:MI')
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_guestbook
  FROM public.guestbook_entries
  WHERE memory_id = v_mem.id AND NOT is_hidden;

  -- 7. Lấy số lượt chạm NFC
  SELECT COUNT(*) INTO v_tap_count FROM public.nfc_tap_events WHERE memory_id = v_mem.id;

  -- 8. Trả về đối tượng JSON đã lọc dữ liệu nhạy cảm
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
    -- TUYỆT ĐỐI KHÔNG TRẢ THƯ RIÊNG TƯ NẾU CHƯA MỞ KHÓA
    'letter', CASE WHEN v_can_see_private THEN v_mem.letter ELSE NULL END,
    'availability', jsonb_build_object(
      'status', v_mem.availability_status,
      'unlock_date', v_mem.unlock_at
    ),
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'tap_count', v_tap_count,
    'media_gallery', v_media,
    'guestbook', v_guestbook
  );
END;
$$;

-- 5.2 Xác thực mã PIN bảo mật phía Server và cấp Grant Token
CREATE OR REPLACE FUNCTION public.rpc_verify_memory_pin(p_tag_uid TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mem RECORD;
  v_grant_token UUID;
  v_failure public.memory_pin_failures%ROWTYPE;
  v_pin_valid BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ vật không tồn tại.');
  END IF;

  IF NOT COALESCE(v_mem.owner_id = auth.uid(), FALSE) AND (
    v_mem.availability_status = 'suspended'
    OR (v_mem.availability_status = 'timed_lock'
        AND (v_mem.unlock_at IS NULL OR NOW() < v_mem.unlock_at))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ niệm hiện chưa khả dụng.');
  END IF;

  IF NOT v_mem.is_protected THEN
    RETURN jsonb_build_object('success', true, 'message', 'Kỷ niệm công khai.');
  END IF;

  -- Khóa hàng đếm để các yêu cầu đồng thời không vượt qua giới hạn.
  INSERT INTO public.memory_pin_failures (memory_id) VALUES (v_mem.id)
  ON CONFLICT (memory_id) DO NOTHING;
  SELECT * INTO v_failure FROM public.memory_pin_failures
  WHERE memory_id = v_mem.id FOR UPDATE;
  IF v_failure.locked_until > NOW() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Mã PIN đã bị khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau.');
  END IF;
  IF v_failure.locked_until IS NOT NULL THEN
    v_failure.failed_count := 0;
  END IF;

  -- PIN NULL/hash không hợp lệ cũng tính là một lần sai.
  IF p_pin IS NOT NULL AND v_mem.pin_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
    v_pin_valid := crypt(p_pin, v_mem.pin_hash) IS NOT DISTINCT FROM v_mem.pin_hash;
  END IF;
  IF NOT v_pin_valid THEN
    v_failure.failed_count := v_failure.failed_count + 1;
    UPDATE public.memory_pin_failures SET
      failed_count = v_failure.failed_count,
      locked_until = CASE WHEN v_failure.failed_count >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
      last_attempt_at = NOW()
    WHERE memory_id = v_mem.id;
    IF v_failure.failed_count >= 5 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Mã PIN đã bị khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau.');
    END IF;
    RETURN jsonb_build_object('success', false, 'message', 'Mã PIN bảo mật không chính xác.');
  END IF;
  UPDATE public.memory_pin_failures SET failed_count = 0, locked_until = NULL, last_attempt_at = NOW()
  WHERE memory_id = v_mem.id;

  -- Đúng PIN -> Tạo Grant Token có hạn 2 giờ
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

-- 5.3 Nhận quyền sở hữu chip NFC (Claim Ownership)
CREATE OR REPLACE FUNCTION public.rpc_claim_nfc_chip(p_tag_uid TEXT, p_claim_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mem RECORD;
  v_input_hash TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để nhận quyền sở hữu chip NFC.');
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

  v_input_hash := encode(digest(p_claim_code, 'sha256'), 'hex');
  IF p_claim_code IS NULL OR v_mem.claim_code_hash IS NULL OR v_mem.claim_code_hash IS DISTINCT FROM v_input_hash THEN
    RETURN jsonb_build_object('success', false, 'message', 'Mã bảo mật nhận quyền sở hữu (Claim Code) không chính xác.');
  END IF;

  -- Gán quyền sở hữu an toàn
  UPDATE public.memory_spaces 
  SET owner_id = auth.uid(), updated_at = NOW() 
  WHERE id = v_mem.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã nhận quyền sở hữu thành công! Bạn có thể chỉnh sửa không gian kỷ niệm này.'
  );
END;
$$;

-- 5.4 Chỉnh sửa không gian Kỷ Niệm (Dành cho Chủ sở hữu / Admin)
CREATE OR REPLACE FUNCTION public.rpc_update_memory_space(p_tag_uid TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  -- Chỉ Owner sửa nội dung/PIN; Admin không thể gỡ PIN để đọc thư.
  IF NOT COALESCE(v_mem.owner_id = auth.uid(), FALSE) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Bạn không phải là chủ nhân của kỷ vật này.');
  END IF;

  -- Xử lý mã PIN rõ ràng: KEEP_PIN, SET_NEW_PIN, REMOVE_PIN
  v_pin_action := p_payload->>'pin_action'; -- 'KEEP' | 'SET' | 'REMOVE'
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

  -- Cập nhật
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

-- ==============================================================================
-- Owner/Admin chỉ được kiểm duyệt lời nhắn thuộc phạm vi được phép.
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

-- Không trả VIP passcode/hash cho người đọc trạng thái công khai.
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

-- 6. DỮ LIỆU SEED MẪU (SEED DEMO DATA)
-- ==============================================================================

-- 6.1 Cấu hình bảo trì mặc định
INSERT INTO public.system_settings (key, value)
VALUES ('maintenance_config', '{
  "is_maintenance_mode": false,
  "maintenance_message": "Không gian Emoria Luxury đang trong phiên bảo dưỡng định kỳ.",
  "vip_passcode_hash": "e67406a64f3e6962f928e3b39be8217316315579895c102a3a14e9f7fc9e29f5"
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

