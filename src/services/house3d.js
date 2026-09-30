// Stable room/slot IDs are shared with the Blender export and stored inside rooms JSON.
export const HOUSE_ROOM_IDS = ['beginning', 'first', 'little-things', 'memories', 'next-chapter'];

// 12 Handcrafted decorative assets with surface affinity & photo/text capacities
export const DECORATIONS = [
  ['calendar', 'Ngày của đôi mình', 1, 'table', ['table', 'wall']],
  ['cat', 'Mèo ngủ ngoan', 3, 'floor', ['floor', 'table']],
  ['nameplate', 'Biển tên nhỏ', 5, 'table', ['table', 'shelf', 'floor']],
  ['plant', 'Cây tình yêu', 7, 'floor', ['floor', 'table', 'shelf']],
  ['mugs', 'Cốc đôi', 9, 'table', ['table', 'shelf']],
  ['lamp', 'Đèn ấm áp', 11, 'table', ['table', 'shelf', 'floor']],
  ['vase', 'Bình tulip', 13, 'table', ['table', 'shelf']],
  ['album', 'Album kỷ niệm', 15, 'table', ['table', 'shelf']],
  ['bunting', 'Dây ảnh', 18, 'wall', ['wall', 'ceiling']],
  ['frame', 'Khung ảnh', 20, 'wall', ['wall', 'table']],
  ['birdcage', 'Chim nhỏ', 23, 'table', ['table', 'floor', 'shelf']],
  ['candles', 'Nến hẹn hò', 24, 'table', ['table', 'shelf']],
].map(([id, name, reference, defaultSurface, supportedSurfaces]) => ({
  id,
  name,
  image: `/memoryhouse/models/thumbnails/${id}.png`,
  reference: `/memoryhouse/Create_ONE_isolated_miniature__${reference}.jpg`,
  photoCount: { calendar: 1, nameplate: 1, frame: 1, album: 2, bunting: 3 }[id] || 0,
  textLabel: { calendar: 'Ngày / lời nhắn trên lịch', nameplate: 'Chữ trên biển tên', frame: 'Lời nhắn trên khung ảnh', album: 'Lời nhắn trên album', bunting: 'Lời nhắn trên dây ảnh' }[id] || null,
  defaultSurface: defaultSurface || 'table',
  supportedSurfaces: [...new Set(['floor', 'table', 'shelf', ...supportedSurfaces])]
}));

// Legacy 3 slots for backward compatibility
export const DECOR_SLOTS = [
  { id: 'left', name: 'Góc trái' },
  { id: 'table', name: 'Trên bàn' },
  { id: 'right', name: 'Góc phải' }
];

// Keep the established rooms JSON format while applying one mood to the house.
export const houseLighting = rooms => rooms?.find(r => r.id === 'beginning')?.lighting || rooms?.[0]?.lighting || 'day';
export const withHouseLighting = (rooms, lighting) => ['day', 'sunset', 'night'].includes(lighting) ? rooms.map(room => ({ ...room, lighting })) : rooms;

export function gyroTilt(beta, gamma, baseline, orientation = 0, sensitivity = .6) {
  if (![beta, gamma, ...baseline, orientation, sensitivity].every(Number.isFinite)) return [0, 0];
  const delta = (value, base) => ((value - base + 540) % 360) - 180;
  const b = delta(beta, baseline[0]), g = delta(gamma, baseline[1]), angle = orientation * Math.PI / 180;
  const soften = value => Math.abs(value) < .8 ? 0 : Math.sign(value) * Math.min(1, (Math.abs(value) - .8) / 18) * Math.max(.2, Math.min(1.5, sensitivity));
  return [soften(g * Math.cos(angle) + b * Math.sin(angle)), soften(b * Math.cos(angle) - g * Math.sin(angle))];
}

// Coordinate boundaries per room in meters (X center, Y floor, Z center, Width, Height, Depth)
export const ROOM_BOUNDS = {
  'beginning':     { x: -2.8, y: 0.14, z: 0.0,  width: 2.8, height: 2.4, depth: 2.6 },
  'first':         { x: 0.0,  y: 0.14, z: 0.0,  width: 2.8, height: 2.4, depth: 2.6 },
  'little-things': { x: 2.8,  y: 0.14, z: 0.0,  width: 2.8, height: 2.4, depth: 2.6 },
  'memories':      { x: -1.8, y: 2.25, z: 0.0,  width: 3.6, height: 2.4, depth: 2.6 },
  'next-chapter':  { x: 1.8,  y: 2.25, z: 0.0,  width: 3.6, height: 2.4, depth: 2.6 }
};

// Handcrafted asset bounding box dimensions (width X, depth Z, height Y) in meters
export const ASSET_DIMENSIONS = {
  calendar:  { width: 0.48, depth: 0.26, height: 0.46 },
  cat:       { width: 0.50, depth: 0.45, height: 0.28 },
  nameplate: { width: 0.76, depth: 0.26, height: 0.35 },
  plant:     { width: 0.40, depth: 0.40, height: 0.55 },
  mugs:      { width: 0.50, depth: 0.42, height: 0.30 },
  lamp:      { width: 0.36, depth: 0.36, height: 0.65 },
  vase:      { width: 0.35, depth: 0.35, height: 0.55 },
  album:     { width: 0.55, depth: 0.45, height: 0.15 },
  bunting:   { width: 0.95, depth: 0.24, height: 0.65 },
  frame:     { width: 0.52, depth: 0.24, height: 0.39 },
  birdcage:  { width: 0.35, depth: 0.35, height: 0.50 },
  candles:   { width: 0.35, depth: 0.25, height: 0.30 }
};

/**
 * Returns half-extents (X and Z) and height accounting for scale and yaw rotation.
 */
export function getRotatedExtents(itemId, scale = 1.0, rotationYaw = 0) {
  const dim = ASSET_DIMENSIONS[itemId] || { width: 0.3, depth: 0.3, height: 0.3 };
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1.0;
  const yaw = Number.isFinite(rotationYaw) ? rotationYaw : (Array.isArray(rotationYaw) ? rotationYaw[1] : 0);
  const rad = (yaw * Math.PI) / 180.0;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = dim.width / 2.0;
  const halfD = dim.depth / 2.0;

  return {
    halfX: round(s * (halfW * cos + halfD * sin)),
    halfZ: round(s * (halfW * sin + halfD * cos)),
    height: round(s * dim.height),
    width: dim.width,
    depth: dim.depth
  };
}

export function isWithinRoomBounds(roomId, item, position, scale = 1.0, rotation = 0) {
  const box = getRoomBoundingBox(roomId);
  const ext = getRotatedExtents(item, scale, rotation);
  const px = position[0], py = position[1], pz = position[2];
  return (
    px - ext.halfX >= box.minX &&
    px + ext.halfX <= box.maxX &&
    pz - ext.halfZ >= box.minZ &&
    pz + ext.halfZ <= box.maxZ &&
    py >= box.floorY &&
    py + ext.height <= box.ceilingY
  );
}

export function getRoomBoundingBox(roomId, margin = 0.0) {
  const b = ROOM_BOUNDS[roomId] || ROOM_BOUNDS['beginning'];
  const halfW = b.width / 2.0;
  const halfD = b.depth / 2.0;
  return {
    minX: round(b.x - halfW + margin),
    maxX: round(b.x + halfW - margin),
    minY: round(b.y),
    maxY: round(b.y + b.height - margin),
    minZ: round(b.z - halfD + margin),
    maxZ: round(b.z + halfD - margin),
    floorY: round(b.y),
    ceilingY: round(b.y + b.height),
    centerX: b.x,
    centerY: round(b.y + b.height / 2.0),
    centerZ: b.z,
    width: b.width,
    height: b.height,
    depth: b.depth
  };
}

// Default placement positions per room & surface
export function getDefaultPosition(roomId, surface = 'floor', slot = null) {
  const b = ROOM_BOUNDS[roomId] || ROOM_BOUNDS['beginning'];
  if (slot === 'left') {
    return [round(b.x - b.width * 0.28), round(b.y + 0.02), round(b.z - 0.28)];
  }
  if (slot === 'right') {
    return [round(b.x + b.width * 0.28), round(b.y + 0.02), round(b.z - 0.38)];
  }
  if (slot === 'table' || surface === 'table' || surface === 'shelf') {
    const tableY = roomId === 'beginning' ? 0.51 : (roomId === 'memories' || roomId === 'next-chapter' ? 2.76 : 0.77);
    const tableZ = roomId === 'beginning' ? -0.70 : (roomId === 'first' ? 0.14 : 0.57);
    return [round(b.x), round(tableY), round(tableZ)];
  }
  if (surface === 'wall') {
    const wallY = (b.y > 1.0 ? 3.45 : 1.45);
    return [round(b.x), round(wallY), round(1.05)];
  }
  // Floor default
  return [round(b.x + (Math.random() - 0.5) * 0.6), round(b.y + 0.02), round(b.z - 0.2)];
}

function round(val, dec = 3) {
  const factor = Math.pow(10, dec);
  return Math.round(val * factor) / factor;
}

// Generate unique instance ID
export function generateInstanceId(item = 'decor') {
  return `${item}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Normalizes any decoration entry (legacy slot-based or new freeform instance-based).
 */
export function normalizeDecoration(d, room) {
  if (!d || typeof d !== 'object') return null;
  const asset = DECORATIONS.find(a => a.id === d.item);
  if (!asset) return null;

  const isLegacySlotOnly = Boolean(d.slot && !d.id && !d.position);

  // If pure legacy slot item, maintain strict backward-compatible representation
  if (isLegacySlotOnly) {
    if (!DECOR_SLOTS.some(s => s.id === d.slot)) return null;
    const rot = [0, 90, 180, 270].includes(d.rotation) ? d.rotation : 0;
    return {
      slot: d.slot,
      item: d.item,
      rotation: rot,
      ...(asset.textLabel && typeof d.text === 'string' ? { text: d.text.slice(0, 80) } : {}),
      ...(asset.photoCount && Array.isArray(d.photos) ? {
        photos: d.photos.slice(0, asset.photoCount).map(id => (typeof id === 'string' && room?.memories?.some(m => m.id === id)) ? id : null)
      } : {})
    };
  }

  // Freeform instance representation
  const id = (typeof d.id === 'string' && d.id.trim()) ? d.id.trim() : generateInstanceId(d.item);
  const surface = (typeof d.surface === 'string' && ['floor', 'wall', 'table', 'shelf', 'ceiling'].includes(d.surface))
    ? d.surface
    : (d.slot === 'table' ? 'table' : asset.defaultSurface);

  let position = Array.isArray(d.position) && d.position.length === 3 && d.position.every(n => Number.isFinite(n))
    ? d.position.map(n => round(n))
    : getDefaultPosition(room?.id, surface, d.slot);

  let rotation = 0;
  if (Array.isArray(d.rotation) && d.rotation.length === 3 && d.rotation.every(n => Number.isFinite(n))) {
    rotation = d.rotation.map(n => round(n));
  } else if (Number.isFinite(d.rotation)) {
    rotation = round(d.rotation);
  }

  let scale = 1.0;
  if (Array.isArray(d.scale) && d.scale.length === 3 && d.scale.every(n => Number.isFinite(n))) {
    scale = d.scale.map(n => Math.max(0.3, Math.min(3.0, round(n))));
  } else if (Number.isFinite(d.scale)) {
    scale = Math.max(0.3, Math.min(3.0, round(d.scale)));
  }

  const result = {
    id,
    item: d.item,
    surface,
    position,
    rotation,
    scale,
    ...(d.parent_id && typeof d.parent_id === 'string' && d.parent_id !== id ? { parent_id: d.parent_id } : {}),
    ...(d.slot ? { slot: d.slot } : {}),
    ...(asset.textLabel && typeof d.text === 'string' ? { text: d.text.slice(0, 80) } : {}),
    ...(asset.photoCount && Array.isArray(d.photos) ? {
      photos: d.photos.slice(0, asset.photoCount).map(pId => (typeof pId === 'string' && room?.memories?.some(m => m.id === pId)) ? pId : null)
    } : {})
  };

  return result;
}

/**
 * Returns all decorations for a room.
 * Supports both legacy fixed slots and new freeform instances seamlessly.
 */
export function roomDecorations(room) {
  const entries = Array.isArray(room?.decorations) ? room.decorations : [];
  if (entries.length === 0) return [];

  // Check if all entries are legacy slot-based
  const hasInstanceOrFreeform = entries.some(d => d && (d.id || Array.isArray(d.position)));

  if (!hasInstanceOrFreeform) {
    // Exact backward-compatible logic for tests expecting only legacy slots
    return DECOR_SLOTS.flatMap(({ id }) => {
      const entry = entries.find(d => d?.slot === id && DECORATIONS.some(a => a.id === d.item));
      if (!entry) return [];
      const asset = DECORATIONS.find(a => a.id === entry.item);
      return [{
        slot: id,
        item: entry.item,
        rotation: [0, 90, 180, 270].includes(entry.rotation) ? entry.rotation : 0,
        ...(asset.textLabel && typeof entry.text === 'string' ? { text: entry.text.slice(0, 80) } : {}),
        ...(asset.photoCount && Array.isArray(entry.photos) ? {
          photos: entry.photos.slice(0, asset.photoCount).map(pid => typeof pid === 'string' && room.memories?.some(m => m.id === pid) ? pid : null)
        } : {})
      }];
    });
  }

  // Freeform mode: normalize all valid items without arbitrary item count cap
  const normalized = [];
  const seenIds = new Set();
  for (const entry of entries) {
    const norm = normalizeDecoration(entry, room);
    if (norm) {
      const idKey = norm.id || norm.slot;
      if (!seenIds.has(idKey)) {
        seenIds.add(idKey);
        normalized.push(norm);
      }
    }
  }
  return normalized;
}

/**
 * Adds a new decoration instance to a room.
 */
export function addDecorationInstance(room, item, options = {}) {
  const asset = DECORATIONS.find(d => d.id === item);
  if (!asset) return room;

  const current = roomDecorations(room);
  const id = options.id || generateInstanceId(item);
  const surface = options.surface || asset.defaultSurface;
  const position = options.position || getDefaultPosition(room?.id, surface);
  const rotation = options.rotation !== undefined ? options.rotation : 0;
  const scale = options.scale !== undefined ? options.scale : 1.0;

  const newInstance = {
    id,
    item,
    surface,
    position,
    rotation,
    scale,
    ...(options.parent_id ? { parent_id: options.parent_id } : {}),
    ...(options.text ? { text: options.text.slice(0, 80) } : {}),
    ...(asset.photoCount ? { photos: Array(asset.photoCount).fill(null) } : {})
  };

  return {
    ...room,
    decorations: [...current, newInstance]
  };
}

/**
 * Updates an existing decoration instance in a room and propagates transforms
 * to all descendants in the hierarchy (A -> B -> C -> ...) using Three.js conventions.
 */
export function updateDecorationInstance(room, instanceId, updates = {}, { validatedPlacement = false } = {}) {
  const current = roomDecorations(room);
  const target = current.find(d => d.id === instanceId || d.slot === instanceId);
  if (!target) return room;

  const mergedTarget = normalizeDecoration({ ...target, ...updates }, room);
  if (!mergedTarget) return room;

  const targetOldPos = Array.isArray(target.position) ? target.position : getDefaultPosition(room?.id, target.surface);
  const targetNewPos = mergedTarget.position;
  const targetOldRot = Array.isArray(target.rotation) ? target.rotation[1] : (target.rotation || 0);
  const targetNewRot = Array.isArray(mergedTarget.rotation) ? mergedTarget.rotation[1] : (mergedTarget.rotation || 0);
  const targetOldScale = Number.isFinite(target.scale) && target.scale > 0 ? target.scale : 1.0;
  const targetNewScale = Number.isFinite(mergedTarget.scale) && mergedTarget.scale > 0 ? mergedTarget.scale : 1.0;

  const childRotDelta = targetNewRot - targetOldRot;
  const scaleRatio = targetOldScale > 0 ? targetNewScale / targetOldScale : 1.0;

  // Build a map of all items
  const itemMap = new Map();
  for (const d of current) {
    itemMap.set(d.id || d.slot, { ...d });
  }
  itemMap.set(instanceId, mergedTarget);

  // Collect all multi-level descendants of target (A -> B -> C -> ...)
  const descendantIds = new Set();
  const toCheck = [instanceId];
  while (toCheck.length > 0) {
    const pId = toCheck.shift();
    for (const [id, item] of itemMap.entries()) {
      if (item.parent_id === pId && !descendantIds.has(id)) {
        descendantIds.add(id);
        toCheck.push(id);
      }
    }
  }

  // Propagate rigid transform to all descendants
  for (const dId of descendantIds) {
    const child = itemMap.get(dId);
    if (!child || !Array.isArray(child.position)) continue;

    const childOldPos = [...child.position];
    const childOldRot = Array.isArray(child.rotation) ? child.rotation[1] : (child.rotation || 0);
    const childOldScale = Number.isFinite(child.scale) && child.scale > 0 ? child.scale : 1.0;

    // Relative offset from root ancestor old center, scaled by parent scale change
    const relX = (childOldPos[0] - targetOldPos[0]) * scaleRatio;
    const relY = (childOldPos[1] - targetOldPos[1]) * scaleRatio;
    const relZ = (childOldPos[2] - targetOldPos[2]) * scaleRatio;

    // Three.js convention for Y-axis rotation (right-handed, CCW looking from +Y):
    // x' = x*cos(rad) + z*sin(rad)
    // z' = -x*sin(rad) + z*cos(rad)
    let rotX = relX;
    let rotZ = relZ;
    if (childRotDelta !== 0) {
      const rad = (childRotDelta * Math.PI) / 180.0;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      rotX = relX * cos + relZ * sin;
      rotZ = -relX * sin + relZ * cos;
    }

    const childNewX = round(targetNewPos[0] + rotX);
    const childNewY = round(targetNewPos[1] + relY);
    const childNewZ = round(targetNewPos[2] + rotZ);

    let childNewRot = child.rotation;
    if (childRotDelta !== 0) {
      if (Array.isArray(child.rotation) && child.rotation.length === 3) {
        childNewRot = [child.rotation[0], round((child.rotation[1] + childRotDelta) % 360), child.rotation[2]];
      } else {
        childNewRot = round((childOldRot + childRotDelta) % 360);
      }
    }

    let childNewScale = child.scale;
    if (scaleRatio !== 1.0) {
      if (Array.isArray(child.scale) && child.scale.length === 3) {
        childNewScale = child.scale.map(s => Math.max(0.3, Math.min(3.0, round(s * scaleRatio))));
      } else {
        childNewScale = Math.max(0.3, Math.min(3.0, round(childOldScale * scaleRatio)));
      }
    }

    itemMap.set(dId, {
      ...child,
      position: [childNewX, childNewY, childNewZ],
      rotation: childNewRot,
      scale: childNewScale
    });
  }

  // Bounds verification: if room has defined bounds, clamp affected items that would penetrate walls
  // A renderer-validated transform already includes the GLB's actual bounds and
  // pivot offset. Approximate catalog dimensions must not move it off its support.
  const changesTransform = ['position', 'rotation', 'scale'].some(key => key in updates);
  if (!validatedPlacement && changesTransform && room?.id && ROOM_BOUNDS[room.id]) {
    const box = getRoomBoundingBox(room.id);
    const affectedIds = new Set([instanceId, ...descendantIds]);
    for (const aId of affectedIds) {
      const d = itemMap.get(aId);
      if (d && Array.isArray(d.position)) {
        const ext = getRotatedExtents(d.item, d.scale, d.rotation);
        const clampedX = Math.max(box.minX + ext.halfX, Math.min(box.maxX - ext.halfX, d.position[0]));
        const clampedZ = Math.max(box.minZ + ext.halfZ, Math.min(box.maxZ - ext.halfZ, d.position[2]));
        const clampedY = Math.max(box.floorY, Math.min(box.ceilingY - ext.height, d.position[1]));
        itemMap.set(aId, {
          ...d,
          position: [round(clampedX), round(clampedY), round(clampedZ)]
        });
      }
    }
  }

  return {
    ...room,
    decorations: Array.from(itemMap.values())
  };
}

/**
 * Removes a decoration instance.
 * Options:
 *  - action: 'delete_children' | 'reparent' | 'drop_or_cancel'
 *  - targetParentId: ID of a different supporting object in the room
 *  - force: boolean
 * Prevents leaving unsupported items floating in mid-air.
 */
export function removeDecorationInstance(room, instanceId, options = {}) {
  if (options === 'cancel' || options?.action === 'cancel' || options?.cancel) {
    return room;
  }
  const current = roomDecorations(room);
  const deleteChildren = options === true || options?.action === 'delete_children';
  const targetParentId = typeof options === 'object' ? options.targetParentId : null;
  const targetParent = targetParentId ? current.find(d => d.id === targetParentId && d.id !== instanceId) : null;

  // Collect all multi-level descendants of instanceId
  const descendantIds = new Set();
  const toCheck = [instanceId];
  while (toCheck.length > 0) {
    const pId = toCheck.shift();
    for (const d of current) {
      if (d.parent_id === pId && !descendantIds.has(d.id)) {
        descendantIds.add(d.id);
        toCheck.push(d.id);
      }
    }
  }

  const target = current.find(d => d.id === instanceId || d.slot === instanceId);
  if (!target) return room;

  const remaining = [];
  for (const d of current) {
    if (d.id === instanceId || d.slot === instanceId) continue;

    if (descendantIds.has(d.id)) {
      if (deleteChildren) continue;

      if (targetParent) {
        // Reparent directly to designated target object
        const newSurface = targetParent.item === 'shelf' ? 'shelf' : 'table';
        const targetHeight = ASSET_DIMENSIONS[targetParent.item]?.height || 0.6;
        const newY = targetParent.position ? targetParent.position[1] + targetHeight : d.position[1];
        remaining.push({
          ...d,
          parent_id: targetParent.id,
          surface: newSurface,
          position: [targetParent.position[0], round(newY), targetParent.position[2]]
        });
        continue;
      }

      // Check if child supports floor
      const childAsset = DECORATIONS.find(a => a.id === d.item);
      const supportsFloor = childAsset?.supportedSurfaces?.includes('floor');
      if (supportsFloor) {
        const floorY = getRoomBoundingBox(room?.id).floorY;
        const droppedPos = Array.isArray(d.position)
          ? [d.position[0], round(floorY + 0.02), d.position[2]]
          : d.position;
        remaining.push({
          ...d,
          parent_id: null,
          surface: 'floor',
          position: droppedPos
        });
      } else {
        // Does not support floor (e.g. mugs, candles, vase)
        // Find another valid supporting object in the room
        const otherSupport = current.find(o =>
          o.id !== instanceId &&
          !descendantIds.has(o.id) &&
          ['table', 'desk', 'shelf'].some(s => o.item?.includes(s) || o.surface === s)
        );
        if (otherSupport) {
          const newSurface = otherSupport.item === 'shelf' ? 'shelf' : 'table';
          const targetHeight = ASSET_DIMENSIONS[otherSupport.item]?.height || 0.6;
          const newY = otherSupport.position ? otherSupport.position[1] + targetHeight : d.position[1];
          remaining.push({
            ...d,
            parent_id: otherSupport.id,
            surface: newSurface,
            position: [otherSupport.position[0], round(newY), otherSupport.position[2]]
          });
        } else if (options.force) {
          // If forced without other support, remove child rather than leaving it floating
          continue;
        } else {
          // Refuse to leave child floating in mid-air: cancel deletion
          return {
            ...room,
            cancelled: true,
            reason: 'unsupported_floating_children',
            unsupportedItems: [d.id]
          };
        }
      }
    } else {
      remaining.push(d);
    }
  }

  return {
    ...room,
    decorations: remaining
  };
}

/**
 * Returns other valid supporting objects in the room.
 */
export function getSupportingObjects(room, excludeId = null) {
  const decors = roomDecorations(room);
  const excludeIds = new Set();
  if (excludeId) {
    excludeIds.add(excludeId);
    const toCheck = [excludeId];
    while (toCheck.length > 0) {
      const pId = toCheck.shift();
      for (const d of decors) {
        if (d.parent_id === pId && !excludeIds.has(d.id)) {
          excludeIds.add(d.id);
          toCheck.push(d.id);
        }
      }
    }
  }

  return decors.filter(d =>
    !excludeIds.has(d.id) &&
    ['table', 'desk', 'shelf', 'album', 'nameplate'].includes(d.item)
  );
}

/**
 * Duplicates a decoration instance with an offset.
 */
export function cloneDecorationInstance(room, instanceId, offset = [0.15, 0, 0.15]) {
  const current = roomDecorations(room);
  const source = current.find(d => d.id === instanceId || d.slot === instanceId);
  if (!source) return room;

  const newId = generateInstanceId(source.item);
  const newPos = Array.isArray(source.position)
    ? [round(source.position[0] + offset[0]), round(source.position[1] + offset[1]), round(source.position[2] + offset[2])]
    : getDefaultPosition(room?.id, source.surface);

  const clone = {
    ...source,
    id: newId,
    slot: undefined, // Clone is freeform
    position: newPos,
    // Photos & text are duplicated but independent
    photos: Array.isArray(source.photos) ? [...source.photos] : [],
    text: source.text || ''
  };

  return {
    ...room,
    decorations: [...current, clone]
  };
}

/**
 * Legacy slot-based placement for 100% backward compatibility.
 */
export function placeDecoration(room, slot, item) {
  if (!DECOR_SLOTS.some(s => s.id === slot) || (item && !DECORATIONS.some(d => d.id === item))) return room;
  const decorations = roomDecorations(room).filter(d => d.slot !== slot);
  if (item) decorations.push({ slot, item, rotation: 0 });
  return { ...room, decorations };
}

/**
 * Serializes rooms for DB storage or draft save (stripping runtime signed URLs).
 */
export function serializeHouseRooms(rooms) {
  return rooms?.map(room => ({
    ...room,
    decorations: roomDecorations(room),
    memories: (room.memories || []).map(({ photo_url, ...memory }) => memory)
  }));
}

/**
 * Updates a photo attached to a decoration instance or slot.
 */
export function setDecorationPhoto(room, slotOrId, item, index, photoId) {
  const asset = DECORATIONS.find(d => d.id === item);
  if (!asset || index < 0 || index >= asset.photoCount) return room;

  return {
    ...room,
    decorations: roomDecorations(room).map(d => {
      const match = (d.id && d.id === slotOrId) || (d.slot && d.slot === slotOrId && d.item === item);
      if (!match) return d;
      const photos = Array.from({ length: asset.photoCount }, (_, i) => d.photos?.[i] || null);
      photos[index] = photoId;
      return { ...d, photos };
    })
  };
}
