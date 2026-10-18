BEGIN;
ALTER TABLE auth.users ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false;
INSERT INTO auth.users(id,email,is_anonymous) VALUES
 ('a1000000-0000-4000-8000-000000000001',NULL,true),
 ('a1000000-0000-4000-8000-000000000002',NULL,true),
 ('a1000000-0000-4000-8000-000000000003','guest-house-other@example.test',false);
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','service_role',true);

DO $$
DECLARE opened jsonb; again jsonb; tag text; registered_tag text; result jsonb; h uuid; caller uuid:=auth.uid();
BEGIN
 ASSERT public.rpc_guest_house_status()='{"enabled":false}'::jsonb,'Default closed';
 BEGIN
  PERFORM public.rpc_guest_house_open();RAISE EXCEPTION 'Expected closed open';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_EVENT_CLOSED'; END;
 PERFORM public.rpc_guest_house_set_enabled(true);
 opened:=public.rpc_guest_house_open();again:=public.rpc_guest_house_open();tag:=opened->>'tag_uid';
 ASSERT opened=again,'Open is idempotent';
 ASSERT tag ~ '^guest-[a-f0-9]{24}$';
 ASSERT (SELECT count(*)=1 FROM public.event_guest_spaces WHERE user_id=caller);
 ASSERT (SELECT owner_id=caller AND availability_status='timed_lock' AND unlock_at IS NULL FROM public.memory_spaces WHERE tag_uid=tag),'Private memory, caller is owner';
 PERFORM public.rpc_event_dispatch('rpc_house_save_draft',jsonb_build_object('p_tag_uid',tag,'p_title','Guest house','expected_revision',0),caller);
 SELECT id INTO h FROM public.memory_houses WHERE memory_id=(SELECT memory_id FROM public.event_guest_spaces WHERE user_id=caller);
 ASSERT h IS NOT NULL,'Existing house RPC accepts the guest space';
 BEGIN
  PERFORM public.rpc_event_dispatch('rpc_house_save_draft',jsonb_build_object('p_tag_uid',tag,'expected_revision',1),'a1000000-0000-4000-8000-000000000003');
  RAISE EXCEPTION 'Expected other owner denied';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',caller::text,true);
 BEGIN
  PERFORM public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',tag),caller);RAISE EXCEPTION 'Expected anonymous publish denied';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_LOGIN_REQUIRED'; END;
 BEGIN
  PERFORM public.rpc_event_dispatch('rpc_house_unpublish',jsonb_build_object('p_tag_uid',tag),caller);RAISE EXCEPTION 'Expected anonymous unpublish denied';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_LOGIN_REQUIRED'; END;
 BEGIN
  PERFORM public.rpc_event_dispatch('rpc_house_revoke_share',jsonb_build_object('p_tag_uid',tag),caller);RAISE EXCEPTION 'Expected anonymous revoke denied';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_LOGIN_REQUIRED'; END;
 BEGIN
  PERFORM public.rpc_enqueue_house_publish(tag,caller);RAISE EXCEPTION 'Expected anonymous queue denied';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_LOGIN_REQUIRED'; END;

 -- A registered owner keeps the same UID, marker, tag and house.
 PERFORM set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
 registered_tag:=public.rpc_guest_house_open()->>'tag_uid';
 PERFORM public.rpc_event_dispatch('rpc_house_save_draft',jsonb_build_object('p_tag_uid',registered_tag,'expected_revision',0),auth.uid());
 UPDATE auth.users SET is_anonymous=false,email='guest-house-converted@example.test' WHERE id=auth.uid();
 ASSERT public.rpc_guest_house_open()->>'tag_uid'=registered_tag,'Conversion keeps guest house';
 PERFORM private.guard_guest_house_write(registered_tag,auth.uid(),true);

 PERFORM set_config('request.jwt.claim.sub',caller::text,true);
 PERFORM public.rpc_reserve_storage_upload('emoria-event-media',tag||'/nested/photo.png',10,'image/png',caller);
 INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-event-media',tag||'/nested/photo.png','test-version','{"size":10,"mimetype":"image/png"}');
 -- A similar prefix must never be included in guest cleanup.
 PERFORM public.rpc_reserve_storage_upload('emoria-event-media',registered_tag||'/retained.png',10,'image/png','a1000000-0000-4000-8000-000000000002');
 INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-event-media',registered_tag||'/retained.png','test-version','{"size":10,"mimetype":"image/png"}');
 result:=public.rpc_guest_house_set_enabled(false);
 ASSERT result->'enabled'='false'::jsonb;
 ASSERT jsonb_array_length(result->'cleanup')=1;
 ASSERT result->'cleanup'->0->'paths'=jsonb_build_array(tag||'/nested/photo.png');
 ASSERT NOT EXISTS(SELECT 1 FROM public.memory_spaces WHERE tag_uid=tag),'Anonymous space deleted';
 ASSERT NOT EXISTS(SELECT 1 FROM public.memory_houses WHERE id=h),'House cascaded';
 ASSERT EXISTS(SELECT 1 FROM public.memory_spaces WHERE tag_uid=registered_tag),'Registered space retained';
 ASSERT EXISTS(SELECT 1 FROM public.memory_houses WHERE memory_id=(SELECT memory_id FROM public.event_guest_spaces WHERE tag_uid=registered_tag)),'Registered house retained';
 ASSERT EXISTS(SELECT 1 FROM auth.users WHERE id='a1000000-0000-4000-8000-000000000002' AND NOT is_anonymous),'Registered identity retained';
 BEGIN
  UPDATE auth.users SET is_anonymous=false WHERE id=caller;RAISE EXCEPTION 'Expected conversion of doomed identity denied';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_EVENT_CLOSED'; END;
 BEGIN
  PERFORM public.rpc_guest_house_set_enabled(true);RAISE EXCEPTION 'Expected pending cleanup to block reopen';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Finish guest cleanup before reopening the event'; END;
 BEGIN
  PERFORM public.rpc_guest_house_finish_cleanup(caller);RAISE EXCEPTION 'Expected storage cleanup required';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Guest storage cleanup incomplete'; END;
 ASSERT public.rpc_guest_house_set_enabled(false)->'cleanup'=result->'cleanup','Failed storage deletion can be retried';
 BEGIN
  PERFORM public.rpc_event_dispatch('rpc_house_save_draft',jsonb_build_object('p_tag_uid',registered_tag),'a1000000-0000-4000-8000-000000000002');RAISE EXCEPTION 'Expected retained house read only';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_EVENT_CLOSED'; END;
 BEGIN
  PERFORM public.rpc_event_dispatch('rpc_house_restore_layout',jsonb_build_object('p_tag_uid',registered_tag),'a1000000-0000-4000-8000-000000000002');RAISE EXCEPTION 'Expected restore closed';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_EVENT_CLOSED'; END;
 BEGIN
  PERFORM public.rpc_enqueue_house_publish(registered_tag,'a1000000-0000-4000-8000-000000000002');RAISE EXCEPTION 'Expected queued publish closed';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_EVENT_CLOSED'; END;
 BEGIN
  PERFORM public.rpc_reserve_storage_upload('emoria-event-media',registered_tag||'/new.png',10,'image/png','a1000000-0000-4000-8000-000000000002');RAISE EXCEPTION 'Expected upload reservation closed';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_EVENT_CLOSED'; END;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-event-media',registered_tag||'/reserved-before-closure.png','test-version','{"size":10,"mimetype":"image/png"}');RAISE EXCEPTION 'Expected direct storage upload closed';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='GUEST_EVENT_CLOSED'; END;
 -- Simulate the successful Storage API deletion only after references were removed.
 DELETE FROM storage.objects WHERE bucket_id='emoria-event-media' AND name=tag||'/nested/photo.png';
 PERFORM public.rpc_guest_house_finish_cleanup(caller);
 PERFORM public.rpc_guest_house_finish_cleanup(caller);
 ASSERT NOT EXISTS(SELECT 1 FROM auth.users WHERE id=caller),'Anonymous auth user deleted';
 ASSERT NOT EXISTS(SELECT 1 FROM public.event_guest_spaces WHERE user_id=caller),'Cleanup marker cascaded';
 ASSERT EXISTS(SELECT 1 FROM storage.objects WHERE name=registered_tag||'/retained.png'),'Registered storage untouched';
 PERFORM set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
 ASSERT public.rpc_house_get_draft(registered_tag)->>'title' IS NOT NULL,'Retained draft readable';
 PERFORM public.rpc_guest_house_set_enabled(true);
 ASSERT public.rpc_guest_house_open()->>'tag_uid'=registered_tag;

 ASSERT NOT has_table_privilege('authenticated','public.event_guest_spaces','SELECT');
 ASSERT NOT has_function_privilege('anon','public.rpc_guest_house_open()','EXECUTE');
 ASSERT has_function_privilege('authenticated','public.rpc_guest_house_open()','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.rpc_guest_house_set_enabled(boolean)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.rpc_guest_house_finish_cleanup(uuid)','EXECUTE');
 ASSERT has_function_privilege('service_role','public.rpc_guest_house_set_enabled(boolean)','EXECUTE');
END $$;
ROLLBACK;
