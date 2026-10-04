import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {PROJECT_REF,dumpCloudToFile,cloudQuery,cloudServiceConfig} from './lib/cloudControl.mjs';
import {sealFile,fileHash} from './lib/backupCrypto.mjs';

// Versioned, encrypted database + Storage backup of the linked project.
// The key stays outside each backup; CLI output and object names stay private.
const id=new Date().toISOString().replace(/[:.]/g,'-');
const folder=path.resolve('.local/cloud-backups',id);fs.mkdirSync(folder,{recursive:true});
const keyFile=path.resolve('.local/backup-key.json');
if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,JSON.stringify({algorithm:'aes-256-gcm',key:randomBytes(32).toString('base64')}),{flag:'wx',mode:0o600});
const key=Buffer.from(JSON.parse(fs.readFileSync(keyFile,'utf8')).key,'base64');
const manifest={version:1,project:PROJECT_REF,startedAt:new Date().toISOString(),database:[],storage:[],complete:false};
let index=0;
async function archive(temp,label) {
  const file=`${String(++index).padStart(6,'0')}.enc`,meta=await sealFile(temp,path.join(folder,file),key);
  fs.unlinkSync(temp);return {label,file,...meta};
}
async function saveJson(value,label) {
  const temp=path.join(folder,`private-${index+1}.json`);fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});return archive(temp,label);
}
try {
  for(const [label,args] of [['roles',['--role-only']],['schema',[]],['data',['--data-only','--use-copy']]]) {
    const temp=path.join(folder,`private-${label}.sql`);
    dumpCloudToFile(args,temp);
    if(label==='data') {
      const dump=fs.readFileSync(temp,'utf8');
      if(!/"?auth"?\."?users"?/.test(dump)||!dump.includes('orders'))throw new Error('Database dump is missing required Auth/order data.');
    }
    manifest.database.push(await archive(temp,label));
    console.log(`Encrypted database ${label} backup completed.`);
  }
  const metadata=cloudQuery("SELECT jsonb_build_object('buckets',(SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]') FROM storage.buckets b),'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM pg_policies p WHERE schemaname IN ('storage','auth')),'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid))),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.prokind='f'),'migrations',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') FROM supabase_migrations.schema_migrations m)) AS metadata");
  manifest.database.push(await saveJson(metadata[0].metadata,'managed-metadata'));
  const config=cloudServiceConfig();
  const storage=createClient(config.url,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(120000)})}}).storage;
  let after='';
  for(;;) {
    const objects=cloudQuery(`SELECT id::text,bucket_id,name,metadata,updated_at FROM storage.objects WHERE id::text>'${after}' ORDER BY id::text LIMIT 100`);
    if(!objects.length)break;
    for(const object of objects) {
      const result=await storage.from(object.bucket_id).download(object.name);
      if(result.error||!result.data)throw new Error('Storage object could not be backed up; private path withheld.');
      const temp=path.join(folder,`private-object-${index+1}`);fs.writeFileSync(temp,Buffer.from(await result.data.arrayBuffer()),{mode:0o600});
      manifest.storage.push({...object,backup:await archive(temp,'storage-object')});
    }
    after=objects.at(-1).id;
    console.log(`Encrypted ${manifest.storage.length} Storage objects.`);
  }
  const latest=cloudQuery("SELECT id::text,bucket_id,name,metadata,updated_at FROM storage.objects ORDER BY id::text");
  if(JSON.stringify(latest)!==JSON.stringify(manifest.storage.map(({backup,...object})=>object)))throw new Error('Storage changed during backup; rerun to obtain a complete snapshot.');
  manifest.finishedAt=new Date().toISOString();manifest.complete=true;
  const manifestEntry=await saveJson(manifest,'manifest');
  const indexData={version:1,project:PROJECT_REF,complete:true,manifestFile:manifestEntry.file,encryptedFiles:fs.readdirSync(folder).filter(name=>name.endsWith('.enc')).length,storageObjects:manifest.storage.length,finishedAt:manifest.finishedAt};
  fs.writeFileSync(path.join(folder,'index.json'),JSON.stringify(indexData,null,2),{mode:0o600});
  const mirror=process.env.EMORIA_BACKUP_MIRROR_DIRECTORY;
  if(mirror){const destination=path.resolve(mirror,id);if(destination.startsWith(folder+path.sep)||destination===folder)throw new Error('Invalid backup mirror directory.');fs.cpSync(folder,destination,{recursive:true,errorOnExist:true,force:false});for(const name of fs.readdirSync(folder)){if(await fileHash(path.join(folder,name))!==await fileHash(path.join(destination,name)))throw new Error('Off-machine mirror verification failed.');}}
  console.log(JSON.stringify({complete:true,folder,storageObjects:manifest.storage.length,encryptedFiles:indexData.encryptedFiles,offMachineMirrorConfigured:Boolean(mirror),keyFile:'Excluded .local key; preserve separately from backups.'}));
}catch(error){
  for(const name of fs.readdirSync(folder).filter(name=>name.startsWith('private-')))fs.unlinkSync(path.join(folder,name));
  fs.writeFileSync(path.join(folder,'failed.json'),JSON.stringify({complete:false,at:new Date().toISOString(),reason:error.message}),{mode:0o600});
  throw error;
}
