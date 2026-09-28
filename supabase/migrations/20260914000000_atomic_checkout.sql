-- Upgrade migration. Apply after the initial schema; never reset existing data.
BEGIN;
CREATE TABLE public.checkout_products (
  id text PRIMARY KEY,
  name text NOT NULL,
  price bigint NOT NULL CHECK (price > 0),
  image_url text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.checkout_variants (
  product_id text REFERENCES public.checkout_products(id),
  size text NOT NULL,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  PRIMARY KEY (product_id, size)
);
ALTER TABLE public.checkout_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON public.checkout_products FOR SELECT TO anon, authenticated USING (active OR public.is_admin());
CREATE POLICY stock_read ON public.checkout_variants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY catalog_admin ON public.checkout_products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY stock_admin ON public.checkout_variants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.checkout_products, public.checkout_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.checkout_products, public.checkout_variants TO authenticated;

-- Prices mirror the current catalog. Stock is deliberately NOT invented.
INSERT INTO public.checkout_products (id,name,price,image_url) VALUES
('emoria-pulse','EMORIA PULSE',269000,'/assets/product_pulse.png'),
('emoria-horizon','EMORIA HORIZON',279000,'/assets/product_horizon.png'),
('emoria-halo','EMORIA HALO',229000,'/assets/product_halo.png'),
('emoria-lumen','EMORIA LUMEN',299000,'/assets/product_lumen.png'),
('emoria-solaris-keyring','EMORIA SOLARIS KEYRING',189000,'/assets/product_halo.png'),
('emoria-celestial-duo','EMORIA CELESTIAL DUO',349000,'/assets/summer_box.png');

CREATE TABLE public.checkout_requests (
  request_id uuid PRIMARY KEY,
  actor_id uuid,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_requests FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
REVOKE INSERT ON public.orders, public.order_items FROM anon, authenticated;

CREATE FUNCTION public.rpc_create_order(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
  -- Serialize retries, including anonymous requests. UUID is an unguessable receipt capability.
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
    OR method IS NULL OR method NOT IN ('cod','vietqr') THEN
    RAISE EXCEPTION 'Invalid checkout details';
  END IF;
  IF coalesce((p_payload->>'hasGiftBox')::boolean,false) THEN gift := 35000; END IF;
  order_status := CASE WHEN method = 'vietqr' THEN 'pending_payment' ELSE 'confirmed' END;
  -- Stable lock ordering prevents opposite cart orders from deadlocking stock rows.
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
  INSERT INTO public.orders(id,user_id,customer_name,phone,email,address,city,note,payment_method,status,subtotal,gift_wrap_fee,shipping_fee,final_total)
  VALUES(order_id,auth.uid(),trim(p_payload->>'customerName'),phone,p_payload->>'email',trim(p_payload->>'address'),
    coalesce(p_payload->>'city','Hồ Chí Minh'),p_payload->>'note',method,order_status,subtotal,gift,shipping,subtotal+gift+shipping);
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
REVOKE ALL ON FUNCTION public.rpc_create_order(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_order(uuid,jsonb) TO anon, authenticated;
COMMIT;
