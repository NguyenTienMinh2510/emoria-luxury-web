const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function necklacePose(points,width,height) {
  const a=points?.[11],b=points?.[12];
  if(!a||!b||![a.x,a.y,b.x,b.y,a.visibility,b.visibility].every(Number.isFinite)||Math.min(a.visibility,b.visibility)<0.65)return null;
  if([a,b].some(p=>p.x<0.02||p.x>0.98||p.y<0.08||p.y>0.92))return null;
  const [left,right]=a.x<b.x?[a,b]:[b,a];
  const dx=(right.x-left.x)*width,dy=(right.y-left.y)*height;
  const span=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  if(span<width*0.18||span>width*0.93||Math.abs(angle)>0.55||Math.abs((a.z||0)-(b.z||0))>0.32)return null;
  const z=((a.z||0)+(b.z||0))*width/2;
  return {x:(a.x+b.x)*width/2,y:(a.y+b.y)*height/2,z,span,angle};
}
export function smoothPose(previous,next,dt) {
  if(!next)return null;
  if(!previous||Math.hypot(next.x-previous.x,next.y-previous.y)>next.span*.5)return {...next};
  const alpha=1-Math.exp(-clamp(dt,0,200)/85);
  return Object.fromEntries(['x','y','z','span','angle'].map(k=>[k,(previous[k]||0)+((next[k]||0)-(previous[k]||0))*alpha]));
}
export function drawNecklace(ctx,pose,image,{length=45,scale=1,offset=0,pendantScale=.09,chainOnly=false}={}) {
  if(!pose)return;
  const span=pose.span,drop=span*({40:.12,45:.22,50:.32}[length]??.22),size=span*pendantScale*clamp(scale,.65,1.6);
  ctx.save();ctx.translate(pose.x,pose.y+span*clamp(offset,-.3,.3));ctx.rotate(pose.angle);
  const metal=ctx.createLinearGradient(-span*.19,0,span*.19,drop);
  metal.addColorStop(0,'#8b95a0');metal.addColorStop(.45,'#f8fafc');metal.addColorStop(1,'#a7b2bf');
  ctx.beginPath();ctx.moveTo(-span*.18,-span*.13);
  ctx.bezierCurveTo(-span*.17,drop*.65,-span*.07,drop,0,drop);
  ctx.bezierCurveTo(span*.07,drop,span*.17,drop*.65,span*.18,-span*.13);
  ctx.strokeStyle=metal;ctx.lineWidth=Math.max(1.3,span*.006);ctx.shadowColor='#0007';ctx.shadowBlur=2;ctx.stroke();
  ctx.setLineDash([1,3]);ctx.lineWidth=Math.max(.7,span*.0025);ctx.strokeStyle='#fff9';ctx.stroke();ctx.setLineDash([]);
  if(!chainOnly && image && image.complete && image.naturalWidth > 0){
    ctx.drawImage(image,-size/2,drop-size*.05,size,size*188/160);
  }
  ctx.restore();
}
