import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { products as descriptions } from '../data/products.js';

const env = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env
  : (typeof process !== 'undefined' && process.env ? process.env : {});

export async function loadCatalog() {
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
    contact_email: 'support@emoria.vn',
    address: 'EMORIA Atelier & Jewelry',
    ga4_measurement_id: env.VITE_GA4_MEASUREMENT_ID || '',
  };

  try {
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
          variants: item.variants || [{ id: `${item.id}-default`, size: 'Tiêu chuẩn', stock: 50 }],
          active: true,
          available: true,
        })),
      };
    }

    const [{ data: rows, error: catalogError }, { data: settings }] = await Promise.all([
      supabase.from('checkout_products').select('*, checkout_variants(*)').order('id'),
      supabase.from('store_settings').select('*').eq('id', true).maybeSingle()
    ]);

    if (catalogError || !rows || rows.length === 0) {
      return {
        settings: settings ? { ...defaultSettings, ...settings } : defaultSettings,
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
          variants: item.variants || [{ id: `${item.id}-default`, size: 'Tiêu chuẩn', stock: 50 }],
          active: true,
          available: true,
        })),
      };
    }

    const activeSettings = {
      ...defaultSettings,
      ...(settings || {}),
      ga4_measurement_id: settings?.ga4_measurement_id || env.VITE_GA4_MEASUREMENT_ID || '',
    };

    const products = rows.map(p => {
      const desc = descriptions.find(item => item.id === p.id) || {};
      const rawVariants = Array.isArray(p.checkout_variants) ? p.checkout_variants : [];
      const variants = rawVariants.length > 0 ? rawVariants : (desc.variants || [
        { id: `${p.id}-default`, product_id: p.id, size: 'Tiêu chuẩn', stock: 50 }
      ]);
      const hasStock = variants.some(v => Number(v.stock) > 0);

      return {
        category: 'Trang sức',
        material: '',
        description: '',
        ...desc,
        ...p.details,
        unitsPerItem: p.units_per_item || 1,
        id: p.id,
        name: p.name,
        price: Number(p.price),
        image: p.image_url || desc.image,
        formattedPrice: new Intl.NumberFormat('vi-VN').format(p.price) + ' đ',
        variants,
        active: p.active ?? true,
        available: (p.active ?? true) && hasStock,
        snapshot: {
          name: p.name,
          price: Number(p.price),
          active: p.active,
          image: p.image_url,
          stocks: Object.fromEntries(variants.map(v => [v.size, v.stock]))
        }
      };
    });

    return {
      settings: activeSettings,
      products,
    };
  } catch (err) {
    console.warn('loadCatalog fallback triggered:', err);
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
        variants: item.variants || [{ id: `${item.id}-default`, size: 'Tiêu chuẩn', stock: 50 }],
        active: true,
        available: true,
      })),
    };
  }
}

export async function callStore(name, args = {}) {
  if (!isSupabaseConfigured()) throw new Error('Chưa kết nối máy chủ cửa hàng.');
  const { data, error } = await supabase.rpc(name, args);
  if (error || data?.success === false) throw new Error(error?.message || data.message || 'Thao tác thất bại.');
  return data;
}
