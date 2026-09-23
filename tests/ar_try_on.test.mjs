import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {necklacePose,smoothPose,drawNecklace} from '../src/services/arGeometry.js';
import {ringPose,braceletPose,smoothHandPose,drawRing,drawBracelet} from '../src/services/arHandGeometry.js';
import {tryOnConfig} from '../server/tryOn.js';
import {NecklaceTracker} from '../src/services/arNecklaceTracker.js';
import {HandTracker} from '../src/services/arHandTracker.js';
import handler from '../api/v1.js';

const points=Array.from({length:33},()=>({x:.5,y:.3,z:0,visibility:1}));points[11]={x:.25,y:.5,z:0,visibility:1};points[12]={x:.75,y:.5,z:0,visibility:1};
const pose=necklacePose(points,640,480);assert.deepEqual(pose,{x:320,y:240,z:0,span:320,angle:0});
assert.equal(necklacePose(null,640,480),null);
for(const patch of [{visibility:.1},{x:NaN},{x:-.1},{z:1}]){const bad=structuredClone(points);Object.assign(bad[11],patch);assert.equal(necklacePose(bad,640,480),null);}
const smoothed=smoothPose(pose,{...pose,x:330},40);assert.ok(smoothed.x>320&&smoothed.x<330);assert.equal(smoothPose(pose,null,50),null);
const drawCalls=[];const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:(...args)=>drawCalls.push([k,...args])});
drawNecklace(ctx,pose,{},{});assert.ok(drawCalls.filter(c=>c[0]==='bezierCurveTo').length===2);

// Ring and Bracelet geometry tests
const handPoints=Array.from({length:21},()=>({x:.5,y:.5,z:0}));
handPoints[13]={x:.5,y:.5,z:0};handPoints[14]={x:.5,y:.35,z:0};
const rPose=ringPose(handPoints,640,480,'ring');
assert.ok(rPose&&rPose.type==='ring'&&rPose.span>50&&rPose.z===0);
assert.equal(ringPose(null,640,480),null);
assert.equal(ringPose([],640,480),null);
const invalidDepth=structuredClone(handPoints);invalidDepth[13].z=Infinity;assert.equal(ringPose(invalidDepth,640,480),null);
for(const patch of [{x:NaN},{x:-.1},{y:1.2}]){const bad=structuredClone(handPoints);Object.assign(bad[13],patch);assert.equal(ringPose(bad,640,480),null);}

handPoints[0]={x:.5,y:.8,z:0};handPoints[5]={x:.35,y:.5,z:0};handPoints[17]={x:.65,y:.5,z:0};
const bPose=braceletPose(handPoints,640,480);
assert.ok(bPose&&bPose.type==='bracelet'&&bPose.span>150&&bPose.z===0);
assert.equal(braceletPose(null,640,480),null);
const otherHand=structuredClone(handPoints);[otherHand[5],otherHand[17]]=[otherHand[17],otherHand[5]];
for(const p of [bPose,braceletPose(otherHand,640,480)])assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(p.quaternion).z>0);

const smoothRing=smoothHandPose(rPose,{...rPose,x:rPose.x+10},30);
assert.ok(smoothRing.x>=rPose.x&&smoothRing.x<=rPose.x+10);
assert.equal(smoothHandPose(rPose,null,50),null);

drawRing(ctx,rPose,null,{ringScale:0.22,size:17});
assert.ok(drawCalls.some(c=>c[0]==='ellipse'||c[0]==='arc'));
drawBracelet(ctx,bPose,null,{braceletScale:0.35,size:16});
assert.ok(drawCalls.some(c=>c[0]==='ellipse'));

// Real GLB dimensions, masks, scale updates and late-load disposal.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AR3DScene,prepareModel,disposeModel} from '../src/services/ar3DRenderer.js';
for(const name of ['lumen','faith','sen','horizon','pulse','echo','halo']){
 const c=tryOnConfig('emoria-'+name),bytes=fs.readFileSync('public'+c.modelUrl);
 assert.equal(bytes.toString('ascii',0,4),'glTF');
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const root=prepareModel(gltf.scene,c.type),box=new THREE.Box3().setFromObject(root);
 assert.ok(box.getSize(new THREE.Vector3()).length()>15);
 let tris=0;gltf.scene.traverse(o=>{if(o.isMesh)tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});assert.ok(tris>1000&&tris<140000,name);
 if(c.type!=='necklace')assert.ok(root.children.some(o=>o.material?.colorWrite===false));
 const scene=new AR3DScene(640,480);scene.activeModel=root;scene.setOptions({scale:1,size:c.defaultSize,pendantScale:c.pendantScale});
 scene.updatePose3D({x:320,y:240,span:200,angle:0},c.type);const first=root.scale.x;
 scene.updatePose3D({x:320,y:240,span:400,angle:0},c.type);assert.equal(root.scale.x,first*2);
 scene.setOptions({scale:1.5});scene.updatePose3D({x:320,y:240,span:400,angle:0},c.type);assert.equal(root.scale.x,first*3);
 scene.dispose();
}
let resolveModel,disposed=0;const pending=new AR3DScene();
const lateMesh=new THREE.Mesh(new THREE.BoxGeometry(.02,.02,.02),new THREE.MeshStandardMaterial());lateMesh.geometry.addEventListener('dispose',()=>disposed++);
pending.loader={loadAsync:()=>new Promise(r=>resolveModel=r)};
const loading=pending.setModel('x','ring',{modelUrl:'/models/jewelry/emoria-halo.glb'});pending.dispose();resolveModel({scene:lateMesh});await loading;assert.equal(disposed,1);assert.equal(pending.activeModel,null);
const chainScene=new AR3DScene();chainScene.setOptions({length:45});chainScene.updateChain(pose);
const chainVersion=chainScene.chain.instanceMatrix.version;chainScene.updateChain({...pose,x:400});
assert.equal(chainScene.chain.instanceMatrix.version,chainVersion,'Body movement must not rebuild chain geometry');
chainScene.setOptions({length:50});chainScene.updateChain(pose);assert.ok(chainScene.chain.instanceMatrix.version>chainVersion);chainScene.dispose();
await assert.rejects(new AR3DScene().setModel('x','ring',{modelUrl:'https://untrusted.test/x.glb'}));
assert.equal(tryOnConfig('emoria-lumen',{details:{ar:{enabled:false}}}),null);
assert.equal(tryOnConfig('emoria-lumen',{details:{ar:{type:'necklace',modelUrl:'/models/custom.glb'}}}).modelUrl,'/models/custom.glb');
assert.equal(tryOnConfig('emoria-lumen',{details:{ar:{type:'necklace',modelUrl:'//foreign.test/a.glb'}}}),null);

// Execute worker message lifecycle with actual result shape (no close() method).
const messages=[],worker={postMessage:m=>messages.push(m),location:{origin:'http://localhost'}};
const workerSource=fs.readFileSync('src/services/arHand.worker.js','utf8').replace(/^import .*;\s*/,'').replace('import.meta.env.DEV','false');
vm.runInNewContext(workerSource,{self:worker,URL,console,FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async()=>({detectForVideo:()=>({landmarks:[],handedness:[],worldLandmarks:[]})})}});
await worker.onmessage({data:{type:'init'}});let released=0;
for(let i=0;i<3;i++)await worker.onmessage({data:{type:'frame',time:i,bitmap:{close(){released++;}}}});
assert.deepEqual(messages.map(m=>m.type),['ready','hand','hand','hand']);assert.equal(released,3);

assert.equal(tryOnConfig('emoria-solaris-keyring'),null);assert.equal(tryOnConfig('../../x'),null);assert.equal(tryOnConfig('emoria-lumen-duo').modelUrl,'/models/jewelry/emoria-lumen.glb');
assert.equal(tryOnConfig('emoria-horizon').type,'bracelet');
assert.equal(tryOnConfig('emoria-halo').type,'ring');
assert.equal(tryOnConfig('emoria-faith').type,'necklace');
assert.equal(tryOnConfig('emoria-celestial-duo'),null);
assert.deepEqual(tryOnConfig('emoria-horizon').previewSizes,[15,16,17,18]);
assert.equal(tryOnConfig('emoria-pulse').type,'bracelet');
assert.deepEqual(tryOnConfig('emoria-pulse').previewSizes,[15,16,17,18]);
// Custom product AR derivation & explicit details.ar
const customRing=tryOnConfig('custom-ring',{name:'Nhẫn Tình Nhân',details:{category:'Nhẫn'},image_url:'/img/ring.png'});
assert.equal(customRing,null,'No unrelated generic ring when no GLB exists');
const customExplicit=tryOnConfig('custom-custom',{details:{ar:{type:'ring',modelUrl:'/models/custom.glb',defaultSize:18,finger:'index',scale:0.25}}});
assert.equal(customExplicit.type,'ring');assert.equal(customExplicit.defaultSize,18);assert.equal(customExplicit.finger,'index');
assert.equal(createHash('sha256').update(fs.readFileSync('public/ar/hand_landmarker.task')).digest('hex'),'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1');
assert.equal(createHash('sha256').update(fs.readFileSync('public/ar/pose_landmarker_lite.task')).digest('hex'),'59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a');
const actualFetch=globalThis.fetch;process.env.SUPABASE_URL='https://ar-test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='fixture';let active=true,requests=0;
globalThis.fetch=async(url,options)=>{requests++;assert.equal(options.method,'GET');assert.ok(String(url).includes('/checkout_products?select='));return Response.json({id:'emoria-lumen',active,name:'EMORIA LUMEN',image_url:'/ar/lumen.svg'});};
async function get(id,method='GET') {let result;await handler({method,url:'/api/v1/products/'+id+'/try-on',headers:method==='GET'?{}:{'content-type':'application/json'},body:method==='GET'?undefined:{}},{setHeader(){},end(raw){result={status:this.statusCode,data:JSON.parse(raw)};}});return result;}
try{
 const solaris=await get('emoria-solaris-keyring');assert.equal(solaris.status,404);
 const r=await get('emoria-lumen');assert.equal(r.status,200);assert.deepEqual(r.data.previewLengths,[40,45,50]);assert.equal(r.data.productId,'emoria-lumen');
 assert.equal((await get('emoria-lumen','POST')).status,405);
 active=false;assert.equal((await get('emoria-lumen')).status,404);
}finally{globalThis.fetch=actualFetch;}
const originals=Object.fromEntries(['navigator','isSecureContext','cancelAnimationFrame','requestAnimationFrame','Image','Worker','OffscreenCanvas'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
const set=(k,value)=>Object.defineProperty(globalThis,k,{configurable:true,writable:true,value});
try{
 let stopped=0,resolveCamera;const stream={getTracks:()=>[{stop:()=>stopped++}]};
 set('isSecureContext',true);set('cancelAnimationFrame',()=>{});set('requestAnimationFrame',()=>1);set('Worker',undefined);
 set('navigator',{mediaDevices:{getUserMedia:()=>new Promise(r=>resolveCamera=r)}});
 const video={pause(){},play:async()=>{},videoWidth:640,videoHeight:480,currentTime:1},canvas={getContext:()=>ctx};
 const late=new NecklaceTracker(video,canvas,tryOnConfig('emoria-lumen'),()=>assert.fail('No callback after close'));
 const start=late.start();late.stop();resolveCamera(stream);await start;assert.equal(stopped,1,'Late permission result must close its camera tracks');
 set('Image',class{decode(){return Promise.resolve();}});set('navigator',{mediaDevices:{getUserMedia:async options=>{assert.equal(options.audio,false);return stream;}}});
  const states=[],tracker=new NecklaceTracker(video,canvas,tryOnConfig('emoria-lumen'),s=>states.push(s));await tracker.start();assert.ok(states.includes('manual-fallback'));tracker.stop();assert.equal(stopped,2);assert.equal(video.srcObject,null);
  const ringStates=[],ringTracker=new HandTracker(video,canvas,tryOnConfig('emoria-horizon'),s=>ringStates.push(s));await ringTracker.start();assert.ok(ringStates.includes('manual-fallback'));ringTracker.stop();assert.equal(stopped,3);
  const braceletStates=[],braceletTracker=new HandTracker(video,canvas,tryOnConfig('emoria-pulse'),s=>braceletStates.push(s));await braceletTracker.start();assert.ok(braceletStates.includes('manual-fallback'));braceletTracker.stop();assert.equal(stopped,4);
  set('isSecureContext',false);await assert.rejects(new NecklaceTracker(video,canvas,{},()=>{}).start(),e=>e.name==='UnsupportedError');
  await assert.rejects(new HandTracker(video,canvas,{},()=>{}).start(),e=>e.name==='UnsupportedError');
}finally{for(const [k,d] of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
console.log('PASS AR: public REST config, inactive/unsupported products, no media upload API, pose rejection/smoothing, local model integrity, permission race cleanup, manual fallback and HTTPS guard.');
