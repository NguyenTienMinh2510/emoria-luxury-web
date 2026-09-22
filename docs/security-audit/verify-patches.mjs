// Local-only post-remediation checks. Apply remediation.sql to the local sandbox first.
// Point AUDIT_APPLICATION_ROOT at a checkout with application.patch applied.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
const app=path.resolve(process.env.AUDIT_APPLICATION_ROOT||'.');
const {default:handler}=await import(pathToFileURL(path.join(app,'api/v1.js')));
const {default:webhook}=await import(pathToFileURL(path.join(app,'api/sepay-webhook.js')));
const {craftLetter}=await import(pathToFileURL(path.join(app,'server/geminiLetter.js')));
const cfg=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
assert.equal(cfg.API_URL,'http://127.0.0.1:55321','Never run audit fixtures against production');
const accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
const client=key=>createClient(cfg.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
const root=client(cfg.SERVICE_ROLE_KEY),anon=client(cfg.ANON_KEY),owner=client(cfg.ANON_KEY),admin=client(cfg.ANON_KEY);
const good=async q=>{const r=await q;assert.ifError(r.error);return r.data;};
const sql=s=>{const r=spawnSync('docker',['exec','-i','supabase_db_emoria-sandbox','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);return r.stdout;};
const parallel=s=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i','supabase_db_emoria-sandbox','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1']);let err='';p.stdout.resume();p.stderr.on('data',d=>err+=d);p.on('close',c=>c?reject(Error(err)):resolve());p.stdin.end(s);});
process.env.SUPABASE_URL=cfg.API_URL;process.env.SUPABASE_PUBLISHABLE_KEY=cfg.ANON_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY=cfg.SERVICE_ROLE_KEY;
const tag='audit-fix-'+crypto.randomUUID().slice(0,8),mediaPath=tag+'/fixture.mp4',password=crypto.randomUUID()+'Aa1!';
const made=await good(root.auth.admin.createUser({email:tag+'@emoria.test',password,email_confirm:true}));
const userId=made.user.id;const passed=[];let server;
const record=name=>{passed.push(name);console.log('PASS '+name);};
try{
 const ownerToken=(await good(owner.auth.signInWithPassword({email:tag+'@emoria.test',password}))).session.access_token;
 const adminToken=(await good(admin.auth.signInWithPassword({email:'admin@emoria.test',password:accounts.password}))).session.access_token;
 assert.ok((await anon.from('profiles').select('email,address')).error);
 assert.equal((await good(owner.from('profiles').select('id'))).length,1);
 assert.equal((await good(owner.from('profiles').select('id')))[0].id,userId);record('Profile PII: anon denied, authenticated self-only');
 await good(root.from('memory_spaces').insert({tag_uid:tag,owner_id:userId,title:'Audit fake fixture',jewelry_name:'Fixture',is_protected:true,letter:'FAKE LETTER'}));
 const memory=await good(root.from('memory_spaces').select('id').eq('tag_uid',tag).single());
 const update=async payload=>{const row=await good(root.from('memory_spaces').select('version').eq('id',memory.id).single());return owner.rpc('rpc_update_memory_space',{p_tag_uid:tag,p_payload:{version:row.version,title:'Audit fake fixture',...payload}});};
 await good(update({pin_action:'SET',pin_code:'1111',pin_hint:'A shared date'}));
 assert.ok((await update({pin_action:'KEEP',pin_hint:'PIN 1111'})).error);record('Hint cannot contain the literal PIN');
 assert.ok((await anon.rpc('get_memory_view_internal',{p_tag_uid:tag})).error);
 assert.ok((await owner.rpc('get_memory_view_internal',{p_tag_uid:tag})).error);
 const locked=await good(anon.rpc('rpc_get_memory_view',{p_tag_uid:tag}));assert.equal(locked.letter,null);assert.equal(locked.pin_hash,undefined);record('Internal RPC revoked; locked public wrapper remains sanitized');
 const grant=await good(anon.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'1111'}));assert.equal(grant.success,true);
 await good(admin.rpc('rpc_memory_operations',{p_tag:tag,p_suspended:true}));
 assert.equal((await good(root.from('access_grants').select('id').eq('memory_id',memory.id))).length,0);
 assert.equal((await good(anon.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'1111'}))).success,false);
 await good(admin.rpc('rpc_memory_operations',{p_tag:tag,p_suspended:false}));
 assert.equal((await good(anon.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:grant.grant_token}))).is_unlocked,false);record('Suspend/resume revokes old tokens and rejects PIN verification while suspended');
 // Force the verifier to wait after acquiring the memory lock. Rotation must wait,
 // then revoke the newly committed grant instead of accepting a stale hash afterward.
 const blocker=parallel(`BEGIN;SELECT 1 FROM public.memory_pin_failures WHERE memory_id='${memory.id}' FOR UPDATE;SELECT pg_sleep(2);COMMIT;`);
 await new Promise(r=>setTimeout(r,300));
 const verifying=anon.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'1111'}).then(r=>r);
 await new Promise(r=>setTimeout(r,300));
 const rotating=update({pin_action:'SET',pin_code:'2222'});
 await blocker;const oldGrant=await good(verifying);await good(rotating);
 if(oldGrant.success)assert.equal((await good(anon.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:oldGrant.grant_token}))).is_unlocked,false);
 assert.equal((await good(anon.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'1111'}))).success,false);record('Concurrent old PIN verification cannot survive PIN rotation');
 const fresh=await good(anon.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'2222'}));
 await good(root.from('access_grants').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('grant_token',fresh.grant_token));
 assert.equal((await good(anon.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:fresh.grant_token}))).is_unlocked,false);record('Expired grant rejected');
 assert.ok((await anon.rpc('rpc_create_order',{p_request_id:crypto.randomUUID(),p_payload:{}})).error);record('Anonymous checkout RPC denied');
 assert.equal(await good(owner.rpc('reserve_letter_generation')),true);
 assert.equal(await good(owner.rpc('reserve_letter_generation')),false);
 sql(`UPDATE public.letter_ai_usage SET used=20,last_requested=now()-interval '1 minute' WHERE user_id='${userId}';`);
 assert.equal(await good(owner.rpc('reserve_letter_generation')),false);
 sql(`UPDATE public.letter_ai_usage SET day=current_date-1,last_requested=now()-interval '1 day' WHERE user_id='${userId}';`);
 assert.equal(await good(owner.rpc('reserve_letter_generation')),true);record('Persistent letter quota: 30 seconds, 20/day, day rollover');
 await good(root.storage.from('emoria-memory').upload(mediaPath,new Blob(['FAKE VIDEO'],{type:'video/mp4'}),{contentType:'video/mp4'}));
 const lease=await good(root.rpc('reserve_video_labels',{p_user:userId,p_tag:tag,p_path:mediaPath}));
 await good(root.from('memory_video_labels').update({status:'failed'}).eq('path',mediaPath));
 server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const override=async(token,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/video-uploads/override`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 const review={path:mediaPath,requestId:lease.request_id,reason:'Reviewed the fixture after a technical provider failure'};
 assert.equal((await override(ownerToken,review)).status,403);
 assert.ok((await override(adminToken,{...review,requestId:crypto.randomUUID()})).status>=400);
 const approved=await override(adminToken,review);assert.equal(approved.status,200,JSON.stringify(approved.data));
 const audit=await good(root.from('operation_audit').select('actor_id,detail').eq('resource_id',mediaPath));assert.equal(audit.length,1);assert.equal(audit[0].detail.previous_status,'failed');assert.ok(audit[0].actor_id);
 await good(root.from('memory_video_labels').update({status:'rejected',violations:['GRAPHIC_VIOLENCE']}).eq('path',mediaPath));
 assert.ok((await override(adminToken,review)).status>=400);record('Override: admin-only, current attempt only, recorded reviewer, known violations cannot be restored');
 await good(root.from('memory_video_labels').delete().eq('path',mediaPath));
 assert.ok((await root.rpc('reserve_video_labels',{p_user:userId,p_tag:tag,p_path:mediaPath})).error);record('Deleting mutable moderation state does not reset the rate limit');
 // Move the one immutable request outside the 30s window and synthesize a full day.
 sql(`UPDATE public.video_upload_events SET created_at=now()-interval '1 minute' WHERE user_id='${userId}' AND status='processing';`);
 await good(root.from('video_upload_events').insert(Array.from({length:19},()=>({user_id:userId,author_name:'Fixture',tag,path:mediaPath,status:'processing',model:'fixture',policy_version:1,request_id:crypto.randomUUID(),created_at:new Date(Date.now()-60000).toISOString()}))));
 assert.ok((await root.rpc('reserve_video_labels',{p_user:userId,p_tag:tag,p_path:mediaPath})).error);record('20 immutable AI reservations enforce daily quota after mutable row deletion');
 const realFetch=globalThis.fetch;
 try{
  process.env.GEMINI_API_KEY='mock-only';let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'A sufficiently long fake letter generated only by a mock.'}]}}]});};
  await assert.rejects(craftLetter({body:{},db:async()=>true,client:{rpc(){}}}),e=>e.status===400);
  await assert.rejects(craftLetter({body:{consent:true,memoryHint:'x'.repeat(1001)}}),e=>e.status===422);
  await assert.rejects(craftLetter({body:{consent:true},db:async()=>false,client:{rpc(){}}}),e=>e.status===429);
  assert.equal(calls,0);await craftLetter({body:{consent:true,occasion:'friendship'},db:async()=>true,client:{rpc(){}}});assert.equal(calls,1);record('Letter AI requires consent, bounded input and quota before provider request');
  process.env.SEPAY_WEBHOOK_KEY='mock-'+'x'.repeat(40);process.env.SEPAY_ACCOUNT_NUMBER='123456789';process.env.SEPAY_MODE='test';let ledgerCalls=0;
  globalThis.fetch=async(url,options)=>String(url).includes('/orders?')?Response.json({message:'temporary DB error'},{status:503}):(ledgerCalls++,Response.json({success:true}));
  const req={method:'POST',headers:{authorization:'Apikey '+process.env.SEPAY_WEBHOOK_KEY},body:{id:999,transferAmount:100000,transferType:'in',accountNumber:'123456789',content:'EMO'+'a'.repeat(20)}};
  const res={setHeader(){},end(){}};await webhook(req,res);assert.equal(res.statusCode,503);assert.equal(ledgerCalls,0);
  const orderId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';let saved;
  globalThis.fetch=async(url,options)=>String(url).includes('/orders?')?Response.json([{id:orderId}]):(saved=JSON.parse(options.body),ledgerCalls++,Response.json({success:true}));
  await webhook(req,res);assert.equal(res.statusCode,200);assert.equal(saved.p_order_id,orderId);assert.equal(ledgerCalls,1);record('SePay lookup failure returns 503 without ledger write; retry matches order');
 }finally{globalThis.fetch=realFetch;}
 fs.writeFileSync('docs/security-audit/verification.json',JSON.stringify({baseCommit:'6685aa3',application:'application.patch candidate',database:'remediation.sql on local Docker only',passed},null,2)+'\n');
}finally{
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 await root.storage.from('emoria-memory').remove([mediaPath]);
 await root.from('memory_spaces').delete().eq('tag_uid',tag);
 await root.from('video_upload_events').delete().eq('tag',tag);
 await root.from('operation_audit').delete().eq('resource_id',mediaPath);
 await owner.auth.signOut({scope:'local'});await admin.auth.signOut({scope:'local'});
 await good(root.auth.admin.deleteUser(userId));
}
