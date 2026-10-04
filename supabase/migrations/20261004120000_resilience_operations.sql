BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TABLE private.resilience_worker_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),endpoint text NOT NULL CHECK(endpoint~'^https://[a-z0-9.-]+/api/resilience-worker$'),
 token text NOT NULL CHECK(length(token)>=48),enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE private.resilience_worker_state (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),lease_id uuid,lease_until timestamptz,
 last_started timestamptz,last_success timestamptz,last_error timestamptz,error_code text,last_dispatch timestamptz,request_id bigint
);
INSERT INTO private.resilience_worker_state(id) VALUES(true);
REVOKE ALL ON private.resilience_worker_config,private.resilience_worker_state FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.dispatch_resilience_worker() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,private,net AS $$
DECLARE c private.resilience_worker_config; request bigint;
BEGIN
 SELECT * INTO c FROM private.resilience_worker_config WHERE id=true AND enabled;
 IF NOT FOUND THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM private.resilience_worker_state WHERE lease_until>clock_timestamp()) THEN RETURN; END IF;
 SELECT net.http_post(url:=c.endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||c.token),body:='{}'::jsonb,timeout_milliseconds:=175000) INTO request;
 UPDATE private.resilience_worker_state SET last_dispatch=now(),request_id=request WHERE id=true;
END $$;
REVOKE ALL ON FUNCTION private.dispatch_resilience_worker() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rpc_begin_resilience_worker() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,private,public,extensions AS $$
DECLARE token uuid:=gen_random_uuid();
BEGIN
 UPDATE private.resilience_worker_state SET lease_id=token,lease_until=clock_timestamp()+interval '175 seconds',last_started=now()
 WHERE id=true AND (lease_until IS NULL OR lease_until<clock_timestamp());
 IF NOT FOUND THEN RETURN '{"allowed":false}'; END IF;
 RETURN jsonb_build_object('allowed',true,'lease_id',token);
END $$;
CREATE FUNCTION public.rpc_run_resilience_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private AS $$
DECLARE expired int;
BEGIN
 expired:=private.expire_orders();
 PERFORM private.resilience_maintenance();
 PERFORM public.rpc_cleanup_ai_state();
 DELETE FROM public.event_rate_limits WHERE expires_at<now()-interval '1 day';
 RETURN jsonb_build_object('expired_orders',expired);
END $$;
CREATE FUNCTION public.rpc_finish_resilience_worker(p_lease uuid,p_ok boolean) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,private AS $$
 UPDATE private.resilience_worker_state SET lease_until=NULL,
 last_success=CASE WHEN p_ok THEN now() ELSE last_success END,
 last_error=CASE WHEN p_ok THEN last_error ELSE now() END,error_code=CASE WHEN p_ok THEN NULL ELSE 'WORKER_FAILED' END
 WHERE id=true AND lease_id=p_lease;
$$;
CREATE FUNCTION public.rpc_resilience_health() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,private,public,cron AS $$
 SELECT jsonb_build_object('worker_configured',EXISTS(SELECT 1 FROM private.resilience_worker_config WHERE id=true AND enabled),
 'worker_healthy',COALESCE(s.last_success>now()-interval '5 minutes',false),'last_success',s.last_success,'last_error',s.last_error,'error_code',s.error_code,
 'expiry_cron_active',EXISTS(SELECT 1 FROM cron.job WHERE jobname='emoria-expire-orders' AND active),
 'expiry_cron_healthy',EXISTS(SELECT 1 FROM cron.job_run_details r JOIN cron.job j USING(jobid) WHERE j.jobname='emoria-expire-orders' AND r.status='succeeded' AND r.end_time>now()-interval '5 minutes'),
 'worker_cron_active',EXISTS(SELECT 1 FROM cron.job WHERE jobname='emoria-resilience-worker' AND active),
 'expired_unreleased_orders',(SELECT count(*) FROM public.orders WHERE status='pending_payment' AND expires_at<=now() AND NOT stock_released),
 'publish_jobs_pending',(SELECT count(*) FROM public.house_publish_jobs WHERE status IN ('queued','processing','ready')),
 'ai_active',(SELECT count(*) FROM public.ai_work_leases WHERE expires_at>now()),
 'storage_bytes',(SELECT allocated_bytes FROM private.storage_usage WHERE key='global')) FROM private.resilience_worker_state s WHERE id=true;
$$;
REVOKE ALL ON FUNCTION public.rpc_begin_resilience_worker(),public.rpc_run_resilience_maintenance(),public.rpc_finish_resilience_worker(uuid,boolean),public.rpc_resilience_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_begin_resilience_worker(),public.rpc_run_resilience_maintenance(),public.rpc_finish_resilience_worker(uuid,boolean),public.rpc_resilience_health() TO service_role;
SELECT cron.schedule('emoria-expire-orders','* * * * *','SELECT private.expire_orders()');
SELECT cron.schedule('emoria-resilience-worker','* * * * *','SELECT private.dispatch_resilience_worker()');
NOTIFY pgrst,'reload schema';
COMMIT;
