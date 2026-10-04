import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// This audit creates and drops only its own database inside the local test container.
// It never reads application credentials or connects to a cloud service.
const container = 'emoria-test-db';
const database = `emoria_resilience_audit_${Date.now()}`;
assert.match(database, /^emoria_resilience_audit_[0-9]+$/);
let created = false;
function docker(args, input) {
  const result = spawnSync('docker', args, {input, encoding:'utf8', timeout:30000});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || result.stdout);
  return result.stdout.trim();
}
function sql(input) {
  return docker(['exec','-i',container,'psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'], input);
}
function read(file) { return readFileSync(file,'utf8'); }
function extractFunction(file, name) {
  const source = read(file);
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const declaration = source.slice(start);
  const dollarTag = declaration.match(/AS\s+(\$[A-Za-z_]*\$)/i)?.[1];
  assert.ok(dollarTag, `Missing function body ${name}`);
  const opening = declaration.indexOf(dollarTag);
  const end = declaration.indexOf(dollarTag, opening+dollarTag.length)+dollarTag.length;
  return declaration.slice(0,end)+';';
}
try {
  docker(['exec',container,'createdb','-U','postgres',database]); created = true;
  for (const file of [
    'supabase/setup_test_auth_schema.sql',
    'supabase/migrations/20260913_init_emoria_schema.sql',
    'supabase/migrations/20260914000000_atomic_checkout.sql',
    'supabase/migrations/202609140001_store_operations.sql'
  ]) sql(read(file));
  sql(`CREATE SCHEMA private;
    ALTER TABLE public.memory_spaces ADD COLUMN admin_suspended boolean NOT NULL DEFAULT false;
    ALTER TABLE public.orders ADD COLUMN shipping_carrier text,ADD COLUMN delivery_estimate text,
      ADD COLUMN shipped_at timestamptz,ADD COLUMN delivered_at timestamptz,ADD COLUMN shipping_note text;`);
  // A minimal local PostgreSQL container has no service_role role or pg_cron.
  // Omit only the service_role GRANT; function bodies under test are copied unchanged.
  sql(read('supabase/migrations/20260917011000_verified_bank_payments.sql')
    .replace(/^GRANT EXECUTE[^\n]*TO service_role;\r?$/gm,''));
  sql(read('supabase/migrations/20260918000000_sepay_payment_gateway.sql')
    .replace(/^GRANT EXECUTE[^\n]*TO service_role;\r?$/gm,''));
  sql(`INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-000000000001','audit@example.invalid');
    SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
    UPDATE public.store_settings SET sales_enabled=true,transfer_enabled=true,bank_account='AUDIT-ACCOUNT',sandbox=true;
    INSERT INTO public.checkout_variants(product_id,size,stock) VALUES('emoria-pulse','Audit',3);
    SELECT public.rpc_create_order(gen_random_uuid(),'{"customerName":"Audit","phone":"0900000000","address":"Audit fixture","paymentMethod":"vietqr","items":[{"id":"emoria-pulse","size":"Audit","quantity":3}]}');`);
  assert.equal(sql(`SELECT stock FROM public.checkout_variants WHERE size='Audit';`),'0');
  sql(`SELECT public.rpc_receive_bank_payment(1,true,'audit-reference','AUDIT-ACCOUNT',(SELECT id FROM public.orders LIMIT 1),1,'AUDIT fixture');
    UPDATE public.orders SET expires_at=now()-interval '1 hour';`);
  assert.equal(sql('SELECT private.expire_orders();'),'0');
  assert.equal(sql('SELECT status||\'|\'||paid_amount||\'|\'||payment_status FROM public.orders;'),'pending_payment|1|partial');
  assert.equal(sql(`SELECT stock FROM public.checkout_variants WHERE size='Audit';`),'0');
  console.log('CONFIRMED stock hold: a 1 VND partial payment keeps all 3 units reserved after expiry.');

  sql(`SET ROLE anon;
    SELECT public.rpc_contact('Audit','090000001'||i::text,'Synthetic fixture')
    FROM generate_series(0,9) i;`);
  assert.equal(sql('SELECT count(*) FROM public.contact_requests;'),'10');
  console.log('CONFIRMED contact rate bypass: 10 anonymous submissions with distinct caller-selected phone strings succeed in one transaction.');

  // Apply the current PIN serialization patch exactly as in security_hardening.
  const hardening = read('supabase/migrations/20260922100000_security_hardening.sql');
  const pinPatchStart = hardening.indexOf('DO $$ DECLARE definition text; old text:=');
  const pinPatchEnd = hardening.indexOf('END $$;',pinPatchStart)+7;
  sql(hardening.slice(pinPatchStart,pinPatchEnd));
  sql(`INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,is_protected,pin_hash)
    VALUES('audit-protected','Audit','Audit fixture',true,crypt('2468',gen_salt('bf',4)));
    SET ROLE anon;
    SELECT public.rpc_verify_memory_pin('audit-protected','0000') FROM generate_series(1,5);`);
  const correctAfterAttacker = JSON.parse(sql(`SET ROLE anon;
    SELECT public.rpc_verify_memory_pin('audit-protected','2468');`).split('\n').at(-1));
  assert.equal(correctAfterAttacker.success,false);
  assert.equal(sql(`SELECT failed_count||'|'||(locked_until>now()) FROM public.memory_pin_failures;`),'5|true');
  console.log('CONFIRMED shared PIN denial: 5 anonymous incorrect attempts deny the legitimate correct PIN for 15 minutes.');

  // Current sanitized memory wrapper plus current internal view function.
  sql(`CREATE TABLE public.memory_recipients(memory_id uuid,user_id uuid);
    ALTER TABLE public.memory_spaces ADD COLUMN pin_hint text,ADD COLUMN version integer DEFAULT 1;
    ALTER FUNCTION public.rpc_get_memory_view(text,uuid) RENAME TO get_memory_view_internal;`);
  sql(extractFunction('supabase/migrations/20260921163000_pin_hint_support.sql','public.get_memory_view_internal'));
  sql(extractFunction('supabase/migrations/20260915104510_memory_cinema_and_operations.sql','public.rpc_get_memory_view'));
  sql(`REVOKE ALL ON FUNCTION public.get_memory_view_internal(text,uuid) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_get_memory_view(text,uuid) TO anon,authenticated;
    SET ROLE anon;
    SELECT public.rpc_get_memory_view('audit-protected',NULL) FROM generate_series(1,20);`);
  assert.equal(sql('SELECT count(*) FROM public.nfc_tap_events;'),'20');
  console.log('CONFIRMED locked memory read amplification: 20 anonymous reads create 20 persistent tap events before PIN unlock.');

  // A schema-only Storage shim tests the exact effective insert policy, without uploading bytes.
  // This validates SQL authorization only; provider-level storage limits are outside this test.
  sql(`CREATE SCHEMA storage;
    CREATE TABLE storage.objects(bucket_id text NOT NULL,name text NOT NULL,metadata jsonb DEFAULT '{}');
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage,auth TO authenticated;
    GRANT INSERT ON storage.objects TO authenticated;`);
  const storageMigration=read('supabase/migrations/20260930120000_mismatch_accounts_and_progress.sql');
  const insertPolicyStart=storageMigration.indexOf('CREATE POLICY "Account match photos insert"');
  const insertPolicyEnd=storageMigration.indexOf(';',insertPolicyStart)+1;
  sql(storageMigration.slice(insertPolicyStart,insertPolicyEnd));
  sql(`SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
    SET ROLE authenticated;
    INSERT INTO storage.objects(bucket_id,name,metadata)
    SELECT 'emoria-event-media','match_00000000-0000-0000-0000-000000000001/'||i||'.png',
      '{"mimetype":"image/png","size":8388608}' FROM generate_series(1,100) i;`);
  assert.equal(sql('SELECT count(*) FROM storage.objects;'),'100');
  assert.equal(sql("SELECT count(*) FROM public.memory_spaces WHERE owner_id='00000000-0000-0000-0000-000000000001';"),'0');
  console.log('CONFIRMED Storage SQL policy: an account owning no memory can insert 100 distinct match photo object records; there is no per-account count/byte reservation in the policy. Actual Storage upload bytes were not tested.');
} finally {
  if (created) docker(['exec',container,'dropdb','-U','postgres',database]);
}
