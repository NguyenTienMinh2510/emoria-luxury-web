import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {validateMovie} from '../src/services/memoryMovie.js';
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:55321');
const client=key=>createClient(config.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
const root=client(config.SERVICE_ROLE_KEY),admin=client(config.ANON_KEY),owner=client(config.ANON_KEY),guest=client(config.ANON_KEY);
const good=async p=>{const r=await p;assert.ifError(r.error);assert.notEqual(r.data?.success,false);return r.data;};
const denied=async p=>{const r=await p;assert.ok(r.error||r.data?.success===false,'Expected denial');};
await good(admin.auth.signInWithPassword({email:'admin@emoria.test',password:accounts.password}));
await good(owner.auth.signInWithPassword({email:'owner@emoria.test',password:accounts.password}));
const id=`cinema-${Date.now()}`,tag=`${id}-memory`,ownerId=accounts.users.find(u=>u.role==='owner').id;
let orderId;const stored=[];
try {
 const product={name:'Cinema test product',price:100000,active:true,image:'/assets/product_lumen.png'},variants=[{size:'S',stock:4},{size:'M',stock:4}];
 await denied(owner.rpc('rpc_save_catalog',{p_id:id,p_expected:null,p_product:product,p_variants:variants}));
 await good(admin.rpc('rpc_save_catalog',{p_id:id,p_expected:null,p_product:product,p_variants:variants}));
 const expected={...product,stocks:{S:4,M:4}};
 const response=await good(guest.rpc('rpc_create_order',{p_request_id:crypto.randomUUID(),p_payload:{customerName:'Fixture',phone:'0900000000',address:'Fake address',paymentMethod:'cod',items:[{id,size:'S',quantity:1},{id,size:'M',quantity:1}]}}));orderId=response.order.id;
 await denied(admin.rpc('rpc_save_catalog',{p_id:id,p_expected:expected,p_product:{...product,price:200000},p_variants:variants}));
 const row=await good(root.from('checkout_products').select('*').eq('id',id).single());assert.equal(row.price,100000);
 const lines=await good(root.from('order_items').select('*').eq('order_id',orderId));
 for(const item of lines){
  const chip=await good(admin.rpc('rpc_issue_chip',{p_order_id:orderId,p_item_id:item.id}));assert.ok(chip.claim_code);
  await denied(admin.rpc('rpc_issue_chip',{p_order_id:orderId,p_item_id:item.id}));
  await denied(guest.rpc('rpc_claim_nfc_chip',{p_tag_uid:chip.tag,p_claim_code:chip.claim_code}));
  await denied(owner.rpc('rpc_claim_nfc_chip',{p_tag_uid:chip.tag,p_claim_code:'wrong-code'}));
  await good(owner.rpc('rpc_claim_nfc_chip',{p_tag_uid:chip.tag,p_claim_code:chip.claim_code}));
  await good(owner.rpc('rpc_claim_nfc_chip',{p_tag_uid:chip.tag,p_claim_code:chip.claim_code}));
  await denied(admin.rpc('rpc_claim_nfc_chip',{p_tag_uid:chip.tag,p_claim_code:chip.claim_code}));
  const owned=await good(owner.rpc('rpc_get_memory_view',{p_tag_uid:chip.tag}));assert.equal(owned.is_owner,true);assert.equal(owned.is_unlocked,true);
  assert.equal((await good(root.from('memory_spaces').select('claim_code_hash').eq('tag_uid',chip.tag).single())).claim_code_hash,null);
 }
 console.log('PASS claim: issued bcrypt code accepted by owner, wrong code/anonymous/second owner denied, owner retry safe, claim secret consumed');
 console.log('PASS catalog: admin only, stale stock cannot overwrite purchase, failed save leaves price unchanged; NFC: per-line quota across same-name variants');
 await good(root.from('memory_spaces').insert({tag_uid:tag,jewelry_name:'Fixture',title:'Fixture',owner_id:ownerId,is_protected:true,letter:'Private letter'}));
 const image=`${tag}/image`,video=`${tag}/intro`,wrong=`${tag}-other/intro`;
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/6XcAAAAASUVORK5CYII=','base64');
 await good(owner.storage.from('emoria-memory').upload(image,bytes,{contentType:'image/png'}));stored.push(image);
 // Storage/RPC fixture tests MIME and ownership; actual encoding/playback has a separate browser test.
 await good(owner.storage.from('emoria-memory').upload(video,bytes,{contentType:'video/webm'}));stored.push(video);
 await denied(owner.rpc('rpc_update_memory_space',{p_tag_uid:tag,p_payload:{version:1,title:'Fixture',intro_video_path:image}}));
 await denied(owner.rpc('rpc_update_memory_space',{p_tag_uid:tag,p_payload:{version:1,title:'Fixture',intro_video_path:wrong}}));
 await good(owner.rpc('rpc_update_memory_space',{p_tag_uid:tag,p_payload:{version:1,title:'Fixture',intro_video_path:video,letters:[{title:'Thư thứ hai',body:'Nội dung riêng'}],pin_action:'SET',pin_code:'3579'}}));
 for(const c of [guest,admin]){const hidden=await good(c.rpc('rpc_get_memory_view',{p_tag_uid:tag}));assert.equal(hidden.intro_video_path,null);assert.deepEqual(hidden.letters,[]);}
 const grant=await good(guest.rpc('rpc_verify_memory_pin',{p_tag_uid:tag,p_pin:'3579'}));
 const opened=await good(guest.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:grant.grant_token}));assert.equal(opened.intro_video_path,video);assert.equal(opened.letters.length,1);
 const signed=await fetch('http://127.0.0.1:3000/api/memory-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag,grant:grant.grant_token})});assert.equal(signed.status,200);assert.ok((await signed.json()).urls[video]);
 await good(guest.rpc('rpc_guestbook',{p_tag:tag,p_token:grant.grant_token,p_name:'Fixture',p_message:'A real pending message'}));
 await denied(admin.rpc('rpc_memory_guestbook',{p_tag:tag}));
 const pending=await good(owner.rpc('rpc_memory_guestbook',{p_tag:tag}));assert.equal(pending[0].is_hidden,true);
 await good(owner.rpc('rpc_memory_guestbook',{p_tag:tag,p_id:pending[0].id,p_action:'approve'}));
 const visible=await good(guest.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:grant.grant_token}));assert.equal(visible.guestbook.length,1);
 const operational=await good(admin.rpc('rpc_memory_operations'));assert.ok(operational.some(m=>m.tag_uid===tag));assert.ok(operational.every(m=>!('letter' in m)&&!('intro_video_path' in m)));
 await good(admin.rpc('rpc_memory_operations',{p_tag:tag,p_suspended:true}));await denied(guest.rpc('rpc_get_memory_view',{p_tag_uid:tag,p_grant_token:grant.grant_token}));
 console.log('PASS cinema: video MIME/path validation, private letters/movie hidden from guest and admin, signed movie URL, owner moderation, admin operational suspension without content access');
 assert.equal(validateMovie([{kind:'image',seconds:3,file:{size:1}},{kind:'video',start:1,end:4,duration:5,file:{size:1}}]),6);
 assert.throws(()=>validateMovie([{kind:'video',start:5,end:2,duration:6,file:{size:1}}]));assert.throws(()=>validateMovie([{kind:'image',seconds:181,file:{size:1}}]));
 console.log('PASS composer: valid duration, invalid trims and duration limit');
} finally {
 if(stored.length)await good(root.storage.from('emoria-memory').remove(stored));
 await good(root.from('memory_spaces').delete().eq('tag_uid',tag));
 if(orderId){await good(root.from('memory_spaces').delete().eq('order_id',orderId));await good(admin.rpc('rpc_order_status',{p_order_id:orderId,p_status:'cancelled'}));}
 await good(root.from('checkout_variants').delete().eq('product_id',id));await good(root.from('checkout_products').delete().eq('id',id));
 await admin.auth.signOut();await owner.auth.signOut();
}
