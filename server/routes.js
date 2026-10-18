// Explicit resource routes. SQL functions remain the transaction boundary.
import {createClient} from '@supabase/supabase-js';
import {eventRpc,eventAdmin,isEventRpc,streamMatch,gatewayIdentity,admitGateway} from './eventGateway.js';
import {normalizeCheckout} from '../src/services/checkoutPayload.js';
import {analyzeVideo,readVideoLabels,readVideoUploads} from './videoLabels.js';
import {craftLetter,warmupAi} from './aiService.js';
import {tryOnConfig} from './tryOn.js';
import {signEventPaths,signPublishedHousePaths,enrichMatchQuestionsWithSignedUrls,enrichHouseRoomsWithSignedUrls} from './eventMedia.js';
import {signMemoryMedia} from './memoryMedia.js';
import {moderateHousePhotos,enqueueHousePublish,readHousePublishJob,processHouseJobs} from './houseModeration.js';
import {reserveAiWork,releaseAiWork} from './aiAdmission.js';
import {validateHousePreview,attachHousePreview} from './housePreview.js';
const route=(method,path,access,run,status)=>({method,pattern:new RegExp(`^${path}$`),access,status,
  run:(method!=='GET'&&path.includes('/house/'))||path==='/storage/uploads/reserve'?async c=>{
    const tag=path==='/storage/uploads/reserve'?(typeof c.body.path==='string'?c.body.path.split('/')[0]:null):c.params[0];
    try{
      if(typeof tag==='string'&&tag.trim().toLowerCase().startsWith('guest-'))await requireGuestHouseEvent(c);
      if(path.includes('/house/')&&(/\/(publish|unpublish|revoke)$/.test(path)||path.endsWith('/run'))&&c.user?.is_anonymous===true){
        throw Object.assign(new Error('Đăng ký tài khoản để chia sẻ ngôi nhà.'),{status:403,code:'GUEST_LOGIN_REQUIRED'});
      }
      return await run(c);
    }catch(error){throw guestHouseError(error);}
  }:run});
function guestHouseError(error){
  for(const code of ['GUEST_EVENT_CLOSED','GUEST_LOGIN_REQUIRED'])if(error.status===403&&error.message.includes(code))error.code=code;
  return error;
}
async function requireGuestHouseEvent(c){
  const status=await c.db(c.client.rpc('rpc_guest_house_status'));
  if(status?.enabled!==true)throw Object.assign(new Error('Sự kiện ngôi nhà đã đóng.'),{status:403,code:'GUEST_EVENT_CLOSED'});
}
const rpc=(c,name,args={})=>isEventRpc(name)?eventRpc(c,name,args):c.db(c.client.rpc(name,args));
const integer=(value,fallback,max=10000)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<0||n>max)throw Object.assign(new Error('Tham số phân trang không hợp lệ.'),{status:400});return n;};
const pick=(body,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
const settingKeys=['sandbox','sales_enabled','cod_enabled','transfer_enabled','shipping_fee','free_shipping_from','gift_fee','reservation_minutes','bank_bin','bank_account','bank_owner','contact_email','contact_phone','address','ga4_measurement_id','shipping_policy','return_policy','privacy_policy'];
export const routes=[
  route('GET','/products/([^/]+)/try-on','public',async c=>{
    const product=await c.db(c.client.from('checkout_products').select('id,name,active,image_url,details').eq('id',c.params[0]).maybeSingle());
    if(!product?.active)throw Object.assign(new Error('Product unavailable.'),{status:404});
    const config=tryOnConfig(c.params[0], product);
    if(!config)throw Object.assign(new Error('AR is not available for this product.'),{status:404});
    return config;
  }),
  route('POST','/ai/warmup','user',async c=>{
    const limit=await c.db(eventAdmin().rpc('rpc_check_rate_limit',{p_key:`ai_warmup:${c.user.id}`,p_max_burst:3,p_window_seconds:3600}));
    if(!limit?.allowed)throw Object.assign(new Error('Hãy thử lại sau.'),{status:429});
    const lease=await reserveAiWork(c.user.id,'warmup',c.user.id);
    try{return await warmupAi();}finally{await releaseAiWork(lease);}
  }),
  route('POST','/ai/craft-letter','user',craftLetter),
  route('GET','/admin/accounts','admin',c=>rpc(c,'rpc_admin_accounts',{p_search:(c.query.get('search')||'').slice(0,120)})),
  route('POST','/admin/memories','admin',c=>rpc(c,'rpc_admin_create_memory',{p_owner:c.body.ownerId,p_title:c.body.title}),201),
  route('POST','/admin/orders/([^/]+)/memories','admin',c=>rpc(c,'rpc_admin_create_memory',{p_owner:null,p_title:c.body.title||'Memory Space',p_order:c.params[0],p_item:c.body.itemId}),201),
  route('PUT','/admin/memories/([^/]+)/owner','admin',c=>rpc(c,'rpc_admin_memory_account',{p_tag:c.params[0],p_user:c.body.userId,p_role:'owner',p_version:c.body.version})),
  route('PUT','/admin/memories/([^/]+)/recipients/([^/]+)','admin',c=>rpc(c,'rpc_admin_memory_account',{p_tag:c.params[0],p_user:c.params[1],p_role:'recipient'})),
  route('DELETE','/admin/memories/([^/]+)/recipients/([^/]+)','admin',c=>rpc(c,'rpc_admin_memory_account',{p_tag:c.params[0],p_user:c.params[1],p_role:'recipient',p_remove:true})),
  route('GET','/admin/nfc-chips','admin',c=>rpc(c,'rpc_admin_nfc_links',{p_search:(c.query.get('search')||'').slice(0,120),p_offset:integer(c.query.get('page'),0)*25})),
  route('POST','/admin/nfc-chips','admin',c=>rpc(c,'rpc_admin_save_nfc_link',{p_id:null,p_payload:pick(c.body,['label','memoryTag','active'])}),201),
  route('PATCH','/admin/nfc-chips/([^/]+)','admin',c=>rpc(c,'rpc_admin_save_nfc_link',{p_id:c.params[0],p_payload:pick(c.body,['label','memoryTag','active','version'])})),
  route('GET','/nfc-chips/([^/]+)','public',async c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Chip not found'),{status:404});
    const result=await rpc(c,'rpc_resolve_nfc_link',{p_id:c.params[0]});
    if(!result)throw Object.assign(new Error('Chip is unassigned or disabled'),{status:404});
    return result;
  }),
  route('GET','/admin/video-uploads','admin',c=>{
    const status=c.query.get('status')||'',category=c.query.get('category')||'',type=c.query.get('media_type')||'',user=c.query.get('user')||null;
    if(!['','uploaded','processing','ready','rejected','failed'].includes(status)||!['','intro','gallery'].includes(category)||!['','image','video'].includes(type)||user&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user))throw Object.assign(new Error('Invalid media filter'),{status:400});
    return rpc(c,'rpc_admin_media_uploads',{p_search:(c.query.get('search')||'').slice(0,120),p_user:user,p_status:status,p_category:category,p_type:type,p_offset:integer(c.query.get('page'),0)*25,p_history:c.query.get('history')==='true'});
  }),
  route('POST','/admin/video-uploads/override','admin',c=>rpc(c,'rpc_admin_override_media',{p_path:c.body.path,p_request:c.body.requestId,p_reason:c.body.reason})),
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
    return {isOwner:memories.some(m=>m.tag_uid===c.params[0]&&m.role==='owner')};
  }),
  route('PATCH','/admin/system/maintenance','admin',async c=>{
    const data=await c.db(c.client.from('system_settings').select('value').eq('key','maintenance_config').single());
    const value={...data.value};
    if('isMaintenanceMode' in c.body)value.is_maintenance_mode=c.body.isMaintenanceMode===true;
    if('maintenanceMessage' in c.body)value.maintenance_message=String(c.body.maintenanceMessage).slice(0,2000);
    return c.db(c.client.from('system_settings').update({value,updated_at:new Date().toISOString()}).eq('key','maintenance_config').select('key').single());
  }),
  route('GET','/events/guest-house/status','public',c=>rpc(c,'rpc_guest_house_status')),
  route('POST','/events/guest-house/open','user',async c=>{
    await requireGuestHouseEvent(c);
    const limit=await c.db(eventAdmin().rpc('rpc_check_rate_limit',{p_key:`guest_house_open:${c.user.id}`,p_max_burst:3,p_window_seconds:60}));
    if(!limit||typeof limit.allowed!=='boolean')throw Object.assign(new Error('Chưa kiểm tra được giới hạn truy cập.'),{status:503});
    if(!limit.allowed)throw Object.assign(new Error('Hãy thử lại sau.'),{status:429,code:'RATE_LIMIT_EXCEEDED',retryAfter:limit.retry_after||60});
    try{return await rpc(c,'rpc_guest_house_open');}catch(error){throw guestHouseError(error);}
  }),
  route('PATCH','/admin/system/guest-house','admin',async c=>{
    if(typeof c.body.enabled!=='boolean')throw Object.assign(new Error('enabled phải là boolean.'),{status:400});
    const admin=eventAdmin();
    const result=await c.db(admin.rpc('rpc_guest_house_set_enabled',{p_enabled:c.body.enabled}));
    // shortcut: cleanup runs in this request; use a durable worker if event volume exceeds request limits.
    for(const guest of result.cleanup||[]){
      for(let i=0;i<guest.paths.length;i+=100)await c.db(admin.storage.from('emoria-event-media').remove(guest.paths.slice(i,i+100)));
      await c.db(admin.rpc('rpc_guest_house_finish_cleanup',{p_user:guest.user_id}));
    }
    return {enabled:result.enabled};
  }),
  route('GET','/catalog','public',async c=>{
    const [products,settings]=await Promise.all([c.db(c.client.from('checkout_products').select('*, checkout_variants(*)').order('id')),c.db(c.client.from('store_settings').select('*').eq('id',true).single())]);
    return {products:products.map(product=>({...product,try_on_available:product.active&&!!tryOnConfig(product.id,product)})),settings};
  }),
  route('PUT','/admin/products/([^/]+)','admin',async c=>{
    if (c.body.product?.details) {
      if (typeof c.body.product.details !== 'object' || Buffer.byteLength(JSON.stringify(c.body.product.details)) > 65536) {
        throw Object.assign(new Error('Thông tin chi tiết sản phẩm không hợp lệ hoặc vượt quá dung lượng cho phép.'),{status:400});
      }
    }
    const res=await rpc(c,'rpc_save_catalog',{p_id:c.params[0],p_expected:c.body.expected??null,p_product:c.body.product,p_variants:c.body.variants});
    if(c.body.product?.details){
      await c.db(c.client.from('checkout_products').update({details:c.body.product.details}).eq('id',c.params[0]));
    }
    return res;
  }),
  route('PATCH','/admin/settings','admin',c=>c.db(c.client.from('store_settings').update(pick(c.body,settingKeys)).eq('id',true).select('id').single())),
  route('POST','/orders','user',c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.body.requestId||''))throw Object.assign(new Error('Thiếu requestId hợp lệ để chống tạo đơn trùng.'),{status:400});
    if(!Array.isArray(c.body.items)||!c.body.items.length||c.body.items.length>100||c.body.items.some(i=>!i||typeof i!=='object'))throw Object.assign(new Error('Giỏ hàng không hợp lệ.'),{status:400});
    return rpc(c,'rpc_create_order',{p_request_id:c.body.requestId,p_payload:normalizeCheckout(c.body)});
  },201),
  // The private lookup token belongs in a body, never an URL/access log.
  route('POST','/orders/lookup','public',c=>{
    const orderId = String(c.body.id||'').trim();
    if (!orderId || !/^EMO-[a-zA-Z0-9-]{6,36}$/i.test(orderId)) {
      throw Object.assign(new Error('Mã đơn hàng không hợp lệ.'), {status: 400});
    }
    const token = c.body.token ? String(c.body.token).trim() : null;
    if (token && !/^[a-zA-Z0-9_-]{16,128}$/.test(token)) {
      throw Object.assign(new Error('Mã truy cập đơn hàng không hợp lệ.'), {status: 400});
    }
    return rpc(c,'rpc_track_order',{p_order_id:orderId,p_token:token});
  }),
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
  route('POST','/contacts','public',c=>{
    const name = String(c.body.name || '').trim();
    const phone = String(c.body.phone || '').trim();
    const note = String(c.body.note || '').trim();
    if (!name || name.length > 100) throw Object.assign(new Error('Họ và tên phải từ 1 đến 100 ký tự.'),{status:400});
    if (!phone || !/^[0-9+() -]{8,20}$/.test(phone)) throw Object.assign(new Error('Số điện thoại không hợp lệ.'),{status:400});
    if (note.length > 2000) throw Object.assign(new Error('Ghi chú tối đa 2000 ký tự.'),{status:400});
    return c.db(eventAdmin().rpc('rpc_contact_guarded',{p_name:name,p_phone:phone,p_note:note||null,p_source:gatewayIdentity(c),p_caller:c.user?.id||null}));
  },201),
  route('GET','/admin/contacts','admin',c=>c.db(c.client.from('contact_requests').select('*').order('created_at',{ascending:false}).limit(100))),
  route('PATCH','/admin/contacts/([^/]+)','admin',c=>c.db(c.client.from('contact_requests').update({resolved:c.body.resolved===true}).eq('id',c.params[0]).select('id').single())),
  route('GET','/admin/memories','admin',c=>rpc(c,'rpc_admin_memory_spaces',{p_search:(c.query.get('search')||'').slice(0,120),p_offset:integer(c.query.get('page'),0)*25})),
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
  route('DELETE','/admin/articles/([^/]+)','admin',c=>rpc(c,'rpc_delete_article_admin',{p_article_id:c.params[0]})),
  route('GET','/me/saved-articles','user',c=>rpc(c,'rpc_saved_articles')),
  route('POST','/memories/([^/]+)/access','public',async c=>{
    const data=await rpc(c,'rpc_get_memory_view',{p_tag_uid:c.params[0],p_grant_token:c.body.grant??null});
    try{await eventAdmin().rpc('rpc_record_memory_tap',{p_tag_uid:c.params[0],p_source:gatewayIdentity(c),p_caller:c.user?.id||null});}catch{/* Telemetry never blocks access. */}
    if(data.is_unlocked&&(data.intro_video_path||data.audio_url?.startsWith('storage://')||data.media_gallery?.some(m=>m.url?.startsWith('storage://')))){
      data.media_signing=await signMemoryMedia(data,String(c.params[0]).toLowerCase().trim());
    }
    return data;
  }),
  route('POST','/memories/([^/]+)/grants','public',c=>{
    if(!c.params[0]||!/^[a-zA-Z0-9_-]{1,64}$/.test(c.params[0]))throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'),{status:400});
    const pin = typeof c.body.pin === 'string' || typeof c.body.pin === 'number' ? String(c.body.pin).trim() : '';
    if (!pin || pin.length > 32) throw Object.assign(new Error('Mã PIN không hợp lệ.'),{status:400});
    return c.db(eventAdmin().rpc('rpc_verify_memory_pin_guarded',{p_tag_uid:c.params[0],p_pin:pin,p_source:gatewayIdentity(c),p_caller:c.user?.id||null}));
  },201),
  route('POST','/memories/([^/]+)/claims','user',c=>{
    if(!c.params[0]||!/^[a-zA-Z0-9_-]{1,64}$/.test(c.params[0]))throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'),{status:400});
    const code = typeof c.body.code === 'string' ? c.body.code.trim() : '';
    if (!code || code.length < 4 || code.length > 32) throw Object.assign(new Error('Mã xác nhận sở hữu không hợp lệ.'),{status:400});
    return rpc(c,'rpc_claim_nfc_chip',{p_tag_uid:c.params[0],p_claim_code:code});
  },201),
  route('PATCH','/memories/([^/]+)','user',c=>rpc(c,'rpc_update_memory_space',{p_tag_uid:c.params[0],p_payload:c.body})),
  route('POST','/memories/([^/]+)/guestbook','public',c=>{
    if(!c.params[0]||!/^[a-zA-Z0-9_-]{1,64}$/.test(c.params[0]))throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'),{status:400});
    const name = String(c.body.name || '').trim();
    const message = String(c.body.message || '').trim();
    if (!name || name.length > 80) throw Object.assign(new Error('Tên phải từ 1 đến 80 ký tự.'),{status:400});
    if (!message || message.length > 1000) throw Object.assign(new Error('Lời nhắn phải từ 1 đến 1000 ký tự.'),{status:400});
    const relationship = c.body.relationship ? String(c.body.relationship).trim().slice(0, 80) : '';
    return rpc(c,'rpc_guestbook',{p_tag:c.params[0],p_token:c.body.grant??null,p_name:name,p_message:message,p_relationship:relationship});
  },201),
  route('POST','/memories/([^/]+)/guestbook/manage','user',c=>rpc(c,'rpc_memory_guestbook',{p_tag:c.params[0],p_id:c.body.id||null,p_action:c.body.action||'list'})),
  route('PATCH','/admin/memories/([^/]+)/availability','admin',c=>c.db(c.client.from('memory_spaces').update({availability_status:c.body.status,unlock_at:c.body.unlockDate||null,updated_at:new Date().toISOString()}).eq('tag_uid',c.params[0]).select('tag_uid').single())),
  route('GET','/me/profile','user',c=>rpc(c,'rpc_get_my_profile')),
  route('PATCH','/me/profile','user',async c=>{
    const previous=await rpc(c,'rpc_get_my_profile');
    return rpc(c,'rpc_update_my_profile',Object.fromEntries(['full_name','phone','birthday','gender','address','bio','avatar_url'].map(k=>[`p_${k}`,Object.hasOwn(c.body,k)?c.body[k]:previous[k]??null])));
  }),
  // Event Studios - Couple Match Studio
  route('POST','/events/matches','user',async c=>{

    const tag=c.body.tag_uid||c.body.tagUid||c.body.tag;
    if(tag != null && typeof tag!=='string')throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'),{status:400});
    return rpc(c,'rpc_match_create',{
      p_tag_uid:tag || null,
      p_title:c.body.title||'Mismatch',
      p_partner_name:c.body.partner_name||c.body.partnerName||null,
      p_owner_name:c.body.owner_name||c.body.ownerName||null
    });
  },201),
  route('GET','/events/matches','user',c=>rpc(c,'rpc_match_list',{p_tag_uid:null})),
  route('PUT','/events/matches/([^/]+)/questions','user',c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    if(!Array.isArray(c.body.questions)||c.body.questions.length>10)throw Object.assign(new Error('Số câu hỏi trong bản nháp tối đa là 10 câu.'),{status:400});
    return rpc(c,'rpc_match_save_questions',{
      p_match_id:c.params[0],
      p_questions:c.body.questions,
      p_title:c.body.title??null,
      p_partner_name:c.body.partner_name??c.body.partnerName??null,
      p_owner_name:c.body.owner_name??c.body.ownerName??null
    });
  }),
  route('GET','/events/matches/([^/]+)/draft','user',async c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    const draft=await rpc(c,'rpc_match_get_draft',{p_match_id:c.params[0]});
    if(draft&&Array.isArray(draft.questions)){
      const paths=draft.questions.map(q=>q.image_path).filter(Boolean);
      let signedMap={};
      if(paths.length>0){
        try{signedMap=await signEventPaths(paths);}catch{/* Bỏ ảnh nếu storage lỗi hoặc thiếu key */}
      }
      draft.questions=enrichMatchQuestionsWithSignedUrls(draft.questions,signedMap,{ownerDraft:true});
    }
    return draft;
  }),
  route('POST','/events/matches/([^/]+)/begin','user',async c=>{

    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    const res=await rpc(c,'rpc_match_begin',{p_match_id:c.params[0]});

    return res;
  }),
  route('POST','/events/matches/([^/]+)/cancel','user',c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    return rpc(c,'rpc_match_cancel',{p_match_id:c.params[0]});
  }),
  route('POST','/events/matches/([^/]+)/progress','public',async c=>{

    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    if(!Array.isArray(c.body.answers))throw Object.assign(new Error('Tiến độ câu trả lời phải là một mảng.'),{status:400});
    for(const a of c.body.answers){
      if(a!==null&&a!==undefined&&(!Number.isInteger(a)||a<0)){
        throw Object.assign(new Error('Đáp án câu hỏi phải là số nguyên không âm.'),{status:422});
      }
    }
    const token=c.body.invite_token||c.body.inviteToken||c.query.get('invite')||null;
    return rpc(c,'rpc_match_save_progress',{
      p_match_id:c.params[0],
      p_answers:c.body.answers,
      p_invite_token:token
    });
  }),
  route('POST','/events/matches/([^/]+)/submit','public',async c=>{

    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    if(!Array.isArray(c.body.answers))throw Object.assign(new Error('Đáp án nộp phải là một mảng.'),{status:400});
    for(const a of c.body.answers){
      if(a!==null&&a!==undefined&&(!Number.isInteger(a)||a<0)){
        throw Object.assign(new Error('Đáp án câu hỏi phải là số nguyên không âm.'),{status:422});
      }
    }
    const token=c.body.invite_token||c.body.inviteToken||c.query.get('invite')||null;
    const res=await rpc(c,'rpc_match_submit',{
      p_match_id:c.params[0],
      p_answers:c.body.answers,
      p_invite_token:token
    });
    try{
      if(res?.both_submitted){
        await c.client.rpc('rpc_track_event_action',{
          p_event_name:'match_both_completed',
          p_resource_type:'match',
          p_resource_id:c.params[0],
          p_dedupe_key:`dedupe:match:${c.params[0]}:both_completed`
        });
      }else if(res?.submitted){
        const isPartner=Boolean(token);
        const eventName=isPartner?'match_partner_completed':'match_owner_completed';
        const roleKey=isPartner?'partner':'owner';
        await c.client.rpc('rpc_track_event_action',{
          p_event_name:eventName,
          p_resource_type:'match',
          p_resource_id:c.params[0],
          p_dedupe_key:`dedupe:match:${c.params[0]}:${roleKey}_completed`
        });
      }
    }catch{}
    return res;
  }),
  route('GET','/events/matches/([^/]+)/view','public',async c=>{

    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    const token=c.query.get('invite')||c.query.get('invite_token')||null;
    const view=await rpc(c,'rpc_match_get_view',{
      p_match_id:c.params[0],
      p_invite_token:token
    });
    if(view&&Array.isArray(view.questions)){
      const paths=view.questions.map(q=>q.image_path).filter(Boolean);
      let signedMap={};
      if(paths.length>0){
        try{signedMap=await signEventPaths(paths);}catch{/* Bỏ ảnh nếu storage lỗi hoặc chưa cấu hình key */}
      }
      view.questions=enrichMatchQuestionsWithSignedUrls(view.questions,signedMap,{ownerDraft:view.role==='owner'&&view.status==='draft'});
    }
    return view;
  }),
  route('POST','/events/matches/([^/]+)/view','public',async c=>{

    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    const token=c.body.invite_token||c.body.inviteToken||c.body.invite||c.query.get('invite')||null;
    const view=await rpc(c,'rpc_match_get_view',{
      p_match_id:c.params[0],
      p_invite_token:token
    });
    if(view&&Array.isArray(view.questions)){
      const paths=view.questions.map(q=>q.image_path).filter(Boolean);
      let signedMap={};
      if(paths.length>0){
        try{signedMap=await signEventPaths(paths);}catch{/* Bỏ ảnh nếu storage lỗi hoặc chưa cấu hình key */}
      }
      view.questions=enrichMatchQuestionsWithSignedUrls(view.questions,signedMap,{ownerDraft:view.role==='owner'&&view.status==='draft'});
    }
    return view;
  }),
  route('GET','/memories/([^/]+)/matches','user',c=>{
    return rpc(c,'rpc_match_list',{p_tag_uid:c.params[0]});
  }),

  // Event Studios - Memory House Studio
  route('GET','/memories/([^/]+)/house/draft','user',async c=>{
    const draft=await rpc(c,'rpc_house_get_draft',{p_tag_uid:c.params[0]});
    if(draft&&Array.isArray(draft.rooms)){
      const paths=[];
      for(const r of draft.rooms){
        if(Array.isArray(r.memories)){
          for(const m of r.memories){
            if(m.photo_path)paths.push(m.photo_path);
          }
        }
      }
      let signedMap={};
      if(paths.length>0){
        try{signedMap=await signEventPaths(paths);}catch{/* Bỏ ảnh nếu storage lỗi hoặc chưa cấu hình key */}
      }
      draft.rooms=enrichHouseRoomsWithSignedUrls(draft.rooms,signedMap,{ownerDraft:true});
    }
    return draft;
  }),
  route('PUT','/memories/([^/]+)/house/draft','user',async c=>{
    if(c.body.title!==undefined&&typeof c.body.title!=='string')throw Object.assign(new Error('Tiêu đề không hợp lệ.'),{status:400});
    if(c.body.rooms!==undefined&&!Array.isArray(c.body.rooms))throw Object.assign(new Error('Danh sách phòng phải là một mảng.'),{status:400});
    await validateHousePreview(c.body.rooms,c.params[0],c.client);
    return rpc(c,'rpc_house_save_draft',{
      p_tag_uid:c.params[0],
      p_title:c.body.title??null,
      p_theme:c.body.theme??null,
      p_rooms:c.body.rooms??null
    });
  }),
  route('POST','/memories/([^/]+)/house/draft','user',async c=>{
    if(c.body.title!==undefined&&typeof c.body.title!=='string')throw Object.assign(new Error('Tiêu đề không hợp lệ.'),{status:400});
    if(c.body.rooms!==undefined&&!Array.isArray(c.body.rooms))throw Object.assign(new Error('Danh sách phòng phải là một mảng.'),{status:400});
    await validateHousePreview(c.body.rooms,c.params[0],c.client);
    return rpc(c,'rpc_house_save_draft',{
      p_tag_uid:c.params[0],
      p_title:c.body.title??null,
      p_theme:c.body.theme??null,
      p_rooms:c.body.rooms??null
    });
  }),
  route('POST','/memories/([^/]+)/house/publish','user',async c=>{
    const draft=await rpc(c,'rpc_house_get_draft',{p_tag_uid:c.params[0]});
    await validateHousePreview(draft?.rooms,c.params[0],c.client);
    if(process.env.NODE_ENV!=='test'&&!(process.env.SUPABASE_URL||'').startsWith('http://127.0.0.1:'))return enqueueHousePublish(c,c.params[0]);
    await moderateHousePhotos(c,c.params[0],draft);
    const res=await rpc(c,'rpc_house_publish',{p_tag_uid:c.params[0],expected_revision:draft.draft_revision});

    return res;
    },200),
  route('GET','/memories/([^/]+)/house/jobs/([^/]+)','user',async c=>{
    const job=await readHousePublishJob(c,c.params[1]);
    if(job.tag!==c.params[0])throw Object.assign(new Error('Không tìm thấy lượt xuất bản.'),{status:404});
    return job;
  }),
  route('POST','/memories/([^/]+)/house/jobs/([^/]+)/run','user',async c=>{
    const job=await readHousePublishJob(c,c.params[1]);
    if(job.tag!==c.params[0])throw Object.assign(new Error('Không tìm thấy lượt xuất bản.'),{status:404});
    await admitGateway(c,'job_run');
    if(['queued','processing','ready'].includes(job.status))await processHouseJobs({jobId:c.params[1]});
    return readHousePublishJob(c,c.params[1]);
  }),
  route('POST','/memories/([^/]+)/house/unpublish','user',c=>{
    return rpc(c,'rpc_house_unpublish',{p_tag_uid:c.params[0]});
  }),
  route('POST','/memories/([^/]+)/house/restore-layout','user',c=>rpc(c,'rpc_house_restore_layout',{p_tag_uid:c.params[0]})),
  route('POST','/memories/([^/]+)/house/revoke','user',c=>{
    return rpc(c,'rpc_house_revoke_share',{p_tag_uid:c.params[0]});
  }),
  route('GET','/events/houses/share/([^/]+)','public',async c=>{

    if(!c.params[0]||c.params[0].length>64)throw Object.assign(new Error('Mã liên kết không hợp lệ.'),{status:400});
    const view=await rpc(c,'rpc_house_public_view',{p_share_id:c.params[0]});
    await attachHousePreview(view,{shareId:c.params[0]});
    if(view&&Array.isArray(view.rooms)){
      const paths=[];
      for(const r of view.rooms){
        if(Array.isArray(r.memories)){
          for(const m of r.memories){
            if(m.photo_path)paths.push(m.photo_path);
          }
        }
      }
      let signedMap={};
      if(paths.length>0){
        try{signedMap=await signPublishedHousePaths(paths,view,{shareId:c.params[0]});}catch{/* Bỏ ảnh nếu storage lỗi hoặc chưa cấu hình key */}
      }
      view.rooms=enrichHouseRoomsWithSignedUrls(view.rooms,signedMap);
    }
    return view;
  }),
  route('GET','/events/houses/tag/([^/]+)','public',async c=>{

    if(!c.params[0]||c.params[0].length>64)throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'),{status:400});
    const view=await rpc(c,'rpc_house_tag_public_view',{p_tag_uid:c.params[0]});
    await attachHousePreview(view,{tagUid:c.params[0]});
    if(view&&Array.isArray(view.rooms)){
      const paths=[];
      for(const r of view.rooms){
        if(Array.isArray(r.memories)){
          for(const m of r.memories){
            if(m.photo_path)paths.push(m.photo_path);
          }
        }
      }
      let signedMap={};
      if(paths.length>0){
        try{signedMap=await signPublishedHousePaths(paths,view,{tagUid:c.params[0]});}catch{/* Bỏ ảnh nếu storage lỗi hoặc chưa cấu hình key */}
      }
      view.rooms=enrichHouseRoomsWithSignedUrls(view.rooms,signedMap);
    }
    return view;
  }),

  // Event Studios - Media Signing Endpoint (chỉ cho phép owner ký ảnh thuộc memory space của chính mình)
  route('POST','/events/media/sign','user',async c=>{

    const rawPaths=Array.isArray(c.body.paths)?c.body.paths:(c.body.path?[c.body.path]:[]);
    if(rawPaths.length===0)throw Object.assign(new Error('Danh sách đường dẫn không được rỗng.'),{status:400});
    if(rawPaths.length>50)throw Object.assign(new Error('Tối đa 50 đường dẫn mỗi lần yêu cầu.'),{status:400});
    const tags=new Set();
    for(const p of rawPaths){
      if(typeof p!=='string'||!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(p.trim())){
        throw Object.assign(new Error('Đường dẫn không hợp lệ hoặc chứa ký tự nguy hiểm.'),{status:400});
      }
      tags.add(p.trim().split('/')[0].toLowerCase());
    }
    const myMemories=await rpc(c,'rpc_my_memories');
    const ownedTags=new Set(
      (Array.isArray(myMemories)?myMemories:[])
        .filter(m=>m.role==='owner')
        .map(m=>String(m.tag_uid||'').toLowerCase())
    );
    ownedTags.add(`match_${c.user.id}`);
    for(const tag of tags){
      if(!ownedTags.has(tag)){
        throw Object.assign(new Error(`Từ chối quyền: Bạn không sở hữu kỷ vật mang mã ${tag}.`),{status:403});
      }
    }
    const signedMap=await signEventPaths(rawPaths);
    return {signed:signedMap};
  }),

  route('POST','/events/matches/([^/]+)/stream','public',streamMatch),
  route('POST','/storage/uploads/reserve','user',c=>c.db(eventAdmin().rpc('rpc_reserve_storage_upload',{p_bucket:c.body.bucket,p_path:c.body.path,p_bytes:c.body.bytes,p_mime:c.body.mime,p_caller:c.user.id})),201),
  route('POST','/storage/uploads/cancel','user',c=>c.db(eventAdmin().rpc('rpc_cancel_storage_upload',{p_bucket:c.body.bucket,p_path:c.body.path,p_caller:c.user.id}))),
  route('POST','/events/houses/replies','public',async c=>{
    const {share_id, tag_uid, kind, name, message, request_id} = c.body || {};
    if (!request_id || typeof request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request_id)) {
      throw Object.assign(new Error('Mã yêu cầu không hợp lệ để chống trùng lặp tin nhắn.'), {status: 400});
    }
    if (!kind || !['heart', 'message'].includes(kind)) {
      throw Object.assign(new Error('Loại phản hồi không hợp lệ.'), {status: 400});
    }
    const cleanName = String(name || '').trim();
    if (!cleanName || cleanName.length > 80) {
      throw Object.assign(new Error('Tên người gửi phải từ 1 đến 80 ký tự.'), {status: 400});
    }
    const cleanMessage = String(message || '').trim();
    if (cleanMessage.length > 1000) {
      throw Object.assign(new Error('Lời nhắn tối đa 1000 ký tự.'), {status: 400});
    }
    const cleanShareId = share_id ? String(share_id).trim() : null;
    const cleanTagUid = tag_uid ? String(tag_uid).trim() : null;
    if (!cleanShareId && !cleanTagUid) {
      throw Object.assign(new Error('Thiếu thông tin căn nhà để gửi lời nhắn.'), {status: 400});
    }
    if (cleanShareId && !/^[a-zA-Z0-9_-]{1,64}$/.test(cleanShareId)) {
      throw Object.assign(new Error('Mã chia sẻ không hợp lệ.'), {status: 400});
    }
    if (cleanTagUid && !/^[a-zA-Z0-9_-]{1,64}$/.test(cleanTagUid)) {
      throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'), {status: 400});
    }
    return eventRpc(c, 'house_reply', {
      share_id: cleanShareId,
      tag_uid: cleanTagUid,
      kind,
      name: cleanName,
      message: cleanMessage,
      request_id
    });
  },201),
  route('GET','/memories/([^/]+)/house/replies','user',c=>eventRpc(c,'house_replies',{p_tag_uid:c.params[0]})),
  // Event Studios - Content Reporting
  route('POST','/events/reports','public',async c=>{
    const {resource_type,resource_id,reason,details,invite_token}=c.body || {};
    if(!resource_type||!resource_id||!reason)throw Object.assign(new Error('Dữ liệu báo cáo không đầy đủ.'),{status:400});
    if(!['house','match','guestbook'].includes(resource_type)){
      throw Object.assign(new Error('Loại tài nguyên báo cáo không hợp lệ.'),{status:400});
    }
    const strResId = String(resource_id).trim();
    if (['match','guestbook'].includes(resource_type) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strResId)) {
      throw Object.assign(new Error('Mã đối tượng báo cáo không hợp lệ.'),{status:400});
    }
    if (resource_type === 'house' && (!/^[a-zA-Z0-9_-]{1,64}$/.test(strResId))) {
      throw Object.assign(new Error('Mã ngôi nhà báo cáo không hợp lệ.'),{status:400});
    }
    const cleanReason = String(reason).trim();
    if (!cleanReason || cleanReason.length > 100) {
      throw Object.assign(new Error('Lý do báo cáo không hợp lệ.'),{status:400});
    }
    const cleanDetails = details ? String(details).trim().slice(0, 1000) : null;
    return rpc(c,'rpc_submit_content_report',{
      p_resource_type:resource_type,
      p_resource_id:strResId,
      p_reason:cleanReason,
      p_details:cleanDetails,
      invite_token:invite_token||null
    });
  },201),
  // Event Studios - Analytics Tracking Ingestion
  route('POST','/events/analytics/track','public',async c=>{
    const {event_name,resource_type,resource_id,dedupe_key,metadata}=c.body || {};
    if(!event_name||!resource_type||!resource_id)throw Object.assign(new Error('Dữ liệu sự kiện không hợp lệ.'),{status:400});
    const clientAllowedEvents=[
      'match_invite_opened','house_opened_share','house_share_click','house_copy_link',
      'house_postcard_download','house_postcard_shared'
    ];
    if(!clientAllowedEvents.includes(event_name)){
      throw Object.assign(new Error('Sự kiện mang tính thẩm quyền chỉ được ghi nhận từ hệ thống máy chủ.'),{status:403});
    }
    if(!['house','match'].includes(resource_type)){
      throw Object.assign(new Error('Loại tài nguyên không hợp lệ.'),{status:400});
    }
    const strResId = String(resource_id).trim();
    if(resource_type==='match'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strResId)){
      throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    }
    if(resource_type==='house'&&!/^[a-zA-Z0-9_-]{1,64}$/.test(strResId)){
      throw Object.assign(new Error('Mã ngôi nhà không hợp lệ.'),{status:400});
    }
    let safeMetadata = {};
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      if (Buffer.byteLength(JSON.stringify(metadata)) <= 8192) {
        safeMetadata = metadata;
      }
    }
    return rpc(c,'rpc_track_event_action',{
      p_event_name:event_name,
      p_resource_type:resource_type,
      p_resource_id:strResId,
      p_dedupe_key:dedupe_key ? String(dedupe_key).slice(0, 128) : null,
      p_metadata:safeMetadata
    });
  }),
  // Admin - Event Content Reports & Moderation
  route('GET','/admin/events/reports','admin',c=>{
    const status=c.query.get('status')||null;
    const limit=Math.min(100,Math.max(1,parseInt(c.query.get('limit')||'50',10)));
    const offset=Math.max(0,parseInt(c.query.get('offset')||'0',10));
    return rpc(c,'rpc_admin_list_reports',{
      p_status:status,
      p_limit:limit,
      p_offset:offset
    });
  }),
  route('POST','/admin/events/moderate','admin',c=>{
    const {report_id,action,reason}=c.body || {};
    if(!report_id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(report_id).trim())) {
      throw Object.assign(new Error('Mã báo cáo không hợp lệ.'),{status:400});
    }
    if(!action||!['hide','restore','dismiss'].includes(action)) {
      throw Object.assign(new Error('Hành động kiểm duyệt không hợp lệ.'),{status:400});
    }
    const cleanReason = reason ? String(reason).trim().slice(0, 500) : null;
    return rpc(c,'rpc_admin_moderate_content',{
      p_report_id:String(report_id).trim(),
      p_action:action,
      p_reason:cleanReason
    });
  }),
  route('GET','/admin/events/analytics/summary','admin',c=>{
    const days=Math.min(180,Math.max(1,parseInt(c.query.get('days')||'30',10)));
    return rpc(c,'rpc_get_event_analytics_summary',{
      p_days:days
    });
  }),
];
