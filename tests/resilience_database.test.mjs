import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Disposable local database and an invocation-owned role only. No application credentials.
const stamp=Date.now(),container='emoria-test-db',database=`emoria_resilience_fixed_${stamp}`,role=`resilience_service_${stamp}`;
assert.match(database,/^emoria_resilience_fixed_[0-9]+$/);assert.match(role,/^resilience_service_[0-9]+$/);
let created=false,roleCreated=false;
const read=path=>readFileSync(path,'utf8');
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:60000});if(r.status!==0)throw new Error(r.stderr||r.error?.message||r.stdout);return r.stdout.trim();}
const args=['exec','-i',container,'psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
const sql=input=>docker(args,input);
const migration=path=>sql(read(path).replace(/\bservice_role\b/g,role));
function functionSql(path,name){const src=read(path),start=src.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);assert.ok(start>=0);const s=src.slice(start),tag=s.match(/AS\s+(\$[A-Za-z_]*\$)/i)[1],open=s.indexOf(tag),end=s.indexOf(tag,open+tag.length)+tag.length;return s.slice(0,end)+';';}
function parallel(input){return new Promise((resolve,reject)=>{const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));child.stdin.end(input);});}
const user='00000000-0000-0000-0000-000000000001',sourceA='a'.repeat(64),sourceB='b'.repeat(64);
try{
 docker(['exec',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE ROLE ${role} NOLOGIN;`]);roleCreated=true;
 docker(['exec',container,'createdb','-U','postgres',database]);created=true;
 for(const path of ['supabase/setup_test_auth_schema.sql','supabase/migrations/20260913_init_emoria_schema.sql','supabase/migrations/20260914000000_atomic_checkout.sql','supabase/migrations/202609140001_store_operations.sql'])migration(path);
 sql(`CREATE SCHEMA private;CREATE SCHEMA storage;
 ALTER TABLE public.memory_spaces ADD COLUMN admin_suspended boolean NOT NULL DEFAULT false,ADD COLUMN pin_hint text,ADD COLUMN version integer DEFAULT 1,ADD COLUMN intro_video_path text,ADD COLUMN letters jsonb DEFAULT '[]';
 ALTER TABLE public.orders ADD COLUMN shipping_carrier text,ADD COLUMN delivery_estimate date,ADD COLUMN shipped_at timestamptz,ADD COLUMN delivered_at timestamptz,ADD COLUMN shipping_note text;
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,metadata jsonb DEFAULT '{}',version text DEFAULT gen_random_uuid()::text,updated_at timestamptz DEFAULT now(),PRIMARY KEY(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage,auth TO authenticated,anon;GRANT INSERT,UPDATE,DELETE,SELECT ON storage.objects TO authenticated;
 CREATE POLICY fixture_namespace ON storage.objects FOR ALL TO authenticated USING(split_part(name,'/',1)='audit-primary' OR split_part(name,'/',1)='match_'||auth.uid()::text) WITH CHECK(split_part(name,'/',1)='audit-primary' OR split_part(name,'/',1)='match_'||auth.uid()::text);
 CREATE TABLE public.memory_recipients(memory_id uuid,user_id uuid);
 CREATE TABLE public.memory_matches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),questions jsonb DEFAULT '[]');
 CREATE TABLE public.memory_houses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),memory_id uuid REFERENCES public.memory_spaces(id),rooms_draft jsonb DEFAULT '[]',published_snapshot jsonb,draft_revision bigint DEFAULT 1);
 CREATE TABLE public.house_layout_backups(house_id uuid PRIMARY KEY REFERENCES public.memory_houses(id),rooms jsonb DEFAULT '[]');
 CREATE TABLE public.house_photo_reviews(path text PRIMARY KEY,tag text,content_version text,requested_by uuid,request_id uuid,status text,labels text[] DEFAULT '{}',violations text[] DEFAULT '{}',reason text,model text,policy_version integer,reviewed_at timestamptz);
 INSERT INTO auth.users(id,email) VALUES('${user}','audit@example.invalid');
 INSERT INTO public.memory_spaces(tag_uid,jewelry_name,title,owner_id,is_protected,pin_hash) VALUES('audit-primary','Audit','Audit fixture','${user}',true,crypt('2468',gen_salt('bf',4)));
 INSERT INTO public.nfc_tap_events(memory_id) SELECT id FROM public.memory_spaces UNION ALL SELECT id FROM public.memory_spaces;
 ALTER FUNCTION public.rpc_get_memory_view(text,uuid) RENAME TO get_memory_view_internal;`);
 sql(functionSql('supabase/migrations/20260921163000_pin_hint_support.sql','public.get_memory_view_internal'));
 sql(functionSql('supabase/migrations/20260915104510_memory_cinema_and_operations.sql','public.rpc_get_memory_view'));
 migration('supabase/migrations/20260917011000_verified_bank_payments.sql');migration('supabase/migrations/20260918000000_sepay_payment_gateway.sql');
 migration('supabase/migrations/20261004100000_resilience_core.sql');
 sql(`CREATE FUNCTION public.test_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END $$;
 SELECT public.test_assert(NOT has_function_privilege('anon','public.rpc_verify_memory_pin(text,text)','EXECUTE'),'raw PIN revoked');
 SELECT public.test_assert(NOT has_function_privilege('authenticated','public.rpc_contact(text,text,text)','EXECUTE'),'raw contact revoked');
 SELECT public.test_assert(NOT has_function_privilege('authenticated','public.rpc_reserve_storage_upload(text,text,bigint,text,uuid)','EXECUTE'),'quota identity service-only');
 SELECT public.test_assert(has_function_privilege('${role}','public.rpc_reserve_storage_upload(text,text,bigint,text,uuid)','EXECUTE'),'service quota granted');
 SELECT public.test_assert((SELECT tap_count_total=2 FROM public.memory_spaces),'historical count preserved');
 SET ROLE anon;SELECT public.rpc_get_memory_view('audit-primary',NULL) FROM generate_series(1,20);RESET ROLE;
 SELECT public.test_assert((SELECT count(*)=2 FROM public.nfc_tap_events),'read view causes no write');
 SELECT public.rpc_verify_memory_pin_guarded('audit-primary','0000','${sourceA}',NULL) FROM generate_series(1,5);
 SELECT public.test_assert((public.rpc_verify_memory_pin_guarded('audit-primary','2468','${sourceA}',NULL)->>'code')='RATE_LIMIT_EXCEEDED','attacker source blocked');
 SELECT public.test_assert((public.rpc_verify_memory_pin_guarded('audit-primary','2468','${sourceB}',NULL)->>'success')::boolean,'correct PIN from other source remains available');
 SELECT public.rpc_contact_guarded('Audit','090000001'||i::text,'Synthetic fixture','${sourceA}',NULL) FROM generate_series(0,4) i;
 SELECT public.test_assert((public.rpc_contact_guarded('Audit','0900000015','Synthetic fixture','${sourceA}',NULL)->>'code')='RATE_LIMIT_EXCEEDED','phone rotation has bounded source quota');
 SELECT public.test_assert((SELECT count(*)=5 FROM public.contact_requests),'only five contacts persisted');`);
 console.log('PASS trusted gateway grants, source PIN isolation, bounded phone rotation, read-only Memory views and historical counts.');

 await Promise.all(Array.from({length:12},()=>parallel(`SELECT public.rpc_record_memory_tap('audit-primary','${sourceB}',NULL);`)));
 assert.equal(sql(`SELECT tap_count_total FROM public.memory_spaces;`),'3');assert.equal(sql(`SELECT count(*) FROM private.memory_tap_dedupe;`),'1');
 console.log('PASS 12 concurrent telemetry retries produce one deduped aggregate increment.');

 sql(`UPDATE public.store_settings SET sales_enabled=true,transfer_enabled=true,bank_account='AUDIT-ACCOUNT',sandbox=true;
 INSERT INTO public.checkout_variants(product_id,size,stock) VALUES('emoria-pulse','Audit',3);
 SELECT set_config('request.jwt.claim.sub','${user}',false);
 SELECT public.rpc_create_order(gen_random_uuid(),'{"customerName":"Audit","phone":"0900000000","address":"Audit fixture","paymentMethod":"vietqr","items":[{"id":"emoria-pulse","size":"Audit","quantity":3}]}');
 SELECT public.rpc_receive_bank_payment(1,true,'partial','AUDIT-ACCOUNT',(SELECT id FROM public.orders LIMIT 1),1,'Audit fixture');
 UPDATE public.orders SET expires_at=now()-interval '1 hour';`);
 const expires=await Promise.all([parallel('SELECT private.expire_orders();'),parallel('SELECT private.expire_orders();')]);assert.equal(expires.map(Number).reduce((a,b)=>a+b,0),1);
 sql(`SELECT public.test_assert((SELECT stock=3 FROM public.checkout_variants WHERE size='Audit'),'stock restored exactly once');
 SELECT public.test_assert((SELECT status='cancelled' AND payment_status='review' AND paid_amount=1 FROM public.orders),'partial ledger preserved for review');
 SELECT public.rpc_receive_bank_payment(2,true,'late','AUDIT-ACCOUNT',(SELECT id FROM public.orders LIMIT 1),1000000,'Late fixture');
 SELECT public.test_assert((SELECT status='cancelled' AND payment_status='review' FROM public.orders),'late money cannot resurrect expired order');
 SELECT public.test_assert((SELECT count(*)=2 FROM public.bank_payment_events),'payment ledger intact');`);
 console.log('PASS concurrent partial-payment expiry releases stock once; late payments stay in review.');

 sql('UPDATE public.resilience_limits SET storage_account_pending=2,storage_global_pending=2;');
 const reserves=await Promise.all(Array.from({length:6},(_,i)=>parallel(`SELECT public.rpc_reserve_storage_upload('emoria-event-media','match_${user}/race-${i}.png',100,'image/png','${user}');`)));
 assert.equal(reserves.map(JSON.parse).filter(r=>r.success).length,2);
 sql(`SELECT public.test_assert((SELECT pending=2 AND allocated_objects=2 FROM private.storage_usage WHERE key='global'),'pending globally bounded under race');
 UPDATE private.storage_upload_reservations SET expires_at=now()-interval '1 second' WHERE state='reserved';
 SELECT private.expire_storage_reservations();
 SELECT public.test_assert((SELECT pending=0 AND allocated_objects=0 FROM private.storage_usage WHERE key='global'),'TTL releases unfinished reservations');
  SELECT public.rpc_reserve_storage_upload('emoria-event-media','audit-primary/photo.png',100,'image/png','${user}');
  SELECT set_config('request.jwt.claim.sub','${user}',false);BEGIN;SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects(bucket_id,name,version,metadata) VALUES('emoria-event-media','audit-primary/photo.png','1','{"contentLength":350,"mimetype":"image/png"}');ROLLBACK;
  SELECT public.test_assert((SELECT state='reserved' FROM private.storage_upload_reservations WHERE path='audit-primary/photo.png'),'provider permission probe rollback keeps reservation');
  SELECT set_config('request.jwt.claim.sub','${user}',false);SET ROLE authenticated;
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('emoria-event-media','audit-primary/photo.png','{"size":80,"mimetype":"image/png"}');RESET ROLE;
 SELECT public.test_assert((SELECT pending=0 AND allocated_bytes=80 AND allocated_objects=1 FROM private.storage_usage WHERE key='global'),'committed bytes replace reservation estimate');`);
 for(const input of [
  `SELECT set_config('request.jwt.claim.sub','${user}',false);SET ROLE authenticated;INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('emoria-event-media','audit-primary/unreserved.png','{"size":100,"mimetype":"image/png"}');`,
  `SELECT public.rpc_reserve_storage_upload('emoria-event-media','audit-primary/oversize.png',100,'image/png','${user}');SELECT set_config('request.jwt.claim.sub','${user}',false);SET ROLE authenticated;INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('emoria-event-media','audit-primary/oversize.png','{"size":101,"mimetype":"image/png"}');`,
  `SELECT set_config('request.jwt.claim.sub','${user}',false);SET ROLE authenticated;UPDATE storage.objects SET metadata='{"size":500,"mimetype":"image/png"}' WHERE name='audit-primary/photo.png';`
 ])assert.throws(()=>sql(input),/reservation|row-level security|immutable/i);
 sql(`UPDATE public.resilience_limits SET storage_global_bytes=180;
 SELECT public.test_assert((public.rpc_reserve_storage_upload('emoria-event-media','audit-primary/budget.png',1,'image/png','${user}')->>'code')='STORAGE_QUOTA_EXCEEDED','global byte budget blocks further allocation');
  UPDATE public.resilience_limits SET storage_global_bytes=107374182400;`);
 assert.throws(()=>sql(`SELECT public.rpc_reserve_storage_upload('emoria-event-media','match_00000000-0000-0000-0000-000000000002/spoof.png',10,'image/png','${user}');`),/namespace/);
 assert.throws(()=>sql(`SELECT public.rpc_cancel_storage_upload('emoria-event-media','audit-primary/photo.png','00000000-0000-0000-0000-000000000002');`),/Wrong upload owner/);
 sql(`SELECT public.rpc_reserve_storage_upload('emoria-event-media','audit-primary/cancel.png',50,'image/png','${user}');
 SELECT public.rpc_cancel_storage_upload('emoria-event-media','audit-primary/cancel.png','${user}');
 SELECT public.rpc_cancel_storage_upload('emoria-event-media','audit-primary/cancel.png','${user}');
 SELECT public.test_assert((SELECT state='cancelled' FROM private.storage_upload_reservations WHERE path='audit-primary/cancel.png'),'cancel is idempotent');
 SELECT public.test_assert((SELECT pending=1 FROM private.storage_usage WHERE key='global'),'cancel releases exactly one slot');
 SELECT set_config('request.jwt.claim.role','${role}',false);
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('emoria-event-media','audit-primary/service.png','{"size":20,"mimetype":"image/png"}');
 DELETE FROM storage.objects WHERE name='audit-primary/service.png';
 SELECT public.test_assert((SELECT allocated_bytes=180 AND allocated_objects=2 FROM private.storage_usage WHERE key='global'),'service import/delete accounted without a user reservation');`);
 assert.throws(()=>sql(`SELECT set_config('request.jwt.claim.sub','${user}',false);SET ROLE authenticated;INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('emoria-media','audit-primary/legacy.png','{"size":10,"mimetype":"image/png"}');`),/row-level security/i);
 console.log('PASS atomic upload reservations, pending limits, TTL recovery, byte validation, direct-upload denial and immutability.');

 sql(`UPDATE private.storage_upload_reservations SET updated_at=now()-interval '8 days' WHERE path='audit-primary/photo.png';
 INSERT INTO public.memory_houses(memory_id,rooms_draft,published_snapshot) SELECT id,'[]','{"rooms":[{"photos":["audit-primary/photo.png"]}]}' FROM public.memory_spaces;
 SELECT public.test_assert(public.rpc_claim_storage_cleanup(10)='[]'::jsonb,'published snapshot protects detached photo');
 UPDATE public.memory_houses SET published_snapshot=NULL;
 INSERT INTO public.house_layout_backups(house_id,rooms) SELECT id,'[{"photo_path":"audit-primary/photo.png"}]' FROM public.memory_houses;
 SELECT public.test_assert(public.rpc_claim_storage_cleanup(10)='[]'::jsonb,'layout backup protects photo');
 DELETE FROM public.house_layout_backups;
 SELECT public.test_assert(jsonb_array_length(public.rpc_claim_storage_cleanup(10))=1,'unreferenced aged photo is claimed');`);
 assert.throws(()=>sql(`UPDATE public.memory_houses SET rooms_draft='[{"photo_path":"audit-primary/photo.png"}]';`),/thu hồi/);
 sql(`SELECT public.rpc_release_storage_cleanup('emoria-event-media','audit-primary/photo.png');`);
 const attach=parallel(`BEGIN;UPDATE public.memory_houses SET rooms_draft='[{"photo_path":"audit-primary/photo.png"}]';SELECT pg_sleep(1);COMMIT;`);
 await new Promise(resolve=>setTimeout(resolve,150));
 const deletion=parallel(`DELETE FROM storage.objects WHERE name='audit-primary/photo.png';`);
 const attachResults=await Promise.allSettled([attach,deletion]);assert.equal(attachResults[0].status,'fulfilled');assert.equal(attachResults[1].status,'rejected');assert.match(attachResults[1].reason.message,/đang được dùng/);
 sql(`UPDATE public.memory_houses SET rooms_draft='[]';UPDATE private.storage_upload_reservations SET updated_at=now()-interval '8 days' WHERE path='audit-primary/photo.png';SELECT public.rpc_claim_storage_cleanup(10);`);
 sql(`DELETE FROM storage.objects WHERE name='audit-primary/photo.png';
 SELECT public.test_assert((public.rpc_confirm_storage_deleted('emoria-event-media','audit-primary/photo.png')->>'success')::boolean,'physical deletion confirmed');
 SELECT public.test_assert((SELECT allocated_bytes=100 AND allocated_objects=1 FROM private.storage_usage WHERE key='global'),'cleanup reclaims used bytes while keeping pending oversize reservation');`);
 console.log('PASS cleanup protects published snapshots/backups, blocks attach-after-claim races and releases accounting on deletion.');

 // Compile the coordinated AI migration on the same isolated schema; its own agent owns behavior tests.
 migration('supabase/migrations/20261004110000_resilience_ai.sql');
 console.log('PASS coordinated AI/SSE migration compiles against core storage accounting.');
}finally{
 if(created)docker(['exec',container,'dropdb','-U','postgres',database]);
 if(roleCreated)docker(['exec',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`DROP ROLE ${role};`]);
}
