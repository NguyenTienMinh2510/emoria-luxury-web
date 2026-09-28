import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Explicit local container only; never connects to a cloud/production database.
const container = process.env.EMORIA_TEST_CONTAINER || 'emoria-test-db';
const database = `emoria_regression_${Date.now()}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}
docker(['exec', container, 'createdb', '-U', 'postgres', database]);
try {
  for (const file of [
    'supabase/setup_test_auth_schema.sql',
    'supabase/migrations/20260913_init_emoria_schema.sql',
    'supabase/seeds/demo_memory_spaces.sql',
    'supabase/migrations/20260914000000_atomic_checkout.sql',
    'supabase/migrations/20260914_articles_system.sql',
    'tests/atomic_checkout.test.sql',
    'tests/articles_system.test.sql',
    'tests/backend_database.test.sql'
  ]) {
    docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    console.log(`[PASS] ${file}`);
  }
  const query = sql => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], sql);
  const parallelQuery = sql => new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], { timeout: 15000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    child.stdin.end(sql);
  });
  query('DELETE FROM public.memory_pin_failures;');
  await Promise.all(Array.from({ length: 8 }, () => parallelQuery("SET ROLE anon; SELECT public.rpc_verify_memory_pin('emoria-pulse', 'wrong');")));
  assert.equal(query('SELECT failed_count FROM public.memory_pin_failures;').trim(), '5');
  query("UPDATE public.memory_spaces SET owner_id = NULL WHERE tag_uid = 'emoria-lumen';");
  const claims = await Promise.all(['1', '2'].map(id => parallelQuery(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000${id}', false); SELECT public.rpc_claim_nfc_chip('emoria-lumen', 'OWNER-LUMEN-2025')->>'success';`)));
  assert.equal(claims.filter(result => result.trim().endsWith('true')).length, 1);
  assert.equal(claims.filter(result => result.trim().endsWith('false')).length, 1);
  console.log('[PASS] Concurrent PIN attempts stop at 5; concurrent claims have exactly one owner');
} finally {
  // Only remove the database created by this invocation.
  docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
}
