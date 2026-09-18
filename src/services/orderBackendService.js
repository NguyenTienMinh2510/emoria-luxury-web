import {supabase,isSupabaseConfigured} from '../lib/supabaseClient.js';
import {apiRequest} from './apiClient.js';
import {normalizeCheckout} from './checkoutPayload.js';
export {normalizeCheckout} from './checkoutPayload.js';
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
  const data=await apiRequest('/orders',{method:'POST',body:{...normalized,requestId:payload.requestId||crypto.randomUUID()}});
  if(!data?.success||!data.order?.id||!data.order?.totals)return {success:false,retryable:true,error:'Chưa xác nhận được kết quả từ máy chủ. Hãy gửi lại cùng yêu cầu.'};
  return {success:true,order:{...data.order,totals:{...data.order.totals,formattedTotal:new Intl.NumberFormat('vi-VN').format(data.order.totals.finalTotal)+' VNĐ'}}};
 }catch(error){if(error.status>=400&&error.status<500)return {success:false,retryable:false,error:error.message};return {success:false,retryable:true,error:'Kết nối bị gián đoạn. Gửi lại cùng yêu cầu khi có mạng; hệ thống sẽ không tạo thêm đơn.'};}
}
export async function trackOrderSecure(id,token) {
 if(!isSupabaseConfigured())throw new Error('Chưa kết nối máy chủ.');
 if(!id || !String(id).trim())throw new Error('Vui lòng nhập mã đơn hàng.');
 const data=await apiRequest('/orders/lookup',{method:'POST',body:{id:String(id).trim(),token:token?String(token).trim():null}});
 if(!data?.success)throw new Error(data?.message||'Không tìm thấy đơn hoặc mã tra cứu không đúng.');
 return data.order;
}
export async function updateOrderStatus(id,status,tracking=null) {
 if(!isSupabaseConfigured())throw new Error('Chưa kết nối máy chủ.');
 return apiRequest(`/admin/orders/${encodeURIComponent(id)}/status`,{method:'PATCH',body:{status,tracking}});
}
export async function listOrdersForAdmin(page = 0, search = '', status = '') {
  if (isSupabaseConfigured()) {
    try {
      const data=await apiRequest('/admin/orders?'+new URLSearchParams({page,search,status}));
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
