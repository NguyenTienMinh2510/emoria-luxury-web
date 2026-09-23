// Public REST configuration & shared client-side fallback; camera frames stay on the device.
const MODELS={lumen:'necklace',faith:'necklace',sen:'necklace',horizon:'bracelet',pulse:'bracelet',echo:'ring',halo:'ring'};
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
  const config={version:2,productId:id,type,modelUrl,referenceImage:knownType?`/ar/${name}.jpg`:product?.image_url||null};
  const choices=(values,defaults)=>Array.isArray(values)&&values.length>0&&values.length<=6&&values.every(v=>Number.isFinite(v)&&v>0&&v<=100)?values:defaults;
  if(type==='necklace')return {...config,previewLengths:choices(ar.previewLengths,[40,45,50]),defaultLength:number(ar.defaultLength,45,30,60),pendantScale:number(ar.scale,.09,.03,.3),bailRatio:name==='faith'?.92:name==='sen'?.86:.68};
  return {...config,previewSizes:choices(ar.previewSizes,type==='ring'?[16,17,18,19]:[15,16,17,18]),defaultSize:number(ar.defaultSize,type==='ring'?17:16,10,30),scale:number(ar.scale,type==='ring'?.22:.35,.1,.6),...(type==='ring'?{finger:['index','middle','ring','pinky'].includes(ar.finger)?ar.finger:'ring'}:{})};
}
