\set ON_ERROR_STOP on
CREATE FUNCTION public.test_assert(ok BOOLEAN, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;

SELECT test_assert(NOT has_function_privilege('anon', 'public.rpc_claim_nfc_chip(text,text)', 'EXECUTE'), 'anon cannot claim');
SELECT test_assert(NOT has_function_privilege('anon', 'public.rpc_update_memory_space(text,jsonb)', 'EXECUTE'), 'anon cannot update');
SELECT test_assert(NOT has_function_privilege('anon', 'public.rpc_moderate_guestbook(uuid,boolean)', 'EXECUTE'), 'anon cannot moderate');
SELECT test_assert(has_function_privilege('anon', 'public.rpc_get_memory_view(text,uuid)', 'EXECUTE'), 'anon can read view');
SELECT test_assert(has_function_privilege('anon', 'public.rpc_verify_memory_pin(text,text)', 'EXECUTE'), 'anon can verify PIN');
SELECT test_assert(has_function_privilege('authenticated', 'public.rpc_claim_nfc_chip(text,text)', 'EXECUTE'), 'authenticated can claim');
SELECT test_assert(NOT has_table_privilege('authenticated', 'public.memory_pin_failures', 'UPDATE'), 'cannot reset counters directly');

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001', 'owner-a@test.invalid'),
 ('00000000-0000-0000-0000-000000000002', 'owner-b@test.invalid'),
 ('00000000-0000-0000-0000-000000000003', 'admin@test.invalid');
INSERT INTO public.role_assignments(user_id, role) VALUES ('00000000-0000-0000-0000-000000000003', 'admin');
UPDATE public.memory_spaces SET owner_id = '00000000-0000-0000-0000-000000000001' WHERE tag_uid = 'emoria-pulse';
INSERT INTO public.guestbook_entries(id, memory_id, author_name, message)
SELECT '00000000-0000-0000-0000-000000000010', id, 'Guest', 'Hello' FROM memory_spaces WHERE tag_uid = 'emoria-pulse';

SET ROLE anon;
SELECT test_assert((rpc_get_memory_view('emoria-pulse')->>'letter') IS NULL, 'letter hidden');
SELECT test_assert((rpc_get_system_status()->>'success')::boolean, 'public status works');
SELECT test_assert(NOT (rpc_get_system_status() ? 'vip_passcode_hash'), 'status never leaks VIP hash');
SELECT test_assert((rpc_verify_memory_pin('emoria-pulse', NULL)->>'success')::boolean = false, 'NULL PIN rejected');
SELECT test_assert((rpc_verify_memory_pin('emoria-pulse', 'wrong')->>'success')::boolean = false, 'wrong PIN rejected');
SELECT test_assert((rpc_verify_memory_pin('emoria-pulse', '1000')->>'success')::boolean, 'correct PIN before threshold');
RESET ROLE;
SELECT test_assert((SELECT failed_count = 0 AND locked_until IS NULL FROM memory_pin_failures), 'success resets failures');
SET ROLE anon;
SELECT rpc_verify_memory_pin('emoria-pulse', 'wrong') FROM generate_series(1,4);
SELECT test_assert(rpc_verify_memory_pin('emoria-pulse', 'wrong')->>'message' = 'Mã PIN đã bị khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau.', 'fifth failure locks');
SELECT test_assert((rpc_verify_memory_pin('emoria-pulse', '1000')->>'success')::boolean = false, 'even correct PIN denied during lock');
RESET ROLE;
SELECT test_assert((SELECT failed_count = 5 AND locked_until > NOW() + INTERVAL '14 minutes' AND locked_until <= NOW() + INTERVAL '15 minutes' FROM memory_pin_failures), '15 minute lock and no extension');
UPDATE memory_pin_failures SET locked_until = NOW() - INTERVAL '1 second';
SET ROLE anon;
SELECT test_assert((rpc_verify_memory_pin('emoria-pulse', 'wrong')->>'success')::boolean = false, 'expired lock permits fresh attempts');
RESET ROLE;
SELECT test_assert((SELECT failed_count = 1 AND locked_until IS NULL FROM memory_pin_failures), 'counter restarts after expiration');
SET ROLE anon;
SELECT test_assert((rpc_verify_memory_pin('emoria-pulse', '1000')->>'success')::boolean, 'unlock after expiry');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
SELECT test_assert((rpc_moderate_guestbook('00000000-0000-0000-0000-000000000010', true)->>'success')::boolean = false, 'owner B cannot moderate A');
SELECT test_assert((rpc_claim_nfc_chip('emoria-pulse', 'OWNER-PULSE-2024')->>'success')::boolean = false, 'cannot steal claimed chip');
SELECT test_assert((rpc_claim_nfc_chip('emoria-lumen', NULL)->>'success')::boolean = false, 'NULL claim code rejected');
SELECT test_assert((rpc_claim_nfc_chip('emoria-lumen', 'OWNER-LUMEN-2025')->>'success')::boolean, 'valid claim succeeds');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
SELECT test_assert((rpc_claim_nfc_chip('emoria-lumen', 'OWNER-LUMEN-2025')->>'success')::boolean = false, 'second owner cannot claim');
SELECT test_assert((rpc_moderate_guestbook('00000000-0000-0000-0000-000000000010', true)->>'success')::boolean, 'owner can hide');
SELECT test_assert((rpc_update_memory_space('emoria-pulse', '{"title":"Updated","pin_action":"KEEP"}')->>'success')::boolean, 'owner can update with KEEP');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
SELECT test_assert((rpc_moderate_guestbook('00000000-0000-0000-0000-000000000010', false)->>'success')::boolean, 'admin can restore');
SELECT test_assert((rpc_get_memory_view('emoria-pulse')->>'letter') IS NULL, 'admin has no implicit private access');
SELECT test_assert((rpc_moderate_guestbook('00000000-0000-0000-0000-000000000099', true)->>'success')::boolean = false, 'missing entry not successful');
RESET ROLE;
SELECT test_assert((SELECT NOT is_hidden FROM guestbook_entries WHERE id = '00000000-0000-0000-0000-000000000010'), 'moderation persisted');
SELECT test_assert((SELECT is_protected AND crypt('1000', pin_hash) = pin_hash FROM memory_spaces WHERE tag_uid = 'emoria-pulse'), 'KEEP retains PIN');
SELECT '[PASS] PostgreSQL RPC, PIN lockout, grants, claim isolation, moderation and status';
