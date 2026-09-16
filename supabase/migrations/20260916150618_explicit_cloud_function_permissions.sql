BEGIN;
-- Supabase Cloud may grant EXECUTE directly to anon by default, beyond PUBLIC.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_memory_path(text),
 public.rpc_article_admin_data(),public.rpc_set_article_reaction(uuid,text,boolean),
 public.rpc_edit_article_comment(uuid,text,boolean),public.rpc_report_comment(uuid,text),
 public.rpc_saved_articles(),public.rpc_marketing_report(integer,boolean),
 public.rpc_my_memories(),public.rpc_memory_operations(text,boolean),
 public.rpc_memory_guestbook(text,uuid,text),public.rpc_save_catalog(text,jsonb,jsonb,jsonb),
 public.rpc_expire_orders(),public.rpc_order_status(text,text,text),public.rpc_update_memory_space(text,jsonb)
FROM anon;
NOTIFY pgrst,'reload schema';
COMMIT;
