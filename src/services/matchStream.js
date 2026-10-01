import {supabase} from '../lib/supabaseClient.js';

export function watchMatch(matchId,inviteToken,onChange,onFallback){
  const controller=new AbortController();let timer;
  async function connect(){
    if(controller.signal.aborted)return;
    if(document.visibilityState==='hidden'){timer=setTimeout(connect,5000);return;}
    try{
      const {data}=await supabase.auth.getSession();
      const res=await fetch(`/api/v1/events/matches/${encodeURIComponent(matchId)}/stream`,{
        method:'POST',headers:{'Content-Type':'application/json',...(data.session?.access_token?{Authorization:`Bearer ${data.session.access_token}`}:{})},
        body:JSON.stringify({invite_token:inviteToken||null}),signal:controller.signal,cache:'no-store'
      });
      if(!res.ok)throw new Error(`Stream ${res.status}`);
      const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(!controller.signal.aborted){
        const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
        let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.startsWith('event: cancelled')){controller.abort();onChange({status:'archived'});return;}if(frame.startsWith('event: denied')){controller.abort();onFallback?.();return;}if(frame.startsWith('data: '))onChange(JSON.parse(frame.slice(6)));}
      }
      timer=setTimeout(connect,1000);
    }catch{if(!controller.signal.aborted){onFallback?.();timer=setTimeout(connect,10000);}}
  }
  connect();return ()=>{controller.abort();clearTimeout(timer);};
}
