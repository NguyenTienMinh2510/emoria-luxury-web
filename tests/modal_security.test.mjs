import assert from 'node:assert/strict';
import {labelWithQwen, craftLetter, warmupAi} from '../server/aiService.js';

const originalFetch = globalThis.fetch;
const names = ['MODAL_PROXY_TOKEN_ID', 'MODAL_PROXY_TOKEN_SECRET', 'MODAL_STORAGE_ORIGIN'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
const origin = 'https://offline-fixture.supabase.co';
const signed = origin + '/storage/v1/object/sign/emoria-memory/owner/photo.jpg?token=offline.jwt.signature';
const image = new Blob(['offline fixture'], {type: 'image/jpeg'});
const headers = {'Content-Type': 'application/json', 'Modal-Key': 'wk-offline-fixture', 'Modal-Secret': 'ws-offline-fixture'};
let calls = [];
const approved = () => Response.json({success: true, approved: true, labels: ['Gia đình'], violations: []});
const request = async (url, options) => { calls.push({url, options}); return approved(); };

try {
  delete process.env.MODAL_PROXY_TOKEN_ID;
  delete process.env.MODAL_PROXY_TOKEN_SECRET;
  process.env.MODAL_STORAGE_ORIGIN = origin;
  await assert.rejects(labelWithQwen(image, {fetchImpl: request}), error => error.status === 503);
  assert.equal(calls.length, 0, 'Missing auth must fail before an inference request');
  process.env.MODAL_PROXY_TOKEN_ID = headers['Modal-Key'];
  process.env.MODAL_PROXY_TOKEN_SECRET = headers['Modal-Secret'];
  for (const url of [
    'http://127.0.0.1/private', 'http://169.254.169.254/latest/meta-data', 'https://evil.example/private',
    signed.replace('offline-fixture', 'other-project'), signed.replace('https://', 'https://secret@'),
    signed.replace('emoria-memory', 'private-bucket'), signed.replace('/object/sign/', '/object/public/'),
    signed.replace('/photo.jpg', '/../private'), signed.replace('/photo.jpg', '/%2e%2e/private'),
    signed.replace('/photo.jpg', '/photo%2fprivate'), signed.replace('/photo.jpg', '/photo%252fprivate'),
    signed + '#private', signed + '&token=second', signed + '&redirect=http://127.0.0.1',
    signed.replace('?token=offline.jwt.signature', '?token='),
  ]) await assert.rejects(labelWithQwen(null, {url, type: 'image', fetchImpl: request}), error => error.status === 422);
  assert.equal(calls.length, 0);
  for (const url of [signed, signed.replace('emoria-memory', 'emoria-event-media')]) {
    assert.equal((await labelWithQwen(null, {url, type: 'image', fetchImpl: request})).approved, true);
    assert.deepEqual(calls.at(-1).options.headers, headers);
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), {url, type: 'image'});
  }
  await labelWithQwen(image, {fetchImpl: request});
  assert.deepEqual(calls.at(-1).options.headers, headers);
  const before = calls.length;
  const oversized = {size: 50 * 1024 * 1024 + 1, arrayBuffer() { assert.fail('Do not read an oversized Blob'); }};
  for (const media of [oversized, '', 'not-base64', '====']) {
    await assert.rejects(labelWithQwen(media, {fetchImpl: request}), error => error.status === 422);
  }
  await assert.rejects(labelWithQwen(image, {type: 'other', fetchImpl: request}), error => error.status === 422);
  assert.equal(calls.length, before);

  globalThis.fetch = async (url, options) => { calls.push({url, options}); return Response.json({success: true, status: 'ready'}); };
  assert.equal((await warmupAi()).warmed, true);
  assert.deepEqual(calls.at(-1).options.headers, headers);
  globalThis.fetch = async () => Response.json({success: false}, {status: 401});
  assert.equal((await warmupAi()).warmed, false, 'Rejected warmups cannot report a ready GPU');
  globalThis.fetch = async () => { throw new Error('private internal diagnostic fixture'); };
  assert.deepEqual(await warmupAi(), {success:false,warmed:false,message:'Dịch vụ AI chưa sẵn sàng. Hãy thử lại sau.'});

  const context = {body: {consent: true}, client: {rpc: name => { assert.equal(name, 'reserve_letter_generation'); return true; }}, db: async value => value};
  globalThis.fetch = async (url, options) => { calls.push({url, options}); return Response.json({success: true, letter: 'A sufficiently long offline letter fixture.'}); };
  assert.match((await craftLetter(context)).letter, /offline/);
  assert.deepEqual(calls.at(-1).options.headers, headers);
  delete process.env.MODAL_PROXY_TOKEN_SECRET;
  globalThis.fetch = async () => assert.fail('Missing auth must not call Modal');
  assert.equal((await warmupAi()).warmed, false);
} finally {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}
console.log('PASS Modal clients send server proxy credentials; missing auth, untrusted URLs/inputs fail before fetch; valid moderation, letters and warmups remain supported.');
