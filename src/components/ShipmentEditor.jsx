import React,{useEffect,useState} from 'react';
import {callStore} from '../services/catalogService';
export default function ShipmentEditor({order,onRefresh}){
 const [form,setForm]=useState({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setForm({carrier:order.shippingCarrier||'',tracking:order.trackingNumber||'',estimate:order.deliveryEstimate||'',note:order.shippingNote||''});},[order]);
 const editable=['confirmed','crafting_nfc','shipping'].includes(order.status);
 const save=async status=>{
  if(busy)return;setBusy(true);setMessage('');
  try{await callStore('rpc_save_shipment',{p_order_id:order.id,p_carrier:form.carrier,p_tracking:form.tracking,p_estimate:form.estimate||null,p_note:form.note,p_status:status||null});setMessage('Đã lưu thông tin vận chuyển.');await onRefresh();}
  catch(e){setMessage(e.message);}finally{setBusy(false);}
 };
 return <section className="border-t border-white/10 pt-4 space-y-3" aria-label="Vận chuyển đơn hàng"><h3 className="font-semibold">Vận chuyển & giao nhận</h3>
 <p className="text-xs text-slate-400">Nhập thông tin từ hãng vận chuyển. Khách tra cứu được tiến độ trên web; trạng thái giao nhận do admin cập nhật.</p>
 <form onSubmit={e=>{e.preventDefault();save();}} className="space-y-3"><fieldset disabled={!editable||busy} className="grid sm:grid-cols-3 gap-3 disabled:opacity-70">
 <label className="store-label">Đơn vị vận chuyển<input className="store-input" maxLength={100} placeholder="Ví dụ: GHN, GHTK, Viettel Post" value={form.carrier||''} onChange={e=>setForm({...form,carrier:e.target.value})}/></label>
 <label className="store-label">Mã vận đơn<input className="store-input" maxLength={120} value={form.tracking||''} onChange={e=>setForm({...form,tracking:e.target.value})}/></label>
 <label className="store-label">Dự kiến giao<input className="store-input" type="date" value={form.estimate||''} onChange={e=>setForm({...form,estimate:e.target.value})}/></label>
 <label className="store-label sm:col-span-3">Ghi chú giao hàng (khách xem được)<textarea className="store-input" maxLength={1000} rows={2} value={form.note||''} onChange={e=>setForm({...form,note:e.target.value})}/></label>
 </fieldset><div className="flex flex-wrap gap-3">{editable&&<button className="store-button" disabled={busy}>Lưu vận chuyển</button>}
 {order.status==='crafting_nfc'&&<button type="button" className="store-button" disabled={busy||!form.carrier?.trim()||!form.tracking?.trim()} onClick={()=>save('shipping')}>Bàn giao cho vận chuyển</button>}
 {order.status==='shipping'&&<button type="button" className="store-button" disabled={busy||!form.carrier?.trim()||!form.tracking?.trim()} onClick={()=>{if(window.confirm('Xác nhận khách đã nhận hàng thành công?'))save('completed');}}>Xác nhận đã giao</button>}</div></form>
 {order.shippedAt&&<p className="text-xs">Bàn giao: {new Date(order.shippedAt).toLocaleString('vi-VN')}</p>}{order.deliveredAt&&<p className="text-xs">Đã giao: {new Date(order.deliveredAt).toLocaleString('vi-VN')}</p>}
 {message&&<p role="status" className="text-sm">{message}</p>}</section>;
}
