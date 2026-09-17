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

-- Source: 20260917000200_fix_memory_tap_count_and_order_tracking.sql
-- ==============================================================================
-- EMORIA LUXURY - FIX MEMORY TAP COUNT & ORDER TRACKING LOOKUP
-- Migration: 20260917000200_fix_memory_tap_count_and_order_tracking
-- Description: 
-- 1. Ghi nhận sự kiện mở kỷ vật vào nfc_tap_events để lượt mở thư tăng thật.
-- 2. Cho phép tra cứu đơn hàng trực tiếp bằng Mã Đơn Hàng (EMO-...) mà không
--    bắt buộc phải có UUID token bí mật.
-- ==============================================================================

-- 1. CẬP NHẬT get_memory_view_internal: TỰ ĐỘNG GHI NHẬN LƯỢT MỞ KỶ VẬT
CREATE OR REPLACE FUNCTION public.get_memory_view_internal(p_tag_uid text, p_grant_token uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mem RECORD;
  v_is_owner BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_has_valid_grant BOOLEAN := FALSE;
  v_can_see_private BOOLEAN := FALSE;
  v_media JSONB;
  v_guestbook JSONB;
  v_tap_count BIGINT;
BEGIN
  -- 1. Tìm memory space
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy kỷ vật mang mã chip ' || p_tag_uid);
  END IF;

  -- 2. Kiểm tra vai trò
  IF auth.uid() IS NOT NULL THEN
    v_is_owner := COALESCE(v_mem.owner_id = auth.uid(), FALSE);
    v_is_admin := public.is_admin();
  END IF;

  -- 3. Kiểm tra Access Grant Token
  IF p_grant_token IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id AND grant_token = p_grant_token AND expires_at > NOW()
    ) INTO v_has_valid_grant;
    v_is_owner := v_is_owner OR EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id AND grant_token = p_grant_token
        AND expires_at > NOW() AND grant_type = 'owner'
        AND (user_id IS NULL OR user_id = auth.uid())
    );
  END IF;

  -- 4. Kiểm tra trạng thái khả dụng
  IF NOT v_is_owner AND (
    v_mem.availability_status = 'suspended'
    OR (v_mem.availability_status = 'timed_lock' AND (v_mem.unlock_at IS NULL OR NOW() < v_mem.unlock_at))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ niệm hiện chưa khả dụng.',
      'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at));
  END IF;

  IF NOT v_mem.is_protected OR v_is_owner OR v_has_valid_grant THEN
    v_can_see_private := TRUE;
  END IF;

  -- 5. Lấy danh sách Media
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'url', url, 'type', type, 'caption', caption, 'order_index', order_index
  ) ORDER BY order_index ASC), '[]'::jsonb)
  INTO v_media
  FROM public.memory_media
  WHERE memory_id = v_mem.id AND (NOT is_private OR v_can_see_private);

  -- 6. Lấy danh sách Guestbook
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'author', author_name, 'relationship', relationship, 'message', message,
    'created_at', to_char(created_at, 'DD/MM/YYYY HH24:MI')
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_guestbook
  FROM public.guestbook_entries
  WHERE memory_id = v_mem.id AND NOT is_hidden;

  -- 7. GHI NHẬN SỰ KIỆN MỞ KỶ VẬT VÀ LẤY SỐ LƯỢT MỞ
  INSERT INTO public.nfc_tap_events (memory_id, device_type, tapped_at)
  VALUES (v_mem.id, 'web', NOW());

  SELECT COUNT(*) INTO v_tap_count FROM public.nfc_tap_events WHERE memory_id = v_mem.id;

  RETURN jsonb_build_object(
    'success', true,
    'tag_uid', v_mem.tag_uid,
    'jewelry_name', v_mem.jewelry_name,
    'title', v_mem.title,
    'date', v_mem.date,
    'quote', v_mem.quote,
    'author', v_mem.author_name,
    'recipient', v_mem.recipient_name,
    'audio_title', v_mem.audio_title,
    'audio_url', v_mem.audio_url,
    'is_protected', v_mem.is_protected,
    'is_unlocked', v_can_see_private,
    'letter', CASE WHEN v_can_see_private THEN v_mem.letter ELSE NULL END,
    'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at),
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'tap_count', v_tap_count,
    'media_gallery', v_media,
    'guestbook', v_guestbook
  );
END;
$function$;

-- 2. CẬP NHẬT rpc_track_order: HỖ TRỢ TRA CỨU BẰNG MÃ ĐƠN HÀNG (EMO-...)
-- Drop định nghĩa cũ (tham số UUID) để tránh xung đột function overload
DROP FUNCTION IF EXISTS public.rpc_track_order(text, uuid);
DROP FUNCTION IF EXISTS public.rpc_track_order(text, text);

CREATE OR REPLACE FUNCTION public.rpc_track_order(
  p_order_id text,
  p_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ord public.orders;
  items jsonb;
  timeline jsonb;
  v_token_uuid uuid := NULL;
  v_is_authorized boolean := false;
BEGIN
  IF p_order_id IS NULL OR trim(p_order_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Vui lòng nhập mã đơn hàng cần tra cứu.');
  END IF;

  -- Chuyển đổi an toàn p_token sang UUID nếu có dạng hợp lệ
  IF p_token IS NOT NULL AND trim(p_token) <> '' THEN
    BEGIN
      v_token_uuid := trim(p_token)::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_token_uuid := NULL;
    END;
  END IF;

  -- Tìm đơn hàng theo mã đơn (không phân biệt hoa thường)
  SELECT * INTO ord
  FROM public.orders
  WHERE upper(id) = upper(trim(p_order_id));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn hàng mang mã: ' || p_order_id);
  END IF;

  -- Kiểm tra quyền:
  -- Mã đơn hàng EMO- là chuỗi ngẫu nhiên 32 ký tự bảo mật cao (112 bits entropy, không thể đoán mò).
  -- Người sở hữu mã đơn hàng, hoặc người có mã token, hoặc số điện thoại, hoặc tài khoản sở hữu, hoặc admin đều được xem.
  v_is_authorized := (
    public.is_admin()
    OR (auth.uid() IS NOT NULL AND ord.user_id = auth.uid())
    OR (v_token_uuid IS NOT NULL AND ord.lookup_token = v_token_uuid)
    OR (p_token IS NOT NULL AND (
         regexp_replace(coalesce(ord.phone, ''), '\D', '', 'g') = regexp_replace(p_token, '\D', '', 'g')
         OR lower(trim(coalesce(ord.email, ''))) = lower(trim(p_token))
       ))
    -- Cho phép tra cứu bằng mã đơn hàng EMO-... (tối thiểu 8 ký tự)
    OR (length(trim(p_order_id)) >= 8)
  );

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn hoặc mã tra cứu không đúng.');
  END IF;

  -- Lấy danh sách sản phẩm trong đơn
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', product_id,
    'name', product_name,
    'price', unit_price,
    'size', size,
    'quantity', quantity,
    'image', image_url,
    'isGift', is_gift
  )), '[]'::jsonb)
  INTO items
  FROM public.order_items
  WHERE order_id = ord.id;

  -- Lấy dòng thời gian tiến độ đơn hàng
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'status', CASE WHEN action = 'order.expired' THEN 'cancelled' ELSE detail->>'to' END,
    'time', created_at,
    'description', CASE WHEN action = 'order.expired' THEN 'Hết thời gian giữ hàng' ELSE 'Cập nhật trạng thái đơn hàng' END
  ) ORDER BY created_at), '[]'::jsonb)
  INTO timeline
  FROM public.operation_audit
  WHERE resource_id = ord.id AND action IN ('order.status', 'order.expired');

  timeline := jsonb_build_array(jsonb_build_object(
    'status', CASE WHEN ord.payment_method = 'vietqr' THEN 'pending_payment' ELSE 'confirmed' END,
    'time', ord.created_at,
    'description', 'Đã tiếp nhận đơn hàng'
  )) || timeline;

  RETURN jsonb_build_object(
    'success', true,
    'order', jsonb_build_object(
      'id', ord.id,
      'customerName', ord.customer_name,
      'phone', ord.phone,
      'address', ord.address,
      'status', ord.status,
      'paymentMethod', ord.payment_method,
      'createdAt', ord.created_at,
      'isTest', ord.is_test,
      'trackingNumber', ord.tracking_number,
      'expiresAt', ord.expires_at,
      'statusTimeline', timeline,
      'totals', jsonb_build_object('finalTotal', ord.final_total),
      'items', items
    )
  );
END;
$$;

-- Cấp quyền gọi cho anon và authenticated
GRANT EXECUTE ON FUNCTION public.get_memory_view_internal(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_track_order(text, text) TO anon, authenticated;

-- Source: 20260917010000_order_tracking_and_shipping.sql
ALTER TABLE public.orders
 ADD COLUMN IF NOT EXISTS shipping_carrier text,
 ADD COLUMN IF NOT EXISTS delivery_estimate date,
 ADD COLUMN IF NOT EXISTS shipping_note text,
 ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
 ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_lookup_token_idx ON public.orders(lookup_token);

-- One signature for both older UUID-token clients and the current text input.
DROP FUNCTION IF EXISTS public.rpc_track_order(text,uuid);
CREATE OR REPLACE FUNCTION public.rpc_track_order(p_order_id text,p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; code text:=trim(coalesce(p_order_id,'')); secret text:=trim(coalesce(p_token,''));
 tok uuid; full_access boolean; timeline jsonb; result jsonb; items jsonb;
BEGIN
 IF code='' OR length(code)>150 OR length(secret)>150 THEN
  RETURN jsonb_build_object('success',false,'message','Nhập mã đơn EMO-… hoặc mã tra cứu riêng nhận được khi đặt hàng.');
 END IF;
 BEGIN tok:=code::uuid; EXCEPTION WHEN invalid_text_representation THEN tok:=NULL; END;
 IF tok IS NOT NULL THEN
  SELECT * INTO ord FROM public.orders WHERE lookup_token=tok;
 ELSE
  SELECT * INTO ord FROM public.orders WHERE upper(id)=upper(code);
 END IF;
 IF ord.id IS NULL THEN RETURN jsonb_build_object('success',false,'message','Không tìm thấy đơn. Hãy sao chép đầy đủ mã từ xác nhận đặt hàng.'); END IF;
 full_access:=coalesce(public.is_admin() OR (auth.uid() IS NOT NULL AND ord.user_id=auth.uid()) OR ord.lookup_token=tok,false);
 IF NOT full_access AND secret<>'' THEN
  full_access:=lower(secret)=ord.lookup_token::text
    OR (length(regexp_replace(secret,'\D','','g')) BETWEEN 9 AND 11
        AND regexp_replace(secret,'\D','','g')=regexp_replace(ord.phone,'\D','','g'));
  IF NOT coalesce(full_access,false) THEN RETURN jsonb_build_object('success',false,'message','Mã tra cứu riêng hoặc số điện thoại không đúng.'); END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'status',CASE WHEN action='order.expired' THEN 'cancelled' ELSE detail->>'to' END,
  'time',created_at,'description',CASE WHEN action='order.expired' THEN 'Hết thời gian giữ hàng'
    WHEN action='order.shipment' THEN 'Đã cập nhật thông tin vận chuyển'
    WHEN detail->>'to'='confirmed' THEN 'Đã xác nhận đơn hàng'
    WHEN detail->>'to'='crafting_nfc' THEN 'Đang chuẩn bị trang sức và NFC'
    WHEN detail->>'to'='shipping' THEN 'Đã bàn giao cho đơn vị vận chuyển'
    WHEN detail->>'to'='completed' THEN 'Đã giao hàng thành công'
    WHEN detail->>'to'='cancelled' THEN 'Đã hủy đơn hàng' ELSE 'Đã cập nhật đơn hàng' END
 ) ORDER BY created_at,id),'[]'::jsonb) INTO timeline FROM public.operation_audit
 WHERE resource_id=ord.id AND action IN ('order.status','order.expired','order.shipment');
 timeline:=jsonb_build_array(jsonb_build_object('status',CASE WHEN ord.payment_method='vietqr' THEN 'pending_payment' ELSE 'confirmed' END,'time',ord.created_at,'description','Đã tiếp nhận đơn hàng'))||timeline;
 result:=jsonb_build_object('id',ord.id,'status',ord.status,'createdAt',ord.created_at,'isTest',ord.is_test,
  'shippingCarrier',ord.shipping_carrier,'deliveryEstimate',ord.delivery_estimate,
  'shippedAt',ord.shipped_at,'deliveredAt',ord.delivered_at,'statusTimeline',timeline,
  'accessLevel',CASE WHEN full_access THEN 'full' ELSE 'summary' END,'items','[]'::jsonb);
 -- An order ID alone exposes progress only, never the recipient/address or private lookup code.
 IF full_access THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',product_id,'name',product_name,'price',unit_price,'size',size,'quantity',quantity,'image',image_url,'isGift',is_gift)),'[]'::jsonb)
   INTO items FROM public.order_items WHERE order_id=ord.id;
  result:=result||jsonb_build_object('customerName',ord.customer_name,'phone',ord.phone,'address',ord.address,'city',ord.city,
   'paymentMethod',ord.payment_method,'trackingNumber',ord.tracking_number,'shippingNote',ord.shipping_note,
   'expiresAt',ord.expires_at,'totals',jsonb_build_object('finalTotal',ord.final_total),'items',items);
 END IF;
 RETURN jsonb_build_object('success',true,'order',result);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_save_shipment(p_order_id text,p_carrier text,p_tracking text,
 p_estimate date DEFAULT NULL,p_note text DEFAULT '',p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; target text; carrier text:=trim(coalesce(p_carrier,'')); tracking text:=trim(coalesce(p_tracking,'')); v_note text:=trim(coalesce(p_note,''));
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 SELECT * INTO ord FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn.'; END IF;
 IF ord.status NOT IN ('confirmed','crafting_nfc','shipping') THEN RAISE EXCEPTION 'Chỉ cập nhật vận chuyển cho đơn đã xác nhận và chưa kết thúc.'; END IF;
 target:=coalesce(p_status,ord.status);
 IF target NOT IN (ord.status,'shipping','completed') THEN RAISE EXCEPTION 'Trạng thái vận chuyển không hợp lệ.'; END IF;
 IF length(carrier)>100 OR length(tracking)>120 OR length(v_note)>1000 THEN RAISE EXCEPTION 'Thông tin vận chuyển quá dài.'; END IF;
 IF target IN ('shipping','completed') AND (carrier='' OR tracking='') THEN RAISE EXCEPTION 'Nhập đơn vị vận chuyển và mã vận đơn.'; END IF;
 -- Existing order transition RPC keeps expiry, inventory and NFC cancellation rules intact.
 PERFORM public.rpc_order_status(p_order_id,target,tracking);
 UPDATE public.orders SET shipping_carrier=nullif(carrier,''),tracking_number=nullif(tracking,''),
  delivery_estimate=p_estimate,shipping_note=nullif(v_note,''),updated_at=now(),
  shipped_at=CASE WHEN target='shipping' THEN coalesce(shipped_at,now()) ELSE shipped_at END,
  delivered_at=CASE WHEN target='completed' THEN coalesce(delivered_at,now()) ELSE delivered_at END
 WHERE id=ord.id;
 IF ROW(ord.shipping_carrier,ord.tracking_number,ord.delivery_estimate,ord.shipping_note) IS DISTINCT FROM ROW(nullif(carrier,''),nullif(tracking,''),p_estimate,nullif(v_note,'')) THEN
  INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),ord.id,'order.shipment',jsonb_build_object('to',target));
 END IF;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_track_order(text,text),public.rpc_save_shipment(text,text,text,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_track_order(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_shipment(text,text,text,date,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Source: 20260917011000_verified_bank_payments.sql
ALTER TABLE public.orders
 ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','partial','paid','overpaid','review')),
 ADD COLUMN paid_amount bigint NOT NULL DEFAULT 0 CHECK(paid_amount>=0),
 ADD COLUMN paid_at timestamptz;
-- Preserve historical admin-confirmed transfers without claiming a new bank verification.
UPDATE public.orders SET payment_status='paid',paid_amount=final_total,paid_at=payment_confirmed_at
 WHERE payment_method='vietqr' AND payment_confirmed_at IS NOT NULL;
CREATE TABLE public.bank_payment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 provider_id bigint NOT NULL,
 is_test boolean NOT NULL,
 reference text NOT NULL DEFAULT '',
 account_number text NOT NULL,
 order_id text REFERENCES public.orders(id),
 amount bigint NOT NULL CHECK(amount>0),
 content text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 outcome text NOT NULL DEFAULT 'unmatched',
 UNIQUE(is_test,provider_id)
);
CREATE UNIQUE INDEX bank_payment_reference_unique ON public.bank_payment_events(is_test,account_number,reference) WHERE reference<>'';
ALTER TABLE public.bank_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_payment_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.bank_payment_events TO authenticated;
CREATE POLICY bank_payments_admin_read ON public.bank_payment_events FOR SELECT TO authenticated USING(public.is_admin());

CREATE FUNCTION public.rpc_receive_bank_payment(p_provider_id bigint,p_test boolean,p_reference text,p_account text,p_order_id text,p_amount bigint,p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE event_id bigint; ord public.orders; total bigint; v_outcome text; cfg public.store_settings;
BEGIN
 IF p_provider_id<=0 OR p_amount<=0 OR p_amount>1000000000000 OR length(p_content)>2000 OR length(p_reference)>200 OR length(p_account)>100 THEN RAISE EXCEPTION 'Invalid bank event'; END IF;
 -- Serialize repeated deliveries first, then concurrent payments on the same order.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_test::text||':'||p_provider_id::text,19));
 IF EXISTS(SELECT 1 FROM public.bank_payment_events WHERE is_test=p_test AND (provider_id=p_provider_id OR (p_reference<>'' AND account_number=p_account AND reference=p_reference))) THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 SELECT * INTO ord FROM public.orders WHERE upper(id)=upper(p_order_id) FOR UPDATE;
 INSERT INTO public.bank_payment_events(provider_id,is_test,reference,account_number,order_id,amount,content)
 VALUES(p_provider_id,p_test,p_reference,p_account,ord.id,p_amount,p_content) ON CONFLICT DO NOTHING RETURNING id INTO event_id;
 IF event_id IS NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 SELECT * INTO cfg FROM public.store_settings WHERE id=true;
 v_outcome:=CASE WHEN ord.id IS NULL THEN 'unmatched'
  WHEN ord.is_test<>p_test THEN 'mode_mismatch'
  WHEN ord.payment_method<>'vietqr' THEN 'not_transfer'
  WHEN regexp_replace(cfg.bank_account,'\s','','g')<>p_account OR cfg.bank_account='' THEN 'account_mismatch'
  ELSE 'received' END;
 IF v_outcome='received' THEN
  SELECT coalesce(sum(amount),0)+p_amount INTO total FROM public.bank_payment_events
   WHERE order_id=ord.id AND id<>event_id AND outcome IN ('received','cancelled_review');
  IF ord.status='cancelled' THEN v_outcome:='cancelled_review'; END IF;
  UPDATE public.orders SET paid_amount=total,
   payment_status=CASE WHEN ord.status='cancelled' THEN 'review' WHEN total<final_total THEN 'partial' WHEN total=final_total THEN 'paid' ELSE 'overpaid' END,
   paid_at=CASE WHEN total>=final_total THEN coalesce(paid_at,now()) ELSE paid_at END,
   updated_at=now() WHERE id=ord.id;
  INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(NULL,ord.id,'order.payment',jsonb_build_object('amount',p_amount,'total',total,'review',ord.status='cancelled'));
 END IF;
 UPDATE public.bank_payment_events SET outcome=v_outcome WHERE id=event_id;
 RETURN jsonb_build_object('success',true,'outcome',v_outcome);
END $$;
REVOKE ALL ON FUNCTION public.rpc_receive_bank_payment(bigint,boolean,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_receive_bank_payment(bigint,boolean,text,text,text,bigint,text) TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_order_status(p_order_id text,p_status text,p_tracking text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; item record;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 SELECT * INTO ord FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn.'; END IF;
 IF ord.status='pending_payment' AND p_status='confirmed' AND ord.expires_at<=now() AND ord.paid_amount=0 THEN RAISE EXCEPTION 'Đơn đã hết thời gian giữ hàng. Kiểm tra giao dịch rồi liên hệ khách để đặt lại; không xác nhận đơn hết hạn.'; END IF;
 IF ord.status='pending_payment' AND p_status='confirmed' AND (ord.payment_status NOT IN ('paid','overpaid') OR ord.paid_amount<ord.final_total) THEN RAISE EXCEPTION 'Chưa nhận đủ tiền. Chỉ duyệt sau khi giao dịch đã được xác minh.'; END IF;
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
 UPDATE public.orders SET payment_status=CASE WHEN p_status='cancelled' AND paid_amount>0 THEN 'review' ELSE payment_status END,status=p_status,updated_at=now(),stock_released=stock_released OR p_status='cancelled',
 payment_confirmed_at=CASE WHEN ord.status='pending_payment' AND p_status='confirmed' THEN now() ELSE payment_confirmed_at END,
 tracking_number=coalesce(nullif(trim(p_tracking),''),tracking_number) WHERE id=p_order_id;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),p_order_id,'order.status',jsonb_build_object('from',ord.status,'to',p_status));
 RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION private.expire_orders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord record; item record; n integer:=0;
BEGIN
 FOR ord IN SELECT * FROM public.orders WHERE status='pending_payment' AND paid_amount=0 AND expires_at<now() ORDER BY id FOR UPDATE SKIP LOCKED LOOP
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


CREATE OR REPLACE FUNCTION public.rpc_track_order(p_order_id text,p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; code text:=trim(coalesce(p_order_id,'')); secret text:=trim(coalesce(p_token,''));
 tok uuid; full_access boolean; timeline jsonb; result jsonb; items jsonb;
BEGIN
 IF code='' OR length(code)>150 OR length(secret)>150 THEN
  RETURN jsonb_build_object('success',false,'message','Nhập mã đơn EMO-… hoặc mã tra cứu riêng nhận được khi đặt hàng.');
 END IF;
 BEGIN tok:=code::uuid; EXCEPTION WHEN invalid_text_representation THEN tok:=NULL; END;
 IF tok IS NOT NULL THEN
  SELECT * INTO ord FROM public.orders WHERE lookup_token=tok;
 ELSE
  SELECT * INTO ord FROM public.orders WHERE upper(id)=upper(code);
 END IF;
 IF ord.id IS NULL THEN RETURN jsonb_build_object('success',false,'message','Không tìm thấy đơn. Hãy sao chép đầy đủ mã từ xác nhận đặt hàng.'); END IF;
 full_access:=coalesce(public.is_admin() OR (auth.uid() IS NOT NULL AND ord.user_id=auth.uid()) OR ord.lookup_token=tok,false);
 IF NOT full_access AND secret<>'' THEN
  full_access:=lower(secret)=ord.lookup_token::text
    OR (length(regexp_replace(secret,'\D','','g')) BETWEEN 9 AND 11
        AND regexp_replace(secret,'\D','','g')=regexp_replace(ord.phone,'\D','','g'));
  IF NOT coalesce(full_access,false) THEN RETURN jsonb_build_object('success',false,'message','Mã tra cứu riêng hoặc số điện thoại không đúng.'); END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'status',CASE WHEN action='order.expired' THEN 'cancelled' ELSE detail->>'to' END,
  'time',created_at,'description',CASE WHEN action='order.expired' THEN 'Hết thời gian giữ hàng'
    WHEN action='order.payment' THEN 'Đã ghi nhận giao dịch chuyển khoản'
    WHEN action='order.shipment' THEN 'Đã cập nhật thông tin vận chuyển'
    WHEN detail->>'to'='confirmed' THEN 'Đã xác nhận đơn hàng'
    WHEN detail->>'to'='crafting_nfc' THEN 'Đang chuẩn bị trang sức và NFC'
    WHEN detail->>'to'='shipping' THEN 'Đã bàn giao cho đơn vị vận chuyển'
    WHEN detail->>'to'='completed' THEN 'Đã giao hàng thành công'
    WHEN detail->>'to'='cancelled' THEN 'Đã hủy đơn hàng' ELSE 'Đã cập nhật đơn hàng' END
 ) ORDER BY created_at,id),'[]'::jsonb) INTO timeline FROM public.operation_audit
 WHERE resource_id=ord.id AND action IN ('order.status','order.expired','order.shipment','order.payment');
 timeline:=jsonb_build_array(jsonb_build_object('status',CASE WHEN ord.payment_method='vietqr' THEN 'pending_payment' ELSE 'confirmed' END,'time',ord.created_at,'description','Đã tiếp nhận đơn hàng'))||timeline;
 result:=jsonb_build_object('id',ord.id,'status',ord.status,'createdAt',ord.created_at,'isTest',ord.is_test,
  'shippingCarrier',ord.shipping_carrier,'deliveryEstimate',ord.delivery_estimate,
  'shippedAt',ord.shipped_at,'deliveredAt',ord.delivered_at,'statusTimeline',timeline,
  'accessLevel',CASE WHEN full_access THEN 'full' ELSE 'summary' END,'items','[]'::jsonb);
 -- An order ID alone exposes progress only, never the recipient/address or private lookup code.
 IF full_access THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',product_id,'name',product_name,'price',unit_price,'size',size,'quantity',quantity,'image',image_url,'isGift',is_gift)),'[]'::jsonb)
   INTO items FROM public.order_items WHERE order_id=ord.id;
  result:=result||jsonb_build_object('customerName',ord.customer_name,'phone',ord.phone,'address',ord.address,'city',ord.city,
   'paymentMethod',ord.payment_method,'paymentStatus',ord.payment_status,'paidAmount',ord.paid_amount,'paidAt',ord.paid_at,'trackingNumber',ord.tracking_number,'shippingNote',ord.shipping_note,
   'expiresAt',ord.expires_at,'totals',jsonb_build_object('finalTotal',ord.final_total),'items',items);
 END IF;
 RETURN jsonb_build_object('success',true,'order',result);
END $$;


NOTIFY pgrst,'reload schema';

-- Source: 20260918000000_sepay_payment_gateway.sql
-- 1. Schema updates for orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'sepay',
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS gateway_data jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cod', 'vietqr', 'sepay'));

-- 2. Gateway payment events table for audit & strict idempotency
CREATE TABLE IF NOT EXISTS public.gateway_payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL DEFAULT 'sepay',
  is_test boolean NOT NULL DEFAULT false,
  transaction_id text NOT NULL,
  order_id text REFERENCES public.orders(id),
  amount bigint NOT NULL CHECK(amount > 0),
  currency text NOT NULL DEFAULT 'VND',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, is_test, transaction_id)
);

ALTER TABLE public.gateway_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gateway_payment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.gateway_payment_events TO authenticated;
DROP POLICY IF EXISTS gateway_payments_admin_read ON public.gateway_payment_events;
CREATE POLICY gateway_payments_admin_read ON public.gateway_payment_events FOR SELECT TO authenticated USING(public.is_admin());

-- 3. Dedicated atomic gateway payment handler RPC (service_role only)
CREATE OR REPLACE FUNCTION public.rpc_receive_gateway_payment(
  p_provider text,
  p_is_test boolean,
  p_transaction_id text,
  p_order_id text,
  p_amount bigint,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  ord public.orders;
  v_event_id bigint;
BEGIN
  IF p_transaction_id IS NULL OR length(trim(p_transaction_id)) = 0 OR length(p_transaction_id) > 150 THEN
    RAISE EXCEPTION 'Invalid transaction id';
  END IF;
  IF p_amount <= 0 OR p_amount > 1000000000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  -- Serialize deliveries by provider, test mode, and transaction ID
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider || ':' || p_is_test::text || ':' || p_transaction_id, 29));

  -- Idempotent check
  IF EXISTS(
    SELECT 1 FROM public.gateway_payment_events
    WHERE provider = p_provider AND is_test = p_is_test AND transaction_id = p_transaction_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'message', 'Payment already processed');
  END IF;

  -- Lock order row
  SELECT * INTO ord FROM public.orders WHERE upper(id) = upper(trim(p_order_id)) FOR UPDATE;
  IF ord.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'order_not_found', 'message', 'Order not found');
  END IF;

  -- Verify test mode matches order environment
  IF ord.is_test <> p_is_test THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'mode_mismatch', 'message', 'Order mode mismatch');
  END IF;

  -- Verify amount: gateway payment must be at least final_total
  IF p_amount < ord.final_total THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'amount_insufficient', 'message', 'Amount less than final total');
  END IF;

  -- Record event
  INSERT INTO public.gateway_payment_events(provider, is_test, transaction_id, order_id, amount, payload)
  VALUES(p_provider, p_is_test, p_transaction_id, ord.id, p_amount, p_payload)
  ON CONFLICT (provider, is_test, transaction_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'message', 'Payment already processed');
  END IF;

  -- Update order payment state
  UPDATE public.orders
  SET
    payment_status = CASE WHEN ord.status = 'cancelled' THEN 'review' ELSE 'paid' END,
    paid_amount = p_amount,
    paid_at = coalesce(paid_at, now()),
    payment_provider = p_provider,
    payment_id = p_transaction_id,
    gateway_data = p_payload,
    updated_at = now()
  WHERE id = ord.id;

  -- Audit log
  INSERT INTO public.operation_audit(actor_id, resource_id, action, detail)
  VALUES(NULL, ord.id, 'order.payment', jsonb_build_object(
    'provider', p_provider,
    'transaction_id', p_transaction_id,
    'amount', p_amount,
    'is_test', p_is_test,
    'review', (ord.status = 'cancelled')
  ));

  RETURN jsonb_build_object('success', true, 'outcome', 'paid', 'order_id', ord.id);
END $$;

REVOKE ALL ON FUNCTION public.rpc_receive_gateway_payment(text,boolean,text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_receive_gateway_payment(text,boolean,text,text,bigint,jsonb) TO service_role;

-- 4. Update create_order_atomic_internal to support 'sepay'
CREATE OR REPLACE FUNCTION public.create_order_atomic_internal(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  previous public.checkout_requests;
  line jsonb;
  product public.checkout_products;
  qty integer;
  variant text;
  available integer;
  subtotal bigint := 0;
  gift bigint := 0;
  shipping bigint;
  method text := p_payload->>'paymentMethod';
  order_status text;
  order_id text := 'EMO-' || replace(gen_random_uuid()::text, '-', '')::varchar(28);
  normalized_items jsonb := '[]'::jsonb;
  response jsonb;
  phone text := regexp_replace(coalesce(p_payload->>'phone',''), '[^0-9]', '', 'g');
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing checkout request ID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO previous FROM public.checkout_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF previous.actor_id IS DISTINCT FROM auth.uid() OR previous.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Checkout request conflict';
    END IF;
    RETURN previous.response;
  END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid items'; END IF;
  IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50
    OR length(trim(coalesce(p_payload->>'customerName',''))) NOT BETWEEN 1 AND 200
    OR length(trim(coalesce(p_payload->>'address',''))) NOT BETWEEN 1 AND 1000
    OR length(phone) NOT BETWEEN 9 AND 11
    OR method IS NULL OR method NOT IN ('cod','vietqr','sepay') THEN
    RAISE EXCEPTION 'Invalid checkout details';
  END IF;
  IF coalesce((p_payload->>'hasGiftBox')::boolean,false) THEN gift := 35000; END IF;
  order_status := CASE WHEN method IN ('vietqr','sepay') THEN 'pending_payment' ELSE 'confirmed' END;

  FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'id', value->>'size'
  LOOP
    IF coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    qty := (line->>'quantity')::integer;
    variant := coalesce(nullif(trim(line->>'size'),''),'Tiêu chuẩn');
    SELECT * INTO product FROM public.checkout_products WHERE id = line->>'id' AND active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive product'; END IF;
    SELECT stock INTO available FROM public.checkout_variants WHERE product_id = product.id AND size = variant FOR UPDATE;
    IF NOT FOUND OR available < qty THEN RAISE EXCEPTION 'Variant unavailable or insufficient stock'; END IF;
    UPDATE public.checkout_variants SET stock = stock - qty WHERE product_id = product.id AND size = variant;
    subtotal := subtotal + product.price * qty;
    IF coalesce((line->>'isGift')::boolean,false) THEN gift := 35000; END IF;
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'id',product.id,'name',product.name,'price',product.price,'quantity',qty,
      'size',variant,'image',product.image_url,'isGift',coalesce((line->>'isGift')::boolean,false)));
  END LOOP;
  shipping := CASE WHEN subtotal >= 1000000 THEN 0 ELSE 30000 END;

  INSERT INTO public.orders(id,user_id,customer_name,phone,email,address,city,note,payment_method,status,subtotal,gift_wrap_fee,shipping_fee,final_total,payment_provider)
  VALUES(order_id,auth.uid(),trim(p_payload->>'customerName'),phone,p_payload->>'email',trim(p_payload->>'address'),
    coalesce(p_payload->>'city','Hồ Chí Minh'),p_payload->>'note',method,order_status,subtotal,gift,shipping,subtotal+gift+shipping,
    CASE WHEN method = 'sepay' THEN 'sepay' ELSE NULL END);

  INSERT INTO public.order_items(order_id,product_id,product_name,size,unit_price,quantity,is_gift,image_url)
  SELECT order_id, value->>'id',value->>'name',value->>'size',(value->>'price')::bigint,
    (value->>'quantity')::integer,(value->>'isGift')::boolean,value->>'image'
  FROM jsonb_array_elements(normalized_items);

  response := jsonb_build_object('success',true,'order',jsonb_build_object(
    'id',order_id,'customerName',trim(p_payload->>'customerName'),'phone',phone,'email',p_payload->>'email',
    'address',trim(p_payload->>'address'),'city',p_payload->>'city','note',p_payload->>'note',
    'paymentMethod',method,'status',order_status,'createdAt',now(),'items',normalized_items,
    'totals',jsonb_build_object('subtotal',subtotal,'giftWrapFee',gift,'shippingFee',shipping,'finalTotal',subtotal+gift+shipping),
    'statusTimeline',jsonb_build_array(jsonb_build_object('status',order_status,'time',now(),'description','Đơn hàng đã được tiếp nhận'))));

  INSERT INTO public.checkout_requests(request_id,actor_id,payload,response) VALUES(p_request_id,auth.uid(),p_payload,response);
  RETURN response;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic_internal(uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- 5. Update rpc_create_order to support 'sepay'
CREATE OR REPLACE FUNCTION public.rpc_create_order(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  cfg public.store_settings;
  result jsonb;
  oid text;
  shipping bigint;
  gift bigint;
  v_subtotal bigint;
  tok uuid;
  prior public.checkout_requests;
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
  IF p_payload->>'paymentMethod'='sepay' AND NOT cfg.transfer_enabled THEN RAISE EXCEPTION 'Thanh toán online chưa được bật.'; END IF;

  IF auth.uid() IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
    IF (SELECT count(*) FROM public.orders WHERE user_id=auth.uid() AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Bạn đã tạo nhiều đơn. Vui lòng thử lại sau.'; END IF;
  END IF;

  result:=public.create_order_atomic_internal(p_request_id,p_payload);
  oid:=result->'order'->>'id';
  v_subtotal:=(result->'order'->'totals'->>'subtotal')::bigint;
  shipping:=CASE WHEN v_subtotal>=cfg.free_shipping_from THEN 0 ELSE cfg.shipping_fee END;
  gift:=CASE WHEN (result->'order'->'totals'->>'giftWrapFee')::bigint>0 THEN cfg.gift_fee ELSE 0 END;

  UPDATE public.orders
  SET
    shipping_fee=shipping,
    gift_wrap_fee=gift,
    final_total=v_subtotal+shipping+gift,
    expires_at=CASE WHEN payment_method IN ('vietqr','sepay') THEN now()+make_interval(mins=>cfg.reservation_minutes) ELSE NULL END,
    is_test=cfg.sandbox
  WHERE id=oid
  RETURNING lookup_token INTO tok;

  result:=jsonb_set(result,'{order,totals}',jsonb_build_object('subtotal',v_subtotal,'shippingFee',shipping,'giftWrapFee',gift,'finalTotal',v_subtotal+shipping+gift));
  result:=jsonb_set(result,'{order}',(result->'order')||jsonb_build_object('lookupToken',tok,'isTest',cfg.sandbox));
  UPDATE public.checkout_requests SET response=result WHERE request_id=p_request_id;
  INSERT INTO public.operation_audit(actor_id,resource_id,action) VALUES(auth.uid(),oid,'order.created');
  RETURN result;
END $$;

-- 6. Update rpc_track_order to handle 'sepay' and expose gateway fields
CREATE OR REPLACE FUNCTION public.rpc_track_order(p_order_id text, p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  ord public.orders;
  code text:=trim(coalesce(p_order_id,''));
  secret text:=trim(coalesce(p_token,''));
  tok uuid;
  full_access boolean;
  timeline jsonb;
  result jsonb;
  items jsonb;
BEGIN
  IF code='' OR length(code)>150 OR length(secret)>150 THEN
    RETURN jsonb_build_object('success',false,'message','Nhập mã đơn EMO-… hoặc mã tra cứu riêng nhận được khi đặt hàng.');
  END IF;

  BEGIN tok:=code::uuid; EXCEPTION WHEN invalid_text_representation THEN tok:=NULL; END;
  IF tok IS NOT NULL THEN
    SELECT * INTO ord FROM public.orders WHERE lookup_token=tok;
  ELSE
    SELECT * INTO ord FROM public.orders WHERE upper(id)=upper(code);
  END IF;

  IF ord.id IS NULL THEN RETURN jsonb_build_object('success',false,'message','Không tìm thấy đơn. Hãy sao chép đầy đủ mã từ xác nhận đặt hàng.'); END IF;

  full_access:=coalesce(public.is_admin() OR (auth.uid() IS NOT NULL AND ord.user_id=auth.uid()) OR ord.lookup_token=tok,false);
  IF NOT full_access AND secret<>'' THEN
    full_access:=lower(secret)=ord.lookup_token::text
      OR (length(regexp_replace(secret,'\D','','g')) BETWEEN 9 AND 11
          AND regexp_replace(secret,'\D','','g')=regexp_replace(ord.phone,'\D','','g'));
    IF NOT coalesce(full_access,false) THEN RETURN jsonb_build_object('success',false,'message','Mã tra cứu riêng hoặc số điện thoại không đúng.'); END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'status',CASE WHEN action='order.expired' THEN 'cancelled' ELSE detail->>'to' END,
    'time',created_at,
    'description',CASE
      WHEN action='order.expired' THEN 'Hết thời gian giữ hàng'
      WHEN action='order.payment' THEN 'Đã nhận đủ tiền thanh toán'
      WHEN action='order.shipment' THEN 'Đã cập nhật thông tin vận chuyển'
      WHEN detail->>'to'='confirmed' THEN 'Đã xác nhận đơn hàng'
      WHEN detail->>'to'='crafting_nfc' THEN 'Đang chuẩn bị trang sức và NFC'
      WHEN detail->>'to'='shipping' THEN 'Đã bàn giao cho đơn vị vận chuyển'
      WHEN detail->>'to'='completed' THEN 'Đã giao hàng thành công'
      WHEN detail->>'to'='cancelled' THEN 'Đã hủy đơn hàng'
      ELSE 'Đã cập nhật đơn hàng' END
  ) ORDER BY created_at,id),'[]'::jsonb) INTO timeline
  FROM public.operation_audit
  WHERE resource_id=ord.id AND action IN ('order.status','order.expired','order.shipment','order.payment');

  timeline:=jsonb_build_array(jsonb_build_object(
    'status',CASE WHEN ord.payment_method IN ('vietqr','sepay') THEN 'pending_payment' ELSE 'confirmed' END,
    'time',ord.created_at,
    'description','Đã tiếp nhận đơn hàng'
  ))||timeline;

  result:=jsonb_build_object(
    'id',ord.id,
    'status',ord.status,
    'createdAt',ord.created_at,
    'isTest',ord.is_test,
    'shippingCarrier',ord.shipping_carrier,
    'deliveryEstimate',ord.delivery_estimate,
    'shippedAt',ord.shipped_at,
    'deliveredAt',ord.delivered_at,
    'statusTimeline',timeline,
    'accessLevel',CASE WHEN full_access THEN 'full' ELSE 'summary' END,
    'items','[]'::jsonb
  );

  IF full_access THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',product_id,'name',product_name,'price',unit_price,'size',size,'quantity',quantity,'image',image_url,'isGift',is_gift)),'[]'::jsonb)
      INTO items FROM public.order_items WHERE order_id=ord.id;
    result:=result||jsonb_build_object(
      'customerName',ord.customer_name,
      'phone',ord.phone,
      'address',ord.address,
      'city',ord.city,
      'paymentMethod',ord.payment_method,
      'paymentStatus',ord.payment_status,
      'paidAmount',ord.paid_amount,
      'paidAt',ord.paid_at,
      'paymentProvider',ord.payment_provider,
      'paymentId',ord.payment_id,
      'trackingNumber',ord.tracking_number,
      'shippingNote',ord.shipping_note,
      'expiresAt',ord.expires_at,
      'totals',jsonb_build_object('finalTotal',ord.final_total),
      'items',items
    );
  END IF;

  RETURN jsonb_build_object('success',true,'order',result);
END $$;

NOTIFY pgrst,'reload schema';

NOTIFY pgrst,'reload schema';
COMMIT;
