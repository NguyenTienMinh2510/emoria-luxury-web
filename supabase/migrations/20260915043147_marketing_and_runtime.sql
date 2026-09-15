BEGIN;
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
COMMIT;
