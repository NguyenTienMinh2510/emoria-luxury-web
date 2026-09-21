// Local-only integration: account permissions and chip routing remain independent.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createClient} from '@supabase/supabase-js';import handler from '../api/v1.js';import mediaHandler from '../api/memory-media.js';
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:55321');
process.env.SUPABASE_URL=config.API_URL;process.env.SUPABASE_PUBLISHABLE_KEY=config.ANON_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY=config.SERVICE_ROLE_KEY;
const client=key=>createClient(config.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),root=client(config.SERVICE_ROLE_KEY),anon=client(config.ANON_KEY),clients={},tokens={};
const good=async p=>{const r=await p;assert.ifError(r.error);return r.data;};
for(const role of ['admin','owner','viewer']){clients[role]=client(config.ANON_KEY);tokens[role]=(await good(clients[role].auth.signInWithPassword({email:`${role}@emoria.test`,password:accounts.password}))).session.access_token;}
const uid=role=>accounts.users.find(u=>u.role===role).id;
const server=createServer((req,res)=>req.url==='/api/memory-media'?mediaHandler(req,res):handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
async function request(path,method='GET',body,role){const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(role?{Authorization:`Bearer ${tokens[role]}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
async function ok(path,method,body,role){const r=await request(path,method,body,role);assert.ok(r.status>=200&&r.status<300,`${method||'GET'} ${path}: ${JSON.stringify(r)}`);return r.data;}
let chip;const stored=[];const tags=[];const view=(tag,role)=>ok(`/memories/${tag}/access`,'POST',{},role);
try{
 const found=await ok('/admin/accounts?search='+uid('owner'),'GET',undefined,'admin');assert.equal(found[0].id,uid('owner'));
 for(const role of ['owner','viewer']){assert.equal((await request('/admin/accounts','GET',undefined,role)).status,403);assert.ok((await clients[role].rpc('rpc_admin_accounts')).error);}
 for(const name of ['memory_recipients','nfc_links']){assert.ok((await anon.from(name).select('*')).error);assert.ok((await clients.viewer.from(name).select('*')).error);}
 const create=async()=>{const m=await ok('/admin/memories','POST',{ownerId:uid('owner'),title:'Local account space'},'admin');tags.push(m.tag_uid);return m.tag_uid;};
 const tag=await create(),other=await create();
 assert.equal((await view(tag,'owner')).is_owner,true);assert.equal((await view(tag)).is_unlocked,false);
 let metadata=(await ok('/admin/memories?search='+tag,'GET',undefined,'admin'))[0];assert.equal(metadata.chip_count,0);assert.equal(metadata.letter,undefined);
 await ok(`/memories/${tag}`,'PATCH',{version:metadata.version,title:'Private test',letter:'Only assigned accounts'},'owner');
 assert.equal((await view(tag,'viewer')).is_unlocked,false);
 const recipient=`/admin/memories/${tag}/recipients/${uid('viewer')}`;
 for(let i=0;i<2;i++)await ok(recipient,'PUT',{},'admin');
 const shared=await view(tag,'viewer');assert.equal(shared.is_unlocked,true);assert.equal(shared.is_owner,false);assert.equal(shared.is_recipient,true);assert.equal(shared.letter,'Only assigned accounts');
 const mine=(await ok('/me/memories','GET',undefined,'viewer')).find(m=>m.tag_uid===tag);assert.equal(mine.role,'recipient');
 assert.deepEqual(await ok(`/memories/${tag}/ownership`,'GET',undefined,'viewer'),{isOwner:false});
 const changed=await request(`/memories/${tag}`,'PATCH',{title:'Hijacked'},'viewer');assert.ok(changed.status>=400||changed.data.success===false,'Recipient cannot edit');
 assert.equal((await request(`/memories/${tag}/video-labels/analyze`,'POST',{path:tag+'/test',consent:true},'viewer')).status,403);
 assert.ok((await clients.viewer.storage.from('emoria-memory').upload(tag+'/denied',new Blob(['fixture']),{contentType:'video/mp4'})).error);
 chip=await ok('/admin/nfc-chips','POST',{label:'Fixture chip'},'admin');assert.equal((await request('/nfc-chips/'+chip.id)).status,404);
 const link=async payload=>{chip=await ok('/admin/nfc-chips/'+chip.id,'PATCH',{version:chip.version,...payload},'admin');};
 await link({memoryTag:tag});assert.deepEqual(await ok('/nfc-chips/'+chip.id),{tag_uid:tag});assert.equal((await view(tag)).is_unlocked,false,'Resolving chip never grants access');
 assert.equal((await request('/admin/nfc-chips/'+chip.id,'PATCH',{version:1,memoryTag:other},'admin')).status,409,'Stale chip update denied');
 await link({memoryTag:other});assert.equal((await ok('/nfc-chips/'+chip.id)).tag_uid,other);assert.equal((await view(tag,'viewer')).is_unlocked,true,'Chip reassignment does not revoke account access');
 await link({active:false});assert.equal((await request('/nfc-chips/'+chip.id)).status,404);await link({active:true,memoryTag:null});assert.equal((await request('/nfc-chips/'+chip.id)).status,404);
 await ok(`/admin/memories/${tag}/suspension`,'PATCH',{suspended:true},'admin');assert.equal((await request(`/memories/${tag}/access`,'POST',{},'viewer')).status,409);await ok(`/admin/memories/${tag}/suspension`,'PATCH',{suspended:false},'admin');
 await ok(recipient,'DELETE',{},'admin');assert.equal((await view(tag,'viewer')).is_unlocked,false);assert.ok(!(await ok('/me/memories','GET',undefined,'viewer')).some(m=>m.tag_uid===tag));
 metadata=(await ok('/admin/memories?search='+tag,'GET',undefined,'admin'))[0];
 assert.equal((await request(`/admin/memories/${tag}/owner`,'PUT',{userId:uid('viewer'),version:metadata.version-1},'admin')).status,409);
 await ok(`/admin/memories/${tag}/owner`,'PUT',{userId:uid('viewer'),version:metadata.version},'admin');assert.equal((await view(tag,'viewer')).is_owner,true);assert.equal((await view(tag,'owner')).is_unlocked,false);
 const photo=tag+'/approved-photo.jpg';stored.push(photo);
 await good(clients.viewer.storage.from('emoria-memory').upload(photo,new Blob(['image fixture'],{type:'image/jpeg'}),{contentType:'image/jpeg'}));
 assert.ok((await clients.viewer.storage.from('emoria-memory').createSignedUrl(photo,120)).error,'Pending photos cannot be shared');
 const mem=await good(root.from('memory_spaces').select('id').eq('tag_uid',tag).single());
 assert.ok((await root.from('memory_media').insert({memory_id:mem.id,type:'image',url:'storage://'+photo})).error,'Pending photos cannot be attached');
 await good(root.from('memory_video_labels').update({status:'ready',policy_version:1,labels:['Photo']} ).eq('path',photo));
 await good(root.from('memory_media').insert({memory_id:mem.id,type:'image',url:'storage://'+photo}));
 await ok(`/admin/memories/${tag}/recipients/${uid('owner')}`,'PUT',{},'admin');
 const signed=await fetch(`http://127.0.0.1:${server.address().port}/api/memory-media`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.owner},body:JSON.stringify({tag})});
 assert.equal(signed.status,200);assert.ok((await signed.json()).urls[photo],'Recipient receives signed approved photo through the server');
 await good(root.from('video_upload_events').delete().eq('path',photo));
 const path=tag+'/gallery-photo.jpg',t0=Date.now()-10000;
 await good(root.from('video_upload_events').insert(['uploaded','processing','failed','processing','ready'].map((status,i)=>({user_id:uid('viewer'),author_name:'Fixture account',tag,path,status,created_at:new Date(t0+i*1000).toISOString(),labels:status==='ready'?['Gia đình']:[],model:'fixture',policy_version:1,request_id:crypto.randomUUID()}))));
 const logs=async extra=>ok('/admin/video-uploads?'+new URLSearchParams({search:tag,...extra}),'GET',undefined,'admin');
 let summary=await logs({});assert.equal(summary.length,1);assert.equal(summary[0].status,'ready');assert.equal(summary[0].event_count,5);assert.equal(summary[0].attempt_count,2);assert.equal(summary[0].media_type,'image');assert.equal(summary[0].category,'gallery');
 assert.deepEqual(await logs({status:'processing'}),[],'Finished files must not reappear under processing');assert.deepEqual(await logs({status:'failed'}),[]);
 assert.equal((await logs({history:true})).length,5);assert.equal((await logs({history:true,status:'processing'})).length,2);
 assert.equal((await logs({media_type:'image'})).length,1);assert.deepEqual(await logs({media_type:'video'}),[]);
 console.log('PASS memory accounts + NFC: private owner/recipient access, revocation, ownership transfer, chips independent, REST/RLS, optimistic concurrency, AI lifecycle deduplication and history.');
}finally{
 if(stored.length)await good(root.storage.from('emoria-memory').remove(stored));
 if(chip)await good(root.from('nfc_links').delete().eq('id',chip.id));
 for(const tag of tags){await good(root.from('video_upload_events').delete().eq('tag',tag));await good(root.from('memory_spaces').delete().eq('tag_uid',tag));}
 for(const c of Object.values(clients))await c.auth.signOut({scope:'local'});
 await new Promise(resolve=>server.close(resolve));
}
