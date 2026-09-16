-- 1. FIX rpc_get_article_detail: Tự động tăng view_count khi xem bài viết
CREATE OR REPLACE FUNCTION public.rpc_get_article_detail(p_slug text) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE art public.articles; comments jsonb;
BEGIN
 SELECT * INTO art FROM public.articles WHERE slug=lower(trim(p_slug)) AND status='published';
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Bài viết không khả dụng.'); END IF;

 -- Tự động tăng lượt đọc khi có người mở xem
 UPDATE public.articles SET view_count = view_count + 1 WHERE id = art.id;
 art.view_count := art.view_count + 1;

 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'parent_id',c.parent_id,'content',c.content,'status',c.status,'created_at',to_char(c.created_at,'DD/MM/YYYY HH24:MI'),'author_name',coalesce(p.full_name,'Thành viên'),'is_mine',coalesce(c.user_id=auth.uid(),false)) ORDER BY c.created_at),'[]') INTO comments
 FROM public.article_comments c LEFT JOIN public.profiles p ON p.id=c.user_id
 WHERE c.article_id=art.id AND (c.status='approved' OR (c.user_id=auth.uid() AND c.status='pending'))
 AND (c.parent_id IS NULL OR EXISTS(SELECT 1 FROM public.article_comments parent WHERE parent.id=c.parent_id AND parent.article_id=art.id AND parent.status='approved'));

 RETURN jsonb_build_object(
   'success', true,
   'article', (to_jsonb(art)-'author_id') || jsonb_build_object(
     'is_liked', EXISTS(SELECT 1 FROM public.article_likes WHERE article_id=art.id AND user_id=auth.uid()),
     'is_bookmarked', EXISTS(SELECT 1 FROM public.article_bookmarks WHERE article_id=art.id AND user_id=auth.uid())
   ),
   'comments', comments
 );
END $$;

-- 2. FIX rpc_update_memory_space & update_memory_internal: Cập nhật người gửi & người nhận, cấp quyền cho cả Chủ sở hữu và Admin
CREATE OR REPLACE FUNCTION public.update_memory_internal(p_tag_uid text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_mem RECORD;
  v_pin_action TEXT;
  v_new_pin TEXT;
  v_new_pin_hash TEXT;
BEGIN
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ vật không tồn tại.');
  END IF;

  IF NOT (COALESCE(v_mem.owner_id = auth.uid(), FALSE) OR public.is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Bạn không phải là chủ nhân hoặc quản trị viên của kỷ vật này.');
  END IF;

  v_pin_action := p_payload->>'pin_action';
  v_new_pin := p_payload->>'pin_code';
  v_new_pin_hash := v_mem.pin_hash;

  IF v_pin_action = 'SET' AND v_new_pin IS NOT NULL AND length(trim(v_new_pin)) >= 4 THEN
    v_new_pin_hash := crypt(trim(v_new_pin), gen_salt('bf', 10));
    v_mem.is_protected := TRUE;
  ELSIF v_pin_action = 'REMOVE' THEN
    v_new_pin_hash := NULL;
    v_mem.is_protected := FALSE;
  END IF;

  IF v_new_pin_hash IS DISTINCT FROM v_mem.pin_hash THEN
    DELETE FROM public.access_grants WHERE memory_id = v_mem.id AND grant_type = 'viewer';
  END IF;

  UPDATE public.memory_spaces SET
    title = COALESCE(nullif(trim(p_payload->>'title'), ''), title),
    quote = COALESCE(p_payload->>'quote', quote),
    letter = COALESCE(p_payload->>'letter', letter),
    author_name = COALESCE(nullif(trim(p_payload->>'author'), ''), author_name),
    recipient_name = COALESCE(nullif(trim(p_payload->>'recipient'), ''), recipient_name),
    audio_title = COALESCE(p_payload->>'audio_title', audio_title),
    audio_url = COALESCE(p_payload->>'audio_url', audio_url),
    is_protected = v_mem.is_protected,
    pin_hash = v_new_pin_hash,
    updated_at = NOW()
  WHERE id = v_mem.id;

  RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thành công.');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_memory_space(p_tag_uid text,p_payload jsonb) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mem public.memory_spaces; result jsonb; item jsonb; idx integer:=0; path text; mime text;
BEGIN
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid)) FOR UPDATE;
 IF auth.uid() IS NULL OR (mem.owner_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin()) OR mem.admin_suspended THEN 
   RAISE EXCEPTION 'Bạn không có quyền sửa kỷ vật này.'; 
 END IF;
 IF p_payload ? 'version' AND (p_payload->>'version')::integer IS DISTINCT FROM mem.version THEN 
   RAISE EXCEPTION 'Kỷ vật đã thay đổi trên thiết bị khác. Tải lại trước khi lưu.'; 
 END IF;
 IF length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(coalesce(p_payload->>'letter',''))>50000 THEN 
   RAISE EXCEPTION 'Kiểm tra tiêu đề và nội dung (tối đa 50.000 ký tự).'; 
 END IF;
 IF p_payload->>'pin_action'='SET' AND coalesce(p_payload->>'pin_code','') !~ '^[0-9]{4,6}$' THEN 
   RAISE EXCEPTION 'PIN cần 4–6 chữ số.'; 
 END IF;
 IF p_payload ? 'letters' THEN
  IF jsonb_typeof(p_payload->'letters') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'letters')>10 THEN 
    RAISE EXCEPTION 'Tối đa 10 thư bổ sung.'; 
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'letters') LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR length(trim(coalesce(item->>'title',''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(item->>'body',''))) NOT BETWEEN 1 AND 10000 THEN 
     RAISE EXCEPTION 'Mỗi thư cần tiêu đề và nội dung, tối đa 10.000 ký tự.'; 
   END IF;
  END LOOP;
 END IF;
 IF coalesce(p_payload->>'intro_video_path','')<>'' THEN
  path:=p_payload->>'intro_video_path';
  SELECT metadata->>'mimetype' INTO mime FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path;
  IF split_part(path,'/',1)<>mem.tag_uid OR mime IS NULL OR mime NOT IN ('video/mp4','video/webm') THEN 
    RAISE EXCEPTION 'Video mở đầu cần là MP4/WebM đã tải vào đúng kỷ vật.'; 
  END IF;
 END IF;
 IF p_payload ? 'media_gallery' THEN
  IF jsonb_typeof(p_payload->'media_gallery') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'media_gallery')>30 THEN 
    RAISE EXCEPTION 'Tối đa 30 tệp mỗi kỷ vật.'; 
  END IF;
  DELETE FROM public.memory_media WHERE memory_id=mem.id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'media_gallery') LOOP
   path:=item->>'path';
   SELECT metadata->>'mimetype' INTO mime FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path;
   IF path IS NULL OR split_part(path,'/',1)<>mem.tag_uid OR mime IS NULL OR item->>'type' IS NULL OR NOT ((item->>'type'='image' AND mime LIKE 'image/%') OR (item->>'type'='video' AND mime IN ('video/mp4','video/webm'))) THEN 
     RAISE EXCEPTION 'Tệp không hợp lệ hoặc không thuộc kỷ vật này.'; 
   END IF;
   INSERT INTO public.memory_media(memory_id,url,type,caption,order_index,is_private) VALUES(mem.id,'storage://'||path,item->>'type',left(item->>'caption',500),idx,true);idx:=idx+1;
  END LOOP;
 END IF;
 IF coalesce(p_payload->>'audio_url','')<>'' AND p_payload->>'audio_url' IS DISTINCT FROM mem.audio_url THEN
  path:=replace(p_payload->>'audio_url','storage://','');
  SELECT metadata->>'mimetype' INTO mime FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path;
  IF split_part(path,'/',1)<>mem.tag_uid OR mime IS NULL OR mime NOT LIKE 'audio/%' THEN 
    RAISE EXCEPTION 'Hãy tải audio vào kho riêng của kỷ vật.'; 
  END IF;
 END IF;
 result:=public.update_memory_internal(p_tag_uid,p_payload);
 IF result->>'success'='true' THEN 
   UPDATE public.memory_spaces 
   SET version=version+1,
       date=coalesce(p_payload->>'date',date),
       intro_video_path=CASE WHEN p_payload ? 'intro_video_path' THEN nullif(p_payload->>'intro_video_path','') ELSE intro_video_path END,
       letters=coalesce(p_payload->'letters',letters) 
   WHERE id=mem.id; 
 END IF;
 RETURN result;
END $$;

-- 3. FIX rpc_memory_guestbook: Cho phép Chủ sở hữu và Admin duyệt, ẩn, hoặc xóa lời nhắn
CREATE OR REPLACE FUNCTION public.rpc_memory_guestbook(p_tag text,p_id uuid DEFAULT NULL,p_action text DEFAULT 'list') 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mem uuid; result jsonb;
BEGIN
 SELECT id INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag)) AND (owner_id=auth.uid() OR public.is_admin()) AND NOT admin_suspended;
 IF mem IS NULL THEN RAISE EXCEPTION 'Chỉ chủ kỷ vật hoặc quản trị viên được duyệt lời nhắn.'; END IF;
 IF p_action='approve' THEN UPDATE public.guestbook_entries SET is_hidden=false WHERE id=p_id AND memory_id=mem;
 ELSIF p_action='hide' THEN UPDATE public.guestbook_entries SET is_hidden=true WHERE id=p_id AND memory_id=mem;
 ELSIF p_action='delete' THEN DELETE FROM public.guestbook_entries WHERE id=p_id AND memory_id=mem;
 ELSIF p_action<>'list' OR p_action IS NULL THEN RAISE EXCEPTION 'Thao tác không hợp lệ.'; END IF;
 SELECT coalesce(jsonb_agg(row_data),'[]') INTO result FROM (
   SELECT id,author_name,message,relationship,is_hidden,created_at 
   FROM public.guestbook_entries WHERE memory_id=mem ORDER BY created_at DESC LIMIT 100
 ) row_data;
 RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_get_article_detail(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_memory_space(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_memory_guestbook(text,uuid,text) TO authenticated;
