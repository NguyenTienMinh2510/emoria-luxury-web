export const CART_STORAGE_KEY = 'emoria_cart_v1';
export const CART_MAX_ROWS = 50;
const text = (value, max, fallback = '') => typeof value === 'string' ? value.slice(0, max) : fallback;

export function validateStoredCart(value) {
  if (!Array.isArray(value)) return [];
  const result = [], keys = new Set();
  for (const item of value.slice(0, CART_MAX_ROWS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
      !Number.isFinite(item.price) || item.price < 0 || item.price > 1e12) continue;
    const size=text(item.size,80,'Tiêu chuẩn'), key=JSON.stringify([item.id,size]);
    if(keys.has(key))continue;
    keys.add(key);
    const image=text(item.image,2048);
    result.push({id:item.id,size,quantity:item.quantity,price:item.price,isGift:item.isGift===true,
      name:text(item.name,200,item.id),material:text(item.material,200),category:text(item.category,100),
      image:/^(https?:\/\/|\/(?!\/))/i.test(image)?image:'',
      formattedPrice:new Intl.NumberFormat('vi-VN').format(item.price)+' VNĐ'});
  }
  return result;
}

export function readStoredCart(storage) {
  try {
    storage ||= globalThis.localStorage;
    const raw=storage.getItem(CART_STORAGE_KEY);
    if(!raw)return [];
    if(raw.length>256000){storage.removeItem(CART_STORAGE_KEY);return [];}
    const cart=validateStoredCart(JSON.parse(raw));
    // Repair the cart key only; Auth and pending idempotent checkout state stay intact.
    storage.setItem(CART_STORAGE_KEY,JSON.stringify(cart));
    return cart;
  } catch {return [];}
}

export function resetStoredCart(storage) {
  try {(storage || globalThis.localStorage)?.removeItem(CART_STORAGE_KEY);} catch { /* Recovery still works in memory. */ }
}
