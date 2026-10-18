import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/v1.js';

Object.assign(process.env,{SUPABASE_URL:'https://fixture-guest-house.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',NODE_ENV:'test'});
const originalFetch=globalThis.fetch,originalError=console.error;
const users={anon:{id:'00000000-0000-4000-8000-000000000001',is_anonymous:true},member:{id:'00000000-0000-4000-8000-000000000002',is_anonymous:false},admin:{id:'00000000-0000-4000-8000-000000000003',is_anonymous:false}};
const tag='guest-0123456789abcdef01234567';
let enabled=false,limit={allowed:true},rpcError=null,storageFailure=false,cleanup=[],calls=[];
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,options={})=>{
  const url=new URL(String(input)),headers=new Headers(options.headers),token=headers.get('authorization')?.replace('Bearer ','');
  const body=options.body?JSON.parse(options.body):{};
  calls.push({path:url.pathname,body,token});
  if(url.pathname==='/auth/v1/user')return response(users[token]);
  const name=url.pathname.split('/').pop();
  if(name==='is_admin')return response(token==='admin');
  if(name==='rpc_guest_house_status')return response({enabled});
  if(name==='rpc_check_rate_limit'){
    assert.equal(token,'fixture-service','Only the service role checks quota');
    return response(limit);
  }
  if(name==='rpc_guest_house_open'){
    assert.equal(token,'anon','Open retains the caller JWT');
    return rpcError?response(rpcError,403):response({tag_uid:tag});
  }
  if(name==='rpc_guest_house_set_enabled'){
    assert.equal(token,'fixture-service');
    enabled=body.p_enabled;
    return response({enabled,cleanup});
  }
  if(url.pathname==='/storage/v1/object/emoria-event-media'){
    assert.equal(token,'fixture-service');
    assert.ok(body.prefixes.every(path=>path.startsWith(tag+'/')),'Delete only the doomed tag prefix');
    assert.ok(body.prefixes.length<=100);
    return storageFailure?response({message:'Storage unavailable'},503):response(body.prefixes.map(name=>({name})));
  }
  if(name==='rpc_guest_house_finish_cleanup'){
    assert.equal(token,'fixture-service');
    cleanup=cleanup.filter(guest=>guest.user_id!==body.p_user);
    return response({success:true});
  }
  if(name==='rpc_event_dispatch')return rpcError?response(rpcError,403):response({success:true});
  if(name==='rpc_reserve_storage_upload')return response({success:true});
  throw new Error(`Unexpected fixture request: ${url.pathname}`);
};
async function api(method,path,body={},token){
  const req=Readable.from([]);
  Object.assign(req,{method,url:'/api/v1'+path,body,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},socket:{remoteAddress:'127.0.0.1'}});
  let result;const headers={};
  await handler(req,{setHeader(k,v){headers[k]=v;},end(raw){result={status:this.statusCode,body:JSON.parse(raw),headers};}});
  return result;
}
async function denied(method,path,token,code,body={}){
  const start=calls.length,result=await api(method,path,body,token);
  assert.equal(result.status,403,`${method} ${path}: ${JSON.stringify(result.body)}`);
  assert.equal(result.body.error.code,code);
  assert.ok(!calls.slice(start).some(c=>['rpc_event_dispatch','rpc_reserve_storage_upload'].some(name=>c.path.endsWith(name))),'Reject before any mutation or publication work');
}
try{
  assert.deepEqual((await api('GET','/events/guest-house/status')).body,{enabled:false});
  assert.equal((await api('POST','/events/guest-house/open')).status,401);
  await denied('POST','/events/guest-house/open','anon','GUEST_EVENT_CLOSED');
  assert.equal((await api('PATCH','/admin/system/guest-house',{enabled:true},'anon')).status,403);
  assert.equal((await api('PATCH','/admin/system/guest-house',{enabled:'true'},'admin')).status,400);
  assert.deepEqual((await api('PATCH','/admin/system/guest-house',{enabled:true},'admin')).body,{enabled:true});
  assert.deepEqual((await api('GET','/events/guest-house/status')).body,{enabled:true});
  assert.deepEqual((await api('POST','/events/guest-house/open',{},'anon')).body,{tag_uid:tag});
  const admission=calls.find(c=>c.path.endsWith('rpc_check_rate_limit'));
  assert.deepEqual(admission.body,{p_key:`guest_house_open:${users.anon.id}`,p_max_burst:3,p_window_seconds:60});
  limit={allowed:false,retry_after:42};
  let result=await api('POST','/events/guest-house/open',{},'anon');
  assert.equal(result.status,429);assert.equal(result.headers['Retry-After'],'42');
  limit=null;assert.equal((await api('POST','/events/guest-house/open',{},'anon')).status,503);limit={allowed:true};
  for(const action of ['publish','unpublish','revoke','jobs/job-id/run']){
    await denied('POST',`/memories/${tag}/house/${action}`,'anon','GUEST_LOGIN_REQUIRED');
  }
  await denied('POST','/memories/paid-tag/house/publish','anon','GUEST_LOGIN_REQUIRED');
  assert.equal((await api('POST',`/memories/${tag}/house/unpublish`,{},'member')).status,200);
  assert.equal((await api('POST',`/memories/${tag}/house/restore-layout`,{expected_revision:0},'anon')).status,200);
  assert.equal((await api('PUT',`/memories/${tag}/house/draft`,{title:'Guest draft',expected_revision:0},'anon')).status,200);
  assert.equal((await api('POST','/storage/uploads/reserve',{bucket:'emoria-event-media',path:`${tag}/photo.png`,bytes:10,mime:'image/png'},'anon')).status,201);
  enabled=false;
  for(const token of ['anon','member']){
    for(const [method,action] of [['PUT','draft'],['POST','draft'],['POST','publish'],['POST','unpublish'],['POST','revoke'],['POST','restore-layout'],['POST','jobs/job-id/run']]){
      await denied(method,`/memories/${tag}/house/${action}`,token,'GUEST_EVENT_CLOSED');
    }
    await denied('POST','/storage/uploads/reserve',token,'GUEST_EVENT_CLOSED',{bucket:'emoria-event-media',path:`${tag}/nested/photo.png`});
  }
  await denied('POST',`/memories/${tag.toUpperCase()}/house/revoke`,'member','GUEST_EVENT_CLOSED');
  assert.equal((await api('GET',`/memories/${tag}/house/draft`,{},'member')).status,200,'Closure preserves draft reads');
  assert.equal((await api('POST','/memories/paid-tag/house/unpublish',{},'member')).status,200);
  assert.equal((await api('POST','/storage/uploads/reserve',{bucket:'emoria-event-media',path:'paid-tag/photo.png'},'member')).status,201);
  enabled=true;rpcError={code:'42501',message:'GUEST_EVENT_CLOSED'};console.error=()=>{};
  result=await api('POST','/events/guest-house/open',{},'anon');
  assert.equal(result.status,403);assert.equal(result.body.error.code,'GUEST_EVENT_CLOSED','Closure racing open preserves the public error code');
  result=await api('POST',`/memories/${tag}/house/unpublish`,{},'member');
  assert.equal(result.body.error.code,'GUEST_EVENT_CLOSED','Closure racing dispatch preserves the public error code');
  rpcError=null;console.error=originalError;
  cleanup=[{user_id:users.anon.id,paths:Array.from({length:205},(_,i)=>`${tag}/nested/${i}.png`)}];
  storageFailure=true;
  const start=calls.length;
  console.error=()=>{};
  assert.equal((await api('PATCH','/admin/system/guest-house',{enabled:false},'admin')).status,503);
  console.error=originalError;
  assert.equal(enabled,false,'A storage failure keeps the event closed');
  assert.ok(!calls.slice(start).some(c=>c.path.endsWith('rpc_guest_house_finish_cleanup')),'Keep the identity and retry marker until storage succeeds');
  storageFailure=false;calls=[];
  result=await api('PATCH','/admin/system/guest-house',{enabled:false},'admin');
  assert.equal(result.status,200);assert.deepEqual(result.body,{enabled:false});
  assert.deepEqual(calls.filter(c=>c.path.startsWith('/storage/')).map(c=>c.body.prefixes.length),[100,100,5]);
  assert.equal(calls.at(-1).path,'/rest/v1/rpc/rpc_guest_house_finish_cleanup');
  assert.equal(cleanup.length,0);
  console.log('[PASS] Guest-house HTTP contracts, access controls, all write guards, quota failures, cleanup batching/retry and race error codes.');
}finally{globalThis.fetch=originalFetch;console.error=originalError;}
