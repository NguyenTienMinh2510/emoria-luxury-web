import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8')),accounts=JSON.parse(fs.readFileSync('.local/accounts.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:55321')throw new Error('This check uses the local EMORIA admin only.');
const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
try{
 const {data,error}=await client.auth.signInWithPassword({email:'admin@emoria.test',password:accounts.password});if(error)throw new Error('Local admin sign-in failed.');
 const response=await fetch('http://127.0.0.1:3000/api/analytics?days=30',{headers:{Authorization:`Bearer ${data.session.access_token}`},signal:AbortSignal.timeout(40000)});
 const report=await response.json();
 console.log(JSON.stringify({status:response.status,configured:report.configured,error:report.error,message:report.message,days:report.days,summaryRows:report.summary?.rowCount||0,channelRows:report.channels?.rowCount||0,deviceRows:report.devices?.rowCount||0}));
 if(!response.ok||!report.configured)process.exitCode=1;
}finally{await client.auth.signOut();}
