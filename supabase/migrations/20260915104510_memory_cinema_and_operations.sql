BEGIN;
ALTER TABLE public.memory_spaces ADD COLUMN intro_video_path text, ADD COLUMN letters jsonb NOT NULL DEFAULT '[]', ADD COLUMN order_item_id uuid REFERENCES public.order_items(id);
CREATE INDEX memory_order_item_idx ON public.memory_spaces(order_item_id);
UPDATE public.memory_spaces m SET order_item_id=i.id FROM public.order_items i WHERE m.order_id=i.order_id AND m.jewelry_name=i.product_name AND (SELECT count(*) FROM public.order_items x WHERE x.order_id=i.order_id AND x.product_name=i.product_name)=1;

CREATE OR REPLACE FUNCTION public.rpc_get_memory_view(p_tag_uid text,p_grant_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; mem public.memory_spaces;
BEGIN
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid));
 IF NOT FOUND OR mem.admin_suspended THEN RETURN jsonb_build_object('success',false,'message','Kỷ vật không khả dụng.'); END IF;
 result:=public.get_memory_view_internal(p_tag_uid,p_grant_token);
 IF result->>'is_unlocked' IS DISTINCT FROM 'true' THEN
  result:=result||jsonb_build_object('audio_url',null,'media_gallery','[]'::jsonb,'guestbook','[]'::jsonb,'intro_video_path',null,'letters','[]'::jsonb);
 ELSE result:=result||jsonb_build_object('intro_video_path',mem.intro_video_path,'letters',mem.letters); END IF;
 RETURN result||jsonb_build_object('version',mem.version);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_update_memory_space(p_tag_uid text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mem public.memory_spaces; result jsonb; item jsonb; idx integer:=0; path text; mime text;
BEGIN
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid)) FOR UPDATE;
 IF auth.uid() IS NULL OR mem.owner_id IS DISTINCT FROM auth.uid() OR mem.admin_suspended THEN RAISE EXCEPTION 'Bạn không có quyền sửa kỷ vật này.'; END IF;
 IF (p_payload->>'version')::integer IS DISTINCT FROM mem.version THEN RAISE EXCEPTION 'Kỷ vật đã thay đổi trên thiết bị khác. Tải lại trước khi lưu.'; END IF;
 IF length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(coalesce(p_payload->>'letter',''))>50000 THEN RAISE EXCEPTION 'Kiểm tra tiêu đề và nội dung (tối đa 50.000 ký tự).'; END IF;
 IF p_payload->>'pin_action'='SET' AND coalesce(p_payload->>'pin_code','') !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN cần 4–6 chữ số.'; END IF;
 IF p_payload ? 'letters' THEN
  IF jsonb_typeof(p_payload->'letters') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'letters')>10 THEN RAISE EXCEPTION 'Tối đa 10 thư bổ sung.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'letters') LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR length(trim(coalesce(item->>'title',''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(item->>'body',''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Mỗi thư cần tiêu đề và nội dung, tối đa 10.000 ký tự.'; END IF;
  END LOOP;
 END IF;
 IF coalesce(p_payload->>'intro_video_path','')<>'' THEN
  path:=p_payload->>'intro_video_path';
  SELECT metadata->>'mimetype' INTO mime FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path;
  IF split_part(path,'/',1)<>mem.tag_uid OR mime IS NULL OR mime NOT IN ('video/mp4','video/webm') THEN RAISE EXCEPTION 'Video mở đầu cần là MP4/WebM đã tải vào đúng kỷ vật.'; END IF;
 END IF;
 IF p_payload ? 'media_gallery' THEN
  IF jsonb_typeof(p_payload->'media_gallery') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'media_gallery')>30 THEN RAISE EXCEPTION 'Tối đa 30 tệp mỗi kỷ vật.'; END IF;
  DELETE FROM public.memory_media WHERE memory_id=mem.id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'media_gallery') LOOP
   path:=item->>'path';
   SELECT metadata->>'mimetype' INTO mime FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path;
   IF path IS NULL OR split_part(path,'/',1)<>mem.tag_uid OR mime IS NULL OR item->>'type' IS NULL OR NOT ((item->>'type'='image' AND mime LIKE 'image/%') OR (item->>'type'='video' AND mime IN ('video/mp4','video/webm'))) THEN RAISE EXCEPTION 'Tệp không hợp lệ hoặc không thuộc kỷ vật này.'; END IF;
   INSERT INTO public.memory_media(memory_id,url,type,caption,order_index,is_private) VALUES(mem.id,'storage://'||path,item->>'type',left(item->>'caption',500),idx,true);idx:=idx+1;
  END LOOP;
 END IF;
 IF coalesce(p_payload->>'audio_url','')<>'' AND p_payload->>'audio_url' IS DISTINCT FROM mem.audio_url THEN
  path:=replace(p_payload->>'audio_url','storage://','');
  SELECT metadata->>'mimetype' INTO mime FROM storage.objects WHERE bucket_id='emoria-memory' AND name=path;
  IF split_part(path,'/',1)<>mem.tag_uid OR mime IS NULL OR mime NOT LIKE 'audio/%' THEN RAISE EXCEPTION 'Hãy tải audio vào kho riêng của kỷ vật.'; END IF;
 END IF;
 result:=public.update_memory_internal(p_tag_uid,p_payload);
 IF result->>'success'='true' THEN UPDATE public.memory_spaces SET version=version+1,date=coalesce(p_payload->>'date',date),intro_video_path=CASE WHEN p_payload ? 'intro_video_path' THEN nullif(p_payload->>'intro_video_path','') ELSE intro_video_path END,letters=coalesce(p_payload->'letters',letters) WHERE id=mem.id; END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_issue_chip(p_order_id text,p_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE tag text:='emo-'||replace(gen_random_uuid()::text,'-',''); code text:=encode(gen_random_bytes(18),'hex'); item public.order_items; n integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 PERFORM 1 FROM public.orders WHERE id=p_order_id AND status IN ('confirmed','crafting_nfc','shipping','completed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Đơn chưa đủ điều kiện cấp chip.'; END IF;
 SELECT * INTO item FROM public.order_items WHERE id=p_item_id AND order_id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Món hàng không thuộc đơn.'; END IF;
 SELECT count(*) INTO n FROM public.memory_spaces WHERE order_item_id=p_item_id OR (order_id=p_order_id AND order_item_id IS NULL AND jewelry_name=item.product_name);
 IF n>=item.quantity THEN RAISE EXCEPTION 'Đã cấp đủ chip cho món hàng này.'; END IF;
 INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,order_id,order_item_id,claim_code_hash,is_protected,pin_hash) VALUES(tag,item.product_name,'Kỷ niệm của bạn',p_order_id,p_item_id,crypt(code,gen_salt('bf',10)),true,crypt(encode(gen_random_bytes(12),'hex'),gen_salt('bf',10)));
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),tag,'chip.issued');
 RETURN jsonb_build_object('success',true,'tag',tag,'claim_code',code);
END $$;

CREATE FUNCTION public.rpc_memory_operations(p_tag text DEFAULT NULL,p_suspended boolean DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 IF p_suspended IS NOT NULL THEN
  UPDATE public.memory_spaces SET admin_suspended=p_suspended WHERE tag_uid=p_tag;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy kỷ vật.'; END IF;
  INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),p_tag,CASE WHEN p_suspended THEN 'chip.suspended' ELSE 'chip.restored' END);
 END IF;
 SELECT coalesce(jsonb_agg(row_data),'[]') INTO result FROM (SELECT tag_uid,jewelry_name,order_id,order_item_id,owner_id IS NOT NULL AS claimed,admin_suspended FROM public.memory_spaces ORDER BY created_at DESC LIMIT 200) row_data;
 RETURN result;
END $$;

CREATE FUNCTION public.rpc_memory_guestbook(p_tag text,p_id uuid DEFAULT NULL,p_action text DEFAULT 'list') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mem uuid; result jsonb;
BEGIN
 SELECT id INTO mem FROM public.memory_spaces WHERE tag_uid=p_tag AND owner_id=auth.uid() AND NOT admin_suspended;
 IF mem IS NULL THEN RAISE EXCEPTION 'Chỉ chủ kỷ vật được duyệt lời nhắn.'; END IF;
 IF p_action='approve' THEN UPDATE public.guestbook_entries SET is_hidden=false WHERE id=p_id AND memory_id=mem;
 ELSIF p_action='delete' THEN DELETE FROM public.guestbook_entries WHERE id=p_id AND memory_id=mem;
 ELSIF p_action<>'list' OR p_action IS NULL THEN RAISE EXCEPTION 'Thao tác không hợp lệ.'; END IF;
 SELECT coalesce(jsonb_agg(row_data),'[]') INTO result FROM (SELECT id,author_name,message,relationship,is_hidden,created_at FROM public.guestbook_entries WHERE memory_id=mem ORDER BY created_at DESC LIMIT 100) row_data;
 RETURN result;
END $$;

CREATE FUNCTION public.rpc_save_catalog(p_id text,p_expected jsonb,p_product jsonb,p_variants jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_product public.checkout_products; snapshot jsonb; variants jsonb; item jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 IF p_id IS NULL OR p_id !~ '^[a-z0-9-]{1,80}$' OR length(trim(coalesce(p_product->>'name',''))) NOT BETWEEN 1 AND 200 OR coalesce((p_product->>'price')::bigint,0)<1 THEN RAISE EXCEPTION 'Kiểm tra mã, tên và giá sản phẩm.'; END IF;
 IF jsonb_typeof(p_variants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_variants) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Cần 1–30 biến thể.'; END IF;
 IF (SELECT count(DISTINCT value->>'size') FROM jsonb_array_elements(p_variants))<>jsonb_array_length(p_variants) THEN RAISE EXCEPTION 'Kích cỡ không được trùng.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
  IF length(trim(coalesce(item->>'size',''))) NOT BETWEEN 1 AND 50 OR coalesce((item->>'stock')::integer,-1)<0 THEN RAISE EXCEPTION 'Kiểm tra kích cỡ và tồn kho.'; END IF;
 END LOOP;
 SELECT * INTO current_product FROM public.checkout_products WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  PERFORM 1 FROM public.checkout_variants WHERE product_id=p_id ORDER BY size FOR UPDATE;
  SELECT coalesce(jsonb_object_agg(size,stock),'{}') INTO variants FROM public.checkout_variants WHERE product_id=p_id;
  snapshot:=jsonb_build_object('name',current_product.name,'price',current_product.price,'active',current_product.active,'image',current_product.image_url,'stocks',variants);
  IF snapshot IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Giá hoặc tồn kho đã thay đổi. Tải lại danh mục trước khi lưu để tránh ghi đè đơn vừa đặt.'; END IF;
  IF EXISTS(SELECT 1 FROM public.checkout_variants v WHERE v.product_id=p_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) x WHERE x->>'size'=v.size)) THEN RAISE EXCEPTION 'Giữ biến thể đã có; đặt tồn 0 nếu ngừng bán.'; END IF;
  UPDATE public.checkout_products SET name=trim(p_product->>'name'),price=(p_product->>'price')::bigint,active=coalesce((p_product->>'active')::boolean,false),image_url=p_product->>'image' WHERE id=p_id;
 ELSE
  IF p_expected IS NOT NULL THEN RAISE EXCEPTION 'Sản phẩm không còn tồn tại.'; END IF;
  INSERT INTO public.checkout_products(id,name,price,active,image_url) VALUES(p_id,trim(p_product->>'name'),(p_product->>'price')::bigint,coalesce((p_product->>'active')::boolean,false),p_product->>'image');
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
  INSERT INTO public.checkout_variants(product_id,size,stock) VALUES(p_id,item->>'size',(item->>'stock')::integer) ON CONFLICT(product_id,size) DO UPDATE SET stock=excluded.stock;
 END LOOP;
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),p_id,'catalog.saved');
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_memory_operations(text,boolean),public.rpc_memory_guestbook(text,uuid,text),public.rpc_save_catalog(text,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_memory_operations(text,boolean),public.rpc_memory_guestbook(text,uuid,text),public.rpc_save_catalog(text,jsonb,jsonb,jsonb) TO authenticated;
COMMIT;
