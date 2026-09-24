// Only explicit physical units are safe to map. Never guess a brand's numbered
// ring size, a range, or a multi-item variant (e.g. a duo).
export function previewSizeForVariant(label,type){
  const matches=[...String(label||'').matchAll(/(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/gi)];
  if(matches.length!==1||/\d\s*[-–+]|\+\s*\d/.test(label))return null;
  const [,raw,unit]=matches[0],value=Number(raw.replace(',','.'));
  if(type==='ring')return unit.toLowerCase()==='mm'&&value>=12&&value<=25?value:null;
  return unit.toLowerCase()==='cm'&&value>=(type==='necklace'?35:10)&&value<=(type==='necklace'?60:30)?value:null;
}
