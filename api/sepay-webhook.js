import {timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

// API Key authentication per SePay's webhook protocol; never expose this key to Vite.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 if(req.method!=='POST')return send(405,{success:false});
 const secret=process.env.SEPAY_WEBHOOK_KEY,account=process.env.SEPAY_ACCOUNT_NUMBER?.trim(),mode=process.env.SEPAY_MODE;
 const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret||secret.length<32||!account||!['live','test'].includes(mode)||!base||!key)return send(503,{success:false,error:'Payment webhook is not configured'});
 const auth=req.headers.authorization||'',expected=`Apikey ${secret}`;
 if(typeof auth!=='string'||Buffer.byteLength(auth)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected)))return send(401,{success:false});
 try{
  let body=req.body;
  if(!body){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)return send(413,{success:false});}body=raw;}
  if(typeof body==='string'){if(Buffer.byteLength(body)>16384)return send(413,{success:false});try{body=JSON.parse(body);}catch{return send(400,{success:false});}}
  if(!body||Buffer.byteLength(JSON.stringify(body))>16384)return send(400,{success:false});
  if(!Number.isSafeInteger(body.id)||body.id<=0||!Number.isSafeInteger(body.transferAmount)||body.transferAmount<=0||body.transferAmount>1e12||typeof body.content!=='string'||body.content.length>2000||typeof body.accountNumber!=='string'||!['in','out'].includes(body.transferType))return send(400,{success:false});
  if(body.transferType!=='in')return send(200,{success:true});
  if(body.accountNumber.trim()!==account)return send(400,{success:false,error:'Account mismatch'});
  // BIDV accepts only alphanumeric notes up to 23 chars. Resolve short EMO
  // references to the full order id before calling the payment RPC.
  const refs=[...new Set([...body.content.toUpperCase().matchAll(/\bEMO[- ]?([A-F0-9]{20,32})\b/g)].map(m=>'EMO'+m[1]))];
  const reference=body.referenceCode||'';
  if(typeof reference!=='string'||reference.length>200)return send(400,{success:false});
  const client=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
  let orderId=null;
  if(refs.length===1){
    const ref=refs[0].replace(/^EMO/,'');
    if(ref.length>=28) orderId=`EMO-${ref.toLowerCase()}`;
    else {
      const {data:matches,error:lookupError}=await client.from('orders').select('id').ilike('id',`EMO-${ref}%`).limit(2);
      if(!lookupError&&matches?.length===1)orderId=matches[0].id;
    }
  }
  const {error,data}=await client.rpc('rpc_receive_bank_payment',{p_provider_id:body.id,p_test:mode==='test',p_reference:reference,p_account:account,p_order_id:orderId,p_amount:body.transferAmount,p_content:body.content});
  if(error||!data?.success)return send(503,{success:false,error:'Payment could not be saved; retry required'});
  return send(200,{success:true});
 }catch{return send(503,{success:false,error:'Payment service temporarily unavailable'});}
}
