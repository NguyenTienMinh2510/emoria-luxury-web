import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const require=createRequire(import.meta.url);
const fixtures={
  language:`export const useLanguage=()=>({t:vi=>vi,tBilingual:vi=>vi,language:'vi'});`,
  store:`export const useStore=()=>({settings:{sandbox:false}});`,
  memory:`export const fetchMemoryView=async tag=>({success:true,data:{...globalThis.introFixture.memory,tag_uid:tag}}); export const verifyMemoryPin=async()=>{globalThis.introFixture.pinChecks++;globalThis.introFixture.memory.is_unlocked=true;return {success:true};}; export const getShowcaseMemoriesList=()=>[]; export const claimNfcOwnership=async()=>({success:true}); export const updateMemorySpace=async()=>({success:true}); export const submitGuestbookEntry=async()=>({success:true});`,
  events:`export const getHouseDraft=async()=>null;export const getPublicHouseByTag=async()=>null;export const HOUSE_ROOMS_SPEC=[];export const HOUSE_THEMES=[];`,
  api:`export const apiRequest=async()=>[];`,
  catalog:`export const callStore=async()=>[];`,
  warmup:`export const triggerAiWarmup=()=>{};`,
  component:`export default function Component(){return null;}`,
  motion:`import React from 'react';const tags={};export const motion=new Proxy({}, {get:(_,tag)=>tags[tag]||(tags[tag]=React.forwardRef(({initial,animate,exit,transition,whileHover,whileTap,...props},ref)=>React.createElement(tag,{...props,ref})))});export const AnimatePresence=({children})=>children;`,
};
const {outputFiles}=await build({
  entryPoints:['src/views/MemorySpaceView.jsx'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
  plugins:[{name:'intro-fixture',setup(builder){
    builder.onResolve({filter:/.*/},({path,kind})=>{
      if(kind==='entry-point')return;
      const local=[[/LanguageProvider(?:\.jsx)?$/,'language'],[/StoreProvider$/,'store'],[/memoryService$/,'memory'],[/eventService\.js$/,'events'],[/apiClient\.js$/,'api'],[/catalogService$/,'catalog'],[/aiWarmup\.js$/,'warmup']].find(([pattern])=>pattern.test(path));
      if(local)return {path:local[1],namespace:'fixture'};
      if(path.includes('/components/')&&!/MemoryCinema$/.test(path))return {path:'component',namespace:'fixture'};
      if(path==='framer-motion')return {path:'motion',namespace:'fixture'};
      if(!path.startsWith('.'))return {path:pathToFileURL(require.resolve(path)).href,external:true};
    });
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:fixtures[path]}));
  }}],
});
const {default:MemorySpace}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{url:'https://emoria.test/?tag=emoria-pulse'});
const previous=Object.fromEntries(['window','document','sessionStorage','IS_REACT_ACT_ENVIRONMENT','introFixture'].map(key=>[key,globalThis[key]]));
Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
window.scrollTo=()=>{};
const container=document.getElementById('root'),calls=[];
let root=createRoot(container),playBlocked=false;
window.HTMLMediaElement.prototype.play=function(){
  calls.push({url:this.src,muted:this.muted});
  if(playBlocked||!this.muted)return Promise.reject(new Error('Autoplay blocked'));
  Object.defineProperty(this,'paused',{value:false,configurable:true});
  this.dispatchEvent(new window.Event('play'));
  return Promise.resolve();
};
window.HTMLMediaElement.prototype.pause=function(){Object.defineProperty(this,'paused',{value:true,configurable:true});};
globalThis.introFixture={pinChecks:0,memory:{success:true,title:'Memory fixture',jewelry_name:'Pulse',is_protected:true,is_unlocked:false,is_owner:false,availability:{status:'available'},intro_video_url:'https://media.example/intro.mp4',letter:'PRIVATE_LETTER',media_gallery:[],guestbook:[]}};
const render=async props=>act(async()=>{root.render(React.createElement(MemorySpace,{initialTag:'emoria-pulse',...props}));});
const click=async text=>{
  const button=[...container.querySelectorAll('button')].find(node=>node.textContent.includes(text));
  assert.ok(button,`Missing ${text}`);
  await act(async()=>button.click());
};
const cinema=()=>container.querySelector('[aria-label="Video mở quà"]');

try {
  await render();
  assert.equal(container.querySelector('video'),null,'PIN-locked data cannot start an intro even if a URL is present');
  assert.ok(container.textContent.includes('Kỷ Niệm Được Khóa Bảo Mật'));
  assert.ok(!container.textContent.includes('PRIVATE_LETTER'));
  await act(async()=>container.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(introFixture.pinChecks,1);
  assert.ok(cinema(),'The authorized PIN response opens the cinema immediately');
  assert.ok(cinema().className.includes('fixed inset-0 z-[120]'),'Cinema covers the whole viewport above the app navigation');
  assert.equal(cinema().getAttribute('aria-modal'),'true');
  assert.ok(!container.textContent.includes('EMORIA MEMORY VAULT')&&!container.textContent.includes('PRIVATE_LETTER'),'Main memory content and tools do not mount behind the intro');
  assert.deepEqual(calls.map(call=>call.muted),[false,true],'Audio autoplay is attempted before the browser-safe muted fallback');
  assert.equal(document.body.style.overflow,'hidden');
  assert.equal(document.activeElement,cinema());
  await click('Bật tiếng video');
  assert.equal(container.querySelector('video').muted,false,'A user gesture enables sound');
  await act(async()=>container.querySelector('video').dispatchEvent(new window.Event('ended')));
  assert.equal(cinema(),null);
  assert.ok(container.textContent.includes('EMORIA MEMORY VAULT'));
  assert.equal(document.body.style.overflow,'');
  await render();
  assert.equal(cinema(),null,'Normal rerenders do not restart the completed intro');
  await click('Mở Niêm Phong');
  assert.ok(container.textContent.includes('PRIVATE_LETTER'));
  assert.equal(container.querySelector('video').autoplay,false,'Opening the letter cannot automatically replay the finished intro');
  assert.equal(calls.length,2);
  await click('Xem lại bộ phim');
  assert.ok(cinema(),'Explicit replay remains available');
  await click('Bỏ qua video');
  assert.equal(cinema(),null,'Skip reveals the main memory immediately');

  await act(async()=>root.unmount());
  root=createRoot(container);
  await render();
  assert.ok(cinema(),'A new NFC opening/component visit plays the intro again');
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(cinema(),null,'Keyboard users can skip the introduction');

  introFixture.memory={...introFixture.memory,is_owner:true};
  await render({initialTag:'owner-memory',currentUser:'owner'});
  assert.equal(cinema(),null,'Owners can edit their memory without an intrusive opening');
  await click('Chỉnh Sửa (Studio)');
  assert.equal(cinema(),null,'Opening Studio does not restart the intro');

  await act(async()=>root.unmount());
  root=createRoot(container);
  introFixture.memory={...introFixture.memory,is_owner:false};
  playBlocked=true;
  await render();
  assert.ok(cinema()&&container.querySelector('[role="alert"]'),'Fully blocked playback has visible retry feedback');
  await click('Bỏ qua video');
  assert.equal(cinema(),null,'Playback failure never traps the recipient');
  console.log('PASS memory intro: PIN authorization, sole fullscreen entry, muted fallback, sound gesture, end/skip, no duplicate inline replay, per-opening completion, owner Studio and blocked-playback exit.');
} finally {
  await act(async()=>root.unmount());
  dom.window.close();
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
}
