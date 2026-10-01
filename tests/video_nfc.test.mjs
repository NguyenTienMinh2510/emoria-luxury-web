import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/v1.js';
import {labelVideo} from '../server/geminiVideo.js';
import {labelWithQwen} from '../server/aiService.js';
import {nfcMemoryUrl,nfcChipUrl,readNfcTarget,readMemoryTag,canUseNfc,nfcError} from '../src/services/nfc.js';
import {normalizeVideoLabels,moderationResult} from '../src/services/videoLabels.js';
const record=url=>({recordType:'url',data:new DataView(new TextEncoder().encode(url).buffer)});
const origin='https://emoria-luxury-web.vercel.app';
assert.equal(nfcMemoryUrl('emo-test'),origin+'/?tag=emo-test');
assert.equal(readMemoryTag({records:[{recordType:'text'},record(origin+'/?tag=emo-test')]}),'emo-test');
for(const url of ['https://evil.test/?tag=emo-test','javascript:alert(1)',origin+'/?tag=../private',origin+'/?tag=a&tag=b',origin+'/other?tag=abc'])assert.throws(()=>readMemoryTag({records:[record(url)]}));
assert.throws(()=>nfcMemoryUrl('../private'));assert.throws(()=>nfcMemoryUrl('valid','http://insecure.test'));
const chipId='12345678-1234-1234-1234-123456789abc';
assert.equal(nfcChipUrl(chipId),origin+'/?chip='+chipId);
assert.deepEqual(readNfcTarget({records:[record(nfcChipUrl(chipId))]}),{kind:'chip',id:chipId});
for(const url of [origin+'/?chip=invalid',origin+'/?chip='+chipId+'&tag=a',origin+'/?chip='+chipId+'&chip='+chipId])assert.throws(()=>readNfcTarget({records:[record(url)]}));
assert.equal(canUseNfc(),false);assert.match(nfcError({name:'NotAllowedError'}),/quyền/);
assert.deepEqual(normalizeVideoLabels(['Biển','Biển','Du lịch']),['Biển','Du lịch']);
assert.deepEqual(normalizeVideoLabels(['  Hội trại cuối hè! 🎉  ','hội trại cuối hè','Hội trại cuối hè','\u202e***','Chèo thuyền kayak']),['Hội trại cuối hè','Chèo thuyền kayak']);
assert.equal(normalizeVideoLabels(['a'.repeat(60)])[0].length,40);
assert.equal(normalizeVideoLabels(Array.from({length:12},(_,i)=>`Chủ đề ${i}`)).length,8);
assert.throws(()=>normalizeVideoLabels([null]));
assert.throws(()=>moderationResult({labels:[]}),/chưa trả đủ/);
assert.equal(moderationResult({labels:['Gia đình'],violations:[]}).approved,true);
assert.equal(moderationResult({labels:['Gia đình'],violations:['SEXUAL_EXPLICIT']}).approved,false);
assert.throws(()=>moderationResult({labels:[],violations:['Sadness']}));
const googleResponse=()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({labels:['Biển','Du lịch'],violations:[]})}]}}]});
const small=new Blob(['video fixture'],{type:'video/mp4'});
const qwenResponse=()=>Response.json({success:true,approved:true,labels:['Biển','Du lịch'],violations:[]});
const signedUrl='https://video-fixture.supabase.co/storage/v1/object/sign/emoria-memory/emo-test/file?token=fixture';
let qwenBody;
assert.equal((await labelWithQwen(null,{url:signedUrl,type:'video',fetchImpl:async(_url,options)=>{
  qwenBody=JSON.parse(options.body);return qwenResponse();
}})).approved,true);
assert.deepEqual(qwenBody,{url:signedUrl,type:'video'},'No base64 relay for an authorized Storage URL');
for(const invalid of [{},{error:'missing input'},{success:false},{success:true,labels:[]},{success:true,labels:[],violations:['unknown']},{success:true,approved:false,labels:[],violations:[]}]){
  await assert.rejects(labelWithQwen(small,{fetchImpl:async()=>Response.json(invalid)}),error=>error.status===502);
}
await assert.rejects(labelWithQwen(small,{fetchImpl:async()=>Response.json({success:false,approved:false,error_code:'GPU_MEMORY',error:'private CUDA allocation details',labels:[],violations:[]})}),error=>error.status===503&&error.message.includes('thiếu bộ nhớ')&&!error.message.includes('private CUDA'));
assert.equal((await labelWithQwen(small,{fetchImpl:async()=>Response.json({success:true,approved:false,labels:[],violations:['GRAPHIC_VIOLENCE']})})).approved,false);
let googleCalls=[];
const google=async(url,options)=>{googleCalls.push({url,options});return googleResponse();};
assert.deepEqual((await labelVideo(small,'private-key',{fetchImpl:google})).labels,['Biển','Du lịch']);
const currentModel=process.env.GEMINI_VIDEO_MODEL||'gemini-3.7-flash';
assert.match(googleCalls[0].url,new RegExp(`${currentModel}:generateContent`));
assert.ok(JSON.parse(googleCalls[0].options.body).contents[0].parts[0].inlineData);
const generation=JSON.parse(googleCalls[0].options.body).generationConfig;
assert.equal(generation.responseSchema.properties.labels.items.enum,undefined);
assert.equal(generation.responseSchema.properties.labels.maxItems,8);
if(currentModel.startsWith('gemini-3.'))assert.equal(generation.thinkingConfig.thinkingLevel,'low');
const origModel=process.env.GEMINI_VIDEO_MODEL;
process.env.GEMINI_VIDEO_MODEL='gemini-2.5-flash';
try{await labelVideo(small,'key',{fetchImpl:google});assert.match(googleCalls.at(-1).url,/gemini-2.5-flash:generateContent/);}finally{if(origModel!==undefined)process.env.GEMINI_VIDEO_MODEL=origModel;else delete process.env.GEMINI_VIDEO_MODEL;}

await assert.rejects(()=>labelVideo(new Blob(['x'],{type:'application/pdf'}),'key'),/MP4/);
const imageResult=await labelVideo(new Blob(['fake image'],{type:'image/png'}),'key',{fetchImpl:google});
assert.equal(imageResult.approved,true);
assert.equal((await labelVideo(small,'key',{fetchImpl:async()=>Response.json({candidates:[{finishReason:'SAFETY'}]})})).approved,false);
const providerBlock=await labelVideo(small,'key',{fetchImpl:async()=>Response.json({promptFeedback:{blockReason:'SAFETY',safetyRatings:[{category:'HARM_CATEGORY_SEXUALLY_EXPLICIT',blocked:true}]}})});
assert.deepEqual(providerBlock.violations,['SEXUAL_EXPLICIT']);
await assert.rejects(()=>labelVideo(small,'key',{fetchImpl:async()=>Response.json({}, {status:429})}),/hạn mức/);
await assert.rejects(()=>labelVideo(small,'key',{fetchImpl:async()=>Response.json({}, {status:503})}),error=>error.status===503&&/quá tải/.test(error.message));
let deleted=false;
await assert.rejects(()=>labelVideo(new Blob([new Uint8Array(11*1024*1024)],{type:'video/webm'}),'key',{fetchImpl:async(url,options)=>{
  if(url.endsWith('/upload/v1beta/files'))return new Response('',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload-fixture'}});
  if(url.endsWith('/upload-fixture'))return Response.json({file:{name:'files/test-file',uri:'https://generativelanguage.googleapis.com/v1beta/files/test-file',state:'ACTIVE'}});
  if(options.method==='DELETE'){deleted=true;return new Response('{}');}
  return Response.json({error:'private upstream error'}, {status:500});
}}));assert.equal(deleted,true,'Temporary Google file must be deleted on model failure');

process.env.SUPABASE_URL='https://video-fixture.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='public-key';process.env.SUPABASE_SERVICE_ROLE_KEY='server-key';process.env.GEMINI_API_KEY='private-key';
const originalFetch=globalThis.fetch;
let reserveError=false,owner=true,unlocked=true,cached=false,isAdmin=false,dbCalls=[],modelCalls=0,storedLabels,malformedQwen=false;
globalThis.fetch=async(input,options={})=>{
  const url=String(input);dbCalls.push(url);
  if(url.startsWith('https://generativelanguage.googleapis.com')){modelCalls++;return googleResponse();}
  if(url.includes('.modal.run')){modelCalls++;assert.deepEqual(JSON.parse(options.body),{url:signedUrl,type:'video'});return malformedQwen?Response.json({error:'incomplete'}):qwenResponse();}
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner-id'});
  if(url.includes('/rpc/is_admin'))return Response.json(isAdmin);
  if(url.includes('/video_upload_events'))return Response.json([]);
  if(url.includes('/rpc/rpc_get_memory_view'))return Response.json({success:true,is_owner:owner,is_unlocked:unlocked,media_gallery:[{url:'storage://emo-test/file',type:'video'}]});
  if(url.includes('/rpc/reserve_video_labels'))return reserveError?Response.json({message:'quota unavailable'}, {status:503}):Response.json(cached?{cached:true,labels:['Biển'],approved:true,violations:[]}:{cached:false,request_id:'lease-id'});
  if(url.includes('/storage/v1/object/info/'))return Response.json({content_type:'video/mp4',size:small.size});
  if(url.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/emoria-memory/emo-test/file?token=fixture'});
  if(url.includes('/storage/v1/object/'))assert.fail('Video must not be downloaded through the web server');
  if(url.includes('/memory_video_labels')){
    if(options.method==='PATCH'){storedLabels=JSON.parse(options.body);return Response.json([{path:'emo-test/file'}]);}
    return Response.json([{path:'emo-test/file',labels:['Biển']}]);
  }
  throw new Error('Unexpected test URL '+url);
};
async function call(action,body={},token='owner'){
  const req=Readable.from([]);Object.assign(req,{url:'/api/v1/memories/emo-test/video-labels/'+action,method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body});
  let response;await handler(req,{setHeader(){},end(data){response={status:this.statusCode,data:JSON.parse(data)};}});return response;
}
try{
  const body={path:'emo-test/file',consent:true};
  assert.equal((await call('analyze',body,null)).status,401);
  assert.equal((await call('analyze',{...body,consent:false})).status,400);
  assert.equal((await call('analyze',{...body,path:'other/file'})).status,422);
  owner=false;assert.equal((await call('analyze',body)).status,403);assert.equal(modelCalls,0);
  unlocked=false;dbCalls=[];assert.equal((await call('read',{},null)).status,401);assert.ok(!dbCalls.some(url=>url.includes('/memory_video_labels')));
  unlocked=true;assert.equal((await call('read',{grant:'fixture'})).status,403);
  owner=true;assert.equal((await call('read',{})).status,403,'Owners do not see topic labels');
  isAdmin=true;assert.deepEqual((await call('read',{})).data.labels,{'emo-test/file':['Biển']});isAdmin=false;
  owner=true;const fresh=await call('analyze',body);assert.equal(fresh.status,200);assert.deepEqual(fresh.data,{approved:true,reason:null});assert.equal(modelCalls,1);assert.equal(storedLabels.status,'ready');assert.deepEqual(storedLabels.labels,['Biển','Du lịch']);
  cached=true;const cacheResult=await call('analyze',{...body,include_labels:true});assert.equal(cacheResult.status,200);assert.deepEqual(cacheResult.data,{approved:true,reason:null});assert.equal(modelCalls,1);
  reserveError=true;cached=false;const failed=await call('analyze',body);assert.ok(failed.status>=400);assert.equal(modelCalls,1,'Failed reservation must never bypass quota to call Google');
  reserveError=false;malformedQwen=true;
  assert.equal((await call('analyze',body)).status,502);
  assert.equal(storedLabels.status,'failed','Malformed Qwen output must never mark a video ready');
}finally{globalThis.fetch=originalFetch;}
console.log('PASS video/NFC: owner-only consent, private labels, model response validation, cache, Google cleanup, safe NFC URL parsing and open-domain label normalization. Hardware and live Gemini are separate checks.');
