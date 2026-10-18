import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.VITE_SUPABASE_URL = 'https://guest-house-fixture.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'fixture-publishable-key';
const {supabase} = await import('../src/lib/supabaseClient.js');
const service = await import('../src/services/eventService.js');
const {resolveCurrentSessionRole} = await import('../src/services/authRoleService.js');
const sources = Object.fromEntries(['App', 'components/AuthDialog', 'components/MemoryHouseStudio', 'views/AdminView'].map(file => [file.split('/').at(-1), fs.readFileSync(`src/${file}.jsx`, 'utf8')]));
const originalFetch = globalThis.fetch;
const originalSession = supabase.auth.getSession;

// Exercise the same handler bodies the components bind to their buttons, with isolated dependencies.
function handler(source, name) {
  const match = source.match(new RegExp(`const ${name} = (?:async )?\\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\};`));
  assert.ok(match, `Handler ${name} exists`);
  return match[1];
}
async function run(body, scope) {
  return new Function(...Object.keys(scope), `return (async () => {${body}})();`)(...Object.values(scope));
}

try {
  const calls = [];
  let session = {access_token:'guest-token', user:{id:'anonymous-uid', is_anonymous:true}};
  supabase.auth.getSession = async () => ({data:{session}});
  globalThis.fetch = async (url, init) => {
    calls.push({url, method:init.method, body:init.body, token:init.headers.Authorization});
    if (url.endsWith('/status')) return Response.json({enabled:true});
    if (url.endsWith('/open')) return Response.json({tag_uid:'guest-house-1'});
    if (url.endsWith('/me/session')) return Response.json({isAdmin:false, profile:{full_name:'Registered owner'}});
    return Response.json({enabled:false});
  };
  assert.deepEqual(await service.getGuestHouseStatus(), {enabled:true});
  assert.deepEqual(calls.pop(), {url:'/api/v1/events/guest-house/status', method:'GET', body:undefined, token:undefined});
  assert.deepEqual(await service.openGuestHouse(), {tag_uid:'guest-house-1'});
  assert.deepEqual(calls.pop(), {url:'/api/v1/events/guest-house/open', method:'POST', body:'{}', token:'Bearer guest-token'});
  await service.setGuestHouseEnabled(false);
  assert.deepEqual(calls.pop(), {url:'/api/v1/admin/system/guest-house', method:'PATCH', body:'{"enabled":false}', token:'Bearer guest-token'});

  assert.deepEqual(await resolveCurrentSessionRole(), {role:'guest', user:null, isAdmin:false, isAnonymous:true, anonymousUserId:'anonymous-uid'});
  assert.equal(calls.length, 0, 'Anonymous sessions never query admin/profile endpoints');
  session = null;
  assert.equal((await resolveCurrentSessionRole()).user, null);
  session = {user:{id:'anonymous-uid', email:'owner@example.test', is_anonymous:false}};
  const upgraded = await resolveCurrentSessionRole();
  assert.equal(upgraded.user.id, 'anonymous-uid');
  assert.equal(upgraded.user.fullName, 'Registered owner');
  assert.equal(upgraded.isAdmin, false);
  globalThis.fetch = async () => Response.json({error:{code:'GUEST_EVENT_CLOSED', message:'closed'}}, {status:403});
  await assert.rejects(service.openGuestHouse(), {code:'GUEST_EVENT_CLOSED', status:403});
  console.log('PASS guest API contract: public status, authenticated open/admin toggle, closed error; anonymous display and UID retained on upgrade.');

  const app = sources.App;
  const opening = handler(app, 'handleOpenGuestHouse');
  for (const existing of [null, {user:{id:'anonymous-uid', is_anonymous:true}}, {user:{id:'member-uid'}}]) {
    const effects = [];
    const scope = {
      guestHouseOpening:{current:false}, setOpeningGuestHouse:value=>effects.push(['busy',value]), setGuestHouseError:value=>effects.push(['error',value]),
      supabase:{auth:{getSession:async()=>({data:{session:existing}}), signInAnonymously:async()=>{effects.push(['anonymous']);return {error:null};}}},
      openGuestHouse:async()=>{effects.push(['open']);return {tag_uid:'guest-house-1'};},
      refreshSessionRole:async()=>effects.push(['refresh']), navigateTo:view=>{effects.push(['navigate',view]);return true;},
      setCurrentTag:tag=>effects.push(['tag',tag]), setHouseShareId:value=>effects.push(['share',value]), window:{scrollTo:()=>{}},
    };
    await run(opening, scope);
    assert.equal(effects.filter(([name])=>name==='anonymous').length, existing ? 0 : 1);
    assert.ok(effects.find(([name,value])=>name==='navigate' && value==='memory-house'));
    assert.ok(effects.find(([name,value])=>name==='tag' && value==='guest-house-1'));
    assert.equal(scope.guestHouseOpening.current, false);
    effects.length = 0;
    scope.openGuestHouse = async()=>{throw Object.assign(new Error('closed'), {code:'GUEST_EVENT_CLOSED', status:403});};
    await run(opening, scope);
    assert.ok(effects.find(([name,value])=>name==='error' && value.includes('đã đóng')));
    assert.ok(!effects.find(([name])=>name==='navigate'));
    scope.guestHouseOpening.current = true;
    effects.length = 0;
    await run(opening, scope);
    assert.deepEqual(effects, [], 'Repeated clicks cannot create multiple anonymous sessions');
    scope.guestHouseOpening.current = false;
    scope.supabase.auth.signInAnonymously = async()=>({error:new Error('Anonymous sign-in disabled')});
    if (!existing) {
      effects.length = 0;
      await run(opening, scope);
      assert.ok(effects.find(([name,value])=>name==='error' && value==='Anonymous sign-in disabled'));
      assert.ok(!effects.find(([name])=>name==='navigate'));
    }
  }
  assert.ok(app.includes('{guestHouseEnabled && <section'));
  const houseProps = app.slice(app.indexOf('<MemoryHouseStudio'), app.indexOf('</main>'));
  assert.ok(houseProps.includes('currentUser={authSession.user?.id || authSession.anonymousUserId || null}'));
  assert.ok(houseProps.includes("key={`${authSession.user?.id || authSession.anonymousUserId || 'guest'}"), 'Account upgrade with the same UID must preserve the mounted editor');
  assert.ok(app.slice(app.indexOf('const refreshSessionRole'), app.indexOf('// Save cart')).includes('setCurrentUser(null)'));
  assert.ok(app.includes('onLoginSuccess={refreshSessionRole}'));
  console.log('PASS guest entry: missing/existing anonymous/registered session, closed event, auth failure, duplicate click and editor identity.');

  const submit = handler(sources.AuthDialog, 'submitAuth');
  for (const anonymous of [true, false]) {
    const effects = [];
    const authUser = {id:'same-uid', is_anonymous:anonymous, email:'owner@example.test', user_metadata:{full_name:'Owner'}};
    const scope = {
      e:{preventDefault(){}}, busy:false, mode:'register', email:' owner@example.test ', password:'Password123!', name:' Owner ',
      setBusy:value=>effects.push(['busy',value]), setError:value=>effects.push(['error',value]), setMessage:value=>effects.push(['message',value]),
      setPassword:value=>effects.push(['password',value]), setMode:()=>{}, isSupabaseConfigured:()=>true,
      window:{location:{origin:'https://emoria.test'}, confirm:()=>false},
      onLoginSuccess:()=>effects.push(['success']), onClose:()=>effects.push(['close']),
      supabase:{auth:{
        getSession:async()=>({data:{session:{user:authUser}}}),
        updateUser:async payload=>{effects.push(['update',payload]);return {data:{user:authUser}, error:null};},
        signUp:async payload=>{effects.push(['signup',payload]);return {data:{user:authUser,session:null}, error:null};},
        signInWithPassword:async payload=>{effects.push(['login',payload]);return {data:{user:authUser}, error:null};},
      }},
    };
    await run(submit, scope);
    assert.equal(effects.some(([name])=>name==='signup'), !anonymous);
    assert.equal(effects.some(([name])=>name==='update'), anonymous);
    if (anonymous) {
      assert.deepEqual(effects.find(([name])=>name==='update')[1], {email:'owner@example.test', password:'Password123!', data:{full_name:'Owner'}});
      assert.ok(effects.find(([name,value])=>name==='message' && value.includes('xác minh') && value.includes('giữ lại')));
      assert.ok(!effects.some(([name])=>name==='close'));
      effects.length = 0;
      scope.supabase.auth.updateUser = async()=>({error:new Error('Email already registered')});
      await run(submit, scope);
      assert.ok(effects.find(([name,value])=>name==='error' && value==='Email already registered'));
      assert.ok(!effects.some(([name])=>name==='signup'), 'Failed upgrade must never replace the anonymous UID');
    }
    scope.mode = 'login'; effects.length = 0;
    await run(submit, scope);
    assert.equal(effects.some(([name])=>name==='login'), !anonymous, 'Anonymous login cancellation preserves the device session');
    scope.window.confirm = message=>{assert.ok(message.includes('không gộp'));return true;}; effects.length = 0;
    await run(submit, scope);
    assert.ok(effects.some(([name])=>name==='login'));
    assert.ok(effects.some(([name])=>name==='success'));
    assert.ok(effects.some(([name])=>name==='close'));
  }
  console.log('PASS registration: anonymous upgrade (no signUp), confirmation message, upgrade error; regular signup; cancelled/confirmed anonymous and regular login.');

  const house = sources.MemoryHouseStudio;
  const requireBody = handler(house, 'requireAccount');
  const message = 'Đăng nhập/đăng ký để tải ảnh & chia sẻ; ngôi nhà của bạn sẽ được giữ lại';
  const gate = new Function('isAnonymous', 'onOpenAuth', 'setError', 'setIsPostcardModalOpen', `return () => {${requireBody}};`);
  for (const name of ['handlePublish','handleUnpublish','handleRevokeShare','handleCopyShareLink','handleSharePostcard','handleDownloadPostcard']) {
    let opened = 0;
    const requireAccount = gate(true, value=>{assert.equal(value,message);opened++;}, ()=>assert.fail('Auth callback should handle prompt'), ()=>{});
    await run(handler(house,name), {requireAccount});
    assert.equal(opened, 1, `${name} must prompt before capture, upload, publish, clipboard or download`);
  }
  const postcard = house.match(/const openPostcardModal = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/)[1];
  let opened = 0;
  await run(postcard, {requireAccount:gate(true, ()=>opened++, ()=>{}, ()=>{})});
  assert.equal(opened,1,'Panorama/room/postcard entry prompts before displaying a portal over AuthModal');
  assert.equal(gate(false, ()=>assert.fail('Registered account was blocked'), ()=>{}, ()=>{})(), false);
  const errorBody = house.match(/function houseErrorMessage\(error, fallback = [^\n]*\) \{([\s\S]*?)\n\}/)[1];
  const errorMessage = new Function('error','fallback',errorBody);
  assert.ok(errorMessage({code:'GUEST_EVENT_CLOSED',message:'RPC failed'}).includes('chỉ xem'));
  assert.equal(errorMessage({message:'offline'}), 'offline');
  assert.equal(errorMessage(null,'fallback'), 'fallback');
  assert.ok(house.includes("draftErr.code === 'GUEST_EVENT_CLOSED'"), 'Closed event must not fall back to public data');
  assert.ok(house.includes('setError(houseErrorMessage(err))'), 'Autosave failures translate closed-event errors');
  console.log('PASS House gates: publish/unpublish/revoke/copy, all postcard image/share entry points, registered bypass and closed-event feedback.');

  const toggle = handler(sources.AdminView,'handleToggleGuestHouse');
  for (const enabled of [true,false]) {
    const effects = [];
    const scope = {
      guestHouseBusy:false, guestHouseEnabled:enabled,
      window:{confirm:message=>{assert.ok(message.includes('xóa vĩnh viễn') && message.includes('anonymous'));return false;}},
      setGuestHouseBusy:value=>effects.push(['busy',value]), setGuestHouseEnabled:value=>effects.push(['enabled',value]),
      updateGuestHouseEnabled:async value=>effects.push(['patch',value]), setSaveMessage:value=>effects.push(['message',value]), onRefresh:()=>effects.push(['refresh']),
    };
    await run(toggle, scope);
    assert.equal(effects.some(([name])=>name==='patch'), !enabled, 'Only disabling requires confirmation');
    effects.length = 0; scope.window.confirm = ()=>true;
    await run(toggle, scope);
    assert.ok(effects.some(([name,value])=>name==='patch' && value===!enabled));
    assert.ok(effects.some(([name,value])=>name==='enabled' && value===!enabled));
    effects.length = 0; scope.updateGuestHouseEnabled = async()=>{throw new Error('Permission denied');};
    await run(toggle, scope);
    assert.ok(!effects.some(([name])=>name==='enabled'));
    assert.ok(effects.some(([name,value])=>name==='message' && value==='Permission denied'));
    assert.deepEqual(effects.at(-1), ['busy',false]);
  }
  console.log('PASS admin toggle: enable, destructive disable confirmation/cancellation, API failure preserves state.');
} finally {
  globalThis.fetch = originalFetch;
  supabase.auth.getSession = originalSession;
}
