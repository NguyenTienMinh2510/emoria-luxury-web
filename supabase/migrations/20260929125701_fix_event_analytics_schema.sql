-- ============================================================================
-- EMORIA LUXURY - FIX EVENT ANALYTICS SCHEMA & RPC
-- Migration: 20260929125701_fix_event_analytics_schema.sql
-- 
-- Fixes:
-- 1. Updates event_analytics_logs check constraint to allow ('match', 'house', 'postcard')
-- 2. Corrects rpc_track_event_action to match current table schema:
--    - Removes non-existent user_id column from INSERT
--    - Stores session_id from metadata if present
--    - Enforces safe event name & resource type allowlist
--    - Sanitizes metadata (strips private letters, secrets, pins, tokens)
--    - Protects authoritative events (completion, publishing, creation) from client spoofing
--    - Enforces deduplication using dedupe_key
--    - Revokes execute from anon/authenticated and grants to service_role
--    - Notifies PostgREST to reload schema
-- ============================================================================

BEGIN;

-- 1. Ensure resource_type check constraint covers all event studio resource types
ALTER TABLE public.event_analytics_logs
  DROP CONSTRAINT IF EXISTS event_analytics_logs_resource_type_check;

ALTER TABLE public.event_analytics_logs
  ADD CONSTRAINT event_analytics_logs_resource_type_check
  CHECK (resource_type IN ('match', 'house', 'postcard'));

-- 2. Redefine rpc_track_event_action matching actual table schema
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
  v_clean_meta JSONB;
  v_session_id TEXT;
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

  -- Validate event name against allowlist
  IF p_event_name NOT IN (
    'match_created', 'match_invite_opened', 'match_started',
    'match_owner_completed', 'match_partner_completed', 'match_both_completed',
    'house_created', 'house_saved', 'house_published', 'house_unshared',
    'house_opened_share', 'house_share_click', 'house_copy_link',
    'house_viewed_public', 'house_music_played', 'house_room_visited',
    'house_photo_zoomed', 'decor_item_placed',
    'postcard_downloaded', 'postcard_shared',
    'house_postcard_download', 'house_postcard_shared'
  ) THEN
    RAISE EXCEPTION 'Tên sự kiện không hợp lệ' USING ERRCODE = '22023';
  END IF;

  -- Validate resource type
  IF p_resource_type NOT IN ('house', 'match', 'postcard') THEN
    RAISE EXCEPTION 'Loại tài nguyên không hợp lệ' USING ERRCODE = '22023';
  END IF;

  -- Validate resource ID
  IF p_resource_id IS NULL OR length(trim(p_resource_id)) = 0 THEN
    RAISE EXCEPTION 'Định danh tài nguyên không được rỗng' USING ERRCODE = '22023';
  END IF;

  -- Sanitize metadata: remove private letter, PIN, answers, secret tokens
  v_clean_meta := COALESCE(p_metadata, '{}'::jsonb) - 'letter' - 'pin' - 'answers' - 'token' - 'invite_token' - 'storage_path';
  v_session_id := NULLIF(trim(COALESCE(v_clean_meta->>'session_id', '')), '');

  -- Deduplication check
  IF p_dedupe_key IS NOT NULL AND length(trim(p_dedupe_key)) > 0 THEN
    IF EXISTS (SELECT 1 FROM public.event_analytics_logs WHERE dedupe_key = trim(p_dedupe_key)) THEN
      RETURN jsonb_build_object('success', true, 'deduped', true);
    END IF;
  END IF;

  -- Insert into event_analytics_logs (no user_id column)
  INSERT INTO public.event_analytics_logs (
    event_name,
    resource_type,
    resource_id,
    session_id,
    dedupe_key,
    metadata,
    created_at
  ) VALUES (
    trim(p_event_name),
    trim(p_resource_type),
    trim(p_resource_id),
    v_session_id,
    NULLIF(trim(p_dedupe_key), ''),
    v_clean_meta,
    now()
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'deduped', false);
END;
$$;

-- 3. Execution privileges: internal service_role only (gateway/dispatcher architecture)
REVOKE ALL ON FUNCTION public.rpc_track_event_action(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_track_event_action(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
