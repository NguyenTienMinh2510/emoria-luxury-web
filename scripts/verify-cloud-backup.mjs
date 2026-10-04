import fs from 'node:fs';
import path from 'node:path';
import {openFile,fileHash} from './lib/backupCrypto.mjs';
const folder=path.resolve(process.argv[2]||'');
if(!fs.existsSync(path.join(folder,'index.json')))throw new Error('Select a complete encrypted backup directory.');
const index=JSON.parse(fs.readFileSync(path.join(folder,'index.json'),'utf8'));
if(!index.complete||fs.existsSync(path.join(folder,'failed.json')))throw new Error('Backup is incomplete.');
const key=Buffer.from(JSON.parse(fs.readFileSync(path.resolve('.local/backup-key.json'),'utf8')).key,'base64');
const temp=fs.mkdtempSync(path.resolve('.local/backup-verify-'));
const safe=name=>{if(!/^[0-9]{6}\.enc$/.test(name))throw new Error('Invalid archive manifest.');return path.join(folder,name);};
try {
 const manifestPath=path.join(temp,'manifest');await openFile(safe(index.manifestFile),manifestPath,key);
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(!manifest.complete||manifest.project!==index.project)throw new Error('Manifest mismatch.');
 let checked=0;
 for(const entry of [...manifest.database,...manifest.storage.map(o=>o.backup)]) {
  const output=path.join(temp,`verified-${checked++}`);await openFile(safe(entry.file),output,key);
  if(fs.statSync(output).size!==entry.bytes||await fileHash(output)!==entry.sha256)throw new Error('Backup integrity failed.');
  fs.unlinkSync(output);
 }
 console.log(JSON.stringify({verified:true,encryptedEntries:checked,storageObjects:manifest.storage.length,databaseArchives:manifest.database.map(e=>e.label),project:manifest.project}));
}finally{for(const name of fs.readdirSync(temp))fs.unlinkSync(path.join(temp,name));fs.rmdirSync(temp);}
