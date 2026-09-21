BEGIN;
-- Ownership stays on memory_spaces. Recipients only gain read access; NFC grants nothing.
CREATE TABLE public.memory_recipients (
 memory_id uuid NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(memory_id,user_id)
);
CREATE INDEX memory_recipients_user ON public.memory_recipients(user_id,memory_id);
CREATE TABLE public.nfc_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 100),
 memory_id uuid REFERENCES public.memory_spaces(id) ON DELETE SET NULL,
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfc_links_memory ON public.nfc_links(memory_id);
ALTER TABLE public.memory_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memory_recipients,public.nfc_links FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.memory_recipients,public.nfc_links TO service_role;

CREATE FUNCTION public.rpc_admin_accounts(p_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT u.id,u.email,coalesce(p.full_name,'') full_name
 FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
 WHERE u.deleted_at IS NULL AND (u.id::text ILIKE '%'||left(p_search,120)||'%' OR u.email ILIKE '%'||left(p_search,120)||'%' OR p.full_name ILIKE '%'||left(p_search,120)||'%')
 ORDER BY u.created_at DESC,u.id LIMIT 25) x);
END $$;

CREATE FUNCTION public.rpc_admin_memory_spaces(p_search text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_offset<0 OR p_offset>250000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT m.tag_uid,m.title,m.jewelry_name,m.owner_id,m.version,m.admin_suspended,m.order_id,
 m.owner_id IS NOT NULL claimed,coalesce(p.full_name,u.email,'') owner_name,
 (SELECT count(*) FROM public.nfc_links l WHERE l.memory_id=m.id) chip_count,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.user_id,'name',coalesce(rp.full_name,ru.email),'email',ru.email) ORDER BY r.created_at),'[]') FROM public.memory_recipients r LEFT JOIN public.profiles rp ON rp.id=r.user_id LEFT JOIN auth.users ru ON ru.id=r.user_id WHERE r.memory_id=m.id) recipients
 FROM public.memory_spaces m LEFT JOIN public.profiles p ON p.id=m.owner_id LEFT JOIN auth.users u ON u.id=m.owner_id
 WHERE m.tag_uid ILIKE '%'||left(p_search,120)||'%' OR m.title ILIKE '%'||left(p_search,120)||'%' OR p.full_name ILIKE '%'||left(p_search,120)||'%' OR m.owner_id::text ILIKE '%'||left(p_search,120)||'%'
 ORDER BY m.created_at DESC,m.id LIMIT 25 OFFSET p_offset) x);
END $$;

CREATE FUNCTION public.rpc_admin_create_memory(p_owner uuid,p_title text,p_order text DEFAULT NULL,p_item uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tag text:='mem-'||replace(gen_random_uuid()::text,'-',''); buyer uuid:=p_owner; item public.order_items; jewelry text:='Memory Space';
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid memory title'; END IF;
 IF p_order IS NOT NULL THEN
  SELECT user_id INTO buyer FROM public.orders WHERE id=p_order AND status IN ('confirmed','crafting_nfc','shipping','completed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not ready for allocation'; END IF;
  SELECT * INTO item FROM public.order_items WHERE id=p_item AND order_id=p_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found'; END IF;
  IF (SELECT count(*) FROM public.memory_spaces WHERE order_item_id=item.id)>=item.quantity THEN RAISE EXCEPTION 'All memories for this item have been allocated'; END IF;
  jewelry:=item.product_name;
 ELSIF p_item IS NOT NULL THEN RAISE EXCEPTION 'Order is required';
 END IF;
 IF buyer IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=buyer AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Account not found'; END IF;
 INSERT INTO public.memory_spaces(tag_uid,owner_id,title,jewelry_name,is_protected,order_id,order_item_id)
 VALUES(tag,buyer,trim(p_title),jewelry,true,p_order,p_item);
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),tag,'memory.allocated');
 RETURN jsonb_build_object('tag_uid',tag,'owner_id',buyer,'title',trim(p_title));
END $$;

CREATE FUNCTION public.rpc_admin_memory_account(p_tag text,p_user uuid,p_role text,p_remove boolean DEFAULT false,p_version integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mem public.memory_spaces;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=p_tag FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Memory not found'; END IF;
 IF p_role NOT IN ('owner','recipient') OR p_role IS NULL THEN RAISE EXCEPTION 'Invalid memory role'; END IF;
 IF NOT p_remove AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Account not found'; END IF;
 IF p_role='owner' THEN
  IF p_remove THEN RAISE EXCEPTION 'A memory must have an owner'; END IF;
  IF p_version IS DISTINCT FROM mem.version THEN RAISE EXCEPTION 'Memory changed; refresh and retry'; END IF;
  UPDATE public.memory_spaces SET owner_id=p_user,claim_code_hash=NULL,version=version+1,updated_at=now() WHERE id=mem.id;
  DELETE FROM public.access_grants WHERE memory_id=mem.id;
  DELETE FROM public.memory_recipients WHERE memory_id=mem.id AND user_id=p_user;
 ELSE
  IF p_remove THEN DELETE FROM public.memory_recipients WHERE memory_id=mem.id AND user_id=p_user;
  ELSE
   IF mem.owner_id=p_user THEN RAISE EXCEPTION 'This account already owns the memory'; END IF;
   INSERT INTO public.memory_recipients(memory_id,user_id,granted_by) VALUES(mem.id,p_user,auth.uid()) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),p_tag,'memory.'||p_role||CASE WHEN p_remove THEN '.revoked' ELSE '.assigned' END);
 RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_my_memories() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN '[]'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('tag_uid',m.tag_uid,'title',m.title,'jewelry_name',m.jewelry_name,'role',CASE WHEN m.owner_id=auth.uid() THEN 'owner' ELSE 'recipient' END,'admin_suspended',m.admin_suspended) ORDER BY m.created_at DESC,m.id),'[]')
 FROM public.memory_spaces m WHERE m.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.memory_recipients r WHERE r.memory_id=m.id AND r.user_id=auth.uid()));
END $$;

-- Extend the established PIN/time-lock access gate without granting editing rights.
DO $$
DECLARE definition text; needle text:='IF NOT v_mem.is_protected OR v_is_owner OR v_has_valid_grant THEN';
BEGIN
 definition:=pg_get_functiondef('public.get_memory_view_internal(text,uuid)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected memory access definition; review migration'; END IF;
 definition:=replace(definition,needle,'IF NOT v_mem.is_protected OR v_is_owner OR v_has_valid_grant OR EXISTS(SELECT 1 FROM public.memory_recipients r WHERE r.memory_id=v_mem.id AND r.user_id=auth.uid()) THEN');
 definition:=replace(definition,'''is_owner'', v_is_owner,','''is_owner'', v_is_owner, ''is_recipient'', EXISTS(SELECT 1 FROM public.memory_recipients r WHERE r.memory_id=v_mem.id AND r.user_id=auth.uid()),');
 definition:=replace(definition,'SET search_path TO ''public''','SET search_path TO ''pg_catalog'', ''public''');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION public.get_memory_view_internal(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rpc_admin_nfc_links(p_search text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_offset<0 OR p_offset>250000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT l.id,l.label,l.active,l.version,l.created_at,m.tag_uid,m.title FROM public.nfc_links l LEFT JOIN public.memory_spaces m ON m.id=l.memory_id
 WHERE l.label ILIKE '%'||left(p_search,120)||'%' OR l.id::text ILIKE '%'||left(p_search,120)||'%' OR m.tag_uid ILIKE '%'||left(p_search,120)||'%'
 ORDER BY l.created_at DESC,l.id LIMIT 25 OFFSET p_offset) x);
END $$;
CREATE FUNCTION public.rpc_admin_save_nfc_link(p_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE chip public.nfc_links; mem uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO chip FROM public.nfc_links WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chip not found'; END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM chip.version THEN RAISE EXCEPTION 'Chip changed; refresh and retry'; END IF;
 ELSE chip.id:=gen_random_uuid();chip.active:=true;chip.version:=0;
 END IF;
 IF p_payload ? 'label' THEN chip.label:=trim(p_payload->>'label'); END IF;
 IF chip.label IS NULL OR length(chip.label) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid chip label'; END IF;
 IF p_payload ? 'memoryTag' THEN
  IF nullif(p_payload->>'memoryTag','') IS NULL THEN chip.memory_id:=NULL;
  ELSE
   SELECT id INTO mem FROM public.memory_spaces WHERE tag_uid=p_payload->>'memoryTag';
   IF NOT FOUND THEN RAISE EXCEPTION 'Memory not found'; END IF;
   chip.memory_id:=mem;
  END IF;
 END IF;
 IF p_payload ? 'active' THEN
  IF jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid chip status'; END IF;
  chip.active:=(p_payload->>'active')::boolean;
 END IF;
 IF p_id IS NULL THEN INSERT INTO public.nfc_links(id,label,memory_id,active,created_by) VALUES(chip.id,chip.label,chip.memory_id,chip.active,auth.uid());
 ELSE UPDATE public.nfc_links SET label=chip.label,memory_id=chip.memory_id,active=chip.active,version=version+1,updated_at=now() WHERE id=chip.id;
 END IF;
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),chip.id::text,'nfc.saved');
 RETURN jsonb_build_object('id',chip.id,'version',chip.version+1);
END $$;
CREATE FUNCTION public.rpc_resolve_nfc_link(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('tag_uid',m.tag_uid) FROM public.nfc_links l JOIN public.memory_spaces m ON m.id=l.memory_id WHERE l.id=p_id AND l.active AND NOT m.admin_suspended
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_accounts(text),public.rpc_admin_memory_spaces(text,integer),public.rpc_admin_create_memory(uuid,text,text,uuid),public.rpc_admin_memory_account(text,uuid,text,boolean,integer),public.rpc_admin_nfc_links(text,integer),public.rpc_admin_save_nfc_link(uuid,jsonb),public.rpc_resolve_nfc_link(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_accounts(text),public.rpc_admin_memory_spaces(text,integer),public.rpc_admin_create_memory(uuid,text,text,uuid),public.rpc_admin_memory_account(text,uuid,text,boolean,integer),public.rpc_admin_nfc_links(text,integer),public.rpc_admin_save_nfc_link(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_nfc_link(uuid) TO anon,authenticated;
-- Collapse the lifecycle before filtering/pagination: a completed upload must not
-- reappear in the processing filter because of its older processing event.
CREATE FUNCTION public.rpc_admin_media_uploads(p_search text DEFAULT '',p_user uuid DEFAULT NULL,p_status text DEFAULT '',p_category text DEFAULT '',p_type text DEFAULT '',p_offset integer DEFAULT 0,p_history boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_offset<0 OR p_offset>250000 OR p_status NOT IN ('','uploaded','processing','ready','rejected','failed') OR p_category NOT IN ('','intro','gallery') OR p_type NOT IN ('','image','video') THEN RAISE EXCEPTION 'Invalid media filter'; END IF;
 RETURN (WITH ranked AS (
  SELECT e.*,row_number() OVER(PARTITION BY e.user_id,e.path ORDER BY e.created_at DESC,e.id DESC) rn,
  count(*) OVER(PARTITION BY e.user_id,e.path) event_count,
  count(*) FILTER(WHERE e.status='processing') OVER(PARTITION BY e.user_id,e.path) attempt_count,
  min(e.created_at) OVER(PARTITION BY e.user_id,e.path) first_uploaded_at,
  CASE WHEN e.path LIKE '%/intro-%' OR EXISTS(SELECT 1 FROM public.memory_spaces m WHERE m.intro_video_path=e.path) THEN 'intro' ELSE 'gallery' END category,
  CASE WHEN e.path ~* '\.(jpg|jpeg|png|webp)$' OR EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='emoria-memory' AND o.name=e.path AND o.metadata->>'mimetype' LIKE 'image/%') THEN 'image' ELSE 'video' END media_type
  FROM public.video_upload_events e
 ), filtered AS (
  SELECT * FROM ranked WHERE (p_history OR rn=1)
  AND (p_user IS NULL OR user_id=p_user)
  AND (p_search='' OR user_id::text=trim(p_search) OR author_name ILIKE '%'||left(p_search,120)||'%' OR tag ILIKE '%'||left(p_search,120)||'%')
  AND (p_status='' OR status=p_status) AND (p_category='' OR category=p_category) AND (p_type='' OR media_type=p_type)
  ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET p_offset
 ) SELECT coalesce(jsonb_agg(to_jsonb(filtered)-'rn'),'[]') FROM filtered);
END $$;
REVOKE ALL ON FUNCTION public.rpc_admin_media_uploads(text,uuid,text,text,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_media_uploads(text,uuid,text,text,text,integer,boolean) TO authenticated;
COMMIT;
