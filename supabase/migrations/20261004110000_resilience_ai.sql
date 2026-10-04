BEGIN;
CREATE TABLE public.ai_runtime_limits(id boolean PRIMARY KEY DEFAULT true CHECK(id),max_concurrent int NOT NULL DEFAULT 2 CHECK(max_concurrent BETWEEN 1 AND 4),daily_requests int NOT NULL DEFAULT 1200 CHECK(daily_requests BETWEEN 51 AND 10000),house_hourly_requests int NOT NULL DEFAULT 60 CHECK(house_hourly_requests BETWEEN 51 AND 200));
INSERT INTO public.ai_runtime_limits(id) VALUES(true);
CREATE TABLE public.ai_work_leases(resource text PRIMARY KEY CHECK(length(resource)<=700),lease_id uuid NOT NULL DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,category text NOT NULL CHECK(category IN ('house','media','letter','warmup')),expires_at timestamptz NOT NULL);
CREATE INDEX ai_work_active ON public.ai_work_leases(expires_at);
CREATE TABLE public.ai_usage_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,category text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_usage_time ON public.ai_usage_events(created_at);
CREATE INDEX ai_usage_user_time ON public.ai_usage_events(user_id,category,created_at);
CREATE FUNCTION public.rpc_reserve_ai_work(p_user uuid,p_category text,p_resource text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE limits public.ai_runtime_limits; existing public.ai_work_leases; token uuid:=gen_random_uuid(); resource_key text:=p_category||':'||p_resource;
BEGIN
 IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) OR p_category NOT IN ('house','media','letter','warmup') OR length(COALESCE(p_resource,'')) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Invalid AI reservation' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ai-global-admission',0));
 SELECT * INTO limits FROM public.ai_runtime_limits WHERE id=true;
 SELECT * INTO existing FROM public.ai_work_leases WHERE resource=resource_key FOR UPDATE;
 IF existing.expires_at>clock_timestamp() THEN RETURN jsonb_build_object('allowed',false,'retry_after',5,'reason','busy'); END IF;
 IF (SELECT count(*) FROM public.ai_work_leases WHERE expires_at>clock_timestamp())>=limits.max_concurrent THEN RETURN jsonb_build_object('allowed',false,'retry_after',5,'reason','busy'); END IF;
 IF (SELECT count(*) FROM public.ai_usage_events WHERE created_at>=date_trunc('day',now()))>=limits.daily_requests THEN RETURN jsonb_build_object('allowed',false,'retry_after',GREATEST(1,CEIL(EXTRACT(EPOCH FROM date_trunc('day',now())+interval '1 day'-now())))::int,'reason','daily_budget'); END IF;
 IF p_category='house' AND (SELECT count(*) FROM public.ai_usage_events WHERE user_id=p_user AND category='house' AND created_at>now()-interval '1 hour')>=limits.house_hourly_requests THEN RETURN jsonb_build_object('allowed',false,'retry_after',60,'reason','owner_budget'); END IF;
 INSERT INTO public.ai_work_leases VALUES(resource_key,token,p_user,p_category,clock_timestamp()+interval '180 seconds') ON CONFLICT(resource) DO UPDATE SET lease_id=token,user_id=p_user,category=p_category,expires_at=excluded.expires_at;
 INSERT INTO public.ai_usage_events(user_id,category) VALUES(p_user,p_category);
 RETURN jsonb_build_object('allowed',true,'lease_id',token,'expires_in',180);
END $$;
CREATE FUNCTION public.rpc_release_ai_work(p_lease uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DELETE FROM public.ai_work_leases WHERE lease_id=p_lease; $$;

CREATE TABLE public.house_publish_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tag text NOT NULL REFERENCES public.memory_spaces(tag_uid) ON DELETE CASCADE,owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,revision bigint NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','published','failed','superseded')),reason text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tag,revision));
CREATE INDEX house_publish_pending ON public.house_publish_jobs(created_at) WHERE status IN ('queued','processing','ready');
CREATE TABLE public.house_publish_tasks(job_id uuid NOT NULL REFERENCES public.house_publish_jobs(id) ON DELETE CASCADE,path text NOT NULL,content_version text NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','rejected','failed')),attempts int NOT NULL DEFAULT 0,request_id uuid,lease_id uuid,lease_until timestamptz,retry_at timestamptz NOT NULL DEFAULT now(),reason text,PRIMARY KEY(job_id,path));
CREATE FUNCTION public.rpc_house_publish_job_status(p_job uuid,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.house_publish_jobs;
BEGIN
 SELECT * INTO job FROM public.house_publish_jobs WHERE id=p_job AND owner_id=p_owner;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.memory_spaces WHERE tag_uid=job.tag AND owner_id=p_owner AND NOT admin_suspended) THEN RAISE EXCEPTION 'Publish job unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('job_id',job.id,'status',job.status,'tag',job.tag,'revision',job.revision,'total',(SELECT count(*) FROM public.house_publish_tasks WHERE job_id=job.id),'completed',(SELECT count(*) FROM public.house_publish_tasks WHERE job_id=job.id AND status='ready'),'reason',job.reason,'result',job.result,'retry_after',CASE WHEN job.status IN ('queued','processing','ready') THEN 5 ELSE 0 END);
END $$;
CREATE FUNCTION public.rpc_enqueue_house_publish(p_tag text,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE house public.memory_houses; job public.house_publish_jobs; photo record; version text; review public.house_photo_reviews; total int:=0;
BEGIN
 PERFORM 1 FROM public.memory_spaces WHERE tag_uid=p_tag AND owner_id=p_owner AND NOT admin_suspended FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner required' USING ERRCODE='42501'; END IF;
 SELECT * INTO house FROM public.memory_houses WHERE memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=p_tag) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'House draft unavailable' USING ERRCODE='P0002'; END IF;
 SELECT * INTO job FROM public.house_publish_jobs WHERE tag=p_tag AND revision=house.draft_revision FOR UPDATE;
 IF FOUND THEN
  IF job.owner_id IS DISTINCT FROM p_owner THEN
   DELETE FROM public.ai_work_leases WHERE lease_id IN (SELECT lease_id FROM public.house_publish_tasks WHERE job_id=job.id);
   UPDATE public.house_publish_tasks SET status='queued',attempts=0,request_id=NULL,lease_id=NULL,lease_until=NULL,retry_at=now(),reason=NULL WHERE job_id=job.id AND status NOT IN ('ready','rejected');
   UPDATE public.house_publish_jobs SET owner_id=p_owner,status='queued',result=NULL,reason=NULL,updated_at=now() WHERE id=job.id;
  ELSIF job.status='published' AND (NOT house.is_published OR job.result->>'share_id' IS DISTINCT FROM house.share_id::text) THEN
   UPDATE public.house_publish_jobs SET status='queued',result=NULL,reason=NULL,updated_at=now() WHERE id=job.id;
  END IF;
  IF job.status='failed' AND job.reason='technical' THEN
   UPDATE public.house_publish_tasks SET status='queued',attempts=0,retry_at=now(),reason=NULL WHERE job_id=job.id AND status='failed';
   UPDATE public.house_publish_jobs SET status='queued',reason=NULL,updated_at=now() WHERE id=job.id;
  END IF;
  RETURN public.rpc_house_publish_job_status(job.id,p_owner);
 END IF;
 UPDATE public.house_publish_jobs SET status='superseded',reason='Draft changed',updated_at=now() WHERE tag=p_tag AND status IN ('queued','processing','ready');
 INSERT INTO public.house_publish_jobs(tag,owner_id,revision) VALUES(p_tag,p_owner,house.draft_revision) RETURNING * INTO job;
 FOR photo IN SELECT DISTINCT path,is_preview FROM (
  SELECT r->>'share_preview_path' path,true is_preview FROM jsonb_array_elements(house.rooms_draft) r WHERE r ? 'share_preview_path'
  UNION ALL SELECT m->>'photo_path',false FROM jsonb_array_elements(house.rooms_draft) r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r->'memories','[]')) m
 ) paths WHERE path IS NOT NULL LOOP
  total:=total+1; IF total>51 THEN RAISE EXCEPTION 'Too many house photos' USING ERRCODE='22023'; END IF;
  SELECT o.version INTO version FROM storage.objects o WHERE o.bucket_id='emoria-event-media' AND o.name=photo.path AND split_part(o.name,'/',1)=p_tag AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp')
   AND CASE WHEN o.metadata->>'size' ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric BETWEEN 1 AND CASE WHEN photo.is_preview THEN 2097152 ELSE 8388608 END ELSE false END
   AND NOT EXISTS(SELECT 1 FROM storage.objects other WHERE other.bucket_id='emoria-memory' AND other.name=o.name);
  IF version IS NULL THEN RAISE EXCEPTION 'House photo unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO review FROM public.house_photo_reviews WHERE path=photo.path AND content_version=version AND policy_version=1;
  INSERT INTO public.house_publish_tasks(job_id,path,content_version,status) VALUES(job.id,photo.path,version,CASE WHEN review.status='ready' AND cardinality(review.violations)=0 THEN 'ready' WHEN review.status='rejected' THEN 'rejected' ELSE 'queued' END);
  IF review.status='rejected' THEN UPDATE public.house_publish_jobs SET status='failed',reason='Ảnh chưa đạt kiểm duyệt. Hãy thay ảnh rồi xuất bản lại.' WHERE id=job.id; END IF;
 END LOOP;
 RETURN public.rpc_house_publish_job_status(job.id,p_owner);
END $$;
CREATE FUNCTION public.rpc_claim_house_publish_task(p_job uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE job public.house_publish_jobs; task public.house_publish_tasks; admission jsonb; token uuid:=gen_random_uuid();
BEGIN
 FOR job IN SELECT * FROM public.house_publish_jobs WHERE (p_job IS NULL OR id=p_job) AND status IN ('queued','processing','ready') ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
  IF NOT EXISTS(SELECT 1 FROM public.memory_spaces m JOIN public.memory_houses h ON h.memory_id=m.id WHERE m.tag_uid=job.tag AND m.owner_id=job.owner_id AND NOT m.admin_suspended AND h.draft_revision=job.revision) THEN UPDATE public.house_publish_jobs SET status='superseded',reason='Draft or owner changed',updated_at=now() WHERE id=job.id; CONTINUE; END IF;
  UPDATE public.house_publish_tasks t SET status='ready',lease_until=NULL FROM public.house_photo_reviews r WHERE t.job_id=job.id AND t.path=r.path AND t.content_version=r.content_version AND r.status='ready' AND r.policy_version=1 AND cardinality(r.violations)=0 AND t.status IN ('queued','processing');
  IF NOT EXISTS(SELECT 1 FROM public.house_publish_tasks WHERE job_id=job.id AND status<>'ready') THEN UPDATE public.house_publish_jobs SET status='ready',updated_at=now() WHERE id=job.id; RETURN jsonb_build_object('kind','publish','job_id',job.id); END IF;
  SELECT * INTO task FROM public.house_publish_tasks WHERE job_id=job.id AND (status='queued' OR status='processing' AND lease_until<clock_timestamp()) AND retry_at<=now() ORDER BY path LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF task.attempts>=3 THEN UPDATE public.house_publish_tasks SET status='failed',reason='technical' WHERE job_id=job.id AND path=task.path; UPDATE public.house_publish_jobs SET status='failed',reason='technical',updated_at=now() WHERE id=job.id; CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-event-media' AND name=task.path AND version=task.content_version) THEN UPDATE public.house_publish_jobs SET status='superseded',reason='Photo changed',updated_at=now() WHERE id=job.id; CONTINUE; END IF;
  admission:=public.rpc_reserve_ai_work(job.owner_id,'house',task.path||':'||task.content_version);
  IF admission->>'allowed'<>'true' THEN RETURN jsonb_build_object('kind','idle','retry_after',admission->'retry_after','reason',admission->'reason'); END IF;
  UPDATE public.house_publish_tasks SET status='processing',attempts=attempts+1,request_id=token,lease_id=(admission->>'lease_id')::uuid,lease_until=clock_timestamp()+interval '180 seconds' WHERE job_id=job.id AND path=task.path;
  UPDATE public.house_publish_jobs SET status='processing',updated_at=now() WHERE id=job.id;
  RETURN jsonb_build_object('kind','photo','job_id',job.id,'tag',job.tag,'owner_id',job.owner_id,'path',task.path,'version',task.content_version,'request_id',token,'lease_id',admission->>'lease_id');
 END LOOP;
 RETURN jsonb_build_object('kind','idle','retry_after',5);
END $$;
CREATE FUNCTION public.rpc_finish_house_publish_task(p_job uuid,p_path text,p_request uuid,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE job public.house_publish_jobs; task public.house_publish_tasks; outcome text;
BEGIN
 SELECT * INTO job FROM public.house_publish_jobs WHERE id=p_job FOR UPDATE;
 SELECT * INTO task FROM public.house_publish_tasks WHERE job_id=p_job AND path=p_path FOR UPDATE;
 IF task.request_id IS DISTINCT FROM p_request OR task.status<>'processing' THEN RAISE EXCEPTION 'Review lease changed' USING ERRCODE='40001'; END IF;
 PERFORM public.rpc_release_ai_work(task.lease_id);
 IF job.status='superseded' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-event-media' AND name=p_path AND version=task.content_version) THEN UPDATE public.house_publish_jobs SET status='superseded',reason='Photo or draft changed',updated_at=now() WHERE id=p_job; RETURN '{"status":"superseded"}'; END IF;
 IF p_result->>'invalid_media'='true' THEN
  UPDATE public.house_publish_tasks SET status='failed',lease_until=NULL,reason=left(p_result->>'reason',1000) WHERE job_id=p_job AND path=p_path;
  UPDATE public.house_publish_jobs SET status='failed',reason=left(p_result->>'reason',1000),updated_at=now() WHERE id=p_job;
 ELSIF p_result->>'technical_error'='true' THEN
  UPDATE public.house_publish_tasks SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,retry_at=now()+interval '30 seconds',lease_until=NULL,reason='technical' WHERE job_id=p_job AND path=p_path;
  UPDATE public.house_publish_jobs SET status=CASE WHEN task.attempts>=3 THEN 'failed' ELSE 'queued' END,reason=CASE WHEN task.attempts>=3 THEN 'technical' ELSE NULL END,updated_at=now() WHERE id=p_job;
 ELSE
  IF jsonb_typeof(p_result->'labels') IS DISTINCT FROM 'array' OR jsonb_typeof(p_result->'violations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'labels')>8 THEN RAISE EXCEPTION 'Incomplete review' USING ERRCODE='22023'; END IF;
  outcome:=CASE WHEN p_result->>'approved'='true' AND jsonb_array_length(p_result->'violations')=0 THEN 'ready' ELSE 'rejected' END;
  INSERT INTO public.house_photo_reviews(path,tag,content_version,requested_by,request_id,status,labels,violations,reason,model,policy_version,reviewed_at) VALUES(p_path,job.tag,task.content_version,job.owner_id,p_request,outcome,ARRAY(SELECT jsonb_array_elements_text(p_result->'labels')),ARRAY(SELECT jsonb_array_elements_text(p_result->'violations')),left(p_result->>'reason',1000),left(COALESCE(p_result->>'model','Qwen'),200),1,now())
   ON CONFLICT(path) DO UPDATE SET content_version=excluded.content_version,requested_by=excluded.requested_by,request_id=excluded.request_id,status=excluded.status,labels=excluded.labels,violations=excluded.violations,reason=excluded.reason,model=excluded.model,policy_version=1,reviewed_at=now();
  UPDATE public.house_publish_tasks SET status=outcome,lease_until=NULL,reason=left(p_result->>'reason',1000) WHERE job_id=p_job AND path=p_path;
  UPDATE public.house_publish_jobs SET status=CASE WHEN outcome='rejected' THEN 'failed' ELSE 'queued' END,reason=CASE WHEN outcome='rejected' THEN 'Ảnh chưa đạt kiểm duyệt. Hãy thay ảnh rồi xuất bản lại.' ELSE NULL END,updated_at=now() WHERE id=p_job;
 END IF;
 RETURN public.rpc_house_publish_job_status(p_job,job.owner_id);
END $$;
CREATE FUNCTION public.rpc_complete_house_publish_job(p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE job public.house_publish_jobs; published jsonb;
BEGIN
 SELECT * INTO job FROM public.house_publish_jobs WHERE id=p_job FOR UPDATE;
 IF job.status='published' THEN RETURN job.result; END IF;
 IF job.status NOT IN ('queued','processing','ready') OR EXISTS(SELECT 1 FROM public.house_publish_tasks WHERE job_id=p_job AND status<>'ready') THEN RAISE EXCEPTION 'Photos are not ready' USING ERRCODE='P0001'; END IF;
 IF EXISTS(SELECT 1 FROM public.house_publish_tasks t WHERE t.job_id=p_job AND NOT EXISTS(SELECT 1 FROM storage.objects o JOIN public.house_photo_reviews r ON r.path=o.name AND r.content_version=o.version WHERE o.bucket_id='emoria-event-media' AND o.name=t.path AND o.version=t.content_version AND r.status='ready' AND cardinality(r.violations)=0)) THEN RAISE EXCEPTION 'Photo changed' USING ERRCODE='40001'; END IF;
 published:=public.rpc_event_dispatch('rpc_house_publish',jsonb_build_object('p_tag_uid',job.tag,'expected_revision',job.revision),job.owner_id);
 UPDATE public.house_publish_jobs SET status='published',result=published,reason=NULL,updated_at=now() WHERE id=p_job;
 RETURN published;
END $$;
CREATE FUNCTION public.rpc_house_approved_paths(p_tag text,p_paths text[],p_published_at timestamptz) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(array_agg(o.name),'{}') FROM storage.objects o JOIN public.house_photo_reviews r ON r.path=o.name AND r.tag=p_tag AND r.content_version=o.version WHERE cardinality(p_paths)<=51 AND o.bucket_id='emoria-event-media' AND o.name=ANY(p_paths) AND split_part(o.name,'/',1)=p_tag AND r.status='ready' AND r.policy_version=1 AND cardinality(r.violations)=0 AND o.version IS NOT NULL AND o.updated_at<=p_published_at AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp') AND CASE WHEN o.metadata->>'size' ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric BETWEEN 1 AND 8388608 ELSE false END;
$$;
CREATE TABLE public.event_stream_leases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),identity text NOT NULL,resource text NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX event_stream_active ON public.event_stream_leases(expires_at);
CREATE INDEX event_stream_identity ON public.event_stream_leases(identity,expires_at);
CREATE FUNCTION public.rpc_reserve_event_stream(p_identity text,p_resource text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE token uuid:=gen_random_uuid();
BEGIN
 IF length(p_identity)<>64 OR length(p_resource)>80 THEN RAISE EXCEPTION 'Invalid stream identity' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stream-global-admission',0));
 DELETE FROM public.event_stream_leases WHERE expires_at<clock_timestamp();
 IF (SELECT count(*) FROM public.event_stream_leases)>=100 OR (SELECT count(*) FROM public.event_stream_leases WHERE identity=p_identity)>=3 OR (SELECT count(*) FROM public.event_stream_leases WHERE resource=p_resource)>=6 THEN RETURN NULL; END IF;
 INSERT INTO public.event_stream_leases VALUES(token,p_identity,p_resource,clock_timestamp()+interval '35 seconds'); RETURN token;
END $$;
CREATE FUNCTION public.rpc_release_event_stream(p_lease uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DELETE FROM public.event_stream_leases WHERE id=p_lease; $$;
CREATE FUNCTION public.rpc_cleanup_ai_state() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 DELETE FROM public.ai_work_leases WHERE expires_at<now()-interval '1 hour';
 DELETE FROM public.ai_usage_events WHERE created_at<now()-interval '30 days';
 DELETE FROM public.house_publish_jobs WHERE updated_at<now()-interval '30 days' AND status IN ('published','superseded','failed');
 DELETE FROM public.event_stream_leases WHERE expires_at<now();
END $$;
CREATE FUNCTION public.rpc_gateway_admit(p_identity text,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
BEGIN
 IF p_identity IS NULL OR p_identity !~ '^[a-f0-9]{64}$' OR p_action NOT IN ('public_read','memory_media','job_run') THEN RAISE EXCEPTION 'Trusted gateway required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('allowed',private.resilience_admit(ARRAY['gateway:global','gateway:'||p_action||':'||p_identity],ARRAY[6000,CASE WHEN p_action='job_run' THEN 30 ELSE 120 END],ARRAY[60,60]),'retry_after',60);
END $$;
DO $$ DECLARE relation text; fn record; BEGIN
 FOREACH relation IN ARRAY ARRAY['ai_runtime_limits','ai_work_leases','ai_usage_events','house_publish_jobs','house_publish_tasks','event_stream_leases'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',relation); EXECUTE format('GRANT ALL ON public.%I TO service_role',relation); END LOOP;
 FOR fn IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('rpc_reserve_ai_work','rpc_release_ai_work','rpc_enqueue_house_publish','rpc_house_publish_job_status','rpc_claim_house_publish_task','rpc_finish_house_publish_task','rpc_complete_house_publish_job','rpc_house_approved_paths','rpc_reserve_event_stream','rpc_release_event_stream','rpc_cleanup_ai_state','rpc_gateway_admit') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.signature); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.signature); END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
