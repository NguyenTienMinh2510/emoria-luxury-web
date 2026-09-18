import assert from 'node:assert/strict';
import {BANK_APPS,bankTransferLink,bankTransferMemo} from '../src/services/bankTransfer.js';
const fullOrder='EMO-1234567890ABCDEF1234567890ABCDEF';
const memo=bankTransferMemo(fullOrder);
assert.equal(memo,'EMO1234567890ABCDEF1234');
const input={app:'bidv',bank:'970418',account:'00123456789',owner:'NGUYEN VAN A',amount:499000,memo,returnUrl:'https://emoria.example/?payment=return&orderId=EMO-123'};
for(const bank of ['bidv','970418'])for(const app of BANK_APPS){
  const url=new URL(bankTransferLink({...input,bank,app:app.id}));
  assert.equal(url.origin,'https://dl.vietqr.io');
  assert.equal(url.searchParams.get('ba'),'00123456789@bidv');
  assert.equal(url.searchParams.get('tn'),input.memo);
  assert.match(url.searchParams.get('tn'),/^EMO[A-Z0-9]{20}$/);
  assert.equal(url.searchParams.get('am'),'499000');
  assert.equal(url.searchParams.get('bn'),input.owner);
  assert.equal(url.searchParams.get('url'),input.returnUrl);
}
assert.equal(new URL(bankTransferLink({...input,bank:'970415',app:'mb'})).searchParams.get('ba'),'00123456789@icb');
for(const change of [{bank:'123456'},{app:'evil'},{amount:-1},{amount:0},{amount:0.5},{amount:Infinity},{account:'123@other'},{memo:'EMO-12345678901234567890'}])assert.equal(bankTransferLink({...input,...change}),null);
assert.equal(BANK_APPS.find(b=>b.id==='vcb').autofill,undefined);
assert.ok(BANK_APPS.find(b=>b.id==='mb').autofill);
console.log('PASS bank transfer: recipient codes, exact EMO memo, amount, return URL, invalid data and app capabilities');
