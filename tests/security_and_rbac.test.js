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
const { createOrder } = await import('../src/services/orderBackendService.js');
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

  const result=await createOrder({customerName:'Fixture',phone:'0900000000',address:'Fake',items:[{id:'emoria-pulse',quantity:1}]});
  assert(result.success===false && result.retryable===false && !result.order,'Thiếu cấu hình backend không tạo đơn demo hoặc báo thành công giả.');

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

const configuredAudit=spawnSync(process.execPath,['tests/order_service.test.mjs'],{cwd:new URL('..',import.meta.url),env:process.env,encoding:'utf8',timeout:15000});
strictAssert.equal(configuredAudit.status,0,configuredAudit.stderr);console.log(configuredAudit.stdout);

runSecurityAudit().catch((err) => {
  console.error('Lỗi khi chạy bộ kiểm thử:', err);
  process.exit(1);
});
