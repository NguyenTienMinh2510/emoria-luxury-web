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
            if(m.metalness>0.2||!m.map){
              m.metalness=Math.max(m.metalness,0.96);
              m.roughness=clamp(m.roughness,0.12,0.22);
              m.envMapIntensity=1.85;
            }else{
              m.envMapIntensity=1.4;
            }
            if('clearcoat' in m&&m.clearcoat===0){
              m.clearcoat=0.6;
              m.clearcoatRoughness=0.1;
            }
            m.needsUpdate=true;
          }
        }
      }
    }
  });
  if(type==='bracelet')asset.position.z=19;
  root.add(asset);
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
      const pr=typeof window!=='undefined'&&window.devicePixelRatio?Math.min(window.devicePixelRatio,2):1;
      this.renderer.setPixelRatio(pr);this.renderer.setSize(width,height);this.domElement=this.renderer.domElement;
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
      this.chain=new THREE.InstancedMesh(new THREE.TorusGeometry(.7,.13,6,12),new THREE.MeshStandardMaterial({color:0xdde4ed,metalness:0.98,roughness:.15,envMapIntensity:1.85}),160);
      this.chain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.chain.frustumCulled=false;this.scene.add(this.chain);
    }
    // Link positions change only with chain length; body motion transforms one mesh.
    const span=pose.span,length=this.options.length||45;
    if(this.chainLength!==length){
      this.chainLength=length;
      const drop=.12+(clamp(length,30,60)-40)*.02;
      const link=new THREE.Object3D(),step=1/310;
      for(let side=0;side<2;side++){
        const sign=side?1:-1;
        const curve=new THREE.CubicBezierCurve3(new THREE.Vector3(sign*.18,.13,0),new THREE.Vector3(sign*.17,-drop*.65,0),new THREE.Vector3(sign*.07,-drop,0),new THREE.Vector3(0,-drop,0));
        for(let i=0;i<80;i++){
          link.position.copy(curve.getPointAt(i/79));
          link.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),curve.getTangentAt(i/79));
          link.rotateY(i%2?Math.PI/2.5:0);link.scale.set(step,step*1.4,step);link.updateMatrix();this.chain.setMatrixAt(side*80+i,link.matrix);
        }
      }
      this.chain.instanceMatrix.needsUpdate=true;
    }
    this.chain.position.set(pose.x-this.width/2,this.height/2-pose.y-span*clamp(this.options.offset||0,-.3,.3),0);
    this.chain.scale.setScalar(span);this.chain.rotation.z=-pose.angle;
  }

  updatePose3D(pose,type){
    const model=this.activeModel;if(!model)return;model.visible=!!pose;if(!pose)return;
    const o=this.options,adjust=clamp(o.scale??1,.65,1.6);
    const width=type==='necklace'?pose.span*(o.pendantScale||.09):type==='ring'?pose.span*.60*((o.size||17)/17)*((o.ringScale||.22)/.22):pose.span*((o.size||16)/16)*((o.braceletScale||.35)/.35);
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
