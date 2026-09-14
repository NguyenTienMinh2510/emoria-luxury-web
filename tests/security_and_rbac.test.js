/**
 * EMORIA LUXURY - AUTOMATED SECURITY & RBAC AUDIT SUITE
 * Bộ kiểm thử tự động kiểm tra ma trận bảo mật và quyền truy cập thực tế.
 * Đánh giá tính toàn vẹn của:
 * 1. Chống rò rỉ Thư tay riêng tư trước khi nhập PIN.
 * 2. Cấp Grant Token khi nhập đúng PIN / Từ chối khi sai PIN.
 * 3. Chống mất PIN ngoài ý muốn với cơ chế pin_action (KEEP / SET / REMOVE).
 * 4. Tính toán tài chính đơn hàng độc lập & không tự động xác nhận VietQR.
 * 5. Báo cáo trung thực tình trạng hạ tầng kết nối đám mây (DNS check).
 */

import { spawnSync } from 'node:child_process';
import strictAssert from 'node:assert/strict';

// Demo audit is isolated from developer credentials and never writes cloud data.
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '';
const { fetchMemoryView, verifyMemoryPin, updateMemorySpace, getStoredGrantToken, setStoredGrantToken } = await import('../src/services/memoryService.js');
const { calculateOrderFinancials, createOrder } = await import('../src/services/orderBackendService.js');
const { getSystemAvailability, updateSystemAvailability } = await import('../src/services/authRoleService.js');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSecurityAudit() {
  console.log('================================================================');
  console.log('  EMORIA LUXURY - BỘ KIỂM THỬ BẢO MẬT & PHÂN QUYỀN RBAC THỰC TẾ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PHẦN 1: BẢO MẬT MEMORY SPACE & CHỐNG RÒ RỈ THƯ TAY (LEAK PREVENTION)
  // -------------------------------------------------------------
  console.log('--- PHẦN 1: KIỂM THỬ BẢO MẬT KHO KỶ NIỆM (MEMORY VAULT) ---');

  // Test 1: Khách truy cập tag có PIN bảo vệ -> Không được chứa trường letter
  const tagWithPin = 'emoria-pulse';
  // Đảm bảo xóa token cũ nếu có
  setStoredGrantToken(tagWithPin, null);
  const initialRes = await fetchMemoryView(tagWithPin);
  const initialView = initialRes.data;

  assert(
    initialView.is_protected === true,
    `Kỷ vật #${tagWithPin} phải được đánh dấu is_protected = true.`
  );
  assert(
    initialView.letter === null || initialView.letter === undefined,
    `Bảo mật dữ liệu: Thư tay (letter) KHÔNG được xuất hiện trong payload khi chưa mở khóa PIN.`
  );
  assert(
    initialView._pin_hash === undefined && initialView.pinCode === undefined,
    `Bảo mật dữ liệu: Hash PIN hoặc mã PIN tuyệt đối không bị lộ ra ngoài client.`
  );

  // Test 2: Nhập sai mã PIN -> Từ chối và không cấp grant token
  const wrongPinAttempt = await verifyMemoryPin(tagWithPin, '9999');
  assert(
    wrongPinAttempt.success === false,
    `Xác thực PIN: Nhập mã PIN sai ('9999') phải bị từ chối (success: false).`
  );
  assert(
    getStoredGrantToken(tagWithPin) === null,
    `Xác thực PIN: Không được cấp grant token trong session khi nhập sai PIN.`
  );

  // Test 3: Nhập đúng mã PIN ('1000') -> Cấp grant token và cho phép đọc thư
  const correctPinAttempt = await verifyMemoryPin(tagWithPin, '1000');
  assert(
    correctPinAttempt.success === true && Boolean(correctPinAttempt.grant_token),
    `Xác thực PIN: Nhập đúng mã PIN ('1000') phải thành công và trả về grant_token.`
  );

  const unlockedRes = await fetchMemoryView(tagWithPin);
  const unlockedView = unlockedRes.data;
  assert(
    typeof unlockedView.letter === 'string' && unlockedView.letter.length > 0,
    `Truy cập sau cấp quyền: Khi đã có grant token hợp lệ, nội dung thư tay được hiển thị trọn vẹn.`
  );

  // Test 4: Chống mất PIN ngoài ý muốn (Pin Preservation)
  // Cập nhật tiêu đề nhưng chọn pin_action = 'KEEP'
  await updateMemorySpace(tagWithPin, {
    title: 'Lời Nhắn Đã Được Cập Nhật (Kiểm Thử)',
    pin_action: 'KEEP',
  });

  // Xóa session grant token để kiểm tra xem PIN có còn hiệu lực bảo vệ không
  setStoredGrantToken(tagWithPin, null);
  const recheckRes = await fetchMemoryView(tagWithPin);
  const recheckView = recheckRes.data;
  assert(
    recheckView.is_protected === true,
    `Chống mất PIN: Khi updateMemorySpace với pin_action='KEEP', trạng thái bảo vệ PIN vẫn còn nguyên vẹn.`
  );
  assert(
    recheckView.letter === null,
    `Chống mất PIN: Thư tay vẫn được niêm phong an toàn sau khi cập nhật thông tin kỷ vật.`
  );

  // -------------------------------------------------------------
  // PHẦN 2: BẢO MẬT ĐƠN HÀNG & TÀI CHÍNH (ORDER FINANCIAL AUDIT)
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 2: KIỂM THỬ ĐƠN HÀNG & TÍNH TOÁN TÀI CHÍNH ĐỘC LẬP ---');

  // Test 5: Tính toán tài chính độc lập chống can thiệp giá từ client
  const spoofedItems = [
    { id: 'emoria-pulse', name: 'Nhẫn Emoria Pulse', price: 1000, quantity: 1 } // Giả mạo giá 1000đ từ client
  ];
  const financials = calculateOrderFinancials(spoofedItems, false);
  // Giá chuẩn của emoria-pulse trong catalog là 269.000 VNĐ
  assert(
    financials.subtotal === 269000,
    `Chống gian lận giá: Hệ thống tự tra cứu giá chuẩn (269.000 VNĐ) thay vì tin giá 1.000đ từ client.`
  );
  assert(
    financials.shippingFee === 30000, // Đơn dưới 1tr có phí vận chuyển 30.000 VNĐ
    `Chính sách vận chuyển: Đơn hàng dưới 1.000.000 VNĐ tính phí vận chuyển 30.000 VNĐ.`
  );

  // Test 6: Đơn hàng thanh toán VietQR không được tự động xác nhận client-side
  const newOrderResult = await createOrder({
    customerName: 'Nguyễn Văn Kiểm Thử',
    phone: '0901234567',
    address: '123 Đồng Khởi, Q.1',
    city: 'Hồ Chí Minh',
    paymentMethod: 'vietqr',
    items: spoofedItems,
  });

  assert(
    newOrderResult.success === true && newOrderResult.isDemo === true && newOrderResult.order.status === 'pending_payment',
    `Bảo mật thanh toán: Đơn hàng VietQR bắt buộc phải ở trạng thái 'pending_payment', tuyệt đối không tự 'confirmed'.`
  );

  // -------------------------------------------------------------
  // PHẦN 3: BẢO MẬT TOÀN HỆ THỐNG & TÍNH KHẢ DỤNG (AVAILABILITY GATE)
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 3: KIỂM THỬ TÍNH KHẢ DỤNG TOÀN HỆ THỐNG (SYSTEM GATE) ---');

  // Test 7: Chế độ bảo trì / Private Salon Gate
  updateSystemAvailability({ isMaintenanceMode: true, vipPasscode: 'AUDITPASS' });
  const sysConfig = getSystemAvailability();
  assert(
    sysConfig.isMaintenanceMode === true && sysConfig.vipPasscode === 'AUDITPASS',
    `Tính khả dụng: Cấu hình bảo trì Private Salon Gate và VIP Passcode được lưu giữ chuẩn xác.`
  );
  // Khôi phục lại trạng thái mở công khai
  updateSystemAvailability({ isMaintenanceMode: false, vipPasscode: 'EMORIAVIP' });

  // -------------------------------------------------------------
  // PHẦN 4: KIỂM ĐỊNH TRUNG THỰC HẠ TẦNG KẾT NỐI CLOUD SUPABASE
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 4: KIỂM ĐỊNH KẾT NỐI HẠ TẦNG THỰC TẾ CLOUD (DNS & API) ---');

  console.log(`[PASS] ${passedTests}/${totalTests} demo service assertions`);
  console.log('[NOT RUN] Cloud DB integration; DNS resolution is not evidence of RPC/RLS correctness.');

}

const configuredAudit = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  const { supabase, isSupabaseConfigured } = await import('./src/lib/supabaseClient.js');
  const { createOrder } = await import('./src/services/orderBackendService.js');
  const auth = await import('./src/services/authRoleService.js');
  const legacy = await import('./src/services/memoryViewerService.js');
  assert.equal(isSupabaseConfigured(), true);
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) };
  globalThis.window = { localStorage };
  const payload = { customerName: 'Test', phone: '0901234567', address: 'Test address', paymentMethod: 'vietqr', items: [{ id: 'emoria-pulse', quantity: 1 }] };
  supabase.auth.getSession = async () => ({ data: { session: null }, error: null });
  for (const scenario of ['error', 'exception', 'malformed', 'denied']) {
    store.clear();
    const called = [];
    supabase.from = () => { throw new Error('Direct table inserts are forbidden'); };
    supabase.rpc = async (name, args) => {
      called.push(name);
      assert.equal(args.p_payload.items[0].price, undefined);
      assert.ok(args.p_request_id);
      if (scenario === 'exception') throw new Error('network down');
      if (scenario === 'error') return { error: { message: 'denied' } };
      return { data: scenario === 'denied' ? { success: false } : {} };
    };
    const result = await createOrder(payload);
    assert.equal(result.success, false);
    assert.equal(result.isDraft, true);
    assert.equal(result.isDemo, undefined);
    assert.equal(result.order, undefined);
    assert.equal(result.error, 'Không thể đồng bộ đơn hàng lên hệ thống máy chủ. Đơn hàng đã được lưu nháp tại thiết bị của bạn.');
    assert.equal(store.has('emoria_orders_v1'), false);
    const drafts = JSON.parse(store.get('emoria_draft_orders'));
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].status, 'draft');
    assert.equal(drafts[0].items.length, 1);
    assert.deepEqual(called, ['rpc_create_order']);
  }
  supabase.rpc = async () => ({ data: { success: true, order: { id: 'EMO-server', status: 'pending_payment', totals: { finalTotal: 321000 } } } });
  const saved = await createOrder(payload);
  assert.equal(saved.success, true);
  assert.equal(saved.isDemo, undefined);
  assert.equal(saved.order.status, 'pending_payment');
  assert.equal(saved.order.totals.finalTotal, 321000);
  assert.equal(saved.order.id, 'EMO-server');
  localStorage.setItem = () => { throw new Error('quota exceeded'); };
  supabase.rpc = async () => ({ error: { message: 'denied' } });
  const unsaved = await createOrder(payload);
  assert.equal(unsaved.success, false);
  assert.equal(unsaved.isDraft, false);

  store.set('emoria_system_availability_v1', JSON.stringify({ isMaintenanceMode: false, vipPasscode: 'FORGED' }));
  for (const mode of ['error', 'exception', 'malformed', 'denied']) {
    supabase.rpc = async () => {
      if (mode === 'exception') throw new Error('offline');
      return mode === 'error' ? { error: { message: 'offline' } } : { data: mode === 'denied' ? { success: false } : {} };
    };
    assert.equal((await auth.fetchSystemStatus()).success, false);
    assert.equal(auth.getSystemAvailability().isMaintenanceMode, true);
    assert.equal(auth.getSystemAvailability().vipPasscode, '');
    await assert.rejects(() => legacy.getMemoryByTag('emoria-pulse'));
  }
  supabase.rpc = async name => {
    assert.equal(name, 'rpc_get_system_status');
    return { data: { success: true, is_maintenance_mode: false, maintenance_message: 'server' } };
  };
  assert.equal((await auth.fetchSystemStatus()).success, true);
  assert.equal(auth.getSystemAvailability().maintenanceMessage, 'server');
  await assert.rejects(() => auth.updateSystemAvailability({ vipPasscode: 'FORGED' }));
  console.log('[PASS] Configured order failures/drafts, server success, storage failure, maintenance and legacy fail-closed');
`], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, VITE_SUPABASE_URL: 'https://security-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  encoding: 'utf8', timeout: 15000,
});
strictAssert.equal(configuredAudit.status, 0, configuredAudit.error?.message || configuredAudit.stderr);
console.log(configuredAudit.stdout);

runSecurityAudit().catch((err) => {
  console.error('Lỗi khi chạy bộ kiểm thử:', err);
  process.exit(1);
});
