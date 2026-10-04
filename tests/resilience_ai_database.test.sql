BEGIN;
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000099'; mem uuid; h uuid;
 rooms jsonb:='[]'; photos jsonb; room text; i int:=0; job jsonb; task jsonb; result jsonb; first_id uuid; token uuid;
BEGIN
 INSERT INTO auth.users(id,email) VALUES(owner,'resilience-ai@test.invalid');
 INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,owner_id,availability_status) VALUES('audit-ai','Test','Test AI queue',owner,'available') RETURNING id INTO mem;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 INSERT INTO storage.objects(bucket_id,name,version,metadata)
 SELECT 'emoria-event-media','audit-ai/photo-'||n||'.png','v1-'||n,'{"mimetype":"image/png","size":1000}'::jsonb FROM generate_series(0,50)n;
 FOREACH room IN ARRAY ARRAY['beginning','first','little-things','memories','next-chapter'] LOOP
  SELECT jsonb_agg(jsonb_build_object('id','m'||n,'photo_path','audit-ai/photo-'||n||'.png','caption','Fixture')) INTO photos FROM generate_series(i*10+1,i*10+10)n;
  rooms:=rooms||jsonb_build_array(jsonb_build_object('id',room,'name','Fixture','memories',photos,'decorations','[]'::jsonb)||CASE WHEN i=0 THEN '{"share_preview_path":"audit-ai/photo-0.png"}'::jsonb ELSE '{}'::jsonb END);i:=i+1;
 END LOOP;
 INSERT INTO public.memory_houses(memory_id,title,theme,rooms_draft) VALUES(mem,'Fixture','warm_gold',rooms) RETURNING id INTO h;
 job:=public.rpc_enqueue_house_publish('audit-ai',owner);first_id:=(job->>'job_id')::uuid;
 IF (job->>'total')::int<>51 THEN RAISE EXCEPTION 'All 51 photos must be queued';END IF;
 IF public.rpc_enqueue_house_publish('audit-ai',owner)->>'job_id'<>first_id::text THEN RAISE EXCEPTION 'Enqueue duplicated revision';END IF;
 task:=public.rpc_claim_house_publish_task(first_id);
 BEGIN
  PERFORM public.rpc_finish_house_publish_task(first_id,task->>'path',gen_random_uuid(),'{"approved":true,"labels":[],"violations":[]}');
  RAISE EXCEPTION 'Wrong lease accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;END;
 -- One interrupted inference persists its retry, without restarting 50 others.
 PERFORM public.rpc_finish_house_publish_task(first_id,task->>'path',(task->>'request_id')::uuid,'{"technical_error":true}');
 UPDATE public.house_publish_tasks SET retry_at=now() WHERE job_id=first_id;
 FOR i IN 1..51 LOOP
  task:=public.rpc_claim_house_publish_task(first_id);
  IF task->>'kind'<>'photo' THEN RAISE EXCEPTION '51-photo job stopped at %: %',i,task;END IF;
  PERFORM public.rpc_finish_house_publish_task(first_id,task->>'path',(task->>'request_id')::uuid,'{"approved":true,"labels":["Fixture"],"violations":[]}');
 END LOOP;
 result:=public.rpc_complete_house_publish_job(first_id);
 IF result->>'share_id' IS NULL OR (SELECT status FROM public.house_publish_jobs WHERE id=first_id)<>'published' THEN RAISE EXCEPTION 'Complete job did not publish';END IF;
 IF (SELECT count(*) FROM public.ai_usage_events WHERE user_id=owner AND category='house')<>52 THEN RAISE EXCEPTION 'Unexpected retry/usage count';END IF;
 IF public.rpc_complete_house_publish_job(first_id) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Completion is not idempotent';END IF;
 UPDATE public.memory_houses SET is_published=false WHERE id=h;
 IF public.rpc_enqueue_house_publish('audit-ai',owner)->>'status'='published' THEN RAISE EXCEPTION 'Unpublished revision must be publishable again';END IF;
 PERFORM public.rpc_complete_house_publish_job(first_id);
 IF NOT(SELECT is_published FROM public.memory_houses WHERE id=h) THEN RAISE EXCEPTION 'Republish did not restore visibility';END IF;
 -- Admission happens before network/AI, and a lease cannot be duplicated.
 DELETE FROM public.ai_work_leases;
 result:=public.rpc_reserve_ai_work(owner,'media','resource-a');token:=(result->>'lease_id')::uuid;
 IF public.rpc_reserve_ai_work(owner,'media','resource-a')->>'allowed'<>'false' THEN RAISE EXCEPTION 'Duplicate resource admitted';END IF;
 PERFORM public.rpc_reserve_ai_work(owner,'media','resource-b');
 IF public.rpc_reserve_ai_work(owner,'media','resource-c')->>'allowed'<>'false' THEN RAISE EXCEPTION 'Global concurrency exceeded';END IF;
 PERFORM public.rpc_release_ai_work(token);
 IF public.rpc_reserve_ai_work(owner,'media','resource-c')->>'allowed'<>'true' THEN RAISE EXCEPTION 'Released slot not reusable';END IF;
 DELETE FROM public.ai_work_leases;
 UPDATE public.ai_runtime_limits SET daily_requests=51;
 IF public.rpc_reserve_ai_work(owner,'media','daily-budget')->>'reason'<>'daily_budget' THEN RAISE EXCEPTION 'Daily spending ceiling bypassed';END IF;
 FOR i IN 1..3 LOOP
  IF public.rpc_reserve_event_stream(repeat('a',64),'invite') IS NULL THEN RAISE EXCEPTION 'Expected stream slot';END IF;
 END LOOP;
 IF public.rpc_reserve_event_stream(repeat('a',64),'invite') IS NOT NULL THEN RAISE EXCEPTION 'Identity SSE cap bypassed';END IF;
 FOR i IN 1..3 LOOP PERFORM public.rpc_reserve_event_stream(repeat('b',64),'invite');END LOOP;
 IF public.rpc_reserve_event_stream(repeat('c',64),'invite') IS NOT NULL THEN RAISE EXCEPTION 'Invite SSE cap bypassed';END IF;
 IF has_function_privilege('authenticated','public.rpc_claim_house_publish_task(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Queue claim exposed';END IF;
END $$;
ROLLBACK;
