BEGIN;

-- All House image approvals bind to reviewed event-media bytes; unrelated
-- video/Match reviews keep their behavior. Old path-only approvals need review.
ALTER TABLE public.memory_video_labels
  ADD COLUMN content_version text CHECK (char_length(content_version) BETWEEN 1 AND 180);

CREATE FUNCTION public.bind_house_preview_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_version text;
BEGIN
  IF NEW.content_version IS NOT NULL THEN
    -- Lock the object while committing the approval, so an upload cannot replace
    -- the reviewed version between the server's final check and this write.
    SELECT version INTO current_version FROM storage.objects
      WHERE bucket_id='emoria-event-media' AND name=NEW.path FOR UPDATE;
    IF NOT FOUND OR current_version IS DISTINCT FROM NEW.content_version THEN
      RAISE EXCEPTION 'Ảnh toàn cảnh đã thay đổi. Hãy tạo ảnh mới và xuất bản lại.' USING ERRCODE='40001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_house_preview_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER house_preview_approval_version BEFORE INSERT OR UPDATE
  ON public.memory_video_labels FOR EACH ROW EXECUTE FUNCTION public.bind_house_preview_version();

CREATE FUNCTION public.protect_approved_house_preview() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- Signed URLs address paths rather than immutable versions. Preserve bytes of
  -- approved House photos for owner uploads, including deletion followed by reupload.
  -- Service-role cleanup/admin work remains available; public readers still reject
  -- any replacement whose version or timestamp differs from the publication.
  IF OLD.bucket_id='emoria-event-media'
    AND (TG_OP='DELETE' OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.name IS DISTINCT FROM OLD.name OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id)
    AND auth.role() IS DISTINCT FROM 'service_role'
    AND session_user NOT IN ('postgres','supabase_admin')
    AND EXISTS (SELECT 1 FROM public.memory_video_labels
      WHERE path=OLD.name AND content_version IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Ảnh toàn cảnh đã được duyệt. Hãy tải ảnh mới để xuất bản.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_approved_house_preview() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_approved_house_preview BEFORE UPDATE OR DELETE
  ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.protect_approved_house_preview();

COMMIT;
