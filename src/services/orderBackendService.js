import {supabase,isSupabaseConfigured} from '../lib/supabaseClient.js';
export function normalizeCheckout(payload) {
  const method = ['vietqr', 'sepay', 'cod'].includes(payload.paymentMethod) ? payload.paymentMethod : 'cod';
  return {customerName:String(payload.customerName||'').trim(),phone:String(payload.phone||'').replace(/\D/g,''),email:String(payload.email||'').trim().toLowerCase(),address:String(payload.address||'').trim(),city:String(payload.city||''),note:String(payload.note||'').trim(),paymentMethod:method,hasGiftBox:Boolean(payload.hasGiftBox||payload.items?.some(i=>i.isGift)),items:(payload.items||[]).map(i=>({id:i.id,size:i.size||'Tiêu chuẩn',quantity:i.quantity??1,isGift:Boolean(i.isGift)}))};
}
export async function createOrder(payload) {
 if(!isSupabaseConfigured())return {success:false,retryable:false,error:'Chưa kết nối máy chủ. Chưa tạo đơn hàng.'};
 const normalized=normalizeCheckout(payload);
 if(!normalized.customerName||!normalized.address||!/^\d{9,11}$/.test(normalized.phone)||!normalized.items.length)return {success:false,retryable:false,error:'Kiểm tra họ tên, số điện thoại, địa chỉ và giỏ hàng.'};
 if (typeof window !== 'undefined') {
   const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
   if (!sessionData?.session?.user) {
     return { success: false, retryable: false, error: 'Vui lòng đăng nhập hoặc đăng ký tài khoản để tiến hành đặt hàng.' };
   }
 }
 try {
  const {data,error}=await supabase.rpc('rpc_create_order',{p_request_id:payload.requestId||crypto.randomUUID(),p_payload:normalized});
  if(error){const definite=/^(P0001|22|23|42501)/.test(error.code||'');return {success:false,retryable:!definite,error:definite?error.message:'Chưa xác định được kết quả đặt đơn. Dùng nút gửi lại cùng yêu cầu để tránh đơn trùng.'};}
  if(!data?.success||!data.order?.id||!data.order?.totals)return {success:false,retryable:true,error:'Chưa xác nhận được kết quả từ máy chủ. Hãy gửi lại cùng yêu cầu.'};
  return {success:true,order:{...data.order,totals:{...data.order.totals,formattedTotal:new Intl.NumberFormat('vi-VN').format(data.order.totals.finalTotal)+' VNĐ'}}};
 }catch{return {success:false,retryable:true,error:'Kết nối bị gián đoạn. Gửi lại cùng yêu cầu khi có mạng; hệ thống sẽ không tạo thêm đơn.'};}
}
export async function trackOrderSecure(id,token) {
 if(!isSupabaseConfigured())throw new Error('Chưa kết nối máy chủ.');
 if(!id || !String(id).trim())throw new Error('Vui lòng nhập mã đơn hàng.');
 const {data,error}=await supabase.rpc('rpc_track_order',{p_order_id:String(id).trim(),p_token:token?String(token).trim():null});
 if(error)throw new Error(['PGRST202','PGRST203'].includes(error.code)?'Dịch vụ tra cứu cần được cập nhật. Vui lòng liên hệ cửa hàng.':'Chưa tải được đơn từ máy chủ. Vui lòng thử lại; đây không phải xác nhận đơn không tồn tại.');
 if(!data?.success)throw new Error(data?.message||'Không tìm thấy đơn hoặc mã tra cứu không đúng.');
 return data.order;
}
export async function updateOrderStatus(id,status,tracking=null) {
 if(!isSupabaseConfigured())throw new Error('Chưa kết nối máy chủ.');
 const {data,error}=await supabase.rpc('rpc_order_status',{p_order_id:id,p_status:status,p_tracking:tracking});
 if(error||!data?.success)throw new Error(error?.message||data?.message||'Không thể cập nhật đơn.');
 return data;
}
export async function listOrdersForAdmin(page = 0, search = '', status = '') {
  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });
      const term=search.replace(/[^a-zA-Z0-9@+ ._-]/g,'').trim();
      if(term)query=query.or(`id.ilike.%${term}%,phone.ilike.%${term}%,tracking_number.ilike.%${term}%`);
      if(status)query=query.eq('status',status);
      const { data, error } = await query.range(page * 25, page * 25 + 24);

      if (error) throw new Error(error.message);
      if (data) {
        return data.map(o => ({
          id: o.id,
          customerName: o.customer_name,
          phone: o.phone,
          email: o.email,
          address: o.address,
          city: o.city,
          note: o.note,
          paymentMethod: o.payment_method,
          paymentProvider: o.payment_provider || (o.payment_method === 'sepay' ? 'sepay' : null),
          paymentId: o.payment_id,
          status: o.status,
          totals: { finalTotal: o.final_total },
          createdAt: o.created_at,
          isTest:o.is_test,trackingNumber:o.tracking_number,
          shippingCarrier:o.shipping_carrier,deliveryEstimate:o.delivery_estimate,shippingNote:o.shipping_note,
          shippedAt:o.shipped_at,deliveredAt:o.delivered_at,hasGiftBox:o.gift_wrap_fee>0,
          paymentStatus:o.payment_status,paidAmount:o.paid_amount||0,paidAt:o.paid_at,
          items: (o.order_items || []).map(it => ({
            id: it.product_id,
            orderItemId:it.id,
            name: it.product_name,
            size: it.size,
            price: it.unit_price,
            quantity: it.quantity,
            unitsPerItem: it.units_per_item || 1,
            isGift: it.is_gift,
            image: it.image_url,
          })),
        }));
      }
    } catch (e) {
      throw e;
    }
  }

  throw new Error('Chưa kết nối máy chủ.');
}
