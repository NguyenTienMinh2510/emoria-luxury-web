BEGIN;

-- The HTTP gateway verifies caller identity, enforces quotas/revisions and reviews
-- uploaded images before publishing. Keep owner RPCs behind that boundary.
REVOKE ALL ON FUNCTION public.rpc_house_save_draft(text,text,text,jsonb),
  public.rpc_house_get_draft(text),public.rpc_house_publish(text),
  public.rpc_house_unpublish(text),public.rpc_house_revoke_share(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_house_save_draft(text,text,text,jsonb),
  public.rpc_house_get_draft(text),public.rpc_house_publish(text),
  public.rpc_house_unpublish(text),public.rpc_house_revoke_share(text)
  TO service_role;

-- Published read functions retain their own visibility/revocation checks.
NOTIFY pgrst,'reload schema';
COMMIT;
