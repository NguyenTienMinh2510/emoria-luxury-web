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
const {default:NfcTools}=await compile('src/components/NfcTools.jsx','nfc-tools');
const nfcHtml=render(NfcTools,{tag:'emo-test'});
assert.ok(nfcHtml.includes('https://emoria-luxury-web.vercel.app/?tag=emo-test'));
assert.ok(nfcHtml.includes('Trình duyệt này chưa hỗ trợ'));
assert.ok(!nfcHtml.includes('Ghi link vào chip</button>'));
const {default:VideoLabelEditor}=await compile('src/components/VideoLabelEditor.jsx','video-labels');
const videoHtml=render(VideoLabelEditor,{tag:'emo-test',items:[{path:'emo-test/file',type:'video',caption:'Fixture video'}]});
assert.ok(videoHtml.includes('Video mới tự động được kiểm duyệt khi tải lên.'));
assert.ok(!videoHtml.includes('Lọc video theo nhãn'));
assert.ok(!videoHtml.includes('Nhãn chủ đề'));
const {default:VideoModerationAdmin}=await compile('src/components/VideoModerationAdmin.jsx','video-admin');
const adminVideoHtml=render(VideoModerationAdmin,{});
assert.ok(adminVideoHtml.includes('User ID, tên tác giả hoặc mã kỷ vật'));
assert.ok(adminVideoHtml.includes('Tìm kiếm'));
const fixtureOrderId='EMO-1234567890ABCDEF1234567890ABCDEF';
const memo=bankTransferMemo(fixtureOrderId);
const bankHtml=render(BankAppPayment,{bank:'970418',account:'00123456789',owner:'TEST ONLY',order:{id:fixtureOrderId,totals:{finalTotal:123000}}});
assert.ok(bankHtml.includes('ba=00123456789%40bidv'));
assert.ok(bankHtml.includes(`tn=${memo}`));
assert.ok(bankHtml.includes('Hỗ trợ điền sẵn'));
assert.ok(bankHtml.includes('Quét QR trong app'));
const {default:CommentModeration}=await compile('src/components/CommentModeration.jsx','comment-moderation');
const moderationHtml=render(CommentModeration,{onModerate:()=>{},comments:[
 {id:'pending',article_title:'Bài NFC',article_slug:'bai-nfc',article_status:'published',author_name:'Khách',created_at:'2026-09-18T00:00:00Z',content:'Chưa duyệt',status:'pending'},
 {id:'approved',article_title:'Bài NFC',article_slug:'bai-nfc',article_status:'published',author_name:'Khách',created_at:'2026-09-18T00:00:00Z',content:'Đã công khai',status:'approved'},
 {id:'hidden',article_title:'Bản nháp',article_slug:'draft',article_status:'draft',author_name:'Khách',created_at:'2026-09-18T00:00:00Z',content:'Ẩn',status:'hidden'},
 {id:'reply',parent_id:'hidden',article_title:'Bản nháp',article_status:'draft',created_at:'2026-09-18T00:00:00Z',content:'Phản hồi',status:'approved'},
]});
assert.ok(moderationHtml.includes('Chờ duyệt (1)'));
assert.ok(moderationHtml.includes('Đã duyệt (2)'));
assert.ok(moderationHtml.includes('Đã ẩn (1)'));
assert.ok(moderationHtml.includes('/?article=bai-nfc#comments'));
assert.ok(!moderationHtml.includes('/?article=draft'));
assert.ok(moderationHtml.includes('bình luận gốc cần được duyệt'));
assert.match(moderationHtml, /<button[^>]*disabled=""[^>]*>Duyệt<\/button>/);
assert.ok(render(CommentModeration,{comments:[],onModerate:()=>{}}).includes('Không có bình luận trong mục này.'));
console.log('PASS render: login/register disappear for authenticated user; charts handle empty/zero/90-day data with readable table. This is a render check, not a mobile browser test.');
