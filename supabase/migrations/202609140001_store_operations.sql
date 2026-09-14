BEGIN;
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
DECLARE cfg public.store_settings; result jsonb; oid text; shipping bigint; gift bigint; subtotal bigint; tok uuid; prior public.checkout_requests;
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
 oid:=result->'order'->>'id'; subtotal:=(result->'order'->'totals'->>'subtotal')::bigint;
 shipping:=CASE WHEN subtotal>=cfg.free_shipping_from THEN 0 ELSE cfg.shipping_fee END;
 gift:=CASE WHEN (result->'order'->'totals'->>'giftWrapFee')::bigint>0 THEN cfg.gift_fee ELSE 0 END;
 UPDATE public.orders SET shipping_fee=shipping,gift_wrap_fee=gift,final_total=subtotal+shipping+gift,
  expires_at=CASE WHEN payment_method='vietqr' THEN now()+make_interval(mins=>cfg.reservation_minutes) ELSE NULL END,is_test=cfg.sandbox WHERE id=oid RETURNING lookup_token INTO tok;
 result:=jsonb_set(result,'{order,totals}',jsonb_build_object('subtotal',subtotal,'shippingFee',shipping,'giftWrapFee',gift,'finalTotal',subtotal+shipping+gift));
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
 SELECT * INTO ord FROM public.orders WHERE id=upper(trim(p_order_id)) AND (lookup_token=p_token OR (user_id=auth.uid() AND auth.uid() IS NOT NULL) OR public.is_admin());
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
COMMIT;
