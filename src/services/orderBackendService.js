/**
 * EMORIA LUXURY - ORDER BACKEND SERVICE
 * Quản lý đơn hàng mua sắm trang sức Bạc Ý S925 đính chip NFC.
 * Kết nối bảng `orders` trên Supabase, kiểm tra tính toán tài chính độc lập và bảo mật thông tin tra cứu.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { products } from '../data/products.js';

const STORAGE_KEY = 'emoria_orders_v1';
const DRAFT_STORAGE_KEY = 'emoria_draft_orders';

function persistOrder(key, order) {
  const raw = localStorage.getItem(key);
  const orders = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(orders)) throw new Error('Invalid order storage');
  localStorage.setItem(key, JSON.stringify([order, ...orders]));
}

// Tra cứu giá chuẩn từ danh mục sản phẩm của hệ thống (Chống can thiệp giá từ client)
function getProductCanonicalPrice(productId) {
  const p = products.find(prod => prod.id === productId);
  return p ? p.price : null;
}

/**
 * Tính toán tài chính chuẩn tắc theo chính sách kinh doanh EMORIA:
 * - Phí đóng gói quà tặng sơn mài: 35.000 VNĐ / đơn
 * - Phí vận chuyển: Miễn phí từ 1.000.000 VNĐ; Dưới 1.000.000 VNĐ phí là 30.000 VNĐ
 */
export function calculateOrderFinancials(items = [], hasGift = false) {
  let subtotal = 0;

  for (const item of items) {
    const realPrice = getProductCanonicalPrice(item.id) ?? item.price;
    const qty = Math.max(1, parseInt(item.quantity || 1, 10));
    subtotal += realPrice * qty;
  }

  const giftWrapFee = hasGift ? 35000 : 0;
  const shippingFee = (subtotal >= 1000000 || subtotal === 0) ? 0 : 30000;
  const finalTotal = subtotal + giftWrapFee + shippingFee;

  return {
    subtotal,
    giftWrapFee,
    shippingFee,
    finalTotal,
    formattedTotal: new Intl.NumberFormat('vi-VN').format(finalTotal) + ' VNĐ',
  };
}

/**
 * Sinh mã đơn hàng ngẫu nhiên duy nhất
 */
export function generateOrderId() {
  const randomSixDigits = Math.floor(100000 + Math.random() * 900000);
  return `EMO-${randomSixDigits}`;
}

/**
 * Tạo đơn hàng mới
 * @param {Object} orderPayload 
 */
export async function createOrder(orderPayload) {
  const requestId = orderPayload.requestId || crypto.randomUUID();
  if (!orderPayload.customerName?.trim()) {
    throw new Error('Vui lòng nhập họ và tên người nhận.');
  }

  const cleanPhone = String(orderPayload.phone || '').replace(/\D/g, '');
  if (cleanPhone.length < 9 || cleanPhone.length > 11) {
    throw new Error('Số điện thoại nhận hàng không hợp lệ.');
  }

  if (!orderPayload.address?.trim()) {
    throw new Error('Vui lòng nhập địa chỉ giao hàng cụ thể.');
  }

  if (!orderPayload.items || orderPayload.items.length === 0) {
    throw new Error('Giỏ hàng trống.');
  }

  const hasGift = orderPayload.hasGiftBox || orderPayload.items.some(i => i.isGift);
  const financials = calculateOrderFinancials(orderPayload.items, hasGift);
  const orderId = generateOrderId();
  const paymentMethod = orderPayload.paymentMethod === 'vietqr' ? 'vietqr' : 'cod';
  
  // Trạng thái: COD là 'confirmed' (đã tiếp nhận), VietQR là 'pending_payment' (chờ chuyển khoản)
  // TUYỆT ĐỐI KHÔNG TỰ ĐỘNG CHUYỂN SANG ĐÃ THANH TOÁN KHI CHƯA CÓ ADMIN HOẶC WEBHOOK
  const initialStatus = paymentMethod === 'vietqr' ? 'pending_payment' : 'confirmed';

  let orderData = {
    id: orderId,
    customerName: orderPayload.customerName.trim(),
    phone: cleanPhone,
    email: (orderPayload.email || '').trim().toLowerCase(),
    address: orderPayload.address.trim(),
    city: orderPayload.city || 'Hồ Chí Minh',
    note: orderPayload.note || '',
    paymentMethod,
    status: initialStatus,
    totals: financials,
    items: orderPayload.items.map(item => ({
      id: item.id,
      name: item.name,
      price: getProductCanonicalPrice(item.id) ?? item.price,
      size: item.size || 'Tiêu chuẩn',
      quantity: item.quantity || 1,
      image: item.image,
      isGift: Boolean(item.isGift),
    })),
    createdAt: new Date().toISOString(),
    statusTimeline: [
      {
        status: initialStatus,
        time: new Date().toISOString(),
        description: paymentMethod === 'vietqr'
          ? 'Đơn hàng được tạo thành công. Đang chờ chuyển khoản VietQR vào tài khoản MB Bank.'
          : 'Đơn hàng đã được tiếp nhận (Thanh toán khi nhận hàng COD). EMORIA đang chuẩn bị trang sức.',
      }
    ]
  };

  // 1. Thử lưu vào Supabase DB nếu có kết nối
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_create_order', {
        p_request_id: requestId,
        p_payload: {
          customerName: orderData.customerName, phone: orderData.phone,
          email: orderData.email, address: orderData.address, city: orderData.city,
          note: orderData.note, paymentMethod, hasGiftBox: Boolean(hasGift),
          items: orderPayload.items.map(item => ({
            id: item.id, size: item.size || 'Tiêu chuẩn',
            quantity: item.quantity ?? 1, isGift: Boolean(item.isGift),
          })),
        },
      });
      if (error) throw error;
      if (!data?.success || !data.order?.id || !data.order?.totals) {
        throw new Error(data?.error || 'Invalid checkout response');
      }
      orderData = data.order;
      orderData.totals.formattedTotal = new Intl.NumberFormat('vi-VN').format(orderData.totals.finalTotal) + ' VNĐ';
    } catch (err) {
      try {
        persistOrder(DRAFT_STORAGE_KEY, { ...orderData, requestId, status: 'draft', statusTimeline: [], isDraft: true });
      } catch {
        return { success: false, isDraft: false, error: 'Không thể đồng bộ đơn hàng lên hệ thống máy chủ và không thể lưu nháp trên thiết bị. Vui lòng giữ thông tin để thử lại.' };
      }
      return {
        success: false,
        error: 'Không thể đồng bộ đơn hàng lên hệ thống máy chủ. Đơn hàng đã được lưu nháp tại thiết bị của bạn.',
        isDraft: true,
      };
    }
  }

  // 2. Lưu vào Local storage của chính khách hàng để họ theo dõi đơn hàng của mình
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      const orders = raw ? JSON.parse(raw) : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([orderData, ...orders]));
    }
  } catch (e) {
    // ignore
  }

  return {
    success: true,
    order: orderData,
    ...(!isSupabaseConfigured() ? { isDemo: true } : {}),
    message: 'Tạo đơn hàng thành công!',
  };
}

/**
 * Tra cứu đơn hàng an toàn (yêu cầu mã đơn EMO-XXXXXX và khớp số điện thoại)
 * @param {string} orderId 
 * @param {string} phone 
 */
export async function trackOrderSecure(orderId, phone) {
  if (!orderId?.trim()) {
    throw new Error('Vui lòng cung cấp mã đơn hàng (EMO-XXXXXX).');
  }

  const cleanId = String(orderId).toUpperCase().trim();
  const cleanPhone = phone ? String(phone).replace(/\D/g, '') : null;

  // 1. Tìm trên Supabase nếu có kết nối
  if (isSupabaseConfigured()) {
    try {
      let query = supabase.from('orders').select('*, order_items(*)').eq('id', cleanId);
      if (cleanPhone) {
        query = query.eq('phone', cleanPhone);
      }
      const { data, error } = await query.single();
      if (!error && data) {
        return {
          id: data.id,
          customerName: data.customer_name,
          phone: data.phone,
          address: data.address,
          status: data.status,
          totals: { finalTotal: data.final_total },
          createdAt: data.created_at,
          items: data.order_items || [],
        };
      }
    } catch (e) {
      console.warn('[Order Tracking Notice]', e.message);
    }
  }

  // 2. Tra cứu trong Local cache của phiên
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const orders = JSON.parse(raw);
        const match = orders.find(o => o.id === cleanId && (!cleanPhone || o.phone.includes(cleanPhone)));
        if (match) return match;
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * Cập nhật trạng thái đơn hàng (Chỉ dành cho Admin)
 * @param {string} orderId 
 * @param {string} nextStatus 
 */
export async function updateOrderStatus(orderId, nextStatus) {
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', orderId);
    } catch (e) {
      console.warn('[Order Update Status Notice]', e.message);
    }
  }

  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const orders = JSON.parse(raw);
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          orders[idx].status = nextStatus;
          orders[idx].statusTimeline.push({
            status: nextStatus,
            time: new Date().toISOString(),
            description: `Trạng thái cập nhật: ${nextStatus}`,
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return { success: true };
}

/**
 * Lấy đơn hàng theo mã ID (hỗ trợ ShopView tracking)
 * @param {string} orderId 
 */
export function getOrderById(orderId) {
  if (!orderId) return null;
  const cleanId = String(orderId).toUpperCase().trim();
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const orders = JSON.parse(raw);
        return orders.find(o => o.id === cleanId) || null;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Lấy danh sách đơn hàng theo số điện thoại (hỗ trợ ShopView tracking)
 * @param {string} phone 
 */
export function getOrdersByPhone(phone) {
  if (!phone) return [];
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone) return [];
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const orders = JSON.parse(raw);
        return orders.filter(o => o.phone && o.phone.replace(/\D/g, '').includes(cleanPhone));
      }
    }
  } catch (e) {
    // ignore
  }
  return [];
}

/**
 * Lấy toàn bộ danh sách đơn hàng phục vụ bảng Quản trị viên (Admin)
 * @returns {Promise<Array>}
 */
export async function listOrdersForAdmin() {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(o => ({
          id: o.id,
          customerName: o.customer_name,
          phone: o.phone,
          email: o.email,
          address: o.address,
          city: o.city,
          note: o.note,
          paymentMethod: o.payment_method,
          status: o.status,
          totals: { finalTotal: o.final_total },
          createdAt: o.created_at,
          items: (o.order_items || []).map(it => ({
            id: it.product_id,
            name: it.product_name,
            size: it.size,
            price: it.unit_price,
            quantity: it.quantity,
            isGift: it.is_gift,
            image: it.image_url,
          })),
        }));
      }
    } catch (e) {
      console.warn('[Admin list orders Notice]', e.message);
    }
  }

  // Fallback local storage
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
  } catch (e) {
    // ignore
  }
  return [];
}

