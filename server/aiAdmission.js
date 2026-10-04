import {eventAdmin} from './eventGateway.js';
export async function reserveAiWork(userId,category,resource) {
  const {data,error}=await eventAdmin().rpc('rpc_reserve_ai_work',{p_user:userId,p_category:category,p_resource:resource});
  if(error||typeof data?.allowed!=='boolean')throw Object.assign(new Error('Chưa kiểm tra được hạn mức AI. Hãy thử lại.'),{status:503});
  if(!data.allowed)throw Object.assign(new Error(data.reason==='busy'?'AI đang xử lý các lượt trước. Hãy thử lại sau ít giây.':'Đã đạt hạn mức AI an toàn. Hãy thử lại sau.'),{status:429,retryAfter:data.retry_after||5,code:'AI_CAPACITY'});
  return data.lease_id;
}
export async function releaseAiWork(lease) {
  if(!lease)return;
  try {await eventAdmin().rpc('rpc_release_ai_work',{p_lease:lease});}catch{/* Expiring leases recover interrupted workers. */}
}
