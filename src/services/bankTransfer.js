// VietQR deeplink ba uses a bank code; QR image URLs also accept a numeric BIN.
// Supported autofill apps: https://vietqr.io/changelog/ (checked 2026-09-18).
const BANK_CODES = {
  '970418':'bidv', '970415':'icb', '970436':'vcb', '970422':'mb',
  '970407':'tcb', '970423':'tpb', '970432':'vpb', '970416':'acb',
  '970441':'vib', '970405':'vba', '970448':'ocb', '970428':'nab',
  '970454':'vccb', '970429':'scb', '970437':'hdb', '970403':'stb',
  '970431':'eib', '970443':'shb', '970425':'abb', '970426':'msb',
  '970438':'bvb', '970440':'seab', '970452':'klb', '970457':'woori', '970424':'shbv',
};
export const BANK_APPS = [
  {id:'bidv',name:'BIDV',autofill:true}, {id:'mb',name:'MB Bank',autofill:true},
  {id:'icb',name:'VietinBank',autofill:true}, {id:'acb',name:'ACB',autofill:true},
  {id:'ocb',name:'OCB',autofill:true}, {id:'vcb',name:'Vietcombank'},
  {id:'tcb',name:'Techcombank'}, {id:'tpb',name:'TPBank'},
  {id:'vpb',name:'VPBank'}, {id:'vba',name:'Agribank'},
  {id:'cake',name:'Cake'}, {id:'timo',name:'Timo'},
];
export function bankTransferLink({app,bank,account,owner,amount,memo,returnUrl}) {
  const code = BANK_CODES[String(bank).trim()] || Object.values(BANK_CODES).find(c=>c===String(bank).toLowerCase());
  if (!code || !BANK_APPS.some(b=>b.id===app) || !/^[a-zA-Z0-9]+$/.test(account || '') ||
      !Number.isSafeInteger(amount) || amount<=0 || !/^EMO-[a-zA-Z0-9-]+$/.test(memo || '') || !owner?.trim()) return null;
  const params = new URLSearchParams({app,ba:`${account}@${code}`,am:String(amount),tn:memo,bn:owner.trim()});
  // Return navigation is never proof of payment. SePay alone verifies the transfer.
  if (returnUrl) {
    const url = new URL(returnUrl);
    if (['https:','http:'].includes(url.protocol)) params.set('url',url.href);
  }
  return `https://dl.vietqr.io/pay?${params}`;
}
