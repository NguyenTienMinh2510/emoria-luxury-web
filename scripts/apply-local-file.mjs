import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const file=process.argv[2];
if(!file || !/^(supabase\/migrations|tests)\/[a-zA-Z0-9_.-]+\.sql$/.test(file))throw new Error('Expected an EMORIA migration/test SQL path.');
const result=spawnSync('docker',['exec','-i','supabase_db_emoria-sandbox','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:fs.readFileSync(file,'utf8'),encoding:'utf8',timeout:60000});
if(result.status!==0)throw new Error(result.stderr||result.error?.message);console.log(`PASS local SQL: ${file}`);
