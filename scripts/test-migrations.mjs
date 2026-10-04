import { migrations, withDisposableDatabase } from './lib/disposable-test-database.mjs';

withDisposableDatabase('migrations', ({ apply, sql }) => {
  for (const file of migrations) apply(`supabase/migrations/${file}`);
  // Exercise the operations health query and check final permissions/schedules.
  sql(`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM cron.job WHERE jobname='emoria-expire-orders' AND active)
      THEN RAISE EXCEPTION 'Order expiry cron missing'; END IF;
    IF NOT EXISTS(SELECT FROM cron.job WHERE jobname='emoria-resilience-worker' AND active)
      THEN RAISE EXCEPTION 'Resilience worker cron missing'; END IF;
    IF has_function_privilege('anon','public.rpc_run_resilience_maintenance()','EXECUTE')
      THEN RAISE EXCEPTION 'Maintenance RPC exposed to anon'; END IF;
  END $$;
  SELECT public.rpc_resilience_health();`);
  // Run maintenance too: PL/pgSQL bodies resolve some relation columns lazily.
  sql('SELECT public.rpc_run_resilience_maintenance();');
  apply('tests/resilience_ai_database.test.sql');
  console.log(`[ALL PASS] ${migrations.length} migrations applied in chronological order to a fresh disposable database.`);
});
