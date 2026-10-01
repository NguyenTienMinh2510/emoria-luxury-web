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
fs.writeFileSync(localeEntry,`import React from 'react';import LanguageProvider,{translate,readLanguage,syncGoogleTranslate} from '../../src/i18n/LanguageProvider.jsx';import MemoryAccountsAdmin from '../../src/components/MemoryAccountsAdmin.jsx';import NfcOperations from '../../src/components/NfcOperations.jsx';import VideoModerationAdmin from '../../src/components/VideoModerationAdmin.jsx';import Navbar from '../../src/components/Navbar.jsx';export {translate,readLanguage,syncGoogleTranslate};export default function Fixture(){return <LanguageProvider initialLanguage="en"><Navbar/><MemoryAccountsAdmin/><NfcOperations/><VideoModerationAdmin/></LanguageProvider>;}`);
const localized=await compile(localeEntry,'locale-render');const english=render(localized.default,{});
for(const text of ['Memory Spaces &amp; accounts','NFC chips &amp; independent links','Media moderation','Show individual events','Language'])assert.ok(english.includes(text),text);
assert.equal(localized.translate('en','Xin chào {name}','Hello {name}',{name:'Sam'}),'Hello Sam');
assert.equal(localized.translate('vi','Xin chào','Hello'),'Xin chào');
globalThis.localStorage={getItem:()=> 'en'};assert.equal(localized.readLanguage(),'en');
globalThis.localStorage={getItem:()=>{throw new Error('blocked');}};assert.equal(localized.readLanguage(),'vi');delete globalThis.localStorage;
console.log('PASS i18n render: shared VI/EN context, admin spaces/chips/media and navigation, stored language and unavailable storage fallback.');
{
 const originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval;
 let scheduled=0,cleared=0;
 globalThis.window={location:{hostname:'localhost'}};
 globalThis.document={cookie:'',body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]};
 globalThis.setInterval=()=>++scheduled;globalThis.clearInterval=()=>cleared++;
 try {
  localized.syncGoogleTranslate('vi');assert.equal(scheduled,0,'Vietnamese does not poll for an unloaded translator');
  const cancel=localized.syncGoogleTranslate('en');assert.equal(scheduled,1);
  assert.equal(typeof cancel,'function');cancel();assert.equal(cleared,1,'Switching languages cancels the previous translation retry');
 } finally {globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;delete globalThis.window;delete globalThis.document;}
 console.log('PASS translation lifecycle: no initial VI polling and pending EN retry can be cancelled.');
}

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
const matchHtml=render(MemoryMatchStudio,{currentUser:'user-owner-a'});
assert.ok(matchHtml.includes('Mismatch'));
assert.ok(matchHtml.includes('Chọn Chủ Đề'), 'Match renders the topic picker');
assert.equal((matchHtml.match(/<article\b/g) || []).length,7,'A new Mismatch draft renders seven question cards');
assert.ok(matchHtml.includes('Cảm xúc &amp; Kết nối') && matchHtml.includes('Không gian sống &amp; Tương lai') && matchHtml.includes('Tình huống hóc búa'), 'Universal topic cards are visible');
assert.ok(render(MemoryMatchStudio,{}).includes('Đăng nhập để chơi'));
assert.ok(!matchHtml.includes('Nhập nội dung câu hỏi') && !matchHtml.includes('Thêm câu hỏi'), 'Old authoring form does not override topic packs');
assert.ok(matchHtml.includes('Trang chủ'), 'Match Studio header có nút Trang chủ');
assert.ok(matchHtml.includes('Quay lại kỷ vật'), 'Match Studio header có nút Quay lại kỷ vật');
assert.ok(matchHtml.includes('Chuyển sang House Studio'), 'Match Studio header có nút Chuyển sang House Studio');

const {default:MemoryHouseStudio}=await compile('src/components/MemoryHouseStudio.jsx','memory-house-studio');
const houseHtml=render(MemoryHouseStudio,{tagUid:'emo-heart',currentUser:'user-owner-a'});
assert.ok(houseHtml.includes('Ngôi Nhà Kỷ Niệm'));
assert.ok(houseHtml.includes('Quay lại kỷ vật'), 'House keeps a single return action');
assert.equal((houseHtml.match(/aria-label="Chọn phòng trong nhà 3D"/g) || []).length, 1, 'House has one room selector');
assert.ok(!houseHtml.includes('LIVE PREVIEW') && !houseHtml.includes('Chuyển sang Match Studio'), 'House removes duplicate preview and unrelated navigation');
assert.ok(houseHtml.includes('Thêm ảnh kỷ niệm') && houseHtml.includes('Xuất Bản Ngôi Nhà'), 'Core photo and publish actions remain available');
assert.ok(houseHtml.includes('Tên ngôi nhà &amp; tông màu') && houseHtml.includes('Lời nhắn của khách &amp; quyền riêng tư'), 'Optional settings remain accessible');
assert.ok(!/<details[^>]*\bopen(?:[ =>])/.test(houseHtml), 'Optional settings are collapsed initially');
assert.ok(houseHtml.includes('Ngày bắt đầu'), 'Preview có phòng beginning (Ngày bắt đầu)');
assert.ok(houseHtml.includes('Lần đầu của đôi mình'), 'Preview có phòng first (Lần đầu của đôi mình)');
assert.ok(houseHtml.includes('Điều nhỏ xíu'), 'Preview có phòng little-things (Điều nhỏ xíu)');
assert.ok(houseHtml.includes('Miền ký ức'), 'Preview có phòng memories (Miền ký ức)');
assert.ok(houseHtml.includes('Chương tiếp theo'), 'Preview có phòng next-chapter (Chương tiếp theo)');
assert.ok(houseHtml.includes('Chưa có bức ảnh'), 'Phòng chưa có ảnh có empty state rõ ràng');
assert.ok(!houseHtml.includes('via.placeholder.com'), 'Không dùng placeholder giả');
console.log('PASS event studios render: MemoryMatchStudio and MemoryHouseStudio static render without client crash, with a single room selector and core editing actions.');

// 2D furniture must be drawn; only the owner's memories may be raster images.
{
 const {DECORATIONS}=await import('../src/services/house3d.js');
 const {default:House2D}=await compile('src/components/MemoryHouse2D.jsx','memory-house-2d');
 const {default:Decor2D}=await compile('src/components/MemoryHouseDecor2D.jsx','memory-house-decor-2d');
 const renderDecor=props=>renderToStaticMarkup(React.createElement('svg',null,React.createElement(Decor2D,props)));
 const memories=Array.from({length:6},(_,i)=>({id:`photo-${i}`,photo_url:`https://signed.example/memory-${i}.jpg`,caption:`Kỷ niệm ${i}`}));
 const attachments={calendar:['photo-0'],nameplate:['photo-0'],frame:['deleted-photo'],album:['photo-0','photo-1'],bunting:['photo-2','photo-3','photo-4']};
 const rooms=[{id:'beginning',name:'Ngày bắt đầu',memories:[...memories,{id:'unsigned'}],decorations:[
  ...DECORATIONS.map(asset=>({id:asset.id,item:asset.id,surface:asset.defaultSurface,photos:attachments[asset.id],scale:asset.id==='cat'?.8:1})),
  {id:'second-cat',item:'cat',surface:'floor',scale:[.3,1.1,3]},
  {slot:'right',item:'plant'},
 ]}];
 const before=JSON.stringify(rooms);
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}};
 freeze(rooms);
 const props={rooms,activeRoomId:'beginning',onSelectRoom:()=>{},onPhoto:()=>{}};
 const html=render(House2D,props),images=[...html.matchAll(/<image\b[^>]*href="([^"]+)"/g)].map(match=>match[1]);
 assert.ok(!/NaN|Infinity/.test(html),'Both responsive views have finite coordinates and scales');
 assert.equal(render(House2D,props),html,'Missing positions must not make the illustrated layout random');
 assert.equal(JSON.stringify(rooms),before,'Illustrating rooms must not change saved data');
 assert.ok(images.length>0&&images.every(url=>memories.some(memory=>memory.photo_url===url)),'Only memory URLs appear as SVG images');
 for(const asset of DECORATIONS){
  assert.ok(html.includes(`data-decoration="${asset.id}"`),`${asset.id} is illustrated in the room`);
  assert.ok(!html.includes(asset.image)&&!html.includes(asset.reference),'Object thumbnails and references must not be pasted into 2D');
  const drawing=renderDecor({item:asset.id});
  assert.ok(drawing.includes('<path')&&!drawing.includes('<image'),`${asset.id} has a vector drawing without memory photos`);
 }
 assert.equal((html.match(/data-decoration="cat"/g)||[]).length,4,'Both responsive views retain duplicate instances');
 for(const surface of ['wall','table','floor'])assert.ok(html.includes(`data-surface="${surface}"`));
 const scalarRooms=JSON.parse(before);scalarRooms[0].decorations.find(d=>d.id==='second-cat').scale=1.1;
 assert.equal(render(House2D,{...props,rooms:scalarRooms}),html,'Vector scale uses the same illustrated height as its numeric counterpart');
 for(const [item,photos,count] of [['album',memories.slice(0,2),2],['bunting',memories.slice(2,5),3],['bunting',[memories[0],undefined,{}],1],['frame',[],0]]){
  const drawing=renderDecor({item,photos,onPhoto:()=>{}});
  assert.equal((drawing.match(/<image\b/g)||[]).length,count,`${item} keeps all valid slots and leaves missing photos as drawn placeholders`);
  assert.equal([...drawing.matchAll(/<g clip-path="url\(#[^)]+\)">([\s\S]*?)<\/g>/g)].filter(match=>match[1].includes('<image')).length,count,'Decoration photos are clipped inside the illustrated frames');
 }
 assert.ok(!html.includes('deleted-photo'),'Deleted photo attachments do not create an image');
 const clips=[...html.matchAll(/<clipPath\b[^>]*id="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(clips).size,clips.length,'Clip IDs are unique across desktop and mobile scenes');
 for(const [,id] of html.matchAll(/clip-path="url\(#([^)]*)\)"/g))assert.ok(clips.includes(id),'Every memory image clipping reference resolves');
 console.log('PASS House 2D render: 12 vector assets, framed memory slots, immutable deterministic layout, duplicates, numeric/vector scale and unique responsive clip IDs.');
}
