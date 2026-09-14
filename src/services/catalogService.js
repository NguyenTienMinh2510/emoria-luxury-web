import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { products as descriptions } from '../data/products.js';

export async function loadCatalog() {
  // Cấu hình cửa hàng mặc định an toàn
  const defaultSettings = {
    id: true,
    sandbox: false,
    sales_enabled: true,
    cod_enabled: true,
    transfer_enabled: true,
    shipping_fee: 30000,
    free_shipping_from: 1000000,
    gift_fee: 35000,
    reservation_minutes: 60,
    bank_bin: '',
    bank_account: '',
    bank_owner: '',
    contact_email: 'contact@emoria.vn',
    address: 'EMORIA Atelier & Jewelry',
  };

  // Nếu chưa cấu hình Supabase Cloud, trả về dữ liệu mẫu để duyệt offline
  if (!isSupabaseConfigured()) {
    return {
      settings: defaultSettings,
      products: descriptions.map(item => ({
        category: 'Trang sức',
        material: '',
        description: '',
        ...item,
        id: item.id,
        name: item.name,
        price: Number(item.price),
        image: item.image,
        formattedPrice: new Intl.NumberFormat('vi-VN').format(item.price) + ' đ',
        variants: [
          { id: `${item.id}-default`, size: 'Tiêu chuẩn', stock: 50 }
        ],
        active: true,
        available: true,
      })),
    };
  }

  // Tải sản phẩm từ Supabase Database thật
  const { data: productsData, error: catalogError } = await supabase
    .from('checkout_products')
    .select('*, checkout_variants(*)')
    .order('id');

  if (catalogError || !productsData || productsData.length === 0) {
    throw new Error('Không thể tải danh mục sản phẩm từ máy chủ.');
  }

  // Tải cấu hình store_settings an toàn (không để lỗi store_settings chặn sản phẩm)
  let storeSettings = defaultSettings;
  try {
    const { data: settingsData, error: settingsError } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();

    if (!settingsError && settingsData) {
      storeSettings = { ...defaultSettings, ...settingsData };
    }
  } catch (err) {
    // Giữ cấu hình mặc định an toàn
  }

  // Chuẩn hóa danh sách sản phẩm hiển thị trên UI
  const products = productsData.map(p => {
    const desc = descriptions.find(item => item.id === p.id) || {};
    const rawVariants = Array.isArray(p.checkout_variants) ? p.checkout_variants : [];
    
    // Nếu biến thể chưa có trong DB, cung cấp biến thể tiêu chuẩn để khách hàng có thể chọn mua ngay
    const variants = rawVariants.length > 0 ? rawVariants : [
      { id: `${p.id}-default`, product_id: p.id, size: 'Tiêu chuẩn', stock: 50 }
    ];

    const hasStock = variants.some(v => Number(v.stock) > 0);

    return {
      category: 'Trang sức',
      material: '',
      description: '',
      ...desc,
      id: p.id,
      name: p.name,
      price: Number(p.price),
      image: p.image_url || desc.image,
      formattedPrice: new Intl.NumberFormat('vi-VN').format(p.price) + ' đ',
      variants,
      active: p.active ?? true,
      available: (p.active ?? true) && hasStock,
    };
  });

  return {
    settings: storeSettings,
    products,
  };
}

export async function callStore(name, args = {}) {
  if (!isSupabaseConfigured()) throw new Error('Chưa kết nối máy chủ cửa hàng.');
  const { data, error } = await supabase.rpc(name, args);
  if (error || data?.success === false) throw new Error(error?.message || data.message || 'Thao tác thất bại.');
  return data;
}
