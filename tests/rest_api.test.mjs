import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/v1.js';
import {routes} from '../server/routes.js';
process.env.SUPABASE_URL='https://rest-test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='fixture-public-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='MUST-NOT-USE';
const originalFetch=globalThis.fetch;
let calls=[],dbError=null,isAdmin=false,dbResult={success:true},userId='owner-a';
globalThis.fetch=async(input,init={})=>{
  const url=String(input),headers=new Headers(init.headers);
  assert.notEqual(headers.get('apikey'),'MUST-NOT-USE');
  calls.push({url,method:init.method||'GET',body:init.body?JSON.parse(init.body):null,authorization:headers.get('authorization')});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:userId,email:'fixture@example.test'});
  if(url.includes('/rpc/is_admin'))return Response.json(isAdmin);
  if(dbError)return Response.json(dbError,{status:400});
  return Response.json(dbResult);
};
async function request(method,path,body,token,options={}){
  const req=Readable.from(options.raw===undefined?[]:[options.raw]);
  Object.assign(req,{method,url:path,headers:{...(body===undefined&&options.raw===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body})});
  const headers={};let result;
  const res={setHeader(k,v){headers[k]=v;},end(raw){result={status:this.statusCode,body:JSON.parse(raw),headers};}};
  await handler(req,res);return result;
}
try{
  assert.equal((await request('GET','/api/v1/no-such-resource')).status,404);
  assert.equal((await request('POST','/api/v1/catalog',{})).status,405);
  assert.equal((await request('POST','/api/v1/orders',{},null,{raw:'{}'})).status,401);
  assert.equal((await request('POST','/api/v1/orders',undefined,null,{raw:'{'})).status,400);
  assert.equal((await request('POST','/api/v1/orders',undefined)).status,415);
  assert.equal((await request('POST','/api/v1/orders',{note:'x'.repeat(524289)})).status,413);
  // Every protected route is checked before business data access.
  for(const route of routes.filter(r=>r.access!=='public')){
    const path=route.pattern.source.replace(/^\^|\$$/g,'').replaceAll('\\/','/').replaceAll('([^/]+)','fixture').replace('(like|bookmark)','like');
    calls=[];
    const response=await request(route.method,'/api/v1'+path,route.method==='GET'?undefined:{});
    assert.equal(response.status,401,`${route.method} ${path}`);assert.equal(calls.length,0);
    if(route.access==='admin'){
      const response=await request(route.method,'/api/v1'+path,route.method==='GET'?undefined:{},'customer-token');
      assert.equal(response.status,403,`${route.method} ${path}`);
      assert.ok(calls.every(c=>c.url.endsWith('/user')||c.url.endsWith('/rpc/is_admin')));
    }
  }
  calls=[];
  const body={requestId:crypto.randomUUID(),customerName:'Test',phone:'0900000000',address:'Fixture',paymentMethod:'vietqr',items:[{id:'emoria-pulse',size:'S',quantity:1,price:1}],finalTotal:1,userId:'other',status:'paid'};
  dbResult={success:true,order:{id:'EMO-server',totals:{finalTotal:499000}}};
  let r=await request('POST','/api/v1/orders',body,'customer-token');assert.equal(r.status,201);
  const sent=calls.at(-1);assert.equal(sent.authorization,'Bearer customer-token');assert.equal(sent.body.p_request_id,body.requestId);
  assert.equal(sent.body.p_payload.items[0].price,undefined);assert.equal(sent.body.p_payload.finalTotal,undefined);assert.equal(sent.body.p_payload.userId,undefined);
  assert.equal((await request('POST','/api/v1/orders',{...body,requestId:''},'customer-token')).status,400);
  dbError={code:'P0001',message:'Không đủ tồn kho'};
  assert.equal((await request('POST','/api/v1/orders',body,'customer-token')).status,409);
  dbError={code:'XX000',message:'private DB details'};
  r=await request('POST','/api/v1/orders/lookup',{id:'EMO-server',token:'private-token'});
  assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('private DB details'));
  dbError=null;dbResult=[];calls=[];
  await request('GET','/api/v1/me/orders?page=1&user_id=other',undefined,'customer-token');
  assert.ok(calls.at(-1).url.includes('user_id=eq.owner-a'));
  isAdmin=true;dbResult={success:true};calls=[];
  assert.equal((await request('PUT','/api/v1/admin/orders/EMO-server/shipment',{carrier:'Test',tracking:'SHIP-123',status:'shipping'},'admin-token')).status,200);
  assert.equal(calls.at(-1).body.p_tracking,'SHIP-123');
  // Both Vite and Vercel paths dispatch the same route.
  assert.equal((await request('GET','/api/v1?resource=admin%2Forders&page=0',undefined,'admin-token')).status,200);
  calls=[];
  await request('POST','/api/v1/memories/fixture/access',{grant:'private-grant'});
  assert.equal(calls.at(-1).body.p_grant_token,'private-grant');assert.ok(!calls.at(-1).url.includes('private-grant'));
  dbError={code:'42501',message:'permission denied'};
  assert.equal((await request('PATCH','/api/v1/memories/fixture',{letter:'private'},'customer-token')).status,403);
  assert.equal(r.headers['Cache-Control'],'no-store');
  console.log('PASS REST API: all protected routes, caller JWT/RLS, idempotency payload, server pricing, tracking errors, shipping, private grants, rewrite routing');
}finally{globalThis.fetch=originalFetch;}
