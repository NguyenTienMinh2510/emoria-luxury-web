// Temporarily enable fictional checkout for tests, restoring the user's setting even on failure.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const c=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
if(c.API_URL!=='http://127.0.0.1:55321')throw new Error('Local EMORIA only.');
const root=createClient(c.API_URL,c.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const good=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
const original=await good(root.from('store_settings').select('sandbox').single());
try{
 await good(root.from('store_settings').update({sandbox:true}).eq('id',true));
 for(const file of ['tests/local_integration.test.mjs','tests/cinema_operations.test.mjs','tests/showcase_data.test.mjs','tests/document_catalog.test.mjs']){
  const r=spawnSync(process.execPath,[file],{stdio:'inherit'});if(r.status)throw new Error(`${file} failed`);
 }
}finally{await good(root.from('store_settings').update({sandbox:original.sandbox}).eq('id',true));console.log('Restored original store sandbox setting.');}
