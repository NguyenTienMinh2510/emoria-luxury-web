import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';

const {outputFiles}=await build({
  stdin:{contents:`export {default as Gate} from './src/components/MotionEntryGate.jsx';
    export {prepareShowcaseFrames,getShowcasePreloadCount,SHOWCASE_DURATION_MS} from './src/services/showcaseFrames.js';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
  plugins:[{name:'controlled-gate',setup(builder){
    builder.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`
      export const useSyncExternalStore=(subscribe,getSnapshot)=>getSnapshot();
      export default {createElement(type,props,...children){return {type,props,children};}};
    `}));
  }}],
});
const moduleUrl=`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`;
class GateImage {
  static created=[];
  constructor(){GateImage.created.push(this);}
  set src(url){this.url=url;}
  decode(){return this.holdDecode?new Promise(resolve=>{this.resolveDecode=resolve;}):Promise.resolve();}
  async finish(){this.naturalWidth=this.width=640;this.height=360;await this.onload();}
  removeAttribute(){this.cancelled=true;}
}
const original=Object.fromEntries(['window','Image','performance'].map(key=>[key,globalThis[key]]));
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?(node.children||[]).map(text).join(''):String(node??'');
const find=(node,type)=>node?.type===type?node:(node?.children||[]).map(child=>find(child,type)).find(Boolean);
let now=0;
Object.assign(globalThis,{window:{innerWidth:390},Image:GateImage,performance:{now:()=>now}});
try {
  const {Gate,prepareShowcaseFrames,getShowcasePreloadCount,SHOWCASE_DURATION_MS}=await import(moduleUrl);
  for(const rate of [5,10,20,40,80]) {
    const preload=getShowcasePreloadCount(30,30/rate*1000);
    assert.ok(preload>=30&&preload<=150);
    assert.ok(preload+rate*0.7*SHOWCASE_DURATION_MS/1000>=150,'A conservative measured rate can deliver the remaining sequence before playback ends');
  }
  assert.ok(getShowcasePreloadCount(30,6000)>getShowcasePreloadCount(30,1000),'Slower decoding/network delivery requires more initial frames');
  assert.ok(Math.abs(SHOWCASE_DURATION_MS-4152.78)<0.01);

  const nfcWaiting=Gate({pending:true,waitForFrames:false});
  assert.equal(nfcWaiting.type,'main');
  assert.equal(GateImage.created.length,0,'NFC/system preparation starts no homepage frame requests');
  assert.equal(find(nfcWaiting,'progress').props.value,undefined,'System preparation has an honest indeterminate indicator');
  const waiting=Gate({children:'WEBSITE'});
  assert.equal(waiting.props['aria-busy'],true);
  assert.ok(text(waiting).includes('Đang chuẩn bị không gian trải nghiệm'));
  assert.ok(!/chuyển động|tải ảnh|\d+%/i.test(text(waiting)),'Entry has neutral copy without visible frame guides or percentages');
  assert.equal(find(waiting,'progress').props.max,150);
  assert.ok(!JSON.stringify(waiting).includes('WEBSITE'),'Home content waits for its playable buffer');
  assert.equal(GateImage.created.length,3,'Preload remains bounded to three simultaneous requests');
  const sequence=prepareShowcaseFrames();
  let updates=0;
  const unsubscribe=sequence.subscribe(()=>updates++);
  now=15;await GateImage.created[0].finish();unsubscribe();
  for(let i=1;i<29;i++){now+=15;await GateImage.created[i].finish();}
  assert.equal(updates,1,'Unsubscribed StrictMode consumers retain shared downloads without receiving updates');
  assert.equal(sequence.getSnapshot().bufferedCount,29);
  assert.equal(sequence.getSnapshot().ready,false);
  const boundary=GateImage.created[29];boundary.holdDecode=true;
  now+=15;const decoding=boundary.finish();
  assert.equal(sequence.getSnapshot().ready,false,'Undecoded network responses cannot count towards the initial buffer');
  boundary.resolveDecode();await decoding;
  assert.equal(Gate({children:'WEBSITE'}),'WEBSITE','A fast connection opens with 30 decoded frames while the rest loads in the background');
  assert.equal(sequence.getSnapshot().loadedCount,30);
  assert.equal(Gate({pending:true,children:'WEBSITE'}).type,'main','A ready buffer never bypasses pending system checks');
  now+=10000;
  for(let i=30;i<GateImage.created.length;i++)await GateImage.created[i].finish();
  assert.equal(sequence.getSnapshot().ready,true,'Readiness is retained through later throughput changes');
  assert.equal(GateImage.created.length,48,'Initial mobile prefetch retains a bounded decoded window');
  sequence.loader.request(149);sequence.loader.preload(48,150);
  for(let i=48;i<GateImage.created.length;i++){now+=15;await GateImage.created[i].finish();}
  assert.equal(sequence.getSnapshot().loadedCount,150,'All 150 samples remain available to playback');
  assert.ok(sequence.loader.ready.filter(Boolean).length<=48,'The whole sequence is never retained decoded at once');
  const indices=GateImage.created.map(image=>Number(image.url.match(/frame-(\d+)/)[1]));
  assert.equal(new Set(indices).size,150);
  const sortedIndices=[...indices].sort((a,b)=>a-b);
  assert.equal(sortedIndices[0],0);assert.equal(sortedIndices.at(-1),299);
  assert.ok(sortedIndices.slice(1).every((index,i)=>index-sortedIndices[i]>=2&&index-sortedIndices[i]<=3),'Sampling preserves the whole original sequence evenly');
  window.innerWidth=1440;
  assert.equal(prepareShowcaseFrames(),sequence,'Remounts and viewport changes reuse the decoded mobile variant');
  assert.ok(GateImage.created.every(image=>image.url.includes('-640.webp')));
  assert.ok(GateImage.created.some(image=>image.cancelled),'Frames outside the playback window are released');
  sequence.dispose();

  GateImage.created=[];now=0;
  const failure=await import(`${moduleUrl}#failed-visit`);
  failure.Gate({children:'WEBSITE'});
  for(let i=1;i<GateImage.created.length;i++){now+=50;await GateImage.created[i].finish();}
  const failedSequence=failure.prepareShowcaseFrames();
  assert.equal(failedSequence.getSnapshot().loadedCount,59);
  assert.equal(failedSequence.getSnapshot().bufferedCount,0);
  assert.equal(failedSequence.getSnapshot().ready,false,'Out-of-order frames cannot substitute for a contiguous initial buffer');
  GateImage.created[0].onerror();GateImage.created[0].onerror();
  const failedGate=failure.Gate({children:'WEBSITE'});
  assert.equal(failedGate.props['aria-busy'],false);
  assert.ok(text(failedGate).includes('Kết nối chưa hoàn tất. Vui lòng thử lại.'));
  failedSequence.retry();
  assert.equal(GateImage.created.length,61,'Retry keeps decoded frames and reloads the missing first image');
  await GateImage.created[60].finish();
  assert.equal(failure.Gate({children:'WEBSITE'}),'WEBSITE');
  failedSequence.dispose();
  const main=fs.readFileSync('src/main.jsx','utf8'),app=fs.readFileSync('src/App.jsx','utf8');
  assert.ok(!main.includes('MotionEntryGate'),'Providers, system status and NFC routing mount without a global frame dependency');
  assert.ok(app.includes("<MotionEntryGate pending waitForFrames={currentView === 'home'} />"));
  console.log('PASS motion entry: 150 even samples, original duration, throughput-based decoded buffer, background completion, contiguous readiness, system/NFC priority, shared cache and retry.');
} finally {
  for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
}
