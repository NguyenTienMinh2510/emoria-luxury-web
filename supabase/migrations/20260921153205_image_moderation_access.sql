BEGIN;
-- Preserve already attached legacy photos without pretending they were AI reviewed.
INSERT INTO public.memory_video_labels(path,tag,requested_by,status,request_id,model,policy_version)
SELECT DISTINCT substring(mm.url FROM 11),m.tag_uid,m.owner_id,'ready',gen_random_uuid(),'legacy-unreviewed',0
FROM public.memory_media mm JOIN public.memory_spaces m ON m.id=mm.memory_id
JOIN storage.objects o ON o.bucket_id='emoria-memory' AND o.name=substring(mm.url FROM 11)
WHERE mm.type='image' AND mm.url LIKE 'storage://%' AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp')
ON CONFLICT(path) DO NOTHING;
CREATE OR REPLACE FUNCTION public.require_approved_video() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE media_path text; memory_tag text;
BEGIN
 IF TG_TABLE_NAME='memory_media' THEN
  -- Existing external gallery images are not Storage uploads.
  IF NEW.type NOT IN ('video','image') OR (NEW.type='image' AND NEW.url NOT LIKE 'storage://%') THEN RETURN NEW; END IF;
  media_path:=substring(NEW.url FROM 11);
  SELECT tag_uid INTO memory_tag FROM public.memory_spaces WHERE id=NEW.memory_id;
 ELSE
  media_path:=NEW.intro_video_path;memory_tag:=NEW.tag_uid;
  IF media_path IS NULL OR media_path='' THEN RETURN NEW; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.memory_video_labels WHERE path=media_path AND tag=memory_tag AND status='ready') THEN
 RAISE EXCEPTION 'Phương tiện chưa qua kiểm duyệt hoặc đã bị từ chối. Hãy tải tệp hợp lệ.';
 END IF;
 RETURN NEW;
END $$;
DROP POLICY memory_owner_read ON storage.objects;
CREATE POLICY memory_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='emoria-memory' AND public.owns_memory_path(name) AND (coalesce(metadata->>'mimetype','') NOT IN ('video/mp4','video/webm','image/jpeg','image/png','image/webp') OR public.owner_can_read_video(name)));
COMMIT;
