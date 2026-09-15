const key='emoria_pending_checkout_v2';
export function readPendingCheckout(actor='guest',storage=globalThis.sessionStorage){
 try{const item=JSON.parse(storage.getItem(key+':'+actor)||'null');return item&&typeof item.id==='string'&&item.payload&&item.actor===actor?item:null;}catch{return null;}
}
export function savePendingCheckout(item,storage=globalThis.sessionStorage){
 try{storage.setItem(key+':'+item.actor,JSON.stringify(item));}catch{throw new Error('Trình duyệt không cho lưu phiên đặt hàng. Bật lưu trữ cho website rồi thử lại để bảo vệ yêu cầu khi mất mạng.');}
}
export function clearPendingCheckout(actor='guest',storage=globalThis.sessionStorage){try{storage.removeItem(key+':'+actor);}catch{}}
