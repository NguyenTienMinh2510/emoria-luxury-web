import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://fixture.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'fixture-anon-key';

import handler from '../api/v1.js';

function createMockReqRes({ method = 'GET', url = '/api/v1/system/status', headers = {}, body } = {}) {
  const reqHeaders = { 'content-type': 'application/json', ...headers };
  const req = {
    method,
    url,
    originalUrl: url,
    headers: reqHeaders,
    body,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) {
        yield typeof body === 'string' ? body : JSON.stringify(body);
      }
    }
  };

  const resHeaders = {};
  let responseData = '';
  const res = {
    statusCode: 200,
    setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
    getHeader(k) { return resHeaders[k.toLowerCase()]; },
    end(chunk) {
      if (chunk) responseData += chunk;
      this.writableEnded = true;
    },
    writableEnded: false
  };

  return { req, res, getBody: () => responseData ? JSON.parse(responseData) : null, resHeaders };
}

async function runHardeningTests() {
  console.log('--- TESTING API SECURITY HEADERS & DEFENSES ---');

  // Test 1: Security Headers on response
  {
    const { req, res, resHeaders } = createMockReqRes({
      method: 'POST',
      url: '/api/v1/orders/lookup',
      body: { id: 'invalid-id' }
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400, 'Invalid order ID must be rejected with 400');
    assert.equal(resHeaders['x-frame-options'], 'DENY');
    assert.equal(resHeaders['x-content-type-options'], 'nosniff');
    assert.equal(resHeaders['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(resHeaders['permissions-policy']);
    console.log('  [PASS] Security headers (X-Frame-Options, Permissions-Policy, nosniff, Referrer-Policy) correctly attached.');
  }

  // Test 2: Malformed URI encoding must return clean 400 rather than crashing with 500
  {
    const { req, res, getBody } = createMockReqRes({
      method: 'GET',
      url: '/api/v1/products/%E0%A4%A/try-on'
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(getBody().error?.code, 'HTTP_400');
    console.log('  [PASS] Malformed URI parameter caught safely and returned 400 Bad Request.');
  }

  // Test 3: House Reply with invalid request_id (non-UUID) rejected with 400
  {
    const { req, res, getBody } = createMockReqRes({
      method: 'POST',
      url: '/api/v1/events/houses/replies',
      body: {
        request_id: 'not-a-uuid-string',
        kind: 'heart',
        name: 'Test',
        tag_uid: 'emoria-pulse'
      }
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(getBody().error?.message, /Mã yêu cầu không hợp lệ/);
    console.log('  [PASS] House Reply with malformed request_id blocked with 400 before reaching database.');
  }

  // Test 4: House Reply with invalid kind rejected with 400
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/v1/events/houses/replies',
      body: {
        request_id: crypto.randomUUID(),
        kind: 'malicious_kind',
        name: 'Test',
        tag_uid: 'emoria-pulse'
      }
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    console.log('  [PASS] House Reply with invalid kind blocked with 400.');
  }

  // Test 5: Content Reports with invalid resource_type rejected with 400
  {
    const { req, res, getBody } = createMockReqRes({
      method: 'POST',
      url: '/api/v1/events/reports',
      body: {
        resource_type: 'unauthorized_table',
        resource_id: '123',
        reason: 'spam'
      }
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(getBody().error?.message, /Loại tài nguyên báo cáo không hợp lệ/);
    console.log('  [PASS] Content Report with invalid resource_type blocked with 400.');
  }

  // Test 6: Content Reports for match/guestbook with malformed UUID rejected with 400
  {
    const { req, res, getBody } = createMockReqRes({
      method: 'POST',
      url: '/api/v1/events/reports',
      body: {
        resource_type: 'guestbook',
        resource_id: 'malformed-id',
        reason: 'spam'
      }
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(getBody().error?.message, /Mã đối tượng báo cáo không hợp lệ/);
    console.log('  [PASS] Content Report for guestbook with non-UUID blocked with 400 (preventing 22P02 DB crash).');
  }

  // Test 7: Contacts with invalid phone number rejected with 400
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/v1/contacts',
      body: {
        name: 'Nguyen Van A',
        phone: 'invalid-phone-letters'
      }
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    console.log('  [PASS] Contacts request with invalid phone blocked with 400.');
  }

  console.log('\nALL 7 HARDENING SECURITY TESTS PASSED SUCCESSFULLY!\n');
}

runHardeningTests().catch(err => {
  console.error(err);
  process.exit(1);
});
