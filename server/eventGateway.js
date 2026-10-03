import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';

export const isEventRpc=name=>/^rpc_(match_|house_)/.test(name)||['rpc_track_event_action','rpc_submit_content_report','rpc_admin_list_reports','rpc_admin_moderate_content','rpc_get_event_analytics_summary','house_reply','house_replies'].includes(name);
export function eventAdmin(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||(url?.includes('fixture')?'fixture-service-role-key':null);
  if(!url||!key)throw Object.assign(new Error('Dịch vụ sự kiện chưa được cấu hình.'),{status:503});
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(15000)})}});
}
const serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||'emoria-event-private-seed-key';
const privateKey=value=>createHmac('sha256',serviceKey()).update(String(value)).digest('hex');
export async function eventRpc(c,name,args={}){
  const client=eventAdmin();
  const identity=privateKey(c.user?.id||c.ip||'local');
  const write=/save|progress|submit|begin|create|cancel|publish|revoke|moderate|reply|report/.test(name);
  const max=name==='house_reply'||name==='rpc_submit_content_report'?5:write?30:60;
  const limit=await client.rpc('rpc_check_rate_limit',{p_key:`${write?'match_progress':'house_public_share'}:${identity}:${name}`,p_max_burst:max,p_window_seconds:60});
  if(limit.error||!limit.data)throw Object.assign(new Error('Chưa kiểm tra được giới hạn truy cập. Hãy thử lại.'),{status:503});
  if(!limit.data.allowed)throw Object.assign(new Error('Bạn thao tác hơi nhanh. Hãy thử lại sau một chút.'),{status:429,code:'RATE_LIMIT_EXCEEDED',retryAfter:limit.data.retry_after});
  const body={...args};
  if(['rpc_house_save_draft','rpc_house_restore_layout','rpc_match_save_questions','rpc_match_save_progress'].includes(name)){
    if(c.body.expected_revision!==undefined&&c.body.expected_revision!==null){
      const revision=c.body.expected_revision;
      if(!Number.isSafeInteger(revision)||revision<0)throw Object.assign(new Error('Phiên bản bản nháp phải là số nguyên không âm.'),{status:422});
      body.expected_revision=revision;
    }
  }
  if(name==='rpc_submit_content_report'){body.invite_token=c.body.invite_token;body.reporter=identity;}
  if(name==='rpc_track_event_action'){
    const session=c.body.session_id||privateKey(c.ip||'anonymous-session').slice(0,32);
    const event=c.body.event_id;
    if(!/^[\w-]{16,64}$/.test(session)||event&&!/^[\w-]{16,64}$/.test(event))throw Object.assign(new Error('Mã phiên sự kiện không hợp lệ.'),{status:400});
    body.session_id=privateKey(session);body.event_id=event;body.invite_token=c.body.invite_token;
  }
  return c.db(client.rpc('rpc_event_dispatch',{p_action:name,p_args:body,p_caller:c.user?.id||null}));
}

// Private database broadcasts are relayed through a short-lived authorized
// SSE connection. The browser never receives a service key or a public channel.
export async function streamMatch(c){
  const args={p_match_id:c.params[0],p_invite_token:c.body.invite_token||null};
  await eventRpc(c,'rpc_match_get_view',args);
  const client=eventAdmin();let closed=false,busy=false;
  const channel=client.channel(`emoria-match:${c.params[0]}`,{config:{private:true}});
  const res=c.res;
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders?.();
  await new Promise(resolve=>{
    let timeout;
    const close=()=>{if(closed)return;closed=true;clearTimeout(timeout);res.off('close',close);res.end();resolve();};
    const check=async()=>{
      if(closed||busy)return;busy=true;
      try{
        const view=await c.db(client.rpc('rpc_event_dispatch',{p_action:'rpc_match_get_view',p_args:args,p_caller:c.user?.id||null}));
        if(!closed)res.write(`data: ${JSON.stringify({my_submitted:view.my_submitted,both_submitted:view.both_submitted,other_submitted:view.other_submitted,other_opened_at:view.other_opened_at,other_answered_count:view.other_answered_count,total_questions:view.total_questions})}\n\n`);
      }catch{if(!closed)res.write('event: denied\ndata: {}\n\n');close();}finally{busy=false;}
    };
    channel.on('broadcast',{event:'changed'},message=>{
      // Only the private DB channel can cancel an already-authorized stream.
      if(message.payload?.cancelled===true){
        if(!closed)res.write('event: cancelled\ndata: {"status":"archived"}\n\n');
        close();
      }else check();
    }).subscribe(status=>{if(status==='SUBSCRIBED')check();else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')close();});
    timeout=setTimeout(close,25000);res.on('close',close);
  });
  await client.removeChannel(channel);
}
