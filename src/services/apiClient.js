import {supabase} from '../lib/supabaseClient.js';

export async function apiRequest(path,{method='GET',body}={}) {
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  const response=await fetch(`/api/v1${path}`,{
    method,credentials:'omit',cache:'no-store',
    headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),
      ...(data.session?.access_token?{Authorization:`Bearer ${data.session.access_token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),
  });
  let result;
  try{result=await response.json();}catch{throw Object.assign(new Error('Máy chủ chưa trả dữ liệu hợp lệ.'),{status:502});}
  if(!response.ok)throw Object.assign(new Error(result.error?.message||result.error||'Yêu cầu thất bại.'),{status:response.status,code:result.error?.code});
  return result;
}
