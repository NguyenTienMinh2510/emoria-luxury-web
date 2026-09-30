import * as THREE from 'three';
import { DECORATIONS, getRoomBoundingBox } from './house3d.js';

export function transformDecoration(object, position, rotation = 0, scale = 1) {
  object.position.fromArray(position);
  object.rotation.set(...(Array.isArray(rotation) ? rotation : [0, rotation, 0]).map(v => v * Math.PI / 180));
  object.scale.fromArray(Array.isArray(scale) ? scale : [scale, scale, scale]);
  object.updateMatrixWorld(true);
}

// GLB room meshes are merged by material, so furniture names and mesh bounds
// cannot identify a tabletop, seat or floor. Read the exported triangles instead.
export function placementTriangles(root) {
  const triangles = [];
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const { position } = mesh.geometry.attributes, index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld));
      const triangle = new THREE.Triangle(...vertices);
      triangles.push({ triangle, box: new THREE.Box3().setFromPoints(vertices), normal: triangle.getNormal(new THREE.Vector3()) });
    }
  });
  return triangles;
}

export function createPlacementSolver({ template, roomId, triangles, collisionTriangles = triangles, obstacles = [], rotation = 0, scale = 1 }) {
  const model = template.clone(true);
  transformDecoration(model, [0, 0, 0], rotation, scale);
  const bounds = new THREE.Box3().setFromObject(model, true);
  const room = getRoomBoundingBox(roomId);
  const roomBox = new THREE.Box3(new THREE.Vector3(room.minX, room.floorY - .03, room.minZ), new THREE.Vector3(room.maxX, room.ceilingY, room.maxZ));
  const nearbyTriangles = collisionTriangles.filter(e => e.box.intersectsBox(roomBox));
  const vertices = [];
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      if (p.y <= bounds.min.y + .04) vertices.push(p);
    }
  });
  // Sample the actual base outline, including round trays and off-centre feet.
  const footprint = Array.from({ length: 16 }, (_, i) => {
    const x = Math.cos(i * Math.PI / 8), z = Math.sin(i * Math.PI / 8);
    return vertices.reduce((best, p) => p.x * x + p.z * z > best.x * x + best.z * z ? p : best, vertices[0]);
  }).filter(Boolean);
  footprint.push(new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2));
  const surfaces = new Map();
  for (const entry of triangles) {
    const { box, normal } = entry;
    if (box.max.x < room.minX || box.min.x > room.maxX || box.max.y < room.floorY - .03 || box.min.y > room.ceilingY) continue;
    const wall = normal.z > .999 && Math.abs(box.max.z - box.min.z) < .001;
    if (!(normal.y > .999 && Math.abs(box.max.y - box.min.y) < .001) && !wall) continue;
    if (wall && !DECORATIONS.find(d => template.name === 'decor_' + d.id)?.supportedSurfaces.includes('wall')) continue;
    const height = wall ? box.min.z : box.min.y;
    const key = `${wall}:${height.toFixed(3)}`;
    if (!surfaces.has(key)) surfaces.set(key, { wall, height, entries: [], box: new THREE.Box3() });
    const surface = surfaces.get(key);
    surface.entries.push(entry); surface.box.union(box);
  }
  const point = new THREE.Vector3();
  // Bridge only the tiny bevels/seams between exported floorboards (under 1 cm).
  function supported(surface, x, y, z) {
    point.set(x, y, z);
    return surface.entries.some(e => e.box.distanceToPoint(point) <= .009 && e.triangle.closestPointToPoint(point, new THREE.Vector3()).distanceToSquared(point) < .000081);
  }
  function candidate(surface, x, v) {
    const position = surface.wall
      ? new THREE.Vector3(x, v, surface.height - bounds.min.z + .004)
      : new THREE.Vector3(x, surface.height - bounds.min.y + .004, v);
    const box = bounds.clone().translate(position);
    if (box.min.x < room.minX || box.max.x > room.maxX || box.min.z < room.minZ || box.max.z > room.maxZ || box.min.y < room.floorY - .03 || box.max.y > room.ceilingY) return null;
    if (surface.wall) {
      for (const dx of [bounds.min.x, bounds.max.x]) for (const dy of [bounds.min.y, bounds.max.y]) {
        if (!supported(surface, position.x + dx, position.y + dy, surface.height)) return null;
      }
    } else if (footprint.some(p => !supported(surface, position.x + p.x, surface.height, position.z + p.z))) return null;
    // ponytail: conservative model envelope avoids clipping; use convex colliders
    // if interlocking irregular decorations becomes a product requirement.
    const interior = box.clone().expandByScalar(-.002);
    if (obstacles.some(b => interior.intersectsBox(b))) return null;
    if (nearbyTriangles.some(e => interior.intersectsBox(e.box) && interior.intersectsTriangle(e.triangle))) return null;
    return { isValid: true, position: position.toArray(), surface: surface.wall ? 'wall' : surface.height < room.floorY + .18 ? 'floor' : 'table', parentId: null, roomId, scale };
  }
  let fallback;
  function choices() {
    if (fallback) return fallback;
    fallback = [];
    for (const surface of surfaces.values()) {
      const b = surface.box;
      const minX = Math.max(b.min.x, room.minX), maxX = Math.min(b.max.x, room.maxX);
      const minV = surface.wall ? Math.max(b.min.y, room.floorY) : Math.max(b.min.z, room.minZ);
      const maxV = surface.wall ? Math.min(b.max.y, room.ceilingY) : Math.min(b.max.z, room.maxZ);
      // Include centres of small surfaces (e.g. chair seats) between grid points.
      const centres = [b.getCenter(new THREE.Vector3()), ...surface.entries.map(e => e.box.getCenter(new THREE.Vector3()))];
      for (const p of centres) {
        const hit = candidate(surface, p.x, surface.wall ? p.y : p.z);
        if (hit) fallback.push(hit);
      }
      for (let x = minX; x <= maxX; x += .16) for (let v = minV; v <= maxV; v += .16) {
        const hit = candidate(surface, x, v);
        if (hit) fallback.push(hit);
      }
    }
    return fallback;
  }
  function find(target = new THREE.Vector3(room.centerX, room.floorY + .7, 0)) {
    const direct = [...surfaces.values()].map(s => candidate(s, target.x, s.wall ? target.y : target.z)).filter(Boolean);
    const available = direct.length ? direct : choices();
    return available.reduce((best, hit) => !best || new THREE.Vector3(...hit.position).distanceToSquared(target) < new THREE.Vector3(...best.position).distanceToSquared(target) ? hit : best, null);
  }
  return { find, bounds };
}
