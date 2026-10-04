import {supabase} from '../lib/supabaseClient.js';
import {createRequestBudget} from './requestBudget.js';

export async function apiRequest(path,{method='GET',body,timeoutMs=20000,signal,anonymous=false}={}) {
  const budget = createRequestBudget({timeoutMs,signal});
  try {
  const {data,error}=anonymous ? {data:{session:null}} : await budget.wait(supabase.auth.getSession());
  if(error)throw error;
  const isSendBody = method !== 'GET' && method !== 'HEAD';
  const payload = isSendBody ? (body === undefined ? {} : body) : undefined;
  budget.signal.throwIfAborted();
  const response=await budget.wait(fetch(`/api/v1${path}`,{
    method,credentials:'omit',cache:'no-store',
    headers:{
      Accept:'application/json',
      ...(isSendBody ? {'Content-Type':'application/json'} : {}),
      ...(data.session?.access_token?{Authorization:`Bearer ${data.session.access_token}`}:{})
    },
    ...(payload !== undefined ? {body:JSON.stringify(payload)} : {}),
    signal:budget.signal,
  }));
  let result;
  try{result=await budget.wait(response.json());}catch(error){if(budget.signal.aborted)throw budget.signal.reason;throw Object.assign(new Error('Máy chủ chưa trả dữ liệu hợp lệ.'),{status:502});}
  if(!response.ok){
    let msg = result.error?.message || result.error || 'Yêu cầu thất bại.';
    if(typeof msg === 'string' && (msg.includes('Yêu cầu phải là JSON') || msg.includes('JSON không hợp lệ'))){
      msg = 'Dữ liệu yêu cầu không hợp lệ.';
    }
    throw Object.assign(new Error(msg),{status:response.status,code:result.error?.code});
  }
  return result;
  } finally {
    budget.dispose();
  }
}
