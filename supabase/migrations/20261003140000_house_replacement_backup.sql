-- Explicit replacement also works for houses already using the Cozy catalog.
-- Keep the first recovery point; ordinary moves leave the baseline unchanged.
BEGIN;
ALTER TABLE public.house_layout_backups ADD COLUMN replaced_ids jsonb NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.backup_house_layout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous_room jsonb; removed jsonb; replacement_ids jsonb;
BEGIN
 IF NEW.rooms_draft IS DISTINCT FROM OLD.rooms_draft
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.rooms_draft) r
      LEFT JOIN LATERAL (
        SELECT value AS room FROM jsonb_array_elements(OLD.rooms_draft)
        WHERE value->>'id'=r->>'id'
      ) old ON true
      WHERE r->'furnishingVersion'='2'
        AND (old.room->'furnishingVersion' IS DISTINCT FROM '2'
          OR r->'furnishingBaseline' IS DISTINCT FROM old.room->'furnishingBaseline')
    ) THEN
   INSERT INTO public.house_layout_backups(house_id,rooms,draft_revision)
   VALUES(OLD.id,OLD.rooms_draft,OLD.draft_revision) ON CONFLICT DO NOTHING;
   SELECT replaced_ids INTO replacement_ids FROM public.house_layout_backups WHERE house_id=OLD.id;
   FOR previous_room IN SELECT value FROM jsonb_array_elements(OLD.rooms_draft) LOOP
     SELECT COALESCE(jsonb_agg(d->>'id'),'[]') INTO removed
     FROM jsonb_array_elements(COALESCE(previous_room->'decorations','[]')) d
     WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.rooms_draft) r,
       LATERAL jsonb_array_elements(COALESCE(r->'decorations','[]')) n
       WHERE r->>'id'=previous_room->>'id' AND n->>'id'=d->>'id');
     replacement_ids:=jsonb_set(replacement_ids,ARRAY[previous_room->>'id'],
       COALESCE(replacement_ids->(previous_room->>'id'),'[]')||removed);
   END LOOP;
   UPDATE public.house_layout_backups SET replaced_ids=replacement_ids WHERE house_id=OLD.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.backup_house_layout() FROM PUBLIC,anon,authenticated;
-- Restore items removed by replacement, but respect later manual deletions.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.rpc_house_restore_layout(text)'::regprocedure) INTO definition;
 IF strpos(definition,'IF current_d IS NULL THEN CONTINUE; END IF;')=0 THEN
   RAISE EXCEPTION 'Unexpected restore function';
 END IF;
 definition:=replace(definition,'IF current_d IS NULL THEN CONTINUE; END IF;',
   'IF current_d IS NULL AND NOT COALESCE((backup.replaced_ids->(r->>''id'')) ? (d->>''id''),false) THEN CONTINUE; END IF;');
 EXECUTE definition;
END $migration$;
COMMIT;
