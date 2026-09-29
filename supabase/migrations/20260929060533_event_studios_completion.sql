BEGIN;

-- Event RPCs are reachable only through the verified, rate-limited HTTP gateway.
-- The rest of the application continues to use its caller JWT and existing RLS.
ALTER TABLE public.memory_houses ADD COLUMN IF NOT EXISTS draft_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.memory_matches ADD COLUMN IF NOT EXISTS draft_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.memory_matches ADD COLUMN IF NOT EXISTS owner_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.memory_matches ADD COLUMN IF NOT EXISTS partner_revision bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.event_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id uuid NOT NULL REFERENCES public.memory_houses(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  message text NOT NULL CHECK(length(message)<=1000),
  kind text NOT NULL CHECK(kind IN ('heart','message')),
  is_hidden boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(house_id,request_id)
);
CREATE INDEX IF NOT EXISTS event_replies_house ON public.event_replies(house_id,created_at DESC);
ALTER TABLE public.event_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_replies FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.event_moderation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES public.event_content_reports(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_moderation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_moderation_audit FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sanitize_house_rooms(p_rooms jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
  SELECT COALESCE(jsonb_agg(CASE WHEN r->'journey_letter'->'is_shared'='true'::jsonb
    THEN r ELSE r-'journey_letter' END ORDER BY ord),'[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_rooms)='array' THEN p_rooms ELSE '[]'::jsonb END) WITH ORDINALITY x(r,ord)
$$;

CREATE OR REPLACE FUNCTION public.event_change_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE r jsonb; m jsonb; event text;
BEGIN
 IF TG_TABLE_NAME='memory_houses' THEN
   IF TG_OP='INSERT' THEN NEW.draft_revision:=1; END IF;
   IF TG_OP='UPDATE' AND (NEW.title,NEW.theme,NEW.rooms_draft) IS DISTINCT FROM (OLD.title,OLD.theme,OLD.rooms_draft) THEN
     NEW.draft_revision:=OLD.draft_revision+1;
   END IF;
   FOR r IN SELECT value FROM jsonb_array_elements(NEW.rooms_draft) LOOP
     IF r ? 'reply_policy' AND (jsonb_typeof(r->'reply_policy')<>'string' OR r->>'reply_policy' NOT IN ('off','visitors','signed_in')) THEN
       RAISE EXCEPTION 'Quyền gửi lời nhắn không hợp lệ' USING ERRCODE='22023';
     END IF;
     IF r ? 'journey_letter' AND (jsonb_typeof(r->'journey_letter'->'is_shared') IS DISTINCT FROM 'boolean'
       OR ((r->'journey_letter') - ARRAY['title','content','author','date','is_shared','audio_path'])<>'{}'::jsonb) THEN
       RAISE EXCEPTION 'Thiết lập thư không hợp lệ' USING ERRCODE='22023';
     END IF;
   END LOOP;
 ELSE
   IF TG_OP='UPDATE' THEN
     IF (NEW.title,NEW.questions,NEW.owner_name,NEW.partner_name) IS DISTINCT FROM (OLD.title,OLD.questions,OLD.owner_name,OLD.partner_name) THEN NEW.draft_revision:=OLD.draft_revision+1; END IF;
     IF NEW.owner_answers IS DISTINCT FROM OLD.owner_answers THEN NEW.owner_revision:=OLD.owner_revision+1; END IF;
     IF NEW.partner_answers IS DISTINCT FROM OLD.partner_answers THEN NEW.partner_revision:=OLD.partner_revision+1; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.event_change_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS event_house_revision ON public.memory_houses;
CREATE TRIGGER event_house_revision BEFORE INSERT OR UPDATE ON public.memory_houses FOR EACH ROW EXECUTE FUNCTION public.event_change_guard();
DROP TRIGGER IF EXISTS event_match_revision ON public.memory_matches;
CREATE TRIGGER event_match_revision BEFORE INSERT OR UPDATE ON public.memory_matches FOR EACH ROW EXECUTE FUNCTION public.event_change_guard();

CREATE OR REPLACE FUNCTION public.event_record_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE e text; events text[]:='{}'; resource text; kind text; suffix text:='';
BEGIN
 IF TG_TABLE_NAME='memory_matches' THEN
   resource:=NEW.id::text; kind:='match';
   IF (OLD.owner_answers='[]'::jsonb AND NEW.owner_answers<>'[]'::jsonb) OR (OLD.partner_answers='[]'::jsonb AND NEW.partner_answers<>'[]'::jsonb) THEN events:=array_append(events,'match_started'); END IF;
   IF OLD.owner_submitted_at IS NULL AND NEW.owner_submitted_at IS NOT NULL THEN events:=array_append(events,'match_owner_completed'); END IF;
   IF OLD.partner_submitted_at IS NULL AND NEW.partner_submitted_at IS NOT NULL THEN events:=array_append(events,'match_partner_completed'); END IF;
   IF OLD.status<>'completed' AND NEW.status='completed' THEN events:=array_append(events,'match_both_completed'); END IF;
   IF (OLD.owner_submitted_at,OLD.partner_submitted_at,OLD.is_hidden) IS DISTINCT FROM (NEW.owner_submitted_at,NEW.partner_submitted_at,NEW.is_hidden) THEN
     BEGIN
        PERFORM realtime.send('{}'::jsonb,'changed','emoria-match:'||resource,true);
      EXCEPTION WHEN undefined_function THEN
        NULL;
      END;
   END IF;
 ELSE
   resource:=NEW.id::text; kind:='house';
   IF NEW.published_at IS DISTINCT FROM OLD.published_at AND NEW.is_published THEN events:=array_append(events,'house_published'); suffix:=':'||NEW.published_at::text; END IF;
 END IF;
 FOREACH e IN ARRAY events LOOP
   INSERT INTO public.event_analytics_logs(event_name,resource_type,resource_id,dedupe_key)
   VALUES(e,kind,resource,e||':'||resource||suffix)
   ON CONFLICT(dedupe_key) DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.event_record_transition() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS event_match_transition ON public.memory_matches;
CREATE TRIGGER event_match_transition AFTER UPDATE ON public.memory_matches FOR EACH ROW EXECUTE FUNCTION public.event_record_transition();
DROP TRIGGER IF EXISTS event_house_transition ON public.memory_houses;
CREATE TRIGGER event_house_transition AFTER UPDATE ON public.memory_houses FOR EACH ROW EXECUTE FUNCTION public.event_record_transition();

-- Even if another feature adds a permissive broadcast policy, event channels
-- remain server-only. The HTTP stream authorizes the owner/invite first.
-- Supabase owns realtime.messages/send. Never replace them with a test stub.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'realtime' AND table_name = 'messages'
  ) THEN
    DROP POLICY IF EXISTS event_channels_server_only ON realtime.messages;
    CREATE POLICY event_channels_server_only ON realtime.messages AS RESTRICTIVE
    FOR SELECT TO anon,authenticated USING (topic NOT LIKE 'emoria-match:%');
    DROP POLICY IF EXISTS event_channels_server_send_only ON realtime.messages;
    CREATE POLICY event_channels_server_send_only ON realtime.messages AS RESTRICTIVE
    FOR INSERT TO anon,authenticated WITH CHECK (topic NOT LIKE 'emoria-match:%');
  END IF;
END $$;

-- Static allowlist below; no SQL or function name from the browser is executed.
CREATE OR REPLACE FUNCTION public.rpc_event_dispatch(p_action text,p_args jsonb,p_caller uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE a jsonb:=COALESCE(p_args,'{}'); result jsonb; view jsonb; h public.memory_houses; mm public.memory_matches;
  rev bigint; role_name text; resource text; resource_type text; report public.event_content_reports; report_id uuid;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',COALESCE(p_caller::text,''),true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_caller,'role',CASE WHEN p_caller IS NULL THEN 'anon' ELSE 'authenticated' END)::text,true);
 IF octet_length(a::text)>524288 THEN RAISE EXCEPTION 'Dữ liệu quá lớn' USING ERRCODE='22023'; END IF;
 IF a ? 'expected_revision' AND (jsonb_typeof(a->'expected_revision') IS DISTINCT FROM 'number' OR
    (a->>'expected_revision') !~ '^[0-9]+$' OR (a->>'expected_revision')::numeric>9007199254740991) THEN
   RAISE EXCEPTION 'Phiên bản bản nháp không hợp lệ' USING ERRCODE='22023';
 END IF;
 IF p_action LIKE 'rpc_match_%' AND a ? 'p_match_id' THEN
   view:=public.rpc_match_get_view((a->>'p_match_id')::uuid,a->>'p_invite_token');
   SELECT * INTO mm FROM public.memory_matches WHERE id=(a->>'p_match_id')::uuid FOR UPDATE;
   role_name:=view->>'role';
   rev:=CASE WHEN p_action IN ('rpc_match_save_progress','rpc_match_submit') THEN CASE WHEN role_name='owner' THEN mm.owner_revision ELSE mm.partner_revision END ELSE mm.draft_revision END;
   IF p_action IN ('rpc_match_save_questions','rpc_match_save_progress') AND COALESCE((a->>'expected_revision')::bigint,0) IS DISTINCT FROM rev THEN
     RAISE EXCEPTION 'DRAFT_CONFLICT: Bản này đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' USING ERRCODE='P0001';
   END IF;
 END IF;
 IF p_action IN ('rpc_house_save_draft','rpc_house_get_draft','rpc_house_publish','rpc_house_unpublish','rpc_house_revoke_share','house_replies') THEN
   view:=public.rpc_house_get_draft(a->>'p_tag_uid');
   PERFORM 1 FROM public.memory_spaces WHERE tag_uid=lower(trim(a->>'p_tag_uid')) FOR UPDATE;
   SELECT * INTO h FROM public.memory_houses WHERE memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=lower(trim(a->>'p_tag_uid'))) FOR UPDATE;
   rev:=COALESCE(h.draft_revision,0);
   IF p_action='rpc_house_save_draft' AND COALESCE((a->>'expected_revision')::bigint,0) IS DISTINCT FROM rev THEN
     RAISE EXCEPTION 'DRAFT_CONFLICT: Ngôi nhà đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' USING ERRCODE='P0001';
   END IF;
 END IF;
 CASE p_action
 WHEN 'rpc_match_create' THEN result:=public.rpc_match_create(a->>'p_tag_uid',a->>'p_title',a->>'p_partner_name',a->>'p_owner_name');
 WHEN 'rpc_match_save_questions' THEN result:=public.rpc_match_save_questions((a->>'p_match_id')::uuid,a->'p_questions',a->>'p_title',a->>'p_partner_name',a->>'p_owner_name');
 WHEN 'rpc_match_begin' THEN result:=public.rpc_match_begin((a->>'p_match_id')::uuid);
 WHEN 'rpc_match_save_progress' THEN result:=public.rpc_match_save_progress((a->>'p_match_id')::uuid,a->'p_answers',a->>'p_invite_token');
 WHEN 'rpc_match_submit' THEN result:=public.rpc_match_submit((a->>'p_match_id')::uuid,a->'p_answers',a->>'p_invite_token');
 WHEN 'rpc_match_get_view' THEN result:=view;
 WHEN 'rpc_match_get_draft' THEN result:=public.rpc_match_get_draft((a->>'p_match_id')::uuid);
 WHEN 'rpc_match_list' THEN RETURN public.rpc_match_list(a->>'p_tag_uid');
 WHEN 'rpc_house_save_draft' THEN result:=public.rpc_house_save_draft(a->>'p_tag_uid',a->>'p_title',a->>'p_theme',a->'p_rooms');
 WHEN 'rpc_house_get_draft' THEN result:=view;
 WHEN 'rpc_house_publish' THEN result:=public.rpc_house_publish(a->>'p_tag_uid');
 WHEN 'rpc_house_unpublish' THEN result:=public.rpc_house_unpublish(a->>'p_tag_uid');
 WHEN 'rpc_house_revoke_share' THEN result:=public.rpc_house_revoke_share(a->>'p_tag_uid');
 WHEN 'rpc_house_public_view' THEN result:=public.rpc_house_public_view(a->>'p_share_id');
 WHEN 'rpc_house_tag_public_view' THEN result:=public.rpc_house_tag_public_view(a->>'p_tag_uid');
 WHEN 'rpc_admin_list_reports' THEN RETURN public.rpc_admin_list_reports(a->>'p_status',COALESCE((a->>'p_limit')::int,50),COALESCE((a->>'p_offset')::int,0));
 WHEN 'rpc_get_event_analytics_summary' THEN RETURN public.rpc_get_event_analytics_summary(COALESCE((a->>'p_days')::int,30));
 WHEN 'rpc_admin_moderate_content' THEN
   IF NOT public.is_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên được kiểm duyệt' USING ERRCODE='42501'; END IF;
   SELECT * INTO report FROM public.event_content_reports WHERE id=(a->>'p_report_id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy báo cáo' USING ERRCODE='P0002'; END IF;
   IF length(COALESCE(a->>'p_reason',''))>1000 OR a->>'p_action' NOT IN ('hide','restore','dismiss') THEN RAISE EXCEPTION 'Dữ liệu kiểm duyệt không hợp lệ' USING ERRCODE='22023'; END IF;
   IF report.resource_type='guestbook' THEN
     IF a->>'p_action'<>'dismiss' THEN UPDATE public.event_replies SET is_hidden=(a->>'p_action'='hide') WHERE id=report.resource_id::uuid; END IF;
     UPDATE public.event_content_reports SET status=CASE a->>'p_action' WHEN 'hide' THEN 'hidden' WHEN 'restore' THEN 'restored' ELSE 'dismissed' END,admin_notes=a->>'p_reason',reviewed_by=p_caller,reviewed_at=now() WHERE id=report.id;
     result:='{"success":true}';
   ELSE result:=public.rpc_admin_moderate_content(report.id,a->>'p_action',a->>'p_reason'); END IF;
   INSERT INTO public.event_moderation_audit(report_id,actor_id,action,reason) VALUES(report.id,p_caller,a->>'p_action',a->>'p_reason');
 WHEN 'rpc_submit_content_report' THEN
   resource:=a->>'p_resource_id'; resource_type:=a->>'p_resource_type';
   IF length(COALESCE(a->>'p_details',''))>1000 THEN RAISE EXCEPTION 'Lý do tối đa 1000 ký tự' USING ERRCODE='22023'; END IF;
   IF resource_type='house' THEN
     SELECT * INTO h FROM public.memory_houses WHERE share_id=resource OR memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=resource);
     IF h.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy nội dung' USING ERRCODE='P0002'; END IF;
     PERFORM public.rpc_house_public_view(h.share_id);
     SELECT tag_uid INTO resource FROM public.memory_spaces WHERE id=h.memory_id;
   ELSIF resource_type='match' THEN
     PERFORM public.rpc_match_get_view(resource::uuid,a->>'invite_token');
   ELSIF resource_type='guestbook' THEN
     SELECT hh.* INTO h FROM public.event_replies rr JOIN public.memory_houses hh ON hh.id=rr.house_id JOIN public.memory_spaces ms ON ms.id=hh.memory_id WHERE rr.id=resource::uuid AND ms.owner_id=p_caller;
     IF h.id IS NULL THEN RAISE EXCEPTION 'Không được báo cáo lời nhắn này' USING ERRCODE='42501'; END IF;
   ELSE RAISE EXCEPTION 'Loại báo cáo không hợp lệ' USING ERRCODE='22023'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(resource||COALESCE(a->>'reporter',''),0));
   SELECT rr.id INTO report_id FROM public.event_content_reports rr WHERE rr.resource_type=a->>'p_resource_type' AND rr.resource_id=resource AND rr.reason=a->>'p_reason' AND rr.status='pending' AND rr.created_at>now()-interval '1 day' LIMIT 1;
   IF report_id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'report_id',report_id); END IF;
   RETURN public.rpc_submit_content_report(resource_type,resource,a->>'p_reason',a->>'p_details');
 WHEN 'house_replies' THEN
   UPDATE public.event_replies SET read_at=now() WHERE house_id=h.id AND read_at IS NULL;
   RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(r)-'sender_id'-'request_id'-'house_id'),'[]') FROM (SELECT * FROM public.event_replies WHERE house_id=h.id ORDER BY created_at DESC LIMIT 100) r);
 WHEN 'house_reply' THEN
   SELECT * INTO h FROM public.memory_houses WHERE share_id=a->>'share_id' OR memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=a->>'tag_uid');
   IF h.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy ngôi nhà' USING ERRCODE='P0002'; END IF;
   view:=public.rpc_house_public_view(h.share_id);
   resource:=(SELECT r->>'reply_policy' FROM jsonb_array_elements(view->'rooms') r WHERE r->>'id'='beginning');
   IF resource IS NULL OR resource='off' OR (resource='signed_in' AND p_caller IS NULL) THEN RAISE EXCEPTION 'Chủ nhà chưa cho phép gửi lời nhắn này' USING ERRCODE='42501'; END IF;
   IF length(trim(COALESCE(a->>'name','')))=0 OR length(a->>'name')>80 OR length(COALESCE(a->>'message',''))>1000 OR a->>'kind' NOT IN ('heart','message') THEN RAISE EXCEPTION 'Lời nhắn không hợp lệ' USING ERRCODE='22023'; END IF;
   INSERT INTO public.event_replies(house_id,sender_id,request_id,name,message,kind) VALUES(h.id,p_caller,(a->>'request_id')::uuid,trim(a->>'name'),COALESCE(a->>'message',''),a->>'kind') ON CONFLICT(house_id,request_id) DO NOTHING;
   RETURN '{"success":true}';
 WHEN 'rpc_track_event_action' THEN
   IF a->>'p_event_name' NOT IN ('match_invite_opened','house_opened_share','house_share_click','house_copy_link','house_postcard_download','house_postcard_shared') THEN RAISE EXCEPTION 'Sự kiện này chỉ do hệ thống ghi nhận' USING ERRCODE='42501'; END IF;
   resource_type:=a->>'p_resource_type'; resource:=a->>'p_resource_id';
   IF resource_type='match' THEN PERFORM public.rpc_match_get_view(resource::uuid,a->>'invite_token');
   ELSIF resource_type='house' THEN
     SELECT * INTO h FROM public.memory_houses WHERE share_id=resource OR memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=resource);
     IF h.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy nhà' USING ERRCODE='P0002'; END IF;
     PERFORM public.rpc_house_public_view(h.share_id); resource:=h.id::text;
   ELSE RAISE EXCEPTION 'Loại tài nguyên không hợp lệ' USING ERRCODE='22023'; END IF;
   INSERT INTO public.event_analytics_logs(event_name,resource_type,resource_id,session_id,dedupe_key)
   VALUES(a->>'p_event_name',resource_type,resource,a->>'session_id',a->>'p_event_name'||':'||resource||':'||(a->>'session_id')||':'||COALESCE(a->>'event_id',date_trunc('hour',now())::text)) ON CONFLICT(dedupe_key) DO NOTHING;
   DELETE FROM public.event_analytics_logs WHERE created_at<now()-interval '180 days';
   RETURN '{"success":true}';
 ELSE RAISE EXCEPTION 'Thao tác event không hỗ trợ' USING ERRCODE='22023';
 END CASE;
 IF p_action LIKE 'rpc_house_%' AND a ? 'p_tag_uid' AND p_caller IS NOT NULL THEN
   SELECT * INTO h FROM public.memory_houses WHERE memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=lower(trim(a->>'p_tag_uid')));
   result:=result||jsonb_build_object('draft_revision',COALESCE(h.draft_revision,0));
 END IF;
 IF p_action LIKE 'rpc_match_%' AND a ? 'p_match_id' THEN
   SELECT * INTO mm FROM public.memory_matches WHERE id=(a->>'p_match_id')::uuid;
   result:=result||jsonb_build_object('draft_revision',mm.draft_revision,'progress_revision',CASE WHEN role_name='owner' THEN mm.owner_revision ELSE mm.partner_revision END);
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.rpc_event_dispatch(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_event_dispatch(text,jsonb,uuid) TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND
   (p.proname LIKE 'rpc_match_%' OR p.proname LIKE 'rpc_house_%' OR p.proname IN ('rpc_check_rate_limit','rpc_track_event_action','rpc_submit_content_report','rpc_admin_list_reports','rpc_admin_moderate_content','rpc_get_event_analytics_summary')) LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
