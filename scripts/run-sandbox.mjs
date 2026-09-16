import {spawnSync,spawn} from 'node:child_process';
import fs from 'node:fs';
const cli=['node_modules/supabase/dist/supabase.js'];
if(!fs.existsSync('local-stack/supabase/config.toml')){
 const init=spawnSync(process.execPath,[...cli,'init','--workdir','local-stack'],{encoding:'utf8'});if(init.status)throw new Error(init.stderr);
}
spawnSync(process.execPath,['scripts/prepare-local.mjs'],{stdio:'inherit'});
console.log('Starting EMORIA local database, Auth, Storage and test mailbox…');
const start=spawnSync(process.execPath,[...cli,'start','--workdir','local-stack'],{encoding:'utf8',timeout:600000});
if(start.status){console.error(start.stderr);process.exit(1);}
const setup=spawnSync(process.execPath,['scripts/setup-sandbox.mjs'],{stdio:'inherit'});if(setup.status)process.exit(1);
const seed=spawnSync(process.execPath,['scripts/seed-showcase.mjs'],{stdio:'inherit'});if(seed.status)process.exit(1);
const server=spawn(process.execPath,['--dns-result-order=ipv4first','node_modules/vite/bin/vite.js','--mode','sandbox'],{stdio:'inherit'});
server.on('exit',code=>process.exit(code||0));
