const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

// World landmarks are model estimates in metres, not a calibrated body scan.
export function landmarkPixelsPerMm(points,world,width,height,pairs){
  const scales=[];
  for(const [i,j] of pairs){
    const a=points?.[i],b=points?.[j],wa=world?.[i],wb=world?.[j];
    if(![a,b,wa,wb].every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite)))continue;
    const mm=Math.hypot(wa.x-wb.x,wa.y-wb.y,wa.z-wb.z)*1000;
    const px=Math.hypot((a.x-b.x)*width,(a.y-b.y)*height,(a.z-b.z)*width);
    if(mm>10&&mm<600&&px>5)scales.push(px/mm);
  }
  scales.sort((a,b)=>a-b);
  return scales.length?scales[Math.floor(scales.length/2)]:null;
}

export function smoothTrackingPose(previous,next,dt){
  if(!next)return null;
  if(!previous||dt>180||Math.hypot(next.x-previous.x,next.y-previous.y)>next.span*.5)return {...next};
  const motion=Math.hypot(next.x-previous.x,next.y-previous.y)/Math.max(1,next.span);
  const rotation=previous.quaternion&&next.quaternion?previous.quaternion.angleTo(next.quaternion):0;
  // Follow motion immediately; only damp small stationary landmark jitter.
  const alpha=1-Math.exp(-clamp(dt,1,180)/(motion>.025||rotation>.08?10:35));
  const result={...next};
  for(const k of ['x','y','z','span','scaleSpan','pixelsPerMm']){
    if(Number.isFinite(next[k]))result[k]=Number.isFinite(previous[k])?previous[k]+(next[k]-previous[k])*alpha:next[k];
  }
  result.angle=previous.angle+Math.atan2(Math.sin(next.angle-previous.angle),Math.cos(next.angle-previous.angle))*alpha;
  if(next.quaternion)result.quaternion=(previous.quaternion?.clone()||next.quaternion.clone()).slerp(next.quaternion,alpha);
  return result;
}

// Short, bounded translation prediction compensates inference latency without
// extrapolating scale or rotation, which would amplify depth noise.
export function predictTrackingPose(previous,current,now){
  if(!current)return null;
  if(!previous||!Number.isFinite(current.time)||current.time<=previous.time)return current;
  const dt=current.time-previous.time;
  if(dt>150)return current;
  const lead=clamp(now-current.time,0,45)/dt;
  const dx=(current.x-previous.x)*lead,dy=(current.y-previous.y)*lead;
  const limit=current.span*.12,amount=Math.min(1,limit/(Math.hypot(dx,dy)||1));
  return {...current,x:current.x+dx*amount,y:current.y+dy*amount};
}

export function computeDistanceMetrics(type, pose, canvasWidth) {
  if (!pose || !canvasWidth) {
    return { status: 'searching', score: 50, ratio: 0, label: 'ĐANG TÌM CHỦ THỂ' };
  }
  const span = Number(pose.scaleSpan || pose.span || 0);
  const ratio = span / canvasWidth;

  if (type === 'necklace') {
    if (ratio > 0.58) {
      const score = Math.max(8, Math.round(35 - ((ratio - 0.58) / 0.25) * 27));
      return { status: 'too-close', score, ratio, label: 'QUÁ GẦN · HÃY LÙI RA XA' };
    }
    if (ratio < 0.32) {
      const score = Math.min(92, Math.round(65 + ((0.32 - ratio) / 0.22) * 27));
      return { status: 'too-far', score, ratio, label: 'QUÁ XA · HÃY TIẾN LẠI GẦN HƠN' };
    }
    const norm = (ratio - 0.32) / (0.58 - 0.32);
    const score = Math.round(65 - norm * 30);
    return { status: 'optimal', score, ratio, label: 'ĐẠT CHUẨN (50 – 70 CM)' };
  }

  if (type === 'ring') {
    if (ratio > 0.20) {
      const score = Math.max(8, Math.round(35 - ((ratio - 0.20) / 0.15) * 27));
      return { status: 'too-close', score, ratio, label: 'QUÁ GẦN · ĐƯA TAY RA XA CAMERA' };
    }
    if (ratio < 0.08) {
      const score = Math.min(92, Math.round(65 + ((0.08 - ratio) / 0.05) * 27));
      return { status: 'too-far', score, ratio, label: 'QUÁ XA · ĐƯA BÀN TAY LẠI GẦN HƠN' };
    }
    const norm = (ratio - 0.08) / (0.20 - 0.08);
    const score = Math.round(65 - norm * 30);
    return { status: 'optimal', score, ratio, label: 'ĐẠT CHUẨN (25 – 40 CM)' };
  }

  if (ratio > 0.35) {
    const score = Math.max(8, Math.round(35 - ((ratio - 0.35) / 0.25) * 27));
    return { status: 'too-close', score, ratio, label: 'QUÁ GẦN · ĐƯA CỔ TAY RA XA' };
  }
  if (ratio < 0.16) {
    const score = Math.min(92, Math.round(65 + ((0.16 - ratio) / 0.10) * 27));
    return { status: 'too-far', score, ratio, label: 'QUÁ XA · ĐƯA CỔ TAY LẠI GẦN HƠN' };
  }
  const norm = (ratio - 0.16) / (0.35 - 0.16);
  const score = Math.round(65 - norm * 30);
  return { status: 'optimal', score, ratio, label: 'ĐẠT CHUẨN (30 – 50 CM)' };
}
