\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.test_assert(ok BOOLEAN, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;

-- 1. Test helper execution privileges
SELECT test_assert(NOT has_function_privilege('anon', 'public.fn_validate_event_photo_path(text,text)', 'EXECUTE'), 'anon cannot execute fn_validate_event_photo_path');
SELECT test_assert(NOT has_function_privilege('authenticated', 'public.fn_validate_event_photo_path(text,text)', 'EXECUTE'), 'authenticated cannot execute fn_validate_event_photo_path');
SELECT test_assert(has_function_privilege('anon', 'public.rpc_house_tag_public_view(text)', 'EXECUTE'), 'anon can execute rpc_house_tag_public_view');
SELECT test_assert(has_function_privilege('authenticated', 'public.rpc_house_tag_public_view(text)', 'EXECUTE'), 'authenticated can execute rpc_house_tag_public_view');

-- 2. Setup mock users and memory space
INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000091', 'match-owner@test.invalid'),
 ('00000000-0000-0000-0000-000000000092', 'other-user@test.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.memory_spaces (id, tag_uid, jewelry_name, title, owner_id, availability_status)
VALUES ('00000000-0000-0000-0000-000000000081', 'emo-studio-test', 'Studio Ring', 'Studio Space', '00000000-0000-0000-0000-000000000091', 'available')
ON CONFLICT (tag_uid) DO UPDATE SET owner_id = '00000000-0000-0000-0000-000000000091';

INSERT INTO storage.objects (bucket_id, name)
VALUES ('emoria-event-media', 'emo-studio-test/photo1.jpg')
ON CONFLICT (bucket_id, name) DO NOTHING;

-- 3. Anonymous cannot create match
SET ROLE anon;
DO $$
BEGIN
  PERFORM public.rpc_match_create('emo-studio-test');
  RAISE EXCEPTION 'FAIL: anon should not create match';
EXCEPTION WHEN OTHERS THEN
  NULL; -- expected
END $$;
RESET ROLE;

-- 4. Other user (not owner) cannot create match
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000092', false);
DO $$
BEGIN
  PERFORM public.rpc_match_create('emo-studio-test');
  RAISE EXCEPTION 'FAIL: non-owner should not create match';
EXCEPTION WHEN OTHERS THEN
  NULL; -- expected
END $$;
RESET ROLE;

-- 5. Owner creates match
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', false);

DO $$
DECLARE
  v_match_id uuid;
  v_res jsonb;
  v_invite_token text;
  v_questions jsonb;
  v_view jsonb;
BEGIN
  v_res := public.rpc_match_create('emo-studio-test', 'Cuoc Thi Cua Doi Minh');
  PERFORM public.test_assert((v_res->>'success')::boolean, 'owner can create match');
  v_match_id := (v_res->>'match_id')::uuid;
  PERFORM public.test_assert(v_match_id IS NOT NULL, 'match created with valid id');

  -- Save 3 valid questions
  v_questions := '[
    {"id": 1, "text": "Cau 1", "options": ["A", "B"]},
    {"id": 2, "text": "Cau 2", "options": ["C", "D"]},
    {"id": 3, "text": "Cau 3", "options": ["E", "F"]}
  ]'::jsonb;
  v_res := public.rpc_match_save_questions(v_match_id, v_questions);
  PERFORM public.test_assert((v_res->>'success')::boolean, 'questions saved');

  -- Begin match
  v_res := public.rpc_match_begin(v_match_id);
  PERFORM public.test_assert((v_res->>'success')::boolean, 'match begun');
  v_invite_token := v_res->>'invite_token';
  PERFORM public.test_assert(v_invite_token IS NOT NULL, 'invite_token generated');

  -- Test decimal rejection in progress
  BEGIN
    PERFORM public.rpc_match_save_progress(v_match_id, '[0, 1.5, 0]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL: decimal progress was not rejected';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL; -- expected
  END;

  -- Test decimal rejection in submit
  BEGIN
    PERFORM public.rpc_match_submit(v_match_id, '[0, 1.5, 0]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL: decimal submit was not rejected';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL; -- expected
  END;

  -- Test negative rejection in submit
  BEGIN
    PERFORM public.rpc_match_submit(v_match_id, '[-1, 0, 0]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL: negative index submit was not rejected';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL; -- expected
  END;

  -- Test string rejection in submit
  BEGIN
    PERFORM public.rpc_match_submit(v_match_id, '["0", 0, 0]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL: string submit was not rejected';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL; -- expected
  END;

  -- Test out of bounds index (99)
  BEGIN
    PERFORM public.rpc_match_submit(v_match_id, '[0, 99, 0]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL: out of bounds submit was not rejected';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL; -- expected
  END;

  -- Owner submits valid answers: [0, 1, 0]
  v_res := public.rpc_match_submit(v_match_id, '[0, 1, 0]'::jsonb, NULL);
  PERFORM public.test_assert((v_res->>'success')::boolean, 'owner submit success');
  PERFORM public.test_assert((v_res->>'both_submitted')::boolean = false, 'not both submitted yet');

  -- Owner views match before partner submits: partner answers must be hidden
  v_view := public.rpc_match_get_view(v_match_id, NULL);
  PERFORM public.test_assert((v_view->>'my_submitted')::boolean = true, 'owner submitted recorded');
  PERFORM public.test_assert((v_view->>'status') = 'active', 'still active before partner submit');
  PERFORM public.test_assert(v_view->>'other_answers' IS NULL, 'other answers hidden before both submit');
  PERFORM public.test_assert((v_view->>'both_submitted')::boolean = false, 'not both submitted in view');

  -- Partner submits via invite_token: [0, 1, 1] -> 2 matches (index 0, index 1)
  v_res := public.rpc_match_submit(v_match_id, '[0, 1, 1]'::jsonb, v_invite_token);
  PERFORM public.test_assert((v_res->>'success')::boolean, 'partner submit success');
  PERFORM public.test_assert((v_res->>'both_submitted')::boolean = true, 'both submitted now true');
  PERFORM public.test_assert((v_res->>'score')::int = 2, 'score computed correctly as 2');

  -- Reveal check: both submitted, status completed
  v_view := public.rpc_match_get_view(v_match_id, NULL);
  PERFORM public.test_assert((v_view->>'status') = 'completed', 'status is now completed');
  PERFORM public.test_assert((v_view->>'score')::int = 2, 'reveal score is 2');
  PERFORM public.test_assert((v_view->>'total_questions')::int = 3, 'reveal total_questions is 3');
  PERFORM public.test_assert(v_view->'other_answers' IS NOT NULL, 'other_answers revealed');

  -- Idempotency check: submitting again returns success without altering score
  v_res := public.rpc_match_submit(v_match_id, '[1, 0, 1]'::jsonb, NULL);
  PERFORM public.test_assert((v_res->>'already_submitted')::boolean = true, 'idempotent resubmit');
  PERFORM public.test_assert((v_res->>'score')::int = 2, 'score unchanged on resubmit');

END $$;
RESET ROLE;

-- 6. Memory House Studio live tests
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', false);

DO $$
DECLARE
  v_res jsonb;
  v_share_id text;
  v_public_view jsonb;
  v_tag_view jsonb;
  v_new_share_id text;
BEGIN
  -- Test invalid photo path rejected
  BEGIN
    PERFORM public.rpc_house_save_draft('emo-studio-test', 'To Am Cua Minh & Lan', 'warm_gold', '[
      {"id": "beginning", "name": "Ngay bat dau", "note": "Loi tua 1", "memories": [{"id": "m_bad", "title": "Bad", "photo_path": "emo-studio-test/non-existent.jpg"}]},
      {"id": "first", "name": "Lan dau cua doi minh", "note": "Loi tua 2", "memories": []},
      {"id": "little-things", "name": "Dieu nho xiu", "note": "Loi tua 3", "memories": []},
      {"id": "memories", "name": "Mien ky uc", "note": "Loi tua 4", "memories": []},
      {"id": "next-chapter", "name": "Chuong tiep theo", "note": "Loi tua 5", "memories": []}
    ]'::jsonb);
    RAISE EXCEPTION 'FAIL: non existent photo path was not rejected';
  EXCEPTION WHEN sqlstate '22023' THEN
    NULL; -- expected
  END;

  -- Save valid draft with existing photo in beginning room
  v_res := public.rpc_house_save_draft('emo-studio-test', 'To Am Cua Minh & Lan', 'warm_gold', '[
    {"id": "beginning", "name": "Ngay bat dau", "note": "Loi tua 1", "memories": [{"id": "m1", "title": "Khoanh khac dau", "photo_path": "emo-studio-test/photo1.jpg", "note": "Ngay ay"}]},
    {"id": "first", "name": "Lan dau cua doi minh", "note": "Loi tua 2", "memories": []},
    {"id": "little-things", "name": "Dieu nho xiu", "note": "Loi tua 3", "memories": []},
    {"id": "memories", "name": "Mien ky uc", "note": "Loi tua 4", "memories": []},
    {"id": "next-chapter", "name": "Chuong tiep theo", "note": "Loi tua 5", "memories": []}
  ]'::jsonb);
  PERFORM public.test_assert((v_res->>'success')::boolean, 'house draft saved');

  -- Public view by tag UID before publish must fail with 42501 (private / unpublished)
  EXECUTE 'SET ROLE anon';
  BEGIN
    PERFORM public.rpc_house_tag_public_view('emo-studio-test');
    RAISE EXCEPTION 'FAIL: unpublished house should not be readable via tag';
  EXCEPTION WHEN sqlstate '42501' THEN
    NULL; -- expected 42501
  END;

  -- Revert to authenticated owner
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', false);

  -- Publish house
  v_res := public.rpc_house_publish('emo-studio-test');
  PERFORM public.test_assert((v_res->>'success')::boolean, 'house published');
  v_share_id := v_res->>'share_id';
  PERFORM public.test_assert(v_share_id IS NOT NULL, 'share_id returned');

  -- Public view by anonymous via share_id AND tag_uid
  EXECUTE 'SET ROLE anon';
  v_public_view := public.rpc_house_public_view(v_share_id);
  PERFORM public.test_assert((v_public_view->>'title') = 'To Am Cua Minh & Lan', 'public view title');
  PERFORM public.test_assert(jsonb_array_length(v_public_view->'rooms') = 5, 'public view 5 rooms');

  v_tag_view := public.rpc_house_tag_public_view('emo-studio-test');
  PERFORM public.test_assert((v_tag_view->>'title') = 'To Am Cua Minh & Lan', 'tag public view title');
  PERFORM public.test_assert(jsonb_array_length(v_tag_view->'rooms') = 5, 'tag public view 5 rooms');
  PERFORM public.test_assert(v_tag_view->>'pin_hash' IS NULL, 'no pin_hash in tag public view');
  PERFORM public.test_assert(v_tag_view->>'letter' IS NULL, 'no letter in tag public view');

  -- Unpublish
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', false);
  v_res := public.rpc_house_unpublish('emo-studio-test');
  PERFORM public.test_assert((v_res->>'success')::boolean, 'house unpublished');

  -- Public view should now be denied for both share_id and tag_uid
  EXECUTE 'SET ROLE anon';
  BEGIN
    PERFORM public.rpc_house_public_view(v_share_id);
    RAISE EXCEPTION 'FAIL: unpublished house should not be readable via share_id';
  EXCEPTION WHEN sqlstate '42501' THEN
    NULL; -- expected
  END;

  BEGIN
    PERFORM public.rpc_house_tag_public_view('emo-studio-test');
    RAISE EXCEPTION 'FAIL: unpublished house should not be readable via tag';
  EXCEPTION WHEN sqlstate '42501' THEN
    NULL; -- expected 42501
  END;

  -- Re-publish and test revoke
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', false);
  PERFORM public.rpc_house_publish('emo-studio-test');

  v_res := public.rpc_house_revoke_share('emo-studio-test');
  PERFORM public.test_assert((v_res->>'success')::boolean, 'house revoke share succeeded');
  PERFORM public.test_assert((v_res->>'revoked')::boolean, 'house revoke marked revoked');

  -- Old share_id is now rejected with P0002
  EXECUTE 'SET ROLE anon';
  BEGIN
    PERFORM public.rpc_house_public_view(v_share_id);
    RAISE EXCEPTION 'FAIL: revoked share_id should not be readable';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    NULL; -- expected P0002
  END;

  -- Tag public view is now rejected with 42501 because is_published is false
  BEGIN
    PERFORM public.rpc_house_tag_public_view('emo-studio-test');
    RAISE EXCEPTION 'FAIL: revoked house should not be readable via tag';
  EXCEPTION WHEN sqlstate '42501' THEN
    NULL; -- expected 42501
  END;

END $$;
RESET ROLE;

SELECT 'PASS EVENT STUDIOS DATABASE REGRESSION TEST' AS status;
