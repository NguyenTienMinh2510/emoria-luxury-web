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
engine.calibrateGyroscope();
engine.setGyroSensitivity(.8);
assert.equal(await engine.enableGyroscope(true),false,'Desktop without orientation sensors still renders the house');
engine.focus('beginning',false);
const spot=engine.findPlacement('beginning','cat');assert.ok(spot);
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
engine.overview(false);
engine.dispose();
console.log('PASS House renderer: real GLBs, desktop drag/click/cancel, read-only protection, hover preview, touch placement, gyro and disposal.');
