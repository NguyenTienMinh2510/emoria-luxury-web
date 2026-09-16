import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {products} from '../src/data/products.js';
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:55321');
const options={auth:{persistSession:false,autoRefreshToken:false}},guest=createClient(config.API_URL,config.ANON_KEY,options),viewer=createClient(config.API_URL,config.ANON_KEY,options);
const good=async p=>{const r=await p;assert.ifError(r.error);assert.notEqual(r.data?.success,false);return r.data;};
const articles=JSON.parse(fs.readFileSync('supabase/seeds/showcase-articles.json','utf8'));
await good(viewer.auth.signInWithPassword({email:'viewer@emoria.test',password:accounts.password}));
try{
 for(const article of articles){
  const detail=await good(guest.rpc('rpc_get_article_detail',{p_slug:article.slug}));assert.equal(detail.article.title,article.title);assert.equal(detail.article.status,'published');assert.ok(detail.article.content.length>1000);
  const own=await good(viewer.rpc('rpc_get_article_detail',{p_slug:article.slug}));const original=own.article.is_liked;
  try{await good(viewer.rpc('rpc_set_article_reaction',{p_article_id:detail.article.id,p_kind:'like',p_enabled:!original}));assert.equal((await good(viewer.rpc('rpc_get_article_detail',{p_slug:article.slug}))).article.is_liked,!original);}finally{await good(viewer.rpc('rpc_set_article_reaction',{p_article_id:detail.article.id,p_kind:'like',p_enabled:original}));}
 }
 const catalog=await good(guest.from('checkout_products').select('id,price,active,checkout_variants(size,stock)').in('id',products.map(p=>p.id)));
 assert.equal(catalog.length,products.length);assert.ok(catalog.every(p=>p.price>0&&p.checkout_variants.length&&p.checkout_variants.every(v=>Number.isInteger(v.stock)&&v.stock>=0)));
 console.log(`PASS showcase database: three published articles readable by guest, likes persist and restored to original state, ${catalog.length} real catalog rows with price/variants/stock. Native share dialog still needs browser verification.`);
}finally{await viewer.auth.signOut();}
