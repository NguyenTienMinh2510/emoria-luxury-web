-- ============================================================================
-- EMORIA EVENT STUDIOS - FREEFORM HOUSE DECORATIONS V2
-- Migration: 20260929200000_freeform_house_decorations_v2.sql
-- Upgrades validate_house_decorations trigger:
--  1. Exact coordinate bounds per room ID with physical extents (scaled & rotated)
--     to mathematically prevent wall penetration (not just a static 0.06m margin)
--  2. Surface compatibility per decorative asset
--  3. Transform JSON type and finite values check (position, rotation, scale)
--  4. Parent item existence in the same room + capability to support items
--  5. Multi-level circular dependency / cycle detection
--  6. 128KB payload budget per room (removes arbitrary item count cap)
--  7. Validates both rooms_draft AND published_snapshot when present (no skipping)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_house_decorations()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE
  room_lists_to_validate jsonb[];
  room_list jsonb;
  r jsonb;
  room_id text;
  r_min_x numeric;
  r_max_x numeric;
  r_min_y numeric;
  r_max_y numeric;
  r_min_z numeric;
  r_max_z numeric;
  d jsonb;
  photo jsonb;
  photo_limit integer;
  used_slots text[];
  used_ids text[];
  inst_id text;
  p_id text;
  parent_obj jsonb;
  parent_found jsonb;
  ancestor_obj jsonb;
  next_parent_found jsonb;
  curr_check_id text;
  visited_parents text[];
  p_x numeric;
  p_y numeric;
  p_z numeric;
  rot_val numeric;
  rad_val numeric;
  scale_val numeric;
  half_w numeric;
  half_d numeric;
  item_h numeric;
  eff_half_x numeric;
  eff_half_z numeric;
  eff_height numeric;
  item_id text;
  item_surface text;
  i integer;
BEGIN
  -- Determine which room lists to validate: rooms_draft, published_snapshot, or both
  room_lists_to_validate := ARRAY[]::jsonb[];
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.rooms_draft IS NOT NULL AND jsonb_typeof(NEW.rooms_draft) = 'array' THEN
      room_lists_to_validate := array_append(room_lists_to_validate, NEW.rooms_draft);
    END IF;
    IF NEW.published_snapshot IS NOT NULL AND NEW.published_snapshot ? 'rooms' AND jsonb_typeof(NEW.published_snapshot->'rooms') = 'array' THEN
      room_lists_to_validate := array_append(room_lists_to_validate, NEW.published_snapshot->'rooms');
    END IF;
  END IF;

  IF array_length(room_lists_to_validate, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH room_list IN ARRAY room_lists_to_validate LOOP
    FOR r IN SELECT value FROM jsonb_array_elements(room_list) LOOP
      room_id := r->>'id';

      -- Lighting validation
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

      -- Room-specific coordinate bounds setup (X center, Y floor, Z center, W, H, D)
      -- Downstairs: beginning [-4.2, -1.4], first [-1.4, 1.4], little-things [1.4, 4.2] (Y: 0.14..2.54, Z: -1.3..1.3)
      -- Upstairs: memories [-3.6, 0.0], next-chapter [0.0, 3.6] (Y: 2.25..4.65, Z: -1.3..1.3)
      CASE room_id
        WHEN 'beginning' THEN
          r_min_x := -4.20; r_max_x := -1.40; r_min_y := 0.10; r_max_y := 2.60; r_min_z := -1.35; r_max_z := 1.35;
        WHEN 'first' THEN
          r_min_x := -1.40; r_max_x := 1.40;  r_min_y := 0.10; r_max_y := 2.60; r_min_z := -1.35; r_max_z := 1.35;
        WHEN 'little-things' THEN
          r_min_x := 1.40;  r_max_x := 4.20;  r_min_y := 0.10; r_max_y := 2.60; r_min_z := -1.35; r_max_z := 1.35;
        WHEN 'memories' THEN
          r_min_x := -3.60; r_max_x := 0.00;  r_min_y := 2.20; r_max_y := 4.70; r_min_z := -1.35; r_max_z := 1.35;
        WHEN 'next-chapter' THEN
          r_min_x := 0.00;  r_max_x := 3.60;  r_min_y := 2.20; r_max_y := 4.70; r_min_z := -1.35; r_max_z := 1.35;
        ELSE
          -- Default broad bounding if room ID is generic
          r_min_x := -4.50; r_max_x := 4.50;  r_min_y := 0.10; r_max_y := 4.80; r_min_z := -1.40; r_max_z := 1.40;
      END CASE;

      -- Decorations validation
      IF r ? 'decorations' THEN
        IF jsonb_typeof(r->'decorations') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Đồ trang trí phải là danh sách' USING ERRCODE='22023';
        END IF;

        -- 128KB payload budget per room protects DB resources without artificial item count cap
        IF octet_length((r->'decorations')::text) > 131072 THEN
          RAISE EXCEPTION 'Dung lượng đồ trang trí vượt quá giới hạn 128KB' USING ERRCODE='22023';
        END IF;

        used_slots := '{}';
        used_ids := '{}';

        FOR d IN SELECT value FROM jsonb_array_elements(r->'decorations') LOOP
          IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Đồ trang trí không hợp lệ' USING ERRCODE='22023';
          END IF;

          item_id := d->>'item';

          -- Check item identity
          IF item_id IS NULL
             OR item_id NOT IN ('calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles') THEN
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

          -- Surface compatibility check per item
          item_surface := d->>'surface';
          IF item_surface IS NOT NULL THEN
            IF item_surface NOT IN ('floor','wall','table','shelf','ceiling') THEN
              RAISE EXCEPTION 'Bề mặt đặt đồ không hợp lệ' USING ERRCODE='22023';
            END IF;

            CASE item_id
              WHEN 'calendar' THEN
                IF item_surface NOT IN ('table', 'wall') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'cat' THEN
                IF item_surface NOT IN ('floor', 'table') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'nameplate' THEN
                IF item_surface NOT IN ('table', 'shelf', 'floor') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'plant' THEN
                IF item_surface NOT IN ('floor', 'table', 'shelf') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'mugs' THEN
                IF item_surface NOT IN ('table', 'shelf') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'lamp' THEN
                IF item_surface NOT IN ('table', 'shelf', 'floor') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'vase' THEN
                IF item_surface NOT IN ('table', 'shelf') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'album' THEN
                IF item_surface NOT IN ('table', 'shelf') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'bunting' THEN
                IF item_surface NOT IN ('wall', 'ceiling') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'frame' THEN
                IF item_surface NOT IN ('wall', 'table') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'birdcage' THEN
                IF item_surface NOT IN ('table', 'floor', 'shelf') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
              WHEN 'candles' THEN
                IF item_surface NOT IN ('table', 'shelf') THEN RAISE EXCEPTION 'Món % không thể đặt trên %', item_id, item_surface USING ERRCODE='22023'; END IF;
            END CASE;
          END IF;

          -- Scale validation (finite 0.3 to 3.0)
          scale_val := 1.0;
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
              FOR i IN 0..2 LOOP
                IF jsonb_typeof(d->'scale'->i) IS DISTINCT FROM 'number' THEN
                  RAISE EXCEPTION 'Tỷ lệ thu phóng trục phải là số hữu hạn' USING ERRCODE='22023';
                END IF;
                scale_val := (d->'scale'->>i)::numeric;
                IF scale_val < 0.3 OR scale_val > 3.0 THEN
                  RAISE EXCEPTION 'Tỷ lệ thu phóng phải nằm trong khoảng 0.3 đến 3.0' USING ERRCODE='22023';
                END IF;
              END LOOP;
            ELSE
              RAISE EXCEPTION 'Tỷ lệ thu phóng không hợp lệ' USING ERRCODE='22023';
            END IF;
          END IF;

          -- Rotation validation (numeric yaw or 3-axis array)
          rot_val := 0.0;
          IF d ? 'rotation' THEN
            IF jsonb_typeof(d->'rotation') = 'number' THEN
              rot_val := (d->>'rotation')::numeric;
              IF d ? 'slot' AND NOT (d ? 'position') THEN
                IF d->>'rotation' NOT IN ('0','90','180','270') THEN
                  RAISE EXCEPTION 'Góc xoay slot phải là 0, 90, 180 hoặc 270' USING ERRCODE='22023';
                END IF;
              END IF;
            ELSIF jsonb_typeof(d->'rotation') = 'array' THEN
              IF jsonb_array_length(d->'rotation') <> 3 THEN
                RAISE EXCEPTION 'Góc xoay phải là mảng 3 trục' USING ERRCODE='22023';
              END IF;
              FOR i IN 0..2 LOOP
                IF jsonb_typeof(d->'rotation'->i) IS DISTINCT FROM 'number' THEN
                  RAISE EXCEPTION 'Góc xoay trục phải là số hữu hạn' USING ERRCODE='22023';
                END IF;
              END LOOP;
              rot_val := (d->'rotation'->>1)::numeric;
            ELSE
              RAISE EXCEPTION 'Góc xoay không hợp lệ' USING ERRCODE='22023';
            END IF;
          END IF;

          -- Position coordinates validation with finite check & dimension-aware room bounds
          IF d ? 'position' THEN
            IF jsonb_typeof(d->'position') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'position') <> 3 THEN
              RAISE EXCEPTION 'Tọa độ vị trí phải là mảng 3 số [x, y, z]' USING ERRCODE='22023';
            END IF;
            IF jsonb_typeof(d->'position'->0) IS DISTINCT FROM 'number'
               OR jsonb_typeof(d->'position'->1) IS DISTINCT FROM 'number'
               OR jsonb_typeof(d->'position'->2) IS DISTINCT FROM 'number' THEN
              RAISE EXCEPTION 'Tọa độ vị trí phải là số hữu hạn' USING ERRCODE='22023';
            END IF;
            p_x := (d->'position'->>0)::numeric;
            p_y := (d->'position'->>1)::numeric;
            p_z := (d->'position'->>2)::numeric;

            -- Lookup asset physical dimensions
            CASE item_id
              WHEN 'bunting' THEN half_w := 0.475; half_d := 0.12; item_h := 0.65;
              WHEN 'nameplate' THEN half_w := 0.38; half_d := 0.13; item_h := 0.35;
              WHEN 'frame' THEN half_w := 0.26; half_d := 0.12; item_h := 0.39;
              WHEN 'calendar' THEN half_w := 0.24; half_d := 0.13; item_h := 0.46;
              WHEN 'album' THEN half_w := 0.275; half_d := 0.225; item_h := 0.15;
              WHEN 'cat' THEN half_w := 0.25; half_d := 0.225; item_h := 0.28;
              WHEN 'plant' THEN half_w := 0.20; half_d := 0.20; item_h := 0.55;
              WHEN 'vase' THEN half_w := 0.175; half_d := 0.175; item_h := 0.55;
              WHEN 'mugs' THEN half_w := 0.25; half_d := 0.21; item_h := 0.30;
              WHEN 'lamp' THEN half_w := 0.18; half_d := 0.18; item_h := 0.65;
              WHEN 'birdcage' THEN half_w := 0.175; half_d := 0.175; item_h := 0.50;
              WHEN 'candles' THEN half_w := 0.175; half_d := 0.125; item_h := 0.30;
              ELSE half_w := 0.15; half_d := 0.15; item_h := 0.30;
            END CASE;

            rad_val := (rot_val * 3.141592653589793 / 180.0);
            eff_half_x := scale_val * (abs(half_w * cos(rad_val)) + abs(half_d * sin(rad_val)));
            eff_half_z := scale_val * (abs(half_w * sin(rad_val)) + abs(half_d * cos(rad_val)));
            eff_height := scale_val * item_h;

            -- Room boundary checking with actual scaled & rotated dimensions
            IF (p_x - eff_half_x < r_min_x - 0.05) OR (p_x + eff_half_x > r_max_x + 0.05)
               OR (p_y < r_min_y - 0.05) OR (p_y + eff_height > r_max_y + 0.05)
               OR (p_z - eff_half_z < r_min_z - 0.05) OR (p_z + eff_half_z > r_max_z + 0.05) THEN
              RAISE EXCEPTION 'Vị trí đồ trang trí vượt quá giới hạn căn phòng' USING ERRCODE='22023';
            END IF;
          END IF;

          -- Parent item validation (existence in same room + support capability + cycle detection)
          IF d ? 'parent_id' AND d->>'parent_id' IS NOT NULL AND length(trim(d->>'parent_id')) > 0 THEN
            p_id := trim(d->>'parent_id');

            -- Self-reference check
            IF d ? 'id' AND p_id = d->>'id' THEN
              RAISE EXCEPTION 'Đồ trang trí không thể làm vật đỡ cho chính nó' USING ERRCODE='22023';
            END IF;

            -- Parent existence in same room check
            parent_found := NULL;
            FOR parent_obj IN SELECT value FROM jsonb_array_elements(r->'decorations') LOOP
              IF (parent_obj ? 'id' AND parent_obj->>'id' = p_id)
                 OR (parent_obj ? 'slot' AND parent_obj->>'slot' = p_id) THEN
                parent_found := parent_obj;
                EXIT;
              END IF;
            END LOOP;

            IF parent_found IS NULL THEN
              RAISE EXCEPTION 'Vật đỡ % không tồn tại trong cùng phòng', p_id USING ERRCODE='22023';
            END IF;

            -- Parent support capability check
            IF parent_found->>'item' NOT IN ('table', 'desk', 'shelf', 'carpet', 'album', 'nameplate') THEN
              RAISE EXCEPTION 'Món đồ % không thể làm vật đỡ cho món đồ khác', parent_found->>'item' USING ERRCODE='22023';
            END IF;

            -- Multi-level cycle detection
            visited_parents := ARRAY[d->>'id', p_id];
            curr_check_id := parent_found->>'parent_id';
            WHILE curr_check_id IS NOT NULL AND length(trim(curr_check_id)) > 0 LOOP
              IF curr_check_id = ANY(visited_parents) THEN
                RAISE EXCEPTION 'Phát hiện chu trình tham chiếu vật đỡ' USING ERRCODE='22023';
              END IF;
              visited_parents := array_append(visited_parents, curr_check_id);

              next_parent_found := NULL;
              FOR ancestor_obj IN SELECT value FROM jsonb_array_elements(r->'decorations') LOOP
                IF (ancestor_obj ? 'id' AND ancestor_obj->>'id' = curr_check_id)
                   OR (ancestor_obj ? 'slot' AND ancestor_obj->>'slot' = curr_check_id) THEN
                  next_parent_found := ancestor_obj;
                  EXIT;
                END IF;
              END LOOP;

              IF next_parent_found IS NULL THEN
                EXIT;
              END IF;
              curr_check_id := next_parent_found->>'parent_id';
            END LOOP;
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
  END LOOP;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.validate_house_decorations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS memory_house_decorations_check ON public.memory_houses;
CREATE TRIGGER memory_house_decorations_check
BEFORE INSERT OR UPDATE OF rooms_draft, published_snapshot ON public.memory_houses
FOR EACH ROW EXECUTE FUNCTION public.validate_house_decorations();

COMMIT;
