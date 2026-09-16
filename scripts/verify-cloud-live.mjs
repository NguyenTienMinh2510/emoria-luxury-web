import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {loadEnv} from 'vite';
const c=JSON.parse(fs.readFileSync('.local/cloud-service.json','utf8')),env=loadEnv('production',process.cwd(),'');
assert.equal(c.url,'https://svbmupgifhafrehdfomx.supabase.co');
const site='https://emoria-luxury-web.vercel.app',options={auth:{persistSession:false,autoRefreshToken:false}};
const root=createClient(c.url,c.serviceKey,options),guest=createClient(c.url,env.VITE_SUPABASE_ANON_KEY,options);
const good=async p=>{const r=await p;assert.ifError(r.error);assert.notEqual(r.data?.success,false);return r.data;};
const catalog=await good(guest.from('checkout_products').select('id,price,details,checkout_variants(size,stock)'));
assert.equal(catalog.filter(p=>p.details.sourceRevision).length,12);assert.ok(catalog.every(p=>p.checkout_variants.length));
for(const slug of JSON.parse(fs.readFileSync('supabase/seeds/showcase-articles.json','utf8')).map(a=>a.slug))assert.equal((await good(guest.rpc('rpc_get_article_detail',{p_slug:slug}))).article.status,'published');
assert.ok((await good(guest.rpc('rpc_get_memory_view',{p_tag_uid:'emoria-lumen'}))).intro_video_path);
const media=await fetch(site+'/api/memory-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag:'emoria-lumen'})});assert.equal(media.status,200);
const urls=Object.values((await media.json()).urls);assert.ok(urls.length);for(const url of urls){const r=await fetch(url,{method:'HEAD'});assert.equal(r.status,200);}
assert.equal((await fetch(site+'/api/analytics')).status,401);
// Generate an ephemeral session for the existing project admin; no email is sent or password changed.
const user=await good(root.auth.admin.getUserById('d1d24f84-c326-4116-9da5-da3399fae0d4'));
const admin=createClient(c.url,env.VITE_SUPABASE_ANON_KEY,options);
try{
 const link=await good(root.auth.admin.generateLink({type:'magiclink',email:user.user.email}));
 const verified=await good(admin.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}));
 assert.equal(await good(admin.rpc('is_admin')),true);
 const r=await fetch(site+'/api/analytics?days=30',{headers:{Authorization:`Bearer ${verified.session.access_token}`},signal:AbortSignal.timeout(50000)});
 const report=await r.json();assert.equal(r.status,200,report.error);assert.equal(report.configured,true);assert.equal(report.hostname,'emoria-luxury-web.vercel.app');assert.ok(report.daily.metricHeaders);
 console.log(JSON.stringify({pass:true,catalog:catalog.length,documentEntries:12,newArticles:3,privateMediaUrlsWorking:urls.length,ga4Status:r.status,ga4Hostname:report.hostname,dailyRows:report.daily.rowCount||0}));
}finally{await admin.auth.signOut({scope:'local'});}
