import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
export const PROJECT_REF='svbmupgifhafrehdfomx';
export function supabaseCommand(args,{timeout=120000,maxBuffer=64*1024*1024}={}) {
  const result=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],{encoding:'utf8',timeout,maxBuffer});
  // CLI dry-run/login output may contain temporary DB passwords. Never echo it.
  if(result.status!==0)throw new Error(`Supabase command failed (${result.error?.code||result.status}); private CLI output withheld.`);
  return result.stdout;
}
export function cloudQuery(sql,{file,timeout=120000}={}) {
  const raw=supabaseCommand(['db','query','--linked','--project-ref',PROJECT_REF,...(file?['-f',file]:[sql]),'--output','json'],{timeout});
  const start=raw.indexOf('{');if(start<0)throw new Error('Invalid private query response.');
  return JSON.parse(raw.slice(start)).rows;
}
export function cloudServiceConfig() {
  const config=JSON.parse(fs.readFileSync(path.resolve('.local/cloud-service.json'),'utf8'));
  if(config.url!==`https://${PROJECT_REF}.supabase.co`||!config.serviceKey)throw new Error('Unexpected Cloud service configuration.');
  return config;
}
export function dumpCloudToFile(args,target,{container='supabase_db_emoria-sandbox'}={}) {
  // Direct project DB endpoints are IPv6; this desktop uses the linked
  // session pooler and its already-installed PostgreSQL 17 client instead.
  let script=supabaseCommand(['db','dump','--linked','--project-ref',PROJECT_REF,...args,'--dry-run']);
  const pooler=new URL(fs.readFileSync('supabase/.temp/pooler-url','utf8').trim());
  if(!pooler.hostname.endsWith('.pooler.supabase.com')||pooler.port!=='5432')throw new Error('Unexpected backup pooler.');
  if(!script.includes(`db.${PROJECT_REF}.supabase.co`)||!script.includes('export PGPASSWORD='))throw new Error('Unexpected native dump script.');
  const match=script.match(/export PGUSER="?([a-z_]+)"?/);if(!match)throw new Error('Native dump login unavailable.');
  script=script.replace(/^export PGHOST=.*$/m,`export PGHOST="${pooler.hostname}"`).replace(/^export PGPORT=.*$/m,'export PGPORT="5432"').replace(/^export PGUSER=.*$/m,`export PGUSER="${match[1]}.${PROJECT_REF}"`);
  const result=spawnSync('docker',['exec','-i',container,'bash','-s'],{input:`set -e\nexport PGCONNECT_TIMEOUT=20\n${script}`,encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024});
  if(result.status!==0)throw new Error(`Session-pooler database dump failed (${result.error?.code||result.status}); private CLI output withheld.`);
  fs.writeFileSync(target,result.stdout,{flag:'wx',mode:0o600});
}
