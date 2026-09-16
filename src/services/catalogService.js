import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { products as descriptions } from '../data/products.js';

export async function loadCatalog() {
  if (!isSupabaseConfigured()) throw new Error('Chưa cấu hình kết nối database cửa hàng.');
  const [{data:rows,error:catalogError},{data:settings,error:settingsError}]=await Promise.all([
    supabase.from('checkout_products').select('*, checkout_variants(*)').order('id'),
    supabase.from('store_settings').select('*').eq('id',true).single()
  ]);
  if(catalogError)throw new Error('Không thể tải danh mục từ database. Vui lòng thử lại.');
  if(settingsError||!settings)throw new Error('Database cửa hàng chưa được cập nhật đầy đủ. Vui lòng liên hệ quản trị viên.');
  return {settings:{...settings,ga4_measurement_id:settings.ga4_measurement_id||import.meta.env.VITE_GA4_MEASUREMENT_ID||''},products:(rows||[]).map(p=>{
    const desc=descriptions.find(item=>item.id===p.id)||{},variants=p.checkout_variants||[];
    return {category:'Trang sức',material:'',description:'',...desc,...p.details,unitsPerItem:p.units_per_item||1,id:p.id,name:p.name,price:Number(p.price),image:p.image_url||desc.image,formattedPrice:new Intl.NumberFormat('vi-VN').format(p.price)+' đ',variants,active:p.active,available:p.active&&variants.some(v=>v.stock>0),
      snapshot:{name:p.name,price:Number(p.price),active:p.active,image:p.image_url,stocks:Object.fromEntries(variants.map(v=>[v.size,v.stock]))}};
  })};
}
export async function callStore(name,args={}) {
  if(!isSupabaseConfigured())throw new Error('Chưa kết nối máy chủ cửa hàng.');
  const {data,error}=await supabase.rpc(name,args);
  if(error||data?.success===false)throw new Error(error?.message||data.message||'Thao tác thất bại.');
  return data;
}
