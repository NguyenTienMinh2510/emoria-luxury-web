import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
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
for(const patch of [{x:NaN},{x:-.1},{y:1.2}]){const bad=structuredClone(handPoints);Object.assign(bad[13],patch);assert.equal(ringPose(bad,640,480),null);}

handPoints[0]={x:.5,y:.8,z:0};handPoints[5]={x:.35,y:.5,z:0};handPoints[17]={x:.65,y:.5,z:0};
const bPose=braceletPose(handPoints,640,480);
assert.ok(bPose&&bPose.type==='bracelet'&&bPose.span>150&&bPose.z===0);
assert.equal(braceletPose(null,640,480),null);

const smoothRing=smoothHandPose(rPose,{...rPose,x:rPose.x+10},30);
assert.ok(smoothRing.x>=rPose.x&&smoothRing.x<=rPose.x+10);
assert.equal(smoothHandPose(rPose,null,50),null);

drawRing(ctx,rPose,null,{ringScale:0.22,size:17});
assert.ok(drawCalls.some(c=>c[0]==='ellipse'||c[0]==='arc'));
drawBracelet(ctx,bPose,null,{braceletScale:0.35,size:16});
assert.ok(drawCalls.some(c=>c[0]==='ellipse'));

// Three.js 3D Model & Occlusion Mask Verification
import {buildRingModel,buildBraceletModel,buildNecklaceModel} from '../src/services/ar3DRenderer.js';
const ring3D=buildRingModel('emoria-horizon');
assert.equal(ring3D.name,'RingRoot');
assert.equal(ring3D.children[0].renderOrder,0); // Occluder cylinder
assert.equal(ring3D.children[0].material.colorWrite,false); // Invisible mask
assert.equal(ring3D.children[0].material.depthWrite,true); // Depth buffer write
assert.equal(ring3D.children[1].renderOrder,1); // Metallic jewelry mesh

const bracelet3D=buildBraceletModel('emoria-pulse');
assert.equal(bracelet3D.name,'BraceletRoot');
assert.equal(bracelet3D.children[0].renderOrder,0); // Wrist occluder
assert.equal(bracelet3D.children[1].renderOrder,1); // 3D Cuff

const necklace3D=buildNecklaceModel('emoria-lumen');
assert.equal(necklace3D.name,'NecklaceRoot');
assert.equal(necklace3D.children[0].renderOrder,0); // Chest occluder
assert.equal(necklace3D.children[1].renderOrder,1); // 3D Pendant

assert.equal(tryOnConfig('emoria-solaris-keyring'),null);assert.equal(tryOnConfig('../../x'),null);assert.equal(tryOnConfig('emoria-lumen-duo').pendant,'/ar/lumen.svg');
assert.equal(tryOnConfig('emoria-horizon').type,'ring');
assert.equal(tryOnConfig('emoria-halo').type,'ring');
assert.equal(tryOnConfig('emoria-faith').type,'necklace');
assert.equal(tryOnConfig('emoria-celestial-duo').type,'bracelet');
assert.deepEqual(tryOnConfig('emoria-horizon').previewSizes,[16,17,18,19]);
assert.equal(tryOnConfig('emoria-pulse').type,'bracelet');
assert.deepEqual(tryOnConfig('emoria-pulse').previewSizes,[15,16,17,18]);
assert.equal(createHash('sha256').update(fs.readFileSync('public/ar/hand_landmarker.task')).digest('hex'),'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1');
assert.equal(createHash('sha256').update(fs.readFileSync('public/ar/pose_landmarker_lite.task')).digest('hex'),'59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a');
const actualFetch=globalThis.fetch;process.env.SUPABASE_URL='https://ar-test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='fixture';let active=true,requests=0;
globalThis.fetch=async(url,options)=>{requests++;assert.equal(options.method,'GET');assert.ok(String(url).includes('/checkout_products?select=id%2Cactive'));return Response.json({id:'emoria-lumen',active});};
async function get(id,method='GET') {let result;await handler({method,url:'/api/v1/products/'+id+'/try-on',headers:method==='GET'?{}:{'content-type':'application/json'},body:method==='GET'?undefined:{}},{setHeader(){},end(raw){result={status:this.statusCode,data:JSON.parse(raw)};}});return result;}
try{
 assert.equal((await get('emoria-solaris-keyring')).status,404);assert.equal(requests,0);
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
