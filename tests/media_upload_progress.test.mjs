import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {estimateMediaSeconds,mediaProgress,recordMediaTiming,remainingMediaSeconds,runMediaBatch} from '../src/services/mediaUploadProgress.js';

const photo={name:'photo.jpg',type:'image/jpeg',size:1048576};
const video={name:'video.mp4',type:'video/mp4',size:10*1048576};
assert.ok(estimateMediaSeconds(video)>estimateMediaSeconds(photo));
assert.ok(estimateMediaSeconds(video,'reviewing')>estimateMediaSeconds(photo,'reviewing'));
const progress=mediaProgress(photo,'uploading',5);
assert.equal(remainingMediaSeconds(progress,progress.startedAt+2000),3);
assert.equal(remainingMediaSeconds(progress,progress.startedAt+8000),0);
assert.equal(remainingMediaSeconds(progress,progress.startedAt-1000),5);
const before=estimateMediaSeconds(photo,'reviewing');
recordMediaTiming(photo,'reviewing',30);
assert.ok(estimateMediaSeconds(photo,'reviewing')>before);

// Out-of-order completions retain every success in selection order; one failure doesn't drop its peers.
let active=0,peak=0;
const releases=[],completed=[];
const batch=runMediaBatch([0,1,2,3],async index=>{
  peak=Math.max(peak,++active);
  await new Promise(resolve=>{releases[index]=resolve;});
  active--;
  if(index===2)throw new Error('Rejected');
  return index;
},(result,index)=>completed.push(index));
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
assert.equal(active,2);
releases[1]();await flush();
releases[2]();await flush();
releases[3]();await flush();
releases[0]();
const results=await batch;
assert.equal(peak,2);
assert.deepEqual(completed,[1,2,3,0]);
assert.deepEqual(results.filter(r=>r.status==='fulfilled').map(r=>r.value),[0,1,3]);
assert.equal(results[2].status,'rejected');
assert.deepEqual(await runMediaBatch([],()=>assert.fail(),()=>assert.fail()),[]);

const target=path.resolve('.local/media-upload-test');mkdirSync(target,{recursive:true});
const compile=async(file,name,plugins=[])=>{
  const outfile=path.join(target,name+'.mjs');
  await build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins,define:{'import.meta.env':'{}'},logLevel:'silent'});
  return import(pathToFileURL(outfile).href);
};
let transfers=0,requests=[];
globalThis.__mediaTest={
  storage:{storage:{from:()=>({upload:async()=>{transfers++;return {};}})}},
  request:async(_url,{body})=>{requests.push({path:body.path,at:Date.now()});return {approved:!body.path.includes('reject'),labels:[]};}
};
const stubs={name:'media-fixtures',setup(b){
  b.onLoad({filter:/[\\/]supabaseClient\.js$/},()=>({contents:'export const supabase=globalThis.__mediaTest.storage;',loader:'js'}));
  b.onLoad({filter:/[\\/]apiClient\.js$/},()=>({contents:'export const apiRequest=(...args)=>globalThis.__mediaTest.request(...args);',loader:'js'}));
}};
const {uploadModeratedMedia,moderateUploadedMedia}=await compile('src/services/videoUpload.js','service',[stubs]);
mock.timers.enable({apis:['Date','setTimeout'],now:100000});
try{
  await assert.rejects(uploadModeratedMedia('tag',photo,false),/đồng ý/);
  await assert.rejects(uploadModeratedMedia('tag',{...photo,size:0},true),/50 MB/);
  assert.equal(transfers,0);
  const stages=[[],[]];
  const first=uploadModeratedMedia('tag',photo,true,'gallery',p=>stages[0].push(p.stage));
  const second=uploadModeratedMedia('tag',video,true,'gallery',p=>stages[1].push(p.stage));
  await flush();
  assert.equal(transfers,2,'Both storage uploads start before the second review');
  assert.equal(requests.length,2,'Both reviews start immediately without a cooldown');
  const uploaded=await Promise.all([first,second]);
  assert.equal(requests[1].at-requests[0].at,0);
  assert.ok(uploaded.every(item=>item.approved&&item.path.startsWith('tag/gallery-')));
  assert.deepEqual(stages[0],['uploading','reviewing']);
  assert.equal(stages[1].at(-1),'reviewing');
  const rejection=assert.rejects(moderateUploadedMedia('tag','tag/reject.jpg',true),/chưa đạt/);
  await rejection;
  const recovery=moderateUploadedMedia('tag','tag/next.jpg',true);
  assert.equal((await recovery).approved,true,'A rejected file cannot block later uploads');
}finally{mock.timers.reset();delete globalThis.__mediaTest;}

const {default:Modal}=await compile('src/components/MediaModerationModal.jsx','modal');
const render=props=>renderToStaticMarkup(React.createElement(Modal,props));
assert.equal(render({isOpen:false}), '');
const html=render({isOpen:true,jobs:[mediaProgress(photo,'uploading',45)],completed:1,total:3});
assert.match(html,/Bước này còn khoảng/);
assert.match(html,/Đã xử lý 1\/3 tệp/);
assert.match(html,/aria-labelledby=/);
assert.doesNotMatch(html,/NaN|Infinity/);
const overdue=render({isOpen:true,jobs:[{...mediaProgress(video,'reviewing',1),startedAt:Date.now()-5000}]});
assert.match(overdue,/Lâu hơn dự kiến/);
assert.doesNotMatch(overdue,/còn khoảng 0/);
console.log('PASS media uploads: two parallel uploads/reviews without cooldown, failure recovery, ordered partial success, adaptive ETA and overdue UI.');
