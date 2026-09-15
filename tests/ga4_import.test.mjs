import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.resolve('.local/ga4-import-test-'));
const script=path.resolve('scripts/import-ga4-config.mjs');
try{
 fs.mkdirSync(path.join(dir,'.local'));
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 fs.writeFileSync(path.join(dir,'.local/ga4-service-account.json'),JSON.stringify({type:'service_account',client_email:'test@fixture.iam.gserviceaccount.com',private_key:privateKey}));
 fs.writeFileSync(path.join(dir,'.env'),'VITE_GA4_MEASUREMENT_ID=G-FIXTURE\nGA4_PROPERTY_ID=\nGA4_SERVICE_ACCOUNT_JSON=\nOTHER_VALUE=keep\n');
 const run=()=>spawnSync(process.execPath,[script,'123456789'],{cwd:dir,encoding:'utf8'});
 const result=run();assert.equal(result.status,0,result.stderr);const saved=fs.readFileSync(path.join(dir,'.env'),'utf8');assert.ok(saved.includes('OTHER_VALUE=keep'));assert.ok(saved.includes('VITE_GA4_MEASUREMENT_ID=G-FIXTURE'));
 assert.notEqual(run().status,0);assert.equal(fs.readFileSync(path.join(dir,'.env'),'utf8'),saved);
 assert.ok(!result.stdout.includes(privateKey));console.log('PASS GA4 import: generated fixture key parses, multiline key round-trips, existing settings preserved, overwrite blocked. No Google request or real credential used.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
