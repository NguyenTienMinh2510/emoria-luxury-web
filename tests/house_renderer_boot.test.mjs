import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HOUSE_ROOM_IDS} from '../src/services/house3d.js';

// Exercise the real renderer lifecycle and GLBs; replace only browser/GPU APIs.
const element = () => ({style:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}});
globalThis.window = {devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
globalThis.document = {hidden:false,addEventListener(){},removeEventListener(){},createElement:()=>({
  ...element(),getContext:()=>({fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},measureText:text=>({width:text.length*20}),createRadialGradient:()=>({addColorStop(){}})})
})};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = globalThis.IntersectionObserver = class {observe(){} disconnect(){}};
globalThis.__houseTestRenderer = class {
  domElement=element(); shadowMap={};
  setPixelRatio(){} setSize(){} render(){} dispose(){}
};
globalThis.__houseTestControls = class {
  constructor(camera) { this.target=camera.position.clone(); }
  touches={}; enabled=true;
  update(){} addEventListener(){} dispose(){}
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
const engine=createHouseRenderer({...element(),clientWidth:390,clientHeight:500,appendChild(){}},{
  onReady:ready,onError:message=>fail(new Error(message))
});
const rooms=HOUSE_ROOM_IDS.map(id=>({id,memories:[],decorations:[]}));
engine.update({rooms,title:'Admin owner private house',theme:'warm_gold'});
await loaded;
engine.calibrateGyroscope();
engine.setGyroSensitivity(.8);
assert.equal(await engine.enableGyroscope(true),false,'Desktop without orientation sensors still renders the house');
engine.focus('beginning',false);
engine.overview(false);
engine.dispose();
console.log('PASS House renderer boots real GLBs, calibrates without sensors, focuses and disposes without ReferenceError.');
