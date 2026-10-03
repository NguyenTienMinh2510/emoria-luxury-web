import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ROOM_PRESETS,applyPresetToRooms,getRoomPresetId} from '../src/data/housePresets.js';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const f={spec:Object.keys(ROOM_PRESETS).map(id=>({id,name:id,description:id})),writes:[],fail:false,published:0};
f.draft={title:'Our house',theme:'warm_gold',rooms:applyPresetToRooms(f.spec.map(r=>({...r,note:'Keep',lighting:'day',memories:[]}))),draft_revision:1};
globalThis.housePresetUI=f;
const outfile=path.resolve('.local/ui-render/house-preset-ui.mjs');fs.mkdirSync(path.dirname(outfile),{recursive:true});
await build({entryPoints:['src/components/MemoryHouseStudio.jsx'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{
  name:'house-boundaries',setup(builder){
    builder.onResolve({filter:/^react$/},()=>({path:'react',external:true}));
    builder.onResolve({filter:/MemoryHouse3D\.jsx$|eventService\.js$|postcardGenerator\.js$|^framer-motion$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path:file})=>({contents:
      file.endsWith('MemoryHouse3D.jsx')?`import React from 'react'; export default function Model(props){globalThis.housePresetUI.renderer=props;return React.createElement('div',{'data-testid':'house-model','data-readonly':String(props.readOnly)});}`:
      file==='framer-motion'?`import React from 'react'; const component=type=>({children,initial,animate,exit,transition,whileHover,whileTap,layout,...props})=>React.createElement(type,props,children);export const motion={div:component('div'),p:component('p')};export const AnimatePresence=({children})=>children;`:
      file.endsWith('postcardGenerator.js')?`export const POSTCARD_FORMATS={},POSTCARD_TEMPLATES={};export const renderPostcardCanvas=()=>{},downloadPostcardFile=()=>{},sharePostcard=()=>{};`:
      `const f=globalThis.housePresetUI;
       export const HOUSE_ROOMS_SPEC=f.spec,HOUSE_THEMES=['warm_gold','classic','minimal_dark'];
       export const getHouseDraft=async()=>structuredClone({...f.draft,can_restore_layout:f.writes.length>0});
       export async function saveHouseDraft(tag,payload){f.writes.push(structuredClone(payload));if(f.hold)await new Promise(r=>f.resolveSave=r);if(f.fail)throw Error('Offline test');f.draft={...structuredClone(payload),draft_revision:f.draft.draft_revision+1};return {draft_revision:f.draft.draft_revision};}
       export const getHouseReplies=async()=>[],trackEventAction=()=>{},submitContentReport=async()=>{},sendHouseReply=async()=>{};
       export const restoreHouseLayout=async()=>{},publishHouse=async()=>{f.published++;return {share_id:'share'};},unpublishHouse=async()=>{f.unpublishedNote=f.draft.rooms[1].note;},revokeHouseShare=async()=>{};
       export const getPublicHouse=async()=>f.draft,getPublicHouseByTag=async()=>f.draft;
       export const uploadEventPhoto=()=>new Promise(resolve=>f.resolveUpload=()=>resolve({path:'tag/new.png',url:'https://example.test/new.png'}));`
    }));
  }
}]});
const {default:Studio}=await import(pathToFileURL(outfile));
let root=createRoot(document.getElementById('root'));
const props={tagUid:'tag',currentUser:{id:'owner'}};
const render=()=>act(async()=>{root.render(React.createElement(Studio,props));});
const buttons=()=>[...document.querySelectorAll('button')];
const button=text=>{const b=buttons().find(b=>b.textContent.trim()===text);assert.ok(b,`Missing button: ${text}`);return b;};
const roomPreset=name=>{const b=buttons().find(b=>b.getAttribute('aria-label')===name);assert.ok(b,name);return b;};
const click=b=>act(async()=>b.click());
try {
  await render();
  assert.equal(f.writes.length,0,'Loading an existing house does not rewrite it');
  const original=structuredClone(f.draft.rooms),staleEdit=f.renderer.onRoomsChange;
  await click(roomPreset('Xem trước Vintage Hoài Niệm cho beginning'));
  assert.equal(f.writes.length,0,'Preview does not save a preset');
  assert.equal(f.renderer.readOnly,true);
  assert.equal(getRoomPresetId(f.renderer.rooms[0]),'vintage');
  assert.ok(document.querySelector('fieldset').disabled,'Content editing is locked during preview');
  await act(async()=>staleEdit([]));assert.equal(f.renderer.rooms.length,5,'A stale renderer callback cannot edit during preview');
  assert.ok(document.querySelector('button[aria-label="Xuất Bản Ngôi Nhà"]').disabled,'Publish is disabled during preset preview');
  await click(button('Hủy xem trước'));
  assert.deepEqual(f.renderer.rooms,original);assert.equal(f.renderer.readOnly,false);
  await click(buttons().filter(b=>b.textContent.trim()==='Xem trước mẫu này')[1]);
  assert.equal(f.renderer.theme,'classic','Whole-house preview includes its theme');
  assert.equal(f.draft.theme,'warm_gold','Preview theme is not persisted');
  await click(button('Hủy xem trước'));assert.equal(f.renderer.theme,'warm_gold');

  await click(roomPreset('Xem trước Vintage Hoài Niệm cho beginning'));f.fail=true;
  await click(button('Áp dụng mẫu'));
  assert.ok(document.body.textContent.includes('Offline test'));assert.equal(getRoomPresetId(f.draft.rooms[0]),'cozy');
  assert.ok(button('Hủy xem trước'));
  f.fail=false;f.hold=true;
  const apply=button('Áp dụng mẫu');
  await act(async()=>{apply.click();apply.click();});
  const writeCount=f.writes.length;
  assert.equal(writeCount,2,'Failure plus one retry; a double click never duplicates a write');
  assert.ok(button('Hủy xem trước').disabled);
  await act(async()=>f.resolveSave());f.hold=false;
  assert.equal(getRoomPresetId(f.draft.rooms[0]),'vintage');
  assert.equal(roomPreset('Xem trước Vintage Hoài Niệm cho beginning').getAttribute('aria-pressed'),'true');
  assert.ok(button('Hoàn tác lần đổi mẫu gần nhất'));
  assert.ok(button('Khôi phục bố cục đã sao lưu'),'Backup restoration becomes available immediately');
  await act(async()=>f.renderer.onSelectRoom('first'));
  assert.equal(roomPreset('Xem trước Trà Chiều Cổ Điển cho first').getAttribute('aria-pressed'),'false');
  assert.equal(roomPreset('Xem trước Bistro Cozy cho first').getAttribute('aria-pressed'),'true');
  await act(async()=>{await new Promise(r=>setTimeout(r,1100));});
  assert.equal(f.writes.length,writeCount,'Applying a preset must not cause a second autosave');
  await click(button('Hoàn tác lần đổi mẫu gần nhất'));
  assert.equal(getRoomPresetId(f.draft.rooms[0]),'cozy');

  const startUpload=f.renderer.onUploadPhoto;
  await act(async()=>{void startUpload('first',{});});
  assert.equal(f.renderer.readOnly,true,'Uploads share the mutation lock');
  assert.ok(roomPreset('Xem trước Bistro Cozy cho first').disabled);
  await act(async()=>f.resolveUpload());
  assert.equal(f.draft.rooms[1].memories.length,1);
  assert.equal(f.renderer.readOnly,false);

  await click(roomPreset('Xem trước Trà Chiều Cổ Điển cho first'));
  await click(button('Áp dụng mẫu'));
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  await render();await act(async()=>f.renderer.onSelectRoom('first'));
  assert.equal(roomPreset('Xem trước Trà Chiều Cổ Điển cho first').getAttribute('aria-pressed'),'true','Selection survives a real remount/reload');
  assert.equal(f.draft.rooms[1].memories.length,1);
  const lastPreset=roomPreset('Xem trước Hẹn Hò Lãng Mạn cho first');
  await act(async()=>{
    f.renderer.onRoomsChange(prev=>prev.map(r=>r.id==='first'?{...r,note:'Latest unsaved note'}:r));
    lastPreset.click();
  });
  assert.equal(f.renderer.rooms[1].note,'Latest unsaved note','Preview flushes the latest edit even before React renders');
  await click(button('Áp dụng mẫu'));
  assert.equal(f.draft.rooms[1].note,'Latest unsaved note');
  f.draft.is_published=true;f.draft.share_id='share';
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await render();
  const unpublish=button('Gỡ công khai');
  await act(async()=>{
    f.renderer.onRoomsChange(prev=>prev.map(r=>r.id==='first'?{...r,note:'Save before unpublish'}:r));
    unpublish.click();
  });
  assert.equal(f.unpublishedNote,'Save before unpublish','Public actions flush pending edits instead of stranding autosave');
  console.log('PASS React preset UI: preview/cancel, blocked edits/publish/upload, failure/retry, double clicks, one save, room-specific indicators, upload persistence, immediate undo/backup and reload.');
} finally {await act(async()=>root.unmount());dom.window.close();delete globalThis.housePresetUI;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
