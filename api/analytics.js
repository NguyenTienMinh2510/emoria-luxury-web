import { createClient } from '@supabase/supabase-js';
import { createSign } from 'node:crypto';
let googleToken;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 if(req.method!=='GET')return send(405,{error:'Phương thức không hỗ trợ.'});
 const url=new URL(req.url,'http://localhost');const days=Number(url.searchParams.get('days')||30);
 if(![7,30,90].includes(days))return send(400,{error:'Khoảng ngày không hợp lệ.'});
 try{
  const bearer=req.headers.authorization;
  if(!bearer?.startsWith('Bearer '))return send(401,{error:'Vui lòng đăng nhập.'});
  const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!base||!key)return send(503,{error:'Server chưa cấu hình Supabase.'});
  const client=createClient(base,key,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const user=await client.auth.getUser(bearer.slice(7));if(user.error||!user.data.user)return send(401,{error:'Phiên đăng nhập không hợp lệ.'});
  const role=await client.rpc('is_admin');if(role.error||role.data!==true)return send(403,{error:'Chỉ admin được đọc báo cáo.'});
  const property=process.env.GA4_PROPERTY_ID;
  if(!property || !process.env.GA4_SERVICE_ACCOUNT_JSON)return send(200,{configured:false,missing:['GA4_PROPERTY_ID','GA4_SERVICE_ACCOUNT_JSON'].filter(name=>!process.env[name]),message:'Đã có phần theo dõi truy cập khi cấu hình Measurement ID. Để đọc báo cáo Google tại đây, cần thêm Property ID và service account ở server.'});
  if(!/^\d+$/.test(property))throw new Error('GA4_PROPERTY_ID không hợp lệ.');
  const hostname=process.env.GA4_REPORT_HOSTNAME?.trim();
  const dimensionFilter=hostname?{filter:{fieldName:'hostName',stringFilter:{matchType:'EXACT',value:hostname,caseSensitive:false}}}:undefined;
  if(!googleToken||googleToken.expires<Date.now()){
   const credentials=JSON.parse(process.env.GA4_SERVICE_ACCOUNT_JSON),now=Math.floor(Date.now()/1000);
   const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
   const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
   const signature=createSign('RSA-SHA256').update(unsigned).sign(credentials.private_key,'base64url');
   const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature}),signal:AbortSignal.timeout(10000)});
   if(!result.ok)throw new Error('Không thể xác thực Google. Kiểm tra service account.');
   const data=await result.json();googleToken={value:data.access_token,expires:Date.now()+Math.max(0,data.expires_in-60)*1000};
  }
  const report=async(dimensions,metrics)=>{
   const response=await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,{method:'POST',headers:{Authorization:`Bearer ${googleToken.value}`,'Content-Type':'application/json'},body:JSON.stringify({dateRanges:[{startDate:`${days}daysAgo`,endDate:'yesterday'}],dimensions:dimensions.map(name=>({name})),metrics:metrics.map(name=>({name})),dimensionFilter,limit:100}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Google chưa trả báo cáo. Kiểm tra Data API và quyền Viewer của service account trên GA4 property.');
   return response.json();
  };
  const [summary,channels,devices,daily]=await Promise.all([report([],['activeUsers','sessions','screenPageViews','engagementRate']),report(['sessionDefaultChannelGroup'],['sessions','engagedSessions']),report(['deviceCategory'],['activeUsers']),report(['date'],['activeUsers','sessions','screenPageViews'])]);
  send(200,{configured:true,days,hostname:hostname||null,summary,channels,devices,daily,updatedAt:new Date().toISOString()});
 }catch(error){
  const network=error.name==='TimeoutError'||error.name==='AbortError'||['ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EACCES','ECONNRESET','UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code);
  send(502,{error:network?'Máy chủ chưa kết nối được Google hoặc kết nối quá chậm. Kiểm tra mạng/DNS rồi thử lại.':error.message?.startsWith('Google')||error.message?.startsWith('Không thể xác thực')?error.message:'Không thể tải báo cáo. Kiểm tra cấu hình server rồi thử lại.'});
 }
}
