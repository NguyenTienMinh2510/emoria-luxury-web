BEGIN;
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
COMMIT;
