import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {products} from '../src/data/products.js';
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:55321')throw new Error('Seed only supports the local EMORIA sandbox.');
const options={auth:{persistSession:false,autoRefreshToken:false}},root=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options),admin=createClient(config.API_URL,config.ANON_KEY,options);
const good=async p=>{const r=await p;if(r.error||r.data?.success===false)throw new Error(r.error?.message||r.data.message);return r.data;};
try{
 await good(admin.auth.signInWithPassword({email:'admin@emoria.test',password:accounts.password}));
 const existingCatalog=await good(root.from('checkout_products').select('*,checkout_variants(*)').in('id',products.map(p=>p.id)));
 const documentRows=products.filter(p=>p.sourceRevision);
 const needsImport=documentRows.filter(p=>!existingCatalog.some(row=>row.id===p.id&&row.details?.sourceRevision===p.sourceRevision));
 if(needsImport.length){
  fs.mkdirSync('.local',{recursive:true});
  fs.writeFileSync(`.local/catalog-before-document-${Date.now()}.json`,JSON.stringify(existingCatalog,null,2));
  for(const p of needsImport){
   const {id,name,price,image,unitsPerItem,formattedPrice,...details}=p;
   const existing=existingCatalog.find(row=>row.id===id);
   await good(root.from('checkout_products').upsert({id,name,price,image_url:image,active:existing?.active??true,details,units_per_item:unitsPerItem},{onConflict:'id'}));
   // Preserve historic variant rows/orders, but stop selling sizes attached to the wrong jewelry type.
   const obsolete=existing?.checkout_variants.filter(v=>id==='emoria-halo'?v.size.includes('cm'):id==='emoria-horizon'?v.size.startsWith('Size '):false)||[];
   for(const variant of obsolete)await good(root.from('checkout_variants').update({stock:0}).eq('product_id',id).eq('size',variant.size));
  }
 }
 // Seed missing rows only; reruns never restore stock consumed by real checkout.
 await good(root.from('checkout_products').upsert(products.map(p=>({id:p.id,name:p.name,price:p.price,image_url:p.image,active:true})),{onConflict:'id',ignoreDuplicates:true}));
 const variants=products.flatMap(p=>{const sizes=p.sizes||(p.category==='Nhẫn'?['Size 6','Size 7','Size 8']:p.category==='Vòng tay'?['15cm (Nhỏ)','16.5cm (Vừa)','18cm (Lớn)']:p.category==='Dây chuyền'?['Dây 45cm']:['Tiêu chuẩn']);return sizes.map(size=>({product_id:p.id,size,stock:50}));});
 await good(root.from('checkout_variants').upsert(variants,{onConflict:'product_id,size',ignoreDuplicates:true}));
 const articles=JSON.parse(fs.readFileSync('supabase/seeds/showcase-articles.json','utf8'));
 for(const article of articles){const existing=await good(root.from('articles').select('id').eq('slug',article.slug).maybeSingle());if(!existing)await good(admin.rpc('rpc_save_article_admin',{p_article_id:null,p_payload:{...article,author_name:'EMORIA Journal',status:'published',allow_comments:true}}));}
 const catalog=await good(root.from('checkout_products').select('id,name,price,active,checkout_variants(size,stock)').in('id',products.map(p=>p.id)));
 const published=await good(root.from('articles').select('slug,title,status').in('slug',articles.map(a=>a.slug)));
 console.log(JSON.stringify({importedDocumentRows:needsImport.length,products:catalog.map(({checkout_variants,...p})=>({...p,variants:checkout_variants.length})),articles:published},null,2));
}finally{await admin.auth.signOut();}
