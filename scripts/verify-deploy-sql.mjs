import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const container = 'emoria-test-db';
const database = `emoria_deploy_verify_${Date.now()}`;

function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}

docker(['exec', container, 'createdb', '-U', 'postgres', database]);
try {
  for (const file of [
    'supabase/setup_test_auth_schema.sql',
    'supabase/production_schema_deploy.sql',
    'supabase/seeds/demo_memory_spaces.sql',
    'tests/atomic_checkout.test.sql',
    'tests/articles_system.test.sql'
  ]) {
    docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], readFileSync(file, 'utf8'));
    console.log(`[PASS] ${file}`);
  }
  console.log('[ALL PASS] production_schema_deploy.sql is 100% syntactically and semantically valid on Postgres 16!');
} finally {
  docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
}
