import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {sealFile,openFile} from '../scripts/lib/backupCrypto.mjs';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'emoria-backup-crypto-')),key=randomBytes(32);
try {
 for(const bytes of [0,1,65536,1048577]) {
  const source=path.join(folder,`source-${bytes}`),sealed=source+'.enc',output=source+'.out',payload=randomBytes(bytes);
  fs.writeFileSync(source,payload);await sealFile(source,sealed,key);await openFile(sealed,output,key);assert.deepEqual(fs.readFileSync(output),payload);
  await assert.rejects(openFile(sealed,output,key),/EEXIST/);assert.deepEqual(fs.readFileSync(output),payload);
  await assert.rejects(openFile(sealed,output+'.wrong-key',randomBytes(32)));assert.equal(fs.existsSync(output+'.wrong-key'),false);
  const corrupted=fs.readFileSync(sealed);corrupted[corrupted.length-1]^=1;fs.writeFileSync(sealed+'.bad',corrupted);
  await assert.rejects(openFile(sealed+'.bad',output+'.bad',key));assert.equal(fs.existsSync(output+'.bad'),false);
 }
 console.log('PASS encrypted backup roundtrip, empty files, authentication failure and existing destination protection.');
}finally{for(const name of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,name));fs.rmdirSync(folder);}
