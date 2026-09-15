import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const config=JSON.parse(fs.readFileSync('.local/fresh-supabase.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:56321');
const client=key=>createClient(config.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
const root=client(config.SERVICE_ROLE_KEY),admin=client(config.ANON_KEY),guest=client(config.ANON_KEY);
const good=async promise=>{const r=await promise;assert.ifError(r.error);assert.notEqual(r.data?.success,false);return r.data;};
const denied=async promise=>{const r=await promise;assert.ok(r.error||r.data?.success===false);};
const id='fresh-'+Date.now(),password='Fixture!'+crypto.randomUUID(),orderIds=[];let userId;
try {
 const user=await good(root.auth.admin.createUser({email:id+'@emoria.test',password,email_confirm:true}));userId=user.user.id;
 await good(root.from('role_assignments').insert({user_id:userId,role:'admin'}));
 await good(admin.auth.signInWithPassword({email:user.user.email,password}));
 await good(admin.rpc('rpc_save_catalog',{p_id:id,p_expected:null,p_product:{name:'Fresh fixture',price:120000,active:true,image:'/assets/product_lumen.png'},p_variants:[{size:'S',stock:10}]}));
 const payload={customerName:'Fictional fixture',phone:'0900000000',address:'Fake address',paymentMethod:'vietqr',items:[{id,size:'S',quantity:2}]},requestId=crypto.randomUUID();
 const created=await good(guest.rpc('rpc_create_order',{p_request_id:requestId,p_payload:payload}));orderIds.push(created.order.id);
 const retry=await good(guest.rpc('rpc_create_order',{p_request_id:requestId,p_payload:payload}));assert.deepEqual(created,retry);
 const stock=async()=> (await good(root.from('checkout_variants').select('stock').eq('product_id',id).single())).stock;
 assert.equal(await stock(),8);
 await good(root.from('orders').update({expires_at:new Date(Date.now()-5000).toISOString()}).eq('id',created.order.id));
 await denied(admin.rpc('rpc_order_status',{p_order_id:created.order.id,p_status:'confirmed'}));
 await denied(guest.rpc('rpc_expire_orders'));
 await Promise.all([good(admin.rpc('rpc_expire_orders')),good(admin.rpc('rpc_order_status',{p_order_id:created.order.id,p_status:'cancelled'}))]);
 assert.equal(await stock(),10);
 await good(admin.rpc('rpc_expire_orders'));assert.equal(await stock(),10);
 const tracked=await good(guest.rpc('rpc_track_order',{p_order_id:created.order.id.toLowerCase(),p_token:created.order.lookupToken}));assert.equal(tracked.order.status,'cancelled');assert.equal(tracked.order.statusTimeline.length,2);
 const cod=await good(admin.rpc('rpc_create_order',{p_request_id:crypto.randomUUID(),p_payload:{...payload,paymentMethod:'cod'}}));orderIds.push(cod.order.id);
 await good(admin.rpc('rpc_order_status',{p_order_id:cod.order.id,p_status:'crafting_nfc'}));
 await denied(admin.rpc('rpc_order_status',{p_order_id:cod.order.id,p_status:'shipping'}));
 await good(admin.rpc('rpc_order_status',{p_order_id:cod.order.id,p_status:'shipping',p_tracking:'LOCAL-FIXTURE-01'}));
 const own=await good(admin.rpc('rpc_track_order',{p_order_id:cod.order.id}));assert.equal(own.order.trackingNumber,'LOCAL-FIXTURE-01');assert.equal(own.order.statusTimeline.length,3);
 await denied(guest.rpc('rpc_track_order',{p_order_id:cod.order.id}));
 console.log('PASS fresh DB: migrations, checkout replay, exactly-once restock during concurrent expiry/cancel, expiry blocks confirmation, admin-only expiry, tracking required, private order history');
} finally {
 // Only fixtures created in this isolated test stack.
 for(const orderId of orderIds){await good(root.from('operation_audit').delete().eq('resource_id',orderId));await good(root.from('checkout_requests').delete().eq('response->order->>id',orderId));await good(root.from('orders').delete().eq('id',orderId));}
 await good(root.from('checkout_variants').delete().eq('product_id',id));await good(root.from('checkout_products').delete().eq('id',id));
 if(userId)await good(root.auth.admin.deleteUser(userId));await admin.auth.signOut();
}
