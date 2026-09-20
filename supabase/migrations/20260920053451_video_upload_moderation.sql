BEGIN;
ALTER TABLE public.memory_video_labels DROP CONSTRAINT memory_video_labels_status_check;
ALTER TABLE public.memory_video_labels ADD CONSTRAINT memory_video_labels_status_check CHECK(status IN ('uploaded','processing','ready','failed','rejected'));
ALTER TABLE public.memory_video_labels ADD COLUMN violations text[] NOT NULL DEFAULT '{}', ADD COLUMN reason text, ADD COLUMN policy_version integer NOT NULL DEFAULT 0;

-- Preserve files already attached before enforcement, without claiming AI reviewed them.
INSERT INTO public.memory_video_labels(path,tag,requested_by,status,request_id,model,attempts)
SELECT DISTINCT videos.path,m.tag_uid,m.owner_id,'ready',gen_random_uuid(),'legacy-unreviewed',0
FROM public.memory_spaces m CROSS JOIN LATERAL (
 SELECT substring(url FROM 11) path FROM public.memory_media WHERE memory_id=m.id AND type='video' AND url LIKE 'storage://%'
 UNION SELECT m.intro_video_path WHERE m.intro_video_path IS NOT NULL
) videos WHERE m.owner_id IS NOT NULL ON CONFLICT(path) DO NOTHING;

CREATE TABLE public.video_upload_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 author_name text NOT NULL,
 tag text NOT NULL,
 path text NOT NULL,
 status text NOT NULL,
 labels text[] NOT NULL DEFAULT '{}',
 violations text[] NOT NULL DEFAULT '{}',
 reason text,
 model text NOT NULL,
 policy_version integer NOT NULL,
 request_id uuid NOT NULL
);
CREATE INDEX video_upload_events_created ON public.video_upload_events(created_at DESC,id DESC);
CREATE INDEX video_upload_events_user ON public.video_upload_events(user_id,created_at DESC);
ALTER TABLE public.video_upload_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_upload_events FROM anon,authenticated;
GRANT SELECT ON public.video_upload_events TO authenticated;
GRANT ALL ON public.video_upload_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.video_upload_events_id_seq TO service_role;
CREATE POLICY video_events_admin_read ON public.video_upload_events FOR SELECT TO authenticated USING((SELECT public.is_admin()));

CREATE FUNCTION public.log_video_upload() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.request_id IS DISTINCT FROM OLD.request_id THEN
 INSERT INTO public.video_upload_events(user_id,author_name,tag,path,status,labels,violations,reason,model,policy_version,request_id)
 VALUES(NEW.requested_by,coalesce((SELECT full_name FROM public.profiles WHERE id=NEW.requested_by),'Thành viên'),NEW.tag,NEW.path,NEW.status,NEW.labels,NEW.violations,NEW.reason,NEW.model,NEW.policy_version,NEW.request_id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.log_video_upload() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER video_upload_audit AFTER INSERT OR UPDATE ON public.memory_video_labels FOR EACH ROW EXECUTE FUNCTION public.log_video_upload();

-- Record every completed storage upload, including callers bypassing the web UI.
CREATE FUNCTION public.register_uploaded_video() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uploader uuid;
BEGIN
 IF NEW.bucket_id='emoria-memory' AND NEW.metadata->>'mimetype' IN ('video/mp4','video/webm') THEN
 SELECT owner_id INTO uploader FROM public.memory_spaces WHERE tag_uid=split_part(NEW.name,'/',1);
 IF uploader IS NOT NULL THEN
 INSERT INTO public.memory_video_labels(path,tag,requested_by,status,request_id,attempts,model)
 VALUES(NEW.name,split_part(NEW.name,'/',1),uploader,'uploaded',gen_random_uuid(),0,'pending')
 ON CONFLICT(path) DO UPDATE SET status='uploaded',policy_version=0,labels='{}',violations='{}',reason=NULL,request_id=gen_random_uuid(),started_at=now();
 END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.register_uploaded_video() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER register_memory_video AFTER INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.register_uploaded_video();

-- A new video cannot be attached, even via a direct RPC call, until the server accepts it.
CREATE FUNCTION public.require_approved_video() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE video_path text; memory_tag text;
BEGIN
 IF TG_TABLE_NAME='memory_media' THEN
  IF NEW.type<>'video' THEN RETURN NEW; END IF;
  video_path:=substring(NEW.url FROM 11);
  SELECT tag_uid INTO memory_tag FROM public.memory_spaces WHERE id=NEW.memory_id;
 ELSE
  video_path:=NEW.intro_video_path;memory_tag:=NEW.tag_uid;
  IF video_path IS NULL OR video_path='' THEN RETURN NEW; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.memory_video_labels WHERE path=video_path AND tag=memory_tag AND status='ready') THEN
 RAISE EXCEPTION 'Video chưa qua kiểm duyệt hoặc đã bị từ chối. Hãy tải video hợp lệ.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.require_approved_video() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER approved_gallery_video BEFORE INSERT OR UPDATE OF url,type ON public.memory_media FOR EACH ROW EXECUTE FUNCTION public.require_approved_video();
CREATE TRIGGER approved_intro_video BEFORE INSERT OR UPDATE OF intro_video_path ON public.memory_spaces FOR EACH ROW EXECUTE FUNCTION public.require_approved_video();

CREATE OR REPLACE FUNCTION public.reserve_video_labels(p_user uuid,p_tag text,p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE existing public.memory_video_labels; token uuid:=gen_random_uuid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.memory_spaces WHERE tag_uid=p_tag AND owner_id=p_user AND NOT admin_suspended)
 THEN RAISE EXCEPTION 'Chỉ chủ sở hữu được phân tích video.'; END IF;
 IF split_part(p_path,'/',1)<>p_tag OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-memory' AND name=p_path AND metadata->>'mimetype' IN ('video/mp4','video/webm') AND (metadata->>'size')::bigint BETWEEN 1 AND 52428800)
 THEN RAISE EXCEPTION 'Chọn video MP4/WebM đã tải vào kỷ vật, tối đa 50 MB.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT * INTO existing FROM public.memory_video_labels WHERE path=p_path FOR UPDATE;
 IF existing.status IN ('ready','rejected') AND existing.policy_version=1 THEN RETURN jsonb_build_object('cached',true,'labels',existing.labels,'violations',existing.violations,'approved',existing.status='ready','reason',existing.reason,'model',existing.model); END IF;
 IF existing.status='processing' AND existing.started_at>now()-interval '4 minutes'
 THEN RAISE EXCEPTION 'Video đang được phân tích. Vui lòng chờ rồi thử lại.'; END IF;
 IF EXISTS(SELECT 1 FROM public.memory_video_labels WHERE requested_by=p_user AND attempts>0 AND started_at>now()-interval '30 seconds')
 OR (SELECT coalesce(sum(attempts),0) FROM public.memory_video_labels WHERE requested_by=p_user AND started_at>=date_trunc('day',now()))>=20
 THEN RAISE EXCEPTION 'Giới hạn 20 lượt phân tích/ngày và 1 lượt mỗi 30 giây. Hãy thử lại sau.'; END IF;
 INSERT INTO public.memory_video_labels(path,tag,requested_by,status,request_id)
 VALUES(p_path,p_tag,p_user,'processing',token)
 ON CONFLICT(path) DO UPDATE SET status='processing',request_id=token,requested_by=p_user,started_at=now(),reason=NULL,
 attempts=CASE WHEN memory_video_labels.started_at>=date_trunc('day',now()) THEN memory_video_labels.attempts+1 ELSE 1 END;
 RETURN jsonb_build_object('cached',false,'request_id',token);
END $$;


-- Old topic labels alone must not approve a file which was never attached.
UPDATE public.memory_video_labels l SET status='uploaded' WHERE l.policy_version=0 AND l.status='ready'
AND NOT EXISTS(SELECT 1 FROM public.memory_spaces m WHERE m.tag_uid=l.tag AND (m.intro_video_path=l.path OR EXISTS(SELECT 1 FROM public.memory_media mm WHERE mm.memory_id=m.id AND mm.url='storage://'||l.path AND mm.type='video')));

CREATE FUNCTION public.owner_can_read_video(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.owns_memory_path(p_path) AND EXISTS(SELECT 1 FROM public.memory_video_labels WHERE path=p_path AND status='ready')
$$;
REVOKE ALL ON FUNCTION public.owner_can_read_video(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_can_read_video(text) TO authenticated;
DROP POLICY memory_owner_read ON storage.objects;
CREATE POLICY memory_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='emoria-memory' AND public.owns_memory_path(name) AND (coalesce(metadata->>'mimetype','') NOT IN ('video/mp4','video/webm') OR public.owner_can_read_video(name)));

COMMIT;
