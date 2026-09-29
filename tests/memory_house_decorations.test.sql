\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE owner_id uuid := '00000000-0000-0000-0000-000000000091'; mem_id uuid; payload jsonb; snapshot jsonb; invalid jsonb;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(owner_id,'match-owner@test.invalid') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,owner_id,availability_status)
  VALUES('emo-3d-regression','House','House 3D',owner_id,'available') RETURNING id INTO mem_id;
  INSERT INTO storage.objects(bucket_id,name) VALUES('emoria-event-media','emo-3d-regression/photo.jpg') ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  payload := '[{"id":"beginning","name":"Our room","lighting":"sunset","decorations":[{"slot":"table","item":"vase","rotation":90}],"memories":[{"id":"photo","photo_path":"emo-3d-regression/photo.jpg"}]}]'::jsonb;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',payload);
  PERFORM public.test_assert(public.rpc_house_get_draft('emo-3d-regression')->'rooms' = payload,'decoration draft roundtrip');
  PERFORM public.rpc_house_publish('emo-3d-regression');
  snapshot := public.rpc_house_tag_public_view('emo-3d-regression');
  PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',jsonb_set(payload,'{0,decorations,0,item}','"cat"'));
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.test_assert(public.rpc_house_tag_public_view('emo-3d-regression')->'rooms'=snapshot->'rooms','public decorations frozen until republish');
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',jsonb_set(payload,'{0,decorations,0,item}','"https://untrusted/model.glb"'));
    RAISE EXCEPTION 'FAIL invalid decoration accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;
  BEGIN
    PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',jsonb_set(payload,'{0,decorations,0,rotation}','45'));
    RAISE EXCEPTION 'FAIL invalid rotation accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;
  BEGIN
    PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',jsonb_set(payload,'{0,decorations}','[{"slot":"table","item":"cat","rotation":0},{"slot":"table","item":"mugs","rotation":0}]'));
    RAISE EXCEPTION 'FAIL duplicate slot accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;
  FOR invalid IN SELECT value FROM jsonb_array_elements('[null,{},[null],[{"slot":"left","item":"cat","rotation":null}],[{"slot":"left","item":"cat","rotation":0,"position":[999,999,999]}]]'::jsonb) LOOP
    BEGIN
      PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',jsonb_set(payload,'{0,decorations}',invalid));
      RAISE EXCEPTION 'FAIL malformed decoration accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;
  END LOOP;
  BEGIN
    PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',jsonb_set(payload,'{0,lighting}','"unknown"'));
    RAISE EXCEPTION 'FAIL invalid lighting accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;
  payload := jsonb_set(payload,'{0,decorations}','[{"slot":"table","item":"album","rotation":90,"photos":["photo",null]},{"slot":"left","item":"nameplate","rotation":0,"text":"Minh & An ♥"}]');
  PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',payload);
  PERFORM public.test_assert(public.rpc_house_get_draft('emo-3d-regression')->'rooms'=payload,'photo and text roundtrip');
  PERFORM public.rpc_house_publish('emo-3d-regression');
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.test_assert(public.rpc_house_tag_public_view('emo-3d-regression')->'rooms'=payload,'public photo and text snapshot');
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR invalid IN SELECT value FROM jsonb_array_elements('[{"slot":"left","item":"frame","rotation":0,"photos":["foreign-photo"]},{"slot":"left","item":"frame","rotation":0,"photos":["photo","photo"]},{"slot":"left","item":"cat","rotation":0,"text":"forbidden"},{"slot":"left","item":"nameplate","rotation":0,"text":null}]'::jsonb) LOOP
    BEGIN
      PERFORM public.rpc_house_save_draft('emo-3d-regression','House','warm_gold',jsonb_set(payload,'{0,decorations}',jsonb_build_array(invalid)));
      RAISE EXCEPTION 'FAIL invalid personalisation accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;
  END LOOP;
END $$;
ROLLBACK;
SELECT 'PASS House 3D database: draft roundtrip, frozen public snapshot, invalid assets/rotation/slots rejected' AS result;
