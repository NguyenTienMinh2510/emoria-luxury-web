import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const cfg=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
if(cfg.API_URL!=='http://127.0.0.1:55321')throw new Error('Local only');
const db=createClient(cfg.API_URL,cfg.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await db.from('checkout_products').select('id').eq('name','Integration product').like('id','test-%');if(error)throw error;
for(const p of data.filter(p=>/^test-\d{13}$/.test(p.id))){for(const table of ['checkout_variants','checkout_products']){const result=await db.from(table).delete().eq(table==='checkout_variants'?'product_id':'id',p.id);if(result.error)throw result.error;}}
console.log('Removed only generated integration product fixtures from local catalog.');
