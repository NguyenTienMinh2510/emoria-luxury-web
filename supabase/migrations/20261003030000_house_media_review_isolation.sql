BEGIN;

-- Memory labels are keyed by path in emoria-memory. House reviews belong to the
-- other bucket and must never inherit, replace, or clear a Memory approval.
CREATE TABLE public.house_photo_reviews (
  path text PRIMARY KEY CHECK (char_length(path) BETWEEN 1 AND 500),
  tag text NOT NULL REFERENCES public.memory_spaces(tag_uid) ON DELETE CASCADE,
  content_version text NOT NULL CHECK (char_length(content_version) BETWEEN 1 AND 180),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('pending','ready','rejected')),
  labels text[] NOT NULL DEFAULT '{}',
  violations text[] NOT NULL DEFAULT '{}',
  reason text,
  model text NOT NULL DEFAULT 'pending',
  policy_version integer NOT NULL DEFAULT 1,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (split_part(path,'/',1)=tag),
  CHECK (cardinality(labels)<=8)
);
CREATE INDEX house_photo_reviews_tag ON public.house_photo_reviews(tag);
ALTER TABLE public.house_photo_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.house_photo_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.house_photo_reviews TO service_role;

-- Keep immutability of versions recorded by the initial House implementation.
-- Their approval provenance may be ambiguous; do not grandfather any as ready.
INSERT INTO public.house_photo_reviews(path,tag,content_version,requested_by,request_id,status,model,policy_version,reviewed_at)
SELECT path,tag,content_version,requested_by,request_id,'pending','requires-bucket-review',0,started_at
FROM public.memory_video_labels WHERE content_version IS NOT NULL;

-- Preserve every source object. Normal owner Memory review can restore these
-- quarantined labels; the image bytes and attached memory_media records stay.
UPDATE public.memory_video_labels l SET status='failed',policy_version=0,
  reason='Cần duyệt lại ảnh do kết quả cũ chưa phân biệt kho Memory Space và House.',
  content_version=NULL
WHERE l.content_version IS NOT NULL OR (l.status='ready' AND
  EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='emoria-memory' AND o.name=l.path) AND
  EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='emoria-event-media' AND o.name=l.path));

CREATE FUNCTION public.rpc_house_photo_review_namespace(p_tag text,p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT p_tag IS NOT NULL AND p_path IS NOT NULL AND split_part(p_path,'/',1)=p_tag
    AND EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-event-media' AND name=p_path)
    AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-memory' AND name=p_path);
$$;
REVOKE ALL ON FUNCTION public.rpc_house_photo_review_namespace(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_house_photo_review_namespace(text,text) TO service_role;

CREATE FUNCTION public.bind_house_photo_review_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_version text;
BEGIN
  IF NEW.status IN ('ready','rejected') THEN
    SELECT version INTO current_version FROM storage.objects
      WHERE bucket_id='emoria-event-media' AND name=NEW.path FOR UPDATE;
    IF NOT FOUND OR current_version IS DISTINCT FROM NEW.content_version THEN
      RAISE EXCEPTION 'Ảnh ngôi nhà đã thay đổi. Hãy tải ảnh mới và xuất bản lại.' USING ERRCODE='40001';
    END IF;
    IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-memory' AND name=NEW.path) THEN
      RAISE EXCEPTION 'Ảnh dùng chung đường dẫn với Memory Space. Hãy tải ảnh mới vào ngôi nhà.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_house_photo_review_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER house_photo_approval_version BEFORE INSERT OR UPDATE ON public.house_photo_reviews
  FOR EACH ROW EXECUTE FUNCTION public.bind_house_photo_review_version();

CREATE OR REPLACE FUNCTION public.protect_approved_house_preview() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- Reviews survive Memory label resets. Issued signed URLs keep addressing the
  -- same immutable bytes, including after a house is unpublished or republished.
  IF OLD.bucket_id='emoria-event-media'
    AND (TG_OP='DELETE' OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.name IS DISTINCT FROM OLD.name OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id)
    AND auth.role() IS DISTINCT FROM 'service_role'
    AND session_user NOT IN ('postgres','supabase_admin')
    AND EXISTS(SELECT 1 FROM public.house_photo_reviews WHERE path=OLD.name)
  THEN
    RAISE EXCEPTION 'Ảnh ngôi nhà đã được duyệt. Hãy tải ảnh mới để xuất bản.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.prevent_private_media_bucket_collision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.bucket_id IN ('emoria-memory','emoria-event-media') AND
    (TG_OP='INSERT' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id
      OR NEW.version IS DISTINCT FROM OLD.version)
  THEN
    -- Serialize opposite-bucket writes to the same path before checking it.
    PERFORM pg_advisory_xact_lock(hashtextextended('private-media-bucket:'||NEW.name,0));
    IF EXISTS(SELECT 1 FROM storage.objects WHERE name=NEW.name
      AND bucket_id IN ('emoria-memory','emoria-event-media') AND bucket_id<>NEW.bucket_id)
      OR (NEW.bucket_id='emoria-memory' AND EXISTS(SELECT 1 FROM public.house_photo_reviews WHERE path=NEW.name))
    THEN
      RAISE EXCEPTION 'Tên tệp đã thuộc kho ảnh khác. Hãy tải ảnh mới với đường dẫn riêng.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_private_media_bucket_collision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER private_media_bucket_namespace BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.prevent_private_media_bucket_collision();

NOTIFY pgrst,'reload schema';
COMMIT;
