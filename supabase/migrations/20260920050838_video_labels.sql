BEGIN;
CREATE TABLE public.memory_video_labels (
 path text PRIMARY KEY,
 tag text NOT NULL REFERENCES public.memory_spaces(tag_uid) ON DELETE CASCADE,
 requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('processing','ready','failed')),
 labels text[] NOT NULL DEFAULT '{}',
 model text NOT NULL DEFAULT 'pending',
 request_id uuid NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1,
 CHECK(split_part(path,'/',1)=tag), CHECK(cardinality(labels)<=8)
);
CREATE INDEX memory_video_labels_tag ON public.memory_video_labels(tag);
CREATE INDEX memory_video_labels_requester ON public.memory_video_labels(requested_by,started_at);
ALTER TABLE public.memory_video_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memory_video_labels FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.memory_video_labels TO service_role;

-- Only the authenticated server can reserve analysis. Caller IDs never come from request bodies.
CREATE FUNCTION public.reserve_video_labels(p_user uuid,p_tag text,p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE existing public.memory_video_labels; token uuid:=gen_random_uuid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.memory_spaces WHERE tag_uid=p_tag AND owner_id=p_user AND NOT admin_suspended)
 THEN RAISE EXCEPTION 'Chỉ chủ sở hữu được phân tích video.'; END IF;
 IF split_part(p_path,'/',1)<>p_tag OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-memory' AND name=p_path AND metadata->>'mimetype' IN ('video/mp4','video/webm') AND (metadata->>'size')::bigint BETWEEN 1 AND 52428800)
 THEN RAISE EXCEPTION 'Chọn video MP4/WebM đã tải vào kỷ vật, tối đa 50 MB.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT * INTO existing FROM public.memory_video_labels WHERE path=p_path FOR UPDATE;
 IF existing.status='ready' THEN RETURN jsonb_build_object('cached',true,'labels',existing.labels); END IF;
 IF existing.status='processing' AND existing.started_at>now()-interval '4 minutes'
 THEN RAISE EXCEPTION 'Video đang được phân tích. Vui lòng chờ rồi thử lại.'; END IF;
 IF EXISTS(SELECT 1 FROM public.memory_video_labels WHERE requested_by=p_user AND started_at>now()-interval '30 seconds')
 OR (SELECT coalesce(sum(attempts),0) FROM public.memory_video_labels WHERE requested_by=p_user AND started_at>=date_trunc('day',now()))>=20
 THEN RAISE EXCEPTION 'Giới hạn 20 lượt phân tích/ngày và 1 lượt mỗi 30 giây. Hãy thử lại sau.'; END IF;
 INSERT INTO public.memory_video_labels(path,tag,requested_by,status,request_id)
 VALUES(p_path,p_tag,p_user,'processing',token)
 ON CONFLICT(path) DO UPDATE SET status='processing',request_id=token,requested_by=p_user,started_at=now(),
 attempts=CASE WHEN memory_video_labels.started_at>=date_trunc('day',now()) THEN memory_video_labels.attempts+1 ELSE 1 END;
 RETURN jsonb_build_object('cached',false,'request_id',token);
END $$;
REVOKE ALL ON FUNCTION public.reserve_video_labels(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_video_labels(uuid,text,text) TO service_role;
COMMIT;
