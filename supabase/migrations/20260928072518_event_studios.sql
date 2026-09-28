-- ==============================================================================
-- EMORIA LUXURY - EVENT STUDIOS MIGRATION
-- Version: 20260928072518_event_studios
-- Description: Database schema, storage security boundary, and RPC functions for
--              1) Couple Match Studio (Quiz game with partner invite token & score)
--              2) House Studio (5 fixed rooms, draft/published snapshots, public share)
--              3) Private Event Media Storage Bucket with namespace isolation
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. STORAGE: PRIVATE EVENT IMAGE BUCKET & ACCESS CONTROL
-- ==============================================================================

-- 1.1 Tạo hoặc cấu hình bucket private riêng biệt cho Event Studios (<= 8 MB, JPEG/PNG/WebP)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'emoria-event-media',
  'emoria-event-media',
  false,
  8388608, -- 8 MB (8 * 1024 * 1024)
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- 1.2 Storage RLS Policies: Chỉ chủ sở hữu hiện tại của memory space được thao tác file thuộc namespace của tag
DROP POLICY IF EXISTS "Owner read event media" ON storage.objects;
CREATE POLICY "Owner read event media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'emoria-event-media'
    AND EXISTS (
      SELECT 1 FROM public.memory_spaces m
      WHERE m.tag_uid = lower(split_part(name, '/', 1))
        AND m.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner insert event media" ON storage.objects;
CREATE POLICY "Owner insert event media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'emoria-event-media'
    AND name !~ '(^|/)\.\.(/|$)'
    AND name !~ '^/'
    AND name !~ '//'
    AND position('/' in name) > 0
    AND EXISTS (
      SELECT 1 FROM public.memory_spaces m
      WHERE m.tag_uid = lower(split_part(name, '/', 1))
        AND m.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner update event media" ON storage.objects;
CREATE POLICY "Owner update event media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'emoria-event-media'
    AND EXISTS (
      SELECT 1 FROM public.memory_spaces m
      WHERE m.tag_uid = lower(split_part(name, '/', 1))
        AND m.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'emoria-event-media'
    AND name !~ '(^|/)\.\.(/|$)'
    AND name !~ '^/'
    AND name !~ '//'
    AND position('/' in name) > 0
    AND EXISTS (
      SELECT 1 FROM public.memory_spaces m
      WHERE m.tag_uid = lower(split_part(name, '/', 1))
        AND m.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner delete event media" ON storage.objects;
CREATE POLICY "Owner delete event media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'emoria-event-media'
    AND EXISTS (
      SELECT 1 FROM public.memory_spaces m
      WHERE m.tag_uid = lower(split_part(name, '/', 1))
        AND m.owner_id = auth.uid()
    )
  );

-- Helper function: Kiểm tra ảnh hợp lệ trong bucket emoria-event-media thuộc namespace của tag_uid
CREATE OR REPLACE FUNCTION public.fn_validate_event_photo_path(p_tag text, p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_clean_path TEXT;
  v_tag TEXT;
BEGIN
  IF p_path IS NULL OR length(trim(p_path)) = 0 THEN
    RETURN FALSE;
  END IF;

  v_clean_path := trim(p_path);
  v_tag := lower(trim(p_tag));

  -- Ngăn chặn Directory Traversal và định dạng bất hợp lệ
  IF v_clean_path ~ '(^|/)\.\.(/|$)' OR v_clean_path ~ '^/' OR v_clean_path ~ '//' THEN
    RETURN FALSE;
  END IF;

  -- Namespace format: split_part(path, '/', 1) phải trùng khớp tag_uid của memory
  IF lower(split_part(v_clean_path, '/', 1)) <> v_tag THEN
    RETURN FALSE;
  END IF;

  -- Độ dài hợp lệ
  IF length(v_clean_path) > 500 THEN
    RETURN FALSE;
  END IF;

  -- Bắt buộc file phải tồn tại trong storage bucket emoria-event-media
  RETURN EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'emoria-event-media'
      AND name = v_clean_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_validate_event_photo_path(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_event_photo_path(text, text) TO service_role;

-- ==============================================================================
-- 2. CORE TABLES: MEMORY MATCHES & MEMORY HOUSES
-- ==============================================================================

-- 2.1 Bảng Match Studio (Trò chơi trắc nghiệm thấu hiểu cặp đôi)
CREATE TABLE IF NOT EXISTS public.memory_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Couple Match' CHECK (length(trim(title)) BETWEEN 1 AND 80),
  partner_name TEXT CHECK (partner_name IS NULL OR length(trim(partner_name)) BETWEEN 1 AND 80),
  owner_name TEXT CHECK (owner_name IS NULL OR length(trim(owner_name)) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  partner_token_hash TEXT, -- Lưu SHA-256 hash của bearer invite token
  owner_answers JSONB,     -- Mảng chỉ số đáp án [0, 2, 1, ...]
  owner_submitted_at TIMESTAMPTZ,
  partner_answers JSONB,   -- Mảng chỉ số đáp án phía đối tác
  partner_submitted_at TIMESTAMPTZ,
  score INTEGER,           -- Số câu trùng khớp khi cả hai đã hoàn thành
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_matches_memory_id_idx ON public.memory_matches(memory_id);
CREATE INDEX IF NOT EXISTS memory_matches_token_hash_idx ON public.memory_matches(partner_token_hash) WHERE partner_token_hash IS NOT NULL;

-- 2.2 Bảng House Studio (Ngôi nhà kỷ niệm với 5 phòng cố định)
CREATE TABLE IF NOT EXISTS public.memory_houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID UNIQUE NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Our Memory House' CHECK (length(trim(title)) BETWEEN 1 AND 120),
  theme TEXT NOT NULL DEFAULT 'classic' CHECK (theme IN ('classic', 'warm_gold', 'rose_romance', 'midnight', 'minimal_dark', 'editorial_cream')),
  rooms_draft JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  share_id TEXT UNIQUE, -- Mã chia sẻ ngẫu nhiên cho người xem công khai
  published_snapshot JSONB, -- Bản chụp đóng băng tại thời điểm Publish
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_houses_memory_id_idx ON public.memory_houses(memory_id);
CREATE INDEX IF NOT EXISTS memory_houses_share_id_idx ON public.memory_houses(share_id) WHERE share_id IS NOT NULL;

-- 2.3 Kích hoạt RLS & Thu hồi toàn bộ quyền truy cập bảng trực tiếp
ALTER TABLE public.memory_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_houses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.memory_matches, public.memory_houses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.memory_matches, public.memory_houses TO service_role;

-- ==============================================================================
-- 3. RPC FUNCTIONS: COUPLE MATCH STUDIO
-- ==============================================================================

-- 3.1 Khởi tạo Match mới (hỗ trợ Replay nhiều lượt độc lập, không ghi đè match cũ)
CREATE OR REPLACE FUNCTION public.rpc_match_create(
  p_tag_uid TEXT,
  p_title TEXT DEFAULT 'Couple Match',
  p_partner_name TEXT DEFAULT NULL,
  p_owner_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mem RECORD;
  v_match_id UUID;
  v_title TEXT := COALESCE(nullif(trim(p_title), ''), 'Couple Match');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Vui lòng đăng nhập để tạo lượt chơi' USING ERRCODE = '42501';
  END IF;

  SELECT id, tag_uid, owner_id INTO v_mem
  FROM public.memory_spaces
  WHERE tag_uid = lower(trim(p_tag_uid))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỷ vật mang mã chip %', p_tag_uid USING ERRCODE = 'P0002';
  END IF;

  -- Kiểm tra quyền chủ sở hữu động theo owner_id hiện thời
  IF v_mem.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Từ chối quyền: Bạn không phải chủ nhân hiện tại của kỷ vật này' USING ERRCODE = '42501';
  END IF;

  IF length(v_title) > 80 THEN
    RAISE EXCEPTION 'Tiêu đề không được vượt quá 80 ký tự' USING ERRCODE = '22023';
  END IF;

  IF p_partner_name IS NOT NULL AND length(trim(p_partner_name)) > 80 THEN
    RAISE EXCEPTION 'Tên đối tác không được vượt quá 80 ký tự' USING ERRCODE = '22023';
  END IF;

  IF p_owner_name IS NOT NULL AND length(trim(p_owner_name)) > 80 THEN
    RAISE EXCEPTION 'Tên người tạo không được vượt quá 80 ký tự' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.memory_matches (
    memory_id,
    title,
    partner_name,
    owner_name,
    status,
    questions
  ) VALUES (
    v_mem.id,
    v_title,
    nullif(trim(p_partner_name), ''),
    nullif(trim(p_owner_name), ''),
    'draft',
    '[]'::jsonb
  )
  RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match_id,
    'status', 'draft',
    'title', v_title,
    'partner_name', nullif(trim(p_partner_name), ''),
    'owner_name', nullif(trim(p_owner_name), '')
  );
END;
$$;

-- 3.2 Lưu bộ câu hỏi nháp (3–7 câu, mỗi câu 2–4 options, ảnh tùy chọn phải tồn tại)
CREATE OR REPLACE FUNCTION public.rpc_match_save_questions(
  p_match_id UUID,
  p_questions JSONB,
  p_title TEXT DEFAULT NULL,
  p_partner_name TEXT DEFAULT NULL,
  p_owner_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_match RECORD;
  v_q_count INTEGER;
  v_q JSONB;
  v_q_text TEXT;
  v_options JSONB;
  v_opt_count INTEGER;
  v_opt_text TEXT;
  v_img_path TEXT;
  v_tag_uid TEXT;
  i INTEGER;
  j INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  SELECT mm.*, m.tag_uid, m.owner_id AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm, m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_match.current_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu kỷ vật mới có quyền sửa câu hỏi' USING ERRCODE = '42501';
  END IF;

  IF v_match.status <> 'draft' THEN
    RAISE EXCEPTION 'Không thể sửa đổi câu hỏi khi lượt chơi đã bắt đầu' USING ERRCODE = '22023';
  END IF;

  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'Dữ liệu câu hỏi phải là một mảng JSON' USING ERRCODE = '22023';
  END IF;

  v_q_count := jsonb_array_length(p_questions);
  IF v_q_count < 3 OR v_q_count > 7 THEN
    RAISE EXCEPTION 'Số lượng câu hỏi phải từ 3 đến 7 câu (hiện có: %)', v_q_count USING ERRCODE = '22023';
  END IF;

  v_tag_uid := v_match.tag_uid;

  -- Xác thực chi tiết từng câu hỏi và lựa chọn
  FOR i IN 0 .. v_q_count - 1 LOOP
    v_q := p_questions->i;
    IF jsonb_typeof(v_q) <> 'object' THEN
      RAISE EXCEPTION 'Câu hỏi thứ % không đúng định dạng object', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_q_text := trim(COALESCE(v_q->>'text', ''));
    IF length(v_q_text) = 0 OR length(v_q_text) > 300 THEN
      RAISE EXCEPTION 'Nội dung câu hỏi thứ % phải từ 1 đến 300 ký tự', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_options := v_q->'options';
    IF v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
      RAISE EXCEPTION 'Lựa chọn của câu hỏi thứ % phải là một mảng JSON', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_opt_count := jsonb_array_length(v_options);
    IF v_opt_count < 2 OR v_opt_count > 4 THEN
      RAISE EXCEPTION 'Câu hỏi thứ % phải có từ 2 đến 4 lựa chọn', (i + 1) USING ERRCODE = '22023';
    END IF;

    FOR j IN 0 .. v_opt_count - 1 LOOP
      v_opt_text := trim(COALESCE(v_options->>j, ''));
      IF length(v_opt_text) = 0 OR length(v_opt_text) > 200 THEN
        RAISE EXCEPTION 'Lựa chọn % của câu hỏi % không được rỗng và tối đa 200 ký tự', (j + 1), (i + 1) USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- Kiểm tra ảnh đính kèm tùy chọn
    v_img_path := nullif(trim(COALESCE(v_q->>'image_path', '')), '');
    IF v_img_path IS NOT NULL THEN
      IF length(v_img_path) > 500 THEN
        RAISE EXCEPTION 'Đường dẫn ảnh câu hỏi % quá dài (tối đa 500 ký tự)', (i + 1) USING ERRCODE = '22023';
      END IF;
      IF NOT public.fn_validate_event_photo_path(v_tag_uid, v_img_path) THEN
        RAISE EXCEPTION 'Đường dẫn ảnh của câu hỏi % không hợp lệ hoặc không tồn tại trong bucket emoria-event-media: %', (i + 1), v_img_path USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  UPDATE public.memory_matches SET
    questions = p_questions,
    title = COALESCE(nullif(trim(p_title), ''), title),
    partner_name = CASE WHEN p_partner_name IS NOT NULL THEN nullif(trim(p_partner_name), '') ELSE partner_name END,
    owner_name = CASE WHEN p_owner_name IS NOT NULL THEN nullif(trim(p_owner_name), '') ELSE owner_name END,
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'questions_count', v_q_count
  );
END;
$$;

-- 3.3 Bắt đầu Match: Khóa snapshot câu hỏi, sinh token mời đối tác (chỉ trả token cho Owner một lần)
CREATE OR REPLACE FUNCTION public.rpc_match_begin(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_match RECORD;
  v_raw_token TEXT;
  v_token_hash TEXT;
  v_q_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  SELECT mm.*, m.owner_id AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm, m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_match.current_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu kỷ vật mới có quyền bắt đầu lượt chơi' USING ERRCODE = '42501';
  END IF;

  IF v_match.status <> 'draft' THEN
    RAISE EXCEPTION 'Lượt chơi này đã được bắt đầu trước đó' USING ERRCODE = '22023';
  END IF;

  v_q_count := jsonb_array_length(v_match.questions);
  IF v_q_count < 3 OR v_q_count > 7 THEN
    RAISE EXCEPTION 'Cần thiết lập từ 3 đến 7 câu hỏi trước khi bắt đầu (hiện có: %)', v_q_count USING ERRCODE = '22023';
  END IF;

  -- Tạo bearer invite token ngẫu nhiên bảo mật 256-bit (không đoán được)
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  UPDATE public.memory_matches SET
    status = 'active',
    partner_token_hash = v_token_hash,
    started_at = now(),
    updated_at = now()
  WHERE id = p_match_id;

  -- Trả raw token duy nhất cho Owner để chia sẻ cho đối tác
  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'status', 'active',
    'invite_token', v_raw_token
  );
END;
$$;

-- 3.4 Lưu tiến độ trả lời nháp (Tách biệt Owner vs Partner qua Auth/Token)
CREATE OR REPLACE FUNCTION public.rpc_match_save_progress(
  p_match_id UUID,
  p_answers JSONB,
  p_invite_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_match RECORD;
  v_role TEXT;
  v_token_hash TEXT;
  v_q_count INTEGER;
  v_ans_len INTEGER;
  i INTEGER;
  v_val INTEGER;
BEGIN
  SELECT mm.*, m.owner_id AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm, m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  -- Xác thực vai trò: Partner qua invite_token hoặc Owner qua auth.uid()
  IF p_invite_token IS NOT NULL AND length(trim(p_invite_token)) > 0 THEN
    v_token_hash := encode(digest(trim(p_invite_token), 'sha256'), 'hex');
    IF v_match.partner_token_hash IS NULL OR v_match.partner_token_hash IS DISTINCT FROM v_token_hash THEN
      RAISE EXCEPTION 'Mã mời tham gia không chính xác hoặc đã hết hiệu lực' USING ERRCODE = '42501';
    END IF;
    v_role := 'partner';
  ELSIF auth.uid() IS NOT NULL AND v_match.current_owner_id = auth.uid() THEN
    v_role := 'owner';
  ELSE
    RAISE EXCEPTION 'Từ chối quyền: Bạn không có quyền truy cập lượt chơi này' USING ERRCODE = '42501';
  END IF;

  IF v_match.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Lượt chơi chưa được kích hoạt' USING ERRCODE = '22023';
  END IF;

  -- Không cho phép sửa đổi tiến độ nếu vai trò đó đã nộp bài chính thức
  IF v_role = 'owner' AND v_match.owner_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Bạn đã nộp đáp án chính thức, không thể sửa đổi tiến độ' USING ERRCODE = '22023';
  ELSIF v_role = 'partner' AND v_match.partner_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Bạn đã nộp đáp án chính thức, không thể sửa đổi tiến độ' USING ERRCODE = '22023';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Đáp án phải là một mảng JSON' USING ERRCODE = '22023';
  END IF;

  v_q_count := jsonb_array_length(v_match.questions);
  v_ans_len := jsonb_array_length(p_answers);
  IF v_ans_len > v_q_count THEN
    RAISE EXCEPTION 'Số lượng đáp án tiến độ (%) vượt quá số câu hỏi (%)', v_ans_len, v_q_count USING ERRCODE = '22023';
  END IF;

  -- Kiểm tra các chỉ số lựa chọn hợp lệ nếu đã chọn
  FOR i IN 0 .. v_ans_len - 1 LOOP
    IF jsonb_typeof(p_answers->i) = 'number' THEN
      IF (p_answers->>i) !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Đáp án câu % phải là số nguyên', (i + 1) USING ERRCODE = '22023';
      END IF;
      v_val := (p_answers->>i)::integer;
      IF v_val < 0 OR v_val >= jsonb_array_length(v_match.questions->i->'options') THEN
        RAISE EXCEPTION 'Chỉ số lựa chọn % không hợp lệ cho câu hỏi %', v_val, (i + 1) USING ERRCODE = '22023';
      END IF;
    ELSIF jsonb_typeof(p_answers->i) IS DISTINCT FROM 'null' THEN
      RAISE EXCEPTION 'Đáp án câu % phải là số nguyên hoặc null', (i + 1) USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF v_role = 'owner' THEN
    UPDATE public.memory_matches SET
      owner_answers = p_answers,
      updated_at = now()
    WHERE id = p_match_id;
  ELSE
    UPDATE public.memory_matches SET
      partner_answers = p_answers,
      updated_at = now()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'role', v_role,
    'saved_count', v_ans_len
  );
END;
$$;

-- 3.5 Nộp bài chính thức: Nguyên tử FOR UPDATE, bất biến, tính điểm khi cả hai hoàn thành
CREATE OR REPLACE FUNCTION public.rpc_match_submit(
  p_match_id UUID,
  p_answers JSONB,
  p_invite_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_match RECORD;
  v_role TEXT;
  v_token_hash TEXT;
  v_q_count INTEGER;
  v_score INTEGER := 0;
  v_both_submitted BOOLEAN := FALSE;
  v_owner_answers JSONB;
  v_partner_answers JSONB;
  i INTEGER;
  v_ans_idx INTEGER;
BEGIN
  SELECT mm.*, m.owner_id AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm, m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  -- Xác thực danh tính
  IF p_invite_token IS NOT NULL AND length(trim(p_invite_token)) > 0 THEN
    v_token_hash := encode(digest(trim(p_invite_token), 'sha256'), 'hex');
    IF v_match.partner_token_hash IS NULL OR v_match.partner_token_hash IS DISTINCT FROM v_token_hash THEN
      RAISE EXCEPTION 'Mã mời tham gia không chính xác' USING ERRCODE = '42501';
    END IF;
    v_role := 'partner';
  ELSIF auth.uid() IS NOT NULL AND v_match.current_owner_id = auth.uid() THEN
    v_role := 'owner';
  ELSE
    RAISE EXCEPTION 'Từ chối quyền: Bạn không có quyền truy cập lượt chơi này' USING ERRCODE = '42501';
  END IF;

  IF v_match.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Lượt chơi chưa được kích hoạt' USING ERRCODE = '22023';
  END IF;

  v_q_count := jsonb_array_length(v_match.questions);

  -- Tính lũy đẳng (Idempotent): Nếu đã nộp trước đó, trả lại trạng thái hiện tại mà không ghi đè
  IF (v_role = 'owner' AND v_match.owner_submitted_at IS NOT NULL) OR
     (v_role = 'partner' AND v_match.partner_submitted_at IS NOT NULL) THEN
    v_both_submitted := (v_match.owner_submitted_at IS NOT NULL AND v_match.partner_submitted_at IS NOT NULL);
    RETURN jsonb_build_object(
      'success', true,
      'already_submitted', true,
      'both_submitted', v_both_submitted,
      'score', CASE WHEN v_both_submitted THEN v_match.score ELSE NULL END,
      'total_questions', v_q_count
    );
  END IF;

  -- Nộp mới: Kiểm tra phải trả lời ĐẦY ĐỦ tất cả các câu hỏi
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Đáp án nộp phải là một mảng JSON' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_answers) <> v_q_count THEN
    RAISE EXCEPTION 'Bạn phải trả lời đầy đủ tất cả % câu hỏi để nộp bài', v_q_count USING ERRCODE = '22023';
  END IF;

  FOR i IN 0 .. v_q_count - 1 LOOP
    IF jsonb_typeof(p_answers->i) <> 'number' OR (p_answers->>i) !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Đáp án câu thứ % không hợp lệ', (i + 1) USING ERRCODE = '22023';
    END IF;
    v_ans_idx := (p_answers->>i)::integer;
    IF v_ans_idx < 0 OR v_ans_idx >= jsonb_array_length(v_match.questions->i->'options') THEN
      RAISE EXCEPTION 'Lựa chọn % không hợp lệ cho câu %', v_ans_idx, (i + 1) USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF v_role = 'owner' THEN
    v_owner_answers := p_answers;
    v_partner_answers := v_match.partner_answers;
    v_both_submitted := (v_match.partner_submitted_at IS NOT NULL);

    UPDATE public.memory_matches SET
      owner_answers = p_answers,
      owner_submitted_at = now(),
      updated_at = now()
    WHERE id = p_match_id;
  ELSE
    v_owner_answers := v_match.owner_answers;
    v_partner_answers := p_answers;
    v_both_submitted := (v_match.owner_submitted_at IS NOT NULL);

    UPDATE public.memory_matches SET
      partner_answers = p_answers,
      partner_submitted_at = now(),
      updated_at = now()
    WHERE id = p_match_id;
  END IF;

  -- Khi cả hai người đều đã nộp bài -> Tính điểm số câu trả lời trùng khớp
  IF v_both_submitted THEN
    FOR i IN 0 .. v_q_count - 1 LOOP
      IF (v_owner_answers->i)::integer = (v_partner_answers->i)::integer THEN
        v_score := v_score + 1;
      END IF;
    END LOOP;

    UPDATE public.memory_matches SET
      score = v_score,
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'submitted', true,
    'both_submitted', v_both_submitted,
    'score', CASE WHEN v_both_submitted THEN v_score ELSE NULL END,
    'total_questions', v_q_count
  );
END;
$$;

-- 3.6 Đọc trạng thái Match: Chỉ xem câu trả lời của mình cho đến khi cả hai nộp bài
CREATE OR REPLACE FUNCTION public.rpc_match_get_view(
  p_match_id UUID,
  p_invite_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_match RECORD;
  v_role TEXT;
  v_token_hash TEXT;
  v_both_submitted BOOLEAN := FALSE;
  v_my_submitted BOOLEAN := FALSE;
  v_other_submitted BOOLEAN := FALSE;
  v_my_answers JSONB;
  v_other_answers JSONB := NULL;
  v_score INTEGER := NULL;
BEGIN
  SELECT mm.*, m.owner_id AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  -- Phân quyền
  IF p_invite_token IS NOT NULL AND length(trim(p_invite_token)) > 0 THEN
    v_token_hash := encode(digest(trim(p_invite_token), 'sha256'), 'hex');
    IF v_match.partner_token_hash IS NULL OR v_match.partner_token_hash IS DISTINCT FROM v_token_hash THEN
      RAISE EXCEPTION 'Mã mời tham gia không chính xác' USING ERRCODE = '42501';
    END IF;
    v_role := 'partner';
  ELSIF auth.uid() IS NOT NULL AND v_match.current_owner_id = auth.uid() THEN
    v_role := 'owner';
  ELSE
    RAISE EXCEPTION 'Từ chối quyền truy cập' USING ERRCODE = '42501';
  END IF;

  v_both_submitted := (v_match.owner_submitted_at IS NOT NULL AND v_match.partner_submitted_at IS NOT NULL);

  IF v_role = 'owner' THEN
    v_my_submitted := (v_match.owner_submitted_at IS NOT NULL);
    v_other_submitted := (v_match.partner_submitted_at IS NOT NULL);
    v_my_answers := v_match.owner_answers;
    IF v_both_submitted THEN
      v_other_answers := v_match.partner_answers;
      v_score := v_match.score;
    END IF;
  ELSE
    v_my_submitted := (v_match.partner_submitted_at IS NOT NULL);
    v_other_submitted := (v_match.owner_submitted_at IS NOT NULL);
    v_my_answers := v_match.partner_answers;
    IF v_both_submitted THEN
      v_other_answers := v_match.owner_answers;
      v_score := v_match.score;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match.id,
    'title', v_match.title,
    'partner_name', v_match.partner_name,
    'owner_name', v_match.owner_name,
    'status', v_match.status,
    'questions', v_match.questions,
    'my_role', v_role,
    'my_submitted', v_my_submitted,
    'my_answers', v_my_answers,
    'other_submitted', v_other_submitted,
    'other_answers', v_other_answers, -- Tuyệt đối NULL khi chưa cả hai hoàn thành
    'both_submitted', v_both_submitted,
    'score', v_score,
    'total_questions', jsonb_array_length(v_match.questions)
  );
END;
$$;

-- 3.7 Tải nội dung bản nháp dành cho Owner
CREATE OR REPLACE FUNCTION public.rpc_match_get_draft(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  SELECT mm.*, m.tag_uid, m.owner_id AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_match.current_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu kỷ vật mới có quyền đọc bản nháp' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match.id,
    'tag_uid', v_match.tag_uid,
    'title', v_match.title,
    'partner_name', v_match.partner_name,
    'owner_name', v_match.owner_name,
    'status', v_match.status,
    'questions', v_match.questions,
    'created_at', v_match.created_at,
    'started_at', v_match.started_at
  );
END;
$$;

-- 3.8 Danh sách các lượt chơi của kỷ vật (Dành cho Owner xem lịch sử / Replay)
CREATE OR REPLACE FUNCTION public.rpc_match_list(p_tag_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mem RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  SELECT id, owner_id INTO v_mem
  FROM public.memory_spaces
  WHERE tag_uid = lower(trim(p_tag_uid));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kỷ vật không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_mem.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Từ chối quyền: Bạn không phải chủ nhân của kỷ vật này' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', mm.id,
      'title', mm.title,
      'partner_name', mm.partner_name,
      'owner_name', mm.owner_name,
      'status', mm.status,
      'score', mm.score,
      'total_questions', jsonb_array_length(mm.questions),
      'owner_submitted', (mm.owner_submitted_at IS NOT NULL),
      'partner_submitted', (mm.partner_submitted_at IS NOT NULL),
      'created_at', mm.created_at,
      'completed_at', mm.completed_at
    ) ORDER BY mm.created_at DESC), '[]'::jsonb)
    FROM public.memory_matches mm
    WHERE mm.memory_id = v_mem.id
  );
END;
$$;

-- ==============================================================================
-- 4. RPC FUNCTIONS: HOUSE STUDIO
-- ==============================================================================

-- 4.1 Lưu bản nháp House Studio (5 phòng cố định, tối đa 10 ảnh/phòng, note <= 1500)
CREATE OR REPLACE FUNCTION public.rpc_house_save_draft(
  p_tag_uid TEXT,
  p_title TEXT DEFAULT NULL,
  p_theme TEXT DEFAULT NULL,
  p_rooms JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_mem RECORD;
  v_house_id UUID;
  v_tag_uid TEXT;
  v_title TEXT;
  v_theme TEXT;
  v_rooms_count INTEGER;
  v_room JSONB;
  v_room_id TEXT;
  v_room_name TEXT;
  v_seen_rooms TEXT[] := '{}';
  v_memories JSONB;
  v_mem_count INTEGER;
  v_mem_item JSONB;
  v_item_id TEXT;
  v_photo_path TEXT;
  v_note TEXT;
  v_item_title TEXT;
  i INTEGER;
  j INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  v_tag_uid := lower(trim(p_tag_uid));
  SELECT id, owner_id INTO v_mem
  FROM public.memory_spaces
  WHERE tag_uid = v_tag_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kỷ vật không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_mem.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu kỷ vật mới có quyền lưu ngôi nhà kỷ niệm' USING ERRCODE = '42501';
  END IF;

  -- Kiểm tra tiêu đề (<= 120 ký tự)
  IF p_title IS NOT NULL THEN
    v_title := nullif(trim(p_title), '');
    IF v_title IS NOT NULL AND length(v_title) > 120 THEN
      RAISE EXCEPTION 'Tiêu đề không được vượt quá 120 ký tự' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Kiểm tra theme thuộc allowlist
  IF p_theme IS NOT NULL THEN
    v_theme := trim(p_theme);
    IF v_theme NOT IN ('classic', 'warm_gold', 'rose_romance', 'midnight', 'minimal_dark', 'editorial_cream') THEN
      RAISE EXCEPTION 'Chủ đề giao diện không hợp lệ: %', v_theme USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Kiểm tra các phòng nếu có cập nhật rooms
  IF p_rooms IS NOT NULL THEN
    IF jsonb_typeof(p_rooms) <> 'array' THEN
      RAISE EXCEPTION 'Danh sách phòng phải là một mảng JSON' USING ERRCODE = '22023';
    END IF;

    v_rooms_count := jsonb_array_length(p_rooms);
    IF v_rooms_count > 5 THEN
      RAISE EXCEPTION 'Ngôi nhà có tối đa 5 phòng cố định' USING ERRCODE = '22023';
    END IF;

    FOR i IN 0 .. v_rooms_count - 1 LOOP
      v_room := p_rooms->i;
      IF jsonb_typeof(v_room) <> 'object' THEN
        RAISE EXCEPTION 'Dữ liệu phòng thứ % không đúng định dạng object', (i + 1) USING ERRCODE = '22023';
      END IF;

      v_room_id := trim(COALESCE(v_room->>'id', ''));
      IF v_room_id NOT IN ('beginning', 'first', 'little-things', 'memories', 'next-chapter') THEN
        RAISE EXCEPTION 'Mã phòng % không hợp lệ. Phải thuộc 5 phòng cố định: beginning, first, little-things, memories, next-chapter', v_room_id USING ERRCODE = '22023';
      END IF;

      IF v_room_id = ANY(v_seen_rooms) THEN
        RAISE EXCEPTION 'Mã phòng % bị trùng lặp', v_room_id USING ERRCODE = '22023';
      END IF;
      v_seen_rooms := array_append(v_seen_rooms, v_room_id);

      v_room_name := trim(COALESCE(v_room->>'name', ''));
      IF length(v_room_name) > 120 THEN
        RAISE EXCEPTION 'Tên phòng % không được vượt quá 120 ký tự', v_room_id USING ERRCODE = '22023';
      END IF;

      v_memories := v_room->'memories';
      IF v_memories IS NOT NULL THEN
        IF jsonb_typeof(v_memories) <> 'array' THEN
          RAISE EXCEPTION 'Danh sách kỷ niệm của phòng % phải là một mảng JSON', v_room_id USING ERRCODE = '22023';
        END IF;

        v_mem_count := jsonb_array_length(v_memories);
        IF v_mem_count > 10 THEN
          RAISE EXCEPTION 'Mỗi phòng chỉ được chứa tối đa 10 kỷ niệm (phòng % đang có %)', v_room_id, v_mem_count USING ERRCODE = '22023';
        END IF;

        FOR j IN 0 .. v_mem_count - 1 LOOP
          v_mem_item := v_memories->j;
          IF jsonb_typeof(v_mem_item) <> 'object' THEN
            RAISE EXCEPTION 'Kỷ niệm thứ % trong phòng % không đúng định dạng', (j + 1), v_room_id USING ERRCODE = '22023';
          END IF;

          v_item_id := trim(COALESCE(v_mem_item->>'id', ''));
          IF length(v_item_id) = 0 OR length(v_item_id) > 64 THEN
            RAISE EXCEPTION 'Mã định danh kỷ niệm thứ % trong phòng % phải từ 1 đến 64 ký tự', (j + 1), v_room_id USING ERRCODE = '22023';
          END IF;

          v_photo_path := trim(COALESCE(v_mem_item->>'photo_path', ''));
          IF length(v_photo_path) = 0 OR length(v_photo_path) > 500 THEN
            RAISE EXCEPTION 'Đường dẫn ảnh kỷ niệm không được rỗng và tối đa 500 ký tự (phòng %)', v_room_id USING ERRCODE = '22023';
          END IF;

          -- Xác thực file ảnh thuộc namespace tag_uid và tồn tại trong bucket emoria-event-media
          IF NOT public.fn_validate_event_photo_path(v_tag_uid, v_photo_path) THEN
            RAISE EXCEPTION 'Ảnh % trong phòng % không hợp lệ hoặc không tồn tại trong bucket emoria-event-media', v_photo_path, v_room_id USING ERRCODE = '22023';
          END IF;

          v_note := COALESCE(v_mem_item->>'note', '');
          IF length(v_note) > 1500 THEN
            RAISE EXCEPTION 'Ghi chú kỷ niệm không được vượt quá 1500 ký tự (phòng %)', v_room_id USING ERRCODE = '22023';
          END IF;

          v_item_title := COALESCE(v_mem_item->>'title', '');
          IF length(v_item_title) > 120 THEN
            RAISE EXCEPTION 'Tiêu đề kỷ niệm không được vượt quá 120 ký tự (phòng %)', v_room_id USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Lưu hoặc cập nhật bản nháp (Draft). Lưu ý: KHÔNG làm thay đổi bản snapshot đã publish
  INSERT INTO public.memory_houses (
    memory_id,
    title,
    theme,
    rooms_draft,
    is_published
  ) VALUES (
    v_mem.id,
    COALESCE(v_title, 'Our Memory House'),
    COALESCE(v_theme, 'classic'),
    COALESCE(p_rooms, '[]'::jsonb),
    false
  )
  ON CONFLICT (memory_id) DO UPDATE SET
    title = COALESCE(v_title, memory_houses.title),
    theme = COALESCE(v_theme, memory_houses.theme),
    rooms_draft = COALESCE(p_rooms, memory_houses.rooms_draft),
    updated_at = now()
  RETURNING id INTO v_house_id;

  RETURN jsonb_build_object(
    'success', true,
    'house_id', v_house_id
  );
END;
$$;

-- 4.2 Tải bản nháp House Studio dành cho Owner
CREATE OR REPLACE FUNCTION public.rpc_house_get_draft(p_tag_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mem RECORD;
  v_house RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  SELECT id, owner_id INTO v_mem
  FROM public.memory_spaces
  WHERE tag_uid = lower(trim(p_tag_uid));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kỷ vật không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_mem.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu kỷ vật mới có quyền xem bản nháp này' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_house
  FROM public.memory_houses
  WHERE memory_id = v_mem.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'exists', false,
      'title', 'Our Memory House',
      'theme', 'classic',
      'rooms', '[]'::jsonb,
      'is_published', false,
      'share_id', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'exists', true,
    'house_id', v_house.id,
    'title', v_house.title,
    'theme', v_house.theme,
    'rooms', v_house.rooms_draft,
    'is_published', v_house.is_published,
    'share_id', v_house.share_id,
    'published_at', v_house.published_at,
    'updated_at', v_house.updated_at
  );
END;
$$;

-- 4.3 Xuất bản House Studio: Đóng băng Snapshot, sinh Share ID (Tối thiểu 1 kỷ niệm là đủ)
CREATE OR REPLACE FUNCTION public.rpc_house_publish(p_tag_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_house RECORD;
  v_total_memories INTEGER := 0;
  v_room JSONB;
  v_share_id TEXT;
  v_snapshot JSONB;
  i INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  SELECT h.*, m.owner_id AS current_owner_id
  INTO v_house
  FROM public.memory_houses h
  JOIN public.memory_spaces m ON m.id = h.memory_id
  WHERE m.tag_uid = lower(trim(p_tag_uid))
  FOR UPDATE OF h, m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chưa tạo dữ liệu ngôi nhà cho kỷ vật này' USING ERRCODE = 'P0002';
  END IF;

  IF v_house.current_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu kỷ vật mới có quyền xuất bản' USING ERRCODE = '42501';
  END IF;

  -- Kiểm tra điều kiện xuất bản: Ít nhất 1 kỷ niệm trên toàn bộ các phòng
  IF v_house.rooms_draft IS NOT NULL AND jsonb_typeof(v_house.rooms_draft) = 'array' THEN
    FOR i IN 0 .. jsonb_array_length(v_house.rooms_draft) - 1 LOOP
      v_room := v_house.rooms_draft->i;
      IF v_room->'memories' IS NOT NULL AND jsonb_typeof(v_room->'memories') = 'array' THEN
        v_total_memories := v_total_memories + jsonb_array_length(v_room->'memories');
      END IF;
    END LOOP;
  END IF;

  IF v_total_memories < 1 THEN
    RAISE EXCEPTION 'Cần ít nhất một kỷ niệm ảnh để xuất bản ngôi nhà' USING ERRCODE = '22023';
  END IF;

  -- Tạo hoặc tái sử dụng share_id ngẫu nhiên không đoán được
  v_share_id := COALESCE(v_house.share_id, encode(gen_random_bytes(16), 'hex'));

  -- Đóng băng toàn bộ nội dung hiển thị vào snapshot
  v_snapshot := jsonb_build_object(
    'title', v_house.title,
    'theme', v_house.theme,
    'rooms', v_house.rooms_draft,
    'published_at', now()
  );

  UPDATE public.memory_houses SET
    is_published = true,
    share_id = v_share_id,
    published_snapshot = v_snapshot,
    published_at = now(),
    updated_at = now()
  WHERE id = v_house.id;

  RETURN jsonb_build_object(
    'success', true,
    'is_published', true,
    'share_id', v_share_id,
    'published_at', now()
  );
END;
$$;

-- 4.4 Hủy xuất bản House Studio (Chuyển sang chế độ riêng tư)
CREATE OR REPLACE FUNCTION public.rpc_house_unpublish(p_tag_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mem RECORD;
  v_house_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  -- Khóa và kiểm tra chủ sở hữu memory_spaces
  SELECT id, owner_id INTO v_mem
  FROM public.memory_spaces
  WHERE tag_uid = lower(trim(p_tag_uid))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kỷ vật không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_mem.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc không có quyền thao tác' USING ERRCODE = '42501';
  END IF;

  UPDATE public.memory_houses
  SET is_published = false,
      updated_at = now()
  WHERE memory_id = v_mem.id
  RETURNING id INTO v_house_id;

  IF v_house_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc không có quyền thao tác' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_published', false
  );
END;
$$;

-- 4.5 Thu hồi liên kết chia sẻ (Tạo mã share_id mới và hủy xuất bản để link cũ vô hiệu vĩnh viễn)
CREATE OR REPLACE FUNCTION public.rpc_house_revoke_share(p_tag_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_mem RECORD;
  v_new_share_id TEXT;
  v_house_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  -- Khóa và kiểm tra chủ sở hữu memory_spaces
  SELECT id, owner_id INTO v_mem
  FROM public.memory_spaces
  WHERE tag_uid = lower(trim(p_tag_uid))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kỷ vật không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_mem.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc không có quyền thao tác' USING ERRCODE = '42501';
  END IF;

  v_new_share_id := encode(gen_random_bytes(16), 'hex');

  UPDATE public.memory_houses
  SET is_published = false,
      share_id = v_new_share_id,
      updated_at = now()
  WHERE memory_id = v_mem.id
  RETURNING id INTO v_house_id;

  IF v_house_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc không có quyền thao tác' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_published', false,
    'revoked', true
  );
END;
$$;

-- 4.6 Đọc công khai House Studio theo Share ID (Chỉ đọc Snapshot đã đóng băng, không lộ private NFC)
CREATE OR REPLACE FUNCTION public.rpc_house_public_view(p_share_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_house RECORD;
BEGIN
  IF p_share_id IS NULL OR length(trim(p_share_id)) = 0 THEN
    RAISE EXCEPTION 'Mã liên kết không hợp lệ' USING ERRCODE = '22023';
  END IF;

  SELECT h.is_published, h.published_snapshot, m.availability_status, m.admin_suspended
  INTO v_house
  FROM public.memory_houses h
  JOIN public.memory_spaces m ON m.id = h.memory_id
  WHERE h.share_id = trim(p_share_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc liên kết đã bị thu hồi' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_house.is_published THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này hiện đang ở chế độ riêng tư' USING ERRCODE = '42501';
  END IF;

  -- Kỷ vật bị tạm ngưng vận hành thì chặn truy cập
  IF v_house.availability_status = 'suspended' OR COALESCE(v_house.admin_suspended, false) THEN
    RAISE EXCEPTION 'Kỷ niệm này hiện đang tạm ngưng truy cập' USING ERRCODE = '42501';
  END IF;

  IF v_house.published_snapshot IS NULL THEN
    RAISE EXCEPTION 'Chưa có bản xuất bản nào khả dụng' USING ERRCODE = 'P0002';
  END IF;

  -- Trả về snapshot duy nhất: Tuyệt đối không trả về tag_uid, PIN, thư riêng, hay thông tin cá nhân NFC
  RETURN jsonb_build_object(
    'success', true,
    'title', v_house.published_snapshot->'title',
    'theme', v_house.published_snapshot->'theme',
    'rooms', v_house.published_snapshot->'rooms',
    'published_at', v_house.published_snapshot->'published_at'
  );
END;
$$;

-- 4.7 Đọc công khai House Studio theo Tag UID (Dành cho luồng NFC: chỉ đọc Snapshot đã Publish, chặn tuyệt đối draft)
CREATE OR REPLACE FUNCTION public.rpc_house_tag_public_view(p_tag_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_house RECORD;
BEGIN
  IF p_tag_uid IS NULL OR length(trim(p_tag_uid)) = 0 THEN
    RAISE EXCEPTION 'Mã kỷ vật không hợp lệ' USING ERRCODE = '22023';
  END IF;

  SELECT h.is_published, h.published_snapshot, m.availability_status, m.admin_suspended
  INTO v_house
  FROM public.memory_spaces m
  JOIN public.memory_houses h ON h.memory_id = m.id
  WHERE m.tag_uid = lower(trim(p_tag_uid));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm cho kỷ vật này' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_house.is_published THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này hiện chưa được xuất bản hoặc ở chế độ riêng tư' USING ERRCODE = '42501';
  END IF;

  -- Kỷ vật bị tạm ngưng vận hành thì chặn truy cập
  IF v_house.availability_status = 'suspended' OR COALESCE(v_house.admin_suspended, false) THEN
    RAISE EXCEPTION 'Kỷ niệm này hiện đang tạm ngưng truy cập' USING ERRCODE = '42501';
  END IF;

  IF v_house.published_snapshot IS NULL THEN
    RAISE EXCEPTION 'Chưa có bản xuất bản nào khả dụng' USING ERRCODE = 'P0002';
  END IF;

  -- Trả về snapshot duy nhất: Tuyệt đối không trả về draft, PIN, thư riêng, hay thông tin cá nhân NFC
  RETURN jsonb_build_object(
    'success', true,
    'title', v_house.published_snapshot->'title',
    'theme', v_house.published_snapshot->'theme',
    'rooms', v_house.published_snapshot->'rooms',
    'published_at', v_house.published_snapshot->'published_at'
  );
END;
$$;

-- ==============================================================================
-- 5. PHÂN QUYỀN THỰC THI (EXPLICIT FUNCTION GRANTS & REVOKES)
-- ==============================================================================

-- 5.1 Match Studio Functions
REVOKE ALL ON FUNCTION public.rpc_match_create(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_match_create(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_save_questions(UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_match_save_questions(UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_begin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_match_begin(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_save_progress(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_match_save_progress(UUID, JSONB, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_submit(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_match_submit(UUID, JSONB, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_get_view(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_match_get_view(UUID, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_get_draft(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_match_get_draft(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_list(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_match_list(TEXT) TO authenticated;

-- 5.2 House Studio Functions
REVOKE ALL ON FUNCTION public.rpc_house_save_draft(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_house_save_draft(TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_house_get_draft(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_house_get_draft(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_house_publish(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_house_publish(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_house_unpublish(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_house_unpublish(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_house_revoke_share(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_house_revoke_share(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_house_public_view(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_house_public_view(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_house_tag_public_view(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_house_tag_public_view(TEXT) TO anon, authenticated;

COMMIT;
