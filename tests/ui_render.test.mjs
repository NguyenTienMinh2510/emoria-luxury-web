import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import React from 'react';
import {bankTransferMemo} from '../src/services/bankTransfer.js';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
const target=path.resolve('.local/ui-render');fs.mkdirSync(target,{recursive:true});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
async function compile(file,name){
 const outfile=path.join(target,name+'.mjs');
 await build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':'{}'},logLevel:'silent'});
 return import(pathToFileURL(outfile).href+'?'+Date.now());
}
const {default:Hero}=await compile('src/components/HeroSection.jsx','hero');
const guest=render(Hero,{onOpenAuth:()=>{}}),signed=render(Hero,{currentUser:'Người thử nghiệm',onOpenAuth:()=>{}});
assert.ok(guest.includes('>Đăng nhập<')&&guest.includes('>Đăng ký<'));
assert.ok(!signed.includes('>Đăng nhập<')&&!signed.includes('>Đăng ký<'));
assert.ok(signed.includes('Tài khoản của bạn'));
const {Trend,Bars,dailyTrend}=await compile('src/components/MarketingPanel.jsx','marketing');
const series=dailyTrend({metricHeaders:[{name:'sessions'}],metadata:{timeZone:'Asia/Bangkok'},rows:[{dimensionValues:[{value:'20260915'}],metricValues:[{value:'12'}]}]},'sessions',7,'2026-09-15T20:00:00Z');
assert.equal(series.length,7);assert.deepEqual(series.at(-1),{label:'15/09/2026',value:12});assert.equal(series[0].value,0);
assert.ok(!render(Trend,{rows:[],label:'Phiên'}).includes('<svg'));
assert.ok(render(Trend,{rows:[],label:'Phiên'}).includes('Chưa có dữ liệu'));
for(const rows of [[{label:'01/09',value:0}],Array.from({length:90},(_,i)=>({label:String(i),value:i*2}))]){
 const html=render(Trend,{rows,label:'Phiên'});assert.ok(html.includes('<svg'));assert.ok(html.includes('<table'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));
}
assert.ok(render(Bars,{rows:[{label:'Điện thoại',value:0}],label:'Người dùng'}).includes('width:0%'));
const {default:BankAppPayment}=await compile('src/components/BankAppPayment.jsx','bank-payment');
const fixtureOrderId='EMO-1234567890ABCDEF1234567890ABCDEF';
const memo=bankTransferMemo(fixtureOrderId);
const bankHtml=render(BankAppPayment,{bank:'970418',account:'00123456789',owner:'TEST ONLY',order:{id:fixtureOrderId,totals:{finalTotal:123000}}});
assert.ok(bankHtml.includes('ba=00123456789%40bidv'));
assert.ok(bankHtml.includes(`tn=${memo}`));
assert.ok(bankHtml.includes('Hỗ trợ điền sẵn'));
assert.ok(bankHtml.includes('Quét QR trong app'));
console.log('PASS render: login/register disappear for authenticated user; charts handle empty/zero/90-day data with readable table. This is a render check, not a mobile browser test.');
