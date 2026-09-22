// Non-production audit reproductions for commit 6685aa3. A finding is intentionally expected here.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';import {createServer} from 'node:http';import {spawn,spawnSync} from 'node:child_process';
import handler from '../../api/v1.js';import webhook from '../../api/sepay-webhook.js';import {craftLetter} from '../../server/geminiLetter.js';
const cfg=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));assert.equal(cfg.API_URL,'http://127.0.0.1:55321');
const client=key=>createClient(cfg.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),root=client(cfg.SERVICE_ROLE_KEY),anon=client(cfg.ANON_KEY),owner=client(cfg.ANON_KEY),admin=client(cfg.ANON_KEY);
const good=async p=>{const r=await p;assert.ifError(r.error);return r.data;};const ownerId=accounts.users.find(u=>u.role==='owner').id;
await good(owner.auth.signInWithPassword({email:'owner@emoria.test',password:accounts.password}));const adminToken=(await good(admin.auth.signInWithPassword({email:'admin@emoria.test',password:accounts.password}))).session.access_token;
process.env.SUPABASE_URL=cfg.API_URL;process.env.SUPABASE_PUBLISHABLE_KEY=cfg.ANON_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY=cfg.SERVICE_ROLE_KEY;
const tag='audit-'+crypto.randomUUID().slice(0,8),product=tag+'-product';let orderId;const findings=[];
const record=(id,proof)=>{findings.push({id,proof});console.log(id+': '+proof);};
const query=sql=>{const r=spawnSync('docker',['exec','-i','supabase_db_emoria-sandbox','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);return r.stdout;};
const parallel=sql=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i','supabase_db_emoria-sandbox','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',c=>c?reject(new Error(err)):resolve(out));p.stdin.end(sql);});
const profile=await good(root.from('profiles').select('address').eq('id',ownerId).single());const settings=await good(root.from('store_settings').select('*').eq('id',true).single());
const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 await good(root.from('profiles').update({address:'AUDIT FIXTURE ONLY'}).eq('id',ownerId));
 const exposed=await good(anon.from('profiles').select('address').eq('id',ownerId).single());assert.equal(exposed.address,'AUDIT FIXTURE ONLY');record('H1','Anonymous direct PostgREST SELECT reads a different account address.');
 await good(root.from('memory_spaces').insert({tag_uid:tag,owner_id:ownerId,title:'Audit fixture',jewelry_name:'Fixture',is_protected:true,letter:'FAKE PRIVATE LETTER',audio_url:'https://example.invalid/private-audio'}));
 let memory=await good(root.from('memory_spaces').select('id,version').eq('tag_uid',tag).single());
 await good(root.from('guestbook_entries').insert({memory_id:memory.id,author_name:'Fixture',message:'PRIVATE FIXTURE MESSAGE',is_hidden:false}));
 await good(owner.rpc('rpc_update_memory_space',{p_tag_uid:tag,p_payload:{version:memory.version,title:'Audit fixture',pin_action:'SET',pin_code:'1111',pin_hint:'1111'}}));
 const internal=await good(anon.rpc('get_memory_view_internal',{p_tag_uid:tag}));assert.equal(internal.is_unlocked,false);assert.equal(internal.audio_url,'https://example.invalid/private-audio');assert.equal(internal.guestbook[0].message,'PRIVATE FIXTURE MESSAGE');assert.equal(internal.pin_hint,'1111');record('H2','Direct internal RPC exposes audio and guestbook while locked; literal PIN hint is returned.');
 const grant=await good(anon.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'1111'}));
 await good(admin.rpc('rpc_memory_operations',{p_tag:tag,p_suspended:true}));
 assert.equal((await good(anon.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:grant.grant_token}))).success,false);
 assert.equal((await good(anon.rpc('get_memory_view_internal',{p_tag_uid:tag,p_grant_token:grant.grant_token}))).letter,'FAKE PRIVATE LETTER');
 await good(admin.rpc('rpc_memory_operations',{p_tag:tag,p_suspended:false}));assert.equal((await good(anon.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:grant.grant_token}))).is_unlocked,true);record('H3','Suspended memory remains readable through internal RPC with old grant; grant also survives suspend/resume.');
 await good(root.from('access_grants').delete().eq('memory_id',memory.id));
 // Hold only the attempt row; verifier has already copied the old hash before waiting here.
 const blocker=parallel(`BEGIN;SELECT 1 FROM public.memory_pin_failures WHERE memory_id='${memory.id}' FOR UPDATE;SELECT pg_sleep(3);COMMIT;`);
 await new Promise(resolve=>setTimeout(resolve,350));
 const verifying=anon.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'1111'}).then(r=>r);
 await new Promise(resolve=>setTimeout(resolve,350));
 await good(owner.rpc('rpc_update_memory_space',{p_tag_uid:tag,p_payload:{version:memory.version+1,title:'Audit fixture',pin_action:'SET',pin_code:'2222'}}));
 await blocker;const stale=await good(verifying);assert.equal(stale.success,true);assert.equal((await good(anon.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:stale.grant_token}))).is_unlocked,true);record('H4','Concurrent verification of old PIN mints a valid grant AFTER PIN rotation.');
 await good(root.from('store_settings').update({sandbox:true,sales_enabled:true,cod_enabled:true}).eq('id',true));
 await good(admin.rpc('rpc_save_catalog',{p_id:product,p_expected:null,p_product:{name:'Audit fixture',price:100000,active:true},p_variants:[{size:'S',stock:2}]}));
 const order=await good(anon.rpc('rpc_create_order',{p_request_id:crypto.randomUUID(),p_payload:{customerName:'Fixture',phone:'0900000000',address:'Fixture',paymentMethod:'cod',items:[{id:product,size:'S',quantity:1,price:1}]}}));orderId=order.order.id;assert.equal(order.order.totals.subtotal,100000);record('H5','Anonymous caller creates a COD order directly through RPC; REST user gate and per-user rate cap bypassed. Server price remains correct.');
 const override=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/video-uploads/override`,{method:'POST',headers:{Authorization:'Bearer '+adminToken,'Content-Type':'application/json'},body:JSON.stringify({path:tag+'/fixture',reason:'Fixture manual review'})});assert.equal(override.status,403);record('M1','Verified admin override fails with 403 because its caller-role client has no UPDATE grant on memory_video_labels.');
 const realFetch=globalThis.fetch;try{
  process.env.GEMINI_API_KEY='mock-only';let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'A sufficiently long fake letter for this local audit.'}]}}]});};
  await craftLetter({body:{memoryHint:'FAKE PRIVATE DETAIL'},user:{id:ownerId}});await craftLetter({body:{memoryHint:'FAKE PRIVATE DETAIL'},user:{id:ownerId}});assert.equal(calls,2);record('H6','Letter Muse dispatches private details without explicit consent or persistent quota. Google was mocked.');
  process.env.SEPAY_WEBHOOK_KEY='mock-'+ 'x'.repeat(40);process.env.SEPAY_ACCOUNT_NUMBER='123456789';process.env.SEPAY_MODE='test';let saved;
  globalThis.fetch=async(url,options)=>String(url).includes('/orders?')?Response.json({message:'temporary DB error'},{status:503}):(saved=JSON.parse(options.body),Response.json({success:true}));
  const res={setHeader(){},end(){}};await webhook({method:'POST',headers:{authorization:'Apikey '+process.env.SEPAY_WEBHOOK_KEY},body:{id:999,transferAmount:100000,transferType:'in',accountNumber:'123456789',content:'EMO'+'a'.repeat(20)}},res);
  assert.equal(res.statusCode,200);assert.equal(saved.p_order_id,null);record('H7','Short bank memo lookup failure is acknowledged 200 and persisted unmatched, suppressing retries. No bank/production requests made.');
 }finally{globalThis.fetch=realFetch;}
 fs.writeFileSync('docs/security-audit/reproductions.json',JSON.stringify({baseCommit:'6685aa3',environment:'local Supabase only; Google and SePay mocked',findings},null,2)+'\n');
}finally{
 await good(root.from('profiles').update(profile).eq('id',ownerId));
 if(orderId){await good(admin.rpc('rpc_order_status',{p_order_id:orderId,p_status:'cancelled'}));await good(root.from('order_items').delete().eq('order_id',orderId));await good(root.from('orders').delete().eq('id',orderId));}
 await good(root.from('checkout_variants').delete().eq('product_id',product));await good(root.from('checkout_products').delete().eq('id',product));await good(root.from('store_settings').update(settings).eq('id',true));
 await good(root.from('memory_spaces').delete().eq('tag_uid',tag));
 await owner.auth.signOut({scope:'local'});await admin.auth.signOut({scope:'local'});await new Promise(resolve=>server.close(resolve));
}

