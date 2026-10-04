import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {openFile} from './lib/backupCrypto.mjs';
const folder=path.resolve(process.argv[2]||''),index=JSON.parse(fs.readFileSync(path.join(folder,'index.json'),'utf8'));
if(!index.complete)throw Error('Incomplete backup');
const container='supabase_db_emoria-fresh-check',database=`emoria_restore_${Date.now()}_${randomBytes(4).toString('hex')}`;
const work=fs.mkdtempSync(path.resolve('.local/restore-check-')),key=Buffer.from(JSON.parse(fs.readFileSync('.local/backup-key.json')).key,'base64');
let created=false,phase='decrypt';
const docker=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:32e6});if(r.status!==0){fs.writeFileSync('.local/restore-last-error.log',r.stderr||r.stdout,{mode:0o600});const message=(r.stderr||'').match(/ERROR: ([^\r\n]+)/)?.[1]||'Private diagnostics retained';throw Error(`${phase}: ${message}`);}return r.stdout;};
const sql=content=>docker(['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],content);
try{
 await openFile(path.join(folder,index.manifestFile),path.join(work,'manifest'),key);
 const manifest=JSON.parse(fs.readFileSync(path.join(work,'manifest')));
 for(const entry of manifest.database){if(!/^[0-9]{6}\.enc$/.test(entry.file))throw Error('Invalid manifest');await openFile(path.join(folder,entry.file),path.join(work,entry.label),key);}
 phase='create isolated restore DB';docker(['exec',container,'createdb','-U','postgres',database]);created=true;
 phase='provider baseline';
 let provider=docker(['exec',container,'pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--no-privileges','--schema=auth','--schema=storage','--schema=realtime','--schema=extensions']);
 // Provider-owned table structures are supplied by the local Supabase version.
 // App policies/triggers are restored after application functions, not before.
 provider=provider.replace(/^CREATE POLICY[\s\S]*?;\r?\n/gm,'').replace(/^CREATE TRIGGER[\s\S]*?;\r?\n/gm,'');
 sql(provider);
 phase='application schema';
 const schema=fs.readFileSync(path.join(work,'schema'),'utf8').replace(/^CREATE SCHEMA "?public"?;$/gm,'CREATE SCHEMA IF NOT EXISTS public;')
  .replace(/^CREATE EXTENSION IF NOT EXISTS "?pg_cron"?[^;]*;\r?$/gm,'-- pg_cron is tied to the provider postgres database; scheduler verified separately.')
  .replace(/^COMMENT ON EXTENSION "?pg_cron"?[^;]*;\r?$/gm,'');
 const extensionSchemas=[...schema.matchAll(/^CREATE EXTENSION[^;]+WITH SCHEMA "?([a-z_]+)"?;/gm)].map(match=>match[1]);
 for(const name of new Set(extensionSchemas))sql(`CREATE SCHEMA IF NOT EXISTS "${name}";`);
 sql('CREATE PUBLICATION supabase_realtime;');
 sql(schema);
 phase='all backed-up table data';sql(fs.readFileSync(path.join(work,'data'),'utf8'));
 phase='restored consistency';
 const proof=sql("SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'orders',(SELECT count(*) FROM public.orders),'memories',(SELECT count(*) FROM public.memory_spaces),'storage_metadata',(SELECT count(*) FROM storage.objects)) AS restored_counts;");
 console.log('PASS database schema/data restored into an isolated local Supabase PostgreSQL database.');console.log(proof.trim());
 console.log('LIMIT: provider configuration, external integrations and Storage file serving require separate restore steps; encrypted file integrity is checked separately.');
 fs.writeFileSync('.local/restore-proof.json',JSON.stringify({at:new Date().toISOString(),backup:folder,restored:true,provider:container,countsOutput:proof.trim()},null,2));
}finally{
 if(created)docker(['exec',container,'dropdb','-U','postgres',database]);
 for(const name of fs.readdirSync(work))fs.unlinkSync(path.join(work,name));fs.rmdirSync(work);
}
