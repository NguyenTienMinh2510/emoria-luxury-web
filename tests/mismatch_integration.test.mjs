import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {build} from 'esbuild';
import {MATCH_TOPICS,QUESTION_POOL,getTopicQuestions,getRandomReplacement,recordPlayedQuestions,getPlayedQuestions,formatMatchQuestion} from '../src/services/matchQuestionBank.js';

for(const topic of MATCH_TOPICS) {
  const pool=QUESTION_POOL[topic.id];
  assert.ok(pool.length>=8);
  assert.equal(new Set(pool.map(q=>q.text)).size,pool.length);
  for(const q of pool) {
    assert.ok(q.text.length<=300 && /\{owner\}|\{partner\}/.test(q.text));
    assert.ok(!/\{owner\}|\{partner\}/.test(formatMatchQuestion(q.text,'Minh','An')));
    assert.equal(q.options.length,4);
    assert.equal(new Set(q.options).size,4);
    for(const option of q.options)assert.ok(typeof option==='string' && option.trim() && option.length<=100);
  }
  const first=getTopicQuestions(topic.id), texts=first.map(q=>q.text);
  const next=getTopicQuestions(topic.id,5,texts);
  assert.equal(next.filter(q=>!texts.includes(q.text)).length,Math.min(5,pool.length-first.length),'Unseen questions take priority');
  assert.ok(!texts.includes(getRandomReplacement(topic.id,texts).text));
  first[0].options[0]='Local edit';
  assert.ok(pool.every(q=>!q.options.includes('Local edit')));
}
recordPlayedQuestions('test-owner',['one']);assert.deepEqual(getPlayedQuestions('test-owner'),['one']);
assert.deepEqual(getPlayedQuestions('test-other'),[]);
assert.equal(formatMatchQuestion('{owner} hỏi {partner}', ' Minh ', ' An '),'Minh hỏi An');
assert.equal(formatMatchQuestion('{owner} hỏi {partner}', '{partner}', 'An'),'{partner} hỏi An','Names are literal, not recursively replaced');
assert.equal(formatMatchQuestion('{owner} hỏi {partner}', 'An', 'an'),'An (người tạo) hỏi an (người được mời)');
assert.equal(formatMatchQuestion('{owner} hỏi {partner}','',''),'[Tên người tạo] hỏi [Tên người được mời]');
console.log('PASS 200 questions: fixed names, valid strings, independent snapshots and replay rotation.');

const config=JSON.parse(fs.readFileSync('.local/supabase.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:55321','Only isolated local Supabase is allowed');
Object.assign(process.env,{SUPABASE_URL:config.API_URL,SUPABASE_PUBLISHABLE_KEY:config.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY});
const {default:handler}=await import('../api/v1.js');
const folder=path.resolve('.local/mismatch-test');fs.mkdirSync(folder,{recursive:true});
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/v1'))return handler(req,res);
  res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');
  res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(folder,'bundle.js')):'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>');
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const root=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async promise=>{const r=await promise;assert.ifError(r.error);return r.data;};
const accounts=[], sessions=[], clients=[], photos=[];let browser;
async function api(method,route,body,session=sessions[0],status=200) {
  const res=await fetch(`${origin}/api/v1${route}`,{method,headers:{...(session?{Authorization:`Bearer ${session.access_token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await res.json();assert.equal(res.status,status,`${method} ${route}: ${JSON.stringify(data)}`);return data;
}
try {
  for(let i=0;i<2;i++) {
    const email=`mismatch-${crypto.randomUUID()}@example.test`,password=crypto.randomUUID();
    const {user}=await ok(root.auth.admin.createUser({email,password,email_confirm:true}));accounts.push(user);
    const auth=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    clients.push(auth);
    sessions.push((await ok(auth.auth.signInWithPassword({email,password}))).session);
    assert.equal((await ok(root.from('memory_spaces').select('id').eq('owner_id',user.id))).length,0);
  }
  await api('POST','/events/matches',{},null,401);
  const image=fs.readFileSync('public/memoryhouse/models/thumbnails/cat.png');
  for(let i=0;i<2;i++) {
    const photo=`match_${accounts[i].id}/fixture.png`;
    await ok(clients[i].storage.from('emoria-event-media').upload(photo,image,{contentType:'image/png'}));photos.push(photo);
  }
  assert.ok((await clients[1].storage.from('emoria-event-media').download(photos[0])).error);
  assert.ok((await clients[1].storage.from('emoria-event-media').upload(`match_${accounts[0].id}/intruder.png`,image,{contentType:'image/png'})).error);
  await api('POST','/events/media/sign',{paths:[photos[0]]},sessions[1],403);
  assert.ok((await api('POST','/events/media/sign',{paths:[photos[0]]})).signed[photos[0]]);
  const rounds=[];
  for(let round=0;round<2;round++) {
    const created=await api('POST','/events/matches',{title:'Mismatch regression'},sessions[0],201);
    assert.ok(created.match_id);rounds.push(created.match_id);
    const route=`/events/matches/${created.match_id}`;
    const questions=getTopicQuestions('lifestyle',3);
    await api('GET',route+'/draft',null,sessions[1],403);
    await api('PUT',route+'/questions',{questions,expected_revision:0},sessions[1],403);
    const bad=structuredClone(questions);bad[0].options[0]=['nested array'];
    await api('PUT',route+'/questions',{questions:bad,expected_revision:0},sessions[0],422);
    bad[0].options=questions[0].options;bad[0].image_path=photos[1];
    await api('PUT',route+'/questions',{questions:bad,expected_revision:0},sessions[0],422);
    questions[0].image_path=photos[0];
    const saved=await api('PUT',route+'/questions',{questions,owner_name:'Minh',partner_name:'An',expected_revision:0});
    assert.ok(saved.draft_revision>0);
    await api('PUT',route+'/questions',{questions,expected_revision:0},sessions[0],409);
    const started=await api('POST',route+'/begin',{});assert.ok(started.invite_token);
    const invite=`?invite=${started.invite_token}`;
    let view=await api('GET',route+'/view');
    assert.equal(view.owner_name,'Minh');assert.equal(view.partner_name,'An');
    await api('PUT',route+'/questions',{questions,owner_name:'Tên khác',expected_revision:saved.draft_revision},sessions[0],422);
    assert.equal(view.other_opened_at,null);assert.equal(view.other_answered_count,0);
    await api('GET',route+'/view'+invite,null,null,403);
    await api('GET',route+'/view?invite=wrong',null,sessions[1],403);
    assert.equal((await api('GET',route+'/view'+invite)).role,'owner','Opening own link must not occupy partner role');
    assert.equal((await api('GET',route+'/view')).other_opened_at,null);
    assert.equal((await api('GET',route+'/view'+invite,null,sessions[1])).role,'partner');
    view=await api('GET',route+'/view');assert.ok(view.other_opened_at);
    await api('POST',route+'/progress',{invite_token:started.invite_token,answers:[null,1],expected_revision:0},sessions[1]);
    view=await api('GET',route+'/view');assert.equal(view.other_answered_count,1);
    assert.equal(view.other_answers,null);assert.equal(view.reveal,null);assert.equal(view.score,null);
    await api('POST',route+'/submit',{answers:[0,1,0]});
    await api('POST',route+'/submit',{invite_token:started.invite_token,answers:[0,0,0]},sessions[1]);
    view=await api('GET',route+'/view');assert.equal(view.match_count,2);assert.equal(view.reveal.length,3);
    assert.equal(view.reveal[1].is_match,false);assert.equal(view.reveal[1].owner_answer_text,questions[1].options[1]);
    const partnerView=await api('GET',route+'/view'+invite,null,sessions[1]);assert.deepEqual(partnerView.reveal,view.reveal);
    assert.equal(partnerView.questions[0].image_path,undefined);
    assert.equal((await fetch(partnerView.questions[0].image_url)).status,200);
    await api('POST',route+'/submit',{answers:[1,1,1]});
    assert.equal((await api('GET',route+'/view')).match_count,2);
  }
  assert.notEqual(rounds[0],rounds[1]);
  assert.equal((await api('GET','/events/matches')).length,2);
  assert.equal((await api('GET','/events/matches',null,sessions[1])).length,0);
  console.log('PASS real HTTP/Auth/PostgreSQL: accounts without memories, two rounds, login/ownership checks, revisions, link opened, saved count, answer secrecy and reveal.');

  if(process.argv.includes('--browser')) {
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
    const entry=path.join(folder,'entry.jsx');
    fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import MemoryMatchStudio from '../../src/components/MemoryMatchStudio.jsx';const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<MemoryMatchStudio currentUser={q.get('user')} matchId={q.get('match')} inviteToken={q.get('invite')} />);`);
    await build({entryPoints:[entry],outfile:path.join(folder,'bundle.js'),bundle:true,format:'esm',define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:config.API_URL,VITE_SUPABASE_ANON_KEY:config.ANON_KEY})},logLevel:'silent'});
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const pages=[];
    for(let i=0;i<2;i++) {
      const context=await browser.newContext({viewport:{width:390,height:844}});
      await context.addInitScript(({session})=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),{session:sessions[i]});
      pages.push(await context.newPage());
    }
    const [owner,partner]=pages,errors=[];
    owner.on('pageerror',e=>errors.push(e.message));partner.on('pageerror',e=>errors.push(e.message));
    // Starting from the completed round reproduces the reported replay bug.
    await owner.goto(`${origin}/?user=${accounts[0].id}&match=${rounds[1]}`);
    await owner.getByRole('button',{name:'Tạo lượt chơi mới'}).click();
    await owner.getByRole('button',{name:/Tình huống hóc búa/}).click();
    await owner.getByRole('button',{name:'Kích Hoạt & Lấy Link Gửi Bạn Chơi'}).click();
    await owner.getByText('Hãy nhập tên của cả hai người để câu hỏi luôn nói rõ đang hỏi về ai.').waitFor();
    await owner.getByLabel('Tên người tạo lượt chơi',{exact:true}).fill('Tên cũ');
    await owner.getByLabel('Tên người được mời',{exact:true}).fill('An');
    await owner.getByLabel('Tên người tạo lượt chơi',{exact:true}).fill('Minh');
    assert.ok((await owner.locator('article h3').allTextContents()).every(t=>/Minh|An/.test(t)&&!t.includes('{')));
    const begun=owner.waitForResponse(r=>r.url().endsWith('/begin')&&r.request().method()==='POST');
    await owner.getByRole('button',{name:'Kích Hoạt & Lấy Link Gửi Bạn Chơi'}).click();
    const active=await (await begun).json();assert.ok(active.invite_token);
    await owner.getByText('Chưa ghi nhận người cùng chơi mở link.').waitFor();
    await partner.goto(`${origin}/?user=${accounts[1].id}&match=${active.match_id}&invite=${active.invite_token}`);
    await partner.getByRole('radio').first().waitFor();
    await owner.locator('#active-match-title').waitFor();
    assert.equal(await owner.locator('#active-match-title').textContent(),await partner.locator('#active-match-title').textContent(),'Both players see the same named subject');
    await partner.reload();
    await partner.getByRole('radio').first().waitFor();
    assert.equal(await owner.locator('#active-match-title').textContent(),await partner.locator('#active-match-title').textContent(),'Names survive reload');
    await owner.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await owner.getByText('Người cùng chơi đã mở lượt chơi, chưa trả lời câu nào.').waitFor();
    await partner.getByRole('radio').first().click();
    await partner.waitForResponse(r=>r.url().endsWith('/progress') && r.status()===200);
    await owner.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await owner.getByText(/Người cùng chơi đã trả lời 1\/5 câu/).waitFor();
    // Complete both sides and replay immediately, before the autosave debounce.
    for(const page of pages) {
      for(let i=0;i<5;i++) {
        await page.getByRole('radio').first().click();
        if(i<4)await page.getByRole('button',{name:/Câu tiếp|Tiếp theo/}).click();
      }
      await page.getByRole('button',{name:/Nộp|Hoàn Thành/}).click();
    }
    await owner.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await owner.getByRole('button',{name:'Tạo lượt chơi mới'}).click();
    await owner.getByRole('button',{name:/Thấu hiểu & Quan tâm/}).click();
    await owner.getByLabel('Tên người tạo lượt chơi',{exact:true}).fill('Minh');
    await owner.getByLabel('Tên người được mời',{exact:true}).fill('Bình');
    const again=owner.waitForResponse(r=>r.url().endsWith('/begin')&&r.request().method()==='POST');
    await owner.getByRole('button',{name:'Kích Hoạt & Lấy Link Gửi Bạn Chơi'}).click();
    assert.ok((await (await again).json()).invite_token);
    assert.deepEqual(errors,[]);
    console.log('PASS Chromium mobile: completed → replay → choose topic → create link twice; two players see opened/progress/result without reloading.');
  }
} finally {
  await browser?.close();
  if(photos.length)await ok(root.storage.from('emoria-event-media').remove(photos));
  for(const user of accounts)await ok(root.auth.admin.deleteUser(user.id));
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}

