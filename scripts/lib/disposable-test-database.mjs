import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
// Test containers only. Never defaults to the developer's Supabase sandbox.
export const container = process.env.EMORIA_TEST_CONTAINER || 'emoria-test-db';
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container) || /sandbox|production/i.test(container)) {
  throw new Error('EMORIA_TEST_CONTAINER must name a dedicated local test container.');
}
// The original five migrations used mixed-width version names. Preserve the
// established bootstrap order, then apply timestamped migrations normally.
const bootstrap=['20260913_init_emoria_schema.sql','20260914000000_atomic_checkout.sql','20260914_articles_system.sql','202609140001_store_operations.sql','202609140002_editor_security.sql'];
export const migrations = [...bootstrap,...readdirSync(new URL('supabase/migrations/', root))
  .filter(file => /^\d+_.+\.sql$/.test(file)&&!bootstrap.includes(file)).sort()];
const providerExtension = /^CREATE EXTENSION IF NOT EXISTS (pg_cron WITH SCHEMA pg_catalog|pg_net WITH SCHEMA extensions);\s*$/gm;

function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `docker exited ${result.status}`);
  return result.stdout;
}

export function withDisposableDatabase(label, execute) {
  const database = `emoria_test_${label}_${Date.now()}_${randomBytes(4).toString('hex')}`;
  if (!/^emoria_test_[a-z_]+_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Unsafe generated test database name');
  docker(['exec', container, 'createdb', '-U', 'postgres', '--', database]);
  console.log(`[ISOLATED] ${container}/${database}; only this database will be removed.`);
  const sql = input => docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-c', 'SET search_path=public,extensions;', '-f', '-'], input);
  const apply = file => {
    let content = readFileSync(new URL(file, root), 'utf8');
    if (file.startsWith('supabase/migrations/')) {
      content = content.replace(providerExtension, statement => {
        console.log(`[PROVIDER SHIM] ${file}: ${statement.trim()} (schema contract only)`);
        return `-- Test provider schema supplied instead: ${statement.trim()}`;
      });
    }
    sql(content);
    console.log(`[PASS] ${file}`);
  };
  try {
    console.log('[LIMIT] Provider fixture validates SQL/RLS contracts; Auth/Storage/Realtime/cron/pg_net services require separate provider checks.');
    apply('tests/fixtures/provider_schema.sql');
    return execute({ apply, sql, database });
  } finally {
    // Drop only the exact randomly generated DB created above; no DROP TABLE in postgres.
    docker(['exec', container, 'dropdb', '-U', 'postgres', '--', database]);
    console.log(`[CLEANUP] Removed ${database}`);
  }
}
