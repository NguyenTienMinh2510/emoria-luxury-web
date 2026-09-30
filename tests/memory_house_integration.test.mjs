import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createClient} from '@supabase/supabase-js';
import {serializeHouseRooms} from '../src/services/house3d.js';

const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:55321','Only isolated local Supabase is allowed');
const accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
Object.assign(process.env,{SUPABASE_URL:config.API_URL,SUPABASE_PUBLISHABLE_KEY:config.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY});
const {default:handler}=await import('../api/v1.js');
const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/api/v1`;
const client=key=>createClient(config.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(15000)})}});
const root=client(config.SERVICE_ROLE_KEY),owner=client(config.ANON_KEY),other=client(config.ANON_KEY),admin=client(config.ANON_KEY);
const ok=async promise=>{const r=await promise;assert.ifError(r.error);return r.data;};
const tag=`test-house-${crypto.randomUUID()}`,path=`${tag}/photo.png`;
let token,otherToken,created=false,uploaded=false,revision=0;
async function api(method,route,body,auth=token,expected=200){
  const payload=method==='PUT'&&route.endsWith('/draft')?{expected_revision:revision,...body}:body;
  const response=await fetch(base+route,{method,headers:{...(auth?{Authorization:`Bearer ${auth}`} :{}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();assert.equal(response.status,expected,`${method} ${route}: ${JSON.stringify(result)}`);
  if(response.ok&&Number.isSafeInteger(result.draft_revision))revision=result.draft_revision;
  return result;
}
try{
  token=(await ok(owner.auth.signInWithPassword({email:'owner@emoria.test',password:accounts.password}))).session.access_token;
  otherToken=(await ok(other.auth.signInWithPassword({email:'viewer@emoria.test',password:accounts.password}))).session.access_token;
  const user=(await ok(owner.auth.getUser())).user;
  await ok(root.from('memory_spaces').insert({tag_uid:tag,jewelry_name:'Local test',title:'House integration',owner_id:user.id,availability_status:'available'}));created=true;
  const image=fs.readFileSync('public/memoryhouse/models/thumbnails/cat.png');
  assert.ok((await other.storage.from('emoria-event-media').upload(path,image,{contentType:'image/png'})).error,'Non-owner upload denied');
  await ok(owner.storage.from('emoria-event-media').upload(path,image,{contentType:'image/png'}));uploaded=true;
  assert.ok((await other.storage.from('emoria-event-media').download(path)).error,'Private object cannot be downloaded by non-owner');
  const route=`/memories/${tag}/house`;
  const rooms=[{id:'beginning',name:'Our room',note:'Only a local fixture',lighting:'sunset',memories:[{id:'one',photo_path:path,caption:'Test image'}],decorations:[{slot:'table',item:'frame',rotation:0,photos:['one']},{slot:'left',item:'nameplate',rotation:0,text:'Minh & An ♥'}]}];
  await api('GET',route+'/draft',null,null,401);
  await api('GET',route+'/draft',null,otherToken,403);
  await api('PUT',route+'/draft',{title:'Our house',theme:'rose_romance',rooms,expected_revision:0});
  const draft=await api('GET',route+'/draft');
  await api('PUT',route+'/draft',{expected_revision:1.5},token,422);
  assert.equal(draft.rooms[0].memories[0].photo_path,path);
  const signed=draft.rooms[0].memories[0].photo_url;assert.ok(signed);
  const imageResponse=await fetch(signed,{signal:AbortSignal.timeout(10000)});assert.equal(imageResponse.status,200);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),image,'Signed image contains the uploaded bytes');
  await api('PUT',route+'/draft',{title:draft.title,theme:draft.theme,rooms:serializeHouseRooms(draft.rooms)});
  await api('PUT',route+'/draft',{title:'Stale overwrite',rooms,expected_revision:0},token,409);
  assert.equal((await api('GET',route+'/draft')).rooms[0].memories[0].photo_path,path);
  const published=await api('POST',route+'/publish',{});assert.ok(published.share_id);
  const publicRoute=`/events/houses/share/${published.share_id}`;
  const publicHouse=await api('GET',publicRoute,null,null);
  assert.deepEqual(publicHouse.rooms[0].decorations,serializeHouseRooms(rooms)[0].decorations);
  assert.equal(publicHouse.rooms[0].memories[0].photo_path,undefined);
  assert.equal((await fetch(publicHouse.rooms[0].memories[0].photo_url)).status,200);
  const edited=structuredClone(rooms);edited[0].decorations[1].text='Private edit';
  await api('PUT',route+'/draft',{rooms:edited});
  assert.equal((await api('GET',publicRoute,null,null)).rooms[0].decorations.find(d=>d.item==='nameplate').text,'Minh & An ♥');
  edited[0].decorations[0].photos=['foreign-photo'];
  await api('PUT',route+'/draft',{rooms:edited},token,422);
  await api('POST',route+'/unpublish',{});
  await api('GET',publicRoute,null,null,403);
  await api('POST',route+'/publish',{});
  await api('POST',route+'/revoke',{});
  await api('GET',publicRoute,null,null,404);
  const adminSession=await ok(admin.auth.signInWithPassword({email:'admin@emoria.test',password:accounts.password}));
  const adminToken=adminSession.session.access_token;
  assert.equal((await api('GET','/me/session',null,adminToken)).isAdmin,true);
  await api('GET',route+'/draft',null,adminToken,403);
  await api('POST',route+'/unpublish',{});
  await ok(root.from('memory_spaces').update({owner_id:adminSession.user.id}).eq('tag_uid',tag));
  const adminDraft=await api('GET',route+'/draft',null,adminToken);
  assert.equal(adminDraft.is_published,false,'An admin owner can open a private house');
  await api('PUT',route+'/draft',{title:'Admin-owned private house',rooms:serializeHouseRooms(adminDraft.rooms)},adminToken);
  assert.equal((await api('GET',route+'/draft',null,adminToken)).title,'Admin-owned private house');
  await api('GET',route+'/draft',null,token,403);
  console.log('PASS admin owner opens and edits private House; admin without ownership and former owner remain denied.');
  console.log('PASS real local House HTTP/Auth/Storage: owner upload, non-owner denial, signed image bytes, reopen-save, photo/text placement, frozen publish, invalid photo rejection, unpublish/revoke.');
}finally{
  try{
    if(uploaded)await ok(root.storage.from('emoria-event-media').remove([path]));
    if(created)await ok(root.from('memory_spaces').delete().eq('tag_uid',tag));
  }finally{
    await Promise.allSettled([owner.auth.signOut(),other.auth.signOut(),admin.auth.signOut()]);
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
