import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DECORATIONS,
  DECOR_SLOTS,
  ROOM_BOUNDS,
  ASSET_DIMENSIONS,
  getDefaultPosition,
  getRotatedExtents,
  getRoomBoundingBox,
  isWithinRoomBounds,
  normalizeDecoration,
  roomDecorations,
  addDecorationInstance,
  updateDecorationInstance,
  removeDecorationInstance,
  cloneDecorationInstance,
  getSupportingObjects,
  placeDecoration,
  setDecorationPhoto,
  serializeHouseRooms,
  HOUSE_ROOM_IDS
} from '../src/services/house3d.js';

console.log('================================================================');
console.log('  EMORIA LUXURY - FREEFORM DECORATION ARCHITECTURE TEST SUITE');
console.log('================================================================\n');

// Mock room helper
function createMockRoom(id = 'first', decorations = []) {
  return {
    id,
    name: 'Phòng Đầu Tiên',
    decorations,
    memories: [
      { id: 'mem_1', photo_url: 'https://cdn.emoria.vn/mem1.jpg', caption: 'Ngày đầu tiên' },
      { id: 'mem_2', photo_url: 'https://cdn.emoria.vn/mem2.jpg', caption: 'Nụ cười' }
    ]
  };
}

let passed = 0;

// Test 1: Multiple copies of same item in a single room (no slot limitation)
{
  console.log('--- Test 1: Cho phép thêm nhiều bản sao cùng loại món đồ ---');
  let room = createMockRoom('first');
  room = addDecorationInstance(room, 'cat');
  room = addDecorationInstance(room, 'cat');
  room = addDecorationInstance(room, 'cat');

  const decor = roomDecorations(room);
  assert.equal(decor.length, 3, 'Phải có đúng 3 chú mèo trong phòng');
  assert.equal(new Set(decor.map(d => d.id)).size, 3, 'Mỗi bản sao phải có instance ID duy nhất');
  assert(decor.every(d => d.item === 'cat'), 'Tất cả đều là mèo');
  console.log('  [PASS] Thêm 3 bản sao của cùng món đồ cat thành công với unique instance IDs.');
  passed++;
}

// Test 2: Freeform 3D transform (Position, Rotation, Scale)
{
  console.log('\n--- Test 2: Tọa độ, xoay và kích thước tự do trong không gian phòng ---');
  let room = createMockRoom('first');
  room = addDecorationInstance(room, 'plant', {
    position: [0.5, 0.20, -0.8],
    rotation: 45,
    scale: 1.2
  });

  const decor = roomDecorations(room);
  assert.equal(decor.length, 1);
  const plant = decor[0];
  assert.deepEqual(plant.position, [0.5, 0.20, -0.8]);
  assert.equal(plant.rotation, 45);
  assert.equal(plant.scale, 1.2);

  // Update transform within room boundaries
  room = updateDecorationInstance(room, plant.id, {
    position: [0.8, 0.20, -0.5],
    rotation: 90,
    scale: 0.8
  });
  const updated = roomDecorations(room)[0];
  assert.deepEqual(updated.position, [0.8, 0.20, -0.5]);
  assert.equal(updated.rotation, 90);
  assert.equal(updated.scale, 0.8);
  console.log('  [PASS] Transform tự do (position, rotation, scale) cập nhật chuẩn xác.');
  passed++;
}

// Test 3: Surface affinity and support rules
{
  console.log('\n--- Test 3: Quy tắc bề mặt đỡ (Floor, Wall, Table) ---');
  const catAsset = DECORATIONS.find(d => d.id === 'cat');
  const frameAsset = DECORATIONS.find(d => d.id === 'frame');
  const mugAsset = DECORATIONS.find(d => d.id === 'mugs');
  const buntingAsset = DECORATIONS.find(d => d.id === 'bunting');

  assert(catAsset.supportedSurfaces.includes('floor'), 'Mèo phải đặt trên sàn');
  assert(!catAsset.supportedSurfaces.includes('wall'), 'Mèo không được treo tường');

  assert(frameAsset.supportedSurfaces.includes('wall'), 'Khung ảnh treo tường được');
  assert(frameAsset.supportedSurfaces.includes('table'), 'Khung ảnh đặt bàn được');

  assert(mugAsset.supportedSurfaces.includes('table'), 'Cốc đặt trên bàn');
  assert(buntingAsset.supportedSurfaces.includes('wall'), 'Dây ảnh treo trên tường');

  console.log('  [PASS] Metadata và quy tắc bề mặt đỡ chính xác cho các nhóm đồ vật.');
  passed++;
}

// Test 4: Table parenting and delta translation propagation
{
  console.log('\n--- Test 4: Quan hệ đồ trên bàn (Table Parenting & Delta Propagation) ---');
  let room = createMockRoom('first');
  // 1. Thêm album kỷ niệm (vật đỡ)
  room = addDecorationInstance(room, 'album', { position: [0.0, 0.75, 0.0], surface: 'table' });
  const album = roomDecorations(room)[0];

  // 2. Thêm cốc đôi và khung ảnh đặt cạnh / trên album
  room = addDecorationInstance(room, 'mugs', {
    position: [0.2, 0.75, 0.1],
    surface: 'table',
    parent_id: album.id
  });
  room = addDecorationInstance(room, 'frame', {
    position: [-0.3, 0.75, -0.1],
    surface: 'table',
    parent_id: album.id
  });

  const decorBefore = roomDecorations(room);
  assert.equal(decorBefore.length, 3);
  const mugsBefore = decorBefore.find(d => d.item === 'mugs');
  assert.equal(mugsBefore.parent_id, album.id);
  assert.deepEqual(mugsBefore.position, [0.2, 0.75, 0.1]);

  // 3. Di chuyển vật đỡ một khoảng delta (+0.5 dọc X, -0.3 dọc Z)
  room = updateDecorationInstance(room, album.id, {
    position: [0.5, 0.75, -0.3]
  });

  const decorAfter = roomDecorations(room);
  const albumAfter = decorAfter.find(d => d.id === album.id);
  const mugsAfter = decorAfter.find(d => d.item === 'mugs');
  const frameAfter = decorAfter.find(d => d.item === 'frame');

  assert.deepEqual(albumAfter.position, [0.5, 0.75, -0.3]);
  // Cốc và khung ảnh phải được dịch chuyển cùng delta (+0.5 dọc X, -0.3 dọc Z)
  assert.deepEqual(mugsAfter.position, [0.7, 0.75, -0.2], 'Cốc phải dịch chuyển theo vật đỡ');
  assert.deepEqual(frameAfter.position, [0.2, 0.75, -0.4], 'Khung ảnh phải dịch chuyển theo vật đỡ');

  console.log('  [PASS] Di chuyển vật đỡ tự động dịch chuyển tất cả đồ vật con trên bề mặt.');
  passed++;
}

// Test 5: Safe deletion of supporting objects (No unsupported floating items, reparent / drop / cancel)
{
  console.log('\n--- Test 5: Xóa vật đỡ an toàn - không để đồ lơ lửng, hỗ trợ chuyển vật đỡ & hủy ---');

  // Case 5a: Standing decorations now support the floor as well as tables
  let roomNoOtherTable = createMockRoom('first');
  roomNoOtherTable = addDecorationInstance(roomNoOtherTable, 'album', { position: [0.0, 0.75, 0.0], surface: 'table' });
  const albumAloneId = roomDecorations(roomNoOtherTable)[0].id;
  roomNoOtherTable = addDecorationInstance(roomNoOtherTable, 'mugs', {
    position: [0.1, 0.75, 0.0],
    surface: 'table',
    parent_id: albumAloneId
  });

  const cancelResult = removeDecorationInstance(roomNoOtherTable, albumAloneId, { action: 'drop_or_cancel' });
  assert.equal(roomDecorations(cancelResult).length, 1);
  assert.equal(roomDecorations(cancelResult)[0].surface, 'floor', 'Standing mugs can be moved to the floor');

  // Case 5b: Reparent to designated supporting object in room
  let roomWithTarget = createMockRoom('first');
  roomWithTarget = addDecorationInstance(roomWithTarget, 'album', { position: [0.0, 0.75, 0.0], surface: 'table' });
  const oldAlbumId = roomDecorations(roomWithTarget)[0].id;
  roomWithTarget = addDecorationInstance(roomWithTarget, 'nameplate', { position: [0.6, 0.75, 0.0], surface: 'table' });
  const newSupportId = roomDecorations(roomWithTarget)[1].id;

  roomWithTarget = addDecorationInstance(roomWithTarget, 'mugs', {
    position: [0.1, 0.75, 0.0],
    surface: 'table',
    parent_id: oldAlbumId
  });

  const reparentedRoom = removeDecorationInstance(roomWithTarget, oldAlbumId, {
    action: 'reparent',
    targetParentId: newSupportId
  });
  const reparentedDecor = roomDecorations(reparentedRoom);
  assert.equal(reparentedDecor.length, 2, 'Album đã bị xóa, còn lại nameplate và mugs');
  const movedMugs = reparentedDecor.find(d => d.item === 'mugs');
  assert.equal(movedMugs.parent_id, newSupportId, 'Mugs đã chuyển sang nhận newSupportId làm parent');
  assert.equal(movedMugs.position[0], 0.6, 'Mugs được dời sang vị trí vật đỡ mới');

  // Case 5c: Children supporting floor drop to floor safely
  let roomWithFloorChild = createMockRoom('first');
  roomWithFloorChild = addDecorationInstance(roomWithFloorChild, 'album', { position: [0.0, 0.75, 0.0], surface: 'table' });
  const albumWithCatId = roomDecorations(roomWithFloorChild)[0].id;
  roomWithFloorChild = addDecorationInstance(roomWithFloorChild, 'cat', {
    position: [0.1, 0.75, 0.0],
    surface: 'table',
    parent_id: albumWithCatId
  });

  const droppedRoom = removeDecorationInstance(roomWithFloorChild, albumWithCatId, { action: 'drop_or_cancel' });
  const droppedDecor = roomDecorations(droppedRoom);
  assert.equal(droppedDecor.length, 1);
  const droppedCat = droppedDecor[0];
  assert(!droppedCat.parent_id, 'Mèo không còn parent_id');
  assert.equal(droppedCat.surface, 'floor', 'Mèo chuyển thành bề mặt sàn');
  assert.equal(droppedCat.position[1], 0.16, 'Mèo hạ xuống độ cao sàn nhà');

  // Case 5d: Delete with 'delete_children' removes both parent and children cleanly
  const allDeletedRoom = removeDecorationInstance(roomWithFloorChild, albumWithCatId, { action: 'delete_children' });
  assert.equal(roomDecorations(allDeletedRoom).length, 0, 'Xóa cả vật đỡ lẫn con sạch sẽ');

  // Case 5e: Cancel action leaves room 100% unchanged
  const cancelledActionRoom = removeDecorationInstance(roomWithFloorChild, albumWithCatId, { action: 'cancel' });
  assert.equal(roomDecorations(cancelledActionRoom).length, 2, 'Hủy thao tác giữ nguyên trạng thái');

  console.log('  [PASS] Xóa vật đỡ xử lý triệt để: chuyển vật đỡ, hạ sàn hợp lệ, hủy an toàn, không để đồ lơ lửng.');
  passed++;
}

// Test 6: Isolation of photo and text between duplicate instances
{
  console.log('\n--- Test 6: Cách ly ảnh và chữ giữa các bản sao cùng loại ---');
  let room = createMockRoom('first');
  // Thêm 2 khung ảnh
  room = addDecorationInstance(room, 'frame', { text: 'Khung 1' });
  const frame1 = roomDecorations(room)[0];

  room = addDecorationInstance(room, 'frame', { text: 'Khung 2' });
  const frame2 = roomDecorations(room)[1];

  // Gắn ảnh cho Khung 1
  room = setDecorationPhoto(room, frame1.id, 'frame', 0, 'mem_1');

  // Gắn ảnh cho Khung 2
  room = setDecorationPhoto(room, frame2.id, 'frame', 0, 'mem_2');

  const checkDecor = roomDecorations(room);
  const checkedF1 = checkDecor.find(d => d.id === frame1.id);
  const checkedF2 = checkDecor.find(d => d.id === frame2.id);

  assert.deepEqual(checkedF1.photos, ['mem_1']);
  assert.deepEqual(checkedF2.photos, ['mem_2']);
  assert.notEqual(checkedF1.photos[0], checkedF2.photos[0], 'Ảnh của 2 khung phải hoàn toàn độc lập');

  // Kiểm tra clone
  room = cloneDecorationInstance(room, frame1.id);
  const cloned = roomDecorations(room)[2];
  assert.notEqual(cloned.id, frame1.id, 'Bản sao phải có ID mới');
  assert.deepEqual(cloned.photos, ['mem_1'], 'Bản sao sao chép nội dung ban đầu');

  // Đổi ảnh của bản sao không ảnh hưởng bản gốc
  room = setDecorationPhoto(room, cloned.id, 'frame', 0, null);
  const originalAfter = roomDecorations(room).find(d => d.id === frame1.id);
  const cloneAfter = roomDecorations(room).find(d => d.id === cloned.id);
  assert.deepEqual(originalAfter.photos, ['mem_1'], 'Bản gốc không bị thay đổi');
  assert.deepEqual(cloneAfter.photos, [null], 'Bản sao đã gỡ ảnh độc lập');

  console.log('  [PASS] Ảnh và chữ của từng instance được phân lập độc lập tuyệt đối.');
  passed++;
}

// Test 7: Boundary clamping within ROOM_BOUNDS
{
  console.log('\n--- Test 7: Kiểm soát tọa độ trong giới hạn không gian phòng ---');
  const bounds = ROOM_BOUNDS['beginning'];
  assert(bounds, 'Phải có bounds cho phòng beginning');
  assert(bounds.width > 0, 'Phòng phải có chiều rộng');
  assert(bounds.height > 0, 'Phòng phải có chiều cao');
  assert(bounds.depth > 0, 'Phòng phải có chiều sâu');

  const defPos = getDefaultPosition('beginning', 'floor');
  const minX = bounds.x - bounds.width / 2;
  const maxX = bounds.x + bounds.width / 2;
  assert(defPos[0] >= minX && defPos[0] <= maxX, 'Vị trí X phải nằm trong chiều rộng phòng');
  assert(defPos[1] >= bounds.y - 0.2, 'Vị trí Y phải trên sàn');
  console.log('  [PASS] Bounding box và vị trí mặc định nằm trọn vẹn trong không gian phòng.');
  passed++;
}

// Test 8: Regression test - no 30-item cap (> 30 items preserved across normalize/save/reload)
{
  console.log('\n--- Test 8: Không giới hạn 30 món - Dữ liệu > 40 món được giữ nguyên 100% ---');
  let room = createMockRoom('beginning');
  for (let i = 0; i < 45; i++) {
    room = addDecorationInstance(room, 'cat', {
      position: [-2.8 + (i % 5) * 0.05, 0.16, -0.5 + Math.floor(i / 5) * 0.05]
    });
  }
  const decor = roomDecorations(room);
  assert.equal(decor.length, 45, 'Phòng phải lưu và giữ nguyên toàn bộ 45 món đồ không bị cắt gọt');

  // Serialize and reload
  const serialized = serializeHouseRooms([room]);
  assert.equal(serialized[0].decorations.length, 45, 'Serialization giữ nguyên 45 món đồ');

  const reloaded = roomDecorations(serialized[0]);
  assert.equal(reloaded.length, 45, 'Reload từ dữ liệu serialized giữ nguyên 45 món đồ');
  console.log('  [PASS] Dữ liệu 45 món được bảo toàn trọn vẹn qua add / normalize / serialize / reload.');
  passed++;
}

// Test 9: Backward compatibility with legacy slot layouts
{
  console.log('\n--- Test 9: Tương thích ngược 100% với nhà cũ dùng slot ---');
  const legacyRoom = {
    id: 'dating',
    name: 'Hẹn Hò Dưới Mưa',
    decorations: [
      { slot: 'left', item: 'cat', rotation: 90 },
      { slot: 'table', item: 'plant', rotation: 0 },
      { slot: 'right', item: 'calendar', rotation: 180, text: '28.09.2026' }
    ]
  };

  const normalized = roomDecorations(legacyRoom);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].slot, 'left');
  assert.equal(normalized[0].item, 'cat');
  assert.equal(normalized[0].rotation, 90);

  // When converted to freeform instance (e.g. user moves or customizes it)
  const freeformInst = normalizeDecoration({ ...legacyRoom.decorations[0], id: 'dating_left_cat' }, legacyRoom);
  assert.equal(freeformInst.surface, 'floor');
  assert(Array.isArray(freeformInst.position), 'Slot cũ được tự động map vị trí 3D');

  assert.equal(normalized[2].item, 'calendar');
  assert.equal(normalized[2].text, '28.09.2026', 'Text cũ được bảo toàn');

  // Legacy placeDecoration still functions
  const altered = placeDecoration(legacyRoom, 'table', 'vase');
  assert.equal(roomDecorations(altered).find(d => d.slot === 'table')?.item, 'vase');

  console.log('  [PASS] Nhà cũ dạng slot được chuyển đổi và hiển thị đúng 100% không mất dữ liệu.');
  passed++;
}

// Test 10: Serialization strips runtime signed URLs and preserves instance attributes
{
  console.log('\n--- Test 10: Serialization làm sạch URLs và bảo toàn cấu trúc instance ---');
  let room = createMockRoom('beginning', [
    {
      id: 'inst_123',
      item: 'nameplate',
      surface: 'table',
      position: [-2.8, 0.51, -0.4],
      rotation: 0,
      scale: 1.0,
      photos: ['mem_1'],
      text: 'Lời nhắn gửi'
    }
  ]);
  room.memories[0].photo_url = 'https://signed-url.supabase.co/storage/v1/temp-token-12345';

  const serialized = serializeHouseRooms([room]);
  assert.equal(serialized.length, 1);
  const sRoom = serialized[0];
  assert.equal(sRoom.memories[0].photo_url, undefined, 'Runtime signed URL bị gỡ bỏ khi lưu DB');
  assert.equal(sRoom.decorations[0].id, 'inst_123');
  assert.deepEqual(sRoom.decorations[0].position, [-2.8, 0.51, -0.4]);
  assert.equal(sRoom.decorations[0].text, 'Lời nhắn gửi');

  console.log('  [PASS] Serialization bảo mật và lưu trữ đầy đủ thuộc tính instance.');
  passed++;
}

// Test 11: getRoomBoundingBox contract across all 5 rooms
{
  console.log('\n--- Test 11: Contract ROOM_BOUNDS & getRoomBoundingBox cho 5 phòng ---');
  for (const rid of HOUSE_ROOM_IDS) {
    const box = getRoomBoundingBox(rid);
    assert(Number.isFinite(box.minX) && Number.isFinite(box.maxX), `${rid} X phải hữu hạn`);
    assert(Number.isFinite(box.minY) && Number.isFinite(box.maxY), `${rid} Y phải hữu hạn`);
    assert(Number.isFinite(box.minZ) && Number.isFinite(box.maxZ), `${rid} Z phải hữu hạn`);
    assert(box.minX < box.maxX, `${rid} minX < maxX`);
    assert(box.minY < box.maxY, `${rid} minY < maxY`);
    assert(box.minZ < box.maxZ, `${rid} minZ < maxZ`);
    assert(box.centerX >= box.minX && box.centerX <= box.maxX, `${rid} centerX phải nằm trong bounds`);
  }
  console.log('  [PASS] getRoomBoundingBox tính toán min/max và tọa độ hữu hạn chuẩn xác trên cả 5 phòng.');
  passed++;
}

// Test 12: Cross-validate rotation convention with Three.js Vector3 and Matrix4
{
  console.log('\n--- Test 12: Đối chiếu trực tiếp công thức xoay với Three.js Vector3 & Matrix4 ---');

  // Verify multiple test angles and offsets against Three.js Vector3.applyAxisAngle & Matrix4.makeRotationY
  const testCases = [
    { relX: 0.2, relY: 0.0, relZ: 0.0, deg: 90 },
    { relX: 0.3, relY: 0.1, relZ: -0.2, deg: 45 },
    { relX: -0.4, relY: 0.0, relZ: 0.25, deg: 180 },
    { relX: 0.15, relY: 0.05, relZ: 0.35, deg: -60 }
  ];

  for (const tc of testCases) {
    let room = createMockRoom('first');
    // Parent at (0, 0.75, 0)
    room = addDecorationInstance(room, 'album', {
      position: [0.0, 0.75, 0.0],
      rotation: 0,
      surface: 'table'
    });
    const albumId = roomDecorations(room)[0].id;

    // Child with offset (relX, relY, relZ)
    room = addDecorationInstance(room, 'mugs', {
      position: [tc.relX, 0.75 + tc.relY, tc.relZ],
      rotation: 0,
      surface: 'table',
      parent_id: albumId
    });

    // Update parent rotation
    room = updateDecorationInstance(room, albumId, { rotation: tc.deg });
    const mugsActual = roomDecorations(room).find(d => d.item === 'mugs');

    // Expected position computed independently using Three.js Vector3.applyAxisAngle
    const threeVec = new THREE.Vector3(tc.relX, tc.relY, tc.relZ);
    threeVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), (tc.deg * Math.PI) / 180);
    const expectedX = Math.round((0.0 + threeVec.x) * 1000) / 1000;
    const expectedZ = Math.round((0.0 + threeVec.z) * 1000) / 1000;

    assert.equal(mugsActual.position[0], expectedX, `deg=${tc.deg} X phải khớp Three.js`);
    assert.equal(mugsActual.position[2], expectedZ, `deg=${tc.deg} Z phải khớp Three.js`);

    // Expected position also cross-verified against Three.js Matrix4
    const mat4 = new THREE.Matrix4().makeRotationY((tc.deg * Math.PI) / 180);
    const matVec = new THREE.Vector3(tc.relX, tc.relY, tc.relZ).applyMatrix4(mat4);
    assert.equal(mugsActual.position[0], Math.round(matVec.x * 1000) / 1000, `deg=${tc.deg} X khớp Matrix4`);
    assert.equal(mugsActual.position[2], Math.round(matVec.z * 1000) / 1000, `deg=${tc.deg} Z khớp Matrix4`);
  }

  console.log('  [PASS] Công thức xoay đối chiếu 100% hoàn hảo với THREE.Vector3.applyAxisAngle và THREE.Matrix4.');
  passed++;
}

// Test 13: Multi-level transform hierarchy (A -> B -> C -> ...) translation, rotation, scale
{
  console.log('\n--- Test 13: Quan hệ đa cấp (A đỡ B, B đỡ C) - Dịch chuyển, xoay & thu phóng nhất quán ---');
  let room = createMockRoom('first');

  // Root A: Table
  room = addDecorationInstance(room, 'nameplate', {
    id: 'support_A',
    position: [0.0, 0.16, 0.0],
    rotation: 0,
    scale: 1.0,
    surface: 'floor'
  });

  // Child B: Album placed on Table A
  room = addDecorationInstance(room, 'album', {
    id: 'support_B',
    position: [0.2, 0.51, 0.1],
    rotation: 0,
    scale: 1.0,
    surface: 'table',
    parent_id: 'support_A'
  });

  // Grandchild C: Mugs placed on Album B
  room = addDecorationInstance(room, 'mugs', {
    id: 'child_C',
    position: [0.3, 0.66, 0.15],
    rotation: 0,
    scale: 1.0,
    surface: 'table',
    parent_id: 'support_B'
  });

  // Simulate exact Three.js scene graph hierarchy to cross-check
  const threeA = new THREE.Object3D();
  const threeB = new THREE.Object3D();
  const threeC = new THREE.Object3D();
  threeA.add(threeB);
  threeB.add(threeC);

  threeA.position.set(0.0, 0.16, 0.0);
  threeB.position.set(0.2, 0.51 - 0.16, 0.1);
  threeC.position.set(0.3 - 0.2, 0.66 - 0.51, 0.15 - 0.1);
  threeA.updateMatrixWorld(true);

  // Apply composite transform to A: move to (0.3, 0.16, -0.2), rotate 90 deg, scale 1.2
  room = updateDecorationInstance(room, 'support_A', {
    position: [0.3, 0.16, -0.2],
    rotation: 90,
    scale: 1.2
  });

  // Apply same transform to Three.js scene graph
  threeA.position.set(0.3, 0.16, -0.2);
  threeA.rotation.y = (90 * Math.PI) / 180;
  threeA.scale.set(1.2, 1.2, 1.2);
  threeA.updateMatrixWorld(true);

  const bWorld = new THREE.Vector3();
  const cWorld = new THREE.Vector3();
  threeB.getWorldPosition(bWorld);
  threeC.getWorldPosition(cWorld);

  const decorAfter = roomDecorations(room);
  const aAfter = decorAfter.find(d => d.id === 'support_A');
  const bAfter = decorAfter.find(d => d.id === 'support_B');
  const cAfter = decorAfter.find(d => d.id === 'child_C');

  // Verify A
  assert.deepEqual(aAfter.position, [0.3, 0.16, -0.2]);
  assert.equal(aAfter.rotation, 90);
  assert.equal(aAfter.scale, 1.2);

  // Verify B against Three.js world position
  assert.equal(bAfter.position[0], Math.round(bWorld.x * 1000) / 1000, 'B X phải khớp Three.js scene graph');
  assert.equal(bAfter.position[1], Math.round(bWorld.y * 1000) / 1000, 'B Y phải khớp Three.js scene graph');
  assert.equal(bAfter.position[2], Math.round(bWorld.z * 1000) / 1000, 'B Z phải khớp Three.js scene graph');
  assert.equal(bAfter.rotation, 90, 'B rotation phải thừa hưởng rotDelta');
  assert.equal(bAfter.scale, 1.2, 'B scale phải cập nhật theo tỷ lệ scale của parent');

  // Verify C against Three.js world position
  assert.equal(cAfter.position[0], Math.round(cWorld.x * 1000) / 1000, 'C X phải khớp Three.js scene graph');
  assert.equal(cAfter.position[1], Math.round(cWorld.y * 1000) / 1000, 'C Y phải khớp Three.js scene graph');
  assert.equal(cAfter.position[2], Math.round(cWorld.z * 1000) / 1000, 'C Z phải khớp Three.js scene graph');
  assert.equal(cAfter.rotation, 90, 'C rotation phải thừa hưởng rotDelta');
  assert.equal(cAfter.scale, 1.2, 'C scale phải cập nhật theo tỷ lệ scale của parent');

  console.log('  [PASS] Toàn bộ cây quan hệ A -> B -> C biến đổi dịch chuyển, xoay và phóng to đồng nhất với Three.js.');
  passed++;
}

// Test 14: Bounds check after transform on all descendants
{
  console.log('\n--- Test 14: Kiểm tra giới hạn phòng (Bounds Verification) sau biến đổi đa cấp ---');
  let room = createMockRoom('first');

  room = addDecorationInstance(room, 'album', {
    id: 'box_parent',
    position: [0.0, 0.75, 0.0],
    rotation: 0,
    surface: 'table'
  });
  room = addDecorationInstance(room, 'mugs', {
    id: 'box_child',
    position: [0.3, 0.75, 0.2],
    rotation: 0,
    surface: 'table',
    parent_id: 'box_parent'
  });

  // Move parent to a position near room edge
  room = updateDecorationInstance(room, 'box_parent', {
    position: [0.8, 0.75, -0.6],
    rotation: 45
  });

  const decor = roomDecorations(room);
  for (const item of decor) {
    const within = isWithinRoomBounds('first', item.item, item.position, item.scale, item.rotation);
    assert(within, `Món ${item.item} (${item.id}) phải nằm hoàn toàn trong giới hạn phòng first`);

    // Verify coordinates explicitly against room bounding box
    const box = getRoomBoundingBox('first');
    const ext = getRotatedExtents(item.item, item.scale, item.rotation);
    assert(item.position[0] - ext.halfX >= box.minX - 0.001, 'Không xuyên tường trái X');
    assert(item.position[0] + ext.halfX <= box.maxX + 0.001, 'Không xuyên tường phải X');
    assert(item.position[2] - ext.halfZ >= box.minZ - 0.001, 'Không xuyên tường sau Z');
    assert(item.position[2] + ext.halfZ <= box.maxZ + 0.001, 'Không xuyên tường trước Z');
    assert(item.position[1] >= box.floorY - 0.001, 'Không xuyên sàn Y');
    assert(item.position[1] + ext.height <= box.ceilingY + 0.001, 'Không xuyên trần Y');
  }

  console.log('  [PASS] Tất cả các vật phẩm và con cháu sau transform đều vượt qua kiểm tra bounds không xuyên tường.');
  passed++;
}

console.log('\n================================================================');
console.log(`  HOÀN THÀNH TẤT CẢ ${passed}/${passed} KIỂM THỬ FREEFORM DECORATION PASS!`);
console.log('================================================================\n');
