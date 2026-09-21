import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/memory-media.js';

process.env.SUPABASE_URL='https://media-fixture.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='public-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='server-key';
const originalFetch=globalThis.fetch;
let unlocked=true,missingTable=false,brokenImage=false,signs=[],checks=0;
globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('/rpc/rpc_get_memory_view'))return Response.json({is_unlocked:unlocked,media_gallery:[
    {type:'video',url:'storage://emo-test/ready'},
    {type:'video',url:'storage://emo-test/pending'},
    {type:'video',url:'storage://emo-test/rejected'},
    {type:'image',url:'storage://emo-test/photo'},
    {type:'image',url:'storage://emo-test/disguised-video'},
    {type:'image',url:'storage://other/private'}
  ],audio_url:'storage://emo-test/song',intro_video_path:'emo-test/intro'});
  if(url.includes('/memory_video_labels')){checks++;return missingTable?Response.json({code:'PGRST205',message:'Missing table'}, {status:404}):Response.json([{path:'emo-test/ready'},{path:'emo-test/photo'}]);}
  if(url.includes('/object/info/'))return Response.json({content_type:url.endsWith('/song')?'audio/mpeg':url.endsWith('/disguised-video')?'video/mp4':'image/jpeg'});
  if(url.includes('/object/sign/')){
    const path=url.split('/object/sign/emoria-memory/')[1];signs.push(path);
    if(brokenImage&&path==='emo-test/photo')return Response.json({message:'Missing object'}, {status:404});
    return Response.json({signedURL:'/object/sign/emoria-memory/'+path+'?token=fixture'});
  }
  throw new Error('Unexpected fixture request');
};
async function call(){
  const req=Object.assign(Readable.from([]),{method:'POST',headers:{},body:{tag:'emo-test'}});
  let response;await handler(req,{setHeader(){},end(value){response={status:this.statusCode,data:JSON.parse(value)};}});
  return response;
}
try{
  const normal=await call();assert.equal(normal.status,200);
  assert.deepEqual(Object.keys(normal.data.urls).sort(),['emo-test/photo','emo-test/ready','emo-test/song']);
  assert.deepEqual(normal.data.blocked,['emo-test/pending','emo-test/rejected','emo-test/disguised-video','other/private','emo-test/intro']);
  assert.ok(!signs.some(path=>path.startsWith('other/')),'Never sign a foreign memory path');
  assert.ok(!signs.includes('emo-test/disguised-video'),'Gallery type cannot bypass video moderation');
  missingTable=true;signs=[];
  const degraded=await call();assert.equal(degraded.status,200);assert.ok(degraded.data.warning);
  assert.deepEqual(Object.keys(degraded.data.urls).sort(),['emo-test/song']);
  assert.ok(!signs.includes('emo-test/ready'),'Missing moderation table must not approve video');
  missingTable=false;brokenImage=true;
  const partial=await call();assert.equal(partial.status,200);assert.ok(partial.data.urls['emo-test/song']);assert.ok(partial.data.unavailable.includes('emo-test/photo'));
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;signs=[];checks=0;
  const missingKey=await call();assert.equal(missingKey.status,200);assert.deepEqual(missingKey.data.urls,{});assert.ok(missingKey.data.warning);assert.equal(checks,0);assert.equal(signs.length,0);
  unlocked=false;assert.equal((await call()).status,403,'Soft fallback never bypasses the PIN/access check');
  console.log('PASS memory media: missing key/table degrade safely, pending/rejected/foreign paths never signed, partial media failures, locked memory remains forbidden.');
}finally{globalThis.fetch=originalFetch;}
