-- Upgrade the inspected 14 September Cloud schema. No database reset. Run once.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF to_regclass('public.store_settings') IS NOT NULL THEN RAISE EXCEPTION 'Upgrade already applied or schema differs; inspect before continuing.'; END IF;
 IF to_regprocedure('public.rpc_create_order(uuid,jsonb)') IS NULL OR to_regclass('public.article_bookmarks') IS NULL THEN RAISE EXCEPTION 'Expected existing EMORIA Cloud baseline.'; END IF;
END $$;
-- Source: 202609140001_store_operations.sql
CREATE TABLE public.store_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 sandbox boolean NOT NULL DEFAULT true,
 sales_enabled boolean NOT NULL DEFAULT false,
 cod_enabled boolean NOT NULL DEFAULT false,
 transfer_enabled boolean NOT NULL DEFAULT false,
 shipping_fee bigint NOT NULL DEFAULT 30000 CHECK(shipping_fee >= 0),
 free_shipping_from bigint NOT NULL DEFAULT 1000000 CHECK(free_shipping_from >= 0),
 gift_fee bigint NOT NULL DEFAULT 35000 CHECK(gift_fee >= 0),
 reservation_minutes integer NOT NULL DEFAULT 60 CHECK(reservation_minutes BETWEEN 5 AND 10080),
 bank_bin text NOT NULL DEFAULT '', bank_account text NOT NULL DEFAULT '', bank_owner text NOT NULL DEFAULT '',
 contact_email text NOT NULL DEFAULT '', contact_phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
 shipping_policy text NOT NULL DEFAULT '', return_policy text NOT NULL DEFAULT '', privacy_policy text NOT NULL DEFAULT ''
);
INSERT INTO public.store_settings(id) VALUES(true);
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_read ON public.store_settings FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY settings_write ON public.store_settings FOR UPDATE TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
GRANT SELECT ON public.store_settings TO anon,authenticated;
GRANT UPDATE ON public.store_settings TO authenticated;
CREATE TABLE public.operation_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, resource_id text NOT NULL,
 action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin ON public.operation_audit FOR SELECT TO authenticated USING(public.is_admin());
GRANT SELECT ON public.operation_audit TO authenticated;
ALTER TABLE public.orders ADD COLUMN lookup_token uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN stock_released boolean NOT NULL DEFAULT false,
 ADD COLUMN payment_confirmed_at timestamptz,
 ADD COLUMN tracking_number text,
 ADD COLUMN expires_at timestamptz,
 ADD COLUMN is_test boolean NOT NULL DEFAULT false;
REVOKE UPDATE ON public.orders FROM authenticated;

ALTER FUNCTION public.rpc_create_order(uuid,jsonb) RENAME TO create_order_atomic_internal;
REVOKE ALL ON FUNCTION public.create_order_atomic_internal(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.rpc_create_order(p_request_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cfg public.store_settings; result jsonb; oid text; shipping bigint; gift bigint; v_subtotal bigint; tok uuid; prior public.checkout_requests;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO prior FROM public.checkout_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Yêu cầu đặt hàng đã thay đổi.'; END IF;
  RETURN prior.response;
 END IF;
 SELECT * INTO cfg FROM public.store_settings WHERE id=true FOR SHARE;
 IF NOT cfg.sales_enabled THEN RAISE EXCEPTION 'Cửa hàng chưa mở nhận đơn.'; END IF;
 IF p_payload->>'paymentMethod'='cod' AND NOT cfg.cod_enabled THEN RAISE EXCEPTION 'COD chưa được bật.'; END IF;
 IF p_payload->>'paymentMethod'='vietqr' AND (NOT cfg.transfer_enabled OR (NOT cfg.sandbox AND (cfg.bank_bin='' OR cfg.bank_account='' OR cfg.bank_owner=''))) THEN RAISE EXCEPTION 'Chuyển khoản chưa được cấu hình.'; END IF;
 IF auth.uid() IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
  IF (SELECT count(*) FROM public.orders WHERE user_id=auth.uid() AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Bạn đã tạo nhiều đơn. Vui lòng thử lại sau.'; END IF;
 END IF;
 result:=public.create_order_atomic_internal(p_request_id,p_payload);
 oid:=result->'order'->>'id'; v_subtotal:=(result->'order'->'totals'->>'subtotal')::bigint;
 shipping:=CASE WHEN v_subtotal>=cfg.free_shipping_from THEN 0 ELSE cfg.shipping_fee END;
 gift:=CASE WHEN (result->'order'->'totals'->>'giftWrapFee')::bigint>0 THEN cfg.gift_fee ELSE 0 END;
 UPDATE public.orders SET shipping_fee=shipping,gift_wrap_fee=gift,final_total=v_subtotal+shipping+gift,
  expires_at=CASE WHEN payment_method='vietqr' THEN now()+make_interval(mins=>cfg.reservation_minutes) ELSE NULL END,is_test=cfg.sandbox WHERE id=oid RETURNING lookup_token INTO tok;
 result:=jsonb_set(result,'{order,totals}',jsonb_build_object('subtotal',v_subtotal,'shippingFee',shipping,'giftWrapFee',gift,'finalTotal',v_subtotal+shipping+gift));
 result:=jsonb_set(result,'{order}',(result->'order')||jsonb_build_object('lookupToken',tok,'isTest',cfg.sandbox));
 UPDATE public.checkout_requests SET response=result WHERE request_id=p_request_id;
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),oid,'order.created');
 RETURN result;
END $$;

CREATE FUNCTION public.rpc_order_status(p_order_id text,p_status text,p_tracking text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; item record;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 SELECT * INTO ord FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn.'; END IF;
 IF p_status=ord.status THEN RETURN jsonb_build_object('success',true); END IF;
 IF p_status IS NULL OR NOT (
  (ord.status='pending_payment' AND p_status IN ('confirmed','cancelled')) OR
  (ord.status='confirmed' AND p_status IN ('crafting_nfc','cancelled')) OR
  (ord.status='crafting_nfc' AND p_status IN ('shipping','cancelled')) OR
  (ord.status='shipping' AND p_status='completed')
 ) THEN RAISE EXCEPTION 'Không thể chuyển trạng thái đơn này.'; END IF;
 IF p_status='cancelled' AND NOT ord.stock_released THEN
  FOR item IN SELECT product_id,size,sum(quantity)::integer AS qty FROM public.order_items WHERE order_id=p_order_id GROUP BY product_id,size ORDER BY product_id,size LOOP
   UPDATE public.checkout_variants SET stock=stock+item.qty WHERE product_id=item.product_id AND size=item.size;
  END LOOP;
 END IF;
 UPDATE public.orders SET status=p_status,updated_at=now(),stock_released=stock_released OR p_status='cancelled',
 payment_confirmed_at=CASE WHEN ord.status='pending_payment' AND p_status='confirmed' THEN now() ELSE payment_confirmed_at END,
 tracking_number=coalesce(nullif(trim(p_tracking),''),tracking_number) WHERE id=p_order_id;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),p_order_id,'order.status',jsonb_build_object('from',ord.status,'to',p_status));
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.rpc_track_order(p_order_id text,p_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; items jsonb;
BEGIN
 SELECT * INTO ord FROM public.orders WHERE upper(id)=upper(trim(p_order_id)) AND (lookup_token=p_token OR (user_id=auth.uid() AND auth.uid() IS NOT NULL) OR public.is_admin());
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Không tìm thấy đơn hoặc mã tra cứu không đúng.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',product_id,'name',product_name,'price',unit_price,'size',size,'quantity',quantity,'image',image_url,'isGift',is_gift)),'[]') INTO items FROM public.order_items WHERE order_id=ord.id;
 RETURN jsonb_build_object('success',true,'order',jsonb_build_object('id',ord.id,'customerName',ord.customer_name,'phone',ord.phone,'address',ord.address,'status',ord.status,'paymentMethod',ord.payment_method,'createdAt',ord.created_at,'isTest',ord.is_test,'trackingNumber',ord.tracking_number,'totals',jsonb_build_object('finalTotal',ord.final_total),'items',items));
END $$;

CREATE FUNCTION public.rpc_expire_orders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord record; item record; n integer:=0;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 FOR ord IN SELECT * FROM public.orders WHERE status='pending_payment' AND expires_at<now() ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  IF NOT ord.stock_released THEN
   FOR item IN SELECT product_id,size,sum(quantity)::integer qty FROM public.order_items WHERE order_id=ord.id GROUP BY product_id,size ORDER BY product_id,size LOOP
    UPDATE public.checkout_variants SET stock=stock+item.qty WHERE product_id=item.product_id AND size=item.size;
   END LOOP;
  END IF;
  UPDATE public.orders SET status='cancelled',stock_released=true,updated_at=now() WHERE id=ord.id;
  INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),ord.id,'order.expired'); n:=n+1;
 END LOOP;
 RETURN n;
END $$;

CREATE TABLE public.contact_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,phone text NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),resolved boolean NOT NULL DEFAULT false);
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_admin ON public.contact_requests FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
GRANT SELECT,UPDATE ON public.contact_requests TO authenticated;
CREATE FUNCTION public.rpc_contact(p_name text,p_phone text,p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF length(trim(p_name)) NOT BETWEEN 1 AND 120 OR p_name IS NULL OR p_phone IS NULL OR p_phone !~ '^[+0-9 ()-]{9,20}$' OR p_note IS NULL OR length(trim(p_note)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Vui lòng kiểm tra tên, số điện thoại và nội dung (tối đa 2000 ký tự).'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_phone,9));
 IF EXISTS(SELECT 1 FROM public.contact_requests WHERE phone=p_phone AND created_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'Vui lòng đợi một phút trước khi gửi lại.'; END IF;
 INSERT INTO public.contact_requests(name,phone,note) VALUES(trim(p_name),p_phone,trim(p_note));
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_create_order(uuid,jsonb),public.rpc_track_order(text,uuid),public.rpc_order_status(text,text,text),public.rpc_expire_orders(),public.rpc_contact(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_order(uuid,jsonb),public.rpc_track_order(text,uuid),public.rpc_contact(text,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_order_status(text,text,text),public.rpc_expire_orders() TO authenticated;

-- Source: 202609140002_editor_security.sql
CREATE TABLE public.article_drafts(article_id uuid PRIMARY KEY REFERENCES public.articles(id) ON DELETE CASCADE,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.article_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.article_drafts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.articles,public.article_comments,public.article_likes,public.article_bookmarks,public.comment_reports FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_toggle_article_like(uuid),public.rpc_toggle_article_bookmark(uuid) FROM PUBLIC,anon,authenticated;
ALTER TABLE public.articles ADD COLUMN seo_title text,ADD COLUMN seo_description text;

CREATE OR REPLACE FUNCTION public.rpc_save_article_admin(p_article_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE aid uuid:=p_article_id; old public.articles; target text:=p_payload->>'status'; slug text:=lower(trim(p_payload->>'slug'));
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 IF length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_payload->>'content',''))) NOT BETWEEN 1 AND 100000 OR slug IS NULL OR slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(slug)>160 OR target IS NULL OR target NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Kiểm tra tiêu đề, nội dung và đường dẫn bài viết.'; END IF;
 IF aid IS NOT NULL THEN
  SELECT * INTO old FROM public.articles WHERE id=aid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bài viết.'; END IF;
  IF old.slug<>slug THEN RAISE EXCEPTION 'Đường dẫn đã được cố định. Tạo bài mới nếu cần đường dẫn khác.'; END IF;
 ELSE
  INSERT INTO public.articles(slug,title,content,author_id) VALUES(slug,p_payload->>'title',p_payload->>'content',auth.uid()) RETURNING id INTO aid;
 END IF;
 INSERT INTO public.article_drafts(article_id,payload) VALUES(aid,p_payload) ON CONFLICT(article_id) DO UPDATE SET payload=excluded.payload,updated_at=now();
 IF target<>'draft' OR old.status IS DISTINCT FROM 'published' THEN
  UPDATE public.articles SET title=p_payload->>'title',content=p_payload->>'content',excerpt=p_payload->>'excerpt',cover_image=p_payload->>'cover_image',
   category=coalesce(nullif(p_payload->>'category',''),'Câu chuyện EMORIA'),author_name=coalesce(nullif(p_payload->>'author_name',''),'EMORIA'),
   tags=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'tags','[]'))),related_product_ids=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'related_product_ids','[]'))),
   seo_title=p_payload->>'seo_title',seo_description=p_payload->>'seo_description',
   allow_comments=coalesce((p_payload->>'allow_comments')::boolean,true),status=target,updated_at=now(),
   published_at=CASE WHEN target='published' THEN coalesce(published_at,now()) ELSE published_at END WHERE id=aid;
 END IF;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),aid::text,'article.save',jsonb_build_object('status',target));
 RETURN jsonb_build_object('success',true,'article_id',aid,'status',target);
END $$;

CREATE FUNCTION public.rpc_article_admin_data() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE arts jsonb; comments jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 SELECT coalesce(jsonb_agg((to_jsonb(a)||coalesce(d.payload,'{}'))||jsonb_build_object('id',a.id,'status',a.status) ORDER BY a.updated_at DESC),'[]') INTO arts FROM public.articles a LEFT JOIN public.article_drafts d ON d.article_id=a.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'article_title',a.title,'content',c.content,'status',c.status,'created_at',c.created_at,'author_name',coalesce(p.full_name,'Thành viên'),'report_count',(SELECT count(*) FROM public.comment_reports r WHERE r.comment_id=c.id)) ORDER BY c.created_at),'[]') INTO comments FROM public.article_comments c JOIN public.articles a ON a.id=c.article_id LEFT JOIN public.profiles p ON p.id=c.user_id WHERE c.status<>'deleted';
 RETURN jsonb_build_object('success',true,'articles',arts,'comments',comments);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_get_article_detail(p_slug text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE art public.articles; comments jsonb;
BEGIN
 SELECT * INTO art FROM public.articles WHERE slug=lower(trim(p_slug)) AND status='published';
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Bài viết không khả dụng.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'parent_id',c.parent_id,'content',c.content,'status',c.status,'created_at',to_char(c.created_at,'DD/MM/YYYY HH24:MI'),'author_name',coalesce(p.full_name,'Thành viên'),'is_mine',coalesce(c.user_id=auth.uid(),false)) ORDER BY c.created_at),'[]') INTO comments
 FROM public.article_comments c LEFT JOIN public.profiles p ON p.id=c.user_id
 WHERE c.article_id=art.id AND (c.status='approved' OR (c.user_id=auth.uid() AND c.status='pending'))
 AND (c.parent_id IS NULL OR EXISTS(SELECT 1 FROM public.article_comments parent WHERE parent.id=c.parent_id AND parent.article_id=art.id AND parent.status='approved'));
 RETURN jsonb_build_object('success',true,'article',(to_jsonb(art)-'author_id')||jsonb_build_object('is_liked',EXISTS(SELECT 1 FROM public.article_likes WHERE article_id=art.id AND user_id=auth.uid()),'is_bookmarked',EXISTS(SELECT 1 FROM public.article_bookmarks WHERE article_id=art.id AND user_id=auth.uid())),'comments',comments);
END $$;

CREATE FUNCTION public.rpc_set_article_reaction(p_article_id uuid,p_kind text,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập để tương tác.'; END IF;
 PERFORM 1 FROM public.articles WHERE id=p_article_id AND status='published' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bài viết không khả dụng.'; END IF;
 IF p_enabled IS NULL OR p_kind IS NULL OR p_kind NOT IN ('like','bookmark') THEN RAISE EXCEPTION 'Tương tác không hợp lệ.'; END IF;
 IF p_kind='like' THEN
  IF p_enabled THEN INSERT INTO public.article_likes(article_id,user_id) VALUES(p_article_id,auth.uid()) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.article_likes WHERE article_id=p_article_id AND user_id=auth.uid(); END IF;
  SELECT count(*) INTO n FROM public.article_likes WHERE article_id=p_article_id;
  UPDATE public.articles SET likes_count=n WHERE id=p_article_id;
 ELSE
  IF p_enabled THEN INSERT INTO public.article_bookmarks(article_id,user_id) VALUES(p_article_id,auth.uid()) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.article_bookmarks WHERE article_id=p_article_id AND user_id=auth.uid(); END IF;
 END IF;
 RETURN jsonb_build_object('success',true,'is_liked',p_enabled,'is_bookmarked',p_enabled,'likes_count',n);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_add_article_comment(p_article_id uuid,p_content text,p_parent_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập để bình luận.'; END IF;
 PERFORM 1 FROM public.articles WHERE id=p_article_id AND status='published' AND allow_comments FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bài viết không nhận bình luận.'; END IF;
 IF p_content IS NULL OR length(trim(p_content)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Bình luận cần từ 1 đến 2000 ký tự.'; END IF;
 IF p_parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.article_comments WHERE id=p_parent_id AND article_id=p_article_id AND parent_id IS NULL AND status='approved') THEN RAISE EXCEPTION 'Chỉ được trả lời bình luận gốc đã duyệt của bài này.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,12));
 IF EXISTS(SELECT 1 FROM public.article_comments WHERE user_id=auth.uid() AND created_at>now()-interval '15 seconds') THEN RAISE EXCEPTION 'Vui lòng đợi 15 giây trước khi bình luận tiếp.'; END IF;
 INSERT INTO public.article_comments(article_id,user_id,parent_id,content,status) VALUES(p_article_id,auth.uid(),p_parent_id,trim(p_content),'pending') RETURNING id INTO cid;
 RETURN jsonb_build_object('success',true,'comment_id',cid,'status','pending','message','Bình luận đã lưu và đang chờ duyệt.');
END $$;

CREATE FUNCTION public.rpc_edit_article_comment(p_comment_id uuid,p_content text,p_delete boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập.'; END IF;
 IF NOT p_delete AND (p_content IS NULL OR length(trim(p_content)) NOT BETWEEN 1 AND 2000) THEN RAISE EXCEPTION 'Bình luận cần từ 1 đến 2000 ký tự.'; END IF;
 UPDATE public.article_comments c SET content=CASE WHEN p_delete THEN '' ELSE trim(p_content) END,status=CASE WHEN p_delete THEN 'deleted' ELSE 'pending' END,updated_at=now()
 WHERE c.id=p_comment_id AND c.user_id=auth.uid() AND c.status IN ('approved','pending') AND EXISTS(SELECT 1 FROM public.articles a WHERE a.id=c.article_id AND a.status='published' AND a.allow_comments);
 IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền sửa bình luận này.'; END IF;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.rpc_report_comment(p_comment_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Đăng nhập và nhập lý do (tối đa 500 ký tự).'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.article_comments c JOIN public.articles a ON a.id=c.article_id WHERE c.id=p_comment_id AND c.status='approved' AND a.status='published') THEN RAISE EXCEPTION 'Bình luận không khả dụng.'; END IF;
 INSERT INTO public.comment_reports(comment_id,reporter_id,reason) VALUES(p_comment_id,auth.uid(),trim(p_reason)) ON CONFLICT(comment_id,reporter_id) DO NOTHING;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.rpc_saved_articles() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE arts jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập để xem bài đã lưu.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'excerpt',a.excerpt,'cover_image',a.cover_image,'category',a.category,'author_name',a.author_name,'published_at',a.published_at,'likes_count',a.likes_count,'view_count',a.view_count) ORDER BY b.created_at DESC),'[]') INTO arts FROM public.article_bookmarks b JOIN public.articles a ON a.id=b.article_id WHERE b.user_id=auth.uid() AND a.status='published';
 RETURN jsonb_build_object('success',true,'articles',arts,'total',jsonb_array_length(arts));
END $$;
CREATE OR REPLACE FUNCTION public.rpc_moderate_article_comment(p_comment_id uuid,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('approved','hidden','deleted') THEN RAISE EXCEPTION 'Trạng thái không hợp lệ.'; END IF;
 UPDATE public.article_comments SET status=p_status,updated_at=now() WHERE id=p_comment_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bình luận.'; END IF;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),p_comment_id::text,'comment.moderate',jsonb_build_object('status',p_status));
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_article_admin_data(),public.rpc_set_article_reaction(uuid,text,boolean),public.rpc_edit_article_comment(uuid,text,boolean),public.rpc_report_comment(uuid,text),public.rpc_saved_articles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_article_admin_data(),public.rpc_set_article_reaction(uuid,text,boolean),public.rpc_edit_article_comment(uuid,text,boolean),public.rpc_report_comment(uuid,text),public.rpc_saved_articles() TO authenticated;

-- Source: 20260915043147_marketing_and_runtime.sql
ALTER TABLE public.store_settings ADD COLUMN ga4_measurement_id text NOT NULL DEFAULT '' CHECK(ga4_measurement_id='' OR ga4_measurement_id ~ '^G-[A-Z0-9]{4,20}$');
CREATE INDEX IF NOT EXISTS orders_created_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_user_created_idx ON public.orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS comments_article_idx ON public.article_comments(article_id,created_at);
CREATE INDEX IF NOT EXISTS comments_user_created_idx ON public.article_comments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS articles_published_idx ON public.articles(published_at DESC) WHERE status='published';
CREATE FUNCTION public.rpc_marketing_report(p_days integer DEFAULT 30,p_test boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE summary jsonb; daily jsonb; products jsonb; states jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Chỉ admin được đọc báo cáo.'; END IF;
 IF p_days IS NULL OR p_days NOT IN(7,30,90) THEN RAISE EXCEPTION 'Khoảng thời gian không hợp lệ.'; END IF;
 SELECT jsonb_build_object('orders',count(*),'cancelled',count(*) FILTER(WHERE status='cancelled'),
 'completed',count(*) FILTER(WHERE status='completed'),
 'order_value',coalesce(sum(final_total) FILTER(WHERE status<>'cancelled'),0),
 'completed_revenue',coalesce(sum(final_total) FILTER(WHERE status='completed'),0),
 'pending_payment',coalesce(sum(final_total) FILTER(WHERE status='pending_payment'),0),
 'average_order',coalesce(round(avg(final_total) FILTER(WHERE status<>'cancelled')),0)) INTO summary
 FROM public.orders WHERE created_at>=now()-make_interval(days=>p_days) AND is_test=p_test;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day),'[]') INTO daily FROM (
 SELECT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,count(*) AS orders,coalesce(sum(final_total) FILTER(WHERE status='completed'),0) AS revenue
 FROM public.orders WHERE created_at>=now()-make_interval(days=>p_days) AND is_test=p_test GROUP BY 1) d;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO products FROM (
 SELECT i.product_id,max(i.product_name) AS name,sum(i.quantity) AS units,sum(i.unit_price*i.quantity) AS value
 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE o.created_at>=now()-make_interval(days=>p_days) AND o.is_test=p_test AND o.status<>'cancelled'
 GROUP BY i.product_id ORDER BY sum(i.quantity) DESC LIMIT 10) p;
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO states FROM (SELECT status,count(*) AS count FROM public.orders WHERE created_at>=now()-make_interval(days=>p_days) AND is_test=p_test GROUP BY status) s;
 RETURN jsonb_build_object('success',true,'summary',summary,'daily',daily,'products',products,'states',states,'days',p_days,'is_test',p_test);
END $$;
REVOKE ALL ON FUNCTION public.rpc_marketing_report(integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_marketing_report(integer,boolean) TO authenticated;

-- Source: 20260915044000_memory_media_runtime.sql
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

-- Source: 20260915104510_memory_cinema_and_operations.sql
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

-- Source: 20260915114549_checkout_recovery_and_expiry.sql
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.rpc_create_order(p_request_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cfg public.store_settings; result jsonb; oid text; shipping bigint; gift bigint; v_subtotal bigint; tok uuid; prior public.checkout_requests;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO prior FROM public.checkout_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Yêu cầu đặt hàng đã thay đổi.'; END IF;
  RETURN prior.response;
 END IF;
 SELECT * INTO cfg FROM public.store_settings WHERE id=true FOR SHARE;
 IF NOT cfg.sales_enabled THEN RAISE EXCEPTION 'Cửa hàng chưa mở nhận đơn.'; END IF;
 IF p_payload->>'paymentMethod'='cod' AND NOT cfg.cod_enabled THEN RAISE EXCEPTION 'COD chưa được bật.'; END IF;
 IF p_payload->>'paymentMethod'='vietqr' AND (NOT cfg.transfer_enabled OR (NOT cfg.sandbox AND (cfg.bank_bin='' OR cfg.bank_account='' OR cfg.bank_owner=''))) THEN RAISE EXCEPTION 'Chuyển khoản chưa được cấu hình.'; END IF;
 IF auth.uid() IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
  IF (SELECT count(*) FROM public.orders WHERE user_id=auth.uid() AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Bạn đã tạo nhiều đơn. Vui lòng thử lại sau.'; END IF;
 END IF;
 result:=public.create_order_atomic_internal(p_request_id,p_payload);
 oid:=result->'order'->>'id'; v_subtotal:=(result->'order'->'totals'->>'subtotal')::bigint;
 shipping:=CASE WHEN v_subtotal>=cfg.free_shipping_from THEN 0 ELSE cfg.shipping_fee END;
 gift:=CASE WHEN (result->'order'->'totals'->>'giftWrapFee')::bigint>0 THEN cfg.gift_fee ELSE 0 END;
 UPDATE public.orders SET shipping_fee=shipping,gift_wrap_fee=gift,final_total=v_subtotal+shipping+gift,
  expires_at=CASE WHEN payment_method='vietqr' THEN now()+make_interval(mins=>cfg.reservation_minutes) ELSE NULL END,is_test=cfg.sandbox WHERE id=oid RETURNING lookup_token INTO tok;
 result:=jsonb_set(result,'{order,totals}',jsonb_build_object('subtotal',v_subtotal,'shippingFee',shipping,'giftWrapFee',gift,'finalTotal',v_subtotal+shipping+gift));
 result:=jsonb_set(result,'{order}',(result->'order')||jsonb_build_object('lookupToken',tok,'isTest',cfg.sandbox));
 UPDATE public.checkout_requests SET response=result WHERE request_id=p_request_id;
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),oid,'order.created');
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.rpc_order_status(p_order_id text,p_status text,p_tracking text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; item record;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 SELECT * INTO ord FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn.'; END IF;
 IF ord.status='pending_payment' AND p_status='confirmed' AND ord.expires_at<=now() THEN RAISE EXCEPTION 'Đơn đã hết thời gian giữ hàng. Kiểm tra giao dịch rồi liên hệ khách để đặt lại; không xác nhận đơn hết hạn.'; END IF;
 IF p_status='shipping' AND length(trim(coalesce(p_tracking,ord.tracking_number,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Nhập mã vận đơn trước khi bàn giao vận chuyển.'; END IF;
 IF p_status=ord.status THEN RETURN jsonb_build_object('success',true); END IF;
 IF p_status IS NULL OR NOT (
  (ord.status='pending_payment' AND p_status IN ('confirmed','cancelled')) OR
  (ord.status='confirmed' AND p_status IN ('crafting_nfc','cancelled')) OR
  (ord.status='crafting_nfc' AND p_status IN ('shipping','cancelled')) OR
  (ord.status='shipping' AND p_status='completed')
 ) THEN RAISE EXCEPTION 'Không thể chuyển trạng thái đơn này.'; END IF;
 IF p_status='cancelled' THEN UPDATE public.memory_spaces SET admin_suspended=true WHERE order_id=p_order_id; END IF;
 IF p_status='cancelled' AND NOT ord.stock_released THEN
  FOR item IN SELECT product_id,size,sum(quantity)::integer AS qty FROM public.order_items WHERE order_id=p_order_id GROUP BY product_id,size ORDER BY product_id,size LOOP
   UPDATE public.checkout_variants SET stock=stock+item.qty WHERE product_id=item.product_id AND size=item.size;
  END LOOP;
 END IF;
 UPDATE public.orders SET status=p_status,updated_at=now(),stock_released=stock_released OR p_status='cancelled',
 payment_confirmed_at=CASE WHEN ord.status='pending_payment' AND p_status='confirmed' THEN now() ELSE payment_confirmed_at END,
 tracking_number=coalesce(nullif(trim(p_tracking),''),tracking_number) WHERE id=p_order_id;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),p_order_id,'order.status',jsonb_build_object('from',ord.status,'to',p_status));
 RETURN jsonb_build_object('success',true);
END $$;
CREATE OR REPLACE FUNCTION public.rpc_track_order(p_order_id text,p_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; items jsonb; timeline jsonb;
BEGIN
 SELECT * INTO ord FROM public.orders WHERE upper(id)=upper(trim(p_order_id)) AND (lookup_token=p_token OR (user_id=auth.uid() AND auth.uid() IS NOT NULL) OR public.is_admin());
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Không tìm thấy đơn hoặc mã tra cứu không đúng.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',product_id,'name',product_name,'price',unit_price,'size',size,'quantity',quantity,'image',image_url,'isGift',is_gift)),'[]') INTO items FROM public.order_items WHERE order_id=ord.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('status',CASE WHEN action='order.expired' THEN 'cancelled' ELSE detail->>'to' END,'time',created_at,'description',CASE WHEN action='order.expired' THEN 'Hết thời gian giữ hàng' ELSE 'Cập nhật trạng thái đơn hàng' END) ORDER BY created_at),'[]') INTO timeline FROM public.operation_audit WHERE resource_id=ord.id AND action IN ('order.status','order.expired');
 timeline:=jsonb_build_array(jsonb_build_object('status',CASE WHEN ord.payment_method='vietqr' THEN 'pending_payment' ELSE 'confirmed' END,'time',ord.created_at,'description','Đã tiếp nhận đơn hàng'))||timeline;
 RETURN jsonb_build_object('success',true,'order',jsonb_build_object('id',ord.id,'customerName',ord.customer_name,'phone',ord.phone,'address',ord.address,'status',ord.status,'paymentMethod',ord.payment_method,'createdAt',ord.created_at,'isTest',ord.is_test,'trackingNumber',ord.tracking_number,'expiresAt',ord.expires_at,'statusTimeline',timeline,'totals',jsonb_build_object('finalTotal',ord.final_total),'items',items));
END $$;
CREATE FUNCTION private.expire_orders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord record; item record; n integer:=0;
BEGIN
 FOR ord IN SELECT * FROM public.orders WHERE status='pending_payment' AND expires_at<now() ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  IF NOT ord.stock_released THEN
   FOR item IN SELECT product_id,size,sum(quantity)::integer qty FROM public.order_items WHERE order_id=ord.id GROUP BY product_id,size ORDER BY product_id,size LOOP
    UPDATE public.checkout_variants SET stock=stock+item.qty WHERE product_id=item.product_id AND size=item.size;
   END LOOP;
  END IF;
  UPDATE public.orders SET status='cancelled',stock_released=true,updated_at=now() WHERE id=ord.id;
  INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),ord.id,'order.expired'); n:=n+1;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_expire_orders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 RETURN private.expire_orders();
END $$;
REVOKE ALL ON FUNCTION private.expire_orders() FROM PUBLIC,anon,authenticated;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('emoria-expire-orders','* * * * *','SELECT private.expire_orders()');

-- Source: 20260916095740_claim_code_compatibility.sql
CREATE OR REPLACE FUNCTION public.rpc_claim_nfc_chip(p_tag_uid text,p_claim_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE mem public.memory_spaces; valid boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'message','Vui lòng đăng nhập để nhận quyền.'); END IF;
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid)) FOR UPDATE;
 IF NOT FOUND OR mem.admin_suspended THEN RETURN jsonb_build_object('success',false,'message','Kỷ vật không khả dụng.'); END IF;
 IF mem.owner_id=auth.uid() THEN RETURN jsonb_build_object('success',true,'message','Bạn đã là chủ sở hữu kỷ vật.'); END IF;
 IF mem.owner_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'message','Kỷ vật đã có chủ sở hữu.'); END IF;
 IF length(coalesce(p_claim_code,'')) BETWEEN 1 AND 128 AND mem.claim_code_hash IS NOT NULL THEN
  IF left(mem.claim_code_hash,2)='$2' THEN valid:=crypt(p_claim_code,mem.claim_code_hash)=mem.claim_code_hash;
  ELSE valid:=encode(digest(p_claim_code,'sha256'),'hex')=mem.claim_code_hash;
  END IF;
 END IF;
 IF NOT valid THEN RETURN jsonb_build_object('success',false,'message','Mã nhận quyền không chính xác.'); END IF;
 UPDATE public.memory_spaces SET owner_id=auth.uid(),claim_code_hash=NULL,version=version+1,updated_at=now() WHERE id=mem.id;
 RETURN jsonb_build_object('success',true,'message','Đã nhận quyền. Mở Studio để chuẩn bị món quà và đặt PIN người xem.');
END $$;
REVOKE ALL ON FUNCTION public.rpc_claim_nfc_chip(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_claim_nfc_chip(text,text) TO authenticated;

-- Source: 20260916102935_document_product_catalog.sql
ALTER TABLE public.checkout_products
 ADD COLUMN details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(details)='object'),
 ADD COLUMN units_per_item smallint NOT NULL DEFAULT 1 CHECK(units_per_item BETWEEN 1 AND 2);
ALTER TABLE public.order_items ADD COLUMN units_per_item smallint NOT NULL DEFAULT 1 CHECK(units_per_item BETWEEN 1 AND 2);

-- Snapshot the physical piece count at checkout; later catalog edits cannot change chip quotas.
CREATE FUNCTION private.snapshot_order_pieces() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT units_per_item INTO NEW.units_per_item FROM public.checkout_products WHERE id=NEW.product_id;
 NEW.units_per_item:=coalesce(NEW.units_per_item,1);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.snapshot_order_pieces() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER snapshot_order_pieces BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION private.snapshot_order_pieces();

CREATE OR REPLACE FUNCTION public.rpc_issue_chip(p_order_id text,p_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE tag text:='emo-'||replace(gen_random_uuid()::text,'-',''); code text:=encode(gen_random_bytes(18),'hex'); item public.order_items; n integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 PERFORM 1 FROM public.orders WHERE id=p_order_id AND status IN ('confirmed','crafting_nfc','shipping','completed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Đơn chưa đủ điều kiện cấp chip.'; END IF;
 SELECT * INTO item FROM public.order_items WHERE id=p_item_id AND order_id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Món hàng không thuộc đơn.'; END IF;
 SELECT count(*) INTO n FROM public.memory_spaces WHERE order_item_id=p_item_id OR (order_id=p_order_id AND order_item_id IS NULL AND jewelry_name=item.product_name);
 IF n>=item.quantity*item.units_per_item THEN RAISE EXCEPTION 'Đã cấp đủ chip cho món hàng này.'; END IF;
 INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,order_id,order_item_id,claim_code_hash,is_protected,pin_hash) VALUES(tag,item.product_name,'Kỷ niệm của bạn',p_order_id,p_item_id,crypt(code,gen_salt('bf',10)),true,crypt(encode(gen_random_bytes(12),'hex'),gen_salt('bf',10)));
 INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),tag,'chip.issued');
 RETURN jsonb_build_object('success',true,'tag',tag,'claim_code',code);
END $$;
REVOKE ALL ON FUNCTION public.rpc_issue_chip(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_issue_chip(text,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
