import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadEnv} from 'vite';
const cli=process.argv[2];if(!cli||!fs.existsSync(cli))throw new Error('Pass the installed Vercel CLI vc.js path.');
const linked=JSON.parse(fs.readFileSync('.vercel/project.json','utf8'));if(linked.projectId!=='prj_hlyslFnetTDAETP583uXLRX382it')throw new Error('Unexpected Vercel project.');
const env=loadEnv('production',process.cwd(),'');
if(env.VITE_SUPABASE_URL!=='https://svbmupgifhafrehdfomx.supabase.co')throw new Error('Unexpected Cloud URL.');
const values={
 VITE_SUPABASE_URL:env.VITE_SUPABASE_URL,
 VITE_SUPABASE_ANON_KEY:env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY,
 VITE_GA4_MEASUREMENT_ID:env.VITE_GA4_MEASUREMENT_ID,
 VITE_GA4_HOSTNAME:'emoria-luxury-web.vercel.app',
 VITE_GA4_TRACK_SANDBOX:'true',
 GA4_REPORT_HOSTNAME:'emoria-luxury-web.vercel.app',
 GA4_PROPERTY_ID:env.GA4_PROPERTY_ID,
 GA4_SERVICE_ACCOUNT_JSON:env.GA4_SERVICE_ACCOUNT_JSON,
};
if(fs.existsSync('.local/cloud-service.json'))values.SUPABASE_SERVICE_ROLE_KEY=JSON.parse(fs.readFileSync('.local/cloud-service.json','utf8')).serviceKey;
for(const [name,value] of Object.entries(values)){
 if(!value||value==='[SENSITIVE]')throw new Error(`Missing ${name}`);
 const secret=['GA4_SERVICE_ACCOUNT_JSON','SUPABASE_SERVICE_ROLE_KEY'].includes(name);
 const r=spawnSync(process.execPath,[cli,'env','add',name,'production','--force','--yes',secret?'--sensitive':'--no-sensitive'],{input:value,encoding:'utf8',timeout:90000});
 if(r.status)throw new Error(`Failed setting ${name}; no secret output retained.`);
 console.log(`Configured production ${name}`);
}
