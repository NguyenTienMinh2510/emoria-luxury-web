import {createClient} from '@supabase/supabase-js';
import {routes} from '../server/routes.js';

const fail=(status,message,code)=>Object.assign(new Error(message),{status,code});
async function readBody(req) {
  if(req.method==='GET')return {};
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'Yêu cầu phải là JSON.');
  let body=req.body;
  // Ten handwritten letters plus article content must fit; media is uploaded separately.
  if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>524288)throw fail(413,'Yêu cầu quá lớn.');}body=raw;}
  if(Buffer.byteLength(typeof body==='string'?body:JSON.stringify(body))>524288)throw fail(413,'Yêu cầu quá lớn.');
  try{if(typeof body==='string')body=JSON.parse(body);}catch{throw fail(400,'JSON không hợp lệ.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'Nội dung yêu cầu không hợp lệ.');
  return body;
}

export default async function handler(req,res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  try {
    const url=new URL(req.originalUrl||req.url,'http://localhost');
    // Vercel rewrites to one function; local Vite retains the original path.
    const path=url.pathname.startsWith('/api/v1/')?url.pathname.slice(7):`/${url.searchParams.get('resource')||''}`;
    const matches=routes.filter(r=>r.pattern.test(path));
    if(!matches.length)throw fail(404,'Không tìm thấy tài nguyên.');
    const route=matches.find(r=>r.method===req.method);
    if(!route){res.setHeader('Allow',[...new Set(matches.map(r=>r.method))].join(', '));throw fail(405,'Phương thức không hỗ trợ.');}
    const params=path.match(route.pattern).slice(1).map(decodeURIComponent);
    const body=await readBody(req);
    const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
    const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if(!base||!key)throw fail(503,'Server chưa cấu hình database.');
    const authorization=req.headers.authorization;
    if(authorization&&!/^Bearer \S+$/i.test(authorization))throw fail(401,'Phiên đăng nhập không hợp lệ.');
    // Never use service-role here: the caller's JWT preserves ownership and RLS.
    const client=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false},global:{
      headers:authorization?{Authorization:authorization}:{},fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)}),
    }});
    let user;
    if(authorization){const result=await client.auth.getUser(authorization.slice(7));if(result.error||!result.data.user)throw fail(401,'Phiên đăng nhập hết hạn.');user=result.data.user;}
    if(route.access!=='public'&&!user)throw fail(401,'Vui lòng đăng nhập.');
    if(route.access==='admin'){const role=await client.rpc('is_admin');if(role.error)throw fail(503,'Chưa kiểm tra được quyền quản trị.');if(role.data!==true)throw fail(403,'Chỉ quản trị viên được thực hiện thao tác này.');}
    const db=async query=>{
      const {data,error}=await query;
      if(error){
        if(error.code==='42501')throw fail(403,'Không có quyền thực hiện thao tác.',error.code);
        if(error.code==='P0001')throw fail(409,error.message,error.code);
        if(/^22|^23/.test(error.code||''))throw fail(422,'Dữ liệu không hợp lệ hoặc xung đột với dữ liệu hiện có.',error.code);
        throw fail(503,'Database chưa trả kết quả. Vui lòng thử lại.');
      }
      if(data?.success===false)throw fail(409,data.message||'Không thể thực hiện thao tác.');
      return data;
    };
    const result=await route.run({client,db,user,body,params,query:url.searchParams});
    send(route.status||200,result??{success:true});
  }catch(error){send(error.status||500,{error:{code:error.code||`HTTP_${error.status||500}`,message:error.status?error.message:'Không thể xử lý yêu cầu. Vui lòng thử lại.'}});}
}
