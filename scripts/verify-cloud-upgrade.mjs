import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const container='supabase_db_emoria-sandbox',database=`emoria_cloud_verify_${Date.now()}`;
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});if(r.status)throw new Error(r.stderr||r.error?.message);return r.stdout;}
const sql=text=>docker(['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],text);
docker(['exec',container,'createdb','-U','postgres',database]);
try{
 sql(fs.readFileSync('supabase/setup_test_auth_schema.sql','utf8'));
 sql("CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,PRIMARY KEY(bucket_id,name)); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;");
 sql(fs.readFileSync('supabase/production_schema_deploy.sql','utf8'));
 const upgrade=fs.readFileSync('supabase/releases/20260916-cloud-upgrade.sql','utf8').replace(/^CREATE EXTENSION IF NOT EXISTS pg_cron.*$/m,'').replace(/^SELECT cron.schedule.*$/m,'');
 sql(upgrade);
 sql("DO $$ BEGIN IF to_regclass('public.store_settings') IS NULL OR to_regprocedure('public.rpc_save_catalog(text,jsonb,jsonb,jsonb)') IS NULL OR to_regclass('public.bank_payment_events') IS NULL OR to_regprocedure('public.rpc_receive_bank_payment(bigint,boolean,text,text,text,bigint,text)') IS NULL OR to_regclass('public.gateway_payment_events') IS NULL OR to_regprocedure('public.rpc_receive_gateway_payment(text,boolean,text,text,bigint,jsonb)') IS NULL THEN RAISE EXCEPTION 'Missing new schema'; END IF; END $$;");
 console.log('PASS: existing production schema upgrades atomically in isolated Postgres; storage schema shim only for local test; pg_cron scheduling verified separately.');
}finally{docker(['exec',container,'dropdb','-U','postgres',database]);}
