import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Run each mode in isolation: the service captures environment at import time.
const scenarios = [
  ['demo availability and grants', false, `
    const m = await import('./src/services/memoryService.js');
    const tag = 'emoria-pulse';
    assert.equal((await m.fetchMemoryView(tag, 'grant-valid')).data.letter, null);
    const pin = await m.verifyMemoryPin(tag, '1000');
    assert.equal(pin.success, true);
    assert.ok((await m.fetchMemoryView(tag)).data.letter);
    await m.updateMemoryAvailability(tag, { status: 'suspended' });
    assert.equal((await m.fetchMemoryView(tag)).success, false);
    assert.equal((await m.verifyMemoryPin(tag, '1000')).success, false);
    await m.updateMemoryAvailability(tag, { status: 'timed_lock', unlockDate: '2999-01-01T00:00:00Z' });
    assert.equal((await m.fetchMemoryView(tag)).success, false);
    await m.updateMemoryAvailability(tag, { status: 'timed_lock' });
    assert.equal((await m.fetchMemoryView(tag)).success, false);
    await m.updateMemoryAvailability(tag, { status: 'timed_lock', unlockDate: '2000-01-01T00:00:00Z' });
    assert.equal((await m.fetchMemoryView(tag)).success, true);
    await m.updateMemorySpace(tag, { pin_action: 'SET', pin_code: '2468' });
    assert.equal((await m.fetchMemoryView(tag, pin.grant_token)).data.letter, null);
    assert.equal((await m.verifyMemoryPin(tag, '1000')).success, false);
    assert.equal((await m.verifyMemoryPin(tag, '2468')).success, true);
  `],
  ['configured server denial and errors never fall back', true, `
    const { supabase } = await import('./src/lib/supabaseClient.js');
    const m = await import('./src/services/memoryService.js');
    supabase.auth.getSession = async () => ({data:{session:null}});
    globalThis.fetch = async () => Response.json({error:{message:'denied'}},{status:403});
    assert.equal((await m.fetchMemoryView('emoria-pulse')).message, 'denied');
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    globalThis.fetch = async () => Response.json({error:{message:'unavailable'}},{status:503});
    assert.equal((await m.fetchMemoryView('emoria-pulse')).success, false);
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await m.fetchMemoryView('emoria-pulse')).success, false);
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    let sent;
    globalThis.fetch = async (url, options) => {
      sent = { url, method:options.method, body:JSON.parse(options.body) };
      return Response.json({ success: true, grant_token: 'server-token' });
    };
    await m.verifyMemoryPin(' EMORIA-PULSE ', ' 1000 ');
    assert.deepEqual(sent, { url: '/api/v1/memories/emoria-pulse/grants', method:'POST', body: { pin: '1000' } });
    assert.equal(m.getStoredGrantToken('emoria-pulse'), 'server-token');
  `],
];

for (const [name, configured, code] of scenarios) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; ${code}`], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, VITE_SUPABASE_URL: configured ? 'https://memory-test.supabase.co' : '', VITE_SUPABASE_ANON_KEY: configured ? 'test-anon-key' : '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.status, 0, `${name}: ${result.error || result.stderr}`);
  console.log(`[PASS] ${name}`);
}
