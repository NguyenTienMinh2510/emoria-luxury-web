BEGIN;
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
COMMIT;
