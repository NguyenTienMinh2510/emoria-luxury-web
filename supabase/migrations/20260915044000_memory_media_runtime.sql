BEGIN;
ALTER TABLE public.memory_spaces ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN order_id text REFERENCES public.orders(id),ADD COLUMN admin_suspended boolean NOT NULL DEFAULT false;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('emoria-memory','emoria-memory',false,52428800,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
CREATE FUNCTION public.owns_memory_path(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.memory_spaces WHERE tag_uid=split_part(p_path,'/',1) AND owner_id=auth.uid() AND NOT admin_suspended) $$;
REVOKE ALL ON FUNCTION public.owns_memory_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_memory_path(text) TO authenticated;
CREATE POLICY memory_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='emoria-memory' AND public.owns_memory_path(name));
CREATE POLICY memory_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='emoria-memory' AND public.owns_memory_path(name));
CREATE POLICY memory_owner_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='emoria-memory' AND public.owns_memory_path(name));
REVOKE ALL ON public.memory_media,public.guestbook_entries,public.nfc_tap_events FROM anon,authenticated;
ALTER FUNCTION public.rpc_get_memory_view(text,uuid) RENAME TO get_memory_view_internal;
REVOKE ALL ON FUNCTION public.get_memory_view_internal(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.rpc_get_memory_view(p_tag_uid text,p_grant_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; mem public.memory_spaces;
BEGIN
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid));
 IF NOT FOUND OR mem.admin_suspended THEN RETURN jsonb_build_object('success',false,'message','Kỷ vật không khả dụng.'); END IF;
 result:=public.get_memory_view_internal(p_tag_uid,p_grant_token);
 IF result->>'is_unlocked' IS DISTINCT FROM 'true' THEN result:=result||jsonb_build_object('audio_url',null,'media_gallery','[]'::jsonb,'guestbook','[]'::jsonb); END IF;
 RETURN result||jsonb_build_object('version',mem.version);
END $$;
ALTER FUNCTION public.rpc_update_memory_space(text,jsonb) RENAME TO update_memory_internal;
REVOKE ALL ON FUNCTION public.update_memory_internal(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.rpc_update_memory_space(p_tag_uid text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mem public.memory_spaces; result jsonb; item jsonb; idx integer:=0; path text;
BEGIN
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid)) FOR UPDATE;
 IF auth.uid() IS NULL OR mem.owner_id IS DISTINCT FROM auth.uid() OR mem.admin_suspended THEN RAISE EXCEPTION 'Bạn không có quyền sửa kỷ vật này.'; END IF;
 IF (p_payload->>'version')::integer IS DISTINCT FROM mem.version THEN RAISE EXCEPTION 'Kỷ vật đã thay đổi trên thiết bị khác. Tải lại trước khi lưu.'; END IF;
 IF length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(coalesce(p_payload->>'letter',''))>50000 THEN RAISE EXCEPTION 'Kiểm tra tiêu đề và nội dung (tối đa 50.000 ký tự).'; END IF;
 IF p_payload->>'pin_action'='SET' AND coalesce(p_payload->>'pin_code','') !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN cần 4–6 chữ số.'; END IF;
 IF p_payload ? 'media_gallery' THEN
  IF jsonb_typeof(p_payload->'media_gallery')<>'array' OR jsonb_array_length(p_payload->'media_gallery')>30 THEN RAISE EXCEPTION 'Tối đa 30 tệp mỗi kỷ vật.'; END IF;
  DELETE FROM public.memory_media WHERE memory_id=mem.id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'media_gallery') LOOP
   path:=item->>'path';
   IF split_part(path,'/',1)<>mem.tag_uid OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path) THEN RAISE EXCEPTION 'Tệp không thuộc kỷ vật này hoặc chưa tải xong.'; END IF;
   INSERT INTO public.memory_media(memory_id,url,type,caption,order_index,is_private) VALUES(mem.id,'storage://'||path,item->>'type',left(item->>'caption',500),idx,true);idx:=idx+1;
  END LOOP;
 END IF;
 IF coalesce(p_payload->>'audio_url','')<>'' THEN
  path:=replace(p_payload->>'audio_url','storage://','');
  IF split_part(path,'/',1)<>mem.tag_uid OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path) THEN RAISE EXCEPTION 'Hãy tải audio vào kho riêng của kỷ vật.'; END IF;
 END IF;
 result:=public.update_memory_internal(p_tag_uid,p_payload);
 IF result->>'success'='true' THEN UPDATE public.memory_spaces SET version=version+1,date=coalesce(p_payload->>'date',date) WHERE id=mem.id; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.rpc_my_memories() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN '[]'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tag_uid',tag_uid,'title',title,'jewelry_name',jewelry_name)),'[]') INTO result FROM public.memory_spaces WHERE owner_id=auth.uid();RETURN result;
END $$;
CREATE FUNCTION public.rpc_issue_chip(p_order_id text,p_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE tag text:='emo-'||replace(gen_random_uuid()::text,'-',''); code text:=encode(gen_random_bytes(18),'hex'); item public.order_items; n integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 PERFORM 1 FROM public.orders WHERE id=p_order_id AND status IN ('confirmed','crafting_nfc','shipping','completed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Đơn chưa đủ điều kiện cấp chip.'; END IF;
 SELECT * INTO item FROM public.order_items WHERE id=p_item_id AND order_id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Món hàng không thuộc đơn.'; END IF;
 SELECT count(*) INTO n FROM public.memory_spaces WHERE order_id=p_order_id AND jewelry_name=item.product_name;
 IF n>=item.quantity THEN RAISE EXCEPTION 'Đã cấp đủ chip cho món hàng này.'; END IF;
 INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,order_id,claim_code_hash,is_protected,pin_hash) VALUES(tag,item.product_name,'Kỷ niệm của bạn',p_order_id,crypt(code,gen_salt('bf',10)),true,crypt(encode(gen_random_bytes(12),'hex'),gen_salt('bf',10)));
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),tag,'chip.issued');
 RETURN jsonb_build_object('success',true,'tag',tag,'claim_code',code);
END $$;
CREATE FUNCTION public.rpc_guestbook(p_tag text,p_token uuid,p_name text,p_message text,p_relationship text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb; mem uuid;
BEGIN
 view:=public.rpc_get_memory_view(p_tag,p_token);
 IF view->>'is_unlocked' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Cần mở khóa kỷ vật trước.'; END IF;
 IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 120 OR p_message IS NULL OR length(trim(p_message)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Kiểm tra tên và lời nhắn (tối đa 2000 ký tự).'; END IF;
 SELECT id INTO mem FROM public.memory_spaces WHERE tag_uid=p_tag FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.guestbook_entries WHERE memory_id=mem AND created_at>now()-interval '10 seconds') THEN RAISE EXCEPTION 'Vui lòng đợi 10 giây trước khi gửi tiếp.'; END IF;
 INSERT INTO public.guestbook_entries(memory_id,author_name,message,relationship,is_hidden) VALUES(mem,trim(p_name),trim(p_message),left(p_relationship,100),true);
 RETURN jsonb_build_object('success',true,'message','Lời nhắn đã lưu, chờ chủ kỷ vật duyệt.');
END $$;
REVOKE ALL ON FUNCTION public.rpc_get_memory_view(text,uuid),public.rpc_update_memory_space(text,jsonb),public.rpc_my_memories(),public.rpc_issue_chip(text,uuid),public.rpc_guestbook(text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_memory_view(text,uuid),public.rpc_guestbook(text,uuid,text,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_memory_space(text,jsonb),public.rpc_my_memories(),public.rpc_issue_chip(text,uuid) TO authenticated;
COMMIT;
