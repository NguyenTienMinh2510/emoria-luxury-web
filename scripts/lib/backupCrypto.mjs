import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
const MAGIC=Buffer.from('EMORIA-BACKUP-1\n');
export async function sealFile(source,target,key) {
  if(key.length!==32)throw new Error('Backup key must contain 32 bytes.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const output=fs.createWriteStream(target,{flags:'wx',mode:0o600});
  output.write(Buffer.concat([MAGIC,iv]));
  await pipeline(fs.createReadStream(source),cipher,output,{end:false});
  output.end(cipher.getAuthTag());
  await new Promise((resolve,reject)=>{output.once('finish',resolve);output.once('error',reject);});
  return {bytes:fs.statSync(source).size,sha256:await fileHash(source)};
}
export async function openFile(source,target,key) {
  const handle=fs.openSync(source,'r'),size=fs.fstatSync(handle).size;
  try {
    if(size<MAGIC.length+12+16)throw new Error('Invalid backup container.');
    const header=Buffer.alloc(MAGIC.length+12),tag=Buffer.alloc(16);
    fs.readSync(handle,header,0,header.length,0);fs.readSync(handle,tag,0,16,size-16);
    if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Invalid backup container.');
    const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(MAGIC.length));decipher.setAuthTag(tag);
    const fd=fs.openSync(target,'wx',0o600);
    const encrypted=size===header.length+16?Readable.from([]):fs.createReadStream(source,{start:header.length,end:size-17});
    try {await pipeline(encrypted,decipher,fs.createWriteStream(target,{fd,autoClose:true}));}
    catch(error){if(fs.existsSync(target))fs.unlinkSync(target);throw error;}
  }finally{fs.closeSync(handle);}
}
export async function fileHash(file) {
  const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
