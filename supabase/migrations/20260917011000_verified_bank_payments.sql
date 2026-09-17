BEGIN;
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
COMMIT;
