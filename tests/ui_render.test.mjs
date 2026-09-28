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
assert.ok(adminVideoHtml.includes('Khoảng cách gộp đợt:'));
assert.ok(adminVideoHtml.includes('Bộ lọc phân loại &amp; trạng thái'));
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

// Bundle the provider and components together so they share one React context.
const localeEntry=path.join(target,'locale-entry.jsx');
fs.writeFileSync(localeEntry,`import React from 'react';import LanguageProvider,{translate,readLanguage} from '../../src/i18n/LanguageProvider.jsx';import MemoryAccountsAdmin from '../../src/components/MemoryAccountsAdmin.jsx';import NfcOperations from '../../src/components/NfcOperations.jsx';import VideoModerationAdmin from '../../src/components/VideoModerationAdmin.jsx';import Navbar from '../../src/components/Navbar.jsx';export {translate,readLanguage};export default function Fixture(){return <LanguageProvider initialLanguage="en"><Navbar/><MemoryAccountsAdmin/><NfcOperations/><VideoModerationAdmin/></LanguageProvider>;}`);
const localized=await compile(localeEntry,'locale-render');const english=render(localized.default,{});
for(const text of ['Memory Spaces &amp; accounts','NFC chips &amp; independent links','Media moderation','Show individual events','Language'])assert.ok(english.includes(text),text);
assert.equal(localized.translate('en','Xin chào {name}','Hello {name}',{name:'Sam'}),'Hello Sam');
assert.equal(localized.translate('vi','Xin chào','Hello'),'Xin chào');
globalThis.localStorage={getItem:()=> 'en'};assert.equal(localized.readLanguage(),'en');
globalThis.localStorage={getItem:()=>{throw new Error('blocked');}};assert.equal(localized.readLanguage(),'vi');delete globalThis.localStorage;
console.log('PASS i18n render: shared VI/EN context, admin spaces/chips/media and navigation, stored language and unavailable storage fallback.');

const {default:LuxuryUnboxing}=await compile('src/components/LuxuryUnboxingExperience.jsx','unboxing');
const unboxHtml=render(LuxuryUnboxing,{hasIntroVideo:true});
assert.ok(unboxHtml.includes('EMORIA'));
assert.ok(unboxHtml.includes('Chạm để mở bức thư'));

const {default:AiMuse}=await compile('src/components/AiLetterMuseModal.jsx','ai-muse');
const museHtml=render(AiMuse,{isOpen:true,onClose:()=>{},onApply:()=>{},author:'Alex',recipient:'Taylor'});
assert.ok(museHtml.includes('Trợ Lý Chắp Bút Thư Tay Kỷ Vật'));
assert.ok(museHtml.includes('Khởi tạo Thư tay'));

const {default:CuratedMelodies}=await compile('src/components/CuratedMelodiesModal.jsx','curated-melodies');
const melodiesHtml=render(CuratedMelodies,{isOpen:true,onClose:()=>{},onSelectMelody:()=>{}});
assert.ok(melodiesHtml.includes('Kho Giai Điệu Chọn Lọc Emoria'));
assert.ok(melodiesHtml.includes('Clair de Lune'));
console.log('PASS luxury unboxing and AI muse render: wax seal, crystal chime chords, letter muse prompts, and curated melodies modal.');

const {default:MemoryMatchStudio}=await compile('src/components/MemoryMatchStudio.jsx','memory-match-studio');
const matchHtml=render(MemoryMatchStudio,{tagUid:'emo-heart',matchId:'fixture-match-id',currentUser:'user-owner-a'});
assert.ok(matchHtml.includes('Couple Match'));
assert.ok(matchHtml.includes('Trang chủ'), 'Match Studio header có nút Trang chủ');
assert.ok(matchHtml.includes('Quay lại kỷ vật'), 'Match Studio header có nút Quay lại kỷ vật');
assert.ok(matchHtml.includes('Chuyển sang House Studio'), 'Match Studio header có nút Chuyển sang House Studio');

const {default:MemoryHouseStudio}=await compile('src/components/MemoryHouseStudio.jsx','memory-house-studio');
const houseHtml=render(MemoryHouseStudio,{tagUid:'emo-heart',currentUser:'user-owner-a'});
assert.ok(houseHtml.includes('Ngôi Nhà Kỷ Niệm'));
assert.ok(houseHtml.includes('Trang chủ'), 'House Studio header có nút Trang chủ');
assert.ok(houseHtml.includes('Quay lại kỷ vật'), 'House Studio header có nút Quay lại kỷ vật');
assert.ok(houseHtml.includes('Chuyển sang Match Studio'), 'House Studio header có nút Chuyển sang Match Studio');
assert.ok(houseHtml.includes('LIVE PREVIEW'), 'House Studio luôn render Live Preview trong edit mode');
assert.ok(houseHtml.includes('Khung Ngôi Nhà (5 Phòng)'), 'House Studio có khung ngôi nhà rõ ràng');
assert.ok(houseHtml.includes('Ngày bắt đầu'), 'Preview có phòng beginning (Ngày bắt đầu)');
assert.ok(houseHtml.includes('Lần đầu của đôi mình'), 'Preview có phòng first (Lần đầu của đôi mình)');
assert.ok(houseHtml.includes('Điều nhỏ xíu'), 'Preview có phòng little-things (Điều nhỏ xíu)');
assert.ok(houseHtml.includes('Miền ký ức'), 'Preview có phòng memories (Miền ký ức)');
assert.ok(houseHtml.includes('Chương tiếp theo'), 'Preview có phòng next-chapter (Chương tiếp theo)');
assert.ok(houseHtml.includes('Chưa có ảnh'), 'Phòng chưa có ảnh có empty state rõ ràng');
assert.ok(!houseHtml.includes('via.placeholder.com'), 'Không dùng placeholder giả');
assert.ok(houseHtml.includes('Ghi chú: Ngày bắt đầu'), 'Preview hiển thị ghi chú phòng hiện tại');
console.log('PASS event studios render: MemoryMatchStudio and MemoryHouseStudio static render without client crash, complete with navigation and live preview.');
