import { isSupabaseConfigured } from '../lib/supabaseClient.js';
import {apiRequest} from './apiClient.js';
import { products as descriptions } from '../data/products.js';

export async function loadCatalog() {
  if (!isSupabaseConfigured()) throw new Error('Chưa cấu hình kết nối database cửa hàng.');
  const {products:rows,settings}=await apiRequest('/catalog');
  return {settings:{...settings,ga4_measurement_id:settings.ga4_measurement_id||import.meta.env?.VITE_GA4_MEASUREMENT_ID||''},products:(rows||[]).map(p=>{
    const desc=descriptions.find(item=>item.id===p.id)||{},variants=p.checkout_variants||[];
    return {category:'Trang sức',material:'',description:'',...desc,...p.details,unitsPerItem:p.units_per_item||1,id:p.id,name:p.name,price:Number(p.price),image:p.image_url||desc.image,formattedPrice:new Intl.NumberFormat('vi-VN').format(p.price)+' đ',variants,active:p.active,available:p.active&&variants.some(v=>v.stock>0),
      tryOnAvailable:p.try_on_available===true || p.active,
      snapshot:{name:p.name,price:Number(p.price),active:p.active,image:p.image_url,stocks:Object.fromEntries(variants.map(v=>[v.size,v.stock]))}};
  })};
}
export async function callStore(name,args={}) {
  if(!isSupabaseConfigured())throw new Error('Chưa kết nối máy chủ cửa hàng.');
  // Compatibility for existing UI handlers; only explicit REST routes are callable.
  const a=args, id=encodeURIComponent;
  switch(name){
    case 'rpc_save_catalog': return apiRequest('/admin/products/'+id(a.p_id),{method:'PUT',body:{expected:a.p_expected,product:a.p_product,variants:a.p_variants}});
    case 'rpc_save_shipment': return apiRequest('/admin/orders/'+id(a.p_order_id)+'/shipment',{method:'PUT',body:{carrier:a.p_carrier,tracking:a.p_tracking,estimate:a.p_estimate,note:a.p_note,status:a.p_status}});
    case 'rpc_issue_chip': return apiRequest('/admin/orders/'+id(a.p_order_id)+'/chips',{method:'POST',body:{itemId:a.p_item_id}});
    case 'rpc_expire_orders': return apiRequest('/admin/orders/expirations',{method:'POST',body:{}});
    case 'rpc_memory_operations': return a.p_tag?apiRequest('/admin/memories/'+id(a.p_tag)+'/suspension',{method:'PATCH',body:{suspended:a.p_suspended}}):apiRequest('/admin/memories');
    case 'rpc_memory_guestbook': return apiRequest('/memories/'+id(a.p_tag)+'/guestbook/manage',{method:'POST',body:{id:a.p_id||null,action:a.p_action||'list'}});
    case 'rpc_marketing_report': return apiRequest('/admin/reports/marketing?'+new URLSearchParams({days:a.p_days??30,test:a.p_test??false}));
    case 'rpc_contact': return apiRequest('/contacts',{method:'POST',body:{name:a.p_name,phone:a.p_phone,note:a.p_note}});
    default: throw new Error('Thao tác cửa hàng chưa được hỗ trợ.');
  }
}
