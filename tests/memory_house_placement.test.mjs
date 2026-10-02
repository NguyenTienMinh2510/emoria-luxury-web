import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlacementSolver, placementTriangles, transformDecoration } from '../src/services/housePlacement.js';
import { DECORATIONS, HOUSE_ROOM_IDS, addDecorationInstance, updateDecorationInstance, withEditableHouseFurniture } from '../src/services/house3d.js';

const loader = new GLTFLoader();
async function load(name) {
  const buffer = await fs.readFile(new URL(`../public/memoryhouse/models/${name}.glb`, import.meta.url));
  return (await loader.parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')).scene;
}
const [house, library] = await Promise.all([load('memory-house'), load('decorations')]);
const houseTriangles = placementTriangles(house);
const start = performance.now();
for (const roomId of HOUSE_ROOM_IDS) {
  const roomTriangles = placementTriangles(house.getObjectByName('room_' + roomId));
  // A table-only item needs a real editable support even in an otherwise empty
  // room. Floor/wall furniture is tested in that same room without occupancy.
  const furnishings = withEditableHouseFurniture([{ id: roomId, decorations: [] }])[0].decorations.map(d => {
    const model = library.getObjectByName('decor_' + d.item).clone(true);
    transformDecoration(model, d.position, d.rotation, d.scale);
    return { ...d, model, supports: DECORATIONS.find(a => a.id === d.item).supportsItems };
  });
  const supportTriangles = furnishings.filter(d => d.supports).flatMap(d => placementTriangles(d.model).map(entry => ({ ...entry, surface: d.item === 'shelf' ? 'shelf' : 'table', parentId: d.id })));
  const furnishingObstacles = furnishings.filter(d => !d.supports).map(d => new THREE.Box3().setFromObject(d.model, true));
  for (const asset of DECORATIONS) {
    const tableOnly = !asset.supportedSurfaces.includes('floor') && !asset.supportedSurfaces.includes('wall');
    const triangles = tableOnly ? [...roomTriangles, ...supportTriangles] : roomTriangles;
    const collisionTriangles = tableOnly ? [...houseTriangles, ...supportTriangles] : houseTriangles;
    const obstacles = tableOnly ? furnishingObstacles : [];
    const template = library.getObjectByName('decor_' + asset.id);
    let scale = 1;
    let solver = createPlacementSolver({ template, roomId, triangles, collisionTriangles, obstacles, scale });
    let hit = solver.find();
    if (!hit) { scale = .6; solver = createPlacementSolver({ template, roomId, triangles, collisionTriangles, obstacles, scale }); hit = solver.find(); }
    assert(hit?.isValid, `${roomId}/${asset.id}: a real surface must fit the model`);
    assert(asset.supportedSurfaces.includes(hit.surface), `${roomId}/${asset.id}: placement must respect the catalog's allowed surfaces`);
    if (hit.surface === 'table' || hit.surface === 'shelf') assert.ok(hit.parentId, 'Editable supports must retain their instance ID');
    const again = solver.find(new THREE.Vector3(...hit.position));
    assert.deepEqual(again, hit, 'Revalidation must preserve the preview position');
    const placed = addDecorationInstance({ id: roomId, decorations: [] }, asset.id, { ...hit, id: 'placed' });
    const moved = updateDecorationInstance(placed, 'placed', { position: hit.position }, { validatedPlacement: true });
    assert.deepEqual(moved.decorations[0].position, hit.position.map(v => Math.round(v * 1000) / 1000), 'Validated pivot must not be clamped away from its support');
    assert.deepEqual(updateDecorationInstance(moved, 'placed', { text: 'test' }).decorations[0].position, moved.decorations[0].position, 'Editing text cannot move the model');
    const model = template.clone(true);
    transformDecoration(model, hit.position, 0, scale);
    const interior = new THREE.Box3().setFromObject(model, true).expandByScalar(-.002);
    assert(!collisionTriangles.some(t => interior.intersectsBox(t.box) && interior.intersectsTriangle(t.triangle)), 'Real GLB geometry cannot penetrate furniture or the floor above');
    const occupied = createPlacementSolver({ template, roomId, triangles, collisionTriangles, scale, obstacles: [...obstacles, new THREE.Box3().setFromObject(model, true)] });
    const other = occupied.find(new THREE.Vector3(...hit.position));
    assert(!other || other.position.some((v, i) => Math.abs(v - hit.position[i]) > .01), 'Occupied positions must snap elsewhere');
  }
}
// The rounded bean rim must not rise through the usable flat top. Verify the
// actual regenerated model and all new table-only objects without shrinkage.
const coffee = library.getObjectByName('decor_coffee-table').clone(true);
transformDecoration(coffee, [-2.8, .14, .7], 0, [1, 1, 1.23]);
const coffeeTriangles = placementTriangles(coffee).map(entry => ({ ...entry, surface: 'table', parentId: 'coffee' }));
for (const item of ['honey-candle', 'turntable', 'camera']) {
  const model = library.getObjectByName('decor_' + item);
  const hit = createPlacementSolver({ template: model, roomId: 'beginning', triangles: coffeeTriangles }).find();
  assert.ok(hit?.isValid, `Coffee-table flat top must fit ${item} at full size`);
  assert.equal(hit.parentId, 'coffee'); assert.equal(hit.surface, 'table');
  const placed = model.clone(true); transformDecoration(placed, hit.position);
  const interior = new THREE.Box3().setFromObject(placed, true).expandByScalar(-.002);
  assert(!coffeeTriangles.some(t => interior.intersectsBox(t.box) && interior.intersectsTriangle(t.triangle)), `Coffee rim cannot penetrate ${item}`);
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

const floor = placementTriangles(furniture.children[0]);
const tabletop = placementTriangles(furniture.children[1]).map(entry => ({ ...entry, surface: 'table', parentId: 'custom-table' }));
const tableOnly = template.clone(true); tableOnly.name = 'decor_turntable';
const floorOnly = template.clone(true); floorOnly.name = 'decor_cushion';
assert.equal(createPlacementSolver({ template: tableOnly, roomId: 'first', triangles: floor }).find(), null, 'Table-only objects cannot fall back to the floor');
assert.equal(createPlacementSolver({ template: floorOnly, roomId: 'first', triangles: tabletop }).find(), null, 'Floor-only objects cannot fall back to a tabletop');
const supportedHit = createPlacementSolver({ template: tableOnly, roomId: 'first', triangles: [...floor, ...tabletop] }).find(new THREE.Vector3(0, .75, 0));
assert.equal(supportedHit.surface, 'table'); assert.equal(supportedHit.parentId, 'custom-table');
const shelfHit = createPlacementSolver({ template: tableOnly, roomId: 'first', triangles: tabletop.map(entry => ({ ...entry, surface: 'shelf', parentId: 'custom-shelf' })) }).find();
assert.equal(shelfHit.surface, 'shelf'); assert.equal(shelfHit.parentId, 'custom-shelf', 'Shelf support returns its actual parent');
const wallOnly = template.clone(true); wallOnly.name = 'decor_shelf';
assert.equal(createPlacementSolver({ template: wallOnly, roomId: 'first', triangles: [...floor, ...tabletop] }).find(), null, 'Wall-only objects require a wall');
const wall = placementTriangles(box(0, 1.14, -1.26, 2.8, 2, .04)).filter(entry => entry.normal.z > .999);
assert.equal(createPlacementSolver({ template: tableOnly, roomId: 'first', triangles: wall }).find(), null, 'Table-only objects cannot attach to a wall');
assert.equal(createPlacementSolver({ template: floorOnly, roomId: 'first', triangles: wall }).find(), null, 'Floor-only objects cannot attach to a wall');
assert.equal(createPlacementSolver({ template: wallOnly, roomId: 'first', triangles: wall }).find().surface, 'wall');
const legacy = template.clone(true); legacy.name = 'decor_mugs';
assert.equal(createPlacementSolver({ template: legacy, roomId: 'first', triangles: floor }).find().surface, 'floor', 'Legacy broadened surfaces remain compatible');
// Adjacent small supports cannot jointly hold a footprint or invent one parent.
const split = [box(-.15, .7, 0, .3, .1, .7), box(.15, .7, 0, .3, .1, .7)].flatMap((mesh, index) => placementTriangles(mesh).map(entry => ({ ...entry, surface: 'table', parentId: `table-${index}` })));
assert.equal(createPlacementSolver({ template: tableOnly, roomId: 'first', triangles: split, scale: [1.5, 1, 1] }).find(), null, 'Support footprints cannot span different parents');
console.log(`PASS placement: ${HOUSE_ROOM_IDS.length*DECORATIONS.length} real room/model combinations with actual table supports, allowed surfaces, support parents, footprints, collision, edges, rotation, scale and no-space (${Math.round(performance.now() - start)}ms).`);
