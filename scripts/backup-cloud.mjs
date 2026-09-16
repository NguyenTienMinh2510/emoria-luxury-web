import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const ref='svbmupgifhafrehdfomx';
fs.mkdirSync('.local/cloud-backup',{recursive:true});
function cli(args){const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});if(r.status)throw new Error('Cloud read failed; no private output printed.');return JSON.parse(r.stdout.slice(r.stdout.search(/[\[{]/)));}
function query(sql){return cli(['db','query','--linked','--project-ref',ref,sql]).rows;}
const tables=query("select tablename from pg_tables where schemaname='public' and tablename in ('checkout_products','checkout_variants','articles','article_comments','article_likes','article_bookmarks','comment_reports','memory_spaces','memory_media','guestbook_entries','role_assignments') order by tablename");
for(const {tablename} of tables){if(!/^[a-z_]+$/.test(tablename))throw new Error('Invalid table');const rows=query(`select * from public.${tablename}`);fs.writeFileSync(`.local/cloud-backup/${tablename}.json`,JSON.stringify(rows,null,2));console.log(`Backed up ${tablename}: ${rows.length} rows`);}
fs.writeFileSync('.local/cloud-backup/functions.json',JSON.stringify(query("select p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and (p.proname like 'rpc_%' or p.proname in ('is_admin','handle_new_user'))"),null,2));
fs.writeFileSync('.local/cloud-backup/policies.json',JSON.stringify(query("select * from pg_policies where schemaname in ('public','storage')"),null,2));
// Keep project credentials in the excluded local folder, never command arguments or stdout.
const keys=cli(['projects','api-keys','--project-ref',ref,'--reveal']);
const list=Array.isArray(keys)?keys:keys.api_keys||keys.keys;
if(!Array.isArray(list))throw new Error('Unexpected API key response; no credentials printed.');
const service=list.find(k=>k.name==='service_role');if(!service)throw new Error('Service role key unavailable.');
fs.writeFileSync('.local/cloud-service.json',JSON.stringify({url:`https://${ref}.supabase.co`,serviceKey:service.api_key}));
console.log('Cloud data/functions/policies backed up privately; project keys saved locally without printing.');
