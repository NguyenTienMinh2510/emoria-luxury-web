\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  created_memory_id uuid;
  tag text := 'house-revision-' || gen_random_uuid()::text;
  rooms jsonb;
  reviewed_revision bigint;
  changed_revision bigint;
  result jsonb;
  frozen jsonb;
  published boolean;
  invalid jsonb;
BEGIN
  IF has_function_privilege('anon','public.rpc_event_dispatch(text,jsonb,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.rpc_event_dispatch(text,jsonb,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.rpc_event_dispatch(text,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: dispatcher ACL changed';
  END IF;

  INSERT INTO auth.users(id,email) VALUES(owner_id,owner_id::text || '@house-revision.test');
  INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,owner_id,availability_status)
    VALUES(tag,'Test house','Revision test',owner_id,'available') RETURNING id INTO created_memory_id;
  INSERT INTO storage.objects(bucket_id,name) VALUES('emoria-event-media',tag || '/photo.jpg');
  rooms := jsonb_build_array(jsonb_build_object('id','beginning','name','Revision room',
    'memories',jsonb_build_array(jsonb_build_object('id','photo','photo_path',tag || '/photo.jpg'))));
  result := public.rpc_event_dispatch('rpc_house_save_draft',jsonb_build_object(
    'p_tag_uid',tag,'p_title','Reviewed title','p_theme','warm_gold','p_rooms',rooms,'expected_revision',0),owner_id);
  reviewed_revision := (result->>'draft_revision')::bigint;
  IF reviewed_revision IS NULL OR reviewed_revision < 1 THEN RAISE EXCEPTION 'FAIL: draft revision missing'; END IF;

  BEGIN
    PERFORM public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',tag),owner_id);
    RAISE EXCEPTION 'FAIL: publication without a reviewed revision was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'DRAFT_CONFLICT:%' THEN RAISE; END IF;
  END;
  SELECT is_published INTO published FROM public.memory_houses WHERE memory_id=created_memory_id;
  IF published THEN RAISE EXCEPTION 'FAIL: rejected publication changed visibility'; END IF;

  FOR invalid IN SELECT value FROM jsonb_array_elements('[null,"1",-1,1.5,9007199254740992]'::jsonb) LOOP
    BEGIN
      PERFORM public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',tag,'expected_revision',invalid),owner_id);
      RAISE EXCEPTION 'FAIL: invalid reviewed revision was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
  END LOOP;

  BEGIN
    PERFORM public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',tag,'expected_revision',reviewed_revision),gen_random_uuid());
    RAISE EXCEPTION 'FAIL: non-owner publication was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  result := public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',tag,'expected_revision',reviewed_revision),owner_id);
  IF result->'success' IS DISTINCT FROM 'true'::jsonb OR (result->>'draft_revision')::bigint IS DISTINCT FROM reviewed_revision THEN
    RAISE EXCEPTION 'FAIL: unchanged reviewed draft was not published';
  END IF;
  SELECT published_snapshot INTO frozen FROM public.memory_houses WHERE memory_id=created_memory_id;
  IF frozen->>'title' IS DISTINCT FROM 'Reviewed title' THEN RAISE EXCEPTION 'FAIL: wrong reviewed snapshot'; END IF;

  -- Simulate a save arriving after review but before the publish RPC. The stale
  -- publish must preserve the old public snapshot until the new draft is reviewed.
  result := public.rpc_event_dispatch('rpc_house_save_draft',jsonb_build_object(
    'p_tag_uid',tag,'p_title','Changed during review','expected_revision',reviewed_revision),owner_id);
  changed_revision := (result->>'draft_revision')::bigint;
  IF changed_revision <= reviewed_revision THEN RAISE EXCEPTION 'FAIL: changed draft did not advance revision'; END IF;
  BEGIN
    PERFORM public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',tag,'expected_revision',reviewed_revision),owner_id);
    RAISE EXCEPTION 'FAIL: changed unreviewed draft was published';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'DRAFT_CONFLICT:%' THEN RAISE; END IF;
  END;
  IF (SELECT published_snapshot FROM public.memory_houses WHERE memory_id=created_memory_id) IS DISTINCT FROM frozen THEN
    RAISE EXCEPTION 'FAIL: stale publish replaced the approved snapshot';
  END IF;
  PERFORM public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',tag,'expected_revision',changed_revision),owner_id);
  IF (SELECT published_snapshot->>'title' FROM public.memory_houses WHERE memory_id=created_memory_id) IS DISTINCT FROM 'Changed during review' THEN
    RAISE EXCEPTION 'FAIL: re-reviewed current draft was not published';
  END IF;
END
$$;
ROLLBACK;
SELECT 'PASS House publication: required reviewed revision, input validation, owner/ACL protection, stale snapshot preserved and current revision accepted.' AS result;
