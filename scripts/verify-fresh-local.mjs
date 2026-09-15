import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const workdir='.local/fresh-check';
fs.mkdirSync(`${workdir}/supabase/migrations`,{recursive:true});
const prepared=spawnSync(process.execPath,['scripts/prepare-local.mjs'],{stdio:'inherit'});if(prepared.status)process.exit(1);
let config=fs.readFileSync('local-stack/supabase/config.toml','utf8').replace('project_id = "emoria-sandbox"','project_id = "emoria-fresh-check"').replaceAll('5532','5632');
config=config.replace(/(\[auth.email\][\s\S]*?enable_confirmations = )false/,'$1true');
fs.writeFileSync(`${workdir}/supabase/config.toml`,config);
for(const file of fs.readdirSync('local-stack/supabase/migrations'))fs.copyFileSync(`local-stack/supabase/migrations/${file}`,`${workdir}/supabase/migrations/${file}`);
fs.copyFileSync('local-stack/supabase/seed.sql',`${workdir}/supabase/seed.sql`);
const start=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','start','--workdir',workdir],{encoding:'utf8',timeout:600000});
// CLI start prints local secret keys; retain privately, never echo raw output.
fs.writeFileSync('.local/fresh-start.log',start.stdout+'\n'+start.stderr);
if(start.status){console.error('Fresh stack start failed. Private log: .local/fresh-start.log');process.exit(1);}
const status=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',workdir,'-o','json'],{encoding:'utf8'});
if(status.status)throw new Error('Cannot read fresh stack status');
const data=JSON.parse(status.stdout.slice(status.stdout.indexOf('{')));
if(data.API_URL!=='http://127.0.0.1:56321')throw new Error('Unexpected fresh API');
fs.writeFileSync('.local/fresh-supabase.json',JSON.stringify(data));
console.log('PASS: isolated fresh stack started on 56321 with all migrations and fixtures; signup email confirmation enabled. Main sandbox unchanged.');
