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
  finish() { this.naturalWidth = 1280; this.onload(); }
}
let loaded = 0;
const frames = loadShowcaseFrames({count:120, getPath:i=>`webp-${i}`, getFallbackPath:i=>`jpg-${i}`, onLoad:()=>loaded++, ImageClass:FakeImage});
frames.request(0);
assert.equal(FakeImage.created.length,1,'Only the first frame starts immediately');
frames.preload();
assert.equal(FakeImage.created.length,3,'Background preload never starts 120 simultaneous requests');
frames.request(119);
FakeImage.created[0].finish();
assert.equal(FakeImage.created[3].url,'webp-119','Skipping to the end prioritizes the requested frame');
FakeImage.created[3].onerror();
assert.equal(FakeImage.created[3].url,'jpg-119','An unavailable optimized frame falls back to the original');
FakeImage.created[3].finish();
frames.dispose();
assert.ok(FakeImage.created.every(i=>i.cancelled && i.onload===null && i.onerror===null));
frames.preload();frames.request(5);
assert.equal(FakeImage.created.length,5,'Unmount cannot start another frame request');
assert.equal(loaded,2);
for (let i=0;i<120;i++) assert.ok(fs.existsSync(`public/assets/animation-optimized/frame-${String(i).padStart(3,'0')}.webp`));
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
console.log('PASS performance regression: bounded frame loading, current-frame priority, original-image fallback, disposal, responsive assets, custom uploads, deduplicated batch signing and safe Storage failure.');
