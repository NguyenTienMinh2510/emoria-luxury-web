BEGIN;
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
COMMIT;
