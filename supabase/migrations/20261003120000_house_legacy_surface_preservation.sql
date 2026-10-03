-- Preserve unchanged legacy surfaces during opt-in v2 upgrades; new placements use the strict catalog.
BEGIN;
CREATE OR REPLACE FUNCTION public.validate_cozy_house_surfaces() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE lists jsonb[]; rooms jsonb; r jsonb; d jsonb; allowed jsonb=$catalog${"calendar":["table","wall"],"cat":["floor","table"],"nameplate":["table","shelf","floor"],"plant":["floor","table","shelf"],"mugs":["table","shelf"],"lamp":["table","shelf","floor"],"vase":["table","shelf"],"album":["table","shelf"],"bunting":["wall","ceiling"],"frame":["wall","table"],"birdcage":["table","floor","shelf"],"candles":["table","shelf"],"rabbit":["floor","table","shelf"],"teddy":["floor","table","shelf"],"cloud-lamp":["table","shelf","floor"],"honey-candle":["table","shelf"],"turntable":["table","shelf"],"camera":["table","shelf"],"daisy-rug":["floor"],"fern":["floor","table","shelf"],"vine":["table","shelf","floor"],"cushion":["floor"],"shelf":["wall"],"sofa":["floor"],"coffee-table":["floor"],"bistro-table":["floor"],"chair":["floor"],"cubby":["floor"],"desk":["floor"],"mugs-jam":["table","shelf"],"capybara":["floor","table","shelf"],"corgi":["floor","table"],"shiba":["floor","table","shelf"],"duck":["floor","table","shelf"],"duckling":["floor","table","shelf"],"penguin":["floor","table","shelf"],"pear-lamp":["floor","table","shelf"],"orange-lamp":["floor","table","shelf"],"star-frame":["table","shelf","wall"],"avocado-mug":["table","shelf"],"avocado-mug-cutout":["table","shelf"],"succulent":["floor","table","shelf"],"snow-globe":["table","shelf"],"star-jar":["table","shelf"],"crane-jar":["table","shelf"],"pinecone":["floor","table","shelf"]}$catalog$;
BEGIN
 lists:=ARRAY[NEW.rooms_draft,NEW.published_snapshot->'rooms'];
 FOREACH rooms IN ARRAY lists LOOP
  IF jsonb_typeof(rooms)='array' THEN
   FOR r IN SELECT value FROM jsonb_array_elements(rooms) LOOP
    IF r->'furnishingVersion'='2'::jsonb THEN
     FOR d IN SELECT value FROM jsonb_array_elements(COALESCE(r->'decorations','[]')) LOOP
      IF d ? 'surface' AND NOT COALESCE((allowed->(d->>'item')) ? (d->>'surface'),false)
         AND NOT (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(OLD.rooms_draft,'[]')) old_room, LATERAL jsonb_array_elements(COALESCE(old_room->'decorations','[]')) old_d
           WHERE old_room->>'id'=r->>'id' AND old_d->>'id'=d->>'id' AND old_d->>'item'=d->>'item' AND old_d->>'surface'=d->>'surface')) THEN
       RAISE EXCEPTION 'Bề mặt không phù hợp với món đồ Cozy' USING ERRCODE='22023';
      END IF;
     END LOOP;
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_cozy_house_surfaces() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
