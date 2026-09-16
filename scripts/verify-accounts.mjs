import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:55321')throw new Error('Local EMORIA only');
for(const email of ['admin@emoria.test','owner@emoria.test','viewer@emoria.test']){
 const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 try{const login=await client.auth.signInWithPassword({email,password:accounts.password});if(login.error)throw new Error(`${email}: sign-in failed`);
 const role=await client.rpc('is_admin'),memories=await client.rpc('rpc_my_memories');if(role.error||memories.error)throw new Error('Could not verify account permissions');
 console.log(JSON.stringify({email,admin:role.data,ownedTags:memories.data.map(m=>m.tag_uid)}));
 }finally{await client.auth.signOut();}
}
