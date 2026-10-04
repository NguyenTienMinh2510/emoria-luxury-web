// Bounded, read-only public checks. Never outputs tokens, response bodies or PII.
import fs from 'node:fs';
import {loadEnv} from 'vite';

const env=loadEnv('production',process.cwd(),'');
const base='https://emoria-luxury-web.vercel.app';
const results=[];
async function check(label,url,headers={}) {
  const started=Date.now();
  try {
    const response=await fetch(url,{headers,redirect:'follow',signal:AbortSignal.timeout(15000)});
    const result={label,status:response.status,elapsedMs:Date.now()-started,contentType:response.headers.get('content-type')};
    if(label==='homepage') {
      const body=await response.text();
      result.scriptAssets=[...body.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
      result.securityHeaders=Object.fromEntries(['content-security-policy','x-frame-options','x-content-type-options','strict-transport-security','referrer-policy'].map(name=>[name,response.headers.get(name)]));
      const localHtml=fs.readFileSync('dist/index.html','utf8');
      result.localScriptAssets=[...localHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
      result.assetsMatchLocalBuild=JSON.stringify(result.scriptAssets)===JSON.stringify(result.localScriptAssets);
    } else await response.body?.cancel();
    results.push(result);
  } catch(error) {results.push({label,error:error.cause?.code||error.name,elapsedMs:Date.now()-started});}
}
await check('homepage',base);
await check('catalog',base+'/api/v1/catalog');
await check('system status',base+'/api/v1/system/status');
await check('analytics rejects anonymous',base+'/api/analytics');
const publicKey=env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(env.VITE_SUPABASE_URL&&publicKey) {
  for(const [label,path] of [['Supabase Auth health','/auth/v1/health'],['Supabase catalog schema','/rest/v1/checkout_products?select=id&limit=0']]) {
    await check(label,new URL(path,env.VITE_SUPABASE_URL),{apikey:publicKey});
  }
}
fs.writeFileSync('docs/resilience-audit-2026-10-04/runtime-evidence.json',JSON.stringify({checkedAt:new Date().toISOString(),site:base,scope:'read-only; no auth, mutations, media access or load testing',results},null,2));
console.log(JSON.stringify(results,null,2));
