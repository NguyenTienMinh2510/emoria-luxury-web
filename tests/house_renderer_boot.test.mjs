import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HOUSE_ROOM_IDS} from '../src/services/house3d.js';
import * as THREE from 'three';

// Exercise the real renderer lifecycle and GLBs; replace only browser/GPU APIs.
const element = () => ({style:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}});
globalThis.window = {devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
globalThis.document = {hidden:false,addEventListener(){},removeEventListener(){},createElement:()=>({
  ...element(),getContext:()=>({fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},measureText:text=>({width:text.length*20}),createRadialGradient:()=>({addColorStop(){}})})
})};
const frames = new Map();let nextFrame=0;
globalThis.requestAnimationFrame = callback => {frames.set(++nextFrame,callback);return nextFrame;};
globalThis.cancelAnimationFrame = id => frames.delete(id);
function draw(){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(performance.now());}
globalThis.ResizeObserver = globalThis.IntersectionObserver = class {observe(){} disconnect(){}};
let renderedScene, renderedCamera, orbit;
const listeners = new Map();
globalThis.__houseTestRenderer = class {
  domElement={...element(),
    addEventListener(name, callback){listeners.set(name, callback);},
    getBoundingClientRect:()=>({left:0,top:0,width:1000,height:600}),
    setPointerCapture(){},hasPointerCapture:()=>false
  }; shadowMap={};
  setPixelRatio(){} setSize(){} dispose(){}
  render(scene,camera){renderedScene=scene;renderedCamera=camera;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);}
};
globalThis.__houseTestControls = class {
  constructor(camera) { orbit=this;this.camera=camera;this.target=camera.position.clone(); }
  touches={}; enabled=true;
  update(){this.camera.lookAt(this.target);} addEventListener(){} dispose(){}
};
GLTFLoader.prototype.loadAsync = async function(url) {
  const data=await fs.readFile(path.join('public',url));
  return this.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
};
const outfile=path.resolve('.local/ui-render/house-renderer-boot.mjs');
await build({entryPoints:['src/services/house3dRenderer.js'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{
  name:'browser-boundaries',setup(builder) {
    builder.onLoad({filter:/house3dRenderer\.js$/},async ({path:file})=>({contents:(await fs.readFile(file,'utf8'))
      .replace('new THREE.WebGLRenderer(', 'new globalThis.__houseTestRenderer(')
      .replace('new OrbitControls(', 'new globalThis.__houseTestControls('),loader:'js'}));
  }
}]});
const {createHouseRenderer}=await import(pathToFileURL(outfile));
let ready,fail;
const loaded=new Promise((resolve,reject)=>{ready=resolve;fail=reject;});
let editing=true, placement=null, moves=[], selections=0, previews=0;
const engine=createHouseRenderer({...element(),clientWidth:1000,clientHeight:600,appendChild(){}},{
  onReady:ready,onError:message=>fail(new Error(message)),
  isEditing:()=>editing,getPlacement:()=>placement,
  getDragPlacement:d=>({item:d.decorItem,roomId:d.roomId,excludeId:d.instanceId,scale:d.decorScale,rotation:d.decorRotation}),
  onSurfaceTap:(hit,id)=>moves.push({hit,id}),onDecorItem:()=>selections++,onPlacementPreview:()=>previews++
});
const rooms=HOUSE_ROOM_IDS.map(id=>({id,memories:[],decorations:[]}));
engine.update({rooms,title:'Admin owner private house',theme:'warm_gold'});
await loaded;
const tabletop = engine.findPlacement('memories','turntable');
assert.equal(tabletop?.surface,'table','Table-only model can use real editable desk geometry');
assert.equal(tabletop?.parentId,'base_memories_desk','Initial placement records the actual support instance');
const tableAgain = engine.findPlacement('memories','turntable',{position:tabletop.position,scale:tabletop.scale});
assert.deepEqual(tableAgain,tabletop,'Revalidation preserves support and pivot');
for (const item of ['honey-candle','turntable','camera']) {
  const coffeeHit=engine.findPlacement('beginning',item,{scale:1});
  assert.equal(coffeeHit?.parentId,'base_beginning_coffee-table',`Real coffee top fits ${item} at full size`);
  assert.equal(coffeeHit.surface,'table');
}
engine.calibrateGyroscope();
engine.setGyroSensitivity(.8);
assert.equal(await engine.enableGyroscope(true),false,'Desktop without orientation sensors still renders the house');
engine.focus('beginning',false);
draw();
let coffee;renderedScene.traverse(o=>{if(o.userData.instanceId==='base_beginning_coffee-table'&&!coffee)coffee=o;});
const coffeeBox=new THREE.Box3().setFromObject(coffee,true), coffeePoint=coffeeBox.getCenter(new THREE.Vector3());
coffeePoint.y=coffeeBox.max.y;
const coffeeScreen=coffeePoint.project(renderedCamera);
const aimed=engine.raycastSurface((coffeeScreen.x+1)*500,(1-coffeeScreen.y)*300,'beginning','camera');
assert.equal(aimed?.parentId,'base_beginning_coffee-table','Pointer ray targets the real editable support');
const spot=engine.findPlacement('beginning','cat',{position:[-3.75,.16,.7]});assert.ok(spot);
rooms[0].decorations=[{id:'drag-cat',item:'cat',position:spot.position,scale:spot.scale,rotation:0,surface:spot.surface}];
engine.update({rooms,activeRoomId:'beginning'});
draw();
let model;renderedScene.traverse(o=>{if(o.userData.instanceId==='drag-cat'&&!model)model=o;});
assert.ok(model);
const centre=new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()).project(renderedCamera);
const x=(centre.x+1)*500,y=(1-centre.y)*300;
const event=(type,dx=0,pointerType='mouse')=>listeners.get(type)({clientX:x+dx,clientY:y,pointerId:1,button:0,buttons:type==='pointerup'?0:1,isPrimary:true,pointerType,stopImmediatePropagation(){}});
event('pointerdown');assert.equal(orbit.enabled,false,'Mouse grabs decoration before OrbitControls');
event('pointerup');assert.equal(moves.length,0);assert.equal(selections,1,'A click still selects');
event('pointerdown');event('pointermove',40);event('pointerup',40);
assert.equal(moves.length,1);assert.equal(moves[0].id,'drag-cat');assert.equal(moves[0].hit.isValid,true);assert.equal(orbit.enabled,true);
event('pointerdown');event('pointermove',30);event('pointercancel');assert.equal(moves.length,1,'Cancelled drag never commits');
editing=false;event('pointerdown');event('pointermove',40);event('pointerup',40);assert.equal(moves.length,1,'Public view cannot move items');
editing=true;placement={item:'cat',roomId:'beginning',scale:spot.scale,excludeId:'drag-cat'};
listeners.get('pointermove')({clientX:x,clientY:y,pointerId:1,pointerType:'mouse',buttons:0});
assert.ok(previews>1,'Mouse hover previews placement before clicking');
event('pointerdown',0,'touch');event('pointermove',40,'touch');event('pointerup',40,'touch');
assert.equal(moves.length,2);assert.equal(moves[1].id,undefined,'Existing touch placement still commits');
placement=null;
// Updated furnishings invalidate cached world triangles; temporary supports in
// a multi-item insertion also participate before they are committed to rooms.
rooms[3]={id:'memories',furnishingVersion:1,decorations:[]};
engine.update({rooms});
assert.equal(engine.findPlacement('memories','turntable'),null,'Deleting all supports cannot put a table-only object on the floor');
assert.equal(engine.findPlacement('memories','cushion')?.surface,'floor','A floor-only object still uses the shell floor');
const temporaryDesk={id:'temporary-desk',item:'desk',position:[-1.8,2.388,-.57],rotation:25,scale:1};
const extraHit=engine.findPlacement('memories','camera',{extra:[temporaryDesk]});
assert.equal(extraHit?.parentId,'temporary-desk','Batch insertion can parent a model to a newly added support');
assert.equal(extraHit?.surface,'table');
rooms[3].decorations=[temporaryDesk]; engine.update({rooms});
const beforeMove=engine.findPlacement('memories','camera');
assert.equal(beforeMove?.parentId,'temporary-desk');
temporaryDesk.position=[-1.2,2.388,-.25]; engine.update({rooms});
const afterMove=engine.findPlacement('memories','camera',{position:beforeMove.position,scale:beforeMove.scale});
assert.equal(afterMove?.parentId,'temporary-desk');
assert.notDeepEqual(afterMove.position,beforeMove.position,'Moving a support rebuilds its world geometry');
assert.equal(engine.findPlacement('memories','camera',{excludeId:'temporary-desk'}),null,'A dragged support cannot support itself');
assert.equal(engine.findPlacement('memories','camera',{excludeIds:['temporary-desk']}),null,'Deleted parents are excluded from placement candidates');
engine.overview(false);
engine.dispose();
console.log('PASS House renderer: real GLBs/supports, parent IDs, moved/deleted/temporary supports, desktop drag/click/cancel, read-only protection, hover preview, touch placement, gyro and disposal.');
