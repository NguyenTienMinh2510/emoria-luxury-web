const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function necklacePose(points,width,height) {
  const a=points?.[11],b=points?.[12];
  if(!a||!b||![a.x,a.y,b.x,b.y,a.visibility,b.visibility].every(Number.isFinite)||Math.min(a.visibility,b.visibility)<0.48)return null;
  if([a,b].some(p=>p.x<0.01||p.x>0.99||p.y<0.04||p.y>0.96))return null;
  const [left,right]=a.x<b.x?[a,b]:[b,a];
  const dx=(right.x-left.x)*width,dy=(right.y-left.y)*height;
  const span=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  if(span<width*0.14||span>width*0.96||Math.abs(angle)>0.55||Math.abs((a.z||0)-(b.z||0))>0.38)return null;
  const z=((a.z||0)+(b.z||0))*width/2;
  return {x:(a.x+b.x)*width/2,y:(a.y+b.y)*height/2,z,span,angle};
}
export function smoothPose(previous,next,dt) {
  if(!next)return null;
  if(!previous||Math.hypot(next.x-previous.x,next.y-previous.y)>next.span*.5)return {...next};
  const alpha=1-Math.exp(-clamp(dt,0,200)/85);
  return Object.fromEntries(['x','y','z','span','angle'].map(k=>[k,(previous[k]||0)+((next[k]||0)-(previous[k]||0))*alpha]));
}
export function drawNecklace(ctx,pose,image,{length=45,scale=1,offset=0,pendantScale=.18,chainOnly=false}={}) {
  if(!pose)return;
  const span=pose.span,drop=span*({40:.02,45:.08,50:.14}[length]??.08),size=span*pendantScale*clamp(scale,.65,1.6);
  ctx.save();ctx.translate(pose.x,pose.y+span*clamp(offset,-.3,.3));ctx.rotate(pose.angle);
  const metal=ctx.createLinearGradient(-span*.16,0,span*.16,drop);
  metal.addColorStop(0,'#8b95a0');metal.addColorStop(.45,'#f8fafc');metal.addColorStop(1,'#a7b2bf');
  ctx.beginPath();ctx.moveTo(-span*.22,-span*.24);
  ctx.bezierCurveTo(-span*.18,drop*.25,-span*.08,drop,0,drop);
  ctx.bezierCurveTo(span*.08,drop,span*.18,drop*.25,span*.22,-span*.24);
  ctx.strokeStyle=metal;ctx.lineWidth=Math.max(2.6,span*.012);ctx.shadowColor='#0007';ctx.shadowBlur=3;ctx.stroke();
  ctx.setLineDash([1,3]);ctx.lineWidth=Math.max(1.3,span*.005);ctx.strokeStyle='#fff9';ctx.stroke();ctx.setLineDash([]);
  if(!chainOnly && image && image.complete && image.naturalWidth > 0){
    ctx.drawImage(image,-size/2,drop-size*.05,size,size*188/160);
  }
  ctx.restore();
}
