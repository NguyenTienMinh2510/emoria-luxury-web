-- ============================================================================
-- EMORIA EVENT STUDIOS - FREEFORM HOUSE DECORATIONS
-- Migration: 20260929190000_freeform_house_decorations.sql
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_house_decorations()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE
  r jsonb;
  d jsonb;
  photo jsonb;
  photo_limit integer;
  used_slots text[];
  used_ids text[];
  inst_id text;
  parent_id text;
  parent_item jsonb;
  p_x numeric;
  p_y numeric;
  p_z numeric;
  rot_val numeric;
  scale_val numeric;
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(NEW.rooms_draft) LOOP
    IF r ? 'lighting' AND (jsonb_typeof(r->'lighting') IS DISTINCT FROM 'string' OR r->>'lighting' NOT IN ('day','sunset','night')) THEN
      RAISE EXCEPTION 'Ánh sáng phòng không hợp lệ' USING ERRCODE='22023';
    END IF;

    -- Journey letter validation
    IF r ? 'journey_letter' THEN
      IF jsonb_typeof(r->'journey_letter') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Thư hành trình không hợp lệ' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'title' AND (jsonb_typeof(r->'journey_letter'->'title') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'title') > 120) THEN
        RAISE EXCEPTION 'Tiêu đề thư tối đa 120 ký tự' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'content' AND (jsonb_typeof(r->'journey_letter'->'content') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'content') > 1500) THEN
        RAISE EXCEPTION 'Nội dung thư tối đa 1500 ký tự' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'author' AND (jsonb_typeof(r->'journey_letter'->'author') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'author') > 80) THEN
        RAISE EXCEPTION 'Tên người gửi thư tối đa 80 ký tự' USING ERRCODE='22023';
      END IF;
      IF r->'journey_letter' ? 'date' AND (jsonb_typeof(r->'journey_letter'->'date') IS DISTINCT FROM 'string' OR length(r->'journey_letter'->>'date') > 40) THEN
        RAISE EXCEPTION 'Ngày thư tối đa 40 ký tự' USING ERRCODE='22023';
      END IF;
    END IF;

    -- Freeform and legacy decorations validation
    IF r ? 'decorations' THEN
      IF jsonb_typeof(r->'decorations') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Đồ trang trí phải là danh sách' USING ERRCODE='22023';
      END IF;
      -- Up to 30 items per room (freeform creative placement)
      IF jsonb_array_length(r->'decorations') > 30 THEN
        RAISE EXCEPTION 'Mỗi phòng có tối đa 30 đồ trang trí' USING ERRCODE='22023';
      END IF;

      used_slots := '{}';
      used_ids := '{}';

      FOR d IN SELECT value FROM jsonb_array_elements(r->'decorations') LOOP
        IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Đồ trang trí không hợp lệ' USING ERRCODE='22023';
        END IF;

        -- Check item identity
        IF NOT (d ? 'item') OR d->>'item' IS NULL
           OR d->>'item' NOT IN ('calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles') THEN
          RAISE EXCEPTION 'Món đồ trang trí không hợp lệ' USING ERRCODE='22023';
        END IF;

        -- Disallow arbitrary extra keys
        IF (d - ARRAY['id','slot','item','surface','position','rotation','scale','parent_id','text','photos']::text[]) <> '{}'::jsonb THEN
          RAISE EXCEPTION 'Thuộc tính đồ trang trí chứa trường không hợp lệ' USING ERRCODE='22023';
        END IF;

        -- Legacy slot format validation
        IF d ? 'slot' AND (NOT (d ? 'id') OR d ? 'slot') THEN
          IF d->>'slot' IS NOT NULL AND d->>'slot' NOT IN ('left','table','right') THEN
            RAISE EXCEPTION 'Vị trí slot không hợp lệ' USING ERRCODE='22023';
          END IF;
          -- Only enforce single item per slot if slot is uniquely set without freeform coordinates
          IF d->>'slot' IS NOT NULL AND NOT (d ? 'position') THEN
            IF d->>'slot' = ANY(used_slots) THEN
              RAISE EXCEPTION 'Một vị trí chỉ đặt được một món đồ' USING ERRCODE='22023';
            END IF;
            used_slots := array_append(used_slots, d->>'slot');
          END IF;
        END IF;

        -- Instance ID validation
        IF d ? 'id' THEN
          inst_id := trim(d->>'id');
          IF length(inst_id) < 1 OR length(inst_id) > 64 THEN
            RAISE EXCEPTION 'Mã định danh đồ trang trí không hợp lệ' USING ERRCODE='22023';
          END IF;
          IF inst_id = ANY(used_ids) THEN
            RAISE EXCEPTION 'Trùng lặp mã định danh đồ trang trí' USING ERRCODE='22023';
          END IF;
          used_ids := array_append(used_ids, inst_id);
        END IF;

        -- Surface validation
        IF d ? 'surface' AND d->>'surface' IS NOT NULL THEN
          IF d->>'surface' NOT IN ('floor','wall','table','shelf','ceiling') THEN
            RAISE EXCEPTION 'Bề mặt đặt đồ không hợp lệ' USING ERRCODE='22023';
          END IF;
        END IF;

        -- Position coordinates validation: [x, y, z] bounded to room bounds
        IF d ? 'position' THEN
          IF jsonb_typeof(d->'position') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'position') <> 3 THEN
            RAISE EXCEPTION 'Tọa độ vị trí phải là mảng 3 số [x, y, z]' USING ERRCODE='22023';
          END IF;
          BEGIN
            p_x := (d->'position'->>0)::numeric;
            p_y := (d->'position'->>1)::numeric;
            p_z := (d->'position'->>2)::numeric;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Tọa độ vị trí không hợp lệ' USING ERRCODE='22023';
          END;
          IF p_x < -10 OR p_x > 10 OR p_y < -1 OR p_y > 10 OR p_z < -10 OR p_z > 10 THEN
            RAISE EXCEPTION 'Vị trí đồ trang trí vượt quá giới hạn căn phòng' USING ERRCODE='22023';
          END IF;
        END IF;

        -- Rotation validation (degrees or yaw)
        IF d ? 'rotation' THEN
          IF jsonb_typeof(d->'rotation') = 'number' THEN
            rot_val := (d->>'rotation')::numeric;
            -- Allowed numeric yaw
          ELSIF jsonb_typeof(d->'rotation') = 'array' THEN
            IF jsonb_array_length(d->'rotation') <> 3 THEN
              RAISE EXCEPTION 'Góc xoay phải là mảng 3 trục' USING ERRCODE='22023';
            END IF;
          ELSE
            RAISE EXCEPTION 'Góc xoay không hợp lệ' USING ERRCODE='22023';
          END IF;
        END IF;

        -- Scale validation (0.3 to 3.0)
        IF d ? 'scale' THEN
          IF jsonb_typeof(d->'scale') = 'number' THEN
            scale_val := (d->>'scale')::numeric;
            IF scale_val < 0.3 OR scale_val > 3.0 THEN
              RAISE EXCEPTION 'Tỷ lệ thu phóng phải nằm trong khoảng 0.3 đến 3.0' USING ERRCODE='22023';
            END IF;
          ELSIF jsonb_typeof(d->'scale') = 'array' THEN
            IF jsonb_array_length(d->'scale') <> 3 THEN
              RAISE EXCEPTION 'Tỷ lệ thu phóng mảng phải gồm 3 trục' USING ERRCODE='22023';
            END IF;
          ELSE
            RAISE EXCEPTION 'Tỷ lệ thu phóng không hợp lệ' USING ERRCODE='22023';
          END IF;
        END IF;

        -- Parent ID validation
        IF d ? 'parent_id' AND d->>'parent_id' IS NOT NULL AND length(trim(d->>'parent_id')) > 0 THEN
          parent_id := trim(d->>'parent_id');
          IF d ? 'id' AND parent_id = d->>'id' THEN
            RAISE EXCEPTION 'Đồ trang trí không thể làm vật đỡ cho chính nó' USING ERRCODE='22023';
          END IF;
        END IF;

        -- Text validation on calendar and nameplate
        IF d ? 'text' AND (d->>'item' NOT IN ('calendar','nameplate') OR jsonb_typeof(d->'text') IS DISTINCT FROM 'string' OR length(d->>'text') > 80) THEN
          RAISE EXCEPTION 'Chữ trên đồ vật không hợp lệ (tối đa 80 ký tự)' USING ERRCODE='22023';
        END IF;

        -- Photo attachments validation
        IF d ? 'photos' THEN
          photo_limit := CASE d->>'item' WHEN 'frame' THEN 1 WHEN 'album' THEN 2 WHEN 'bunting' THEN 3 ELSE 0 END;
          IF jsonb_typeof(d->'photos') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Ảnh trên đồ vật phải là danh sách' USING ERRCODE='22023';
          END IF;
          IF photo_limit = 0 OR jsonb_array_length(d->'photos') > photo_limit THEN
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

REVOKE ALL ON FUNCTION public.validate_house_decorations() FROM PUBLIC, anon, authenticated;

COMMIT;
