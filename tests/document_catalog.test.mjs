import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {products} from '../src/data/products.js';
const c=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
assert.equal(c.API_URL,'http://127.0.0.1:55321');
const client=key=>createClient(c.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
const root=client(c.SERVICE_ROLE_KEY),admin=client(c.ANON_KEY),guest=client(c.ANON_KEY);
const good=async p=>{const r=await p;assert.ifError(r.error);assert.notEqual(r.data?.success,false);return r.data;};
const source=products.filter(p=>p.sourceRevision);
assert.equal(source.length,12);
const rows=await good(guest.from('checkout_products').select('*,checkout_variants(*)').in('id',source.map(p=>p.id)));
assert.equal(rows.length,12);
for(const p of source){
 const row=rows.find(r=>r.id===p.id);assert.equal(row.price,p.price);assert.equal(row.details.category,p.category);assert.equal(row.units_per_item,p.unitsPerItem);assert.equal(row.details.specifications.length,6);
 assert.ok(fs.existsSync('public'+row.image_url));assert.ok(row.checkout_variants.some(v=>v.stock>0));
}
assert.equal(rows.find(p=>p.id==='emoria-halo').details.category,'Nhẫn');
assert.equal(rows.find(p=>p.id==='emoria-horizon').details.category,'Vòng tay');
await good(admin.auth.signInWithPassword({email:'admin@emoria.test',password:accounts.password}));
const id=`bundle-test-${Date.now()}`;let order;
try{
 // Separate fixture stock; no customer catalog inventory is changed by this checkout test.
 await good(root.from('checkout_products').insert({id,name:'Combo fixture',price:549000,units_per_item:2,active:true}));
 await good(root.from('checkout_variants').insert({product_id:id,size:'Bộ 2 chiếc',stock:3}));
 order=(await good(guest.rpc('rpc_create_order',{p_request_id:crypto.randomUUID(),p_payload:{customerName:'Fixture',phone:'0900000000',address:'Test address',paymentMethod:'cod',items:[{id,size:'Bộ 2 chiếc',quantity:1,price:1,unitsPerItem:99}]}}))).order;
 assert.equal(order.totals.subtotal,549000);
 const item=await good(root.from('order_items').select('*').eq('order_id',order.id).single());assert.equal(item.units_per_item,2);
 assert.equal((await good(root.from('checkout_variants').select('stock').eq('product_id',id).single())).stock,2);
 await good(root.from('checkout_products').update({units_per_item:1}).eq('id',id));
 for(let i=0;i<2;i++)await good(admin.rpc('rpc_issue_chip',{p_order_id:order.id,p_item_id:item.id}));
 const excess=await admin.rpc('rpc_issue_chip',{p_order_id:order.id,p_item_id:item.id});assert.ok(excess.error);
 console.log('PASS document catalog: 8 models + 4 combos, source prices/images/specs, corrected categories; bundle server price, one pack deducted, two chips only, quota snapshot survives catalog edits.');
}finally{
 if(order){await good(root.from('memory_spaces').delete().eq('order_id',order.id));await good(admin.rpc('rpc_order_status',{p_order_id:order.id,p_status:'cancelled'}));}
 await good(root.from('checkout_variants').delete().eq('product_id',id));await good(root.from('checkout_products').delete().eq('id',id));await admin.auth.signOut();
}
