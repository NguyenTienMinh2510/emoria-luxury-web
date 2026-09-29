-- Event policies must not SELECT the private memory_spaces table as the caller.
-- Reuse its existing narrow ownership helper (also checks admin_suspended).
BEGIN;
ALTER POLICY "Owner read event media" ON storage.objects
  USING (bucket_id='emoria-event-media' AND public.owns_memory_path(lower(name)));
ALTER POLICY "Owner insert event media" ON storage.objects
  WITH CHECK (
    bucket_id='emoria-event-media' AND public.owns_memory_path(lower(name))
    AND name !~ '(^|/)\.\.(/|$)' AND name !~ '^/' AND name !~ '//' AND position('/' in name)>0
  );
ALTER POLICY "Owner update event media" ON storage.objects
  USING (bucket_id='emoria-event-media' AND public.owns_memory_path(lower(name)))
  WITH CHECK (
    bucket_id='emoria-event-media' AND public.owns_memory_path(lower(name))
    AND name !~ '(^|/)\.\.(/|$)' AND name !~ '^/' AND name !~ '//' AND position('/' in name)>0
  );
ALTER POLICY "Owner delete event media" ON storage.objects
  USING (bucket_id='emoria-event-media' AND public.owns_memory_path(lower(name)));
COMMIT;
