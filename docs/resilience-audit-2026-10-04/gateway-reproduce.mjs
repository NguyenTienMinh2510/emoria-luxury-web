// Offline audit: actual application functions; synthetic HTTP and tiny media only.
// Run from repository root: node docs/resilience-audit-2026-10-04/gateway-reproduce.mjs
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {SupabaseClient} from '@supabase/supabase-js';
import {moderateHousePhotos} from '../../server/houseModeration.js';
import {streamMatch} from '../../server/eventGateway.js';
import {signPublishedHousePaths} from '../../server/eventMedia.js';

const environment = {
  SUPABASE_URL:'https://offline-audit.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'offline-service-key',
  MODAL_PROXY_TOKEN_ID:'wk-offline-audit',MODAL_PROXY_TOKEN_SECRET:'ws-offline-audit',
  NODE_ENV:'audit',SKIP_AI_MODERATION:'false'
};
const previousEnvironment = Object.fromEntries(Object.keys(environment).map(key => [key,process.env[key]]));
Object.assign(process.env,environment);
const originalFetch=globalThis.fetch;
const originalChannel=SupabaseClient.prototype.channel;
const originalRemoveChannel=SupabaseClient.prototype.removeChannel;
let mode='race',release;
const barrier=new Promise(resolve=>{release=resolve;});
const fresh=()=>({downloads:0,ai:0,limits:0,active:0,maxActive:0,info:0,signBatches:0,reviewReads:0});
let counts=fresh();
const photoPaths=Array.from({length:50},(_,i)=>`audit-tag/image-${i}.jpg`);
globalThis.fetch=async(input,options={})=>{
  const url=new URL(String(input));
  if(url.hostname==='offline-audit.supabase.co'){
    if(url.pathname==='/rest/v1/rpc/rpc_house_photo_review_namespace')return Response.json(true);
    if(url.pathname.includes('/storage/v1/object/info/')){
      counts.info++;
      return Response.json({content_type:'image/jpeg',size:8,version:'v1',lastModified:'2026-10-04T00:00:00Z'});
    }
    if(url.pathname==='/rest/v1/house_photo_reviews'){
      if(options.method==='POST')return Response.json({});
      counts.reviewReads++;
      return Response.json(mode==='sign-fanout'?photoPaths.map(path=>({path,status:'ready',violations:[],content_version:'v1'})):null);
    }
    if(url.pathname==='/storage/v1/object/sign/emoria-event-media'){
      counts.signBatches++;
      return Response.json(JSON.parse(options.body).paths.map(path=>({path,signedURL:'/object/sign/emoria-event-media/'+path+'?token=offline'})));
    }
    if(url.pathname.includes('/storage/v1/object/')){
      counts.downloads++;
      return new Response('fixture',{headers:{'Content-Type':'image/jpeg'}});
    }
    if(url.pathname==='/rest/v1/rpc/rpc_check_rate_limit'){
      counts.limits++;
      return Response.json({allowed:mode==='race'||mode==='many'&&counts.limits<=40||mode==='sse'&&counts.limits<=60,retry_after:3600});
    }
    if(url.pathname==='/rest/v1/rpc/rpc_event_dispatch'&&mode==='sse')return Response.json({role:'partner',total_questions:7});
  }else if(url.hostname.endsWith('.modal.run')){
    counts.ai++;counts.active++;counts.maxActive=Math.max(counts.maxActive,counts.active);
    if(mode==='race'){if(counts.ai===2)release();await barrier;}
    counts.active--;
    return Response.json({success:true,approved:true,labels:['Gia đình'],violations:[]});
  }
  throw Error('Blocked unknown fixture request '+url.hostname+url.pathname);
};
const context={user:{id:'audit-owner'},db:async query=>{const result=await query;if(result.error)throw result.error;return result.data;}};
const draft={rooms:[{memories:[{photo_path:'audit-tag/image.jpg'}]}]};
const print=(scenario,extra={})=>console.log(JSON.stringify({scenario,...counts,...extra}));
const responses=[];
try{
  await Promise.all([moderateHousePhotos(context,'audit-tag',draft),moderateHousePhotos(context,'audit-tag',draft)]);
  assert.equal(counts.ai,2);assert.equal(counts.maxActive,2);
  print('Same path reviewed twice concurrently');

  mode='denied';counts=fresh();
  await assert.rejects(moderateHousePhotos(context,'audit-tag',draft),error=>error.status===429);
  assert.equal(counts.downloads,1);assert.equal(counts.ai,0);
  print('Quota exhausted: download occurs before rejection');

  mode='many';counts=fresh();
  const rooms=['beginning','first','little-things','memories','next-chapter'].map((id,r)=>({
    id,...(r===0?{share_preview_path:'audit-tag/preview.jpg'}:{}),
    memories:Array.from({length:10},(_,i)=>({id:String(i),photo_path:`audit-tag/${r}-${i}.jpg`}))
  }));
  await assert.rejects(moderateHousePhotos(context,'audit-tag',{rooms}),error=>error.status===429);
  assert.equal(counts.ai,40);assert.equal(counts.downloads,41);
  print('51 new photos: one publish reaches hourly quota before completion');

  mode='sign-fanout';counts=fresh();
  const view={published_at:'2026-10-04T01:00:00Z',rooms:[{memories:photoPaths.map(photo_path=>({photo_path}))}]};
  const signed=await signPublishedHousePaths(photoPaths,view,{tagUid:'audit-tag'});
  assert.equal(Object.keys(signed).length,50);assert.equal(counts.info,50);
  print('Published photo signing fans out to 50 object metadata requests',{signedPaths:Object.keys(signed).length});

  mode='sse';counts=fresh();
  let channels=0,removed=0,ready;
  const subscribed=new Promise(resolve=>{ready=resolve;});
  SupabaseClient.prototype.channel=function(){
    channels++;
    return {on(){return this;},subscribe(){if(channels===60)ready();return this;}};
  };
  SupabaseClient.prototype.removeChannel=async()=>{removed++;};
  const streamContext=()=>{
    const res=new EventEmitter();Object.assign(res,{setHeader(){},flushHeaders(){},write(){},end(){}});responses.push(res);
    return {db:context.db,params:['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],body:{invite_token:'valid-offline-invite'},ip:'192.0.2.1',res};
  };
  const pending=Array.from({length:60},()=>streamMatch(streamContext()));
  await subscribed;
  assert.equal(channels,60);
  await assert.rejects(streamMatch(streamContext()),error=>error.status===429);
  responses.forEach(res=>res.emit('close'));
  await Promise.all(pending);assert.equal(removed,60);
  print('Per-minute limiter permits 60 simultaneous channels for same invite/IP',{channels,removed});
}finally{
  responses.forEach(res=>res.emit('close'));
  globalThis.fetch=originalFetch;
  SupabaseClient.prototype.channel=originalChannel;
  SupabaseClient.prototype.removeChannel=originalRemoveChannel;
  for(const [key,value]of Object.entries(previousEnvironment)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
