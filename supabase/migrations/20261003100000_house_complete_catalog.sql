-- Expand to all 46 Blender objects; retain ownership, RLS, revisions and moderation.
-- Forward rollback: restore private function backup, then disable the layout UI.
BEGIN;
SET LOCAL lock_timeout='10s';
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
  scale_x numeric;
  scale_y numeric;
  scale_z numeric;
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

      IF r ? 'furnishingVersion' AND r->'furnishingVersion' NOT IN ('1'::jsonb,'2'::jsonb) THEN
        RAISE EXCEPTION 'Phiên bản nội thất không hợp lệ' USING ERRCODE='22023';
      END IF;

      IF r ? 'furnishingBaseline' THEN
        IF r->'furnishingVersion' IS DISTINCT FROM '2'::jsonb OR jsonb_typeof(r->'furnishingBaseline') IS DISTINCT FROM 'array' OR octet_length((r->'furnishingBaseline')::text)>131072 THEN
          RAISE EXCEPTION 'Nguồn gốc nội thất không hợp lệ' USING ERRCODE='22023';
        END IF;
        used_ids:='{}';
        FOR d IN SELECT value FROM jsonb_array_elements(r->'furnishingBaseline') LOOP
          IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR length(COALESCE(d->>'id','')) NOT BETWEEN 1 AND 64
            OR (d - ARRAY['id','slot','item','surface','position','rotation','scale','parent_id']::text[]) <> '{}'::jsonb
            OR d->>'id'=ANY(used_ids) THEN
            RAISE EXCEPTION 'Nguồn gốc đồ vật không hợp lệ' USING ERRCODE='22023';
          END IF;
          -- A first baseline must describe an actual validated instance. Later
          -- edits/deletions retain that exact baseline, including tombstones.
          IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r->'decorations','[]')) e WHERE (e-ARRAY['text','photos'])=d)
             AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN TG_OP='UPDATE' THEN COALESCE(OLD.rooms_draft,'[]') ELSE '[]' END) old_room,
               LATERAL jsonb_array_elements(COALESCE(old_room->'furnishingBaseline','[]')) original
               WHERE old_room->>'id'=r->>'id' AND original=d) THEN
            RAISE EXCEPTION 'Nguồn gốc đồ vật không khớp bố cục' USING ERRCODE='22023';
          END IF;
          used_ids:=array_append(used_ids,d->>'id');
        END LOOP;
      END IF;

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
             OR item_id NOT IN ('calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles','rabbit','teddy','cloud-lamp','honey-candle','turntable','camera','daisy-rug','fern','vine','cushion','shelf','sofa','coffee-table','bistro-table','chair','cubby','desk','mugs-jam','capybara','corgi','shiba','duck','duckling','penguin','pear-lamp','orange-lamp','star-frame','avocado-mug','avocado-mug-cutout','succulent','snow-globe','star-jar','crane-jar','pinecone') THEN
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

            -- Standing bases fit horizontal supports; retain wall/ceiling rules.
            IF item_surface = 'wall' AND item_id NOT IN ('calendar','bunting','frame','star-frame','shelf') THEN
              RAISE EXCEPTION 'Món % không thể treo tường', item_id USING ERRCODE='22023';
            END IF;
            IF item_id = 'shelf' AND item_surface <> 'wall' THEN
              RAISE EXCEPTION 'Kệ tường cần được treo tường' USING ERRCODE='22023';
            END IF;
            IF item_id IN ('daisy-rug','cushion','sofa','coffee-table','bistro-table','chair','cubby','desk') AND item_surface <> 'floor' THEN
              RAISE EXCEPTION 'Nội thất cần được đặt trên sàn' USING ERRCODE='22023';
            END IF;
            IF item_surface = 'ceiling' AND item_id <> 'bunting' THEN
              RAISE EXCEPTION 'Món % không thể treo trần', item_id USING ERRCODE='22023';
            END IF;
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
              WHEN 'calendar' THEN half_w := 0.24; half_d := 0.13; item_h := 0.46;
              WHEN 'cat' THEN half_w := 0.25; half_d := 0.225; item_h := 0.28;
              WHEN 'nameplate' THEN half_w := 0.38; half_d := 0.13; item_h := 0.35;
              WHEN 'plant' THEN half_w := 0.2; half_d := 0.2; item_h := 0.55;
              WHEN 'mugs' THEN half_w := 0.25; half_d := 0.21; item_h := 0.3;
              WHEN 'lamp' THEN half_w := 0.27; half_d := 0.27; item_h := 0.48;
              WHEN 'vase' THEN half_w := 0.175; half_d := 0.175; item_h := 0.55;
              WHEN 'album' THEN half_w := 0.275; half_d := 0.225; item_h := 0.15;
              WHEN 'bunting' THEN half_w := 0.475; half_d := 0.12; item_h := 0.65;
              WHEN 'frame' THEN half_w := 0.26; half_d := 0.12; item_h := 0.39;
              WHEN 'birdcage' THEN half_w := 0.175; half_d := 0.175; item_h := 0.5;
              WHEN 'candles' THEN half_w := 0.175; half_d := 0.125; item_h := 0.3;
              WHEN 'rabbit' THEN half_w := 0.19; half_d := 0.16; item_h := 0.55;
              WHEN 'teddy' THEN half_w := 0.21; half_d := 0.175; item_h := 0.55;
              WHEN 'cloud-lamp' THEN half_w := 0.275; half_d := 0.125; item_h := 0.38;
              WHEN 'honey-candle' THEN half_w := 0.15; half_d := 0.15; item_h := 0.28;
              WHEN 'turntable' THEN half_w := 0.275; half_d := 0.21; item_h := 0.21;
              WHEN 'camera' THEN half_w := 0.18; half_d := 0.135; item_h := 0.34;
              WHEN 'daisy-rug' THEN half_w := 0.65; half_d := 0.65; item_h := 0.035;
              WHEN 'fern' THEN half_w := 0.275; half_d := 0.225; item_h := 0.6;
              WHEN 'vine' THEN half_w := 0.2; half_d := 0.2; item_h := 0.38;
              WHEN 'cushion' THEN half_w := 0.325; half_d := 0.325; item_h := 0.22;
              WHEN 'shelf' THEN half_w := 0.5; half_d := 0.175; item_h := 0.22;
              WHEN 'sofa' THEN half_w := 0.825; half_d := 0.36; item_h := 0.8;
              WHEN 'coffee-table' THEN half_w := 0.575; half_d := 0.325; item_h := 0.37;
              WHEN 'bistro-table' THEN half_w := 0.55; half_d := 0.55; item_h := 0.63;
              WHEN 'chair' THEN half_w := 0.24; half_d := 0.25; item_h := 0.73;
              WHEN 'cubby' THEN half_w := 0.6; half_d := 0.225; item_h := 0.75;
              WHEN 'desk' THEN half_w := 0.8; half_d := 0.3; item_h := 0.63;
              WHEN 'mugs-jam' THEN half_w := 0.25; half_d := 0.21; item_h := 0.3;
              WHEN 'capybara' THEN half_w := 0.275; half_d := 0.19; item_h := 0.42;
              WHEN 'corgi' THEN half_w := 0.325; half_d := 0.24; item_h := 0.28;
              WHEN 'shiba' THEN half_w := 0.19; half_d := 0.2; item_h := 0.58;
              WHEN 'duck' THEN half_w := 0.19; half_d := 0.19; item_h := 0.52;
              WHEN 'duckling' THEN half_w := 0.14; half_d := 0.15; item_h := 0.38;
              WHEN 'penguin' THEN half_w := 0.21; half_d := 0.16; item_h := 0.55;
              WHEN 'pear-lamp' THEN half_w := 0.165; half_d := 0.16; item_h := 0.5;
              WHEN 'orange-lamp' THEN half_w := 0.19; half_d := 0.18; item_h := 0.42;
              WHEN 'star-frame' THEN half_w := 0.26; half_d := 0.12; item_h := 0.46;
              WHEN 'avocado-mug' THEN half_w := 0.24; half_d := 0.17; item_h := 0.34;
              WHEN 'avocado-mug-cutout' THEN half_w := 0.24; half_d := 0.17; item_h := 0.34;
              WHEN 'succulent' THEN half_w := 0.2; half_d := 0.17; item_h := 0.38;
              WHEN 'snow-globe' THEN half_w := 0.225; half_d := 0.225; item_h := 0.55;
              WHEN 'star-jar' THEN half_w := 0.17; half_d := 0.17; item_h := 0.32;
              WHEN 'crane-jar' THEN half_w := 0.18; half_d := 0.18; item_h := 0.38;
              WHEN 'pinecone' THEN half_w := 0.21; half_d := 0.135; item_h := 0.28;
              ELSE RAISE EXCEPTION 'Món đồ không hợp lệ' USING ERRCODE='22023';
            END CASE;

            rad_val := (rot_val * 3.141592653589793 / 180.0);
            IF jsonb_typeof(d->'scale') = 'array' THEN
              scale_x := (d->'scale'->>0)::numeric;
              scale_y := (d->'scale'->>1)::numeric;
              scale_z := (d->'scale'->>2)::numeric;
            ELSE
              scale_x := scale_val; scale_y := scale_val; scale_z := scale_val;
            END IF;
            eff_half_x := abs(half_w * scale_x * cos(rad_val)) + abs(half_d * scale_z * sin(rad_val));
            eff_half_z := abs(half_w * scale_x * sin(rad_val)) + abs(half_d * scale_z * cos(rad_val));
            eff_height := scale_y * item_h;

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
            IF parent_found->>'item' NOT IN ('table', 'desk', 'shelf', 'carpet', 'album', 'nameplate', 'coffee-table', 'bistro-table', 'cubby', 'sofa', 'chair', 'cushion', 'daisy-rug') THEN
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

          -- Text on the five explicitly editable model surfaces
          IF d ? 'text' AND (d->>'item' NOT IN ('calendar','nameplate','frame','album','bunting') OR jsonb_typeof(d->'text') IS DISTINCT FROM 'string' OR length(d->>'text') > 80) THEN
            RAISE EXCEPTION 'Chữ trên đồ vật không hợp lệ (tối đa 80 ký tự)' USING ERRCODE='22023';
          END IF;

          -- Photo attachments validation
          IF d ? 'photos' THEN
            photo_limit := CASE d->>'item' WHEN 'calendar' THEN 1 WHEN 'nameplate' THEN 1 WHEN 'frame' THEN 1 WHEN 'star-frame' THEN 1 WHEN 'album' THEN 2 WHEN 'bunting' THEN 3 ELSE 0 END;
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

-- Private, one-time layout backup. Gallery data, letters, access and share IDs are
-- never restored or published by this operation. Re-run = no additional writes.
CREATE TABLE public.house_layout_backups (
  house_id uuid PRIMARY KEY REFERENCES public.memory_houses(id) ON DELETE CASCADE,
  rooms jsonb NOT NULL,
  draft_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.house_layout_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_layout_backup_owner ON public.house_layout_backups FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.memory_houses h JOIN public.memory_spaces m ON m.id=h.memory_id WHERE h.id=house_id AND m.owner_id=auth.uid())
);
REVOKE ALL ON public.house_layout_backups FROM anon,authenticated;
GRANT SELECT ON public.house_layout_backups TO authenticated;
GRANT ALL ON public.house_layout_backups TO service_role;

CREATE FUNCTION public.backup_house_layout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.rooms_draft IS DISTINCT FROM OLD.rooms_draft
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.rooms_draft) r WHERE r->'furnishingVersion'='2')
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.rooms_draft) r WHERE r->'furnishingVersion' IS DISTINCT FROM '2') THEN
   INSERT INTO public.house_layout_backups(house_id,rooms,draft_revision) VALUES(OLD.id,OLD.rooms_draft,OLD.draft_revision) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER house_layout_backup AFTER UPDATE OF rooms_draft ON public.memory_houses FOR EACH ROW EXECUTE FUNCTION public.backup_house_layout();
REVOKE ALL ON FUNCTION public.backup_house_layout() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rpc_house_restore_layout(p_tag_uid text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE h public.memory_houses; backup public.house_layout_backups; r jsonb; old_r jsonb; d jsonb; current_d jsonb; restored jsonb='[]'; decors jsonb;
BEGIN
 PERFORM public.rpc_house_get_draft(p_tag_uid);
 SELECT hh.* INTO h FROM public.memory_houses hh JOIN public.memory_spaces m ON m.id=hh.memory_id WHERE m.tag_uid=lower(trim(p_tag_uid)) FOR UPDATE OF hh,m;
 SELECT * INTO backup FROM public.house_layout_backups WHERE house_id=h.id FOR UPDATE;
 IF backup.house_id IS NULL THEN RETURN public.rpc_house_get_draft(p_tag_uid); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(h.rooms_draft) LOOP
   SELECT value INTO old_r FROM jsonb_array_elements(backup.rooms) WHERE value->>'id'=r->>'id';
   IF old_r IS NOT NULL THEN
     decors:='[]';
     FOR d IN SELECT value FROM jsonb_array_elements(COALESCE(old_r->'decorations','[]')) LOOP
       SELECT value INTO current_d FROM jsonb_array_elements(COALESCE(r->'decorations','[]')) WHERE COALESCE(value->>'id',value->>'slot')=COALESCE(d->>'id',d->>'slot');
       IF current_d IS NULL THEN CONTINUE; END IF;
       IF current_d ? 'text' THEN d:=d||jsonb_build_object('text',current_d->'text'); END IF;
       IF current_d ? 'photos' THEN d:=d||jsonb_build_object('photos',current_d->'photos'); END IF;
       IF d ? 'photos' THEN d:=jsonb_set(d,'{photos}',(SELECT COALESCE(jsonb_agg(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r->'memories','[]')) m WHERE m->'id'=p) THEN p ELSE 'null'::jsonb END),'[]') FROM jsonb_array_elements(d->'photos') p)); END IF;
       decors:=decors||jsonb_build_array(d);
     END LOOP;
     FOR current_d IN SELECT value FROM jsonb_array_elements(COALESCE(r->'decorations','[]')) LOOP
       IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(old_r->'decorations','[]')) e WHERE e->>'id'=current_d->>'id')
         AND (length(COALESCE(current_d->>'text',''))>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(current_d->'photos','[]')) p WHERE p<>'null'::jsonb)) THEN
         decors:=decors||jsonb_build_array(current_d-'parent_id');
       END IF;
     END LOOP;
     r:=(r-ARRAY['furnishingVersion','furnishingBaseline','share_preview_path'])||jsonb_build_object('decorations',decors);
     IF old_r ? 'furnishingVersion' THEN r:=r||jsonb_build_object('furnishingVersion',old_r->'furnishingVersion'); END IF;
     IF old_r ? 'furnishingBaseline' THEN r:=r||jsonb_build_object('furnishingBaseline',old_r->'furnishingBaseline'); END IF;
   END IF;
   restored:=restored||jsonb_build_array(r);
 END LOOP;
 PERFORM public.rpc_house_save_draft(p_tag_uid,NULL,NULL,restored);
 DELETE FROM public.house_layout_backups WHERE house_id=h.id;
 RETURN public.rpc_house_get_draft(p_tag_uid);
END $$;
REVOKE ALL ON FUNCTION public.rpc_house_restore_layout(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_house_restore_layout(text) TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_event_dispatch(p_action text,p_args jsonb,p_caller uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE a jsonb:=COALESCE(p_args,'{}'); result jsonb; view jsonb; h public.memory_houses; mm public.memory_matches;
  rev bigint; role_name text; resource text; resource_type text; report public.event_content_reports; report_id uuid;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',COALESCE(p_caller::text,''),true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_caller,'role',CASE WHEN p_caller IS NULL THEN 'anon' ELSE 'authenticated' END)::text,true);
 IF octet_length(a::text)>524288 THEN RAISE EXCEPTION 'Dữ liệu quá lớn' USING ERRCODE='22023'; END IF;
 IF a ? 'expected_revision' AND (jsonb_typeof(a->'expected_revision') IS DISTINCT FROM 'number' OR
    (a->>'expected_revision') !~ '^[0-9]+$' OR (a->>'expected_revision')::numeric>9007199254740991) THEN
   RAISE EXCEPTION 'Phiên bản bản nháp không hợp lệ' USING ERRCODE='22023';
 END IF;
 IF p_action LIKE 'rpc_match_%' AND a ? 'p_match_id' THEN
   view:=public.rpc_match_get_view((a->>'p_match_id')::uuid,a->>'p_invite_token');
   SELECT * INTO mm FROM public.memory_matches WHERE id=(a->>'p_match_id')::uuid FOR UPDATE;
   role_name:=view->>'role';
   rev:=CASE WHEN p_action IN ('rpc_match_save_progress','rpc_match_submit') THEN CASE WHEN role_name='owner' THEN mm.owner_revision ELSE mm.partner_revision END ELSE mm.draft_revision END;
   IF p_action IN ('rpc_match_save_questions','rpc_match_save_progress') AND COALESCE((a->>'expected_revision')::bigint,0) IS DISTINCT FROM rev THEN
     RAISE EXCEPTION 'DRAFT_CONFLICT: Bản này đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' USING ERRCODE='P0001';
   END IF;
 END IF;
 IF p_action IN ('rpc_house_save_draft','rpc_house_get_draft','rpc_house_publish','rpc_house_unpublish','rpc_house_revoke_share','rpc_house_restore_layout','house_replies') THEN
   view:=public.rpc_house_get_draft(a->>'p_tag_uid');
   PERFORM 1 FROM public.memory_spaces WHERE tag_uid=lower(trim(a->>'p_tag_uid')) FOR UPDATE;
   SELECT * INTO h FROM public.memory_houses WHERE memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=lower(trim(a->>'p_tag_uid'))) FOR UPDATE;
   rev:=COALESCE(h.draft_revision,0);
   -- The reviewed draft and frozen publication must be the same revision.
   -- These row locks remain held while rpc_house_publish copies the snapshot.
   IF p_action='rpc_house_publish' AND (NOT (a ? 'expected_revision') OR (a->>'expected_revision')::bigint IS DISTINCT FROM rev) THEN
     RAISE EXCEPTION 'DRAFT_CONFLICT: Ngôi nhà đã thay đổi sau khi kiểm duyệt. Hãy tải lại và xuất bản lại.' USING ERRCODE='P0001';
   END IF;
   IF p_action IN ('rpc_house_save_draft','rpc_house_restore_layout') AND (COALESCE((a->>'expected_revision')::bigint,0) IS DISTINCT FROM rev OR (p_action='rpc_house_restore_layout' AND NOT(a ? 'expected_revision'))) THEN
     RAISE EXCEPTION 'DRAFT_CONFLICT: Ngôi nhà đã thay đổi ở nơi khác. Hãy tải lại trước khi lưu.' USING ERRCODE='P0001';
   END IF;
 END IF;
 CASE p_action
 WHEN 'rpc_match_create' THEN result:=public.rpc_match_create(a->>'p_tag_uid',a->>'p_title',a->>'p_partner_name',a->>'p_owner_name');
 WHEN 'rpc_match_save_questions' THEN result:=public.rpc_match_save_questions((a->>'p_match_id')::uuid,a->'p_questions',a->>'p_title',a->>'p_partner_name',a->>'p_owner_name');
 WHEN 'rpc_match_begin' THEN result:=public.rpc_match_begin((a->>'p_match_id')::uuid);
 WHEN 'rpc_match_cancel' THEN result:=public.rpc_match_cancel((a->>'p_match_id')::uuid);
 WHEN 'rpc_match_save_progress' THEN result:=public.rpc_match_save_progress((a->>'p_match_id')::uuid,a->'p_answers',a->>'p_invite_token');
 WHEN 'rpc_match_submit' THEN result:=public.rpc_match_submit((a->>'p_match_id')::uuid,a->'p_answers',a->>'p_invite_token');
 WHEN 'rpc_match_get_view' THEN result:=view;
 WHEN 'rpc_match_get_draft' THEN result:=public.rpc_match_get_draft((a->>'p_match_id')::uuid);
 WHEN 'rpc_match_list' THEN RETURN public.rpc_match_list(a->>'p_tag_uid');
 WHEN 'rpc_house_save_draft' THEN result:=public.rpc_house_save_draft(a->>'p_tag_uid',a->>'p_title',a->>'p_theme',a->'p_rooms');
 WHEN 'rpc_house_get_draft' THEN result:=view||jsonb_build_object('can_restore_layout',EXISTS(SELECT 1 FROM public.house_layout_backups WHERE house_id=h.id));
 WHEN 'rpc_house_restore_layout' THEN result:=public.rpc_house_restore_layout(a->>'p_tag_uid');
 WHEN 'rpc_house_publish' THEN result:=public.rpc_house_publish(a->>'p_tag_uid');
 WHEN 'rpc_house_unpublish' THEN result:=public.rpc_house_unpublish(a->>'p_tag_uid');
 WHEN 'rpc_house_revoke_share' THEN result:=public.rpc_house_revoke_share(a->>'p_tag_uid');
 WHEN 'rpc_house_public_view' THEN result:=public.rpc_house_public_view(a->>'p_share_id');
 WHEN 'rpc_house_tag_public_view' THEN result:=public.rpc_house_tag_public_view(a->>'p_tag_uid');
 WHEN 'rpc_admin_list_reports' THEN RETURN public.rpc_admin_list_reports(a->>'p_status',COALESCE((a->>'p_limit')::int,50),COALESCE((a->>'p_offset')::int,0));
 WHEN 'rpc_get_event_analytics_summary' THEN RETURN public.rpc_get_event_analytics_summary(COALESCE((a->>'p_days')::int,30));
 WHEN 'rpc_admin_moderate_content' THEN
   IF NOT public.is_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên được kiểm duyệt' USING ERRCODE='42501'; END IF;
   SELECT * INTO report FROM public.event_content_reports WHERE id=(a->>'p_report_id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy báo cáo' USING ERRCODE='P0002'; END IF;
   IF length(COALESCE(a->>'p_reason',''))>1000 OR a->>'p_action' NOT IN ('hide','restore','dismiss') THEN RAISE EXCEPTION 'Dữ liệu kiểm duyệt không hợp lệ' USING ERRCODE='22023'; END IF;
   IF report.resource_type='guestbook' THEN
     IF a->>'p_action'<>'dismiss' THEN UPDATE public.event_replies SET is_hidden=(a->>'p_action'='hide') WHERE id=report.resource_id::uuid; END IF;
     UPDATE public.event_content_reports SET status=CASE a->>'p_action' WHEN 'hide' THEN 'hidden' WHEN 'restore' THEN 'restored' ELSE 'dismissed' END,admin_notes=a->>'p_reason',reviewed_by=p_caller,reviewed_at=now() WHERE id=report.id;
     result:='{"success":true}';
   ELSE result:=public.rpc_admin_moderate_content(report.id,a->>'p_action',a->>'p_reason'); END IF;
   INSERT INTO public.event_moderation_audit(report_id,actor_id,action,reason) VALUES(report.id,p_caller,a->>'p_action',a->>'p_reason');
 WHEN 'rpc_submit_content_report' THEN
   resource:=a->>'p_resource_id'; resource_type:=a->>'p_resource_type';
   IF length(COALESCE(a->>'p_details',''))>1000 THEN RAISE EXCEPTION 'Lý do tối đa 1000 ký tự' USING ERRCODE='22023'; END IF;
   IF resource_type='house' THEN
     SELECT * INTO h FROM public.memory_houses WHERE share_id=resource OR memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=resource);
     IF h.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy nội dung' USING ERRCODE='P0002'; END IF;
     PERFORM public.rpc_house_public_view(h.share_id);
     SELECT tag_uid INTO resource FROM public.memory_spaces WHERE id=h.memory_id;
   ELSIF resource_type='match' THEN
     PERFORM public.rpc_match_get_view(resource::uuid,a->>'invite_token');
   ELSIF resource_type='guestbook' THEN
     SELECT hh.* INTO h FROM public.event_replies rr JOIN public.memory_houses hh ON hh.id=rr.house_id JOIN public.memory_spaces ms ON ms.id=hh.memory_id WHERE rr.id=resource::uuid AND ms.owner_id=p_caller;
     IF h.id IS NULL THEN RAISE EXCEPTION 'Không được báo cáo lời nhắn này' USING ERRCODE='42501'; END IF;
   ELSE RAISE EXCEPTION 'Loại báo cáo không hợp lệ' USING ERRCODE='22023'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(resource||COALESCE(a->>'reporter',''),0));
   SELECT rr.id INTO report_id FROM public.event_content_reports rr WHERE rr.resource_type=a->>'p_resource_type' AND rr.resource_id=resource AND rr.reason=a->>'p_reason' AND rr.status='pending' AND rr.created_at>now()-interval '1 day' LIMIT 1;
   IF report_id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'report_id',report_id); END IF;
   RETURN public.rpc_submit_content_report(resource_type,resource,a->>'p_reason',a->>'p_details');
 WHEN 'house_replies' THEN
   UPDATE public.event_replies SET read_at=now() WHERE house_id=h.id AND read_at IS NULL;
   RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(r)-'sender_id'-'request_id'-'house_id'),'[]') FROM (SELECT * FROM public.event_replies WHERE house_id=h.id ORDER BY created_at DESC LIMIT 100) r);
 WHEN 'house_reply' THEN
   SELECT * INTO h FROM public.memory_houses WHERE share_id=a->>'share_id' OR memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=a->>'tag_uid');
   IF h.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy ngôi nhà' USING ERRCODE='P0002'; END IF;
   view:=public.rpc_house_public_view(h.share_id);
   resource:=(SELECT r->>'reply_policy' FROM jsonb_array_elements(view->'rooms') r WHERE r->>'id'='beginning');
   IF resource IS NULL OR resource='off' OR (resource='signed_in' AND p_caller IS NULL) THEN RAISE EXCEPTION 'Chủ nhà chưa cho phép gửi lời nhắn này' USING ERRCODE='42501'; END IF;
   IF length(trim(COALESCE(a->>'name','')))=0 OR length(a->>'name')>80 OR length(COALESCE(a->>'message',''))>1000 OR a->>'kind' NOT IN ('heart','message') THEN RAISE EXCEPTION 'Lời nhắn không hợp lệ' USING ERRCODE='22023'; END IF;
   INSERT INTO public.event_replies(house_id,sender_id,request_id,name,message,kind) VALUES(h.id,p_caller,(a->>'request_id')::uuid,trim(a->>'name'),COALESCE(a->>'message',''),a->>'kind') ON CONFLICT(house_id,request_id) DO NOTHING;
   RETURN '{"success":true}';
 WHEN 'rpc_track_event_action' THEN
   IF a->>'p_event_name' NOT IN ('match_invite_opened','house_opened_share','house_share_click','house_copy_link','house_postcard_download','house_postcard_shared') THEN RAISE EXCEPTION 'Sự kiện này chỉ do hệ thống ghi nhận' USING ERRCODE='42501'; END IF;
   resource_type:=a->>'p_resource_type'; resource:=a->>'p_resource_id';
   IF resource_type='match' THEN PERFORM public.rpc_match_get_view(resource::uuid,a->>'invite_token');
   ELSIF resource_type='house' THEN
     SELECT * INTO h FROM public.memory_houses WHERE share_id=resource OR memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=resource);
     IF h.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy nhà' USING ERRCODE='P0002'; END IF;
     PERFORM public.rpc_house_public_view(h.share_id); resource:=h.id::text;
   ELSE RAISE EXCEPTION 'Loại tài nguyên không hợp lệ' USING ERRCODE='22023'; END IF;
   INSERT INTO public.event_analytics_logs(event_name,resource_type,resource_id,session_id,dedupe_key)
   VALUES(a->>'p_event_name',resource_type,resource,a->>'session_id',a->>'p_event_name'||':'||resource||':'||(a->>'session_id')||':'||COALESCE(a->>'event_id',date_trunc('hour',now())::text)) ON CONFLICT(dedupe_key) DO NOTHING;
   DELETE FROM public.event_analytics_logs WHERE created_at<now()-interval '180 days';
   RETURN '{"success":true}';
 ELSE RAISE EXCEPTION 'Thao tác event không hỗ trợ' USING ERRCODE='22023';
 END CASE;
 IF p_action LIKE 'rpc_house_%' AND a ? 'p_tag_uid' AND p_caller IS NOT NULL THEN
   SELECT * INTO h FROM public.memory_houses WHERE memory_id=(SELECT id FROM public.memory_spaces WHERE tag_uid=lower(trim(a->>'p_tag_uid')));
   result:=result||jsonb_build_object('draft_revision',COALESCE(h.draft_revision,0));
 END IF;
 IF p_action LIKE 'rpc_match_%' AND a ? 'p_match_id' THEN
   SELECT * INTO mm FROM public.memory_matches WHERE id=(a->>'p_match_id')::uuid;
   result:=result||jsonb_build_object('draft_revision',mm.draft_revision,'progress_revision',CASE WHEN role_name='owner' THEN mm.owner_revision ELSE mm.partner_revision END);
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.rpc_event_dispatch(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_event_dispatch(text,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
