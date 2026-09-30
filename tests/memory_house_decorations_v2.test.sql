\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  owner_id uuid := '00000000-0000-0000-0000-000000000092';
  mem_id uuid;
  house_id uuid;
  payload jsonb;
  snapshot jsonb;
  freeform_items jsonb := '[]'::jsonb;
  i integer;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(owner_id,'freeform-owner@test.invalid') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,owner_id,availability_status)
  VALUES('emo-freeform-test','House','House Freeform',owner_id,'available')
  ON CONFLICT(tag_uid) DO UPDATE SET owner_id = EXCLUDED.owner_id
  RETURNING id INTO mem_id;

  INSERT INTO storage.objects(bucket_id,name) VALUES('emoria-event-media','emo-freeform-test/photo.jpg') ON CONFLICT DO NOTHING;

  INSERT INTO public.memory_houses(memory_id,title,theme,is_published,rooms_draft)
  VALUES(mem_id,'Freeform Haven','warm_gold',false,'[]'::jsonb)
  ON CONFLICT(memory_id) DO UPDATE SET title = EXCLUDED.title
  RETURNING id INTO house_id;

  -- =========================================================================
  -- SECURITY VERIFICATION: DIRECT RPC CALLS FROM anon/authenticated MUST BE BLOCKED
  -- Migration 20260929060533_event_studios_completion.sql revoked all direct RPCs
  -- =========================================================================

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  BEGIN
    PERFORM public.rpc_house_save_draft('emo-freeform-test', 'Title', 'theme', '[]'::jsonb);
    RAISE EXCEPTION 'SECURITY FAIL: Direct call to rpc_house_save_draft by authenticated should have been blocked with 42501';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    -- PASS: direct RPC is strictly blocked for authenticated users
    NULL;
  END;

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.rpc_house_save_draft('emo-freeform-test', 'Title', 'theme', '[]'::jsonb);
    RAISE EXCEPTION 'SECURITY FAIL: Direct call to rpc_house_save_draft by anon should have been blocked with 42501';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    -- PASS: direct RPC is strictly blocked for anon users
    NULL;
  END;

  -- Return to service_role / postgres for server-level validation tests
  RESET ROLE;

  -- =========================================================================
  -- 1. Construct 40 freeform items (> 30 items) to verify no arbitrary cap
  -- =========================================================================
  FOR i IN 1..40 LOOP
    freeform_items := freeform_items || jsonb_build_object(
      'id', 'cat_inst_' || i,
      'item', 'cat',
      'surface', 'floor',
      'position', jsonb_build_array(-2.8, 0.15, 0.0),
      'rotation', (i * 10) % 360,
      'scale', 1.0
    );
  END LOOP;

  payload := jsonb_build_array(jsonb_build_object(
    'id', 'beginning',
    'name', 'Our room',
    'lighting', 'sunset',
    'decorations', freeform_items,
    'memories', jsonb_build_array(jsonb_build_object('id', 'photo', 'photo_path', 'emo-freeform-test/photo.jpg'))
  ));

  -- 2. Save draft with 40 items and verify exact reload
  UPDATE public.memory_houses
  SET rooms_draft = payload
  WHERE id = house_id;

  PERFORM public.test_assert(
    jsonb_array_length((SELECT rooms_draft FROM public.memory_houses WHERE id = house_id)->0->'decorations') = 40,
    '40 freeform items successfully saved in rooms_draft without truncation'
  );

  -- 3. Publish and verify both rooms_draft AND published_snapshot are validated
  UPDATE public.memory_houses
  SET is_published = true,
      published_snapshot = jsonb_build_object('rooms', payload)
  WHERE id = house_id;

  PERFORM public.test_assert(
    jsonb_array_length((SELECT published_snapshot FROM public.memory_houses WHERE id = house_id)->'rooms'->0->'decorations') = 40,
    'published_snapshot successfully contains all 40 freeform items'
  );

  -- 4. Test Room Boundary Validation:
  -- room 'beginning' valid X center: -2.8, width: 2.8 => bounds [-4.2, -1.4].
  -- An item placed at X = 0.5 must be rejected!
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'out_of_bounds_x', 'item', 'cat', 'surface', 'floor',
        'position', jsonb_build_array(0.5, 0.15, 0.0)
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Out of bounds X was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 5. Test Physical Dimensions Wall Penetration:
  -- bunting has half_w = 0.475m. If placed at X = -4.10 in 'beginning' (room minX is -4.20),
  -- the edge reaches -4.10 - 0.475 = -4.575m, penetrating the wall! Must be rejected!
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'penetrating_bunting', 'item', 'bunting', 'surface', 'wall',
        'position', jsonb_build_array(-4.10, 1.45, 0.0), -- Center inside, but edges stick through wall!
        'scale', 1.0,
        'rotation', 0
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Wall-penetrating asset was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 6. room 'memories' upstairs floor Y is 2.25. Floor Y = 0.15 must be rejected!
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'memories',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'out_of_bounds_y', 'item', 'cat', 'surface', 'floor',
        'position', jsonb_build_array(-1.8, 0.15, 0.0)
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Out of bounds Y was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 7. Test Non-finite / invalid transform types:
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'bad_coords', 'item', 'cat', 'surface', 'floor',
        'position', jsonb_build_array('not_a_number', 0.15, 0.0)
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Non-numeric coordinate accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- Scale out of bounds (< 0.3)
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'bad_scale', 'item', 'cat', 'surface', 'floor',
        'position', jsonb_build_array(-2.8, 0.15, 0.0),
        'scale', 0.1
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Sub-minimum scale accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 8. Test Surface Incompatibility:
  -- candles CANNOT be mounted on a wall
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'bad_surface', 'item', 'candles', 'surface', 'wall',
        'position', jsonb_build_array(-2.8, 0.15, 0.0)
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Unsupported surface accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- Every standing model can persist on a real horizontal support, including
  -- models previously rejected on floors and the bunting stand on a table.
  FOR payload IN SELECT jsonb_build_array(jsonb_build_object(
    'id', 'first', 'decorations', jsonb_build_array(jsonb_build_object(
      'id', 'supported', 'item', item, 'surface', surface,
      'position', jsonb_build_array(0, 0.15, 0), 'scale', 0.6
    ))
  )) FROM unnest(ARRAY['calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles']) AS item
  CROSS JOIN unnest(ARRAY['floor','table','shelf']) AS surface LOOP
    UPDATE public.memory_houses SET rooms_draft = payload,
      published_snapshot = jsonb_build_object('rooms', payload) WHERE id = house_id;
    PERFORM public.test_assert((SELECT rooms_draft = payload FROM public.memory_houses WHERE id = house_id), 'Supported placement survives reload');
  END LOOP;

  -- 9. Test Self-Parenting Reference:
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'self_parent', 'item', 'plant', 'surface', 'table',
        'parent_id', 'self_parent',
        'position', jsonb_build_array(-2.8, 0.51, -0.7)
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Self-parenting was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 10. Test Non-existent parent in same room:
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'orphan_child', 'item', 'mugs', 'surface', 'table',
        'parent_id', 'no_such_table',
        'position', jsonb_build_array(-2.8, 0.51, -0.7)
      ))
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Non-existent parent accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 11. Test Non-supporting parent item (e.g. cat cannot support items):
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(
        jsonb_build_object('id', 'cat_obj', 'item', 'cat', 'surface', 'floor', 'position', jsonb_build_array(-2.8, 0.15, 0.0)),
        jsonb_build_object('id', 'mug_on_cat', 'item', 'mugs', 'surface', 'table', 'parent_id', 'cat_obj', 'position', jsonb_build_array(-2.8, 0.40, 0.0))
      )
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Non-supporting parent item accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 12. Test Multi-Level Circular Dependency: A -> B -> C -> A
  BEGIN
    UPDATE public.memory_houses
    SET rooms_draft = jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(
        jsonb_build_object('id', 'cycle_a', 'item', 'album', 'surface', 'table', 'parent_id', 'cycle_c', 'position', jsonb_build_array(-2.8, 0.51, -0.7)),
        jsonb_build_object('id', 'cycle_b', 'item', 'nameplate', 'surface', 'table', 'parent_id', 'cycle_a', 'position', jsonb_build_array(-2.8, 0.51, -0.7)),
        jsonb_build_object('id', 'cycle_c', 'item', 'album', 'surface', 'table', 'parent_id', 'cycle_b', 'position', jsonb_build_array(-2.8, 0.51, -0.7))
      )
    ))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: 3-level parent cycle accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- 13. Test published_snapshot validation on malformed snapshot:
  BEGIN
    UPDATE public.memory_houses
    SET published_snapshot = jsonb_build_object('rooms', jsonb_build_array(jsonb_build_object(
      'id', 'beginning',
      'decorations', jsonb_build_array(jsonb_build_object(
        'id', 'bad_snapshot_item', 'item', 'candles', 'surface', 'wall', -- Invalid wall mounting in published_snapshot
        'position', jsonb_build_array(-2.8, 0.15, 0.0)
      ))
    )))
    WHERE id = house_id;
    RAISE EXCEPTION 'FAIL: Corrupted published_snapshot was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  RAISE NOTICE 'ALL FREEFORM HOUSE V2 SCHEMA TESTS PASSED SUCCESSFULLY';
END $$;
ROLLBACK;
