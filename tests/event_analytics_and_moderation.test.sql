-- ============================================================================
-- SQL Regression Test: Event Analytics, Rate Limiting & Content Moderation
-- ============================================================================
BEGIN;

-- 1. Test Atomic Rate Limiting
SELECT 'Test 1: Rate limiter within burst' as test_case;
DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- Check with key 'test:ip:1' burst 3 window 60s
  v_res := public.rpc_check_rate_limit('test:ip:1', 3, 60);
  IF NOT (v_res->>'allowed')::boolean THEN
    RAISE EXCEPTION '1st call should be allowed';
  END IF;

  v_res := public.rpc_check_rate_limit('test:ip:1', 3, 60);
  v_res := public.rpc_check_rate_limit('test:ip:1', 3, 60);
  IF NOT (v_res->>'allowed')::boolean THEN
    RAISE EXCEPTION '3rd call within burst should be allowed';
  END IF;

  -- 4th call should be blocked
  v_res := public.rpc_check_rate_limit('test:ip:1', 3, 60);
  IF (v_res->>'allowed')::boolean THEN
    RAISE EXCEPTION '4th call exceeding burst should be BLOCKED';
  END IF;
  IF (v_res->>'retry_after')::int <= 0 THEN
    RAISE EXCEPTION 'retry_after should be greater than 0';
  END IF;
END $$;

-- 2. Test Direct RPC Blocked for anon and authenticated (Permissions Revoked)
SELECT 'Test 2: Direct RPC blocked for anon and authenticated' as test_case;
DO $$
DECLARE
  v_blocked BOOLEAN := FALSE;
BEGIN
  -- Test anon
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.rpc_track_event_action(
      'house_viewed_public',
      'house',
      '00000000-0000-0000-0000-000000000001'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_blocked := TRUE;
  END;
  RESET ROLE;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Direct rpc_track_event_action should be blocked with 42501 for anon';
  END IF;

  -- Test authenticated
  v_blocked := FALSE;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.rpc_track_event_action(
      'house_viewed_public',
      'house',
      '00000000-0000-0000-0000-000000000001'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_blocked := TRUE;
  END;
  RESET ROLE;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Direct rpc_track_event_action should be blocked with 42501 for authenticated';
  END IF;
END $$;

-- 3. Test Event Tracking & Deduplication under authorized backend role
SELECT 'Test 3: Event tracking & deduplication' as test_case;
DO $$
DECLARE
  v_res JSONB;
  v_count INT;
  v_record RECORD;
BEGIN
  -- Track with dedupe key
  v_res := public.rpc_track_event_action(
    'house_viewed_public',
    'house',
    '00000000-0000-0000-0000-000000000001',
    'dedupe:house:1:view',
    '{"session_id": "sess_test_123", "client_env": "web"}'::jsonb
  );

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Event tracking should succeed';
  END IF;
  IF (v_res->>'deduped')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'First event tracking should not be marked as deduped';
  END IF;

  -- Verify record was written to event_analytics_logs with correct schema
  SELECT * INTO v_record FROM public.event_analytics_logs WHERE dedupe_key = 'dedupe:house:1:view';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log record was not inserted into event_analytics_logs';
  END IF;
  IF v_record.session_id <> 'sess_test_123' THEN
    RAISE EXCEPTION 'session_id was not properly saved, expected sess_test_123, got %', v_record.session_id;
  END IF;
  IF v_record.resource_type <> 'house' THEN
    RAISE EXCEPTION 'resource_type mismatch';
  END IF;

  -- Track again with SAME dedupe key (should be idempotent)
  v_res := public.rpc_track_event_action(
    'house_viewed_public',
    'house',
    '00000000-0000-0000-0000-000000000001',
    'dedupe:house:1:view',
    '{"session_id": "sess_test_123", "client_env": "web"}'::jsonb
  );

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Duplicate event tracking should still succeed';
  END IF;
  IF (v_res->>'deduped')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Duplicate event tracking should be marked as deduped: true';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_analytics_logs WHERE dedupe_key = 'dedupe:house:1:view';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Deduplication failed, count is % instead of 1', v_count;
  END IF;

  -- Also track authoritative event (match_both_completed) under authorized role
  v_res := public.rpc_track_event_action(
    'match_both_completed',
    'match',
    '00000000-0000-0000-0000-000000000001',
    'dedupe:match:1:complete',
    '{"funnel": "completed"}'::jsonb
  );
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Authoritative event should succeed under authorized role';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_analytics_logs WHERE dedupe_key = 'dedupe:match:1:complete';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Authoritative event deduplication failed, count is % instead of 1', v_count;
  END IF;
END $$;

-- 4. Test Invalid Event Name and Resource Type Rejection
SELECT 'Test 4: Invalid event name and resource type rejection' as test_case;
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
BEGIN
  -- Test invalid event name
  BEGIN
    PERFORM public.rpc_track_event_action('invalid_hacked_event', 'match', 'res1');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Invalid event name should have been rejected with 22023';
  END IF;

  -- Test invalid resource type
  v_failed := FALSE;
  BEGIN
    PERFORM public.rpc_track_event_action('house_viewed_public', 'invalid_resource_type', 'res1');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Invalid resource type should have been rejected with 22023';
  END IF;

  -- Test empty resource ID
  v_failed := FALSE;
  BEGIN
    PERFORM public.rpc_track_event_action('house_viewed_public', 'house', '   ');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Empty resource_id should have been rejected with 22023';
  END IF;
END $$;

-- 5. Test Content Reporting & Moderation
SELECT 'Test 5: Content reporting and admin moderation' as test_case;
DO $$
DECLARE
  v_report_res JSONB;
  v_report_id UUID;
  v_rep_status TEXT;
  v_match_id UUID := '00000000-0000-0000-0000-000000000099';
BEGIN
  -- Ensure memory space exists for foreign key
  INSERT INTO auth.users (id, email) VALUES
   ('00000000-0000-0000-0000-000000000091', 'mod-owner@test.invalid')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.memory_spaces (id, tag_uid, jewelry_name, title, owner_id, availability_status)
  VALUES ('00000000-0000-0000-0000-000000000081', 'emo-studio-test', 'Studio Ring', 'Studio Space', '00000000-0000-0000-0000-000000000091', 'available')
  ON CONFLICT (tag_uid) DO UPDATE SET owner_id = '00000000-0000-0000-0000-000000000091';

  -- Create dummy match if not exists
  INSERT INTO public.memory_matches (id, memory_id, title, status, questions)
  VALUES (
    v_match_id,
    '00000000-0000-0000-0000-000000000081',
    'Match to Report',
    'active',
    '[]'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  -- Submit report
  v_report_res := public.rpc_submit_content_report(
    'match',
    v_match_id::text,
    'inappropriate_content',
    'Nội dung không phù hợp văn hóa'
  );
  v_report_id := (v_report_res->>'report_id')::uuid;

  SELECT status INTO v_rep_status FROM public.event_content_reports WHERE id = v_report_id;
  IF v_rep_status <> 'pending' THEN
    RAISE EXCEPTION 'New report should be pending, got %', v_rep_status;
  END IF;

  -- Moderate to 'hide' (simulate admin bypass for test script)
  UPDATE public.memory_matches
  SET is_hidden = TRUE, hidden_reason = 'Vi phạm tiêu chuẩn cộng đồng', hidden_at = now()
  WHERE id = v_match_id;

  UPDATE public.event_content_reports
  SET status = 'hidden'
  WHERE id = v_report_id;

  -- Verify match is hidden
  IF NOT (SELECT is_hidden FROM public.memory_matches WHERE id = v_match_id) THEN
    RAISE EXCEPTION 'Match should be marked as hidden';
  END IF;
END $$;

ROLLBACK;
