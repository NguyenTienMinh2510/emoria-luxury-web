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
    supabase.rpc = async () => ({ data: { success: false, message: 'denied' }, error: null });
    assert.equal((await m.fetchMemoryView('emoria-pulse')).message, 'denied');
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    supabase.rpc = async () => ({ data: null, error: { message: 'unavailable' } });
    assert.equal((await m.fetchMemoryView('emoria-pulse')).success, false);
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    supabase.rpc = async () => { throw new Error('offline'); };
    assert.equal((await m.fetchMemoryView('emoria-pulse')).success, false);
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    let sent;
    supabase.rpc = async (name, args) => {
      sent = { name, args };
      return { data: { success: true, grant_token: 'server-token' }, error: null };
    };
    await m.verifyMemoryPin(' EMORIA-PULSE ', ' 1000 ');
    assert.deepEqual(sent, { name: 'rpc_verify_memory_pin', args: { p_tag_uid: 'emoria-pulse', p_pin: '1000' } });
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
