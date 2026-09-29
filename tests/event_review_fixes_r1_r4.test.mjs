import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createClient } from '@supabase/supabase-js';

const config = JSON.parse(fs.readFileSync('.local/supabase.json', 'utf8'));
assert.equal(config.API_URL, 'http://127.0.0.1:55321', 'Only isolated local Supabase is allowed');
const accounts = JSON.parse(fs.readFileSync('.local/accounts.json', 'utf8'));
Object.assign(process.env, {
  SUPABASE_URL: config.API_URL,
  SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY
});

const { default: handler } = await import('../api/v1.js');
const server = http.createServer(handler);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;

const client = key =>
  createClient(config.API_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(15000) }) }
  });

const root = client(config.SERVICE_ROLE_KEY);
const anon = client(config.ANON_KEY);
const owner = client(config.ANON_KEY);
const adminClient = client(config.ANON_KEY);

const ok = async promise => {
  const r = await promise;
  if (r.error) throw r.error;
  return r.data;
};

async function api(method, route, body, auth = null, expected = 200) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${route} returned ${response.status} (expected ${expected}): ${JSON.stringify(result)}`);
  return { status: response.status, headers: response.headers, data: result };
}

console.log('--- Testing R1-R4 Regressions on Real Local Backend ---');

let ownerToken, adminToken, ownerId, adminId;
const tag = `test-review-${crypto.randomUUID()}`;
const photoPath = `${tag}/photo.png`;

try {
  // 1. Setup accounts
  const ownerAuth = await ok(owner.auth.signInWithPassword({ email: 'owner@emoria.test', password: accounts.password }));
  ownerToken = ownerAuth.session.access_token;
  ownerId = ownerAuth.user.id;

  const adminAuth = await ok(adminClient.auth.signInWithPassword({ email: 'admin@emoria.test', password: accounts.password }));
  adminToken = adminAuth.session.access_token;
  adminId = adminAuth.user.id;

  // Insert test space
  await ok(
    root.from('memory_spaces').insert({
      tag_uid: tag,
      jewelry_name: 'Review Space',
      title: 'Review Testing',
      owner_id: ownerId,
      availability_status: 'available'
    })
  );

  // Upload test photo
  const catImage = fs.readFileSync('public/memoryhouse/models/thumbnails/cat.png');
  await ok(owner.storage.from('emoria-event-media').upload(photoPath, catImage, { contentType: 'image/png' }));

  // =========================================================================
  // R1 Probe: Unshared letter in public response
  // =========================================================================
  console.log('\n[R1] Checking unshared letter privacy...');
  const roomsWithUnsharedLetter = [
    {
      id: 'beginning',
      name: 'Beginning Room',
      memories: [{ id: 'm1', photo_path: photoPath }],
      decorations: []
    },
    {
      id: 'next-chapter',
      name: 'Final Room',
      memories: [],
      decorations: [],
      journey_letter: {
        is_shared: false,
        title: 'TOP SECRET TITLE',
        content: 'TOP SECRET CONTENT THAT MUST NEVER LEAK',
        author: 'Secret Author',
        date: '2026-09-29'
      }
    }
  ];

  await api('PUT', `/memories/${tag}/house/draft`, {
    title: 'Secret House',
    theme: 'rose_romance',
    rooms: roomsWithUnsharedLetter
  }, ownerToken);

  const pubRes = await api('POST', `/memories/${tag}/house/publish`, {}, ownerToken);
  const shareId = pubRes.data.share_id;
  assert.ok(shareId, 'Must have share_id after publish');

  // Verify owner still sees the letter in draft
  const draftRes = await api('GET', `/memories/${tag}/house/draft`, null, ownerToken);
  const ownerLetter = draftRes.data.rooms.find(r => r.id === 'next-chapter')?.journey_letter;
  assert.equal(ownerLetter?.content, 'TOP SECRET CONTENT THAT MUST NEVER LEAK', 'Owner draft must retain private letter');

  // Check public HTTP endpoint
  const publicHttp = await api('GET', `/events/houses/share/${shareId}`, null, null, 200);
  const pubRoom = publicHttp.data.rooms.find(r => r.id === 'next-chapter');
  const pubLetter = pubRoom?.journey_letter;
  assert.ok(
    !pubLetter || !pubLetter.content || pubLetter.is_shared === false && !pubLetter.content,
    `[R1 FAIL] Public HTTP leaked unshared letter content: ${JSON.stringify(pubLetter)}`
  );
  assert.ok(!pubLetter?.title, '[R1 FAIL] Public HTTP leaked letter title');

  // Check public RPC direct call
  const rpcPublic = await ok(anon.rpc('rpc_house_public_view', { p_share_id: shareId }));
  const rpcRoom = rpcPublic.rooms.find(r => r.id === 'next-chapter');
  assert.ok(
    !rpcRoom?.journey_letter || !rpcRoom.journey_letter.content,
    `[R1 FAIL] Direct RPC rpc_house_public_view leaked unshared letter: ${JSON.stringify(rpcRoom?.journey_letter)}`
  );

  console.log('[R1 PASS] Unshared letter is strictly sanitized from public responses');

  // =========================================================================
  // R2 Probe: Hidden House blocking public routes
  // =========================================================================
  console.log('\n[R2] Checking hidden house blocking...');
  // Moderate: hide house using admin RPC
  // First submit a report to get report_id or hide directly
  const reportRes = await api('POST', '/events/reports', {
    resource_type: 'house',
    resource_id: shareId,
    reason: 'inappropriate_content',
    details: 'Testing moderation hide'
  }, null, 201);
  const reportId = reportRes.data.report_id;

  // Moderate to hide
  await api('POST', '/admin/events/moderate', {
    report_id: reportId,
    action: 'hide',
    reason: 'Violates terms'
  }, adminToken, 200);

  // Now public HTTP by share should be 403 Forbidden
  await api('GET', `/events/houses/share/${shareId}`, null, null, 403);
  // Public HTTP by tag should be 403 Forbidden
  await api('GET', `/events/houses/tag/${tag}`, null, null, 403);

  // Direct RPCs should also throw 42501
  const rpcShareErr = await anon.rpc('rpc_house_public_view', { p_share_id: shareId });
  assert.ok(rpcShareErr.error, '[R2 FAIL] rpc_house_public_view did not block hidden house');
  assert.equal(rpcShareErr.error.code, '42501', `[R2 FAIL] Expected 42501, got ${rpcShareErr.error.code}`);

  const rpcTagErr = await anon.rpc('rpc_house_tag_public_view', { p_tag_uid: tag });
  assert.ok(rpcTagErr.error, '[R2 FAIL] rpc_house_tag_public_view did not block hidden house');
  assert.equal(rpcTagErr.error.code, '42501', `[R2 FAIL] Expected 42501, got ${rpcTagErr.error.code}`);

  console.log('[R2 PASS] Hidden house is completely blocked from share and tag routes');

  // =========================================================================
  // R3 Probe: Admin list reports RPC signature
  // =========================================================================
  console.log('\n[R3] Checking admin list reports RPC signature...');
  const adminReportsRes = await api('GET', '/admin/events/reports?status=pending&limit=10&offset=0', null, adminToken, 200);
  assert.ok(Array.isArray(adminReportsRes.data.reports || adminReportsRes.data), '[R3 FAIL] Admin reports must return an array');

  // Direct RPC call with p_status, p_limit, p_offset
  const rpcReports = await adminClient.rpc('rpc_admin_list_reports', { p_status: null, p_limit: 10, p_offset: 0 });
  assert.ok(!rpcReports.error, `[R3 FAIL] Direct RPC rpc_admin_list_reports failed: ${rpcReports.error?.code} ${rpcReports.error?.message}`);

  // Non-admin call should fail with 42501
  const nonAdminRpc = await anon.rpc('rpc_admin_list_reports', { p_status: null, p_limit: 10, p_offset: 0 });
  assert.equal(nonAdminRpc.error?.code, '42501', '[R3 FAIL] Non-admin must be rejected from listing reports');

  console.log('[R3 PASS] Admin list reports signature matches and enforces admin permission');

  // =========================================================================
  // R4 Probe: Rate limiter bypass & atomic concurrency
  // =========================================================================
  console.log('\n[R4] Checking rate limiter security and concurrency...');
  const testKey = `test-limit-${crypto.randomUUID()}`;

  // Direct call with huge burst by anon should be rejected or clamped
  const directAnonLimit1 = await anon.rpc('rpc_check_rate_limit', {
    p_key: testKey,
    p_max_burst: 1,
    p_window_seconds: 60
  });
  assert.ok(directAnonLimit1.data?.allowed === true || directAnonLimit1.data?.allowed === 1, 'First request allowed');

  const directAnonLimit2 = await anon.rpc('rpc_check_rate_limit', {
    p_key: testKey,
    p_max_burst: 1,
    p_window_seconds: 60
  });
  assert.equal(directAnonLimit2.data?.allowed, false, 'Second request should be blocked at limit=1');

  // Caller attempts to bypass by passing 1,000,000 burst:
  const directBypass = await anon.rpc('rpc_check_rate_limit', {
    p_key: testKey,
    p_max_burst: 1000000,
    p_window_seconds: 60
  });
  assert.equal(directBypass.data?.allowed, false, '[R4 FAIL] Anon bypassed rate limit by passing 1,000,000 max_burst!');

  // Concurrency test: 10 concurrent requests to a brand new key
  const concKey = `conc-limit-${crypto.randomUUID()}`;
  const concPromises = Array.from({ length: 10 }, () =>
    anon.rpc('rpc_check_rate_limit', {
      p_key: concKey,
      p_max_burst: 5,
      p_window_seconds: 60
    })
  );
  const concResults = await Promise.all(concPromises);
  const errors = concResults.filter(r => r.error);
  assert.equal(errors.length, 0, `[R4 FAIL] Concurrency produced errors (race condition / unique violation): ${JSON.stringify(errors)}`);

  console.log('[R4 PASS] Rate limiter cannot be bypassed by caller parameters and handles concurrency atomically');

} finally {
  server.close();
  // Cleanup
  await root.from('memory_spaces').delete().eq('tag_uid', tag);
}
