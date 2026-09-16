import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {loadEnv} from 'vite';
import {products} from '../src/data/products.js';
if(process.argv[2]!=='--apply')throw new Error('Use --apply after inspecting and backing up the EMORIA Cloud project.');
const c=JSON.parse(fs.readFileSync('.local/cloud-service.json','utf8'));
if(c.url!=='https://svbmupgifhafrehdfomx.supabase.co')throw new Error('Unexpected project.');
const root=createClient(c.url,c.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const good=async p=>{const r=await p;if(r.error)throw new Error(r.error.message);return r.data;};
for(const p of products){
 const old=await good(root.from('checkout_products').select('id,details').eq('id',p.id).maybeSingle());
 if(!old||p.sourceRevision&&old.details?.sourceRevision!==p.sourceRevision){
  const {id,name,price,image,unitsPerItem,formattedPrice,...details}=p;
  await good(root.from('checkout_products').upsert({id,name,price,image_url:image,active:true,details,units_per_item:unitsPerItem||1},{onConflict:'id'}));
 }
 await good(root.from('checkout_variants').upsert((p.sizes||['Tiêu chuẩn']).map(size=>({product_id:p.id,size,stock:50})),{onConflict:'product_id,size',ignoreDuplicates:true}));
}
const articles=JSON.parse(fs.readFileSync('supabase/seeds/showcase-articles.json','utf8'));
await good(root.from('articles').upsert(articles.map(a=>({...a,author_name:'EMORIA Journal',status:'published',published_at:new Date().toISOString(),allow_comments:true})),{onConflict:'slug',ignoreDuplicates:true}));
const settings=await good(root.from('store_settings').select('*').single());
// New Cloud configuration only; future reruns preserve the owner's store settings.
if(!settings.sales_enabled&&!settings.contact_email){
 await good(root.from('store_settings').update({sandbox:true,sales_enabled:true,cod_enabled:true,transfer_enabled:false,ga4_measurement_id:loadEnv('production',process.cwd(),'').VITE_GA4_MEASUREMENT_ID||'',shipping_policy:'Cửa hàng thử nghiệm: phí giao 30.000 đ, miễn phí từ 1.000.000 đ. Chưa giao hàng thật.',return_policy:'Bản thử nghiệm; chính sách đổi trả thực tế sẽ được công bố trước khi mở bán.',privacy_policy:'Chỉ dùng thông tin thử nghiệm khi đặt hàng. Kỷ vật có thể được bảo vệ bằng PIN.'}).eq('id',true));
}
console.log('Cloud seeded: 14 catalog entries (8 document models, 4 combos, 2 retained samples), missing stock only, 3 new published articles, test orders with COD.');
