BEGIN;
CREATE FUNCTION public.validate_cozy_house_surfaces() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE lists jsonb[]; rooms jsonb; r jsonb; d jsonb; allowed jsonb=$catalog${"calendar":["table","wall"],"cat":["floor","table"],"nameplate":["table","shelf","floor"],"plant":["floor","table","shelf"],"mugs":["table","shelf"],"lamp":["table","shelf","floor"],"vase":["table","shelf"],"album":["table","shelf"],"bunting":["wall","ceiling"],"frame":["wall","table"],"birdcage":["table","floor","shelf"],"candles":["table","shelf"],"rabbit":["floor","table","shelf"],"teddy":["floor","table","shelf"],"cloud-lamp":["table","shelf","floor"],"honey-candle":["table","shelf"],"turntable":["table","shelf"],"camera":["table","shelf"],"daisy-rug":["floor"],"fern":["floor","table","shelf"],"vine":["table","shelf","floor"],"cushion":["floor"],"shelf":["wall"],"sofa":["floor"],"coffee-table":["floor"],"bistro-table":["floor"],"chair":["floor"],"cubby":["floor"],"desk":["floor"],"mugs-jam":["table","shelf"],"capybara":["floor","table","shelf"],"corgi":["floor","table"],"shiba":["floor","table","shelf"],"duck":["floor","table","shelf"],"duckling":["floor","table","shelf"],"penguin":["floor","table","shelf"],"pear-lamp":["floor","table","shelf"],"orange-lamp":["floor","table","shelf"],"star-frame":["table","shelf","wall"],"avocado-mug":["table","shelf"],"avocado-mug-cutout":["table","shelf"],"succulent":["floor","table","shelf"],"snow-globe":["table","shelf"],"star-jar":["table","shelf"],"crane-jar":["table","shelf"],"pinecone":["floor","table","shelf"]}$catalog$;
BEGIN
 lists:=ARRAY[NEW.rooms_draft,NEW.published_snapshot->'rooms'];
 FOREACH rooms IN ARRAY lists LOOP
  IF jsonb_typeof(rooms)='array' THEN
   FOR r IN SELECT value FROM jsonb_array_elements(rooms) LOOP
    IF r->'furnishingVersion'='2'::jsonb THEN
     FOR d IN SELECT value FROM jsonb_array_elements(COALESCE(r->'decorations','[]')) LOOP
      IF d ? 'surface' AND NOT COALESCE((allowed->(d->>'item')) ? (d->>'surface'),false) THEN
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
CREATE TRIGGER validate_cozy_house_surfaces BEFORE INSERT OR UPDATE ON public.memory_houses FOR EACH ROW EXECUTE FUNCTION public.validate_cozy_house_surfaces();
NOTIFY pgrst,'reload schema';
COMMIT;
