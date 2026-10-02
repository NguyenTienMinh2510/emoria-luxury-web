-- Disposable local sandbox only; requires the fictional owner@emoria.test.
-- No Auth session, network, AI call, actual image bytes or committed records.
BEGIN;
SET LOCAL statement_timeout='10s';
DO $$
DECLARE reviewer uuid; v_tag text:='emo-audit-isolated-review'; event_path text:=v_tag||'/house.jpg'; memory_path text:=v_tag||'/memory.jpg'; v_version text:=gen_random_uuid()::text;
BEGIN
 SELECT id INTO reviewer FROM auth.users WHERE email='owner@emoria.test';
 IF reviewer IS NULL THEN RAISE EXCEPTION 'Requires fictional local fixture owner'; END IF;
 IF has_table_privilege('anon','public.house_photo_reviews','SELECT') OR has_table_privilege('authenticated','public.house_photo_reviews','INSERT')
   OR has_function_privilege('anon','public.rpc_house_photo_review_namespace(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Review storage or helper is not private'; END IF;
 INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,owner_id) VALUES(v_tag,'offline fixture','offline fixture',reviewer);
 INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-event-media',event_path,v_version,'{"mimetype":"image/jpeg","size":16}');
 BEGIN
   INSERT INTO public.house_photo_reviews(path,tag,content_version,requested_by,status) VALUES(event_path,v_tag,'wrong-version',reviewer,'ready');
   RAISE EXCEPTION 'Wrong byte version was approved';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 INSERT INTO public.house_photo_reviews(path,tag,content_version,requested_by,status,model) VALUES(event_path,v_tag,v_version,reviewer,'ready','offline-house-fixture');
 -- A Memory review write cannot mutate the independent House approval.
 INSERT INTO public.memory_video_labels(path,tag,requested_by,status,request_id,model,policy_version) VALUES(event_path,v_tag,reviewer,'ready',gen_random_uuid(),'offline-memory-fixture',1);
 UPDATE public.memory_video_labels SET status='failed',reason='offline Memory review fixture' WHERE path=event_path;
 IF NOT EXISTS(SELECT 1 FROM public.house_photo_reviews WHERE path=event_path AND status='ready' AND content_version=v_version)
 THEN RAISE EXCEPTION 'Memory status changed the House approval'; END IF;
 IF public.rpc_house_photo_review_namespace(v_tag,event_path) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Valid House path was rejected'; END IF;
 BEGIN
   INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-memory',event_path,gen_random_uuid()::text,'{"mimetype":"image/jpeg","size":16}');
   RAISE EXCEPTION 'Opposite-bucket collision was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-memory',memory_path,gen_random_uuid()::text,'{"mimetype":"image/jpeg","size":16}');
 IF public.rpc_house_photo_review_namespace(v_tag,memory_path) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Memory object passed House namespace check'; END IF;
 BEGIN
   INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-event-media',memory_path,gen_random_uuid()::text,'{"mimetype":"image/jpeg","size":16}');
   RAISE EXCEPTION 'Reverse bucket collision was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   UPDATE storage.objects SET name=memory_path WHERE bucket_id='emoria-event-media' AND name=event_path;
   RAISE EXCEPTION 'Cross-bucket rename collision was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 UPDATE storage.objects SET last_accessed_at=now() WHERE bucket_id='emoria-event-media' AND name=event_path;
 IF NOT EXISTS(SELECT 1 FROM public.memory_video_labels WHERE path=memory_path AND status='uploaded') THEN RAISE EXCEPTION 'Unrelated Memory upload behavior changed'; END IF;
 RAISE NOTICE 'PASS private independent House reviews, byte-version binding, both bucket collision directions, rename denial, access timestamps and unaffected Memory uploads';
END $$;
ROLLBACK;
