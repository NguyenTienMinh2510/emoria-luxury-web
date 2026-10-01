import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';

const {outputFiles}=await build({
  stdin:{contents:`export {default as Gate} from './src/components/MotionEntryGate.jsx';
    export {prepareShowcaseFrames} from './src/services/showcaseFrames.js';`,resolveDir:process.cwd()},
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
const originalWindow=globalThis.window,originalImage=globalThis.Image;
const text=node=>node&&typeof node==='object'?(node.children||[]).map(text).join(''):String(node??'');
const find=(node,type)=>node?.type===type?node:(node?.children||[]).map(child=>find(child,type)).find(Boolean);
globalThis.window={innerWidth:390};globalThis.Image=GateImage;
try {
  const {Gate,prepareShowcaseFrames}=await import(moduleUrl);
  const waiting=Gate({children:'WEBSITE'});
  assert.equal(waiting.type,'main');
  assert.equal(waiting.props['aria-busy'],true);
  assert.ok(text(waiting).includes('Đang chuẩn bị không gian trải nghiệm'));
  assert.ok(!/chuyển động|tải ảnh/i.test(text(waiting)),'Entry copy explains preparation without exposing animation loading');
  assert.equal(find(waiting,'progress').props.value,0);
  assert.equal(find(waiting,'progress').props.max,300);
  assert.equal(find(waiting,'progress').props['aria-describedby'],'entry-status');
  assert.ok(!JSON.stringify(waiting).includes('WEBSITE'),'Website cannot mount behind the loading screen');
  assert.equal(GateImage.created.length,3,'Entry starts the bounded full preload');
  const sequence=prepareShowcaseFrames();
  let updates=0;
  const unsubscribe=sequence.subscribe(()=>updates++);
  await GateImage.created[0].finish();unsubscribe();
  for(let i=1;i<299;i++)await GateImage.created[i].finish();
  assert.equal(updates,1,'Unsubscribed StrictMode consumers cannot cancel or receive preload updates');
  assert.equal(sequence.getSnapshot().loadedCount,299);
  assert.equal(sequence.getSnapshot().ready,false);
  assert.ok(text(Gate({children:'WEBSITE'})).includes('99%'),'299/300 never rounds up to 100%');
  const last=GateImage.created[299];last.holdDecode=true;
  const decoding=last.finish();
  assert.equal(sequence.getSnapshot().ready,false,'Network completion alone cannot unlock the website');
  last.resolveDecode();await decoding;
  assert.equal(Gate({children:'WEBSITE'}),'WEBSITE','All 300 decoded frames unlock entry');
  window.innerWidth=1440;
  assert.equal(prepareShowcaseFrames(),sequence,'Viewport changes reuse the prepared variant');
  assert.equal(GateImage.created.length,300,'Direct article entry and subsequent home access share one sequence');
  assert.ok(GateImage.created.every(image=>image.url.includes('-640.webp')&&!image.cancelled));
  GateImage.created=[];
  const failure=await import(`${moduleUrl}#failed-visit`);
  failure.Gate({children:'WEBSITE'});
  for(let i=0;i<299;i++)await GateImage.created[i].finish();
  GateImage.created[299].onerror();GateImage.created[299].onerror();
  const failedSequence=failure.prepareShowcaseFrames();
  assert.deepEqual(failedSequence.getSnapshot(),{loadedCount:299,ready:false,failed:true});
  const failedGate=failure.Gate({children:'WEBSITE'});
  assert.equal(failedGate.props['aria-busy'],false);
  assert.ok(text(failedGate).includes('Kết nối chưa hoàn tất. Vui lòng thử lại.'));
  assert.ok(!/chuyển động|tải ảnh/i.test(text(failedGate)));
  assert.equal(find(failedGate,'progress').props.value,299,'Failure preserves real progress');
  const retry=find(failedGate,'button');
  assert.equal(text(retry),'Thử lại');
  retry.props.onClick();
  assert.equal(failure.Gate({children:'WEBSITE'}).props['aria-busy'],true);
  assert.equal(GateImage.created.length,301,'Retry reloads only the failed frame, retaining all decoded frames');
  assert.equal(failedSequence.getSnapshot().ready,false);
  await GateImage.created[300].finish();
  assert.equal(failure.Gate({children:'WEBSITE'}),'WEBSITE');
  const main=fs.readFileSync('src/main.jsx','utf8');
  assert.ok(main.indexOf('<MotionEntryGate>')<main.indexOf('<App />')&&main.indexOf('</MotionEntryGate>')>main.indexOf('</LanguageProvider>'),'The startup gate wraps every website route and provider');
  console.log('PASS motion entry: strict 300-frame decode gate, 99% before completion, shared visit cache, failed-frame retry, variant reuse and all-route startup.');
} finally {
  if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
  if(originalImage===undefined)delete globalThis.Image;else globalThis.Image=originalImage;
}
