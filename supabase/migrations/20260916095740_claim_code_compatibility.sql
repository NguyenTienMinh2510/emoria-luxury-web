BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_claim_nfc_chip(p_tag_uid text,p_claim_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE mem public.memory_spaces; valid boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'message','Vui lòng đăng nhập để nhận quyền.'); END IF;
 SELECT * INTO mem FROM public.memory_spaces WHERE tag_uid=lower(trim(p_tag_uid)) FOR UPDATE;
 IF NOT FOUND OR mem.admin_suspended THEN RETURN jsonb_build_object('success',false,'message','Kỷ vật không khả dụng.'); END IF;
 IF mem.owner_id=auth.uid() THEN RETURN jsonb_build_object('success',true,'message','Bạn đã là chủ sở hữu kỷ vật.'); END IF;
 IF mem.owner_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'message','Kỷ vật đã có chủ sở hữu.'); END IF;
 IF length(coalesce(p_claim_code,'')) BETWEEN 1 AND 128 AND mem.claim_code_hash IS NOT NULL THEN
  IF left(mem.claim_code_hash,2)='$2' THEN valid:=crypt(p_claim_code,mem.claim_code_hash)=mem.claim_code_hash;
  ELSE valid:=encode(digest(p_claim_code,'sha256'),'hex')=mem.claim_code_hash;
  END IF;
 END IF;
 IF NOT valid THEN RETURN jsonb_build_object('success',false,'message','Mã nhận quyền không chính xác.'); END IF;
 UPDATE public.memory_spaces SET owner_id=auth.uid(),claim_code_hash=NULL,version=version+1,updated_at=now() WHERE id=mem.id;
 RETURN jsonb_build_object('success',true,'message','Đã nhận quyền. Mở Studio để chuẩn bị món quà và đặt PIN người xem.');
END $$;
REVOKE ALL ON FUNCTION public.rpc_claim_nfc_chip(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_claim_nfc_chip(text,text) TO authenticated;
COMMIT;
