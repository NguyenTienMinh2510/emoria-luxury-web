CREATE OR REPLACE FUNCTION public.rpc_track_order(p_order_id text,p_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ord public.orders; items jsonb;
BEGIN
 SELECT * INTO ord FROM public.orders WHERE upper(id)=upper(trim(p_order_id)) AND (lookup_token=p_token OR (user_id=auth.uid() AND auth.uid() IS NOT NULL) OR public.is_admin());
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Không tìm thấy đơn hoặc mã tra cứu không đúng.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',product_id,'name',product_name,'price',unit_price,'size',size,'quantity',quantity,'image',image_url,'isGift',is_gift)),'[]') INTO items FROM public.order_items WHERE order_id=ord.id;
 RETURN jsonb_build_object('success',true,'order',jsonb_build_object('id',ord.id,'customerName',ord.customer_name,'phone',ord.phone,'address',ord.address,'status',ord.status,'paymentMethod',ord.payment_method,'createdAt',ord.created_at,'isTest',ord.is_test,'trackingNumber',ord.tracking_number,'totals',jsonb_build_object('finalTotal',ord.final_total),'items',items));
END $$;

