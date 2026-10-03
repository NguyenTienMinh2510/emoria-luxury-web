-- An UPSERT runs BEFORE INSERT before resolving the existing row. Reuse that
-- row's immutable baseline when a client rounds a transform during serialization.
BEGIN;
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.validate_house_decorations()'::regprocedure) INTO definition;
 IF strpos(definition,$before$CASE WHEN TG_OP='UPDATE' THEN COALESCE(OLD.rooms_draft,'[]') ELSE '[]' END$before$)=0 THEN
   RAISE EXCEPTION 'Unexpected house validator baseline; refusing to patch';
 END IF;
 definition:=replace(definition,$before$CASE WHEN TG_OP='UPDATE' THEN COALESCE(OLD.rooms_draft,'[]') ELSE '[]' END$before$,$after$CASE WHEN TG_OP='UPDATE' THEN COALESCE(OLD.rooms_draft,'[]') ELSE COALESCE((SELECT rooms_draft FROM public.memory_houses WHERE memory_id=NEW.memory_id),'[]'::jsonb) END$after$);
 EXECUTE definition;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
