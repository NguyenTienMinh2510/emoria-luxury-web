BEGIN;

INSERT INTO public.system_settings(key,value) VALUES('guest_house_event','{"enabled":false}')
ON CONFLICT(key) DO NOTHING;

-- Pending markers survive memory deletion so Storage API failures can be retried.
CREATE TABLE public.event_guest_spaces (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 memory_id uuid UNIQUE REFERENCES public.memory_spaces(id) ON DELETE SET NULL,
 tag_uid text NOT NULL UNIQUE CHECK(tag_uid ~ '^guest-[a-f0-9]{24}$'),
 purge_pending boolean NOT NULL DEFAULT false
);
ALTER TABLE public.event_guest_spaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_guest_spaces FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.event_guest_spaces TO service_role;

CREATE FUNCTION public.rpc_guest_house_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('enabled',COALESCE((SELECT value->'enabled'='true'::jsonb
 FROM public.system_settings WHERE key='guest_house_event'),false));
$$;
REVOKE ALL ON FUNCTION public.rpc_guest_house_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_guest_house_status() TO anon,authenticated,service_role;

CREATE FUNCTION private.guard_guest_house_write(p_tag text,p_caller uuid,p_publish boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE enabled boolean;
BEGIN
 IF lower(trim(p_tag)) LIKE 'guest-%' THEN
  SELECT value->'enabled'='true'::jsonb INTO enabled FROM public.system_settings WHERE key='guest_house_event' FOR SHARE;
  IF enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'GUEST_EVENT_CLOSED' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_publish AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_caller AND to_jsonb(u)->>'is_anonymous'='true') THEN
  RAISE EXCEPTION 'GUEST_LOGIN_REQUIRED' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.guard_guest_house_write(text,uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rpc_guest_house_open() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE caller uuid:=auth.uid(); guest public.event_guest_spaces; memory uuid; tag text;
BEGIN
 IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM private.guard_guest_house_write('guest-',caller);
 -- Serialize concurrent opens and registration/closure for the same identity.
 PERFORM 1 FROM auth.users WHERE id=caller FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO guest FROM public.event_guest_spaces WHERE user_id=caller;
 IF FOUND THEN
  IF guest.purge_pending THEN RAISE EXCEPTION 'GUEST_EVENT_CLOSED' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.memory_spaces WHERE id=guest.memory_id AND owner_id=caller) THEN
   RETURN jsonb_build_object('tag_uid',guest.tag_uid);
  END IF;
  RAISE EXCEPTION 'Guest space ownership changed' USING ERRCODE='42501';
 END IF;
 tag:='guest-'||encode(gen_random_bytes(12),'hex');
 INSERT INTO public.memory_spaces(tag_uid,owner_id,jewelry_name,title,availability_status,unlock_at)
 VALUES(tag,caller,'Guest House','Our Memory House','timed_lock',NULL) RETURNING id INTO memory;
 INSERT INTO public.event_guest_spaces(user_id,memory_id,tag_uid) VALUES(caller,memory,tag);
 RETURN jsonb_build_object('tag_uid',tag);
END $$;
REVOKE ALL ON FUNCTION public.rpc_guest_house_open() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_guest_house_open() TO authenticated;

CREATE FUNCTION public.rpc_guest_house_set_enabled(p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE guest record; cleanup jsonb;
BEGIN
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'enabled required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.system_settings WHERE key='guest_house_event' FOR UPDATE;
 IF p_enabled AND EXISTS(SELECT 1 FROM public.event_guest_spaces WHERE purge_pending) THEN
  RAISE EXCEPTION 'Finish guest cleanup before reopening the event' USING ERRCODE='P0001';
 END IF;
 UPDATE public.system_settings SET value=jsonb_build_object('enabled',p_enabled),updated_at=now() WHERE key='guest_house_event';
 IF NOT p_enabled THEN
  FOR guest IN SELECT g.user_id,g.memory_id FROM public.event_guest_spaces g
   JOIN auth.users u ON u.id=g.user_id JOIN public.memory_spaces m ON m.id=g.memory_id AND m.owner_id=g.user_id
   WHERE to_jsonb(u)->>'is_anonymous'='true' AND NOT g.purge_pending FOR UPDATE OF u,g,m LOOP
   UPDATE public.event_guest_spaces SET purge_pending=true WHERE user_id=guest.user_id;
   DELETE FROM public.memory_spaces WHERE id=guest.memory_id;
  END LOOP;
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',g.user_id,'paths',
  (SELECT COALESCE(jsonb_agg(o.name),'[]'::jsonb) FROM storage.objects o
   WHERE o.bucket_id='emoria-event-media' AND split_part(o.name,'/',1)=g.tag_uid))),'[]'::jsonb)
 INTO cleanup FROM public.event_guest_spaces g WHERE g.purge_pending;
 RETURN jsonb_build_object('enabled',p_enabled,'cleanup',cleanup);
END $$;

-- A conversion that wins the auth-row lock is retained; closure that wins cannot
-- have its doomed identity converted between deleting the house and its blobs.
CREATE FUNCTION private.guard_guest_house_conversion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF to_jsonb(OLD)->>'is_anonymous'='true' AND to_jsonb(NEW)->>'is_anonymous' IS DISTINCT FROM 'true'
 AND EXISTS(SELECT 1 FROM public.event_guest_spaces WHERE user_id=OLD.id AND purge_pending) THEN
  RAISE EXCEPTION 'GUEST_EVENT_CLOSED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guest_house_conversion BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.guard_guest_house_conversion();
REVOKE ALL ON FUNCTION private.guard_guest_house_conversion() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rpc_guest_house_finish_cleanup(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE guest public.event_guest_spaces;
BEGIN
 PERFORM 1 FROM auth.users u WHERE u.id=p_user AND to_jsonb(u)->>'is_anonymous'='true' FOR UPDATE;
 IF NOT FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) AND NOT EXISTS(SELECT 1 FROM public.event_guest_spaces WHERE user_id=p_user) THEN
   RETURN '{"success":true}'::jsonb;
  END IF;
  RAISE EXCEPTION 'Anonymous cleanup identity required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO guest FROM public.event_guest_spaces WHERE user_id=p_user AND purge_pending AND memory_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Guest cleanup marker required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-event-media' AND split_part(name,'/',1)=guest.tag_uid) THEN
  RAISE EXCEPTION 'Guest storage cleanup incomplete' USING ERRCODE='P0001';
 END IF;
 DELETE FROM auth.users WHERE id=p_user;
 RETURN '{"success":true}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.rpc_guest_house_set_enabled(boolean),public.rpc_guest_house_finish_cleanup(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_guest_house_set_enabled(boolean),public.rpc_guest_house_finish_cleanup(uuid) TO service_role;

-- Preserve the latest RPC bodies, including revision checks and quota handling.
DO $$
DECLARE definition text; signature text; guard text;
BEGIN
 FOR signature,guard IN SELECT * FROM (VALUES
  ('public.rpc_event_dispatch(text,jsonb,uuid)',
   'IF p_action IN (''rpc_house_save_draft'',''rpc_house_publish'',''rpc_house_unpublish'',''rpc_house_revoke_share'',''rpc_house_restore_layout'') THEN PERFORM private.guard_guest_house_write(p_args->>''p_tag_uid'',p_caller,p_action IN (''rpc_house_publish'',''rpc_house_unpublish'',''rpc_house_revoke_share'')); END IF;'),
  ('public.rpc_reserve_storage_upload(text,text,bigint,text,uuid)',
   'PERFORM private.guard_guest_house_write(split_part(p_path,''/'',1),p_caller);'),
  ('public.rpc_enqueue_house_publish(text,uuid)',
   'PERFORM private.guard_guest_house_write(p_tag,p_owner,true);')
 ) guards(signature,guard) LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF definition !~ '\mBEGIN\M' THEN RAISE EXCEPTION 'Unexpected RPC definition: %',signature; END IF;
  EXECUTE regexp_replace(definition,'\mBEGIN\M','BEGIN '||guard);
 END LOOP;
END $$;

-- Existing upload reservations cannot keep writing once the event has closed.
CREATE FUNCTION private.guard_guest_house_storage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.bucket_id='emoria-event-media' THEN
  PERFORM private.guard_guest_house_write(split_part(NEW.name,'/',1),auth.uid());
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guest_house_storage BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION private.guard_guest_house_storage();
REVOKE ALL ON FUNCTION private.guard_guest_house_storage() FROM PUBLIC,anon,authenticated;

COMMIT;
