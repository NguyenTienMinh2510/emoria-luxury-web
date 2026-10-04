-- Test-only provider contract for a NEW disposable PostgreSQL database.
-- This supplies schemas normally owned by Supabase. It does not emulate Auth,
-- Storage HTTP, Realtime delivery, cron execution, or pg_net HTTP delivery.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
SET search_path=public,extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,
 raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),deleted_at timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),
 CASE WHEN auth.uid() IS NULL THEN 'anon' ELSE 'authenticated' END);
$$;
GRANT USAGE ON SCHEMA auth,extensions TO anon,authenticated,service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
 id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT false,
 file_size_limit bigint,allowed_mime_types text[]
);
CREATE TABLE storage.objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),
 name text NOT NULL,owner uuid,owner_id text,metadata jsonb DEFAULT '{}',version text,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
 UNIQUE(bucket_id,name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
GRANT ALL ON storage.objects,storage.buckets TO anon,authenticated,service_role;
CREATE SCHEMA realtime;
CREATE TABLE realtime.messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),topic text NOT NULL,
 extension text NOT NULL DEFAULT 'broadcast',inserted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION realtime.send(message jsonb,event text,topic text,private boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  -- Records a local notification; no provider transport is exercised.
  PERFORM pg_notify('realtime',jsonb_build_object('event',event,'topic',topic,'payload',message)::text);
 END $$;
GRANT USAGE ON SCHEMA realtime TO anon,authenticated,service_role;
GRANT ALL ON realtime.messages TO anon,authenticated,service_role;
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text UNIQUE,
 schedule text,command text,active boolean NOT NULL DEFAULT true);
CREATE TABLE cron.job_run_details (jobid bigint REFERENCES cron.job,runid bigint GENERATED ALWAYS AS IDENTITY,
 status text,start_time timestamptz,end_time timestamptz);
CREATE FUNCTION cron.schedule(job_name text,schedule text,command text) RETURNS bigint LANGUAGE plpgsql AS $$
 DECLARE result bigint; BEGIN
  INSERT INTO cron.job(jobname,schedule,command) VALUES(job_name,schedule,command)
  ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command,active=true
  RETURNING jobid INTO result; RETURN result;
 END $$;
CREATE SCHEMA net;
CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',
 headers jsonb DEFAULT '{"Content-Type":"application/json"}',timeout_milliseconds integer DEFAULT 1000)
 RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Test fixture cannot send HTTP: pg_net delivery requires provider integration testing';
 END $$;
