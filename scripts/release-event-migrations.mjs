import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const ref='svbmupgifhafrehdfomx';
const files=[
  '20260928170000_memory_house_decorations.sql',
  '20260928175012_event_media_owner_storage.sql',
  '20260929033824_match_draft_validation.sql',
  '20260929042933_event_analytics_and_moderation.sql',
  '20260929051500_event_studios_fixes.sql',
  '20260929060533_event_studios_completion.sql',
  '20260929125701_fix_event_analytics_schema.sql',
  '20260929190000_freeform_house_decorations.sql',
  '20260929200000_freeform_house_decorations_v2.sql'
];
function query(args){
  const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',ref,...args],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(r.status!==0)throw new Error(r.error?.message || r.stderr + '\n' + r.stdout);
  return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
}
const rows=query(['select version from supabase_migrations.schema_migrations']).rows;
const applied=new Set(rows.map(r=>r.version));
if(!applied.has('20260928072518'))throw Error('Expected existing event baseline');
const pending=files.filter(f=>!applied.has(f.slice(0,14)));
console.log('Missing event migrations:',pending);
if(!pending.length)process.exit(0);
fs.mkdirSync('.local/event-release',{recursive:true});
const snapshot=query(["select p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and (p.proname like 'rpc_house_%' or p.proname like 'rpc_match_%' or p.proname like '%event%' or p.proname='validate_house_decorations')"]);
fs.writeFileSync(`.local/event-release/functions-${Date.now()}.json`,JSON.stringify(snapshot.rows,null,2));
let sql="BEGIN;\nSET LOCAL lock_timeout='10s';\nSET LOCAL statement_timeout='60s';\n";
for(const file of pending){
  const version=file.slice(0,14),name=file.slice(15,-4);
  const body=fs.readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^BEGIN;\s*/m,'').replace(/^COMMIT;\s*$/m,'');
  sql+=`\n-- ${file}\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}');\n`;
}
sql+="NOTIFY pgrst,'reload schema';\n";
const apply=process.argv.includes('--apply');
const output=`.local/event-release/${apply?'apply':'check'}.sql`;
fs.writeFileSync(output,sql+(apply?'COMMIT;':'ROLLBACK;'));
query(['-f',output]);
console.log(apply?'APPLIED atomically; migration history recorded.':'PASS production transactional validation; all changes rolled back.');
