-- Additive validation: older rooms without decorations remain valid.
-- Layout travels with rooms_draft and is frozen by the existing publish RPC.
BEGIN;
CREATE OR REPLACE FUNCTION public.validate_house_decorations()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; d jsonb; photo jsonb; photo_limit integer; used_slots text[];
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(NEW.rooms_draft) LOOP
    IF r ? 'lighting' AND (jsonb_typeof(r->'lighting') IS DISTINCT FROM 'string' OR r->>'lighting' NOT IN ('day','sunset','night')) THEN
      RAISE EXCEPTION 'Ánh sáng phòng không hợp lệ' USING ERRCODE='22023';
    END IF;
    IF r ? 'decorations' THEN
      IF jsonb_typeof(r->'decorations') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Đồ trang trí phải là danh sách' USING ERRCODE='22023';
      END IF;
      IF jsonb_array_length(r->'decorations') > 3 THEN
        RAISE EXCEPTION 'Mỗi phòng có tối đa 3 vị trí trang trí' USING ERRCODE='22023';
      END IF;
      used_slots := '{}';
      FOR d IN SELECT value FROM jsonb_array_elements(r->'decorations') LOOP
        IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Đồ trang trí không hợp lệ' USING ERRCODE='22023';
        END IF;
        IF NOT (d ? 'slot' AND d ? 'item' AND d ? 'rotation')
           OR d->>'slot' IS NULL OR d->>'item' IS NULL
           OR d->>'slot' NOT IN ('left','table','right')
           OR d->>'item' NOT IN ('calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles')
           OR jsonb_typeof(d->'rotation') IS DISTINCT FROM 'number'
           OR d->>'rotation' NOT IN ('0','90','180','270')
           OR (d - ARRAY['slot','item','rotation','text','photos']::text[]) <> '{}'::jsonb THEN
          RAISE EXCEPTION 'Vị trí hoặc món đồ trang trí không hợp lệ' USING ERRCODE='22023';
        END IF;
        IF d->>'slot' = ANY(used_slots) THEN
          RAISE EXCEPTION 'Một vị trí chỉ đặt được một món đồ' USING ERRCODE='22023';
        END IF;
        used_slots := array_append(used_slots,d->>'slot');
        IF d ? 'text' AND (d->>'item' NOT IN ('calendar','nameplate') OR jsonb_typeof(d->'text') IS DISTINCT FROM 'string' OR length(d->>'text') > 80) THEN
          RAISE EXCEPTION 'Chữ trên đồ vật không hợp lệ (tối đa 80 ký tự)' USING ERRCODE='22023';
        END IF;
        IF d ? 'photos' THEN
          photo_limit := CASE d->>'item' WHEN 'frame' THEN 1 WHEN 'album' THEN 2 WHEN 'bunting' THEN 3 ELSE 0 END;
          IF jsonb_typeof(d->'photos') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Ảnh trên đồ vật phải là danh sách' USING ERRCODE='22023';
          END IF;
          IF photo_limit=0 OR jsonb_array_length(d->'photos')>photo_limit THEN
            RAISE EXCEPTION 'Số ảnh trên đồ vật không hợp lệ' USING ERRCODE='22023';
          END IF;
          FOR photo IN SELECT value FROM jsonb_array_elements(d->'photos') LOOP
            IF photo <> 'null'::jsonb AND (jsonb_typeof(photo) IS DISTINCT FROM 'string' OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(r->'memories','[]'::jsonb)) m WHERE m->'id'=photo
            )) THEN
              RAISE EXCEPTION 'Ảnh trên đồ vật phải thuộc căn phòng này' USING ERRCODE='22023';
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_house_decorations() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS memory_house_decorations_check ON public.memory_houses;
CREATE TRIGGER memory_house_decorations_check BEFORE INSERT OR UPDATE OF rooms_draft ON public.memory_houses
FOR EACH ROW EXECUTE FUNCTION public.validate_house_decorations();
COMMIT;
