import React,{useEffect,useState} from 'react';
import {trackOrderSecure} from '../services/orderBackendService';
export default function PaymentStatus({order:initial,autoRefresh=false,lookupToken}){
 const [order,setOrder]=useState(initial),[error,setError]=useState('');
 useEffect(()=>{setOrder(initial);setError('');},[initial]);
  useEffect(()=>{
   if(!autoRefresh||initial.paymentMethod!=='vietqr')return;
   let active=true,timer;
   const poll=async()=>{try{if(document.visibilityState==='hidden')return;const fresh=await trackOrderSecure(initial.id,lookupToken||initial.lookupToken);if(active){setOrder({...initial,...fresh});setError('');}}catch{if(active)setError('Chưa cập nhật được thanh toán. Hệ thống sẽ thử lại.');}finally{if(active)timer=setTimeout(poll,6000);}};
   poll();return()=>{active=false;clearTimeout(timer);};
  },[autoRefresh,initial.id,initial.paymentMethod,initial.lookupToken,lookupToken]);
  if(order.paymentMethod!=='vietqr')return <p className="text-sm">COD · Thu tiền khi giao hàng</p>;
  const amount=new Intl.NumberFormat('vi-VN').format(order.paidAmount||0);
  const label={unpaid:'Chưa ghi nhận tiền chuyển khoản',partial:'Đã nhận một phần — còn thiếu tiền',paid:'Đã nhận đủ tiền',overpaid:'Đã nhận thừa tiền — cửa hàng cần đối soát',review:'Đã nhận tiền — cần xử lý thủ công / hoàn tiền'}[order.paymentStatus]||'Chưa ghi nhận tiền chuyển khoản';
  return <div className="text-sm space-y-1" role="status"><p className={order.paymentStatus==='paid'?'text-emerald-400 font-semibold':''}>{label}</p>{order.paidAmount>0&&<p>Đã ghi nhận: {amount} đ</p>}{order.paymentId&&<p className="text-xs text-slate-400 font-mono">Mã giao dịch: {order.paymentId}</p>}{['paid','overpaid'].includes(order.paymentStatus)&&order.status==='pending_payment'&&<p className="text-emerald-300">Thanh toán đã xác nhận · Đang chờ admin duyệt đơn.</p>}{error&&<p className="text-amber-200">{error}</p>}</div>;
}
