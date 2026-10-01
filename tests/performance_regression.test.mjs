import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadShowcaseFrames} from '../src/services/showcaseFrames.js';
import {productImageProps} from '../src/services/productImages.js';
import {signEventPaths} from '../server/eventMedia.js';

class FakeImage {
  static created = [];
  constructor() { FakeImage.created.push(this); }
  set src(value) { this.url = value; }
  removeAttribute() { this.cancelled = true; }
  finish() { this.naturalWidth = 1280; return this.onload(); }
}
let loaded = 0;
const frames = loadShowcaseFrames({count:120, getPath:i=>`webp-${i}`, getFallbackPath:i=>`jpg-${i}`, onLoad:()=>loaded++, ImageClass:FakeImage});
frames.request(0);
assert.equal(FakeImage.created.length,1,'Only the first frame starts immediately');
frames.preload();
assert.equal(FakeImage.created.length,3,'Background preload never starts 120 simultaneous requests');
frames.request(119);
FakeImage.created[0].finish();
assert.equal(frames.ready[0],true,'Browsers without decode can still mark a loaded frame ready');
assert.equal(FakeImage.created[3].url,'webp-119','Skipping to the end prioritizes the requested frame');
FakeImage.created[3].onerror();
assert.equal(FakeImage.created[3].url,'jpg-119','An unavailable optimized frame falls back to the original');
FakeImage.created[3].finish();
frames.dispose();
assert.ok(FakeImage.created.every(i=>i.cancelled && i.onload===null && i.onerror===null));
frames.preload();frames.request(5);
assert.equal(FakeImage.created.length,5,'Unmount cannot start another frame request');
assert.equal(loaded,2);

class DecodingImage extends FakeImage {
  decode() { return new Promise((resolve,reject)=>{this.resolveDecode=resolve;this.rejectDecode=reject;}); }
}
const firstDecodingIndex=FakeImage.created.length;
const decodedLoads=[];
const decodingFrames=loadShowcaseFrames({count:4,getPath:i=>`webp-${i}`,getFallbackPath:i=>`jpg-${i}`,onLoad:(i,success)=>decodedLoads.push([i,success]),ImageClass:DecodingImage});
decodingFrames.preload();
const firstImage=FakeImage.created[firstDecodingIndex];
const firstDecode=firstImage.finish();
decodingFrames.request(3);
assert.equal(decodingFrames.ready[0],false,'Network completion alone does not make a frame drawable');
assert.equal(decodingFrames.settled[0],false,'An image remains pending while decoding');
assert.equal(decodedLoads.length,0);
assert.equal(FakeImage.created.length,firstDecodingIndex+3,'Decoding keeps its slot in the three-frame concurrency limit');
firstImage.resolveDecode();
await firstDecode;
assert.equal(decodingFrames.ready[0],true);
assert.deepEqual(decodedLoads,[[0,true]]);
const priorityImage=FakeImage.created[firstDecodingIndex+3];
assert.equal(priorityImage.url,'webp-3','A waiting current frame starts only after another frame finishes decoding');
const failedDecode=priorityImage.finish();
priorityImage.rejectDecode(new Error('Invalid optimized image'));
await failedDecode;
assert.equal(priorityImage.url,'jpg-3','Decode failure retries the original image');
assert.equal(decodingFrames.ready[3],false);
assert.equal(decodedLoads.length,1);
const fallbackDecode=priorityImage.finish();
priorityImage.resolveDecode();
await fallbackDecode;
assert.equal(decodingFrames.ready[3],true);
assert.deepEqual(decodedLoads,[[0,true],[3,true]]);
const failedImage=FakeImage.created[firstDecodingIndex+1];
const failedOptimized=failedImage.finish();
failedImage.rejectDecode(new Error('Invalid optimized image'));
await failedOptimized;
const failedOriginal=failedImage.finish();
failedImage.rejectDecode(new Error('Invalid original image'));
await failedOriginal;
assert.equal(decodingFrames.ready[1],false);
assert.equal(decodingFrames.settled[1],true,'A failed optimized image and fallback settle without becoming drawable');
assert.deepEqual(decodedLoads.at(-1),[1,false],'Two decode failures complete with a non-drawable frame');
const disposedImage=FakeImage.created[firstDecodingIndex+2];
const disposedDecode=disposedImage.finish();
decodingFrames.dispose();
disposedImage.resolveDecode();
await disposedDecode;
assert.ok(decodingFrames.ready.every(ready=>!ready),'Disposal clears decoded readiness');
assert.ok(decodingFrames.settled.every(settled=>!settled),'Disposal clears terminal frame status');
assert.equal(decodedLoads.length,3,'Decoding after disposal cannot deliver a callback');
assert.ok(FakeImage.created.slice(firstDecodingIndex).every(i=>i.cancelled&&i.onload===null&&i.onerror===null));
const nearbyStart=FakeImage.created.length;
const nearbyFrames=loadShowcaseFrames({count:120,getPath:i=>`nearby-${i}`,onLoad:()=>{},ImageClass:FakeImage});
nearbyFrames.preload(0,13);
for(let i=nearbyStart;i<FakeImage.created.length;i++) FakeImage.created[i].finish();
assert.equal(FakeImage.created.length-nearbyStart,13,'Initial prefetch prepares only the nearby frames');
nearbyFrames.preload(10,23);
for(let i=nearbyStart+13;i<FakeImage.created.length;i++) FakeImage.created[i].finish();
assert.equal(FakeImage.created.length-nearbyStart,23,'Moving the prefetch window reuses overlapping decoded frames');
nearbyFrames.dispose();
const missingStart=FakeImage.created.length;
const missingLoads=[];
const missingFrames=loadShowcaseFrames({count:4,getPath:i=>`missing-webp-${i}`,getFallbackPath:i=>`missing-jpg-${i}`,onLoad:(i,success)=>missingLoads.push([i,success]),ImageClass:FakeImage});
missingFrames.preload();
for(let i=missingStart;i<FakeImage.created.length;i++) {
  FakeImage.created[i].onerror();
  FakeImage.created[i].onerror();
}
assert.equal(missingLoads.length,4);
assert.ok(missingLoads.every(([,success])=>success===false),'Missing images are never reported as successful loads');
assert.ok(missingFrames.ready.every(ready=>!ready),'All missing images remain non-drawable');
assert.ok(missingFrames.settled.every(Boolean),'All missing images settle so autoplay can advance');
missingFrames.dispose();
for (let i=0;i<300;i++) {
  const frame=String(i).padStart(3,'0');
  assert.ok(fs.existsSync(`public/assets/animation-optimized/frame-${frame}.webp`));
  assert.ok(fs.existsSync(`public/assets/animation-optimized/frame-${frame}-640.webp`));
}
for (const name of ['echo','faith','halo','horizon','lumen','orbit','pulse','sen']) {
  const props=productImageProps(`/assets/catalog/emoria-${name}.png`);
  assert.ok(props.srcSet.includes('320w') && props.srcSet.includes('960w'));
  for (const width of [320,640,960]) assert.ok(fs.existsSync(`public/assets/optimized/emoria-${name}-${width}.webp`));
}
assert.deepEqual(productImageProps('https://uploads.example/custom.jpg'),{src:'https://uploads.example/custom.jpg'},'Custom catalog uploads remain unchanged');

const originalFetch=globalThis.fetch;
process.env.SUPABASE_URL='https://signing-fixture.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-server-key';
let calls=0;
globalThis.fetch=async (url,init)=>{
  calls++;
  assert.ok(String(url).endsWith('/object/sign/emoria-event-media'));
  assert.deepEqual(JSON.parse(init.body),{expiresIn:3600,paths:['emo-test/good','emo-test/missing']});
  return Response.json([{path:'emo-test/good',error:null,signedURL:'/object/sign/emoria-event-media/emo-test/good?token=fixture'},{path:'emo-test/missing',error:'Not found',signedURL:null}]);
};
try {
  const signed=await signEventPaths(['emo-test/good',' emo-test/good ','emo-test/missing',null]);
  assert.equal(calls,1,'Repeated photo paths are signed once, in one batch');
  assert.deepEqual(Object.keys(signed),['emo-test/good'],'A failed object never receives an unsigned/fake URL');
  globalThis.fetch=async()=>{throw new Error('Storage unavailable');};
  assert.deepEqual(await signEventPaths(['emo-test/good']),{});
} finally { globalThis.fetch=originalFetch; }
console.log('PASS performance regression: bounded frame loading and decoding, current-frame priority, original-image and decode fallback, disposal, responsive assets, custom uploads, deduplicated batch signing and safe Storage failure.');
await import('./showcase_render.test.mjs');
await import('./motion_entry.test.mjs');
await import('./article_reading.test.mjs');
await import('./article_editor.test.mjs');
