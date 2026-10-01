import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Run each mode in isolation: the service captures environment at import time.
const scenarios = [
  ['demo availability and grants', false, `
    const m = await import('./src/services/memoryService.js');
    const tag = 'emoria-pulse';
    assert.equal((await m.fetchMemoryView(tag, 'grant-valid')).data.letter, null);
    const pin = await m.verifyMemoryPin(tag, '1000');
    assert.equal(pin.success, true);
    assert.ok((await m.fetchMemoryView(tag)).data.letter);
    await m.updateMemoryAvailability(tag, { status: 'suspended' });
    assert.equal((await m.fetchMemoryView(tag)).success, false);
    assert.equal((await m.verifyMemoryPin(tag, '1000')).success, false);
    await m.updateMemoryAvailability(tag, { status: 'timed_lock', unlockDate: '2999-01-01T00:00:00Z' });
    assert.equal((await m.fetchMemoryView(tag)).success, false);
    await m.updateMemoryAvailability(tag, { status: 'timed_lock' });
    assert.equal((await m.fetchMemoryView(tag)).success, false);
    await m.updateMemoryAvailability(tag, { status: 'timed_lock', unlockDate: '2000-01-01T00:00:00Z' });
    assert.equal((await m.fetchMemoryView(tag)).success, true);
    await m.updateMemorySpace(tag, { pin_action: 'SET', pin_code: '2468' });
    assert.equal((await m.fetchMemoryView(tag, pin.grant_token)).data.letter, null);
    assert.equal((await m.verifyMemoryPin(tag, '1000')).success, false);
    assert.equal((await m.verifyMemoryPin(tag, '2468')).success, true);
  `],
  ['degraded media preserves letters and hides unavailable files', true, `
    const {supabase}=await import('./src/lib/supabaseClient.js');
    const m=await import('./src/services/memoryService.js');
    supabase.auth.getSession=async()=>({data:{session:null}});
    globalThis.fetch=async url=>Response.json(url==='/api/memory-media'
      ?{urls:{},blocked:['emo-test/video'],unavailable:['emo-test/photo'],warning:'Media unavailable'}
      :{success:true,is_owner:true,is_unlocked:true,letter:'Private letter',intro_video_path:'emo-test/video',audio_url:'storage://emo-test/song',media_gallery:[{type:'image',url:'storage://emo-test/photo'},{type:'video',url:'storage://emo-test/video'}]});
    const result=await m.fetchMemoryView('emo-test');
    assert.equal(result.success,true);assert.equal(result.data.letter,'Private letter');
    assert.deepEqual(result.data.media_gallery,[]);assert.equal(result.data.intro_video_url,null);
    assert.equal(result.data.audio_url,undefined);assert.equal(result.data.media_warning,'Media unavailable');
    assert.deepEqual(result.data.studio_media.map(item=>item.path),['emo-test/photo','emo-test/video'],'Studio preserves saved media even when playback fails');
    assert.equal(result.data.intro_video_path,'emo-test/video');assert.equal(result.data.audio_path,'storage://emo-test/song');
  `],
  ['combined media uses one request and preserves saved Studio paths', true, `
    const {supabase}=await import('./src/lib/supabaseClient.js');
    const m=await import('./src/services/memoryService.js');
    supabase.auth.getSession=async()=>({data:{session:null}});
    let calls=0;
    globalThis.fetch=async url=>{
      calls++;assert.equal(url,'/api/v1/memories/emo-test/access');
      return Response.json({success:true,is_owner:true,is_unlocked:true,letter:'Authorized letter',audio_url:'storage://emo-test/song',media_gallery:[{type:'image',url:'storage://emo-test/photo'},{type:'video',url:'storage://emo-test/pending'}],media_signing:{urls:{'emo-test/photo':'https://signed.example/photo','emo-test/song':'https://signed.example/song'},blocked:['emo-test/pending'],warning:null}});
    };
    const result=await m.fetchMemoryView('emo-test');
    assert.equal(calls,1);assert.equal(result.success,true);assert.equal(result.data.letter,'Authorized letter');
    assert.equal(result.data.media_gallery.length,1);assert.equal(result.data.media_gallery[0].url,'https://signed.example/photo');
    assert.deepEqual(result.data.studio_media.map(item=>item.path),['emo-test/photo','emo-test/pending']);
    assert.equal(result.data.audio_url,'https://signed.example/song');assert.equal(result.data.audio_path,'storage://emo-test/song');
  `],
  ['maintenance RPC and REST fallback preserve fail-closed behavior', true, `
    const {supabase}=await import('./src/lib/supabaseClient.js');
    const auth=await import('./src/services/authRoleService.js');
    supabase.auth.getSession=async()=>{throw new Error('Public status must not wait for Auth');};
    let rpcCalls=0,restCalls=0;
    supabase.rpc=()=>({abortSignal:async signal=>{rpcCalls++;assert.ok(signal instanceof AbortSignal);return {data:{success:true,is_maintenance_mode:true,maintenance_message:'Planned maintenance'},error:null};}});
    globalThis.fetch=async()=>{restCalls++;throw new Error('Unexpected REST request');};
    assert.equal((await auth.fetchSystemStatus()).success,true);assert.equal(restCalls,0);assert.equal(rpcCalls,1);
    assert.equal(auth.getSystemAvailability().isMaintenanceMode,true);
    supabase.rpc=()=>({abortSignal:async()=>{throw new Error('RPC unavailable');}});
    globalThis.fetch=async(url,init)=>{restCalls++;assert.equal(url,'/api/v1/system/status');assert.equal(init.headers.Authorization,undefined);return Response.json({success:true,is_maintenance_mode:false});};
    assert.equal((await auth.fetchSystemStatus()).success,true);assert.equal(auth.getSystemAvailability().isMaintenanceMode,false);
    globalThis.fetch=async()=>{throw new Error('Offline');};
    assert.equal((await auth.fetchSystemStatus()).success,false);
    assert.equal(auth.getSystemAvailability().isMaintenanceMode,true);assert.equal(auth.getSystemAvailability().vipPasscode,'');
  `],
  ['API cancellation and timeout both remain effective', true, `
    const {apiRequest}=await import('./src/services/apiClient.js');
    globalThis.fetch=(url,{signal})=>new Promise((resolve,reject)=>{
      if(signal.aborted)reject(signal.reason);
      else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
    const controller=new AbortController();
    const pending=apiRequest('/articles',{anonymous:true,signal:controller.signal});
    controller.abort();await assert.rejects(pending,{name:'AbortError'});
    await assert.rejects(apiRequest('/articles',{anonymous:true,timeoutMs:5}),{name:'TimeoutError'});
  `],
  ['configured server denial and errors never fall back', true, `
    const { supabase } = await import('./src/lib/supabaseClient.js');
    const m = await import('./src/services/memoryService.js');
    supabase.auth.getSession = async () => ({data:{session:null}});
    globalThis.fetch = async () => Response.json({error:{message:'denied'}},{status:403});
    assert.equal((await m.fetchMemoryView('emoria-pulse')).message, 'denied');
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    globalThis.fetch = async () => Response.json({error:{message:'unavailable'}},{status:503});
    assert.equal((await m.fetchMemoryView('emoria-pulse')).success, false);
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await m.fetchMemoryView('emoria-pulse')).success, false);
    assert.equal((await m.verifyMemoryPin('emoria-pulse', '1000')).success, false);
    let sent;
    globalThis.fetch = async (url, options) => {
      sent = { url, method:options.method, body:JSON.parse(options.body) };
      return Response.json({ success: true, grant_token: 'server-token' });
    };
    await m.verifyMemoryPin(' EMORIA-PULSE ', ' 1000 ');
    assert.deepEqual(sent, { url: '/api/v1/memories/emoria-pulse/grants', method:'POST', body: { pin: '1000' } });
    assert.equal(m.getStoredGrantToken('emoria-pulse'), 'server-token');
  `],
];

for (const [name, configured, code] of scenarios) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; ${code}`], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, VITE_SUPABASE_URL: configured ? 'https://memory-test.supabase.co' : '', VITE_SUPABASE_ANON_KEY: configured ? 'test-anon-key' : '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.status, 0, `${name}: ${result.error || result.stderr}`);
  console.log(`[PASS] ${name}`);
}
