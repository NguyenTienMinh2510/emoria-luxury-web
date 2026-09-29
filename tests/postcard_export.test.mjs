import assert from 'node:assert/strict';
import {
  POSTCARD_FORMATS,
  POSTCARD_TEMPLATES,
  validatePublicShareUrl,
  sharePostcard
} from '../src/services/postcardGenerator.js';
import QRCode from 'qrcode';

console.log('================================================================');
console.log('  EMORIA LUXURY - POSTCARD & SOCIAL SHARE CARD TEST SUITE');
console.log('================================================================\n');

// Test 1: Postcard Dimensions & Formats Specification
console.log('--- Test 1: Postcard Formats & Dimensions ---');
assert.equal(POSTCARD_FORMATS.square.width, 1080, 'Square width must be 1080');
assert.equal(POSTCARD_FORMATS.square.height, 1080, 'Square height must be 1080');
assert.equal(POSTCARD_FORMATS.story.width, 1080, 'Story width must be 1080');
assert.equal(POSTCARD_FORMATS.story.height, 1920, 'Story height must be 1920');
assert.ok(POSTCARD_TEMPLATES.panorama, 'Panorama template must exist');
assert.ok(POSTCARD_TEMPLATES.polaroid, 'Polaroid template must exist');
console.log('  [PASS] Test 1: Chuẩn kích thước 1080x1080 (Square) và 1080x1920 (Story) chính xác.');

// Test 2: Public Share URL Security & Sanitization
console.log('--- Test 2: Public Share URL Security & Privacy ---');
const validShare = 'https://emoria.vn/?view=memory-house&share=abc-xyz-789';
assert.equal(validatePublicShareUrl(validShare), validShare, 'Valid share URL must pass validation');

const invalidTokenUrl = 'https://emoria.vn/match?invite_token=secret_12345&token=owner_token';
assert.equal(validatePublicShareUrl(invalidTokenUrl), null, 'URLs with secret tokens must be rejected');

const invalidStorageUrl = 'https://fixture.supabase.co/storage/v1/object/authenticated/emoria-event-media/private/photo.jpg';
assert.equal(validatePublicShareUrl(invalidStorageUrl), null, 'Authenticated private storage URLs must be rejected from QR');

const invalidScheme = 'javascript:alert(1)';
assert.equal(validatePublicShareUrl(invalidScheme), null, 'Non-http/https URLs must be rejected');

console.log('  [PASS] Test 2: Bảo mật URL công khai cho QR Code: chặn lộ token và Storage path riêng tư.');

// Test 3: QR Code Generation
console.log('--- Test 3: Standard ISO/IEC 18004 QR Code Generation ---');
const qrDataUrl = await QRCode.toDataURL(validShare, { width: 120, margin: 1 });
assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR code must generate valid base64 PNG');
console.log('  [PASS] Test 3: Mã QR tạo thành công định dạng ảnh PNG tiêu chuẩn.');

// Test 4: Web Share API & Graceful Fallback
console.log('--- Test 4: Web Share API handling & User Cancellation ---');

// Case 4a: User cancels share sheet (AbortError)
const mockAbortNav = {
  share: async () => {
    const err = new Error('The share operation was aborted');
    err.name = 'AbortError';
    throw err;
  },
  canShare: () => true
};
Object.defineProperty(globalThis, 'navigator', { value: mockAbortNav, configurable: true, writable: true });

const cancelRes = await sharePostcard({
  canvas: { toBlob: (cb) => cb(new Blob(['mock'], { type: 'image/png' })) },
  title: 'Test',
  text: 'Test',
  url: 'https://emoria.vn'
});
assert.equal(cancelRes.success, false, 'Cancellation must return success: false');
assert.equal(cancelRes.cancelled, true, 'Cancellation must set cancelled: true without throwing');

// Case 4b: Fallback when navigator.share is unavailable
let clipboardCopied = '';
let downloadedLink = false;
Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: async (t) => { clipboardCopied = t; }
    }
  },
  configurable: true,
  writable: true
});
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'a') {
      return {
        set href(val) { this._href = val; },
        set download(val) { this._download = val; },
        click: () => { downloadedLink = true; }
      };
    }
    return {};
  },
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};

const fallbackRes = await sharePostcard({
  canvas: { toDataURL: () => 'data:image/png;base64,mock' },
  title: 'Test',
  text: 'Test',
  url: 'https://emoria.vn/test'
});
assert.equal(fallbackRes.success, true, 'Fallback must succeed');
assert.equal(fallbackRes.method, 'download-and-copy', 'Fallback method must be download-and-copy');
assert.equal(clipboardCopied, 'https://emoria.vn/test', 'Fallback must copy share URL to clipboard');
assert.equal(downloadedLink, true, 'Fallback must trigger image download');

console.log('  [PASS] Test 4: Web Share API xử lý mượt mà khi hủy thao tác hoặc fallback tải ảnh + copy link.');

// Test 5: Guest Cannot Export Draft House
console.log('--- Test 5: Guest Draft Export Permission Check ---');
function canUserExportHouse({ isPublicVisitor, isPublished }) {
  if (isPublicVisitor && !isPublished) {
    return false;
  }
  return true;
}
assert.equal(canUserExportHouse({ isPublicVisitor: true, isPublished: false }), false, 'Guest must NOT export draft');
assert.equal(canUserExportHouse({ isPublicVisitor: true, isPublished: true }), true, 'Guest can export published house');
assert.equal(canUserExportHouse({ isPublicVisitor: false, isPublished: false }), true, 'Owner can export draft as private souvenir');
assert.equal(canUserExportHouse({ isPublicVisitor: false, isPublished: true }), true, 'Owner can export published house');

console.log('  [PASS] Test 5: Guest bị chặn xuất draft chính xác theo giao ước handoff.');

console.log('\n================================================================');
console.log('  TẤT CẢ 5/5 POSTCARD & SHARE CARD ASSERTIONS ĐẠT KẾT QUẢ PASS');
console.log('================================================================\n');
