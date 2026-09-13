/**
 * EMORIA LUXURY - ORDER BACKEND SERVICE
 * Kiến trúc dịch vụ quản lý đơn hàng trang sức NFC
 * Đảm nhiệm: Tạo đơn hàng, định danh mã EMO-XXXXXX, tính toán phí & ưu đãi, tra cứu đơn, xác thực thanh toán VietQR
 */

const STORAGE_KEY = 'emoria_orders_v1';

// In-memory cache fallback in case localStorage is unavailable
let memoryOrdersCache = [];

/**
 * Khởi tạo dữ liệu đơn hàng từ LocalStorage
 * @returns {Array} Danh sách đơn hàng
 */
function loadOrdersFromStorage() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryOrdersCache = Array.isArray(parsed) ? parsed : [];
      return memoryOrdersCache;
    }
  } catch (err) {
    console.warn('[OrderBackendService] Khong the doc localStorage, su dung cache bo nho:', err);
  }
  return memoryOrdersCache;
}

/**
 * Lưu danh sách đơn hàng vào LocalStorage
 * @param {Array} orders 
 */
function persistOrders(orders) {
  memoryOrdersCache = [...orders];
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    }
  } catch (err) {
    console.error('[OrderBackendService] Khong the ghi vao localStorage:', err);
  }
}

/**
 * Sinh mã đơn hàng độc nhất dạng EMO-XXXXXX
 * @returns {string} Ví dụ: EMO-849201
 */
export function generateOrderId() {
  const existingOrders = loadOrdersFromStorage();
  let uniqueId = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 100) {
    attempts++;
    const randomSixDigits = Math.floor(100000 + Math.random() * 900000);
    uniqueId = `EMO-${randomSixDigits}`;
    isUnique = !existingOrders.some(order => order.id === uniqueId);
  }

  return uniqueId;
}

/**
 * Tính toán tài chính cho đơn hàng
 * @param {Array} items - Danh sách sản phẩm [{ price, quantity, isGift, ... }]
 * @param {Object} options - { hasGiftBox, couponCode }
 */
export function calculateOrderTotals(items = [], options = {}) {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  
  // Phí đóng gói quà tặng: 35.000đ nếu có sản phẩm yêu cầu hộp quà hoặc tùy chọn quà tặng
  const hasGiftItem = items.some(item => Boolean(item.isGift)) || Boolean(options.hasGiftBox);
  const giftPackagingFee = hasGiftItem ? 35000 : 0;

  // Chính sách vận chuyển: Miễn phí với đơn từ 1.000.000đ, dưới 1.000.000đ phí 30.000đ
  const shippingFee = subtotal >= 1000000 || subtotal === 0 ? 0 : 30000;

  // Giảm giá coupon (mô phỏng)
  let discount = 0;
  if (options.couponCode) {
    const code = String(options.couponCode).toUpperCase().trim();
    if (code === 'EMORIAVIP' || code === 'EMORIA10') {
      discount = Math.round(subtotal * 0.1); // Giảm 10%
    } else if (code === 'FREESHIP') {
      discount = shippingFee;
    }
  }

  const finalTotal = Math.max(0, subtotal + giftPackagingFee + shippingFee - discount);

  return {
    subtotal,
    giftPackagingFee,
    shippingFee,
    discount,
    finalTotal,
    isFreeShipping: shippingFee === 0 && subtotal > 0,
  };
}

/**
 * Tạo một đơn hàng mới và lưu vào cơ sở dữ liệu
 * @param {Object} orderPayload 
 * @returns {Promise<{ success: boolean, order: Object, message: string }>}
 */
export async function createOrder(orderPayload) {
  // Validate thông tin khách hàng bắt buộc
  if (!orderPayload.customerName || !orderPayload.customerName.trim()) {
    throw new Error('Vui lòng nhập họ và tên người nhận.');
  }

  const cleanPhone = String(orderPayload.phone || '').replace(/\D/g, '');
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    throw new Error('Số điện thoại không hợp lệ (cần đúng 10-11 chữ số).');
  }

  if (!orderPayload.address || !orderPayload.address.trim()) {
    throw new Error('Vui lòng nhập địa chỉ giao hàng cụ thể.');
  }

  if (!orderPayload.items || !Array.isArray(orderPayload.items) || orderPayload.items.length === 0) {
    throw new Error('Giỏ hàng trống. Vui lòng chọn ít nhất một món trang sức.');
  }

  const totals = calculateOrderTotals(orderPayload.items, {
    hasGiftBox: orderPayload.hasGiftBox,
    couponCode: orderPayload.couponCode,
  });

  const orderId = generateOrderId();
  const paymentMethod = orderPayload.paymentMethod === 'vietqr' ? 'vietqr' : 'cod';
  
  // Trạng thái ban đầu:
  // - vietqr: 'pending_payment'
  // - cod: 'confirmed'
  const initialStatus = paymentMethod === 'vietqr' ? 'pending_payment' : 'confirmed';

  const newOrder = {
    id: orderId,
    customerName: orderPayload.customerName.trim(),
    phone: cleanPhone,
    email: (orderPayload.email || '').trim().toLowerCase(),
    address: orderPayload.address.trim(),
    city: orderPayload.city || 'Hồ Chí Minh',
    note: orderPayload.note || '',
    nfcCustomMessage: orderPayload.nfcCustomMessage || '',
    items: orderPayload.items.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      size: item.size || 'Tiêu chuẩn',
      quantity: item.quantity,
      image: item.image,
      isGift: Boolean(item.isGift),
    })),
    totals,
    paymentMethod,
    status: initialStatus,
    statusTimeline: [
      {
        status: initialStatus,
        time: new Date().toISOString(),
        description: paymentMethod === 'vietqr'
          ? 'Đơn hàng được khởi tạo. Đang chờ xác nhận chuyển khoản VietQR.'
          : 'Đơn hàng đã được tiếp nhận thành công (Thanh toán khi nhận hàng COD).',
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const currentOrders = loadOrdersFromStorage();
  const updatedOrders = [newOrder, ...currentOrders];
  persistOrders(updatedOrders);

  return {
    success: true,
    order: newOrder,
    message: 'Tạo đơn hàng thành công!',
  };
}

/**
 * Tra cứu thông tin đơn hàng theo Mã Đơn (EMO-XXXXXX)
 * @param {string} orderId 
 * @returns {Object|null}
 */
export function getOrderById(orderId) {
  if (!orderId) return null;
  const cleanId = String(orderId).toUpperCase().trim();
  const orders = loadOrdersFromStorage();
  return orders.find(o => o.id === cleanId) || null;
}

/**
 * Tra cứu tất cả đơn hàng thuộc về một số điện thoại
 * @param {string} phone 
 * @returns {Array}
 */
export function getOrdersByPhone(phone) {
  if (!phone) return [];
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone) return [];
  const orders = loadOrdersFromStorage();
  return orders.filter(o => o.phone.replace(/\D/g, '') === cleanPhone);
}

/**
 * Xác thực thanh toán VietQR cho một đơn hàng
 * @param {string} orderId 
 * @param {string} refCode - Mã giao dịch chuyển khoản ngân hàng
 */
export function verifyVietQRPayment(orderId, refCode = 'AUTO-CONFIRM') {
  const orders = loadOrdersFromStorage();
  const index = orders.findIndex(o => o.id === orderId);
  if (index === -1) {
    throw new Error(`Không tìm thấy đơn hàng mã ${orderId}`);
  }

  const order = orders[index];
  order.status = 'confirmed';
  order.paymentRef = refCode;
  order.updatedAt = new Date().toISOString();
  order.statusTimeline.push({
    status: 'confirmed',
    time: new Date().toISOString(),
    description: `Thanh toán VietQR đã được xác nhận (Mã GD: ${refCode}). Đơn hàng sẵn sàng được gia công.`,
  });

  orders[index] = order;
  persistOrders(orders);

  return {
    success: true,
    order,
    message: 'Xác nhận thanh toán thành công.',
  };
}

/**
 * Cập nhật trạng thái xử lý đơn hàng
 * @param {string} orderId 
 * @param {'pending_payment'|'confirmed'|'crafting_nfc'|'shipping'|'completed'|'cancelled'} nextStatus 
 * @param {string} note 
 */
export function updateOrderStatus(orderId, nextStatus, note = '') {
  const statusDescriptions = {
    pending_payment: 'Chờ thanh toán',
    confirmed: 'Đã xác nhận đơn - Đang chuẩn bị chế tác bạc S925',
    crafting_nfc: 'Nghệ nhân đang gia công & nạp dữ liệu vào chip NFC',
    shipping: 'Đơn hàng đang trên đường giao tới bạn',
    completed: 'Giao hàng thành công - Kỷ niệm đã đến tay chủ nhân',
    cancelled: 'Đơn hàng đã được hủy',
  };

  const orders = loadOrdersFromStorage();
  const index = orders.findIndex(o => o.id === orderId);
  if (index === -1) {
    throw new Error(`Không tìm thấy đơn hàng mã ${orderId}`);
  }

  const order = orders[index];
  order.status = nextStatus;
  order.updatedAt = new Date().toISOString();
  order.statusTimeline.push({
    status: nextStatus,
    time: new Date().toISOString(),
    description: note || statusDescriptions[nextStatus] || nextStatus,
  });

  orders[index] = order;
  persistOrders(orders);

  return {
    success: true,
    order,
  };
}

/**
 * Kiểm tra tình trạng tồn kho mô phỏng của sản phẩm
 * @param {string} productId 
 * @param {string} size 
 */
export function getInventoryStatus(productId, size = 'Tiêu chuẩn') {
  // Toàn bộ dòng trang sức S925 tiêu chuẩn luôn sẵn sàng với số lượng dồi dào
  return {
    available: true,
    stockCount: 15,
    craftingTime: 'Chế tác & nạp chip NFC trong 24 giờ',
    isHandmade: true,
  };
}
