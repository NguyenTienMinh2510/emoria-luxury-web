-- Migration: Explicitly grant execute permissions on Event Studios public & authenticated RPCs
-- Ensures direct RPC calls by anon and authenticated roles succeed without 42501 permission denied errors.

-- 1. House Public & Visitor RPCs
GRANT EXECUTE ON FUNCTION public.rpc_house_public_view(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_house_tag_public_view(TEXT) TO anon, authenticated;

-- 2. House Owner RPCs
GRANT EXECUTE ON FUNCTION public.rpc_house_get_draft(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_house_publish(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_house_unpublish(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_house_revoke_share(TEXT) TO authenticated;

-- 3. Match Participant & Public RPCs
GRANT EXECUTE ON FUNCTION public.rpc_match_get_view(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_match_submit(UUID, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_match_save_progress(UUID, JSONB, TEXT) TO anon, authenticated;
