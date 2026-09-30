import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlacementSolver, placementTriangles, transformDecoration } from '../src/services/housePlacement.js';
import { DECORATIONS, HOUSE_ROOM_IDS } from '../src/services/house3d.js';

const loader = new GLTFLoader();
async function load(name) {
  const buffer = await fs.readFile(new URL(`../public/memoryhouse/models/${name}.glb`, import.meta.url));
  return (await loader.parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')).scene;
}
const [house, library] = await Promise.all([load('memory-house'), load('decorations')]);
const collisionTriangles = placementTriangles(house);
const start = performance.now();
for (const roomId of HOUSE_ROOM_IDS) {
  const triangles = placementTriangles(house.getObjectByName('room_' + roomId));
  for (const asset of DECORATIONS) {
    const template = library.getObjectByName('decor_' + asset.id);
    let scale = 1;
    let solver = createPlacementSolver({ template, roomId, triangles, collisionTriangles, scale });
    let hit = solver.find();
    if (!hit) { scale = .6; solver = createPlacementSolver({ template, roomId, triangles, collisionTriangles, scale }); hit = solver.find(); }
    assert(hit?.isValid, `${roomId}/${asset.id}: a real surface must fit the model`);
    const again = solver.find(new THREE.Vector3(...hit.position));
    assert.deepEqual(again, hit, 'Revalidation must preserve the preview position');
    const model = template.clone(true);
    transformDecoration(model, hit.position, 0, scale);
    const interior = new THREE.Box3().setFromObject(model, true).expandByScalar(-.002);
    assert(!collisionTriangles.some(t => interior.intersectsBox(t.box) && interior.intersectsTriangle(t.triangle)), 'Real GLB geometry cannot penetrate furniture or the floor above');
    const occupied = createPlacementSolver({ template, roomId, triangles, scale, obstacles: [new THREE.Box3().setFromObject(model, true)] });
    const other = occupied.find(new THREE.Vector3(...hit.position));
    assert(!other || other.position.some((v, i) => Math.abs(v - hit.position[i]) > .01), 'Occupied positions must snap elsewhere');
  }
}

function box(x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  return mesh;
}
const furniture = new THREE.Group();
furniture.add(box(0, .07, 0, 2.8, .14, 2.6), box(0, .7, 0, 1, .1, 1), box(.9, .4, .1, .44, .1, .44));
const template = new THREE.Group(); template.name = 'decor_plant';
template.add(box(0, .15, 0, .3, .3, .3));
const triangles = placementTriangles(furniture);
const solver = createPlacementSolver({ template, roomId: 'first', triangles });
assert(Math.abs(solver.find(new THREE.Vector3(0, .75, 0)).position[1] - .754) < .001, 'Table top');
assert(Math.abs(solver.find(new THREE.Vector3(.9, .45, .1)).position[1] - .454) < .001, 'Chair seat');
const edge = solver.find(new THREE.Vector3(.49, .75, .49));
assert(edge.isValid, 'An edge touch snaps to a supported position');
const large = createPlacementSolver({ template, roomId: 'first', triangles, rotation: [0, 45, 0], scale: [1.3, 1, 1.3] });
assert(large.find(new THREE.Vector3(.9, .45, .1)).position[1] !== .454, 'Oversized rotated footprint cannot sit on the chair edge');
assert.equal(createPlacementSolver({ template, roomId: 'first', triangles: [] }).find(), null, 'No invented virtual floor');
assert.equal(createPlacementSolver({ template, roomId: 'first', triangles, scale: 20 }).find(), null, 'A full room cannot offer an invalid placement');
console.log(`PASS placement: 60 real room/model combinations, actual footprints, collision, table, chair, edges, rotation, scale and no-space (${Math.round(performance.now() - start)}ms).`);
