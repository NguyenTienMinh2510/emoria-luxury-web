export const VIOLATION_LABELS = {SEXUAL_EXPLICIT:'Tình dục tường minh',CHILD_EXPLOITATION:'Nội dung gây hại hoặc bóc lột trẻ em',GRAPHIC_VIOLENCE:'Bạo lực ghê rợn',HATE_HARASSMENT:'Thù ghét hoặc quấy rối',SELF_HARM_PROMOTION:'Cổ súy tự hại',DANGEROUS_ILLEGAL:'Cổ súy hành vi nguy hiểm hoặc phạm pháp',PROVIDER_SAFETY:'Bộ lọc an toàn Google đã chặn nội dung'};
export function moderationResult(value) {
  const labels=normalizeVideoLabels(value?.labels);
  if(!Array.isArray(value?.violations)||value.violations.some(v=>!Object.hasOwn(VIOLATION_LABELS,v)))throw new Error('AI chưa trả đủ kết quả kiểm duyệt.');
  const violations=[...new Set(value.violations)];
  return {labels,violations,approved:violations.length===0,reason:violations.length?'Video bị từ chối vì nhãn: '+violations.map(v=>VIOLATION_LABELS[v]).join(', ')+'.':null};
}
export function normalizeVideoLabels(value) {
  if (!Array.isArray(value) || value.some(label => typeof label !== 'string')) throw new Error('AI trả nhãn không hợp lệ.');
  const result=[],seen=new Set();
  for(const raw of value){
    const clean=raw.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s-]/gu,' ').replace(/\s+/gu,' ').trim();
    const label=Array.from(clean).slice(0,40).join('').trim(),key=label.toLocaleLowerCase('vi');
    if(!/[\p{L}\p{N}]/u.test(label)||seen.has(key))continue;
    seen.add(key);result.push(label);
    if(result.length===8)break;
  }
  return result;
}
