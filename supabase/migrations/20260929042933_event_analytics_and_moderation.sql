-- ============================================================================
-- EMORIA LUXURY - EVENT STUDIOS: ANALYTICS, REALTIME & CONTENT MODERATION (Chặng E & F)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MODERATION FLAGS ON EVENT TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.memory_houses
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES auth.users(id);

ALTER TABLE public.memory_matches
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES auth.users(id);

-- ----------------------------------------------------------------------------
-- 2. EVENT CONTENT REPORTS (Hàng chờ kiểm duyệt nội dung)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('house', 'match', 'guestbook')),
  resource_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('inappropriate_content', 'harassment', 'copyright', 'spam', 'other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'hidden', 'dismissed', 'restored')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_content_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_content_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_content_reports TO authenticated;

DROP POLICY IF EXISTS "Admin only read reports" ON public.event_content_reports;
CREATE POLICY "Admin only read reports" ON public.event_content_reports
  FOR SELECT TO authenticated USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. SHARED ATOMIC RATE LIMITS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_rate_limits (
  key TEXT PRIMARY KEY,
  tokens INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_rate_limits_expires ON public.event_rate_limits(expires_at);

ALTER TABLE public.event_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_rate_limits FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. EVENT ANALYTICS LOGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_analytics_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('match', 'house')),
  resource_id TEXT NOT NULL,
  session_id TEXT,
  dedupe_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_analytics_event_name_created ON public.event_analytics_logs(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_analytics_resource ON public.event_analytics_logs(resource_type, resource_id);

ALTER TABLE public.event_analytics_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_analytics_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_analytics_logs TO authenticated;

DROP POLICY IF EXISTS "Admin only read event analytics" ON public.event_analytics_logs;
CREATE POLICY "Admin only read event analytics" ON public.event_analytics_logs
  FOR SELECT TO authenticated USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. RPC: ATOMIC RATE LIMIT CHECKER
-- ----------------------------------------------------------------------------
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
  v_record RECORD;
  v_allowed BOOLEAN;
  v_retry_after INT := 0;
  v_current INT := 1;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'retry_after', 0);
  END IF;

  -- 5% chance cleanup of expired limits
  IF random() < 0.05 THEN
    DELETE FROM public.event_rate_limits WHERE expires_at < v_now;
  END IF;

  SELECT * INTO v_record FROM public.event_rate_limits WHERE key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.event_rate_limits (key, tokens, expires_at, created_at)
    VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval, v_now);
    v_allowed := (1 <= p_max_burst);
    v_current := 1;
  ELSE
    IF v_record.expires_at < v_now THEN
      -- Expired window, reset
      UPDATE public.event_rate_limits
      SET tokens = 1,
          expires_at = v_now + (p_window_seconds || ' seconds')::interval
      WHERE key = p_key;
      v_allowed := true;
      v_current := 1;
    ELSE
      v_current := v_record.tokens + 1;
      UPDATE public.event_rate_limits
      SET tokens = v_current
      WHERE key = p_key;
      v_allowed := (v_current <= p_max_burst);
      IF NOT v_allowed THEN
        v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_record.expires_at - v_now)))::int);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'retry_after', v_retry_after,
    'current_count', v_current,
    'max_burst', p_max_burst
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_rate_limit(TEXT, INT, INT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: EVENT TRACKING INGESTION (Deduplicated, Validated & Safe)
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
  v_clean_meta JSONB;
BEGIN
  -- Strict allowlist of event names
  IF p_event_name NOT IN (
    'match_invite_opened', 'match_started', 'match_owner_completed',
    'match_partner_completed', 'match_both_completed', 'house_published',
    'house_opened_share', 'house_share_click', 'house_copy_link',
    'house_postcard_download', 'house_postcard_shared'
  ) THEN
    RAISE EXCEPTION 'Loại sự kiện không hợp lệ' USING ERRCODE = '22023';
  END IF;

  IF p_resource_type NOT IN ('match', 'house') THEN
    RAISE EXCEPTION 'Loại tài nguyên sự kiện không hợp lệ' USING ERRCODE = '22023';
  END IF;

  -- Sanitize metadata: remove private letter, PIN, answers, secret tokens
  v_clean_meta := COALESCE(p_metadata, '{}'::jsonb) - 'letter' - 'pin' - 'answers' - 'token' - 'invite_token' - 'storage_path';

  IF p_dedupe_key IS NOT NULL AND length(trim(p_dedupe_key)) > 0 THEN
    INSERT INTO public.event_analytics_logs (
      event_name, resource_type, resource_id, dedupe_key, metadata, created_at
    )
    VALUES (
      p_event_name, p_resource_type, p_resource_id, trim(p_dedupe_key), v_clean_meta, now()
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  ELSE
    INSERT INTO public.event_analytics_logs (
      event_name, resource_type, resource_id, metadata, created_at
    )
    VALUES (
      p_event_name, p_resource_type, p_resource_id, v_clean_meta, now()
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_track_event_action(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_track_event_action(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC: ADMIN EVENT ANALYTICS SUMMARY & FUNNEL
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_event_analytics_summary(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_total_events BIGINT;
  v_events_by_type JSONB;
  v_funnel_match JSONB;
  v_funnel_house JSONB;
  v_daily JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền xem báo cáo thống kê' USING ERRCODE = '42501';
  END IF;

  v_since := now() - (GREATEST(1, LEAST(p_days, 180)) || ' days')::interval;

  SELECT count(*) INTO v_total_events
  FROM public.event_analytics_logs
  WHERE created_at >= v_since;

  -- Event counts by type
  SELECT COALESCE(jsonb_object_agg(event_name, count_val), '{}'::jsonb)
  INTO v_events_by_type
  FROM (
    SELECT event_name, count(*) as count_val
    FROM public.event_analytics_logs
    WHERE created_at >= v_since
    GROUP BY event_name
  ) t;

  -- Match Funnel
  v_funnel_match := jsonb_build_object(
    'invite_opened', COALESCE((v_events_by_type->>'match_invite_opened')::int, 0),
    'started', COALESCE((v_events_by_type->>'match_started')::int, 0),
    'owner_completed', COALESCE((v_events_by_type->>'match_owner_completed')::int, 0),
    'partner_completed', COALESCE((v_events_by_type->>'match_partner_completed')::int, 0),
    'both_completed', COALESCE((v_events_by_type->>'match_both_completed')::int, 0)
  );

  -- House Funnel
  v_funnel_house := jsonb_build_object(
    'published', COALESCE((v_events_by_type->>'house_published')::int, 0),
    'opened_share', COALESCE((v_events_by_type->>'house_opened_share')::int, 0),
    'share_clicked', COALESCE((v_events_by_type->>'house_share_click')::int, 0),
    'copy_link', COALESCE((v_events_by_type->>'house_copy_link')::int, 0),
    'postcard_download', COALESCE((v_events_by_type->>'house_postcard_download')::int, 0),
    'postcard_shared', COALESCE((v_events_by_type->>'house_postcard_shared')::int, 0)
  );

  -- Daily aggregation
  SELECT COALESCE(jsonb_agg(d ORDER BY d->>'date'), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT jsonb_build_object('date', to_char(created_at, 'YYYY-MM-DD'), 'count', count(*)) as d
    FROM public.event_analytics_logs
    WHERE created_at >= v_since
    GROUP BY to_char(created_at, 'YYYY-MM-DD')
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'days', p_days,
    'total_events', v_total_events,
    'events_by_type', v_events_by_type,
    'funnel_match', v_funnel_match,
    'funnel_house', v_funnel_house,
    'daily_trends', v_daily,
    'updated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_event_analytics_summary(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_event_analytics_summary(INT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. RPC: CONTENT REPORT SUBMISSION (Visitor/User Report)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_submit_content_report(
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_reason TEXT,
  p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_report_id UUID;
BEGIN
  IF p_resource_type NOT IN ('house', 'match', 'guestbook') THEN
    RAISE EXCEPTION 'Loại tài nguyên báo cáo không hợp lệ' USING ERRCODE = '22023';
  END IF;

  IF p_reason NOT IN ('inappropriate_content', 'harassment', 'copyright', 'spam', 'other') THEN
    RAISE EXCEPTION 'Lý do báo cáo không hợp lệ' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_content_reports (
    resource_type, resource_id, reason, details, status, created_at
  )
  VALUES (
    p_resource_type, p_resource_id, p_reason, p_details, 'pending', now()
  )
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_content_report(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_content_report(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. RPC: ADMIN MODERATE CONTENT (Hide, Restore, Dismiss)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_moderate_content(
  p_report_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_report RECORD;
  v_caller UUID := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền kiểm duyệt nội dung' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('hide', 'restore', 'dismiss') THEN
    RAISE EXCEPTION 'Hành động kiểm duyệt không hợp lệ' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_report FROM public.event_content_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Báo cáo vi phạm không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'hide' THEN
    IF v_report.resource_type = 'house' THEN
      UPDATE public.memory_houses
      SET is_hidden = TRUE,
          hidden_reason = COALESCE(p_reason, 'Vi phạm tiêu chuẩn cộng đồng'),
          hidden_at = now(),
          hidden_by = v_caller
      WHERE share_id = v_report.resource_id OR memory_id IN (
        SELECT id FROM public.memory_spaces WHERE tag_uid = v_report.resource_id
      );
    ELSIF v_report.resource_type = 'match' THEN
      UPDATE public.memory_matches
      SET is_hidden = TRUE,
          hidden_reason = COALESCE(p_reason, 'Vi phạm tiêu chuẩn cộng đồng'),
          hidden_at = now(),
          hidden_by = v_caller
      WHERE id::text = v_report.resource_id;
    END IF;

    UPDATE public.event_content_reports
    SET status = 'hidden',
        admin_notes = p_reason,
        reviewed_by = v_caller,
        reviewed_at = now()
    WHERE id = p_report_id;

  ELSIF p_action = 'restore' THEN
    IF v_report.resource_type = 'house' THEN
      UPDATE public.memory_houses
      SET is_hidden = FALSE,
          hidden_reason = NULL,
          hidden_at = NULL,
          hidden_by = NULL
      WHERE share_id = v_report.resource_id OR memory_id IN (
        SELECT id FROM public.memory_spaces WHERE tag_uid = v_report.resource_id
      );
    ELSIF v_report.resource_type = 'match' THEN
      UPDATE public.memory_matches
      SET is_hidden = FALSE,
          hidden_reason = NULL,
          hidden_at = NULL,
          hidden_by = NULL
      WHERE id::text = v_report.resource_id;
    END IF;

    UPDATE public.event_content_reports
    SET status = 'restored',
        admin_notes = p_reason,
        reviewed_by = v_caller,
        reviewed_at = now()
    WHERE id = p_report_id;

  ELSIF p_action = 'dismiss' THEN
    UPDATE public.event_content_reports
    SET status = 'dismissed',
        admin_notes = p_reason,
        reviewed_by = v_caller,
        reviewed_at = now()
    WHERE id = p_report_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'action', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_moderate_content(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_moderate_content(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. RPC: ADMIN LIST CONTENT REPORTS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_list_reports(
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_reports JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền xem danh sách báo cáo' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'resource_type', r.resource_type,
      'resource_id', r.resource_id,
      'reason', r.reason,
      'details', r.details,
      'status', r.status,
      'admin_notes', r.admin_notes,
      'created_at', r.created_at,
      'reviewed_at', r.reviewed_at
    ) ORDER BY r.created_at DESC
  ), '[]'::jsonb)
  INTO v_reports
  FROM public.event_content_reports r
  WHERE (p_status IS NULL OR r.status = p_status);

  RETURN jsonb_build_object('success', true, 'reports', v_reports);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_list_reports(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_reports(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. ENFORCE IS_HIDDEN IN RPC_MATCH_GET_VIEW AND RPC_HOUSE_GET_PUBLIC
-- ----------------------------------------------------------------------------
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

  -- Kiểm tra nội dung có bị ẩn do kiểm duyệt không
  IF v_match.is_hidden THEN
    RAISE EXCEPTION 'Lượt chơi này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' USING ERRCODE = '42501';
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
    'role', v_role,
    'my_submitted', v_my_submitted,
    'other_submitted', v_other_submitted,
    'both_submitted', v_both_submitted,
    'my_answers', v_my_answers,
    'other_answers', v_other_answers,
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

REVOKE ALL ON FUNCTION public.rpc_match_get_view(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_match_get_view(UUID, TEXT) TO anon, authenticated;

-- Update rpc_house_get_public to enforce is_hidden
CREATE OR REPLACE FUNCTION public.rpc_house_get_public(
  p_share_id TEXT DEFAULT NULL,
  p_tag_uid TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_house RECORD;
  v_snap JSONB;
BEGIN
  IF p_share_id IS NOT NULL AND length(trim(p_share_id)) > 0 THEN
    SELECT mh.*, m.is_revoked, m.tag_uid as current_tag
    INTO v_house
    FROM public.memory_houses mh
    JOIN public.memory_spaces m ON m.id = mh.memory_id
    WHERE mh.share_id = trim(p_share_id);
  ELSIF p_tag_uid IS NOT NULL AND length(trim(p_tag_uid)) > 0 THEN
    SELECT mh.*, m.is_revoked, m.tag_uid as current_tag
    INTO v_house
    FROM public.memory_houses mh
    JOIN public.memory_spaces m ON m.id = mh.memory_id
    WHERE m.tag_uid = trim(p_tag_uid);
  ELSE
    RAISE EXCEPTION 'Thiếu tham số định danh ngôi nhà' USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc liên kết đã bị thu hồi' USING ERRCODE = 'P0002';
  END IF;

  IF v_house.is_revoked THEN
    RAISE EXCEPTION 'Không tìm thấy ngôi nhà kỷ niệm hoặc liên kết đã bị thu hồi' USING ERRCODE = 'P0002';
  END IF;

  IF v_house.is_hidden THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này đã bị tạm ẩn do vi phạm tiêu chuẩn cộng đồng' USING ERRCODE = '42501';
  END IF;

  IF NOT v_house.is_published THEN
    RAISE EXCEPTION 'Không gian ngôi nhà này hiện đang ở chế độ riêng tư' USING ERRCODE = '42501';
  END IF;

  v_snap := v_house.published_snapshot;
  IF v_snap IS NULL THEN
    RAISE EXCEPTION 'Không gian ngôi nhà chưa có dữ liệu công khai' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'title', v_snap->>'title',
    'theme', v_snap->>'theme',
    'rooms', v_snap->'rooms',
    'published_at', v_house.published_at,
    'share_id', v_house.share_id,
    'tag_uid', v_house.current_tag
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_house_get_public(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_house_get_public(TEXT, TEXT) TO anon, authenticated;
