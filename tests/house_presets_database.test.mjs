import fs from 'node:fs';
import http from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {ROOM_PRESETS,HOUSE_PRESETS,applyPresetToRooms,applyPresetToSingleRoom,getRoomPresetId} from '../src/data/housePresets.js';
import {serializeHouseRooms} from '../src/services/house3d.js';

// Explicit DB command: missing infrastructure fails instead of silently passing.
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:55321','Only the isolated local database is allowed');
Object.assign(process.env,{SUPABASE_URL:config.API_URL,SUPABASE_PUBLISHABLE_KEY:config.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY});
const {default:handler}=await import('../api/v1.js');
const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/api/v1`;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const root=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options),owner=createClient(config.API_URL,config.ANON_KEY,options);
const ok=async promise=>{const result=await promise;assert.ifError(result.error);return result.data;};
const tag=`preset-${crypto.randomUUID()}`,photo=`${tag}/photo.png`,preview=`${tag}/preview.png`;
let userId,token,revision=0,created=false;
async function api(method,path,body,expected=200,auth=token,retry=0) {
  const response=await fetch(base+path,{method,headers:{...(auth?{Authorization:`Bearer ${auth}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(response.status===429 && retry<2) {
    const seconds=Number(response.headers.get('retry-after'))||60;
    console.log('Waiting for the normal local API rate limit before continuing preset cases.');
    await new Promise(resolve=>setTimeout(resolve,Math.min(61,Math.max(1,seconds)+1)*1000));
    return api(method,path,body,expected,auth,retry+1);
  }
  assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);
  if(response.ok && Number.isSafeInteger(data.draft_revision))revision=data.draft_revision;
  return data;
}
try {
  const email=`${tag}@emoria.test`,password=crypto.randomUUID();
  userId=(await ok(root.auth.admin.createUser({email,password,email_confirm:true}))).user.id;
  token=(await ok(owner.auth.signInWithPassword({email,password}))).session.access_token;
  await ok(root.from('memory_spaces').insert({tag_uid:tag,jewelry_name:'Preset fixture',title:'Local preset test',owner_id:userId,availability_status:'available'}));created=true;
  await ok(owner.storage.from('emoria-event-media').upload(photo,fs.readFileSync('tests/fixtures/house-cat.png'),{contentType:'image/png'}));
  await ok(owner.storage.from('emoria-event-media').upload(preview,fs.readFileSync('public/memoryhouse/models/house-preview.png'),{contentType:'image/png'}));
  const original=applyPresetToRooms(Object.keys(ROOM_PRESETS).map(id=>({id,name:id,note:'Keep note',lighting:'sunset',memories:[{id:`photo-${id}`,photo_path:photo,caption:'Keep caption'}]})),'vintage');
  for(const room of original) {
    room.decorations=room.decorations.map(d=>({...d,id:`original_${d.id}`,...(d.parent_id?{parent_id:`original_${d.parent_id}`}:{})}));
    room.furnishingBaseline=room.decorations.map(({text,photos,...d})=>structuredClone(d));
  }
  original[0].share_preview_path=preview;
  const route=`/memories/${tag}/house`;
  const save=rooms=>api('PUT',route+'/draft',{title:'Preset test',theme:'warm_gold',rooms:serializeHouseRooms(rooms),expected_revision:revision});
  await save(original);
  const cases=[...Object.entries(ROOM_PRESETS).flatMap(([roomId,presets])=>presets.map(p=>({roomId,presetId:p.id}))),...HOUSE_PRESETS.map(p=>({presetId:p.id}))];
  for(const {roomId,presetId} of cases) {
    const next=roomId?original.map(r=>r.id===roomId?applyPresetToSingleRoom(r,presetId):r):applyPresetToRooms(original,presetId);
    await save(next);
    const reloaded=await api('GET',route+'/draft');
    assert.equal(reloaded.can_restore_layout,true,'A saved replacement immediately creates a database recovery point');
    for(const room of reloaded.rooms) {
      assert.equal(room.memories[0].photo_path,photo);assert.equal(room.note,'Keep note');
      assert.deepEqual(room.decorations,serializeHouseRooms(next).find(r=>r.id===room.id).decorations);
      if(!roomId||room.id===roomId)assert.equal(getRoomPresetId(room),presetId);
    }
    const published=await api('POST',route+'/publish',{});
    const publicRoute=`/events/houses/share/${published.share_id}`;
    const publicHouse=await api('GET',publicRoute,undefined,200,null);
    assert.deepEqual(publicHouse.rooms.map(r=>r.decorations),reloaded.rooms.map(r=>r.decorations));
    assert.ok(publicHouse.rooms.every(r=>r.memories[0].photo_url&&!r.memories[0].photo_path),'Public images are signed, raw storage paths are private');
    await api('POST',route+'/restore-layout',{expected_revision:revision});
    const restored=await api('GET',route+'/draft');
    assert.equal(restored.can_restore_layout,false,'Restore consumes the persisted recovery point');
    for(const room of restored.rooms) {
      assert.equal(room.memories[0].photo_path,photo);assert.equal(room.note,'Keep note');
      const old=original.find(r=>r.id===room.id);
      for(const d of old.decorations)assert.ok(room.decorations.some(item=>item.id===d.id),'Restoration recovers removed furniture');
    }
    assert.deepEqual((await api('GET',publicRoute,undefined,200,null)).rooms.map(r=>r.decorations),publicHouse.rooms.map(r=>r.decorations),'Restoring a draft leaves the published snapshot unchanged');
  }
  await api('PUT',route+'/draft',{rooms:original,expected_revision:0},409);
  await api('POST',route+'/restore-layout',{expected_revision:revision},401,null);
  console.log('PASS local HTTP/Auth/PostgreSQL/Storage: all 20 room presets and 3 house presets save, reload, publish and restore; photos, other rooms, immutable public snapshots, revision conflicts and ownership checks.');
} finally {
  try {
    await ok(root.storage.from('emoria-event-media').remove([photo,preview]));
    if(created)await ok(root.from('memory_spaces').delete().eq('tag_uid',tag));
    if(userId)await ok(root.auth.admin.deleteUser(userId));
  } finally {await owner.auth.signOut();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
