BEGIN;

-- Quotas are server-owned and shared by every instance. Existing data is preserved.
CREATE TABLE public.resilience_limits (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 storage_account_bytes bigint NOT NULL DEFAULT 536870912 CHECK(storage_account_bytes>0),
 storage_account_objects integer NOT NULL DEFAULT 500 CHECK(storage_account_objects>0),
 storage_account_pending integer NOT NULL DEFAULT 8 CHECK(storage_account_pending>0),
 storage_account_daily_bytes bigint NOT NULL DEFAULT 268435456 CHECK(storage_account_daily_bytes>0),
 storage_account_daily_objects integer NOT NULL DEFAULT 200 CHECK(storage_account_daily_objects>0),
 storage_global_bytes bigint NOT NULL DEFAULT 1073741824 CHECK(storage_global_bytes>0),
 storage_global_objects integer NOT NULL DEFAULT 25000 CHECK(storage_global_objects>0),
 storage_global_pending integer NOT NULL DEFAULT 32 CHECK(storage_global_pending>0),
 storage_global_daily_bytes bigint NOT NULL DEFAULT 536870912 CHECK(storage_global_daily_bytes>0),
 storage_global_daily_objects integer NOT NULL DEFAULT 5000 CHECK(storage_global_daily_objects>0),
 storage_orphan_grace interval NOT NULL DEFAULT interval '7 days' CHECK(storage_orphan_grace>=interval '1 day')
);
INSERT INTO public.resilience_limits(id) VALUES(true);
ALTER TABLE public.resilience_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resilience_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON public.resilience_limits TO authenticated;
GRANT ALL ON public.resilience_limits TO service_role;
CREATE POLICY resilience_admin ON public.resilience_limits FOR ALL TO authenticated
 USING(public.is_admin()) WITH CHECK(public.is_admin());

CREATE TABLE private.resilience_windows (
 key text PRIMARY KEY CHECK(length(key)<=200),window_start timestamptz NOT NULL,
 used integer NOT NULL DEFAULT 0 CHECK(used>=0),expires_at timestamptz NOT NULL
);
CREATE INDEX resilience_windows_expiry ON private.resilience_windows(expires_at);
REVOKE ALL ON private.resilience_windows FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.resilience_admit(p_keys text[],p_limits integer[],p_seconds integer[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE i integer; k text; t timestamptz:=clock_timestamp(); start_at timestamptz; prior private.resilience_windows;
BEGIN
 IF cardinality(p_keys) IS DISTINCT FROM cardinality(p_limits) OR cardinality(p_keys) IS DISTINCT FROM cardinality(p_seconds)
 OR cardinality(p_keys) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid quota'; END IF;
 FOR k IN SELECT DISTINCT x FROM unnest(p_keys) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('resilience:'||k,0));
 END LOOP;
 FOR i IN 1..cardinality(p_keys) LOOP
  IF p_limits[i]<1 OR p_seconds[i] NOT BETWEEN 1 AND 86400 OR length(p_keys[i])>200 THEN RAISE EXCEPTION 'Invalid quota'; END IF;
  start_at:=to_timestamp(floor(extract(epoch FROM t)/p_seconds[i])*p_seconds[i]);
  SELECT * INTO prior FROM private.resilience_windows WHERE key=p_keys[i];
  IF FOUND AND prior.window_start=start_at AND prior.used>=p_limits[i] THEN RETURN false; END IF;
 END LOOP;
 FOR i IN 1..cardinality(p_keys) LOOP
  start_at:=to_timestamp(floor(extract(epoch FROM t)/p_seconds[i])*p_seconds[i]);
  INSERT INTO private.resilience_windows(key,window_start,used,expires_at)
  VALUES(p_keys[i],start_at,1,start_at+make_interval(secs=>p_seconds[i]))
  ON CONFLICT(key) DO UPDATE SET window_start=EXCLUDED.window_start,
    used=CASE WHEN resilience_windows.window_start=EXCLUDED.window_start THEN resilience_windows.used+1 ELSE 1 END,
    expires_at=EXCLUDED.expires_at;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.resilience_admit(text[],integer[],integer[]) FROM PUBLIC,anon,authenticated;

-- Partial money never buys an unlimited stock reservation. Payment ledgers remain intact.
CREATE OR REPLACE FUNCTION private.expire_orders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord record; item record; n integer:=0;
BEGIN
 FOR ord IN SELECT * FROM public.orders WHERE status='pending_payment'
   AND paid_amount<final_total AND expires_at<now() ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  IF NOT ord.stock_released THEN
   FOR item IN SELECT product_id,size,sum(quantity)::integer qty FROM public.order_items
    WHERE order_id=ord.id GROUP BY product_id,size ORDER BY product_id,size LOOP
    UPDATE public.checkout_variants SET stock=stock+item.qty WHERE product_id=item.product_id AND size=item.size;
   END LOOP;
  END IF;
  UPDATE public.orders SET status='cancelled',stock_released=true,updated_at=now(),
   payment_status=CASE WHEN paid_amount>0 THEN 'review' ELSE payment_status END WHERE id=ord.id;
  INSERT INTO public.operation_audit(actor_id,resource_id,action,detail)
   VALUES(NULL,ord.id,'order.expired',jsonb_build_object('paid_amount',ord.paid_amount,'payment_review',ord.paid_amount>0));
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.expire_orders() FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS orders_pending_expiry ON public.orders(expires_at,id) WHERE status='pending_payment';
CREATE INDEX IF NOT EXISTS orders_case_lookup ON public.orders(upper(id));
CREATE INDEX IF NOT EXISTS contact_phone_time ON public.contact_requests(phone,created_at DESC);

-- Only the gateway can assign the source key. Raw browser RPCs cannot bypass admission.
REVOKE ALL ON FUNCTION public.rpc_contact(text,text,text),public.rpc_verify_memory_pin(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_contact(text,text,text) TO service_role;
CREATE FUNCTION public.rpc_contact_guarded(p_name text,p_phone text,p_note text,p_source text,p_caller uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
BEGIN
 IF p_source IS NULL OR p_source !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Trusted source required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120 OR length(phone) NOT BETWEEN 9 AND 20
 OR length(trim(coalesce(p_note,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid contact'; END IF;
 IF NOT private.resilience_admit(ARRAY['contact:source:'||p_source,'contact:global'],ARRAY[5,5000],ARRAY[3600,86400])
 THEN RETURN jsonb_build_object('success',false,'code','RATE_LIMIT_EXCEEDED','retry_after',3600); END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(p_caller::text,''),true);
 RETURN public.rpc_contact(p_name,phone,p_note);
END $$;

CREATE FUNCTION public.rpc_verify_memory_pin_guarded(p_tag_uid text,p_pin text,p_source text,p_caller uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions AS $$
DECLARE mem public.memory_spaces; token uuid; valid boolean; expires timestamptz:=now()+interval '2 hours';
BEGIN
 IF p_source IS NULL OR p_source !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Trusted source required' USING ERRCODE='42501'; END IF;
 IF p_tag_uid IS NULL OR p_tag_uid !~ '^[A-Za-z0-9_-]{1,64}$' OR p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$'
 THEN RETURN jsonb_build_object('success',false,'message','Mã PIN không hợp lệ.'); END IF;
 IF NOT private.resilience_admit(ARRAY['pin:source:'||p_source,'pin:memory:'||lower(p_tag_uid),'pin:global'],
   ARRAY[5,60,300],ARRAY[900,60,60])
 THEN RETURN jsonb_build_object('success',false,'code','RATE_LIMIT_EXCEEDED','retry_after',900,
   'message','Bạn đã thử quá nhiều lần. Hãy thử lại sau.'); END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(p_caller::text,''),true);
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid)) FOR UPDATE;
 IF NOT FOUND OR mem.admin_suspended OR (mem.owner_id IS DISTINCT FROM p_caller AND (
  mem.availability_status='suspended' OR (mem.availability_status='timed_lock' AND (mem.unlock_at IS NULL OR now()<mem.unlock_at))))
 THEN RETURN jsonb_build_object('success',false,'message','Kỷ niệm hiện chưa khả dụng.'); END IF;
 IF NOT mem.is_protected THEN RETURN jsonb_build_object('success',true,'message','Kỷ niệm công khai.'); END IF;
 valid:=mem.pin_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
  AND crypt(p_pin,mem.pin_hash) IS NOT DISTINCT FROM mem.pin_hash;
 IF NOT coalesce(valid,false) THEN RETURN jsonb_build_object('success',false,'message','Mã PIN bảo mật không chính xác.'); END IF;
 INSERT INTO public.access_grants(memory_id,grant_token,grant_type,user_id,expires_at)
 VALUES(mem.id,gen_random_uuid(),'viewer',p_caller,expires) RETURNING grant_token INTO token;
 RETURN jsonb_build_object('success',true,'grant_token',token,'expires_at',expires,'expires_in_seconds',7200,'message','Mở khóa thành công.');
END $$;
REVOKE ALL ON FUNCTION public.rpc_contact_guarded(text,text,text,text,uuid),
 public.rpc_verify_memory_pin_guarded(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_contact_guarded(text,text,text,text,uuid),
 public.rpc_verify_memory_pin_guarded(text,text,text,uuid) TO service_role;

-- Read-only views retain the previous response shape and historical count.
ALTER TABLE public.memory_spaces ADD COLUMN IF NOT EXISTS tap_count_total bigint NOT NULL DEFAULT 0 CHECK(tap_count_total>=0);
UPDATE public.memory_spaces m SET tap_count_total=x.total FROM
 (SELECT memory_id,count(*) total FROM public.nfc_tap_events GROUP BY memory_id) x WHERE m.id=x.memory_id;
DO $$ DECLARE definition text; BEGIN
 definition:=replace(pg_get_functiondef('public.get_memory_view_internal(text,uuid)'::regprocedure),E'\r\n',E'\n');
 IF strpos(definition, 'v_tap_count := v_mem.tap_count_total;') > 0 THEN
   RETURN;
 END IF;
 IF definition !~ 'INSERT\s+INTO\s+public\.nfc_tap_events[\s\S]+?SELECT\s+COUNT\(\*\)\s+INTO\s+v_tap_count\s+FROM\s+public\.nfc_tap_events\s+WHERE\s+memory_id\s*=\s*v_mem\.id;' THEN
   RAISE EXCEPTION 'Unexpected memory view; review before deploying';
 END IF;
 definition:=regexp_replace(definition,
   'INSERT\s+INTO\s+public\.nfc_tap_events[\s\S]+?SELECT\s+COUNT\(\*\)\s+INTO\s+v_tap_count\s+FROM\s+public\.nfc_tap_events\s+WHERE\s+memory_id\s*=\s*v_mem\.id;',
   'v_tap_count := v_mem.tap_count_total;');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION public.get_memory_view_internal(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE TABLE private.memory_tap_dedupe (
 memory_id uuid NOT NULL REFERENCES public.memory_spaces(id) ON DELETE CASCADE,
 source text NOT NULL,window_start timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(memory_id,source,window_start)
);
CREATE INDEX memory_tap_dedupe_time ON private.memory_tap_dedupe(created_at);
REVOKE ALL ON private.memory_tap_dedupe FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.rpc_record_memory_tap(p_tag_uid text,p_source text,p_caller uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE mem public.memory_spaces; t timestamptz:=to_timestamp(floor(extract(epoch FROM now())/900)*900); inserted integer;
BEGIN
 IF p_source IS NULL OR p_source !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Trusted source required' USING ERRCODE='42501'; END IF;
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid));
 IF NOT FOUND OR mem.admin_suspended OR (mem.availability_status<>'available' AND mem.owner_id IS DISTINCT FROM p_caller)
 THEN RETURN '{"success":true,"recorded":false}'; END IF;
 IF EXISTS(SELECT 1 FROM private.memory_tap_dedupe WHERE memory_id=mem.id AND source=p_source AND window_start=t)
 THEN RETURN jsonb_build_object('success',true,'recorded',false,'tap_count',mem.tap_count_total); END IF;
 IF NOT private.resilience_admit(ARRAY['tap:source:'||p_source,'tap:memory:'||mem.id,'tap:global'],
  ARRAY[30,1000,100000],ARRAY[60,86400,86400]) THEN RETURN '{"success":true,"recorded":false}'; END IF;
 INSERT INTO private.memory_tap_dedupe(memory_id,source,window_start) VALUES(mem.id,p_source,t) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=1 THEN UPDATE public.memory_spaces SET tap_count_total=tap_count_total+1 WHERE id=mem.id RETURNING tap_count_total INTO mem.tap_count_total; END IF;
 RETURN jsonb_build_object('success',true,'recorded',inserted=1,'tap_count',mem.tap_count_total);
END $$;
REVOKE ALL ON FUNCTION public.rpc_record_memory_tap(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_memory_tap(text,text,uuid) TO service_role;

CREATE TABLE private.storage_usage (
 key text PRIMARY KEY,allocated_bytes bigint NOT NULL DEFAULT 0 CHECK(allocated_bytes>=0),
 allocated_objects integer NOT NULL DEFAULT 0 CHECK(allocated_objects>=0),pending integer NOT NULL DEFAULT 0 CHECK(pending>=0),
 day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
 daily_bytes bigint NOT NULL DEFAULT 0 CHECK(daily_bytes>=0),daily_objects integer NOT NULL DEFAULT 0 CHECK(daily_objects>=0)
);
CREATE TABLE private.storage_upload_reservations (
 bucket text NOT NULL,path text NOT NULL,actor uuid,bytes bigint NOT NULL CHECK(bytes>=0),mime text NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),state text NOT NULL CHECK(state IN ('reserved','complete','deleting','deleted','cancelled')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(bucket,path),UNIQUE(id)
);
CREATE INDEX storage_reservation_expiry ON private.storage_upload_reservations(state,expires_at);
CREATE INDEX storage_reservation_cleanup ON private.storage_upload_reservations(state,updated_at);
REVOKE ALL ON private.storage_usage,private.storage_upload_reservations FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.storage_path_actor(p_bucket text,p_path text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE namespace text:=split_part(p_path,'/',1); result uuid;
BEGIN
 IF p_bucket='emoria-event-media' AND namespace ~ '^match_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN substring(namespace FROM 7)::uuid; END IF;
 SELECT owner_id INTO result FROM public.memory_spaces WHERE tag_uid=lower(namespace) AND NOT admin_suspended;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.storage_path_actor(text,text) FROM PUBLIC,anon,authenticated;
INSERT INTO private.storage_upload_reservations(bucket,path,actor,bytes,mime,state,expires_at)
 SELECT bucket_id,name,private.storage_path_actor(bucket_id,name),
 CASE WHEN metadata->>'size' ~ '^[0-9]{1,15}$' THEN (metadata->>'size')::bigint ELSE 0 END,
 coalesce(metadata->>'mimetype','application/octet-stream'),'complete',now()
 FROM storage.objects WHERE bucket_id IN ('emoria-memory','emoria-event-media');
INSERT INTO private.storage_usage(key,allocated_bytes,allocated_objects)
 SELECT 'global',coalesce(sum(bytes),0),count(*) FROM private.storage_upload_reservations;
INSERT INTO private.storage_usage(key,allocated_bytes,allocated_objects)
 SELECT actor::text,sum(bytes),count(*) FROM private.storage_upload_reservations WHERE actor IS NOT NULL GROUP BY actor;

-- Every accounting path locks the global row first, then the account row.
CREATE FUNCTION private.storage_lock_usage(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
BEGIN
 INSERT INTO private.storage_usage(key) VALUES('global') ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.storage_usage WHERE key='global' FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  INSERT INTO private.storage_usage(key) VALUES(p_actor::text) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM private.storage_usage WHERE key=p_actor::text FOR UPDATE;
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.storage_lock_usage(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.expire_storage_reservations(p_limit integer DEFAULT 1000) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,storage AS $$
DECLARE r private.storage_upload_reservations; n integer:=0;
BEGIN
 PERFORM private.storage_lock_usage(NULL);
 FOR r IN SELECT * FROM private.storage_upload_reservations WHERE state='reserved' AND expires_at<now()
  ORDER BY bucket,path LIMIT greatest(1,least(p_limit,1000)) FOR UPDATE SKIP LOCKED LOOP
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=r.bucket AND name=r.path) THEN CONTINUE; END IF;
  PERFORM private.storage_lock_usage(r.actor);
  UPDATE private.storage_usage SET allocated_bytes=allocated_bytes-r.bytes,allocated_objects=allocated_objects-1,pending=pending-1
   WHERE key='global' OR key=r.actor::text;
  UPDATE private.storage_upload_reservations SET state='cancelled',updated_at=now() WHERE bucket=r.bucket AND path=r.path;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.expire_storage_reservations(integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rpc_reserve_storage_upload(p_bucket text,p_path text,p_bytes bigint,p_mime text,p_caller uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,storage AS $$
DECLARE cfg public.resilience_limits; r private.storage_upload_reservations; u private.storage_usage; g private.storage_usage;
 today date:=(now() AT TIME ZONE 'UTC')::date; max_file bigint;
BEGIN
 IF p_caller IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_caller) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_bucket NOT IN ('emoria-memory','emoria-event-media') OR p_path IS NULL OR length(p_path) NOT BETWEEN 3 AND 500
 OR p_path ~ '(^|/)\.\.(/|$)|^/|//' OR position('/' in p_path)=0
 OR private.storage_path_actor(p_bucket,p_path) IS DISTINCT FROM p_caller THEN RAISE EXCEPTION 'Invalid upload namespace' USING ERRCODE='42501'; END IF;
 max_file:=CASE WHEN p_bucket='emoria-memory' THEN 52428800 ELSE 8388608 END;
 IF p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND max_file OR p_mime IS NULL
 OR (p_bucket='emoria-event-media' AND p_mime NOT IN ('image/jpeg','image/png','image/webp'))
 OR (p_bucket='emoria-memory' AND p_mime NOT IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4'))
 THEN RAISE EXCEPTION 'Invalid upload type or size' USING ERRCODE='22023'; END IF;
 PERFORM private.expire_storage_reservations();
 PERFORM private.storage_lock_usage(p_caller);
 SELECT * INTO r FROM private.storage_upload_reservations WHERE bucket=p_bucket AND path=p_path FOR UPDATE;
 IF FOUND THEN
  IF r.state='reserved' AND r.actor=p_caller AND r.bytes=p_bytes AND r.mime=p_mime AND r.expires_at>now()
  THEN RETURN jsonb_build_object('success',true,'reservation_id',r.id,'expires_at',r.expires_at); END IF;
  RAISE EXCEPTION 'Upload path already used; choose a new file path' USING ERRCODE='23505';
 END IF;
 SELECT * INTO cfg FROM public.resilience_limits WHERE id=true;
 UPDATE private.storage_usage SET day=today,daily_bytes=0,daily_objects=0 WHERE key IN ('global',p_caller::text) AND day<>today;
 SELECT * INTO g FROM private.storage_usage WHERE key='global'; SELECT * INTO u FROM private.storage_usage WHERE key=p_caller::text;
 IF u.allocated_bytes+p_bytes>cfg.storage_account_bytes OR u.allocated_objects+1>cfg.storage_account_objects
 OR u.pending+1>cfg.storage_account_pending OR u.daily_bytes+max_file>cfg.storage_account_daily_bytes OR u.daily_objects+1>cfg.storage_account_daily_objects
 OR g.allocated_bytes+p_bytes>cfg.storage_global_bytes OR g.allocated_objects+1>cfg.storage_global_objects
 OR g.pending+1>cfg.storage_global_pending OR g.daily_bytes+max_file>cfg.storage_global_daily_bytes OR g.daily_objects+1>cfg.storage_global_daily_objects
 THEN RETURN jsonb_build_object('success',false,'code','STORAGE_QUOTA_EXCEEDED','retry_after',900,
 'message','Đã đạt giới hạn tải tệp. Hãy xóa tệp không dùng hoặc thử lại sau.'); END IF;
 INSERT INTO private.storage_upload_reservations(bucket,path,actor,bytes,mime,state) VALUES(p_bucket,p_path,p_caller,p_bytes,p_mime,'reserved') RETURNING * INTO r;
 UPDATE private.storage_usage SET allocated_bytes=allocated_bytes+p_bytes,allocated_objects=allocated_objects+1,pending=pending+1,
  daily_bytes=daily_bytes+max_file,daily_objects=daily_objects+1 WHERE key IN ('global',p_caller::text);
 RETURN jsonb_build_object('success',true,'reservation_id',r.id,'expires_at',r.expires_at);
END $$;

CREATE FUNCTION public.rpc_cancel_storage_upload(p_bucket text,p_path text,p_caller uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,storage AS $$
DECLARE r private.storage_upload_reservations;
BEGIN
 PERFORM private.storage_lock_usage(p_caller);
 SELECT * INTO r FROM private.storage_upload_reservations WHERE bucket=p_bucket AND path=p_path FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"success":true}'; END IF;
 IF r.actor IS DISTINCT FROM p_caller THEN RAISE EXCEPTION 'Wrong upload owner' USING ERRCODE='42501'; END IF;
 IF r.state='reserved' AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path) THEN
  UPDATE private.storage_usage SET allocated_bytes=allocated_bytes-r.bytes,allocated_objects=allocated_objects-1,pending=pending-1 WHERE key IN ('global',p_caller::text);
  UPDATE private.storage_upload_reservations SET state='cancelled',updated_at=now() WHERE bucket=p_bucket AND path=p_path;
 END IF;
 RETURN '{"success":true}';
END $$;
CREATE FUNCTION public.has_storage_upload_reservation(p_bucket text,p_path text,p_metadata jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private AS $$
 SELECT p_bucket NOT IN ('emoria-memory','emoria-event-media') OR EXISTS(
  SELECT 1 FROM private.storage_upload_reservations r WHERE r.bucket=p_bucket AND r.path=p_path AND r.actor=auth.uid()
  AND (r.state='complete' OR (r.state='reserved' AND r.expires_at>now()))
  AND p_metadata->>'mimetype'=r.mime AND (p_metadata->>'size' IS NULL OR
   CASE WHEN p_metadata->>'size' ~ '^[0-9]{1,15}$' THEN (p_metadata->>'size')::bigint BETWEEN 1 AND r.bytes ELSE false END));
$$;
REVOKE ALL ON FUNCTION public.has_storage_upload_reservation(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_storage_upload_reservation(text,text,jsonb) TO authenticated;
CREATE POLICY resilience_reserved_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.has_storage_upload_reservation(bucket_id,name,metadata));
CREATE POLICY resilience_reserved_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.has_storage_upload_reservation(bucket_id,name,metadata))
 WITH CHECK(public.has_storage_upload_reservation(bucket_id,name,metadata));
-- Legacy public-upload code is retired. Preserve reads, deny new writes even if
-- an old permissive bucket policy remains installed on a Cloud project.
CREATE POLICY resilience_legacy_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(bucket_id<>'emoria-media');
CREATE POLICY resilience_legacy_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id<>'emoria-media') WITH CHECK(bucket_id<>'emoria-media');

CREATE FUNCTION private.storage_is_referenced(p_bucket text,p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT (p_bucket='emoria-memory' AND (
  EXISTS(SELECT 1 FROM public.memory_media WHERE url IN (p_path,'storage://'||p_path))
  OR EXISTS(SELECT 1 FROM public.memory_spaces WHERE intro_video_path=p_path OR audio_url IN (p_path,'storage://'||p_path))))
 OR (p_bucket='emoria-event-media' AND (
  EXISTS(SELECT 1 FROM public.memory_matches WHERE jsonb_path_exists(questions,'$.** ? (@ == $path)',jsonb_build_object('path',p_path)))
  OR EXISTS(SELECT 1 FROM public.memory_houses WHERE jsonb_path_exists(rooms_draft,'$.** ? (@ == $path)',jsonb_build_object('path',p_path))
   OR jsonb_path_exists(coalesce(published_snapshot,'{}'),'$.** ? (@ == $path)',jsonb_build_object('path',p_path)))
  OR EXISTS(SELECT 1 FROM public.house_layout_backups WHERE jsonb_path_exists(rooms,'$.** ? (@ == $path)',jsonb_build_object('path',p_path)))));
$$;
REVOKE ALL ON FUNCTION private.storage_is_referenced(text,text) FROM PUBLIC,anon,authenticated;

-- Attachments lock the same ledger rows as cleanup, closing the list/delete race.
CREATE FUNCTION private.guard_storage_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE payload jsonb; row_data jsonb:=to_jsonb(NEW); r record;
BEGIN
 payload:=CASE TG_TABLE_NAME WHEN 'memory_media' THEN row_data->'url'
  WHEN 'memory_spaces' THEN jsonb_build_array(row_data->'audio_url',row_data->'intro_video_path')
  WHEN 'memory_matches' THEN row_data->'questions' WHEN 'memory_houses' THEN jsonb_build_array(row_data->'rooms_draft',row_data->'published_snapshot')
  WHEN 'house_layout_backups' THEN row_data->'rooms' END;
 FOR r IN SELECT bucket,path,state FROM private.storage_upload_reservations
  WHERE jsonb_path_exists(coalesce(payload,'{}'),'$.** ? (@ == $path || @ == $uri)',jsonb_build_object('path',path,'uri','storage://'||path))
  ORDER BY bucket,path FOR UPDATE LOOP
  IF r.state IN ('deleting','deleted','cancelled') THEN RAISE EXCEPTION 'Tệp đã được thu hồi. Hãy tải tệp mới.' USING ERRCODE='40001'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_storage_references() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER resilience_media_reference BEFORE INSERT OR UPDATE OF url ON public.memory_media FOR EACH ROW EXECUTE FUNCTION private.guard_storage_references();
CREATE TRIGGER resilience_memory_reference BEFORE INSERT OR UPDATE OF audio_url,intro_video_path ON public.memory_spaces FOR EACH ROW EXECUTE FUNCTION private.guard_storage_references();
CREATE TRIGGER resilience_match_reference BEFORE INSERT OR UPDATE OF questions ON public.memory_matches FOR EACH ROW EXECUTE FUNCTION private.guard_storage_references();
CREATE TRIGGER resilience_house_reference BEFORE INSERT OR UPDATE OF rooms_draft,published_snapshot ON public.memory_houses FOR EACH ROW EXECUTE FUNCTION private.guard_storage_references();
CREATE TRIGGER resilience_backup_reference BEFORE INSERT OR UPDATE OF rooms ON public.house_layout_backups FOR EACH ROW EXECUTE FUNCTION private.guard_storage_references();

CREATE FUNCTION private.account_storage_object() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,storage AS $$
DECLARE r private.storage_upload_reservations; actual bigint; actor uuid; cfg public.resilience_limits; probe boolean; max_file bigint;
BEGIN
 IF (CASE WHEN TG_OP='DELETE' THEN OLD.bucket_id ELSE NEW.bucket_id END) NOT IN ('emoria-memory','emoria-event-media')
 THEN RETURN coalesce(NEW,OLD); END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.bucket_id IS DISTINCT FROM OLD.bucket_id OR NEW.name IS DISTINCT FROM OLD.name OR NEW.version IS DISTINCT FROM OLD.version
   OR NEW.metadata->>'size' IS DISTINCT FROM OLD.metadata->>'size' OR NEW.metadata->>'mimetype' IS DISTINCT FROM OLD.metadata->>'mimetype'
  THEN RAISE EXCEPTION 'Stored media is immutable; upload a new file' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 -- Global usage precedes reservation locks for consistent lock ordering.
 PERFORM private.storage_lock_usage(NULL);
 IF TG_OP='DELETE' THEN
  SELECT * INTO r FROM private.storage_upload_reservations WHERE bucket=OLD.bucket_id AND path=OLD.name FOR UPDATE;
  IF private.storage_is_referenced(OLD.bucket_id,OLD.name) THEN RAISE EXCEPTION 'Tệp vẫn đang được dùng trong kỷ niệm hoặc bản xuất bản.' USING ERRCODE='42501'; END IF;
  IF FOUND AND r.state IN ('complete','deleting') THEN
   PERFORM private.storage_lock_usage(r.actor);
   UPDATE private.storage_usage SET allocated_bytes=allocated_bytes-r.bytes,allocated_objects=allocated_objects-1 WHERE key='global' OR key=r.actor::text;
   UPDATE private.storage_upload_reservations SET state='deleted',updated_at=now() WHERE bucket=OLD.bucket_id AND path=OLD.name;
  END IF;
  RETURN OLD;
 END IF;
 SELECT * INTO r FROM private.storage_upload_reservations WHERE bucket=NEW.bucket_id AND path=NEW.name FOR UPDATE;
 -- Storage performs an INSERT permission probe (version='1', MIME/contentLength)
 -- in a transaction it rolls back before transferring bytes. Permit that probe;
 -- the final superuser upsert must supply the backend's authoritative size.
 probe:=NEW.version='1' AND NEW.metadata->>'size' IS NULL;
 max_file:=CASE WHEN NEW.bucket_id='emoria-memory' THEN 52428800 ELSE 8388608 END;
 IF probe THEN actual:=coalesce(r.bytes,max_file);
 ELSIF NEW.metadata->>'size' ~ '^[0-9]{1,15}$' THEN actual:=(NEW.metadata->>'size')::bigint;
 ELSE RAISE EXCEPTION 'Upload metadata missing'; END IF;
 IF NOT FOUND AND auth.role()='service_role' THEN
  -- Privileged fixture/admin imports remain possible, while global accounting is enforced.
  actor:=private.storage_path_actor(NEW.bucket_id,NEW.name); PERFORM private.storage_lock_usage(actor);
  SELECT * INTO cfg FROM public.resilience_limits WHERE id=true;
  IF EXISTS(SELECT 1 FROM private.storage_usage WHERE key='global' AND (allocated_bytes+actual>cfg.storage_global_bytes OR allocated_objects+1>cfg.storage_global_objects))
  THEN RAISE EXCEPTION 'Global storage budget exhausted' USING ERRCODE='54000'; END IF;
  INSERT INTO private.storage_upload_reservations(bucket,path,actor,bytes,mime,state)
  VALUES(NEW.bucket_id,NEW.name,actor,actual,NEW.metadata->>'mimetype','complete');
  UPDATE private.storage_usage SET allocated_bytes=allocated_bytes+actual,allocated_objects=allocated_objects+1 WHERE key='global' OR key=actor::text;
  RETURN NEW;
 END IF;
 IF r.state IS DISTINCT FROM 'reserved' OR r.expires_at<=now() OR actual NOT BETWEEN 1 AND r.bytes
 OR NEW.metadata->>'mimetype' IS DISTINCT FROM r.mime
 OR (auth.role()<>'service_role' AND r.actor IS DISTINCT FROM auth.uid())
 THEN RAISE EXCEPTION 'Upload reservation missing or expired; refresh and retry' USING ERRCODE='42501'; END IF;
 PERFORM private.storage_lock_usage(r.actor);
 UPDATE private.storage_usage SET allocated_bytes=allocated_bytes-(r.bytes-actual),pending=pending-1 WHERE key='global' OR key=r.actor::text;
 UPDATE private.storage_usage SET daily_bytes=greatest(0,daily_bytes-(max_file-actual))
  WHERE (key='global' OR key=r.actor::text) AND day=(r.created_at AT TIME ZONE 'UTC')::date;
 UPDATE private.storage_upload_reservations SET state='complete',bytes=actual,updated_at=now() WHERE bucket=NEW.bucket_id AND path=NEW.name;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.account_storage_object() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER resilience_storage_account AFTER INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION private.account_storage_object();
CREATE TRIGGER resilience_storage_mutation BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION private.account_storage_object();

CREATE FUNCTION public.rpc_claim_storage_cleanup(p_limit integer DEFAULT 10) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,storage AS $$
DECLARE r private.storage_upload_reservations; result jsonb:='[]'; grace interval;
BEGIN
 PERFORM private.expire_storage_reservations();
 SELECT storage_orphan_grace INTO grace FROM public.resilience_limits WHERE id=true;
 FOR r IN SELECT * FROM private.storage_upload_reservations WHERE state='complete' AND updated_at<now()-grace
  AND NOT private.storage_is_referenced(bucket,path)
  ORDER BY updated_at,bucket,path LIMIT greatest(1,least(p_limit,100)) FOR UPDATE SKIP LOCKED LOOP
  IF private.storage_is_referenced(r.bucket,r.path) THEN CONTINUE; END IF;
  UPDATE private.storage_upload_reservations SET state='deleting',updated_at=now() WHERE bucket=r.bucket AND path=r.path;
  result:=result||jsonb_build_array(jsonb_build_object('bucket',r.bucket,'path',r.path));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.rpc_release_storage_cleanup(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
BEGIN
 UPDATE private.storage_upload_reservations SET state='complete',updated_at=now() WHERE bucket=p_bucket AND path=p_path AND state='deleting';
 RETURN '{"success":true}';
END $$;
CREATE FUNCTION public.rpc_confirm_storage_deleted(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,storage AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path) THEN RETURN '{"success":false}'; END IF;
 RETURN jsonb_build_object('success',EXISTS(SELECT 1 FROM private.storage_upload_reservations WHERE bucket=p_bucket AND path=p_path AND state IN ('deleted','cancelled')));
END $$;
REVOKE ALL ON FUNCTION public.rpc_reserve_storage_upload(text,text,bigint,text,uuid),public.rpc_cancel_storage_upload(text,text,uuid),
 public.rpc_claim_storage_cleanup(integer),public.rpc_release_storage_cleanup(text,text),public.rpc_confirm_storage_deleted(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reserve_storage_upload(text,text,bigint,text,uuid),public.rpc_cancel_storage_upload(text,text,uuid),
 public.rpc_claim_storage_cleanup(integer),public.rpc_release_storage_cleanup(text,text),public.rpc_confirm_storage_deleted(text,text) TO service_role;

CREATE FUNCTION private.resilience_maintenance() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
BEGIN
 PERFORM private.expire_storage_reservations();
 DELETE FROM private.resilience_windows WHERE expires_at<now()-interval '1 day';
 DELETE FROM private.memory_tap_dedupe WHERE created_at<now()-interval '2 days';
 DELETE FROM public.access_grants WHERE expires_at<now()-interval '1 day';
 DELETE FROM public.nfc_tap_events WHERE tapped_at<now()-interval '30 days';
 DELETE FROM private.storage_upload_reservations WHERE state IN ('deleted','cancelled') AND updated_at<now()-interval '30 days';
 -- Reclaim interrupted cleanup claims; reference guards stay active until this reset.
 UPDATE private.storage_upload_reservations SET state='complete',updated_at=now() WHERE state='deleting' AND updated_at<now()-interval '1 hour';
END $$;
REVOKE ALL ON FUNCTION private.resilience_maintenance() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
 PERFORM cron.schedule('emoria-resilience-maintenance','17 * * * *','SELECT private.resilience_maintenance()');
END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
