export function normalizeCheckout(payload) {
  const method=['vietqr','sepay','cod'].includes(payload.paymentMethod)?payload.paymentMethod:'cod';
  return {customerName:String(payload.customerName||'').trim(),phone:String(payload.phone||'').replace(/\D/g,''),email:String(payload.email||'').trim().toLowerCase(),address:String(payload.address||'').trim(),city:String(payload.city||''),note:String(payload.note||'').trim(),paymentMethod:method,hasGiftBox:Boolean(payload.hasGiftBox||payload.items?.some(i=>i.isGift)),items:(payload.items||[]).map(i=>({id:i.id,size:i.size||'Tiêu chuẩn',quantity:i.quantity??1,isGift:Boolean(i.isGift)}))};
}
