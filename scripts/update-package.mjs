import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
Object.assign(p.scripts,{'sandbox':'node scripts/run-sandbox.mjs','dev:sandbox':'vite --mode sandbox','build:sandbox':'vite build --mode sandbox','test:integration':'node tests/local_integration.test.mjs'});
p.devDependencies.supabase='2.117.0';
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
