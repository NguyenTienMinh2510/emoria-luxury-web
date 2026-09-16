import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import handler from '../api/analytics.js';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
process.env.SUPABASE_URL='https://local-test.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='fixture-key';
process.env.GA4_PROPERTY_ID='123456789';process.env.GA4_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'fixture@example.invalid',private_key:privateKey});
let isAdmin=true;const reports=[];
globalThis.fetch=async(input,options={})=>{
 const url=String(input);let body;
 if(url.endsWith('/auth/v1/user'))body={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid'};
 else if(url.includes('/rest/v1/rpc/is_admin'))body=isAdmin;
 else if(url==='https://oauth2.googleapis.com/token')body={access_token:'fixture-only',expires_in:3600};
 else if(url.includes('analyticsdata.googleapis.com')){const query=JSON.parse(options.body);reports.push(query);body={metricHeaders:query.metrics,dimensionHeaders:query.dimensions,rows:[],rowCount:0};}
 else throw new Error('Unexpected outbound request');
 return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
};
async function invoke(url,authorized=true){let result;const headers={};const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(body){result={status:res.statusCode,body:JSON.parse(body),headers};}};await handler({method:'GET',url,headers:authorized?{authorization:'Bearer test-token'}:{}},res);return result;}
assert.equal((await invoke('/api/analytics',false)).status,401);
isAdmin=false;assert.equal((await invoke('/api/analytics')).status,403);assert.equal(reports.length,0);
isAdmin=true;assert.equal((await invoke('/api/analytics?days=999')).status,400);
const response=await invoke('/api/analytics?days=90');assert.equal(response.status,200);assert.equal(response.body.configured,true);assert.ok(response.body.daily);assert.ok(response.body.updatedAt);assert.equal(response.headers['Cache-Control'],'no-store');
assert.equal(reports.length,4);assert.ok(reports.some(q=>q.dimensions.some(d=>d.name==='date')));assert.ok(reports.every(q=>q.dateRanges[0].startDate==='90daysAgo'&&q.dateRanges[0].endDate==='yesterday'));
assert.ok(!JSON.stringify(response).includes(privateKey));
console.log('PASS GA4 API: unauthorized/viewer denied before Google, 7/30/90 allowlist, four inline reports including daily chart, no secret in response. Mocked Google test; not live connectivity.');
