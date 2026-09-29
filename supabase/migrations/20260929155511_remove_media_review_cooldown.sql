BEGIN;
-- Allow consecutive/batched media reviews. Keep atomic daily quota and same-file leases.
CREATE OR REPLACE FUNCTION public.reserve_video_labels(p_user uuid,p_tag text,p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE existing public.memory_video_labels; token uuid:=gen_random_uuid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.memory_spaces WHERE tag_uid=p_tag AND owner_id=p_user AND NOT admin_suspended)
 THEN RAISE EXCEPTION 'Chỉ chủ sở hữu được phân tích phương tiện.'; END IF;
 IF split_part(p_path,'/',1)<>p_tag OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-memory' AND name=p_path AND metadata->>'mimetype' IN ('video/mp4','video/webm','image/jpeg','image/png','image/webp') AND (metadata->>'size')::bigint BETWEEN 1 AND 52428800)
 THEN RAISE EXCEPTION 'Chọn video MP4/WebM hoặc ảnh JPEG/PNG/WebP đã tải vào kỷ vật, tối đa 50 MB.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT * INTO existing FROM public.memory_video_labels WHERE path=p_path FOR UPDATE;
 IF existing.status IN ('ready','rejected') AND existing.policy_version=1 THEN RETURN jsonb_build_object('cached',true,'labels',existing.labels,'violations',existing.violations,'approved',existing.status='ready','reason',existing.reason,'model',existing.model); END IF;
 IF existing.status='processing' AND existing.started_at>now()-interval '4 minutes'
 THEN RAISE EXCEPTION 'Phương tiện đang được phân tích. Vui lòng chờ rồi thử lại.'; END IF;
 IF (SELECT count(DISTINCT request_id) FROM public.video_upload_events WHERE user_id=p_user AND status='processing' AND created_at>=date_trunc('day',now()))>=20
 THEN RAISE EXCEPTION 'Giới hạn 20 lượt phân tích/ngày. Hãy thử lại sau.'; END IF;
 INSERT INTO public.memory_video_labels(path,tag,requested_by,status,request_id)
 VALUES(p_path,p_tag,p_user,'processing',token)
 ON CONFLICT(path) DO UPDATE SET status='processing',request_id=token,requested_by=p_user,started_at=now(),reason=NULL,
 attempts=CASE WHEN memory_video_labels.started_at>=date_trunc('day',now()) THEN memory_video_labels.attempts+1 ELSE 1 END;
 RETURN jsonb_build_object('cached',false,'request_id',token);
END $$;
REVOKE ALL ON FUNCTION public.reserve_video_labels(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_video_labels(uuid,text,text) TO service_role;
COMMIT;
