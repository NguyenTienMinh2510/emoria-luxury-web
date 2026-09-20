// Explicit resource routes. SQL functions remain the transaction boundary.
import {normalizeCheckout} from '../src/services/checkoutPayload.js';
import {analyzeVideo,readVideoLabels,readVideoUploads} from './videoLabels.js';
const route=(method,path,access,run,status)=>({method,pattern:new RegExp(`^${path}$`),access,run,status});
const rpc=(c,name,args={})=>c.db(c.client.rpc(name,args));
const integer=(value,fallback,max=10000)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<0||n>max)throw Object.assign(new Error('Tham số phân trang không hợp lệ.'),{status:400});return n;};
const pick=(body,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
const settingKeys=['sandbox','sales_enabled','cod_enabled','transfer_enabled','shipping_fee','free_shipping_from','gift_fee','reservation_minutes','bank_bin','bank_account','bank_owner','contact_email','contact_phone','address','ga4_measurement_id','shipping_policy','return_policy','privacy_policy'];
export const routes=[
  route('GET','/admin/video-uploads','admin',c=>{
    const page=integer(c.query.get('page'),0),status=c.query.get('status');
    let query=c.client.from('video_upload_events').select('id,created_at,user_id,author_name,tag,path,status,labels,violations,reason,model,policy_version').order('created_at',{ascending:false}).order('id',{ascending:false});
    if(status){if(!['uploaded','processing','ready','rejected','failed'].includes(status))throw Object.assign(new Error('Trạng thái không hợp lệ.'),{status:400});query=query.eq('status',status);}
    const category=c.query.get('category');
    if(category==='intro')query=query.ilike('path','%intro%');
    else if(category==='gallery')query=query.not('path','ilike','%intro%');
    const mediaType=c.query.get('media_type');
    if(mediaType==='image')query=query.or('path.ilike.%.jpg,path.ilike.%.jpeg,path.ilike.%.png,path.ilike.%.webp');
    else if(mediaType==='video')query=query.or('path.ilike.%.mp4,path.ilike.%.webm');
    const user=c.query.get('user'),raw=c.query.get('search')||'';
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(user){if(!uuid.test(user))throw Object.assign(new Error('User ID không hợp lệ.'),{status:400});query=query.eq('user_id',user);}
    const term=raw.normalize('NFC').replace(/[^\p{L}\p{M}\p{N} -]/gu,' ').replace(/\s+/g,' ').trim().slice(0,120);
    if(term)query=uuid.test(term)?query.eq('user_id',term):query.or(`author_name.ilike.%${term}%,tag.ilike.%${term}%`);
    return c.db(query.range(page*25,page*25+24));
  }),
  route('POST','/memories/([^/]+)/video-labels/analyze','user',analyzeVideo),
  route('POST','/memories/([^/]+)/video-labels/read','admin',readVideoLabels),
  route('GET','/memories/([^/]+)/video-uploads','user',readVideoUploads),
  route('GET','/system/status','public',c=>rpc(c,'rpc_get_system_status')),
  route('GET','/me/session','user',async c=>{
    const [isAdmin,profile]=await Promise.all([rpc(c,'is_admin'),c.db(c.client.from('profiles').select('full_name, phone, birthday, gender, address, bio, avatar_url').eq('id',c.user.id).maybeSingle())]);
    return {isAdmin:isAdmin===true,profile};
  }),
  route('GET','/me/memories','user',c=>rpc(c,'rpc_my_memories')),
  route('GET','/memories/([^/]+)/ownership','user',async c=>{
    const memories=await rpc(c,'rpc_my_memories');
    return {isOwner:memories.some(m=>m.tag_uid===c.params[0])};
  }),
  route('PATCH','/admin/system/maintenance','admin',async c=>{
    const data=await c.db(c.client.from('system_settings').select('value').eq('key','maintenance_config').single());
    const value={...data.value};
    if('isMaintenanceMode' in c.body)value.is_maintenance_mode=c.body.isMaintenanceMode===true;
    if('maintenanceMessage' in c.body)value.maintenance_message=String(c.body.maintenanceMessage).slice(0,2000);
    return c.db(c.client.from('system_settings').update({value,updated_at:new Date().toISOString()}).eq('key','maintenance_config').select('key').single());
  }),
  route('GET','/catalog','public',async c=>{
    const [products,settings]=await Promise.all([c.db(c.client.from('checkout_products').select('*, checkout_variants(*)').order('id')),c.db(c.client.from('store_settings').select('*').eq('id',true).single())]);
    return {products,settings};
  }),
  route('PUT','/admin/products/([^/]+)','admin',c=>rpc(c,'rpc_save_catalog',{p_id:c.params[0],p_expected:c.body.expected??null,p_product:c.body.product,p_variants:c.body.variants})),
  route('PATCH','/admin/settings','admin',c=>c.db(c.client.from('store_settings').update(pick(c.body,settingKeys)).eq('id',true).select('id').single())),
  route('POST','/orders','user',c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.body.requestId||''))throw Object.assign(new Error('Thiếu requestId hợp lệ để chống tạo đơn trùng.'),{status:400});
    if(!Array.isArray(c.body.items)||!c.body.items.length||c.body.items.length>100||c.body.items.some(i=>!i||typeof i!=='object'))throw Object.assign(new Error('Giỏ hàng không hợp lệ.'),{status:400});
    return rpc(c,'rpc_create_order',{p_request_id:c.body.requestId,p_payload:normalizeCheckout(c.body)});
  },201),
  // The private lookup token belongs in a body, never an URL/access log.
  route('POST','/orders/lookup','public',c=>rpc(c,'rpc_track_order',{p_order_id:String(c.body.id||'').trim(),p_token:c.body.token||null})),
  route('GET','/me/orders','user',c=>{const page=integer(c.query.get('page'),0);return c.db(c.client.from('orders').select('id,created_at,status,final_total,is_test').eq('user_id',c.user.id).order('created_at',{ascending:false}).range(page*10,page*10+9));}),
  route('GET','/admin/orders','admin',c=>{
    const page=integer(c.query.get('page'),0),term=(c.query.get('search')||'').slice(0,120).replace(/[^a-zA-Z0-9@+ ._-]/g,'').trim();
    let q=c.client.from('orders').select('*, order_items(*)').order('created_at',{ascending:false});
    if(term)q=q.or(`id.ilike.%${term}%,phone.ilike.%${term}%,tracking_number.ilike.%${term}%`);
    if(c.query.get('status'))q=q.eq('status',c.query.get('status'));
    return c.db(q.range(page*25,page*25+24));
  }),
  route('PATCH','/admin/orders/([^/]+)/status','admin',c=>rpc(c,'rpc_order_status',{p_order_id:c.params[0],p_status:c.body.status,p_tracking:c.body.tracking??null})),
  route('PUT','/admin/orders/([^/]+)/shipment','admin',c=>rpc(c,'rpc_save_shipment',{p_order_id:c.params[0],p_carrier:c.body.carrier,p_tracking:c.body.tracking,p_estimate:c.body.estimate??null,p_note:c.body.note,p_status:c.body.status??null})),
  route('POST','/admin/orders/expirations','admin',c=>rpc(c,'rpc_expire_orders'),201),
  route('POST','/admin/orders/([^/]+)/chips','admin',c=>rpc(c,'rpc_issue_chip',{p_order_id:c.params[0],p_item_id:c.body.itemId}),201),
  route('GET','/admin/payment-events','admin',c=>c.db(c.client.from('bank_payment_events').select('id,provider_id,order_id,amount,outcome,received_at,is_test,content').order('received_at',{ascending:false}).limit(50))),
  route('GET','/admin/reports/marketing','admin',c=>rpc(c,'rpc_marketing_report',{p_days:integer(c.query.get('days'),30,90),p_test:c.query.get('test')==='true'})),
  route('POST','/contacts','public',c=>rpc(c,'rpc_contact',{p_name:c.body.name,p_phone:c.body.phone,p_note:c.body.note}),201),
  route('GET','/admin/contacts','admin',c=>c.db(c.client.from('contact_requests').select('*').order('created_at',{ascending:false}).limit(100))),
  route('PATCH','/admin/contacts/([^/]+)','admin',c=>c.db(c.client.from('contact_requests').update({resolved:c.body.resolved===true}).eq('id',c.params[0]).select('id').single())),
  route('GET','/admin/memories','admin',c=>rpc(c,'rpc_memory_operations')),
  route('PATCH','/admin/memories/([^/]+)/suspension','admin',c=>rpc(c,'rpc_memory_operations',{p_tag:c.params[0],p_suspended:c.body.suspended})),
  route('GET','/articles','public',c=>rpc(c,'rpc_get_published_articles',{p_category:c.query.get('category'),p_search:c.query.get('search'),p_limit:integer(c.query.get('limit'),12,100),p_offset:integer(c.query.get('offset'),0)})),
  route('GET','/articles/([^/]+)','public',c=>rpc(c,'rpc_get_article_detail',{p_slug:c.params[0]})),
  route('PUT','/articles/([^/]+)/reactions/(like|bookmark)','user',c=>rpc(c,'rpc_set_article_reaction',{p_article_id:c.params[0],p_kind:c.params[1],p_enabled:c.body.enabled===true})),
  route('POST','/articles/([^/]+)/comments','user',c=>rpc(c,'rpc_add_article_comment',{p_article_id:c.params[0],p_content:c.body.content,p_parent_id:c.body.parentId??null}),201),
  route('PATCH','/comments/([^/]+)','user',c=>rpc(c,'rpc_edit_article_comment',{p_comment_id:c.params[0],p_content:c.body.content,p_delete:false})),
  route('DELETE','/comments/([^/]+)','user',c=>rpc(c,'rpc_edit_article_comment',{p_comment_id:c.params[0],p_content:'',p_delete:true})),
  route('POST','/comments/([^/]+)/reports','user',c=>rpc(c,'rpc_report_comment',{p_comment_id:c.params[0],p_reason:c.body.reason}),201),
  route('PATCH','/admin/comments/([^/]+)/status','admin',c=>rpc(c,'rpc_moderate_article_comment',{p_comment_id:c.params[0],p_status:c.body.status})),
  route('GET','/admin/articles','admin',c=>rpc(c,'rpc_article_admin_data')),
  route('POST','/admin/articles','admin',c=>rpc(c,'rpc_save_article_admin',{p_article_id:null,p_payload:c.body}),201),
  route('PUT','/admin/articles/([^/]+)','admin',c=>rpc(c,'rpc_save_article_admin',{p_article_id:c.params[0],p_payload:c.body})),
  route('GET','/me/saved-articles','user',c=>rpc(c,'rpc_saved_articles')),
  route('POST','/memories/([^/]+)/access','public',c=>rpc(c,'rpc_get_memory_view',{p_tag_uid:c.params[0],p_grant_token:c.body.grant??null})),
  route('POST','/memories/([^/]+)/grants','public',c=>rpc(c,'rpc_verify_memory_pin',{p_tag_uid:c.params[0],p_pin:c.body.pin}),201),
  route('POST','/memories/([^/]+)/claims','user',c=>rpc(c,'rpc_claim_nfc_chip',{p_tag_uid:c.params[0],p_claim_code:c.body.code}),201),
  route('PATCH','/memories/([^/]+)','user',c=>rpc(c,'rpc_update_memory_space',{p_tag_uid:c.params[0],p_payload:c.body})),
  route('POST','/memories/([^/]+)/guestbook','public',c=>rpc(c,'rpc_guestbook',{p_tag:c.params[0],p_token:c.body.grant??null,p_name:c.body.name,p_message:c.body.message,p_relationship:c.body.relationship||''}),201),
  route('PATCH','/admin/memories/([^/]+)/availability','admin',c=>c.db(c.client.from('memory_spaces').update({availability_status:c.body.status,unlock_at:c.body.unlockDate||null,updated_at:new Date().toISOString()}).eq('tag_uid',c.params[0]).select('tag_uid').single())),
  route('GET','/me/profile','user',c=>rpc(c,'rpc_get_my_profile')),
  route('PATCH','/me/profile','user',async c=>{
    const previous=await rpc(c,'rpc_get_my_profile');
    return rpc(c,'rpc_update_my_profile',Object.fromEntries(['full_name','phone','birthday','gender','address','bio','avatar_url'].map(k=>[`p_${k}`,Object.hasOwn(c.body,k)?c.body[k]:previous[k]??null])));
  }),
];
