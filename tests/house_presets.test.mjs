import assert from 'node:assert/strict';
import { HOUSE_PRESETS, ROOM_PRESETS, applyPresetToHouse, applyPresetToSingleRoom } from '../src/data/housePresets.js';
import { DECORATIONS } from '../src/services/house3d.js';


console.log('--- Testing House Presets and Room Presets ---');

// 1. Verify global HOUSE_PRESETS structure
assert.ok(Array.isArray(HOUSE_PRESETS) && HOUSE_PRESETS.length >= 3, 'Must have at least 3 global house presets');
for (const p of HOUSE_PRESETS) {
  assert.ok(p.id && p.name && p.tagline && p.icon, `Preset ${p.id} must have basic metadata`);
}
console.log('✓ Global HOUSE_PRESETS metadata verified');

// 2. Verify ROOM_PRESETS structure for all 5 rooms
const expectedRooms = ['beginning', 'first', 'little-things', 'memories', 'next-chapter'];
const catalogItemKeys = new Set(DECORATIONS.map(d => d.id));

for (const roomId of expectedRooms) {
  assert.ok(Array.isArray(ROOM_PRESETS[roomId]), `ROOM_PRESETS must have an entry for ${roomId}`);
  assert.ok(ROOM_PRESETS[roomId].length >= 3, `Room ${roomId} must have at least 3 distinct presets`);
  for (const preset of ROOM_PRESETS[roomId]) {
    assert.ok(preset.id && preset.name && preset.description, `Room preset in ${roomId} must have id, name, and description`);
    assert.ok(Array.isArray(preset.decorations) && preset.decorations.length >= 3, `Room preset ${preset.id} must have at least 3 decorations`);
    for (const item of preset.decorations) {
      assert.ok(catalogItemKeys.has(item.item), `Item ${item.item} in room preset ${preset.id} must exist in DECORATIONS catalog`);
      assert.ok(Array.isArray(item.position) && item.position.length === 3, `Item ${item.id} position must be [x, y, z]`);
    }
  }
}
console.log('✓ Individual ROOM_PRESETS for all 5 rooms verified with valid FURNISHING_CATALOG items');

// 3. Test applyPresetToSingleRoom
const mockRoom = {
  id: 'beginning',
  name: 'Khởi đầu dịu êm',
  memories: [
    { id: 'mem-1', title: 'Khoảnh khắc đầu tiên', mediaUrl: 'https://example.com/photo1.jpg' },
    { id: 'mem-2', title: 'Bức ảnh thứ hai', mediaUrl: 'https://example.com/photo2.jpg' }
  ],
  decorations: [
    { id: 'old-1', item: 'chair', surface: 'floor', position: [0, 0, 0] }
  ]
};

const beginningPresets = ROOM_PRESETS['beginning'];
for (const preset of beginningPresets) {
  const updatedRoom = applyPresetToSingleRoom(mockRoom, preset.id);
  assert.equal(updatedRoom.id, mockRoom.id);
  assert.equal(updatedRoom.memories.length, 2, 'Memories must be preserved');
  assert.ok(updatedRoom.decorations.length >= preset.decorations.length, 'Decorations must be updated to preset furnishing');
  
  // If the preset has frames/photos items, memories are attached
  const photoHolder = updatedRoom.decorations.find(d => ['frame', 'star-frame', 'calendar', 'nameplate', 'album', 'bunting'].includes(d.item));
  if (photoHolder) {
    assert.ok(photoHolder.photos && photoHolder.photos.length > 0, 'Photo holders should receive user memory IDs');
    assert.equal(photoHolder.photos[0], 'mem-1');
  }

  // Verify furnishingBaseline is populated
  assert.ok(updatedRoom.furnishingBaseline && Array.isArray(updatedRoom.furnishingBaseline));
  assert.equal(updatedRoom.furnishingBaseline.length, updatedRoom.decorations.length);
  assert.equal(updatedRoom.furnishingVersion, 2);
}
console.log('✓ applyPresetToSingleRoom successfully maps memories and sets furnishingBaseline without breaking trigger');

// 4. Test applyPresetToHouse
const mockHouse = expectedRooms.map(id => ({
  id,
  name: `Phòng ${id}`,
  memories: [{ id: `mem-${id}`, title: `Memory ${id}`, mediaUrl: `https://example.com/${id}.jpg` }],
  decorations: []
}));

for (const p of HOUSE_PRESETS) {
  const newHouse = applyPresetToHouse(mockHouse, p.id);
  assert.equal(newHouse.length, 5, 'House must retain 5 rooms');
  for (const r of newHouse) {
    assert.equal(r.memories.length, 1, `Room ${r.id} must retain its memories`);
    assert.ok(r.decorations.length >= 3, `Room ${r.id} must have decorations from preset ${p.id}`);
    assert.ok(r.furnishingBaseline && r.furnishingBaseline.length === r.decorations.length);
  }
}
console.log('✓ applyPresetToHouse verified for all 5 rooms across all whole-house presets');

console.log('All House Presets & Room Presets tests passed successfully!');
