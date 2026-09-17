import assert from 'node:assert/strict';
import handler from '../api/sepay-webhook.js';
process.env.SEPAY_WEBHOOK_KEY='test-only-'+ 'x'.repeat(32);
process.env.SEPAY_ACCOUNT_NUMBER='123456789';process.env.SEPAY_MODE='test';
process.env.VITE_SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-server-key';
const key=process.env.SEPAY_WEBHOOK_KEY,order='EMO-'+'a'.repeat(28),calls=[];
globalThis.fetch=async(url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}});};
const payload={id:123,transferType:'in',transferAmount:100000,accountNumber:'123456789',referenceCode:'REF123',content:`Thanh toan ${order}`};
async function invoke(body=payload,auth=`Apikey ${key}`,method='POST'){
 const r={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
 await handler({method,headers:{authorization:auth},body},r);assert.ok(!JSON.stringify(r).includes(key));return r;
}
assert.equal((await invoke(payload,'')).statusCode,401);assert.equal((await invoke(payload,'Apikey wrong')).statusCode,401);
assert.equal((await invoke(payload,`Apikey ${key}`,'GET')).statusCode,405);assert.equal(calls.length,0);
assert.equal((await invoke({...payload,transferType:'out'})).statusCode,200);assert.equal(calls.length,0);
assert.equal((await invoke({...payload,accountNumber:'other'})).statusCode,400);
for(const amount of [-1,0,1.5,Number.MAX_SAFE_INTEGER,'100000'])assert.equal((await invoke({...payload,transferAmount:amount})).statusCode,400);
assert.equal((await invoke('{invalid')).statusCode,400);
assert.equal((await invoke(payload)).statusCode,200);assert.equal(calls.at(-1).p_order_id,order);assert.equal(calls.at(-1).p_test,true);
await invoke({...payload,content:order.replace('-','').toUpperCase()});assert.equal(calls.at(-1).p_order_id,order);
await invoke({...payload,content:`${order} EMO-${'b'.repeat(28)}`});assert.equal(calls.at(-1).p_order_id,null);
await invoke({...payload,content:'No order reference'});assert.equal(calls.at(-1).p_order_id,null);
globalThis.fetch=async()=>new Response(JSON.stringify({message:'DB failed'}),{status:500});
assert.equal((await invoke(payload)).statusCode,503);
delete process.env.SEPAY_MODE;assert.equal((await invoke(payload)).statusCode,503);
console.log('PASS webhook: authenticated server-only processing, account and amount checks, bank memo normalization, unmatched journal, retry on DB failure, explicit test/live mode.');
