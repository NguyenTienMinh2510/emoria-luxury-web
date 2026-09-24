// Public REST configuration & shared client-side fallback; camera frames stay on the device.
const MODELS={lumen:'necklace',faith:'necklace',sen:'necklace',horizon:'bracelet',pulse:'bracelet',echo:'ring',halo:'ring',orbit:'bracelet'};
const validModel=url=>typeof url==='string'&&/^\/(?!\/)[a-zA-Z0-9_./-]+\.glb$/.test(url)&&!url.includes('..');
const number=(n,fallback,min,max)=>Number.isFinite(n)&&n>=min&&n<=max?n:fallback;

export function tryOnConfig(id,product=null){
  if(!/^[a-z0-9-]{1,80}$/.test(id||''))return null;
  const name=id.replace(/^emoria-/,'').replace(/-duo$/,''),knownType=MODELS[name],ar=product?.details?.ar||{};
  if(ar.enabled===false)return null;
  const type=ar.type||knownType;
  if(!['necklace','ring','bracelet'].includes(type))return null;
  const modelUrl=ar.modelUrl||(knownType===type?`/models/jewelry/emoria-${name}.glb`:null);
  // A product without its own 3D asset must not silently display another design.
  if(!validModel(modelUrl))return null;
  const config={version:4,productId:id,type,modelUrl,referenceImage:knownType?`/ar/${name}.jpg`:product?.image_url||null};
  const choices=(values,defaults)=>Array.isArray(values)&&values.length>0&&values.length<=6&&values.every(v=>Number.isFinite(v)&&v>0&&v<=100)?values:defaults;
  if(type==='necklace')return {...config,fixedDimensions:true,previewLengths:choices(Array.isArray(ar.previewLengths)?ar.previewLengths.filter(v=>v>=35&&v<=60):null,[45,50]),pendantWidthMm:number(ar.pendantWidthMm,knownType?(name==='sen'?26:name==='faith'?22:27.5):null,3,100),defaultLength:number(ar.defaultLength,45,35,60),shoulderReferenceMm:number(ar.shoulderReferenceMm,360,300,440)};
  return {...config,previewSizes:choices(ar.previewSizes,type==='ring'?[16,17,18,19]:[15,16,17,18]),modelSize:number(ar.modelSize,type==='ring'?17:15.25,10,30),bandWidthMm:number(ar.bandWidthMm,knownType===type?3.8:null,1,15),defaultSize:number(ar.defaultSize,type==='ring'?17:16,10,30),scale:number(ar.scale,type==='ring'?.28:.40,.1,.8),...(type==='ring'?{finger:['index','middle','ring','pinky'].includes(ar.finger)?ar.finger:'ring'}:{})};
}
