import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function isWebGLAvailable(){
  if(typeof document==='undefined')return false;
  try{return !!document.createElement('canvas').getContext('webgl2');}catch{return false;}
}

export function disposeModel(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root?.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of [o.material].flat()){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}

// GLBs use meters, +Y up, +Z ornament face. Hand assets wrap the Y axis.
export function prepareModel(asset,type){
  const root=new THREE.Group();root.name=type+' / GLB';
  asset.scale.setScalar(1000);asset.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(asset),size=bounds.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.length())||size.length()<1||size.length()>2000)throw Error('Invalid model dimensions');
  asset.traverse(o=>{
    if(o.isMesh){
      o.renderOrder=1;
      if(o.material){
        for(const m of [o.material].flat()){
          if(m&&(m.isMeshStandardMaterial||m.isMeshPhysicalMaterial)){
            // Keep enamel, pearl and gemstone properties authored in Blender.
            m.envMapIntensity=m.metalness>.8?1.6:1;
            m.needsUpdate=true;
          }
        }
      }
    }
  });
  if(type==='bracelet')asset.position.z=19;
  root.add(asset);
  if(type==='necklace'){
    root.updateMatrixWorld(true);
    const anchor=asset.getObjectByName('ChainAnchor');
    root.userData.chainAnchor=anchor?root.worldToLocal(anchor.getWorldPosition(new THREE.Vector3())):new THREE.Vector3(0,bounds.max.y-2,0);
  }
  if(type==='ring'||type==='bracelet'){
    // Approximate depth mask only; does not infer clothing or real wrist dimensions.
    const radius=type==='ring'?8.35:27;
    const mask=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,type==='ring'?45:90,48),new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true}));
    if(type==='bracelet')mask.scale.z=16/radius;
    mask.renderOrder=0;root.add(mask);
  }
  root.userData.widthMm=type==='necklace'?size.x:type==='ring'?20:58;
  return root;
}

export class AR3DScene{
  constructor(width=640,height=480){
    Object.assign(this,{width,height,options:{},activeModel:null,closed:false,ticket:0,loader:new GLTFLoader()});
    this.scene=new THREE.Scene();
    // Orthographic pixel space: landmark z is relative, not a camera distance.
    this.camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,4000);
    this.camera.position.z=2000;
    if(typeof document!=='undefined'){
      this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'default'});
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));this.renderer.setSize(width,height);this.domElement=this.renderer.domElement;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
      const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();
      this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;
      room.dispose();pmrem.dispose();
    }
    const key=new THREE.DirectionalLight(0xffffff,2.2);key.position.set(-200,350,500);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xdce8ff,.85);fill.position.set(250,-100,300);this.scene.add(fill);
    const skinBounce=new THREE.DirectionalLight(0xffdfd0,.9);skinBounce.position.set(0,-350,250);this.scene.add(skinBounce);
    const rimSparkle=new THREE.DirectionalLight(0xffffff,1.2);rimSparkle.position.set(50,450,350);this.scene.add(rimSparkle);
  }
  async setModel(productId,type,options={}){
    this.options={...this.options,...options};
    const url=options.modelUrl;
    if(!url)return;
    if(this.currentUrl===url&&this.activeModel)return;
    // Only public, same-origin GLB assets. Never fetch arbitrary credentialed URLs.
    if(!/^\/(?!\/)[a-zA-Z0-9_./-]+\.glb$/.test(url)||url.includes('..'))throw Error('Invalid model URL');
    const ticket=++this.ticket;this.currentUrl=url;
    const gltf=await this.loader.loadAsync(url);
    if(this.closed||ticket!==this.ticket){disposeModel(gltf.scene);return;}
    let model;
    try{model=prepareModel(gltf.scene,type);}catch(error){disposeModel(gltf.scene);throw error;}
    if(this.activeModel)this.scene.remove(this.activeModel);disposeModel(this.activeModel);
    this.activeModel=model;this.currentType=type;this.scene.add(model);
  }
  setOptions(options){Object.assign(this.options,options);}
  updateChain(pose){
    if(!this.chain){
      // Millimetres: oval cable links with a round wire cross-section, not stretched tori.
      const points=Array.from({length:49},(_,i)=>new THREE.Vector3(1.05*Math.cos(i*Math.PI/24),1.7*Math.sin(i*Math.PI/24),0));
      const path=new THREE.CatmullRomCurve3(points.slice(0,-1),true);
      const geometry=new THREE.TubeGeometry(path,48,.44,10,true);
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(-66,65,-5),new THREE.Vector3(-55,12,-2),
        new THREE.Vector3(-29,-39,0),new THREE.Vector3(0,-56,0),
        new THREE.Vector3(29,-39,0),new THREE.Vector3(55,12,-2),new THREE.Vector3(66,65,-5)
      ]);
      // Odd count places exactly one link at the bail; neighbours alternate planes.
      const count=Math.ceil(curve.getLength()/2.35/2)*2+1;
      this.chain=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0xdde4ed,metalness:1,roughness:.19,envMapIntensity:1.6}),count);
      this.chain.frustumCulled=false;this.scene.add(this.chain);
      const link=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0);
      for(let i=0;i<count;i++){
        const t=i/(count-1);link.position.copy(curve.getPointAt(t));
        link.quaternion.setFromUnitVectors(axis,curve.getTangentAt(t));
        link.rotateY((i-(count-1)/2)%2?Math.PI/2:0);
        link.updateMatrix();this.chain.setMatrixAt(i,link.matrix);
      }
      this.chain.instanceMatrix.needsUpdate=true;
      this.chain.userData.anchor=curve.getPointAt(.5);
    }
    const pixelsPerMm=(pose.scaleSpan||pose.span)/(this.options.shoulderReferenceMm||360);
    this.chain.scale.setScalar(pixelsPerMm);
    this.chain.position.set(pose.x-this.width/2,this.height/2-pose.y,0);
    if(pose.quaternion)this.chain.quaternion.copy(pose.quaternion);
    else this.chain.rotation.set(0,0,-pose.angle);
  }
  updateNecklace(pose){
    const model=this.activeModel;if(!model)return;
    model.visible=!!pose;if(this.chain)this.chain.visible=!!pose;if(!pose)return;
    this.updateChain(pose);
    const scale=this.chain.scale.x;
    model.scale.setScalar(scale);model.quaternion.copy(this.chain.quaternion);
    // Same transform for chain and pendant. The chain passes through the GLB bail.
    const offset=this.chain.userData.anchor.clone().sub(model.userData.chainAnchor);
    model.position.copy(offset.multiplyScalar(scale).applyQuaternion(model.quaternion).add(this.chain.position));
  }

  updatePose3D(pose,type){
    if(type==='necklace'){this.updateNecklace(pose);return;}
    const model=this.activeModel;if(!model)return;model.visible=!!pose;if(!pose)return;
    const o=this.options,adjust=clamp(o.scale??1,.65,1.6);
    const width=type==='ring'?pose.span*.60*((o.size||17)/17)*((o.ringScale||.28)/.28):pose.span*((o.size||16)/16)*((o.braceletScale||.40)/.40);
    model.scale.setScalar(width/model.userData.widthMm*adjust);
    model.position.set(pose.x-this.width/2,this.height/2-pose.y-(type==='necklace'?0:pose.span*clamp(o.offset||0,-.3,.3)),0);
    if(pose.quaternion)model.quaternion.copy(pose.quaternion);
    else model.rotation.set(0,0,type==='ring'?-(pose.angle+Math.PI/2):-(pose.angle||0));
  }
  render(){this.renderer?.render(this.scene,this.camera);}
  dispose(){
    this.closed=true;this.ticket++;if(this.activeModel)this.scene.remove(this.activeModel);disposeModel(this.activeModel);this.activeModel=null;
    disposeModel(this.chain);if(this.chain)this.scene.remove(this.chain);
    this.environment?.dispose();this.renderer?.dispose();this.renderer?.forceContextLoss();
  }
}
