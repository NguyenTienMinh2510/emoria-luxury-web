-- ==============================================================================
-- EMORIA LUXURY - MATCH DRAFT VALIDATION SEPARATION
-- Version: 20260929033824_match_draft_validation
-- Description: Separate draft saving validation (allowing in-progress questions)
--              from game activation validation (strict 3-7 complete questions)
-- ==============================================================================

BEGIN;

-- 1. rpc_match_save_questions: Lưu bản nháp câu hỏi khi đang soạn (cho phép câu hỏi đang nhập dở)
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
  IF v_q_count > 10 THEN
    RAISE EXCEPTION 'Số lượng câu hỏi trong bản nháp tối đa là 10 câu (hiện có: %)', v_q_count USING ERRCODE = '22023';
  END IF;

  v_tag_uid := v_match.tag_uid;

  -- Xác thực cấu trúc bản nháp (cho phép text/options đang soạn thảo)
  FOR i IN 0 .. v_q_count - 1 LOOP
    v_q := p_questions->i;
    IF jsonb_typeof(v_q) <> 'object' THEN
      RAISE EXCEPTION 'Câu hỏi thứ % không đúng định dạng object', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_q_text := trim(COALESCE(v_q->>'text', ''));
    IF length(v_q_text) > 300 THEN
      RAISE EXCEPTION 'Nội dung câu hỏi thứ % không được vượt quá 300 ký tự', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_options := v_q->'options';
    IF v_options IS NOT NULL THEN
      IF jsonb_typeof(v_options) <> 'array' THEN
        RAISE EXCEPTION 'Danh sách lựa chọn của câu hỏi thứ % phải là một mảng', (i + 1) USING ERRCODE = '22023';
      END IF;

      v_opt_count := jsonb_array_length(v_options);
      IF v_opt_count > 6 THEN
        RAISE EXCEPTION 'Mỗi câu hỏi tối đa 6 lựa chọn (câu % đang có %)', (i + 1), v_opt_count USING ERRCODE = '22023';
      END IF;

      FOR j IN 0 .. v_opt_count - 1 LOOP
        v_opt_text := trim(COALESCE(v_options->>j, ''));
        IF length(v_opt_text) > 100 THEN
          RAISE EXCEPTION 'Lựa chọn thứ % của câu % không được vượt quá 100 ký tự', (j + 1), (i + 1) USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    -- Kiểm tra ảnh đính kèm nếu có
    v_img_path := trim(COALESCE(v_q->>'image_path', ''));
    IF length(v_img_path) > 0 THEN
      IF NOT public.fn_validate_event_photo_path(v_tag_uid, v_img_path) THEN
        RAISE EXCEPTION 'Đường dẫn ảnh của câu hỏi % không hợp lệ hoặc không tồn tại trong bucket emoria-event-media', (i + 1) USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- Kiểm tra độ dài tiêu đề và tên đối tác
  IF p_title IS NOT NULL AND length(trim(p_title)) > 80 THEN
    RAISE EXCEPTION 'Tiêu đề không được vượt quá 80 ký tự' USING ERRCODE = '22023';
  END IF;

  IF p_partner_name IS NOT NULL AND length(trim(p_partner_name)) > 80 THEN
    RAISE EXCEPTION 'Tên đối tác không được vượt quá 80 ký tự' USING ERRCODE = '22023';
  END IF;

  IF p_owner_name IS NOT NULL AND length(trim(p_owner_name)) > 80 THEN
    RAISE EXCEPTION 'Tên người tạo không được vượt quá 80 ký tự' USING ERRCODE = '22023';
  END IF;

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

-- 2. rpc_match_begin: Xác thực chặt chẽ (3-7 câu đầy đủ) trước khi kích hoạt và sinh token mời
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
    RAISE EXCEPTION 'Chỉ chủ sở hữu kỷ vật mới có quyền bắt đầu lượt chơi' USING ERRCODE = '42501';
  END IF;

  IF v_match.status <> 'draft' THEN
    RAISE EXCEPTION 'Lượt chơi này đã được bắt đầu trước đó' USING ERRCODE = '22023';
  END IF;

  IF v_match.questions IS NULL OR jsonb_typeof(v_match.questions) <> 'array' THEN
    RAISE EXCEPTION 'Dữ liệu câu hỏi không hợp lệ' USING ERRCODE = '22023';
  END IF;

  v_q_count := jsonb_array_length(v_match.questions);
  IF v_q_count < 3 OR v_q_count > 7 THEN
    RAISE EXCEPTION 'Cần thiết lập từ 3 đến 7 câu hỏi trước khi bắt đầu (hiện có: %)', v_q_count USING ERRCODE = '22023';
  END IF;

  v_tag_uid := v_match.tag_uid;

  -- Kiểm tra chặt chẽ từng câu hỏi phải hoàn thiện đầy đủ
  FOR i IN 0 .. v_q_count - 1 LOOP
    v_q := v_match.questions->i;
    IF jsonb_typeof(v_q) <> 'object' THEN
      RAISE EXCEPTION 'Câu hỏi thứ % không đúng định dạng', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_q_text := trim(COALESCE(v_q->>'text', ''));
    IF length(v_q_text) = 0 OR length(v_q_text) > 300 THEN
      RAISE EXCEPTION 'Nội dung câu hỏi thứ % phải từ 1 đến 300 ký tự', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_options := v_q->'options';
    IF v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
      RAISE EXCEPTION 'Câu hỏi thứ % phải có danh sách các lựa chọn', (i + 1) USING ERRCODE = '22023';
    END IF;

    v_opt_count := jsonb_array_length(v_options);
    IF v_opt_count < 2 OR v_opt_count > 4 THEN
      RAISE EXCEPTION 'Câu hỏi thứ % phải có từ 2 đến 4 lựa chọn (hiện có: %)', (i + 1), v_opt_count USING ERRCODE = '22023';
    END IF;

    FOR j IN 0 .. v_opt_count - 1 LOOP
      v_opt_text := trim(COALESCE(v_options->>j, ''));
      IF length(v_opt_text) = 0 OR length(v_opt_text) > 100 THEN
        RAISE EXCEPTION 'Lựa chọn thứ % của câu % phải từ 1 đến 100 ký tự', (j + 1), (i + 1) USING ERRCODE = '22023';
      END IF;
    END LOOP;

    v_img_path := trim(COALESCE(v_q->>'image_path', ''));
    IF length(v_img_path) > 0 THEN
      IF NOT public.fn_validate_event_photo_path(v_tag_uid, v_img_path) THEN
        RAISE EXCEPTION 'Đường dẫn ảnh của câu hỏi % không hợp lệ hoặc không tồn tại trong bucket emoria-event-media', (i + 1) USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

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

-- 3. Cấp quyền thực thi
REVOKE ALL ON FUNCTION public.rpc_match_save_questions(UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_match_save_questions(UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_match_begin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_match_begin(UUID) TO authenticated;

COMMIT;
