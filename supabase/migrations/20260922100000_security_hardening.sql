-- Proposed security hardening; audited against commit 6685aa3.
-- Apply AFTER all repository migrations, including pin_hint_support.
-- Tested on local Supabase. Production requires the documented migration sequence.
BEGIN;

-- H1: Private profile fields are only readable by their subject.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated USING(id=(SELECT auth.uid()));
REVOKE SELECT ON public.profiles FROM PUBLIC,anon;
-- Public article RPCs still project author names through their definer boundary.

-- H2: Only the sanitized wrapper is externally callable.
REVOKE ALL ON FUNCTION public.get_memory_view_internal(text,uuid),public.update_memory_internal(text,jsonb) FROM PUBLIC,anon,authenticated;
-- Disable obsolete, unused Cloud table without deleting any data.
DO $$ BEGIN IF to_regclass('public.nfc_tags') IS NOT NULL THEN
 EXECUTE 'REVOKE ALL ON public.nfc_tags FROM PUBLIC,anon,authenticated';
END IF; END $$;

-- H3: Serialize PIN verification with owner edits using the same memory row lock.
DO $$ DECLARE definition text; old text:='SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));'; BEGIN
 definition:=pg_get_functiondef('public.rpc_verify_memory_pin(text,text)'::regprocedure);
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected PIN function; review before applying'; END IF;
 definition:=replace(definition,old,'SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid)) FOR UPDATE;');
 definition:=replace(definition,'IF NOT FOUND THEN','IF NOT FOUND OR v_mem.admin_suspended THEN');
 EXECUTE definition;
END $$;
CREATE OR REPLACE FUNCTION public.revoke_changed_memory_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE hint_digits text;
BEGIN
 IF length(coalesce(NEW.pin_hint,''))>160 THEN RAISE EXCEPTION 'PIN hint is limited to 160 characters'; END IF;
 IF NEW.pin_hint IS NOT NULL AND NEW.pin_hash IS NOT NULL AND
   (TG_OP='INSERT' OR NEW.pin_hint IS DISTINCT FROM OLD.pin_hint OR NEW.pin_hash IS DISTINCT FROM OLD.pin_hash) THEN
  hint_digits:=regexp_replace(NEW.pin_hint,'[^0-9]','','g');
  IF hint_digits ~ '^[0-9]{4,6}$' AND extensions.crypt(hint_digits,NEW.pin_hash)=NEW.pin_hash THEN RAISE EXCEPTION 'Do not put the PIN in its hint'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.pin_hash IS DISTINCT FROM OLD.pin_hash OR NEW.is_protected IS DISTINCT FROM OLD.is_protected
 OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.admin_suspended IS DISTINCT FROM OLD.admin_suspended
 OR NEW.availability_status IS DISTINCT FROM OLD.availability_status OR NEW.unlock_at IS DISTINCT FROM OLD.unlock_at) THEN
  DELETE FROM public.access_grants WHERE memory_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.revoke_changed_memory_access() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS revoke_changed_memory_access ON public.memory_spaces;
CREATE TRIGGER revoke_changed_memory_access BEFORE INSERT OR UPDATE OF pin_hint,pin_hash,is_protected,owner_id,admin_suspended,availability_status,unlock_at ON public.memory_spaces FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_memory_access();
-- Remove only clearly unsafe hints; no PINs or hashes are exported.
UPDATE public.memory_spaces SET pin_hint=NULL WHERE length(pin_hint)>160 OR (
 regexp_replace(pin_hint,'[^0-9]','','g') ~ '^[0-9]{4,6}$'
 AND extensions.crypt(regexp_replace(pin_hint,'[^0-9]','','g'),pin_hash)=pin_hash);

-- H4: REST authentication is not a substitute for a direct RPC gate.
REVOKE EXECUTE ON FUNCTION public.rpc_create_order(uuid,jsonb) FROM PUBLIC,anon;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.rpc_create_order(uuid,jsonb)'::regprocedure);
 IF strpos(definition, 'IF auth.uid() IS NULL') = 0 THEN
   definition:=replace(definition,'BEGIN','BEGIN
   IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Sign in to place an order'' USING ERRCODE=''42501''; END IF;');
   EXECUTE definition;
 END IF;
END $$;

-- M3: Quota usage must survive file deletion/re-upload and day rollover.
-- Existing immutable event history already records every reservation; no extra table needed.
DO $$ DECLARE definition text; old text; BEGIN
 definition:=pg_get_functiondef('public.reserve_video_labels(uuid,text,text)'::regprocedure);
 old:='IF EXISTS(SELECT 1 FROM public.memory_video_labels WHERE requested_by=p_user AND attempts>0 AND started_at>now()-interval ''30 seconds'')
 OR (SELECT coalesce(sum(attempts),0) FROM public.memory_video_labels WHERE requested_by=p_user AND started_at>=date_trunc(''day'',now()))>=20';
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected media quota function'; END IF;
 definition:=replace(definition,old,'IF EXISTS(SELECT 1 FROM public.video_upload_events WHERE user_id=p_user AND status=''processing'' AND created_at>now()-interval ''30 seconds'')
 OR (SELECT count(DISTINCT request_id) FROM public.video_upload_events WHERE user_id=p_user AND status=''processing'' AND created_at>=date_trunc(''day'',now()))>=20');
 EXECUTE definition;
END $$;

-- H6: Atomic per-account Letter Muse allowance; no private prompts stored.
CREATE TABLE IF NOT EXISTS public.letter_ai_usage(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,day date NOT NULL,used integer NOT NULL CHECK(used BETWEEN 1 AND 20),last_requested timestamptz NOT NULL);
ALTER TABLE public.letter_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.letter_ai_usage FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.reserve_letter_generation() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE previous public.letter_ai_usage; today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,31));
 SELECT * INTO previous FROM public.letter_ai_usage WHERE user_id=auth.uid() FOR UPDATE;
 IF previous.last_requested>now()-interval '30 seconds' OR (previous.day=today AND previous.used>=20) THEN RETURN false; END IF;
 INSERT INTO public.letter_ai_usage VALUES(auth.uid(),today,1,now()) ON CONFLICT(user_id) DO UPDATE SET day=today,used=CASE WHEN letter_ai_usage.day=today THEN letter_ai_usage.used+1 ELSE 1 END,last_requested=now();
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_letter_generation() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_letter_generation() TO authenticated;

-- M1: Admin manual approval uses an audited transaction; it cannot restore rejected/deleted content.
CREATE OR REPLACE FUNCTION public.rpc_admin_override_media(p_path text,p_request uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE previous public.memory_video_labels;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 500 OR length(p_path)>200 THEN RAISE EXCEPTION 'Provide a review reason (10-500 characters)'; END IF;
 SELECT * INTO previous FROM public.memory_video_labels WHERE path=p_path FOR UPDATE;
 IF NOT FOUND OR previous.request_id IS DISTINCT FROM p_request OR previous.status<>'failed' OR cardinality(previous.violations)>0 THEN RAISE EXCEPTION 'Only the current technical failure may be manually reviewed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects o JOIN public.memory_spaces m ON m.tag_uid=previous.tag WHERE o.bucket_id='emoria-memory' AND o.name=p_path AND NOT m.admin_suspended AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm')) THEN RAISE EXCEPTION 'File unavailable or memory suspended'; END IF;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),p_path,'media.manual_review',jsonb_build_object('request_id',p_request,'previous_status',previous.status,'previous_reason',previous.reason,'reason',trim(p_reason)));
 UPDATE public.memory_video_labels SET status='ready',reason=trim(p_reason),model='admin-override',policy_version=1 WHERE path=p_path;
 RETURN jsonb_build_object('success',true,'path',p_path,'status','ready');
END $$;
REVOKE ALL ON FUNCTION public.rpc_admin_override_media(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_override_media(text,uuid,text) TO authenticated;

-- L1: Never resolve relations in pg_temp ahead of application schemas.
-- All application objects are schema-qualified; keep extension crypto lookup explicit/trusted.
DO $$ DECLARE fn record; BEGIN FOR fn IN
 SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prosecdef
 LOOP EXECUTE format('ALTER FUNCTION %s SET search_path=pg_catalog,public,extensions,pg_temp',fn.signature); END LOOP; END $$;

-- L2: High-use joins, FK cleanup and immutable audit lookups.
CREATE INDEX IF NOT EXISTS audit_access_grants_memory ON public.access_grants(memory_id);
CREATE INDEX IF NOT EXISTS audit_memory_media_memory ON public.memory_media(memory_id);
CREATE INDEX IF NOT EXISTS audit_guestbook_memory ON public.guestbook_entries(memory_id);
CREATE INDEX IF NOT EXISTS audit_taps_memory ON public.nfc_tap_events(memory_id);
CREATE INDEX IF NOT EXISTS audit_memories_owner ON public.memory_spaces(owner_id);
CREATE INDEX IF NOT EXISTS audit_memories_order ON public.memory_spaces(order_id);
CREATE INDEX IF NOT EXISTS audit_bank_events_order ON public.bank_payment_events(order_id);
DO $$ BEGIN IF to_regclass('public.gateway_payment_events') IS NOT NULL THEN
 EXECUTE 'CREATE INDEX IF NOT EXISTS audit_gateway_events_order ON public.gateway_payment_events(order_id)';
END IF; END $$;
CREATE INDEX IF NOT EXISTS audit_operation_resource ON public.operation_audit(resource_id,created_at);
NOTIFY pgrst,'reload schema';
COMMIT;
