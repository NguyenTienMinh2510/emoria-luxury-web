BEGIN;

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
COMMIT;
