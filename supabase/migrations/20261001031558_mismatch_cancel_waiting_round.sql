-- End an unfinished round without deleting either player's submitted answers.
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_match_cancel(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_match record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Yêu cầu đăng nhập' USING ERRCODE='42501'; END IF;
 SELECT mm.*,COALESCE(mm.creator_id,m.owner_id) AS current_owner_id INTO v_match
 FROM public.memory_matches mm LEFT JOIN public.memory_spaces m ON m.id=mm.memory_id
 WHERE mm.id=p_match_id FOR UPDATE OF mm;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lượt chơi không tồn tại' USING ERRCODE='P0002'; END IF;
 IF v_match.current_owner_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Chỉ người tạo lượt chơi mới có quyền hủy' USING ERRCODE='42501';
 END IF;
 IF v_match.status='archived' THEN
   RETURN jsonb_build_object('success',true,'match_id',p_match_id,'status','archived','cancelled',true);
 END IF;
 IF v_match.status='completed' OR (v_match.owner_submitted_at IS NOT NULL AND v_match.partner_submitted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'MATCH_COMPLETED: Hai người đã hoàn thành. Hãy xem kết quả trước khi tạo lượt mới.' USING ERRCODE='P0001';
 END IF;
 IF v_match.status<>'active' THEN RAISE EXCEPTION 'Chỉ có thể hủy lượt chơi đang diễn ra' USING ERRCODE='22023'; END IF;
 UPDATE public.memory_matches SET status='archived',partner_token_hash=NULL,updated_at=now() WHERE id=p_match_id;
 BEGIN
   PERFORM realtime.send('{"cancelled":true}'::jsonb,'changed','emoria-match:'||p_match_id::text,true);
 EXCEPTION WHEN undefined_function THEN NULL;
 END;
 RETURN jsonb_build_object('success',true,'match_id',p_match_id,'status','archived','cancelled',true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_match_cancel(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_match_cancel(uuid) TO service_role;

-- Keep the existing dispatcher and its authorization/revision boundary unchanged.
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
 WHEN 'rpc_match_cancel' THEN result:=public.rpc_match_cancel((a->>'p_match_id')::uuid);
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
NOTIFY pgrst,'reload schema';
COMMIT;
