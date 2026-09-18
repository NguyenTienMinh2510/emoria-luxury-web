// Explicit opt-in local integration. This never runs against the cloud or in test:ci.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import handler from '../api/v1.js';
import webhook from '../api/sepay-webhook.js';
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:55321','Only isolated local Supabase is allowed');
process.env.SUPABASE_URL=config.API_URL;process.env.SUPABASE_PUBLISHABLE_KEY=config.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY=config.SERVICE_ROLE_KEY;
process.env.SEPAY_WEBHOOK_KEY='local-rest-fixture-'+crypto.randomUUID();
process.env.SEPAY_ACCOUNT_NUMBER='123456789';process.env.SEPAY_MODE='test';
const accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
const root=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const tokens={};
for(const role of ['admin','owner','viewer']){
  const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const r=await client.auth.signInWithPassword({email:`${role}@emoria.test`,password:accounts.password});assert.ifError(r.error);tokens[role]=r.data.session.access_token;
}
const server=createServer((req,res)=>req.url==='/api/sepay-webhook'?webhook(req,res):handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/api/v1`;
async function request(path,method='GET',body,role){
  const r=await fetch(base+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(role?{Authorization:`Bearer ${tokens[role]}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:await r.json()};
}
async function ok(path,method,body,role){const r=await request(path,method,body,role);assert.ok(r.status>=200&&r.status<300,`${method||'GET'} ${path}: ${JSON.stringify(r)}`);return r.data;}
const suffix=crypto.randomUUID().slice(0,8),pid=`rest-${suffix}`,tag=`rest-${suffix}`,slug=`rest-${suffix}`,requestId=crypto.randomUUID();
let articleId,orderId;
const profile=await ok('/me/profile','GET',undefined,'owner');
const settings=(await ok('/catalog')).settings;
try {
  const setup=await root.from('store_settings').update({sandbox:true,sales_enabled:true,transfer_enabled:true,bank_account:'123456789'}).eq('id',true);assert.ifError(setup.error);
  await ok('/system/status');
  assert.equal((await ok('/me/session','GET',undefined,'admin')).isAdmin,true);
  assert.equal((await request('/admin/orders','GET',undefined,'viewer')).status,403);
  await ok('/admin/products/'+pid,'PUT',{expected:null,product:{name:'REST fixture',price:123000,active:true,image:'/assets/product_lumen.png'},variants:[{size:'Test',stock:2}]},'admin');
  const payload={requestId,customerName:'REST fixture',phone:'0900000000',address:'Local only',paymentMethod:'vietqr',items:[{id:pid,size:'Test',quantity:1,price:1}]};
  assert.equal((await request('/orders','POST',payload)).status,401);
  const order=(await ok('/orders','POST',payload,'owner')).order;orderId=order.id;
  assert.equal(order.totals.subtotal,123000);
  assert.equal((await ok('/orders','POST',payload,'owner')).order.id,orderId);
  assert.equal((await request('/orders','POST',{...payload,customerName:'Changed'},'owner')).status,409);
  assert.equal((await ok('/orders/lookup','POST',{id:orderId},'owner')).order.id,orderId);
  assert.equal((await ok('/orders/lookup','POST',{id:orderId,token:order.lookupToken})).order.id,orderId);
  const summary=(await ok('/orders/lookup','POST',{id:orderId},'viewer')).order;
  assert.equal(summary.accessLevel,'summary');assert.equal(summary.phone,undefined);assert.equal(summary.address,undefined);
  assert.equal((await request('/orders/lookup','POST',{id:orderId,token:crypto.randomUUID()},'viewer')).status,409);
  assert.ok((await ok('/me/orders','GET',undefined,'owner')).some(o=>o.id===orderId));
  assert.ok(!(await ok('/me/orders','GET',undefined,'viewer')).some(o=>o.id===orderId));
  assert.equal((await request('/admin/orders/'+orderId+'/shipment','PUT',{carrier:'Test carrier',tracking:'REST123'},'admin')).status,409);
  assert.equal((await request('/admin/orders/'+orderId+'/status','PATCH',{status:'confirmed'},'admin')).status,409);
  const bankEvent={id:Date.now(),transferType:'in',transferAmount:order.totals.finalTotal,accountNumber:'123456789',referenceCode:'REST-'+suffix,content:orderId};
  for(let i=0;i<2;i++){
    const response=await fetch(base.replace('/api/v1','/api/sepay-webhook'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Apikey ${process.env.SEPAY_WEBHOOK_KEY}`},body:JSON.stringify(bankEvent)});assert.equal(response.status,200);
  }
  const paid=(await ok('/orders/lookup','POST',{id:orderId},'owner')).order;
  assert.equal(paid.paymentStatus,'paid');assert.equal(paid.paidAmount,order.totals.finalTotal);assert.equal(paid.status,'pending_payment');
  await ok('/admin/orders/'+orderId+'/status','PATCH',{status:'confirmed'},'admin');
  await ok('/admin/orders/'+orderId+'/shipment','PUT',{carrier:'Test carrier',tracking:'REST123',note:'Local test',status:null},'admin');
  assert.equal((await ok('/orders/lookup','POST',{id:orderId},'owner')).order.trackingNumber,'REST123');
  await ok('/admin/orders/'+orderId+'/status','PATCH',{status:'cancelled'},'admin');
  for(const path of ['/admin/orders','/admin/payment-events','/admin/reports/marketing?days=7&test=true','/admin/contacts','/admin/memories','/admin/articles'])await ok(path,'GET',undefined,'admin');
  await ok('/me/profile','PATCH',{phone:'0901234567'},'owner');
  const updated=await ok('/me/profile','GET',undefined,'owner');assert.equal(updated.phone,'0901234567');assert.equal(updated.full_name,profile.full_name);assert.equal(updated.birthday,profile.birthday);
  const article={slug,title:'REST fixture',content:'Public fixture',status:'published',category:'Hướng dẫn',allow_comments:true};
  articleId=(await ok('/admin/articles','POST',article,'admin')).article_id;
  await ok('/articles');await ok('/articles/'+slug);
  await ok('/articles/'+articleId+'/reactions/like','PUT',{enabled:true},'viewer');
  await ok('/articles/'+articleId+'/reactions/like','PUT',{enabled:true},'viewer');
  assert.equal((await ok('/articles/'+slug)).article.likes_count,1);
  await ok('/articles/'+articleId+'/reactions/bookmark','PUT',{enabled:true},'viewer');
  assert.ok((await ok('/me/saved-articles','GET',undefined,'viewer')).articles.some(a=>a.id===articleId));
  const comment=(await ok('/articles/'+articleId+'/comments','POST',{content:'REST comment'},'viewer')).comment_id;
  assert.ok((await request('/comments/'+comment,'PATCH',{content:'Hijack'},'owner')).status>=400);
  await ok('/admin/comments/'+comment+'/status','PATCH',{status:'approved'},'admin');
  await ok('/comments/'+comment,'DELETE',{},'viewer');
  const insert=await root.from('memory_spaces').insert({tag_uid:tag,jewelry_name:'REST fixture',title:'REST memory',owner_id:accounts.users.find(u=>u.role==='owner').id,is_protected:true,letter:'Private fixture'});assert.ifError(insert.error);
  assert.equal((await ok('/memories/'+tag+'/access','POST',{})).letter,null);
  assert.equal((await ok('/memories/'+tag+'/access','POST',{},'admin')).letter,null);
  assert.equal((await ok('/memories/'+tag+'/ownership','GET',undefined,'owner')).isOwner,true);
  assert.ok((await request('/memories/'+tag,'PATCH',{version:1,title:'Hijack'},'viewer')).status>=400);
  await ok('/memories/'+tag,'PATCH',{version:1,title:'Saved',pin_action:'SET',pin_code:'2468'},'owner');
  const grant=(await ok('/memories/'+tag+'/grants','POST',{pin:'2468'})).grant_token;
  assert.equal((await ok('/memories/'+tag+'/access','POST',{grant})).letter,'Private fixture');
  assert.ok((await request('/memories/'+tag,'PATCH',{version:1,title:'Stale'},'owner')).status>=400);
  console.log('PASS LOCAL REST/DB: JWT roles, checkout idempotency and pricing, order lookup/ownership, shipping, profile preservation, article reactions/moderation, memory PIN/version/privacy.');
} finally {
  // Clean up only this run's local fixtures, never pre-existing products/orders.
  const results=[];
  results.push(await root.from('memory_spaces').delete().eq('tag_uid',tag));
  if(articleId)results.push(await root.from('articles').delete().eq('id',articleId));
  if(orderId){await request('/admin/orders/'+orderId+'/status','PATCH',{status:'cancelled'},'admin');results.push(await root.from('bank_payment_events').delete().eq('order_id',orderId));results.push(await root.from('orders').delete().eq('id',orderId));}
  results.push(await root.from('checkout_requests').delete().eq('request_id',requestId));
  results.push(await root.from('checkout_variants').delete().eq('product_id',pid));
  results.push(await root.from('checkout_products').delete().eq('id',pid));
  await request('/me/profile','PATCH',profile,'owner');
  results.push(await root.from('store_settings').update({sandbox:settings.sandbox,sales_enabled:settings.sales_enabled,transfer_enabled:settings.transfer_enabled,bank_account:settings.bank_account}).eq('id',true));
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  for(const result of results)assert.ifError(result.error);
}
