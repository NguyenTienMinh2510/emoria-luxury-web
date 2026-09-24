import {Euler,Quaternion} from 'three';
import {landmarkPixelsPerMm,smoothTrackingPose} from './arTracking.js';
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function necklacePose(points,width,height,worldPoints=null) {
  const a=points?.[11],b=points?.[12];
  if(!a||!b||![a.x,a.y,b.x,b.y,a.z??0,b.z??0,a.visibility,b.visibility].every(Number.isFinite)||Math.min(a.visibility,b.visibility)<0.48)return null;
  if([a,b].some(p=>p.x<0.01||p.x>0.99||p.y<0.04||p.y>0.96))return null;
  const [left,right]=a.x<b.x?[a,b]:[b,a];
  const dx=(right.x-left.x)*width,dy=(right.y-left.y)*height;
  const span=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  const dz=((right.z||0)-(left.z||0))*width;
  if(span<width*0.10||span>width*0.96||Math.abs(angle)>.8||Math.abs(dz)>width*.8)return null;
  let yaw=Math.atan2(dz,span),pitch=0;
  const wl=worldPoints?.[left===a?11:12],wr=worldPoints?.[left===a?12:11];
  const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
  if(finite(wl)&&finite(wr)){
    const across=Math.hypot(wr.x-wl.x,wr.y-wl.y);
    if(across>.05)yaw=Math.atan2(wr.z-wl.z,across);
    const ha=worldPoints[23],hb=worldPoints[24];
    if(finite(ha)&&finite(hb)&&points[23]?.visibility>.6&&points[24]?.visibility>.6){
      const up=(ha.y+hb.y-wl.y-wr.y)/2,forward=(ha.z+hb.z-wl.z-wr.z)/2;
      if(up>.12)pitch=clamp(Math.atan2(forward,up),-.4,.4);
    }
  }
  // Beyond ~66 degrees one shoulder is usually occluded: ask for reacquisition.
  if(Math.abs(yaw)>1.15)return null;
  const quaternion=new Quaternion().setFromEuler(new Euler(pitch,yaw,-angle,'ZYX'));
  const scaleSpan=span/Math.max(.4,Math.cos(yaw));
  const z=((a.z||0)+(b.z||0))*width/2;
  return {x:(a.x+b.x)*width/2,y:(a.y+b.y)*height/2,z,span,scaleSpan,angle,quaternion,pixelsPerMm:landmarkPixelsPerMm(points,worldPoints,width,height,[[11,12]])};
}
export const smoothPose = smoothTrackingPose;
export function drawNecklace(ctx,pose,image,{length=45,scale=1,offset=0,pendantScale=.18,chainOnly=false}={}) {
  if(!pose)return;
  const span=pose.span,lengthNum=Number(length)||45,drop=span*(0.08+(lengthNum-45)*0.012),size=span*pendantScale*clamp(scale,.65,1.6);
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
