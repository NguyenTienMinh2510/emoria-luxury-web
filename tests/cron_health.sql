DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='emoria-expire-orders' AND active) THEN
  RAISE EXCEPTION 'Order expiry scheduler is not active';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job_run_details r JOIN cron.job j USING(jobid) WHERE j.jobname='emoria-expire-orders' AND r.status='succeeded' AND r.end_time>now()-interval '5 minutes') THEN
  RAISE EXCEPTION 'No successful order expiry scheduler run in the last five minutes';
 END IF;
END $$;
