// Explicit resource routes. SQL functions remain the transaction boundary.
import {createClient} from '@supabase/supabase-js';
import {normalizeCheckout} from '../src/services/checkoutPayload.js';
import {analyzeVideo,readVideoLabels,readVideoUploads} from './videoLabels.js';
import {craftLetter} from './geminiLetter.js';
import {tryOnConfig} from './tryOn.js';
import {signEventPaths,enrichMatchQuestionsWithSignedUrls,enrichHouseRoomsWithSignedUrls} from './eventMedia.js';
const route=(method,path,access,run,status)=>({method,pattern:new RegExp(`^${path}$`),access,run,status});
const rpc=(c,name,args={})=>c.db(c.client.rpc(name,args));
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
  route('GET','/catalog','public',async c=>{
    const [products,settings]=await Promise.all([c.db(c.client.from('checkout_products').select('*, checkout_variants(*)').order('id')),c.db(c.client.from('store_settings').select('*').eq('id',true).single())]);
    return {products:products.map(product=>({...product,try_on_available:product.active&&!!tryOnConfig(product.id,product)})),settings};
  }),
  route('PUT','/admin/products/([^/]+)','admin',async c=>{
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
  route('GET','/me/saved-articles','user',c=>rpc(c,'rpc_saved_articles')),
  route('POST','/memories/([^/]+)/access','public',c=>rpc(c,'rpc_get_memory_view',{p_tag_uid:c.params[0],p_grant_token:c.body.grant??null})),
  route('POST','/memories/([^/]+)/grants','public',c=>rpc(c,'rpc_verify_memory_pin',{p_tag_uid:c.params[0],p_pin:c.body.pin}),201),
  route('POST','/memories/([^/]+)/claims','user',c=>rpc(c,'rpc_claim_nfc_chip',{p_tag_uid:c.params[0],p_claim_code:c.body.code}),201),
  route('PATCH','/memories/([^/]+)','user',c=>rpc(c,'rpc_update_memory_space',{p_tag_uid:c.params[0],p_payload:c.body})),
  route('POST','/memories/([^/]+)/guestbook','public',c=>rpc(c,'rpc_guestbook',{p_tag:c.params[0],p_token:c.body.grant??null,p_name:c.body.name,p_message:c.body.message,p_relationship:c.body.relationship||''}),201),
  route('POST','/memories/([^/]+)/guestbook/manage','user',c=>rpc(c,'rpc_memory_guestbook',{p_tag:c.params[0],p_id:c.body.id||null,p_action:c.body.action||'list'})),
  route('PATCH','/admin/memories/([^/]+)/availability','admin',c=>c.db(c.client.from('memory_spaces').update({availability_status:c.body.status,unlock_at:c.body.unlockDate||null,updated_at:new Date().toISOString()}).eq('tag_uid',c.params[0]).select('tag_uid').single())),
  route('GET','/me/profile','user',c=>rpc(c,'rpc_get_my_profile')),
  route('PATCH','/me/profile','user',async c=>{
    const previous=await rpc(c,'rpc_get_my_profile');
    return rpc(c,'rpc_update_my_profile',Object.fromEntries(['full_name','phone','birthday','gender','address','bio','avatar_url'].map(k=>[`p_${k}`,Object.hasOwn(c.body,k)?c.body[k]:previous[k]??null])));
  }),
  // Event Studios - Couple Match Studio
  route('POST','/events/matches','user',c=>{
    const tag=c.body.tag_uid||c.body.tagUid||c.body.tag;
    if(!tag||typeof tag!=='string')throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'),{status:400});
    return rpc(c,'rpc_match_create',{
      p_tag_uid:tag,
      p_title:c.body.title||'Couple Match',
      p_partner_name:c.body.partner_name||c.body.partnerName||null,
      p_owner_name:c.body.owner_name||c.body.ownerName||null
    });
  },201),
  route('PUT','/events/matches/([^/]+)/questions','user',c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    if(!Array.isArray(c.body.questions)||c.body.questions.length<3||c.body.questions.length>7)throw Object.assign(new Error('Số câu hỏi phải từ 3 đến 7 câu.'),{status:400});
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
      draft.questions=enrichMatchQuestionsWithSignedUrls(draft.questions,signedMap);
    }
    return draft;
  }),
  route('POST','/events/matches/([^/]+)/begin','user',c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    return rpc(c,'rpc_match_begin',{p_match_id:c.params[0]});
  }),
  route('POST','/events/matches/([^/]+)/progress','public',c=>{
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
  route('POST','/events/matches/([^/]+)/submit','public',c=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.params[0]))throw Object.assign(new Error('Mã lượt chơi không hợp lệ.'),{status:400});
    if(!Array.isArray(c.body.answers))throw Object.assign(new Error('Đáp án nộp phải là một mảng.'),{status:400});
    for(const a of c.body.answers){
      if(a!==null&&a!==undefined&&(!Number.isInteger(a)||a<0)){
        throw Object.assign(new Error('Đáp án câu hỏi phải là số nguyên không âm.'),{status:422});
      }
    }
    const token=c.body.invite_token||c.body.inviteToken||c.query.get('invite')||null;
    return rpc(c,'rpc_match_submit',{
      p_match_id:c.params[0],
      p_answers:c.body.answers,
      p_invite_token:token
    });
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
      view.questions=enrichMatchQuestionsWithSignedUrls(view.questions,signedMap);
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
      view.questions=enrichMatchQuestionsWithSignedUrls(view.questions,signedMap);
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
      draft.rooms=enrichHouseRoomsWithSignedUrls(draft.rooms,signedMap);
    }
    return draft;
  }),
  route('PUT','/memories/([^/]+)/house/draft','user',c=>{
    if(c.body.title!==undefined&&typeof c.body.title!=='string')throw Object.assign(new Error('Tiêu đề không hợp lệ.'),{status:400});
    if(c.body.rooms!==undefined&&!Array.isArray(c.body.rooms))throw Object.assign(new Error('Danh sách phòng phải là một mảng.'),{status:400});
    return rpc(c,'rpc_house_save_draft',{
      p_tag_uid:c.params[0],
      p_title:c.body.title??null,
      p_theme:c.body.theme??null,
      p_rooms:c.body.rooms??null
    });
  }),
  route('POST','/memories/([^/]+)/house/publish','user',c=>{
    return rpc(c,'rpc_house_publish',{p_tag_uid:c.params[0]});
  }),
  route('POST','/memories/([^/]+)/house/unpublish','user',c=>{
    return rpc(c,'rpc_house_unpublish',{p_tag_uid:c.params[0]});
  }),
  route('POST','/memories/([^/]+)/house/revoke','user',c=>{
    return rpc(c,'rpc_house_revoke_share',{p_tag_uid:c.params[0]});
  }),
  route('GET','/events/houses/share/([^/]+)','public',async c=>{
    if(!c.params[0]||c.params[0].length>64)throw Object.assign(new Error('Mã liên kết không hợp lệ.'),{status:400});
    const view=await rpc(c,'rpc_house_public_view',{p_share_id:c.params[0]});
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
        try{signedMap=await signEventPaths(paths);}catch{/* Bỏ ảnh nếu storage lỗi hoặc chưa cấu hình key */}
      }
      view.rooms=enrichHouseRoomsWithSignedUrls(view.rooms,signedMap);
    }
    return view;
  }),
  route('GET','/events/houses/tag/([^/]+)','public',async c=>{
    if(!c.params[0]||c.params[0].length>64)throw Object.assign(new Error('Mã kỷ vật không hợp lệ.'),{status:400});
    const view=await rpc(c,'rpc_house_tag_public_view',{p_tag_uid:c.params[0]});
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
        try{signedMap=await signEventPaths(paths);}catch{/* Bỏ ảnh nếu storage lỗi hoặc chưa cấu hình key */}
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
    for(const tag of tags){
      if(!ownedTags.has(tag)){
        throw Object.assign(new Error(`Từ chối quyền: Bạn không sở hữu kỷ vật mang mã ${tag}.`),{status:403});
      }
    }
    const signedMap=await signEventPaths(rawPaths);
    return {signed:signedMap};
  }),
];
