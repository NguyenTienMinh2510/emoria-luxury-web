import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {transform} from 'esbuild';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {act} from 'react';
import {JSDOM} from 'jsdom';
import {loadShowcaseFrames,prepareShowcaseFrames} from '../src/services/showcaseFrames.js';
import {validateStoredCart,readStoredCart,resetStoredCart,CART_STORAGE_KEY} from '../src/services/cartStorage.js';
import {fetchWithDeadline} from '../src/services/requestBudget.js';

process.env.VITE_SUPABASE_URL='https://resilience-fixture.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY='fixture-publishable-key';
const {supabase}=await import('../src/lib/supabaseClient.js');
const {apiRequest}=await import('../src/services/apiClient.js');
const auth=await import('../src/services/authRoleService.js');
const originals={fetch:globalThis.fetch,window:globalThis.window,Image:globalThis.Image,document:globalThis.document,localStorage:globalThis.localStorage,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
const originalSession=supabase.auth.getSession;
const never=()=>new Promise(()=>{}), pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitUntil=async predicate=>{const end=Date.now()+1000;while(!predicate()&&Date.now()<end)await pause(10);assert.ok(predicate(),'Expected async recovery before one second');};
try {
  let network=0;
  globalThis.fetch=async()=>{network++;return Response.json({ok:true});};
  supabase.auth.getSession=never;
  await assert.rejects(apiRequest('/catalog',{timeoutMs:10}),{name:'TimeoutError'});
  assert.equal(network,0,'Auth timeout cannot dispatch a late API request');
  const controller=new AbortController();
  const pending=apiRequest('/catalog',{timeoutMs:1000,signal:controller.signal});
  controller.abort(new DOMException('Test cancellation','AbortError'));
  await assert.rejects(pending,{name:'AbortError'});assert.equal(network,0);
  supabase.auth.getSession=async()=>({data:{session:null}});
  globalThis.fetch=async()=>({ok:true,json:never});
  await assert.rejects(apiRequest('/catalog',{timeoutMs:10}),{name:'TimeoutError'},'Body parsing belongs to the operation deadline');
  globalThis.fetch=never;
  await assert.rejects(fetchWithDeadline('/offline',{},10),{name:'TimeoutError'});
  globalThis.fetch=async()=>({arrayBuffer:never});
  await assert.rejects(fetchWithDeadline('/offline-body',{},10),{name:'TimeoutError'},'Auth response bodies cannot remain stalled after headers');
  console.log('PASS frontend request budgets: Auth, cancellation, headers and response body.');

  supabase.auth.getSession=()=>{throw new Error('Public status acquired Auth');};
  let mode=false;
  globalThis.fetch=async(url,init)=>{assert.ok(String(url).endsWith('/rest/v1/rpc/rpc_get_system_status'));assert.equal(init.headers.apikey,'fixture-publishable-key');return Response.json({success:true,is_maintenance_mode:mode});};
  assert.equal((await auth.fetchSystemStatus()).success,true);
  globalThis.fetch=async()=>{throw new Error('Offline');};
  assert.equal((await auth.fetchSystemStatus()).success,false);assert.equal(auth.getSystemAvailability().isUnavailable,true);assert.equal(auth.getSystemAvailability().isMaintenanceMode,false);
  mode=true;
  globalThis.fetch=async()=>Response.json({success:true,is_maintenance_mode:mode});
  assert.equal((await auth.fetchSystemStatus()).success,true);assert.equal(auth.getSystemAvailability().isUnavailable,false);assert.equal(auth.getSystemAvailability().isMaintenanceMode,true);
  globalThis.fetch=async()=>{throw new Error('Offline again');};
  await auth.fetchSystemStatus();assert.equal(auth.getSystemAvailability().isMaintenanceMode,true,'Confirmed maintenance is not silently reopened by an outage');
  mode=false;globalThis.fetch=async()=>Response.json({success:true,is_maintenance_mode:mode});await auth.fetchSystemStatus();assert.equal(auth.getSystemAvailability().isMaintenanceMode,false,'Recovered status reopens the view without clearing auth/session state');
  console.log('PASS anonymous status: outage, confirmed maintenance and recovery.');

  const values=new Map([['auth-token','keep'],['pending-checkout','keep']]);
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  for(const malformed of ['null','{}','[null]','broken']){values.set(CART_STORAGE_KEY,malformed);assert.deepEqual(readStoredCart(storage),[]);}
  const good={id:'emoria-pulse',name:'Pulse',quantity:2,price:100000,size:'17',image:'/pulse.webp'};
  const invalid=[null,{...good,quantity:Infinity},{...good,quantity:-1},{...good,price:NaN},{...good,name:{unexpected:true}}];
  const checked=validateStoredCart([good,...invalid]);assert.equal(checked.length,1);assert.equal(checked[0].quantity,2);
  assert.ok(validateStoredCart(Array.from({length:80},(_,i)=>({...good,id:`product-${i}`}))).length<=50);
  assert.equal(validateStoredCart([{...good,name:{unexpected:true}}])[0].name,'emoria-pulse','Objects cannot reach React as cart text');
  resetStoredCart(storage);assert.equal(values.get('auth-token'),'keep');assert.equal(values.get('pending-checkout'),'keep');
  console.log('PASS persisted cart: invalid shapes/fields/quantity, bounded rows and targeted reset.');

  class ImageFixture {
    static created=[];
    constructor(){ImageFixture.created.push(this);}
    set src(value){this.url=value;}
    removeAttribute(){this.released=true;}
    async finish(){this.naturalWidth=640;await this.onload();}
  }
  const outcomes=[];
  const loader=loadShowcaseFrames({count:4,getPath:i=>`primary-${i}`,getFallbackPath:i=>`fallback-${i}`,timeoutMs:5,ImageClass:ImageFixture,onLoad:(index,success)=>outcomes.push([index,success])});
  loader.preload();await waitUntil(()=>outcomes.length>=3);
  assert.ok(outcomes.length>=3,'Stalled images settle and release queue slots after both attempts');
  assert.ok(outcomes.every(([,success])=>success===false));loader.dispose();
  class DecodeFixture extends ImageFixture {decode(){return never();}}
  const decoding=loadShowcaseFrames({count:1,getPath:()=>'/decode',timeoutMs:5,ImageClass:DecodeFixture,onLoad:(index,success)=>outcomes.push(['decode',success])});
  decoding.preload();DecodeFixture.created.at(-1).finish();await waitUntil(()=>outcomes.at(-1)?.[0]==='decode');assert.deepEqual(outcomes.at(-1),['decode',false]);decoding.dispose();

  ImageFixture.created=[];globalThis.window={innerWidth:390};globalThis.Image=ImageFixture;
  const sequence=prepareShowcaseFrames({entryTimeoutMs:10,imageTimeoutMs:100});
  await waitUntil(()=>sequence.getSnapshot().ready);assert.equal(sequence.getSnapshot().bypassed,true,'Overall deadline permits static browsing during total asset failure');
  const initial=ImageFixture.created.length;sequence.retry();assert.ok(ImageFixture.created.length>initial,'Retry can replace in-flight images before all frames settle');sequence.dispose();
  const windowed=loadShowcaseFrames({count:150,maxCached:12,getPath:i=>`frame-${i}`,ImageClass:ImageFixture,onLoad:()=>{}});
  for(const target of [0,149,0]){
    windowed.request(target);windowed.preload(Math.max(0,target-24),Math.min(150,target+25));
    for(const image of ImageFixture.created){if(image.onload)await image.finish();}
    assert.equal(windowed.ready[target],true,'Forward/end/replay frames are drawable');
    assert.ok(windowed.ready.filter(Boolean).length<=12);
  }
  windowed.dispose();
  console.log('PASS animation recovery: image/decode/entry deadlines and bounded forward/replay cache.');

  const boundarySource=fs.readFileSync('src/components/AppRecoveryBoundary.jsx','utf8')
    .replace("'react'",JSON.stringify(pathToFileURL(path.resolve('node_modules/react/index.js')).href))
    .replace("'../services/cartStorage.js'",JSON.stringify(pathToFileURL(path.resolve('src/services/cartStorage.js')).href));
  const {code}=await transform(boundarySource,{loader:'jsx',format:'esm'});
  const {default:Boundary}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://frontend-fixture.test'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=storage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const root=createRoot(dom.window.document.getElementById('root'),{onCaughtError:()=>{}});
  values.set(CART_STORAGE_KEY,'bad');
  function Child(){if(values.has(CART_STORAGE_KEY))throw new Error('Bad cart');return React.createElement('p',null,'Recovered page');}
  await act(async()=>root.render(React.createElement(Boundary,null,React.createElement(Child))));
  assert.ok(dom.window.document.body.textContent.includes('Khôi phục giỏ hàng'));
  await act(async()=>[...dom.window.document.querySelectorAll('button')].find(button=>button.textContent==='Khôi phục giỏ hàng').click());
  assert.ok(dom.window.document.body.textContent.includes('Recovered page'));assert.equal(values.get('auth-token'),'keep');assert.equal(values.get('pending-checkout'),'keep');
  await act(async()=>root.unmount());dom.window.close();
  console.log('PASS frontend resilience: whole-operation auth/network/body deadlines and cancellation; anonymous status outage/maintenance recovery; malformed cart/root recovery; stalled image/decode deadlines; static entry bypass; bounded replay cache.');
} finally {
  supabase.auth.getSession=originalSession;await supabase.auth.stopAutoRefresh();
  for(const [key,value] of Object.entries(originals)){const target=key==='act'?'IS_REACT_ACT_ENVIRONMENT':key;if(value===undefined)delete globalThis[target];else globalThis[target]=value;}
}
