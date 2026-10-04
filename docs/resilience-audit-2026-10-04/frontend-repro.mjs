import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
import { loadShowcaseFrames, prepareShowcaseFrames } from '../../src/services/showcaseFrames.js';

// No network, browser, account, storage or database writes. All external effects are mocks.
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const app = fs.readFileSync('src/App.jsx', 'utf8');
const initializer = app.match(/const \[cartItems, setCartItems\] = useState\(\(\) => \{([\s\S]*?)\n  \}\);/)[1];
const readCart = new Function('localStorage', initializer);
for (const raw of ['null', '{}', '[null]']) {
  const cart = readCart({ getItem: () => raw });
  assert.throws(() => cart.reduce((sum, item) => sum + item.quantity, 0), TypeError);
}
results.push({scenario:'Valid JSON with an invalid cart shape', observed:'null, {}, [null] each throws TypeError in the actual cart-count expression; syntax catch does not repair them.'});

const apiSource = fs.readFileSync('src/services/apiClient.js', 'utf8').replace(/^import[^\n]+\n/, '').replace('export async function', 'async function');
const createApi = new Function('supabase', 'fetch', `${apiSource}; return apiRequest;`);
let releaseSession, fetchCalls = 0, settled = false;
const api = createApi({auth:{getSession:()=>new Promise(resolve => {releaseSession=resolve;})}}, async () => {
  fetchCalls++;
  return {ok:true,json:async()=>({ok:true})};
});
const started = Date.now();
const request = api('/catalog', {timeoutMs:10}).then(value => {settled=true;return value;});
await pause(80);
assert.equal(settled,false);
assert.equal(fetchCalls,0);
releaseSession({data:{session:null}});
assert.deepEqual(await request,{ok:true});
results.push({scenario:'Auth lookup stalls before API request deadline', observed:`Still pending after an 80 ms wait with timeoutMs=10; no API fetch started; eventually resolves ${Date.now()-started} ms after invocation.`});

const sdkSource=fs.readFileSync('node_modules/@supabase/supabase-js/src/lib/fetch.ts','utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\r?\n/gm,'');
const { code } = await transform(sdkSource,{loader:'ts',format:'esm',logLevel:'silent'});
const {fetchWithAuth} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
let releaseToken, sdkFetches=0, sdkSettled=false;
const sdkFetch=fetchWithAuth('fake-anon','https://offline.invalid',()=>new Promise(resolve=>{releaseToken=resolve;}),async()=>{sdkFetches++;return {ok:true};});
const aborted=new AbortController();aborted.abort();
const sdkRequest=sdkFetch('https://offline.invalid/rest/v1/rpc/rpc_get_system_status',{signal:aborted.signal}).then(value=>{sdkSettled=true;return value;});
await pause(30);
assert.equal(sdkSettled,false);assert.equal(sdkFetches,0);
releaseToken(null);await sdkRequest;
results.push({scenario:'Supabase public RPC awaits Auth before forwarding AbortSignal', observed:'Even a pre-aborted signal cannot settle the actual installed SDK fetch wrapper while getAccessToken is pending.'});

class StalledImage {
  static created=[];
  constructor(){StalledImage.created.push(this);}
  set src(value){this.url=value;}
  removeAttribute(){}
}
let completed=0;
const frames=loadShowcaseFrames({count:150,getPath:index=>`frame-${index}.webp`,onLoad:()=>completed++,ImageClass:StalledImage});
frames.preload();
assert.equal(StalledImage.created.length,3);
frames.request(20);
await pause(30);
assert.equal(StalledImage.created.length,3);assert.equal(completed,0);
assert.equal(frames.settled.some(Boolean),false);
frames.dispose();
const oldWindow=globalThis.window,oldImage=globalThis.Image;
globalThis.window={innerWidth:390};globalThis.Image=StalledImage;
const sequence=prepareShowcaseFrames();
assert.equal(sequence.getSnapshot().ready,false);assert.equal(sequence.getSnapshot().failed,false);
sequence.retry();
assert.equal(sequence.getSnapshot().failed,false);
sequence.loader.dispose();
if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;
results.push({scenario:'Three frame image requests stall without callbacks', observed:'Loader remains at three pending images, cannot prioritize a new frame, entry snapshot is ready=false/failed=false, and retry is a no-op.'});

function jpegSize(path){
  const bytes=fs.readFileSync(path);let offset=2;
  while(offset<bytes.length){
    if(bytes[offset++]!==0xff)continue;
    let marker=bytes[offset++];while(marker===0xff)marker=bytes[offset++];
    if(marker===0xd8||marker===0xd9||marker===0x01)continue;
    const length=bytes.readUInt16BE(offset);
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {width:bytes.readUInt16BE(offset+5),height:bytes.readUInt16BE(offset+3)};
    offset+=length;
  }
  throw new Error('No JPEG frame metadata');
}
const fallback=jpegSize('public/assets/animation/ezgif-frame-001.jpg');
results.push({scenario:'Retained homepage frame sequence', fallbackDimensions:fallback, estimatedDecodedRGBA_MiB:{mobile:150*640*360*4/1048576,desktop:150*960*540*4/1048576,fallback:150*fallback.width*fallback.height*4/1048576}, note:'Arithmetic pixel budgets, not measured browser allocation or a demonstrated OOM. Browsers may discard decoded cache.'});
console.log(JSON.stringify({networkRequests:0,results},null,2));
