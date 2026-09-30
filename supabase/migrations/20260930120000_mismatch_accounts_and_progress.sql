-- Account-owned Mismatch rounds; legacy memory rounds keep their existing ownership.
BEGIN;
ALTER TABLE public.memory_matches ALTER COLUMN memory_id DROP NOT NULL;
ALTER TABLE public.memory_matches ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.memory_matches ADD COLUMN IF NOT EXISTS partner_opened_at timestamptz;
ALTER TABLE public.memory_matches DROP CONSTRAINT IF EXISTS memory_matches_owner_required;
ALTER TABLE public.memory_matches ADD CONSTRAINT memory_matches_owner_required CHECK (memory_id IS NOT NULL OR creator_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS memory_matches_creator_idx ON public.memory_matches(creator_id, created_at DESC);


CREATE OR REPLACE FUNCTION public.rpc_match_create(
  p_tag_uid TEXT,
  p_title TEXT DEFAULT 'Mismatch',
  p_partner_name TEXT DEFAULT NULL,
  p_owner_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match_id UUID;
  v_title TEXT := COALESCE(nullif(trim(p_title), ''), 'Mismatch');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Vui lòng đăng nhập để tạo lượt chơi' USING ERRCODE = '42501';
  END IF;

  -- New rounds belong to the signed-in account, regardless of entry point/tag.
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
    creator_id,
    title,
    partner_name,
    owner_name,
    status,
    questions
  ) VALUES (
    auth.uid(),
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

  SELECT mm.*, m.tag_uid, COALESCE(mm.creator_id, m.owner_id) AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  LEFT JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_match.current_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ người tạo lượt chơi mới có quyền sửa câu hỏi' USING ERRCODE = '42501';
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

  v_tag_uid := COALESCE(v_match.tag_uid, 'match_' || v_match.creator_id::text);

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
        IF jsonb_typeof(v_options->j) <> 'string' THEN RAISE EXCEPTION 'Đáp án phải là văn bản' USING ERRCODE='22023'; END IF;
        v_opt_text := trim(COALESCE(v_options->>j, ''));
        IF length(v_opt_text) > 100 THEN
          RAISE EXCEPTION 'Lựa chọn thứ % của câu % không được vượt quá 100 ký tự', (j + 1), (i + 1) USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    -- Kiểm tra ảnh đính kèm nếu có
    v_img_path := trim(COALESCE(v_q->>'image_path', ''));
    IF length(v_img_path) > 0 THEN
      IF public.fn_validate_event_photo_path(v_tag_uid, v_img_path) IS NOT TRUE THEN
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

  SELECT mm.*, m.tag_uid, COALESCE(mm.creator_id, m.owner_id) AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  LEFT JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_match.current_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ người tạo lượt chơi mới có quyền bắt đầu lượt chơi' USING ERRCODE = '42501';
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

  v_tag_uid := COALESCE(v_match.tag_uid, 'match_' || v_match.creator_id::text);

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
      IF jsonb_typeof(v_options->j) <> 'string' THEN RAISE EXCEPTION 'Đáp án phải là văn bản' USING ERRCODE='22023'; END IF;
      v_opt_text := trim(COALESCE(v_options->>j, ''));
      IF length(v_opt_text) = 0 OR length(v_opt_text) > 100 THEN
        RAISE EXCEPTION 'Lựa chọn thứ % của câu % phải từ 1 đến 100 ký tự', (j + 1), (i + 1) USING ERRCODE = '22023';
      END IF;
    END LOOP;

    v_img_path := trim(COALESCE(v_q->>'image_path', ''));
    IF length(v_img_path) > 0 THEN
      IF public.fn_validate_event_photo_path(v_tag_uid, v_img_path) IS NOT TRUE THEN
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

  SELECT mm.*, m.tag_uid, COALESCE(mm.creator_id, m.owner_id) AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  LEFT JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_match.current_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chỉ người tạo lượt chơi mới có quyền đọc bản nháp' USING ERRCODE = '42501';
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Đăng nhập để chơi Mismatch' USING ERRCODE='42501'; END IF;
  SELECT mm.*, COALESCE(mm.creator_id, m.owner_id) AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  LEFT JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  -- Kiểm tra nội dung có bị ẩn do kiểm duyệt không
  IF v_match.is_hidden THEN
    RAISE EXCEPTION 'Lượt chơi này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' USING ERRCODE = '42501';
  END IF;

  -- Phân quyền
  IF v_match.current_owner_id = auth.uid() THEN
    v_role := 'owner';
  ELSIF p_invite_token IS NOT NULL AND length(trim(p_invite_token)) > 0 THEN
    v_token_hash := encode(digest(trim(p_invite_token), 'sha256'), 'hex');
    IF v_match.partner_token_hash IS NULL OR v_match.partner_token_hash IS DISTINCT FROM v_token_hash THEN
      RAISE EXCEPTION 'Mã mời tham gia không chính xác' USING ERRCODE = '42501';
    END IF;
    v_role := 'partner';
    IF v_match.status NOT IN ('active','completed') THEN RAISE EXCEPTION 'Lượt chơi chưa được kích hoạt' USING ERRCODE='22023'; END IF;
    IF v_match.partner_opened_at IS NULL THEN
      UPDATE public.memory_matches SET partner_opened_at=now() WHERE id=p_match_id AND partner_opened_at IS NULL;
      v_match.partner_opened_at := now();
    END IF;
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
    'role', v_role,
    'my_submitted', v_my_submitted,
    'other_submitted', v_other_submitted,
    'both_submitted', v_both_submitted,
    'my_answers', v_my_answers,
    'other_answers', v_other_answers,
    'other_opened_at', CASE WHEN v_role='owner' THEN v_match.partner_opened_at ELSE v_match.started_at END,
    'other_answered_count', (SELECT count(*) FROM jsonb_array_elements(COALESCE(CASE WHEN v_role='owner' THEN v_match.partner_answers ELSE v_match.owner_answers END, '[]'::jsonb)) a WHERE jsonb_typeof(a)='number'),
    'tag_uid', CASE WHEN v_role='owner' AND v_match.status='draft' THEN (SELECT tag_uid FROM public.memory_spaces WHERE id=v_match.memory_id) ELSE NULL END,
    'reveal', CASE WHEN v_both_submitted THEN (
      SELECT jsonb_agg(jsonb_build_object('question_text',q->>'text',
        'owner_answer_text',q->'options'->>(v_match.owner_answers->>(n-1)::int)::int,
        'partner_answer_text',q->'options'->>(v_match.partner_answers->>(n-1)::int)::int,
        'is_match',v_match.owner_answers->(n-1)::int = v_match.partner_answers->(n-1)::int) ORDER BY n)
      FROM jsonb_array_elements(v_match.questions) WITH ORDINALITY x(q,n)
    ) ELSE NULL END,
    'score', v_score,
    'total_questions', jsonb_array_length(COALESCE(v_match.questions, '[]'::jsonb)),
    'match_count', v_score,
    'match_percentage', CASE
      WHEN v_score IS NULL THEN NULL
      WHEN jsonb_array_length(COALESCE(v_match.questions, '[]'::jsonb)) = 0 THEN 100
      ELSE ROUND((v_score::numeric / jsonb_array_length(COALESCE(v_match.questions, '[]'::jsonb))) * 100)
    END
  );
END;
$$;

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
  SELECT mm.*, COALESCE(mm.creator_id, m.owner_id) AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  LEFT JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  -- Xác thực vai trò: Partner qua invite_token hoặc Owner qua auth.uid()
  v_role := public.rpc_match_get_view(p_match_id,p_invite_token)->>'role';

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
  SELECT mm.*, COALESCE(mm.creator_id, m.owner_id) AS current_owner_id
  INTO v_match
  FROM public.memory_matches mm
  LEFT JOIN public.memory_spaces m ON m.id = mm.memory_id
  WHERE mm.id = p_match_id
  FOR UPDATE OF mm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  -- Xác thực danh tính
  v_role := public.rpc_match_get_view(p_match_id,p_invite_token)->>'role';

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

CREATE OR REPLACE FUNCTION public.rpc_match_list(p_tag_uid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE='42501'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',mm.id,'title',mm.title,'owner_name',mm.owner_name,'partner_name',mm.partner_name,
   'status',mm.status,'score',mm.score,'total_questions',jsonb_array_length(mm.questions),
   'owner_submitted',mm.owner_submitted_at IS NOT NULL,'partner_submitted',mm.partner_submitted_at IS NOT NULL,
   'created_at',mm.created_at,'completed_at',mm.completed_at) ORDER BY mm.created_at DESC),'[]'::jsonb)
   FROM public.memory_matches mm LEFT JOIN public.memory_spaces m ON m.id=mm.memory_id
   WHERE COALESCE(mm.creator_id,m.owner_id)=auth.uid()
     AND (NULLIF(trim(p_tag_uid),'') IS NULL OR m.tag_uid=lower(trim(p_tag_uid))));
END $$;

CREATE OR REPLACE FUNCTION public.event_record_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE e text; events text[]:='{}'; resource text; kind text; suffix text:='';
BEGIN
 IF TG_TABLE_NAME='memory_matches' THEN
   resource:=NEW.id::text; kind:='match';
   IF (OLD.owner_answers='[]'::jsonb AND NEW.owner_answers<>'[]'::jsonb) OR (OLD.partner_answers='[]'::jsonb AND NEW.partner_answers<>'[]'::jsonb) THEN events:=array_append(events,'match_started'); END IF;
   IF OLD.owner_submitted_at IS NULL AND NEW.owner_submitted_at IS NOT NULL THEN events:=array_append(events,'match_owner_completed'); END IF;
   IF OLD.partner_submitted_at IS NULL AND NEW.partner_submitted_at IS NOT NULL THEN events:=array_append(events,'match_partner_completed'); END IF;
   IF OLD.status<>'completed' AND NEW.status='completed' THEN events:=array_append(events,'match_both_completed'); END IF;
   IF (OLD.owner_submitted_at,OLD.partner_submitted_at,OLD.is_hidden,OLD.partner_opened_at,OLD.owner_answers,OLD.partner_answers) IS DISTINCT FROM (NEW.owner_submitted_at,NEW.partner_submitted_at,NEW.is_hidden,NEW.partner_opened_at,NEW.owner_answers,NEW.partner_answers) THEN
     BEGIN
        PERFORM realtime.send('{}'::jsonb,'changed','emoria-match:'||resource,true);
      EXCEPTION WHEN undefined_function THEN
        NULL;
      END;
   END IF;
 ELSE
   resource:=NEW.id::text; kind:='house';
   IF NEW.published_at IS DISTINCT FROM OLD.published_at AND NEW.is_published THEN events:=array_append(events,'house_published'); suffix:=':'||NEW.published_at::text; END IF;
 END IF;
 FOREACH e IN ARRAY events LOOP
   INSERT INTO public.event_analytics_logs(event_name,resource_type,resource_id,dedupe_key)
   VALUES(e,kind,resource,e||':'||resource||suffix)
   ON CONFLICT(dedupe_key) DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;

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
  IF NULLIF(trim(p_tag),'') IS NULL THEN RETURN FALSE; END IF;
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

-- Each signed-in account has its own private photo namespace for new rounds.
DROP POLICY IF EXISTS "Account match photos read" ON storage.objects;
CREATE POLICY "Account match photos read" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='emoria-event-media' AND split_part(name,'/',1)='match_'||auth.uid()::text);
DROP POLICY IF EXISTS "Account match photos insert" ON storage.objects;
CREATE POLICY "Account match photos insert" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='emoria-event-media' AND split_part(name,'/',1)='match_'||auth.uid()::text
   AND name !~ '(^|/)\.\.(/|$)' AND name !~ '//' AND position('/' in name)>0);
DROP POLICY IF EXISTS "Account match photos delete" ON storage.objects;
CREATE POLICY "Account match photos delete" ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='emoria-event-media' AND split_part(name,'/',1)='match_'||auth.uid()::text);


-- Keep revisions, rate limits and authorization behind the existing HTTP gateway.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'rpc_match_%' LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
