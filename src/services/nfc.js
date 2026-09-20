const validTag=tag=>typeof tag==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(tag);
export const nfcOrigin=()=>new URL(import.meta.env?.VITE_PUBLIC_SITE_URL||'https://emoria-luxury-web.vercel.app').origin;
export function nfcMemoryUrl(tag,origin=nfcOrigin()) {
  if(!validTag(tag))throw new Error('Mã kỷ vật không hợp lệ.');
  const url=new URL('/',origin);
  if(url.protocol!=='https:')throw new Error('Link ghi NFC phải dùng HTTPS.');
  url.searchParams.set('tag',tag);return url.href;
}
export function readMemoryTag(message,origin=nfcOrigin()) {
  for(const record of message.records){
    if(record.recordType!=='url')continue;
    try{
      const url=new URL(new TextDecoder().decode(record.data));
      const tag=url.searchParams.get('tag');
      if(url.origin===origin&&url.pathname==='/'&&url.searchParams.getAll('tag').length===1&&validTag(tag))return tag;
    }catch{/* Ignore non-URL records; never navigate to arbitrary NFC content. */}
  }
  throw new Error('Chip chưa chứa link kỷ vật EMORIA hợp lệ.');
}
export const canUseNfc=()=>typeof window!=='undefined'&&window.isSecureContext&&'NDEFReader' in window;
export function nfcError(error) {
  if(error.name==='NotAllowedError')return 'Chưa được cấp quyền NFC. Cho phép NFC rồi thử lại.';
  if(error.name==='NotSupportedError')return 'Thiết bị hoặc chip không hỗ trợ NFC NDEF.';
  if(error.name==='NotReadableError')return 'Không đọc được chip. Bật NFC, mở khóa điện thoại và thử chạm lại.';
  if(error.name==='AbortError')return 'Đã dừng thao tác NFC.';
  return error.message||'Không thể thao tác NFC. Hãy kiểm tra chip và thử lại.';
}
