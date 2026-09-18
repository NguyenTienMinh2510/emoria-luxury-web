import React, {useState} from 'react';
import {BANK_APPS,bankTransferLink} from '../services/bankTransfer.js';

export default function BankAppPayment({bank,account,owner,order}) {
  const [app,setApp]=useState(()=>{
    try {const saved=localStorage.getItem('emoria_preferred_bank_app');return BANK_APPS.some(b=>b.id===saved)?saved:'bidv';} catch {return 'bidv';}
  });
  const [notice,setNotice]=useState('');
  const selected=BANK_APPS.find(b=>b.id===app);
  const href=bankTransferLink({app,bank,account,owner,amount:order.totals.finalTotal,memo:order.id,
    returnUrl:typeof location!=='undefined'?`${location.origin}/?payment=return&orderId=${encodeURIComponent(order.id)}`:undefined});
  return <div className="space-y-3 pt-3 border-t border-white/10 text-left">
    <label className="store-label">Ngân hàng bạn dùng để chuyển tiền
      <select className="store-input" value={app} onChange={e=>{setApp(e.target.value);setNotice('');try{localStorage.setItem('emoria_preferred_bank_app',e.target.value);}catch{}}}>
        {BANK_APPS.map(b=><option key={b.id} value={b.id}>{b.name}{b.autofill?' · Hỗ trợ điền sẵn':' · Quét QR trong app'}</option>)}
      </select>
    </label>
    {href?<a href={href} className="store-button block text-center w-full" onClick={e=>{
      const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      if(!mobile){e.preventDefault();setNotice('Trên máy tính, dùng điện thoại quét QR phía trên để điền đủ thông tin chuyển khoản.');}
    }}>Mở {selected.name}{selected.autofill?' với thông tin chuyển khoản':''}</a>:<p className="text-amber-200 text-xs">Chưa tạo được link cho ngân hàng nhận này. Hãy dùng mã QR phía trên.</p>}
    <p className="text-xs text-slate-300">{selected.autofill?'App hỗ trợ điền sẵn người nhận, số tiền và nội dung đơn. Kiểm tra lại các thông tin trước khi xác nhận.':'App này chưa được xác nhận hỗ trợ điền sẵn qua link. Lưu/chụp mã QR phía trên, rồi chọn quét QR từ ảnh trong app ngân hàng.'}</p>
    <p className="text-xs text-slate-400">Nếu app chỉ mở trang chủ sau khi đăng nhập, quay lại đây và bấm mở lần nữa hoặc quét QR. Giữ nguyên nội dung {order.id} để hệ thống đối soát.</p>
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </div>;
}
