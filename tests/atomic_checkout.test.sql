-- Run only in a fresh isolated test DB after both migrations.
INSERT INTO public.checkout_variants(product_id,size,stock) VALUES ('emoria-pulse','Tiêu chuẩn',5);
SET ROLE anon;
DO $$
DECLARE
  payload jsonb := '{"customerName":"Test","phone":"0901234567","address":"Test address","paymentMethod":"vietqr","items":[{"id":"emoria-pulse","quantity":1,"price":1}]}';
  receipt jsonb;
BEGIN
  receipt := public.rpc_create_order('20000000-0000-0000-0000-000000000001',payload);
  IF receipt#>>'{order,totals,finalTotal}' <> '299000' OR receipt#>>'{order,status}' <> 'pending_payment' THEN
    RAISE EXCEPTION 'Server financials or payment status incorrect';
  END IF;
  IF public.rpc_create_order('20000000-0000-0000-0000-000000000001',payload) IS DISTINCT FROM receipt THEN
    RAISE EXCEPTION 'Retry must return same receipt';
  END IF;
  BEGIN
    PERFORM public.rpc_create_order('20000000-0000-0000-0000-000000000001',payload || '{"address":"changed"}');
    RAISE EXCEPTION 'TEST: modified retry accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.rpc_create_order('20000000-0000-0000-0000-000000000002',
      payload || '{"items":[{"id":"emoria-pulse","quantity":1},{"id":"unknown","quantity":1}]}');
    RAISE EXCEPTION 'TEST: invalid item accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.orders(id,customer_name,phone,address,subtotal,final_total)
      VALUES ('forged','Test','0901234567','Test',1,1);
    RAISE EXCEPTION 'TEST: direct insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.orders) <> 1 OR (SELECT count(*) FROM public.order_items) <> 1 THEN
    RAISE EXCEPTION 'Non-atomic or duplicate checkout';
  END IF;
  IF (SELECT stock FROM public.checkout_variants WHERE product_id='emoria-pulse') <> 4 THEN
    RAISE EXCEPTION 'Stock not rolled back on failure or deducted twice on retry';
  END IF;
END $$;
