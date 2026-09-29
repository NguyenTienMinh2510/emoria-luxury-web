-- ============================================================================
-- EMORIA EVENT STUDIOS REVIEW FIXES (R1, R2, R3, R4, R9)
-- Migration: 20260929051500_event_studios_fixes.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. R1: HOUSE JOURNEY LETTER VALIDATION & SANITIZATION
-- ----------------------------------------------------------------------------

-- Helper function to sanitize rooms: removes unshared journey letter from room payload
CREATE OR REPLACE FUNCTION public.sanitize_house_rooms(p_rooms JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result JSONB := '[]'::jsonb;
  v_room JSONB;
  v_letter JSONB;
  v_sanitized_room JSONB;
BEGIN
  IF p_rooms IS NULL OR jsonb_typeof(p_rooms) != 'array' THEN
    RETURN COALESCE(p_rooms, '[]'::jsonb);
  END IF;

  FOR v_room IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
    v_sanitized_room := v_room;
    IF v_room ? 'journey_letter' THEN
      v_letter := v_room->'journey_letter';
      IF v_letter IS NOT NULL AND jsonb_typeof(v_letter) = 'object' THEN
        -- If is_shared is NOT explicitly true, strip private letter data
        IF COALESCE((v_letter->>'is_shared')::boolean, false) IS NOT TRUE THEN
          v_sanitized_room := v_sanitized_room - 'journey_letter';
        END IF;
      ELSE
        v_sanitized_room := v_sanitized_room - 'journey_letter';
      END IF;
    END IF;
    v_result := v_result || jsonb_build_array(v_sanitized_room);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_house_rooms(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sanitize_house_rooms(JSONB) TO anon, authenticated, service_role;

-- Update trigger validation to also validate journey_letter lengths
CREATE OR REPLACE FUNCTION public.validate_house_decorations()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; d jsonb; photo jsonb; photo_limit integer; used_slots text[];
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(NEW.rooms_draft) LOOP
    IF r ? 'lighting' AND (jsonb_typeof(r->'lighting') IS DISTINCT FROM 'string' OR r->>'lighting' NOT IN ('day','sunset','night')) THEN
      RAISE EXCEPTION 'Ánh sáng phòng không hợp lệ' USING ERRCODE='22023';
    END IF;

    -- R1 validation: journey letter limits
    IF r ? 'journey_letter' THEN
      IF jsonb_typeof(r->'journey_letter') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Thư hành trình không hợp lệ' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'title' AND (jsonb_typeof(r->'journey_letter'->'title') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'title') > 120) THEN
        RAISE EXCEPTION 'Tiêu đề thư tối đa 120 ký tự' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'content' AND (jsonb_typeof(r->'journey_letter'->'content') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'content') > 1500) THEN
        RAISE EXCEPTION 'Nội dung thư tối đa 1500 ký tự' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'author' AND (jsonb_typeof(r->'journey_letter'->'author') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'author') > 80) THEN
        RAISE EXCEPTION 'Tên người gửi thư tối đa 80 ký tự' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'date' AND (jsonb_typeof(r->'journey_letter'->'date') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'date') > 40) THEN
        RAISE EXCEPTION 'Ngày thư tối đa 40 ký tự' USING ERRCODE='22023';
      END IF;
    END IF;

    IF r ? 'decorations' THEN
      IF jsonb_typeof(r->'decorations') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Đồ trang trí phải là danh sách' USING ERRCODE='22023';
      END IF;
      IF jsonb_array_length(r->'decorations') > 3 THEN
        RAISE EXCEPTION 'Mỗi phòng có tối đa 3 vị trí trang trí' USING ERRCODE='22023';
      END IF;
      used_slots := '{}';
      FOR d IN SELECT value FROM jsonb_array_elements(r->'decorations') LOOP
        IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Đồ trang trí không hợp lệ' USING ERRCODE='22023';
        END IF;
        IF NOT (d ? 'slot' AND d ? 'item' AND d ? 'rotation')
           OR d->>'slot' IS NULL OR d->>'item' IS NULL
           OR d->>'slot' NOT IN ('left','table','right')
           OR d->>'item' NOT IN ('calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles')
           OR jsonb_typeof(d->'rotation') IS DISTINCT FROM 'number'
           OR d->>'rotation' NOT IN ('0','90','180','270')
           OR (d - ARRAY['slot','item','rotation','text','photos']::text[]) <> '{}'::jsonb THEN
          RAISE EXCEPTION 'Vị trí hoặc món đồ trang trí không hợp lệ' USING ERRCODE='22023';
        END IF;
        IF d->>'slot' = ANY(used_slots) THEN
          RAISE EXCEPTION 'Một vị trí chỉ đặt được một món đồ' USING ERRCODE='22023';
        END IF;
        used_slots := array_append(used_slots,d->>'slot');
        IF d ? 'text' AND (d->>'item' NOT IN ('calendar','nameplate') OR jsonb_typeof(d->'text') IS DISTINCT FROM 'string' OR length(d->>'text') > 80) THEN
          RAISE EXCEPTION 'Chữ trên đồ vật không hợp lệ (tối đa 80 ký tự)' USING ERRCODE='22023';
        END IF;
        IF d ? 'photos' THEN
          photo_limit := CASE d->>'item' WHEN 'frame' THEN 1 WHEN 'album' THEN 2 WHEN 'bunting' THEN 3 ELSE 0 END;
          IF jsonb_typeof(d->'photos') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Ảnh trên đồ vật phải là danh sách' USING ERRCODE='22023';
          END IF;
          IF photo_limit=0 OR jsonb_array_length(d->'photos')>photo_limit THEN
            RAISE EXCEPTION 'Số ảnh trên đồ vật không hợp lệ' USING ERRCODE='22023';
          END IF;
          FOR photo IN SELECT value FROM jsonb_array_elements(d->'photos') LOOP
            IF photo <> 'null'::jsonb AND (jsonb_typeof(photo) IS DISTINCT FROM 'string' OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(r->'memories','[]'::jsonb)) m WHERE m->'id'=photo
            )) THEN
              RAISE EXCEPTION 'Ảnh trên đồ vật phải thuộc căn phòng này' USING ERRCODE='22023';
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- Update rpc_house_publish to sanitize rooms into published_snapshot
CREATE OR REPLACE FUNCTION public.rpc_house_publish(p_tag_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_mem RECORD;
  v_house RECORD;
  v_share_id TEXT;
  v_snapshot JSONB;
  v_total_memories INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE = '42501';
  END IF;

  SELECT id, owner_id, availability_status, admin_suspended
  INTO v_mem
  FROM public.memory_spaces
  WHERE tag_uid = lower(trim(p_tag_uid))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kỷ vật không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_mem.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc không có quyền thao tác' USING ERRCODE = '42501';
  END IF;

  IF v_mem.availability_status = 'suspended' OR COALESCE(v_mem.admin_suspended, false) THEN
    RAISE EXCEPTION 'Kỷ vật đang bị tạm ngưng vận hành' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_house
  FROM public.memory_houses
  WHERE memory_id = v_mem.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chưa có dữ liệu ngôi nhà' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_house.is_hidden, false) THEN
    RAISE EXCEPTION 'Ngôi nhà đang bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(jsonb_array_length(COALESCE(r->'memories', '[]'::jsonb))), 0)
  INTO v_total_memories
  FROM jsonb_array_elements(v_house.rooms_draft) r;

  IF v_total_memories < 1 THEN
    RAISE EXCEPTION 'Cần ít nhất một kỷ niệm ảnh để xuất bản ngôi nhà' USING ERRCODE = '22023';
  END IF;

  v_share_id := COALESCE(v_house.share_id, encode(gen_random_bytes(16), 'hex'));

  -- Freeze snapshot with sanitized rooms (no unshared private letters)
  v_snapshot := jsonb_build_object(
    'title', v_house.title,
    'theme', v_house.theme,
    'rooms', public.sanitize_house_rooms(v_house.rooms_draft),
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

-- ----------------------------------------------------------------------------
-- 2. R1 & R2: PUBLIC HOUSE VIEW RPCS (SANITIZE LETTERS & ENFORCE IS_HIDDEN)
-- ----------------------------------------------------------------------------

-- Public view by Share ID
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

  SELECT h.is_published, h.is_hidden, h.published_snapshot, m.availability_status, m.admin_suspended
  INTO v_house
  FROM public.memory_houses h
  JOIN public.memory_spaces m ON m.id = h.memory_id
  WHERE h.share_id = trim(p_share_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc liên kết đã bị thu hồi' USING ERRCODE = 'P0002';
  END IF;

  -- R2 Check: If hidden by moderation, block immediately with 42501
  IF COALESCE(v_house.is_hidden, false) THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' USING ERRCODE = '42501';
  END IF;

  IF NOT v_house.is_published THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này hiện đang ở chế độ riêng tư' USING ERRCODE = '42501';
  END IF;

  IF v_house.availability_status = 'suspended' OR COALESCE(v_house.admin_suspended, false) THEN
    RAISE EXCEPTION 'Kỷ niệm này hiện đang tạm ngưng truy cập' USING ERRCODE = '42501';
  END IF;

  IF v_house.published_snapshot IS NULL THEN
    RAISE EXCEPTION 'Chưa có bản xuất bản nào khả dụng' USING ERRCODE = 'P0002';
  END IF;

  -- R1: Sanitize rooms dynamically to guarantee existing legacy snapshots never leak private letters
  RETURN jsonb_build_object(
    'success', true,
    'title', v_house.published_snapshot->'title',
    'theme', v_house.published_snapshot->'theme',
    'rooms', public.sanitize_house_rooms(v_house.published_snapshot->'rooms'),
    'published_at', v_house.published_snapshot->'published_at'
  );
END;
$$;

-- Public view by Tag UID (for NFC flow)
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

  SELECT h.is_published, h.is_hidden, h.published_snapshot, m.availability_status, m.admin_suspended
  INTO v_house
  FROM public.memory_spaces m
  JOIN public.memory_houses h ON h.memory_id = m.id
  WHERE m.tag_uid = lower(trim(p_tag_uid));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm cho kỷ vật này' USING ERRCODE = 'P0002';
  END IF;

  -- R2 Check: If hidden by moderation, block immediately with 42501
  IF COALESCE(v_house.is_hidden, false) THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' USING ERRCODE = '42501';
  END IF;

  IF NOT v_house.is_published THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này hiện đang ở chế độ riêng tư' USING ERRCODE = '42501';
  END IF;

  IF v_house.availability_status = 'suspended' OR COALESCE(v_house.admin_suspended, false) THEN
    RAISE EXCEPTION 'Kỷ niệm này hiện đang tạm ngưng truy cập' USING ERRCODE = '42501';
  END IF;

  IF v_house.published_snapshot IS NULL THEN
    RAISE EXCEPTION 'Chưa có bản xuất bản nào khả dụng' USING ERRCODE = 'P0002';
  END IF;

  -- R1: Sanitize rooms dynamically
  RETURN jsonb_build_object(
    'success', true,
    'title', v_house.published_snapshot->'title',
    'theme', v_house.published_snapshot->'theme',
    'rooms', public.sanitize_house_rooms(v_house.published_snapshot->'rooms'),
    'published_at', v_house.published_snapshot->'published_at'
  );
END;
$$;

-- Drop or replace broken rpc_house_get_public so it does not fail with 42703
CREATE OR REPLACE FUNCTION public.rpc_house_get_public(
  p_share_id TEXT DEFAULT NULL,
  p_tag_uid TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF p_share_id IS NOT NULL AND length(trim(p_share_id)) > 0 THEN
    RETURN public.rpc_house_public_view(p_share_id);
  ELSIF p_tag_uid IS NOT NULL AND length(trim(p_tag_uid)) > 0 THEN
    RETURN public.rpc_house_tag_public_view(p_tag_uid);
  ELSE
    RAISE EXCEPTION 'Thiếu tham số định danh ngôi nhà' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_house_get_public(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_house_get_public(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. R3: ADMIN LIST REPORTS RPC WITH MATCHING SIGNATURE & PAGINATION
-- ----------------------------------------------------------------------------

-- Drop old 1-param signature if it exists
DROP FUNCTION IF EXISTS public.rpc_admin_list_reports(TEXT);

CREATE OR REPLACE FUNCTION public.rpc_admin_list_reports(
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_reports JSONB;
  v_limit INT;
  v_offset INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền xem danh sách báo cáo' USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(100, GREATEST(1, COALESCE(p_limit, 50)));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'resource_type', r.resource_type,
      'resource_id', r.resource_id,
      'reason', r.reason,
      'details', r.details,
      'status', r.status,
      'created_at', r.created_at,
      'reviewed_at', r.reviewed_at,
      'admin_notes', r.admin_notes
    )
  ), '[]'::jsonb)
  INTO v_reports
  FROM (
    SELECT *
    FROM public.event_content_reports
    WHERE (p_status IS NULL OR status = trim(p_status))
    ORDER BY created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) r;

  RETURN v_reports;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_list_reports(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_reports(TEXT, INT, INT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. R4: RATE LIMITER ATOMIC CONCURRENCY & PARAMETER CLAMPING
-- ----------------------------------------------------------------------------

ALTER TABLE public.event_rate_limits ADD COLUMN IF NOT EXISTS max_burst INT NOT NULL DEFAULT 10;

CREATE OR REPLACE FUNCTION public.rpc_check_rate_limit(
  p_key TEXT,
  p_max_burst INT DEFAULT 10,
  p_window_seconds INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_key TEXT;
  v_action TEXT;
  v_server_burst INT := 30;
  v_max_burst INT;
  v_locked_burst INT;
  v_window_seconds INT;
  v_tokens INT;
  v_expires_at TIMESTAMPTZ;
  v_allowed BOOLEAN;
  v_retry_after INT := 0;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'retry_after', 0);
  END IF;

  v_key := trim(p_key);
  IF length(v_key) > 128 THEN
    v_key := substr(v_key, 1, 128);
  END IF;

  -- Determine action category from key prefix
  v_action := split_part(v_key, ':', 1);

  IF v_action = 'report_submit' THEN
    v_server_burst := 5;
  ELSIF v_action = 'match_submit' THEN
    v_server_burst := 10;
  ELSIF v_action = 'match_create' OR v_action = 'match_begin' THEN
    v_server_burst := 15;
  ELSIF v_action = 'media_sign' THEN
    v_server_burst := 30;
  ELSIF v_action = 'analytics_track' OR v_action = 'house_public_share' OR v_action = 'house_public_tag' OR v_action = 'match_invite_get' THEN
    v_server_burst := 60;
  ELSIF v_action = 'match_progress' THEN
    v_server_burst := 120;
  ELSIF v_action = 'guestbook_submit' THEN
    v_server_burst := 10;
  ELSE
    v_server_burst := 30;
  END IF;

  -- Window clamping (1 to 3600 seconds)
  v_window_seconds := GREATEST(1, LEAST(3600, COALESCE(p_window_seconds, 60)));

  -- Burst clamping: client cannot override server action limit
  v_max_burst := LEAST(COALESCE(p_max_burst, v_server_burst), v_server_burst);
  IF v_max_burst < 1 THEN
    v_max_burst := 1;
  END IF;

  -- 5% chance cleanup of expired limits
  IF random() < 0.05 THEN
    DELETE FROM public.event_rate_limits WHERE expires_at < v_now;
  END IF;

  -- Atomic Upsert with ON CONFLICT DO UPDATE RETURNING
  INSERT INTO public.event_rate_limits (key, tokens, max_burst, expires_at, created_at)
  VALUES (v_key, 1, v_max_burst, v_now + (v_window_seconds || ' seconds')::interval, v_now)
  ON CONFLICT (key) DO UPDATE
  SET tokens = CASE
        WHEN public.event_rate_limits.expires_at < v_now THEN 1
        ELSE public.event_rate_limits.tokens + 1
      END,
      max_burst = CASE
        WHEN public.event_rate_limits.expires_at < v_now THEN v_max_burst
        ELSE public.event_rate_limits.max_burst
      END,
      expires_at = CASE
        WHEN public.event_rate_limits.expires_at < v_now THEN v_now + (v_window_seconds || ' seconds')::interval
        ELSE public.event_rate_limits.expires_at
      END
  RETURNING tokens, max_burst, expires_at INTO v_tokens, v_locked_burst, v_expires_at;

  v_allowed := (v_tokens <= v_locked_burst);
  IF NOT v_allowed THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_expires_at - v_now)))::int);
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'retry_after', v_retry_after,
    'current_count', v_tokens,
    'max_burst', v_locked_burst
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_rate_limit(TEXT, INT, INT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. R9: ANALYTICS INGESTION AUTHORITATIVE EVENT PROTECTION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_track_event_action(
  p_event_name TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_dedupe_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
  v_rate_check JSONB;
BEGIN
  -- Rate limit check internally (60 requests per minute per IP/caller)
  v_rate_check := public.rpc_check_rate_limit('analytics_track:' || COALESCE(v_caller::text, 'anon'), 60, 60);
  IF v_rate_check->>'allowed' = 'false' THEN
    RAISE EXCEPTION 'Vượt quá giới hạn ghi nhận sự kiện' USING ERRCODE = 'P0001';
  END IF;

  -- Disallow non-server callers from tracking authoritative events
  IF p_event_name IN ('match_both_completed', 'match_partner_completed', 'match_owner_completed', 'house_published', 'match_created') THEN
    IF v_role NOT IN ('service_role') AND session_user NOT IN ('postgres') THEN
      RAISE EXCEPTION 'Sự kiện mang tính thẩm quyền chỉ được ghi nhận từ hệ thống máy chủ' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_event_name NOT IN (
    'house_created', 'house_saved', 'house_published', 'house_unshared',
    'house_viewed_public', 'house_music_played', 'house_room_visited', 'house_photo_zoomed',
    'match_created', 'match_started', 'match_partner_completed', 'match_owner_completed', 'match_both_completed',
    'postcard_downloaded', 'postcard_shared', 'decor_item_placed'
  ) THEN
    RAISE EXCEPTION 'Tên sự kiện không hợp lệ' USING ERRCODE = '22023';
  END IF;

  IF p_resource_type NOT IN ('house', 'match', 'postcard') THEN
    RAISE EXCEPTION 'Loại tài nguyên không hợp lệ' USING ERRCODE = '22023';
  END IF;

  IF p_resource_id IS NULL OR length(trim(p_resource_id)) = 0 THEN
    RAISE EXCEPTION 'Định danh tài nguyên không được rỗng' USING ERRCODE = '22023';
  END IF;

  -- Deduplication check
  IF p_dedupe_key IS NOT NULL AND length(trim(p_dedupe_key)) > 0 THEN
    IF EXISTS (SELECT 1 FROM public.event_analytics_logs WHERE dedupe_key = trim(p_dedupe_key)) THEN
      RETURN jsonb_build_object('success', true, 'deduped', true);
    END IF;
  END IF;

  INSERT INTO public.event_analytics_logs (
    event_name,
    resource_type,
    resource_id,
    user_id,
    dedupe_key,
    metadata
  ) VALUES (
    trim(p_event_name),
    trim(p_resource_type),
    trim(p_resource_id),
    v_caller,
    NULLIF(trim(p_dedupe_key), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('success', true, 'deduped', false);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_track_event_action(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_track_event_action(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

COMMIT;
