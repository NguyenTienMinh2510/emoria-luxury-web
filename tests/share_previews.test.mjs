import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createShareUrl,isShareRoute} from '../src/services/shareLinks.js';
import {getShareMetadata,injectShareMetadata,createShareHandler} from '../api/share.js';
import {validateHousePreview,attachHousePreview,approvedHousePhotoPaths} from '../server/housePreview.js';
import {enrichHouseRoomsWithSignedUrls,signPublishedHousePaths} from '../server/eventMedia.js';
import {captureHouseShareFile} from '../src/services/houseSharePreview.js';
import {moderateHousePhotos} from '../server/houseModeration.js';

const origin='https://emoria.test', query=value=>new URLSearchParams(value);
// Root is a real index.html route on Vercel: filesystem precedence bypasses
// rewrites, so legacy NFC/content URLs must redirect before that lookup.
const routing=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url)));
assert.deepEqual(routing.redirects.map(rule=>rule.has[0].key),['view','share','match','invite','article','tag','memory','chip','policy','privacy']);
assert.ok(routing.redirects.every(rule=>rule.source==='/'&&rule.destination==='/share'&&rule.permanent===false&&rule.has[0].type==='query'));
assert.ok(!routing.rewrites.some(rule=>rule.source==='/'));
const match='12345678-1234-1234-1234-123456789abc',invite='a-safe-invitation-token';
const share=createShareUrl({view:'memory-match',match,invite,token:'PRIVATE-GRANT',pin:'1234',unrelated:'drop'},origin);
assert.equal(new URL(share).pathname,'/share');
assert.ok(!share.includes('PRIVATE')&&!share.includes('pin=')&&!share.includes('unrelated='));
assert.equal(new URL(share).searchParams.get('invite'),invite);
assert.ok(isShareRoute(query('article=anniversary'))&&isShareRoute(query('privacy=true')));
assert.ok(isShareRoute(query('share=house-link'))&&isShareRoute(query({match,invite})));
assert.equal(isShareRoute(query('view=shop')),false);
const house={title:'Kỷ niệm 5 năm “An & Bình”',published_at:'2026-10-02T10:01:00Z',rooms:[{note:'Ngày cưới của chúng mình',share_preview_path:'emo-home/overview.jpg'}],preview_image:'https://storage.test/house.jpg'};
let seen;
const meta=await getShareMetadata(query('view=memory-house&share=house-link'),origin,async path=>{seen=path;return house;});
assert.equal(seen,'/events/houses/share/house-link');
assert.ok(meta.title.includes('5 năm')&&meta.description.includes('Ngày cưới')&&meta.description.includes('3D'));
assert.equal(meta.image,house.preview_image);
const legacy=await getShareMetadata(query('view=memory-house&share=old-link'),origin,async()=>({...house,preview_image:null}));
assert.ok(legacy.imageAlt.includes('Ảnh minh họa'));
assert.ok((await getShareMetadata(query('share=old-link'),origin,async()=>house)).title.includes('5 năm'),'Legacy share-only links keep their house context');
const game=await getShareMetadata(query({view:'memory-match',match,invite}),origin,async()=>({title:'Sinh nhật của Lan',status:'active',owner_name:'Nam',partner_name:'Lan',total_questions:7,questions:[{image_url:'https://storage.test/game.jpg'}]}));
assert.ok(game.title.includes('Sinh nhật')&&game.description.includes('Nam và Lan')&&game.description.includes('7 câu hỏi'));
assert.equal(game.image,'https://storage.test/game.jpg');
const article=await getShareMetadata(query('article=anniversary'),origin,async()=>({article:{title:'Nhẫn kỷ niệm',excerpt:'Câu chuyện ngày cưới',cover_image:'https://images.test/article.jpg'}}));
assert.equal(article.type,'article');assert.equal(article.image,'https://images.test/article.jpg');
const protectedMemory=await getShareMetadata(query('tag=emo-home&token=PRIVATE-GRANT'),origin,async(path,method,body)=>{
  assert.equal(method,'POST');assert.deepEqual(body,{grant:null});
  return {title:'Món quà của An',is_protected:true,is_unlocked:false,quote:'PRIVATE QUOTE',letter:'PRIVATE LETTER',media_gallery:[{type:'image',url:'https://storage.test/private.jpg'}]};
});
assert.ok(protectedMemory.description.includes('riêng tư'));
assert.ok(!JSON.stringify(protectedMemory).includes('PRIVATE')&&!JSON.stringify(protectedMemory).includes('private.jpg'));
const publicMemory=await getShareMetadata(query('tag=emo-home'),origin,async()=>({title:'Ngày cưới',is_protected:false,is_unlocked:true,quote:'10 năm bên nhau',media_gallery:[{type:'image',url:'storage://emo-home/public.jpg'}],media_signing:{urls:{'emo-home/public.jpg':'https://storage.test/approved.jpg'}}}));
assert.equal(publicMemory.image,'https://storage.test/approved.jpg');
const unavailable=await getShareMetadata(query('view=memory-house&share=revoked'),origin,async()=>{throw Error('PRIVATE ERROR');});
assert.ok(unavailable.description.includes('không còn')&&!JSON.stringify(unavailable).includes('PRIVATE ERROR'));
const template=await readFile(new URL('../index.html',import.meta.url),'utf8');
const html=injectShareMetadata(template,{...meta,title:'An " /><script>alert(1)</script>',description:'A&B <image>'});
assert.ok(html.includes('og:title')&&html.includes('twitter:card')&&html.includes('preview=image'));
assert.ok(!html.includes('<script>alert(1)</script>'));
assert.equal((html.match(/name="description"/g)||[]).length,1);
assert.ok(html.includes('/src/main.jsx'),'Share HTML must keep the real application entry');
await assert.rejects(captureHouseShareFile(null),/toàn cảnh/);
const oldImage=globalThis.Image,oldDocument=globalThis.document;
let outputSize,drawn;
try{
  globalThis.Image=class{width=600;height=400;decode(){return Promise.resolve();}};
  globalThis.document={createElement(){return {getContext(){return {fillRect(){},drawImage(...args){drawn=args.slice(1);}};},toBlob(done,type){outputSize=[this.width,this.height];done(new Blob(['overview'],{type}));}};}};
  const file=await captureHouseShareFile(async options=>{assert.equal(options.overview,true);return 'data:image/png;base64,fixture';});
  assert.equal(file.type,'image/jpeg');assert.equal(file.name,'house-overview.jpg');
  assert.deepEqual(outputSize,[1200,630]);assert.deepEqual(drawn,[127.5,0,945,630]);
}finally{globalThis.Image=oldImage;globalThis.document=oldDocument;}

let infos=0;
const storage={storage:{from(){return {async info(){infos++;return {data:{contentType:'image/jpeg',size:120000}};}};}}};
assert.equal(await validateHousePreview(house.rooms,'emo-home',storage),'emo-home/overview.jpg');
await assert.rejects(validateHousePreview(house.rooms,'other-tag',storage),/đúng ngôi nhà/);
assert.equal(infos,1,'Cross-tag paths must fail before Storage is queried');
await assert.rejects(validateHousePreview([{share_preview_path:'emo-home/../other.jpg'}],'emo-home',storage),/đúng ngôi nhà/);
await assert.rejects(validateHousePreview([...house.rooms,...house.rooms],'emo-home',storage),/một ảnh/);
await assert.rejects(validateHousePreview(house.rooms,'emo-home',{storage:{from(){return {info:async()=>({data:{contentType:'application/pdf',size:10}})};}}}),/2 MB/);
assert.ok(!JSON.stringify(enrichHouseRoomsWithSignedUrls(house.rooms)).includes('overview.jpg'),'Public rooms must strip raw preview paths');

const oldFetch=globalThis.fetch,oldEnv={...process.env};
process.env.SUPABASE_URL='https://share-fixture.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='fixture-public-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service-key';
process.env.MODAL_PROXY_TOKEN_ID='wk-offline-fixture';
process.env.MODAL_PROXY_TOKEN_SECRET='ws-offline-fixture';
process.env.NODE_ENV='test';
let denied=false,ready=true,calls=[],currentVersion='version-one',approvedVersion='version-one',lastModified='2026-10-02T10:00:00Z',reviews=0,changedDuringReview=false,writes=[],quotaAllowed=true,quotaError=false,uniqueBucket=true;
globalThis.fetch=async(input,init={})=>{
  const url=String(input),body=init.body?JSON.parse(init.body):null;
  calls.push({url,body,headers:new Headers(init.headers)});
  if(url.includes('/auth/v1/user'))throw Error('Share preview must not use a caller session');
  if(url.includes('/rpc/rpc_house_photo_review_namespace'))return Response.json(uniqueBucket);
  if(url.includes('/rpc/rpc_house_approved_paths'))return Response.json(ready&&approvedVersion===currentVersion&&approvedVersion&&Number.isFinite(Date.parse(lastModified))&&Date.parse(lastModified)<=Date.parse(body.p_published_at)?body.p_paths.filter(path=>path.startsWith(body.p_tag+'/')):[]);
  if(url.includes('/rpc/rpc_check_rate_limit'))return quotaError?Response.json({message:'offline quota failure'},{status:503}):Response.json({allowed:quotaAllowed,retry_after:120});
  if(url.includes('/rpc/rpc_event_dispatch')){
    assert.equal(body.p_caller,null);
    if(denied)return Response.json({code:'42501',message:'Revoked or unpublished'},{status:403});
    return Response.json({...house,preview_image:undefined,rooms:house.rooms.map(room=>({...room,memories:[]}))});
  }
  if(url.includes('/rest/v1/memory_houses'))return Response.json({memory_spaces:{tag_uid:'emo-home'}});
  if(url.includes('/rest/v1/memory_video_labels'))throw Error('House approvals must never consult or mutate Memory review state');
  if(url.includes('/rest/v1/house_photo_reviews')){
    if(init.method==='POST'){writes.push(body);approvedVersion=body.content_version;return Response.json([]);}
    if(new URL(url).searchParams.get('path')?.startsWith('in.'))return Response.json(ready?[{path:'emo-home/room.jpg',status:'ready',violations:[],content_version:approvedVersion}]:[]);
    return Response.json(ready?{status:'ready',violations:[],content_version:approvedVersion}:null);
  }
  if(url.includes('/storage/v1/object/info/'))return Response.json({version:currentVersion,last_modified:lastModified,metadata:{mimetype:'image/jpeg',size:120000}});
  if(url.includes('/storage/v1/object/sign/'))return Response.json((body.paths||['emo-home/overview.jpg']).map(path=>({path,signedURL:`/object/sign/emoria-event-media/${path}?token=temporary`})));
  if(url.includes('/storage/v1/object/emoria-event-media/'))return new Response('overview bytes',{headers:{'Content-Type':'image/jpeg'}});
  if(url.includes('.modal.run')){reviews++;if(changedDuringReview)currentVersion='changed-during-review';return Response.json({success:true,approved:true,labels:[],violations:[]});}
  throw Error(`Unexpected request ${url}`);
};
async function request(url,method='GET',handler=createShareHandler(()=>template)){
  let result;const headers={};
  await handler({url,method,headers:{host:'emoria.test',authorization:'Bearer CUSTOMER-SESSION',cookie:'private=yes'}},{setHeader(key,value){headers[key]=value;},end(body){result={body,status:this.statusCode,headers};}});
  return result;
}
try{
  let response=await request('/share?view=memory-house&share=house-link');
  assert.equal(response.status,200);assert.ok(response.body.includes('Kỷ niệm 5 năm'));
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(response.headers['Referrer-Policy'],'no-referrer');
  assert.ok(calls.every(call=>!call.headers.get('authorization')?.includes('CUSTOMER')));
  response=await request('/share?view=memory-house&share=house-link&preview=image');
  assert.equal(response.status,302);assert.ok(response.headers.Location.includes('overview.jpg'));
  assert.ok(calls.some(call=>call.url.includes('/object/sign/')&&call.body.expiresIn===120));
  currentVersion='version-two';calls=[];
  response=await request('/share?view=memory-house&share=house-link&preview=image');
  assert.ok(response.headers.Location.includes('house-preview.png'),'Replacing approved bytes cannot reuse the old approval');
  assert.ok(!calls.some(call=>call.url.includes('/object/sign/')),'A version mismatch must not issue a signed URL');
  approvedVersion=currentVersion;lastModified='2026-10-02T10:02:00Z';calls=[];
  response=await request('/share?view=memory-house&share=house-link&preview=image');
  assert.ok(response.headers.Location.includes('house-preview.png'),'An approval newer than the snapshot cannot change its frozen image');
  assert.ok(!calls.some(call=>call.url.includes('/object/sign/')));
  lastModified='2026-10-02T10:00:00Z';approvedVersion=null;
  response=await request('/share?view=memory-house&share=house-link&preview=image');
  assert.ok(response.headers.Location.includes('house-preview.png'),'Legacy path-only approvals require a new review');
  approvedVersion=currentVersion;lastModified=undefined;
  response=await request('/share?view=memory-house&share=house-link&preview=image');
  assert.ok(response.headers.Location.includes('house-preview.png'),'Missing Storage modification timestamps must fail closed');
  lastModified='2026-10-02T10:00:00Z';
  ready=false;response=await request('/share?view=memory-house&share=house-link&preview=image');
  assert.ok(response.headers.Location.includes('house-preview.png'),'Unapproved screenshot must use illustration');
  ready=true;denied=true;calls=[];
  const oldError=console.error;console.error=()=>{};
  try{response=await request('/share?view=memory-house&share=revoked&preview=image');}finally{console.error=oldError;}
  assert.equal(response.status,302);assert.ok(response.headers.Location.endsWith('/share/memory.png'));
  assert.ok(!calls.some(call=>call.url.includes('/object/sign/')),'Revoked/unpublished houses must never sign a preview');
  assert.equal((await request('/share?policy=privacy','POST')).status,405);
  assert.equal((await request('/share?policy=privacy','HEAD')).body,undefined);
  assert.equal((await request('/share?policy=privacy','GET',createShareHandler(()=>{throw Error('missing build');}))).status,503);
  for(const image of ['memory','mismatch','privacy'])await readFile(new URL(`../public/share/${image}.png`,import.meta.url));
  const deniedPreview=await attachHousePreview({...house,preview_image:undefined},{tagUid:'other-tag'},storage);
  assert.equal(deniedPreview.preview_image,undefined);
  const roomPath='emo-home/room.jpg',roomHouse={...house,rooms:[{memories:[{photo_path:roomPath},{photo_path:'foreign-tag/private.jpg'}]}]};
  denied=false;ready=true;approvedVersion=currentVersion;
  assert.deepEqual(await approvedHousePhotoPaths([roomPath,'foreign-tag/private.jpg','emo-home/not-in-snapshot.jpg'],roomHouse,{tagUid:'emo-home'}),[roomPath]);
  const roomSigned=await signPublishedHousePaths([roomPath],roomHouse,{tagUid:'emo-home'});
  assert.ok(roomSigned[roomPath]&&Object.keys(roomSigned).length===1,'Only reviewed paths in the frozen room snapshot are signed');
  currentVersion='room-replacement';calls=[];
  assert.deepEqual(await signPublishedHousePaths([roomPath],roomHouse,{tagUid:'emo-home'}),{});
  assert.ok(!calls.some(call=>call.url.includes('/object/sign/')),'A replaced room photo must not be signed');
  approvedVersion=currentVersion;lastModified='2026-10-02T10:02:00Z';
  assert.deepEqual(await approvedHousePhotoPaths([roomPath],roomHouse,{tagUid:'emo-home'}),[],'A later approved room photo does not change a published snapshot');
  lastModified='2026-10-02T10:00:00Z';ready=false;
  assert.deepEqual(await approvedHousePhotoPaths([roomPath],roomHouse,{tagUid:'emo-home'}),[],'Unapproved room photo fails closed');
  process.env.NODE_ENV='production';delete process.env.SKIP_AI_MODERATION;
  const context={user:{id:'fixture-owner'}},draft={rooms:house.rooms};
  calls=[];
  await assert.rejects(moderateHousePhotos(context,'emo-home',draft),error=>error.status===503);
  assert.equal(calls.length,0,'Production cannot use synchronous or local-bypass moderation');
  process.env.NODE_ENV='test';ready=true;
  await moderateHousePhotos(context,'emo-home',draft);
  assert.equal(writes.at(-1).content_version,currentVersion,'The isolated test bypass still binds the real Storage version');
  uniqueBucket=false;
  await assert.rejects(moderateHousePhotos(context,'emo-home',draft),error=>error.status===422);
  console.log('PASS sharing: content/event metadata, escaped HTML, public-only media, bounded uploads, no grants/sessions, revocation, frozen version approvals, batch checks and production queue boundary.');
}finally{
  globalThis.fetch=oldFetch;
  for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];
  Object.assign(process.env,oldEnv);
}
