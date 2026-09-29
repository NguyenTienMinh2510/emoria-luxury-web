import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {roomDecorations, DECORATIONS, ROOM_BOUNDS, getRoomBoundingBox, getDefaultPosition, getRotatedExtents, ASSET_DIMENSIONS} from './house3d.js';

export function createHouseRenderer(host, {onRoom, onPhoto, onDecorItem, onSurfaceTap, getPlacement, onError, onReady}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Ngôi nhà 3D: kéo để xoay, chạm phòng để chọn');
  renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:pan-y';
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9dfd2');
  const camera=new THREE.PerspectiveCamera(34,1,.1,80);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enablePan=false;controls.minDistance=4;controls.maxDistance=23;
  controls.minPolarAngle=.55;controls.maxPolarAngle=1.48;
  controls.minAzimuthAngle=-.65;controls.maxAzimuthAngle=.65;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  controls.enableDamping=false;

  // Lighting setup for 3 distinct moods (Chặng C)
  const ambient=new THREE.HemisphereLight('#fff5e3','#b89d88',1.5);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#ffe3bb',2.4);sun.position.set(-4,8,7);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.5,far:24});
  sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;
  const fill=new THREE.DirectionalLight('#ffffff',.8);fill.position.set(5,3,4);scene.add(fill);

  // Warm local glow for candles, lamps and lanterns
  const warmLight=new THREE.PointLight('#ffc87a',0,8);
  warmLight.position.set(0,1.8,0);
  scene.add(warmLight);

  const decorGroup=new THREE.Group();scene.add(decorGroup);
  const ghostGroup=new THREE.Group();scene.add(ghostGroup);
  const selectionHelper=new THREE.Group();scene.add(selectionHelper);
  let ghostMesh=null, highlightBox=null;

  let house,library,dead=false,state={},decorKey='',frame=0;
  const surfaces=[],slots=new Map(),roomObjects=new Map(),textures=new Map(),failedPhotos=new Set();
  let decorSurfaces=[];
  const decorMaterials=[],decorTextTextures=[];
  const photoSurfaces=()=>[...surfaces,...decorSurfaces];

  // Micro-particles system (Chặng C)
  const PARTICLE_COUNT = 45;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(PARTICLE_COUNT * 3);
  const particleVel = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 12;
    particlePos[i * 3 + 1] = 0.5 + Math.random() * 4.5;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    particleVel[i * 3] = (Math.random() - 0.5) * 0.004;
    particleVel[i * 3 + 1] = 0.002 + Math.random() * 0.004;
    particleVel[i * 3 + 2] = (Math.random() - 0.5) * 0.004;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));

  let particleTexture = null;
  function getParticleTexture() {
    if (particleTexture) return particleTexture;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
    particleTexture = new THREE.CanvasTexture(c);
    return particleTexture;
  }

  const particleMat = new THREE.PointsMaterial({
    size: 0.22,
    map: getParticleTexture(),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: '#ffe89e'
  });
  const particlesMesh = new THREE.Points(particleGeo, particleMat);
  scene.add(particlesMesh);

  // Particle Lifecycle & Performance Controls
  let isTabVisible = typeof document !== 'undefined' ? !document.hidden : true;
  let isReducedMotion = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  let isCanvasVisible = true;
  let particleRaf = 0;

  function updateParticles() {
    if (dead || !isTabVisible || isReducedMotion || !isCanvasVisible) return;
    const pos = particleGeo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3 + 1] += particleVel[i * 3 + 1];
      pos[i * 3] += particleVel[i * 3];
      pos[i * 3 + 2] += particleVel[i * 3 + 2];
      if (pos[i * 3 + 1] > 5.5) pos[i * 3 + 1] = 0.5;
      if (pos[i * 3] > 6) pos[i * 3] = -6;
      if (pos[i * 3] < -6) pos[i * 3] = 6;
      if (pos[i * 3 + 2] > 6) pos[i * 3 + 2] = -6;
      if (pos[i * 3 + 2] < -6) pos[i * 3 + 2] = 6;
    }
    particleGeo.attributes.position.needsUpdate = true;
    render();
    particleRaf = requestAnimationFrame(updateParticles);
  }

  function restartParticleLoop() {
    cancelAnimationFrame(particleRaf);
    if (!dead && isTabVisible && !isReducedMotion && isCanvasVisible) {
      particleRaf = requestAnimationFrame(updateParticles);
    }
  }

  const onVisibilityChange = () => {
    isTabVisible = !document.hidden;
    restartParticleLoop();
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  const intersectionObserver = new IntersectionObserver((entries) => {
    isCanvasVisible = entries[0]?.isIntersecting ?? true;
    restartParticleLoop();
  }, { threshold: 0.1 });
  intersectionObserver.observe(host);

  // Subtle Gyroscope View / Device Orientation (Chặng C)
  let gyroActive = false;
  let gyroHandler = null;
  let baseGamma = null, baseBeta = null;
  const currentGyroOffset = new THREE.Vector3(0, 0, 0);
  const targetGyroOffset = new THREE.Vector3(0, 0, 0);

  function resetGyroOffset() {
    if (currentGyroOffset.lengthSq() > 0) {
      camera.position.sub(currentGyroOffset);
      currentGyroOffset.set(0, 0, 0);
      targetGyroOffset.set(0, 0, 0);
      baseGamma = null;
      baseBeta = null;
      controls.update();
      render();
    }
  }

  function clearDecor(){
    decorGroup.clear();decorSurfaces=[];
    for(const m of decorMaterials)m.dispose();decorMaterials.length=0;
    for(const t of decorTextTextures)t.dispose();decorTextTextures.length=0;
    hideGhost();
    if(highlightBox){
      selectionHelper.remove(highlightBox);
      disposeTree(highlightBox);
      highlightBox=null;
    }
  }
  function textTexture(text,aspect){
    const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024/aspect);
    const ctx=c.getContext('2d');ctx.fillStyle='#fff5df';ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#52382d';ctx.textAlign='center';ctx.textBaseline='middle';
    const words=(text||'♥').slice(0,80).split(/(\n| )/);let lines=[],size=96;
    do{
      ctx.font=`600 ${size}px Georgia, serif`;lines=[''];
      for(const word of words){
        if(word==='\n'){lines.push('');continue;}
        const last=lines.length-1;
        if(ctx.measureText(lines[last]+word).width>900&&lines[last])lines.push(word.trim());else lines[last]+=word;
      }
      if(lines.length*size*1.3<c.height-50&&lines.every(line=>ctx.measureText(line).width<950))break;
      size-=4;
    }while(size>12);
    lines.forEach((line,i)=>ctx.fillText(line.trim(),512,c.height/2+(i-(lines.length-1)/2)*size*1.3));
    const texture=new THREE.CanvasTexture(c);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }
  let titleMesh,titleTexture,lastTitle='';
  let currentTween=null;
  const render=()=>{if(!dead){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!dead)renderer.render(scene,camera);});}};
  controls.addEventListener('change',render);
  controls.addEventListener('start',()=>{
    if(currentTween){
      cancelAnimationFrame(currentTween.raf);
      currentTween=null;
    }
  });

  function tweenCamera(targetPos, targetLookAt, duration=650) {
    if(typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){
      camera.position.copy(targetPos);
      controls.target.copy(targetLookAt);
      controls.update();
      render();
      return;
    }
    if(currentTween){
      cancelAnimationFrame(currentTween.raf);
      currentTween=null;
    }
    const startPos=camera.position.clone();
    const startTarget=controls.target.clone();
    const startTime=performance.now();

    function animate(now){
      const elapsed=now-startTime;
      const progress=Math.min(elapsed/duration,1);
      const ease=progress<0.5
        ? 4*progress*progress*progress
        : 1-Math.pow(-2*progress+2,3)/2;

      camera.position.lerpVectors(startPos,targetPos,ease);
      controls.target.lerpVectors(startTarget,targetLookAt,ease);
      controls.update();
      render();

      if(progress<1&&!dead){
        currentTween={raf:requestAnimationFrame(animate)};
      }else{
        currentTween=null;
      }
    }
    currentTween={raf:requestAnimationFrame(animate)};
  }

  function overview(smooth=false){
    const destPos=new THREE.Vector3(7,6.1,17);
    const destTarget=new THREE.Vector3(0,2.45,0);
    if(smooth){
      tweenCamera(destPos,destTarget,650);
    }else{
      camera.position.copy(destPos);
      controls.target.copy(destTarget);
      controls.update();
      render();
    }
  }
  overview(false);
  const observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();}});observer.observe(host);
  function disposeTree(root){if(!root)return;root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose();}});}
  const loader=new GLTFLoader();
  Promise.allSettled([loader.loadAsync('/memoryhouse/models/memory-house.glb'),loader.loadAsync('/memoryhouse/models/decorations.glb')]).then(results=>{
    if(results.some(r=>r.status==='rejected')){
      for(const r of results)if(r.status==='fulfilled')disposeTree(r.value.scene);
      throw new Error('Model unavailable');
    }
    const [a,b]=results.map(r=>r.value);
    if(dead){disposeTree(a.scene);disposeTree(b.scene);return;}
    house=a.scene;library=b.scene;scene.add(house);
    house.updateMatrixWorld(true);
    library.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    house.traverse(o=>{
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
      if(o.userData.roomId && o.name.startsWith('room_'))roomObjects.set(o.userData.roomId,o);
      if(o.userData.slot)slots.set(`${o.userData.roomId}/${o.userData.slot}`,o);
      if(o.isMesh && Number.isInteger(o.userData.photoIndex)){
        o.material=new THREE.MeshBasicMaterial({color:'#f8ecda',side:THREE.DoubleSide});surfaces.push(o);
      }
      if(o.userData.titleAnchor){
        titleMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.24),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));
        titleMesh.position.copy(o.getWorldPosition(new THREE.Vector3()));scene.add(titleMesh);
      }
    });
    update(state);onReady?.();render();restartParticleLoop();
  }).catch(()=>{if(!dead)onError?.('Chưa tải được mô hình. Bạn vẫn có thể dùng khung 2D.');});

  function update(next){
    state=next;if(!house||dead)return;
    const rooms=next.rooms||[];
    const colors={classic:'#c2a77e',warm_gold:'#c9a375',rose_romance:'#d6a0a6',midnight:'#8995bc',minimal_dark:'#8e8b88',editorial_cream:'#d4c4a5'};
    house.traverse(o=>{if(o.isMesh&&o.material?.name==='Theme blush')o.material.color.set(colors[next.theme]||colors.warm_gold);});
    const active=rooms.find(r=>r.id===next.activeRoomId);
    const light=active?.lighting||'day';

    // 3 Light Moods (Chặng C)
    if(light==='night'){
      ambient.color.set('#8995bc'); ambient.intensity=0.7;
      sun.color.set('#9cb3ff'); sun.intensity=1.3;
      fill.color.set('#6a78a6'); fill.intensity=0.5;
      scene.background.set('#1a1829');
      particleMat.color.set('#d8ff7a'); // Fireflies
      particleMat.opacity=0.8;
      particleMat.size=0.28;
      warmLight.intensity=2.2;
    } else if(light==='sunset'){
      ambient.color.set('#ffe8d6'); ambient.intensity=1.35;
      sun.color.set('#ff9e66'); sun.intensity=2.6;
      fill.color.set('#ffccd4'); fill.intensity=0.9;
      scene.background.set('#543638');
      particleMat.color.set('#ffb0b0'); // Warm rose dust
      particleMat.opacity=0.65;
      particleMat.size=0.24;
      warmLight.intensity=1.5;
    } else { // 'day'
      ambient.color.set('#fffbf0'); ambient.intensity=1.6;
      sun.color.set('#fff0d8'); sun.intensity=2.4;
      fill.color.set('#ffffff'); fill.intensity=0.8;
      scene.background.set('#e9dfd2');
      particleMat.color.set('#ffe89e'); // Golden sun dust
      particleMat.opacity=0.55;
      particleMat.size=0.20;
      warmLight.intensity=0.6;
    }

    if(titleMesh&&lastTitle!==next.title){
      lastTitle=next.title;titleTexture?.dispose();
      const c=document.createElement('canvas');c.width=1024;c.height=144;const ctx=c.getContext('2d');
      ctx.fillStyle='#4b3128';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 48px Georgia, serif';
      const title=(next.title||'Ngôi nhà của đôi mình').slice(0,120);
      while(ctx.measureText(title).width>990){const size=parseInt(ctx.font.match(/(\d+)px/)[1]);ctx.font=`600 ${size-1}px Georgia, serif`;}
      ctx.fillText(title,512,72);titleTexture=new THREE.CanvasTexture(c);titleTexture.colorSpace=THREE.SRGBColorSpace;titleMesh.material.map=titleTexture;titleMesh.material.needsUpdate=true;
    }
    const key=JSON.stringify(rooms.map(r=>[r.id,roomDecorations(r)]));
    if(key!==decorKey){
      decorKey=key;clearDecor();
      for(const room of rooms)for(const d of roomDecorations(room)){
        const source=library.getObjectByName('decor_'+d.item);
        if(!source)continue;
        const copy=source.clone(true);

        if(Array.isArray(d.position) && d.position.length===3 && d.position.every(n=>Number.isFinite(n))){
          copy.position.set(d.position[0], d.position[1], d.position[2]);
        } else {
          const anchor=slots.get(`${room.id}/${d.slot}`);
          if(anchor){
            copy.position.copy(anchor.getWorldPosition(new THREE.Vector3()));
          } else {
            const defPos=getDefaultPosition(room.id, d.surface, d.slot);
            copy.position.set(defPos[0], defPos[1], defPos[2]);
          }
        }

        if(Array.isArray(d.rotation) && d.rotation.length===3){
          copy.rotation.set(d.rotation[0]*Math.PI/180, d.rotation[1]*Math.PI/180, d.rotation[2]*Math.PI/180);
        } else if(Number.isFinite(d.rotation)){
          copy.rotation.set(0, d.rotation*Math.PI/180, 0);
        }

        if(Array.isArray(d.scale) && d.scale.length===3){
          copy.scale.set(d.scale[0], d.scale[1], d.scale[2]);
        } else if(Number.isFinite(d.scale)){
          copy.scale.set(d.scale, d.scale, d.scale);
        }

        const instId = d.id || `${room.id}_${d.slot||d.item}`;
        copy.userData.instanceId = instId;
        copy.userData.roomId = room.id;
        copy.userData.decorItem = d.item;
        copy.userData.decorSlot = d.slot || null;
        copy.userData.decorText = d.text || null;
        copy.userData.decorPhotos = d.photos || [];
        copy.userData.decorSurface = d.surface || 'floor';
        copy.userData.decorPosition = [copy.position.x, copy.position.y, copy.position.z];
        copy.userData.decorRotation = d.rotation || 0;
        copy.userData.decorScale = d.scale || 1.0;
        copy.userData.decorParentId = d.parent_id || null;
        decorGroup.add(copy);

        copy.traverse(o=>{
          o.userData.instanceId = instId;
          o.userData.roomId = room.id;
          o.userData.decorItem = d.item;
          o.userData.decorSlot = d.slot || null;
          o.userData.decorPhotos = d.photos || [];

          if(!o.isMesh) {
            o.userData.decorText = d.text || null;
            return;
          }

          // Check if this mesh was designated as text surface in the asset/GLB
          const isText = Boolean(o.userData.isTextSurface || o.userData.decorText === true || o.name?.toLowerCase().includes('blank'));
          o.userData.decorText = d.text || null;

          if (isText) {
            o.userData.isTextSurface = true;
            o.material = new THREE.MeshBasicMaterial({color:'#ffffff', side:THREE.DoubleSide});
            decorMaterials.push(o.material);
            const placeholder = d.item === 'calendar' ? '01 / 01' : 'Emoria';
            const displayText = (d.text && d.text.trim()) ? d.text : placeholder;
            const texture = textTexture(displayText, o.userData.photoAspect || 2);
            decorTextTextures.push(texture);
            o.material.map = texture;
            return;
          }

          if(Number.isInteger(o.userData.decorPhotoIndex)){
            o.material = new THREE.MeshBasicMaterial({color:'#f8ecda', side:THREE.DoubleSide});
            decorMaterials.push(o.material);
            o.userData.instanceId = instId;
            o.userData.roomId = room.id;
            o.userData.memoryId = d.photos?.[o.userData.decorPhotoIndex] || null;
            decorSurfaces.push(o);
            return;
          }

          // Other meshes retain original materials
        });
      }
    }
    // Only visible wall/decoration photos are decoded; each texture is at most 512px per side.
    const needed=new Set();
    for(const surface of photoSurfaces()){
      const memories=rooms.find(r=>r.id===surface.userData.roomId)?.memories;
      const memory=Number.isInteger(surface.userData.decorPhotoIndex)?memories?.find(m=>m.id===surface.userData.memoryId):memories?.[surface.userData.photoIndex];
      const url=memory?.photo_url;surface.userData.url=url||null;surface.userData.memory=memory||null;surface.material.map=null;surface.material.color.set('#f8ecda');
      const aspect=surface.userData.photoAspect||4/3,textureKey=`${url}|${aspect}`;surface.userData.textureKey=url?textureKey:null;
      if(url){
        needed.add(textureKey);
        if(textures.has(textureKey)){surface.material.map=textures.get(textureKey);surface.material.color.set('#ffffff');}
        else if(!failedPhotos.has(url)) loadPhoto(url,textureKey,aspect);
      }
      surface.material.needsUpdate=true;
    }
    for(const [url,texture] of textures)if(!needed.has(url)){texture.dispose();textures.delete(url);}
    render();
  }
  const pending=new Set();
  function loadPhoto(url,key,aspect){
    if(pending.has(key))return;pending.add(key);
    const img=new Image();img.crossOrigin='anonymous';img.decoding='async';
    img.onload=()=>{
      pending.delete(key);if(dead||!photoSurfaces().some(s=>s.userData.textureKey===key))return;
      try{
        const c=document.createElement('canvas');c.width=Math.round(512*Math.min(1,aspect));c.height=Math.round(512/Math.max(1,aspect));const ctx=c.getContext('2d');
        const scale=Math.max(c.width/img.width,c.height/img.height),w=img.width*scale,h=img.height*scale;
        ctx.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);
        const texture=new THREE.CanvasTexture(c);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.set(key,texture);
        for(const s of photoSurfaces())if(s.userData.textureKey===key){s.material.map=texture;s.material.color.set('#fff');s.material.needsUpdate=true;}render();
      }catch{failedPhotos.add(url);}
    };
    img.onerror=()=>{pending.delete(key);failedPhotos.add(url);};img.src=url;
  }
  const ray=new THREE.Raycaster();let down;
  const ghostMaterials=[];

  function showGhost(item, position, isValid = true, rotation = 0, scale = 1.0) {
    hideGhost();
    if (!library || !position) return;

    let template = library.getObjectByName(item);
    let copy;
    if (template) {
      copy = template.clone(true);
    } else {
      const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
      copy = new THREE.Mesh(geo);
    }

    const ghostColor = isValid ? '#10b981' : '#ef4444';
    const mat = new THREE.MeshStandardMaterial({
      color: ghostColor,
      transparent: true,
      opacity: 0.65,
      roughness: 0.3,
      metalness: 0.1,
      depthWrite: false
    });
    ghostMaterials.push(mat);

    copy.traverse(child => {
      if (child.isMesh) {
        child.material = mat;
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    copy.position.set(position[0], position[1], position[2]);
    if (Array.isArray(rotation) && rotation.length === 3) {
      copy.rotation.set(rotation[0] * Math.PI / 180, rotation[1] * Math.PI / 180, rotation[2] * Math.PI / 180);
    } else if (Number.isFinite(rotation)) {
      copy.rotation.set(0, rotation * Math.PI / 180, 0);
    }

    if (Array.isArray(scale) && scale.length === 3) {
      copy.scale.set(scale[0], scale[1], scale[2]);
    } else if (Number.isFinite(scale)) {
      copy.scale.set(scale, scale, scale);
    }

    ghostMesh = copy;
    ghostGroup.add(copy);
    render();
  }

  function hideGhost() {
    if (ghostMesh) {
      ghostGroup.remove(ghostMesh);
      disposeTree(ghostMesh);
      ghostMesh = null;
    }
    for (const m of ghostMaterials) m.dispose();
    ghostMaterials.length = 0;
    render();
  }

  function setSelectionHighlight(instanceId) {
    if (highlightBox) {
      selectionHelper.remove(highlightBox);
      disposeTree(highlightBox);
      highlightBox = null;
    }
    if (!instanceId) {
      render();
      return;
    }

    let targetObj = null;
    decorGroup.traverse(o => {
      if (o.userData && o.userData.instanceId === instanceId && !targetObj) {
        targetObj = o;
      }
    });

    if (targetObj) {
      const helper = new THREE.BoxHelper(targetObj, 0xf59e0b);
      highlightBox = helper;
      selectionHelper.add(helper);
    }
    render();
  }

  function setInteracting(isInteracting) {
    controls.enabled = !isInteracting;
  }

  function raycastSurface(clientX, clientY, targetRoomId, itemType, itemScale = 1.0, itemRot = 0, excludeId = null) {
    if (!house || dead) return null;
    const activeRoom = targetRoomId || state.activeRoomId || 'beginning';
    const box = getRoomBoundingBox(activeRoom);
    const r = renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;

    const ext = getRotatedExtents(itemType, itemScale, itemRot);
    const halfX = ext.halfX;
    const halfZ = ext.halfZ;
    const itemHeight = ext.height;

    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    ray.setFromCamera(ndc, camera);

    const intersects = ray.intersectObjects([decorGroup, house], true);
    let chosenHit = null;
    let surfaceType = 'floor';
    let parentId = null;
    let isValid = true;
    let reason = '';

    for (const hit of intersects) {
      if (excludeId && hit.object.userData.instanceId === excludeId) continue;
      const pt = hit.point;
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) continue;
      const margin = 0.25;
      if (
        pt.x >= box.minX - margin && pt.x <= box.maxX + margin &&
        pt.y >= box.floorY - 0.2 && pt.y <= box.ceilingY + margin &&
        pt.z >= box.minZ - margin && pt.z <= box.maxZ + margin
      ) {
        chosenHit = hit;
        break;
      }
    }

    if (chosenHit) {
      const normal = chosenHit.face ? chosenHit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
      normal.transformDirection(chosenHit.object.matrixWorld);

      let checkObj = chosenHit.object;
      while (checkObj && !checkObj.userData.instanceId && checkObj !== decorGroup && checkObj !== house) {
        checkObj = checkObj.parent;
      }

      if (checkObj && checkObj.userData && checkObj.userData.instanceId) {
        const decorItem = checkObj.userData.decorItem;
        if (['table', 'desk', 'shelf', 'carpet', 'album', 'nameplate'].includes(decorItem)) {
          if (normal.y < 0.65) {
            isValid = false;
            reason = 'Chỉ có thể đặt đồ lên mặt trên của vật đỡ';
          } else {
            if (decorItem === 'carpet') {
              surfaceType = 'floor';
            } else if (decorItem === 'shelf') {
              surfaceType = 'shelf';
            } else {
              surfaceType = 'table';
            }
            parentId = checkObj.userData.instanceId;

            // Verify hit point is within parent supporting area (accounting for parent rotation)
            const pDim = ASSET_DIMENSIONS[decorItem] || { width: 0.6, depth: 0.5 };
            const pScale = checkObj.scale?.x || 1.0;
            const pHalfW = (pDim.width * pScale) / 2.0;
            const pHalfD = (pDim.depth * pScale) / 2.0;
            const pRot = checkObj.rotation?.y || 0;
            const dx = chosenHit.point.x - checkObj.position.x;
            const dz = chosenHit.point.z - checkObj.position.z;
            const localDx = dx * Math.cos(-pRot) - dz * Math.sin(-pRot);
            const localDz = dx * Math.sin(-pRot) + dz * Math.cos(-pRot);
            if (
              Math.abs(localDx) > pHalfW + 0.05 ||
              Math.abs(localDz) > pHalfD + 0.05
            ) {
              isValid = false;
              reason = 'Vị trí này nằm ngoài phạm vi mặt đỡ của vật phẩm';
            }
          }
        } else {
          isValid = false;
          reason = 'Món đồ này không thể làm vật đỡ cho món đồ khác';
        }
      } else {
        const meshName = (chosenHit.object.name || '').toLowerCase();
        const parentName = (chosenHit.object.parent?.name || '').toLowerCase();
        const isTableMesh = meshName.includes('table') || parentName.includes('table') || meshName.includes('desk') || parentName.includes('desk');
        const isShelfMesh = meshName.includes('shelf') || parentName.includes('shelf');
        const isFloorMesh = meshName.includes('floor') || parentName.includes('floor') || (normal.y > 0.8 && chosenHit.point.y <= box.floorY + 0.18);
        const isWallMesh = meshName.includes('wall') || meshName.includes('wainscot') || meshName.includes('panel') || parentName.includes('wall') || meshName.includes('plaque');

        if (isTableMesh && normal.y > 0.65) {
          surfaceType = 'table';
        } else if (isShelfMesh && normal.y > 0.65) {
          surfaceType = 'shelf';
        } else if (isFloorMesh && normal.y > 0.7) {
          surfaceType = 'floor';
        } else if (isWallMesh && Math.abs(normal.y) < 0.35 && (Math.abs(normal.z) > 0.65 || Math.abs(normal.x) > 0.65)) {
          surfaceType = 'wall';
        } else {
          // Reject non-declared surfaces (sofa, stairs, ceiling, angled rails)
          isValid = false;
          reason = 'Vị trí này không phải bề mặt đặt đồ hợp lệ (hãy chọn sàn nhà, mặt bàn hoặc tường)';
        }
      }

      // Check if item's scaled/rotated extents would penetrate walls, floor or ceiling
      const isWallPenetrating =
        chosenHit.point.x - halfX < box.minX - 0.02 ||
        chosenHit.point.x + halfX > box.maxX + 0.02 ||
        chosenHit.point.z - halfZ < box.minZ - 0.02 ||
        chosenHit.point.z + halfZ > box.maxZ + 0.02 ||
        chosenHit.point.y < box.floorY - 0.02 ||
        chosenHit.point.y + itemHeight > box.ceilingY + 0.02;

      if (isWallPenetrating && surfaceType !== 'wall') {
        isValid = false;
        reason = 'Kích thước món đồ sau khi xoay/thu phóng vượt quá giới hạn căn phòng (xuyên tường)';
      }

      // Clamp coordinates using true scaled half-extents to keep preview within room boundaries
      const posX = Math.max(box.minX + halfX, Math.min(box.maxX - halfX, chosenHit.point.x));
      const posY = Math.max(box.floorY, Math.min(box.ceilingY - itemHeight, chosenHit.point.y));
      const posZ = Math.max(box.minZ + halfZ, Math.min(box.maxZ - halfZ, chosenHit.point.z));

      if (!Number.isFinite(posX) || !Number.isFinite(posY) || !Number.isFinite(posZ)) {
        return null;
      }

      if (itemType && isValid) {
        const asset = DECORATIONS.find(d => d.id === itemType);
        if (asset && asset.supportedSurfaces && !asset.supportedSurfaces.includes(surfaceType)) {
          isValid = false;
          reason = `Món này cần đặt trên ${asset.supportedSurfaces.join(' hoặc ')}, không đặt trên ${surfaceType}`;
        }
      }

      return {
        isValid,
        reason,
        surface: surfaceType,
        position: [Number(posX.toFixed(3)), Number(posY.toFixed(3)), Number(posZ.toFixed(3))],
        normal: [Number(normal.x.toFixed(3)), Number(normal.y.toFixed(3)), Number(normal.z.toFixed(3))],
        parentId,
        roomId: activeRoom
      };
    }

    // Fallback: virtual floor plane at box.floorY
    const floorY = box.floorY + 0.02;
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
    const planeHit = new THREE.Vector3();
    if (ray.ray.intersectPlane(floorPlane, planeHit)) {
      if (!Number.isFinite(planeHit.x) || !Number.isFinite(planeHit.z)) return null;
      const posX = Math.max(box.minX + halfX, Math.min(box.maxX - halfX, planeHit.x));
      const posY = floorY;
      const posZ = Math.max(box.minZ + halfZ, Math.min(box.maxZ - halfZ, planeHit.z));

      let isValidPlane = true;
      let reasonPlane = '';
      if (itemType) {
        const asset = DECORATIONS.find(d => d.id === itemType);
        if (asset && asset.supportedSurfaces && !asset.supportedSurfaces.includes('floor')) {
          isValidPlane = false;
          reasonPlane = `Món này cần đặt trên ${asset.supportedSurfaces.join(' hoặc ')}`;
        }
      }

      return {
        isValid: isValidPlane,
        reason: reasonPlane,
        surface: 'floor',
        position: [Number(posX.toFixed(3)), Number(posY.toFixed(3)), Number(posZ.toFixed(3))],
        normal: [0, 1, 0],
        parentId: null,
        roomId: activeRoom
      };
    }

    return null;
  }

  function pointerDown(e){
    down={x:e.clientX,y:e.clientY};
    resetGyroOffset();
  }
  function pointerUp(e){
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6||!house)return;
    const placement = getPlacement?.();
    if (placement?.item) {
      const hit = raycastSurface(e.clientX,e.clientY,state.activeRoomId,placement.item,placement.scale,placement.rotation,placement.excludeId);
      if (hit) onSurfaceTap?.(hit);
      return;
    }
    const r=renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
    const hit=ray.intersectObjects([house,decorGroup],true)[0];
    if(hit){
      if(hit.object.userData.url){
        onPhoto?.(hit.object.userData.url, hit.object.userData.memory);
        return;
      }
      if(hit.object.userData.decorItem){
        onDecorItem?.(hit.object.userData.decorItem, {
          id: hit.object.userData.instanceId,
          instanceId: hit.object.userData.instanceId,
          roomId: hit.object.userData.roomId,
          slot: hit.object.userData.decorSlot,
          text: hit.object.userData.decorText,
          photos: hit.object.userData.decorPhotos,
          surface: hit.object.userData.decorSurface,
          position: hit.object.userData.decorPosition,
          rotation: hit.object.userData.decorRotation,
          scale: hit.object.userData.decorScale,
          parent_id: hit.object.userData.decorParentId
        });
        return;
      }
      let o=hit.object;while(o&&!o.userData.roomId)o=o.parent;
      if(o)onRoom?.(o.userData.roomId);
    }
    if(onSurfaceTap){
      const surfaceHit = raycastSurface(e.clientX, e.clientY, state.activeRoomId);
      if(surfaceHit){
        onSurfaceTap(surfaceHit);
      }
    }
  }
  function lost(e){e.preventDefault();onError?.('Chế độ 3D tạm dừng. Chuyển sang khung 2D hoặc tải lại mô hình.');}
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('webglcontextlost',lost);

  function enableGyroscope(enable) {
    if (!enable) {
      gyroActive = false;
      resetGyroOffset();
      if (gyroHandler && typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', gyroHandler);
        gyroHandler = null;
      }
      return Promise.resolve(false);
    }
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
      return Promise.resolve(false);
    }
    const startListener = () => {
      baseGamma = null;
      baseBeta = null;
      gyroHandler = (e) => {
        if (!gyroActive || controls.state !== -1 || currentTween) {
          if (currentGyroOffset.lengthSq() > 0) resetGyroOffset();
          return;
        }
        if (baseGamma === null || baseBeta === null) {
          baseGamma = e.gamma || 0;
          baseBeta = e.beta || 45;
        }
        const dGamma = Math.max(-15, Math.min(15, (e.gamma || 0) - baseGamma));
        const dBeta = Math.max(-15, Math.min(15, (e.beta || 45) - baseBeta));

        // Offset bounded in camera local coordinate space (max 0.12 units)
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(camera.up, forward).normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();

        targetGyroOffset.copy(right).multiplyScalar((dGamma / 15) * 0.10)
          .addScaledVector(up, (dBeta / 15) * 0.08);

        // Remove previously applied offset and apply lerped offset from baseline
        camera.position.sub(currentGyroOffset);
        currentGyroOffset.lerp(targetGyroOffset, 0.08);
        camera.position.add(currentGyroOffset);
        render();
      };
      window.addEventListener('deviceorientation', gyroHandler);
      gyroActive = true;
      return true;
    };

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission()
        .then((perm) => {
          if (perm === 'granted') {
            return startListener();
          }
          return false;
        })
        .catch(() => false);
    } else {
      return Promise.resolve(startListener());
    }
  }

  return {
    update,
    overview,
    focus(roomId,smooth=true){
      const root=roomObjects.get(roomId);if(!root)return;
      const box=new THREE.Box3().setFromObject(root),target=box.getCenter(new THREE.Vector3());
      const destPos=target.clone().add(new THREE.Vector3(.8,1,5.5));
      if(smooth){
        tweenCamera(destPos,target,700);
      }else{
        controls.target.copy(target);camera.position.copy(destPos);controls.update();render();
      }
    },
    enableGyroscope,
    raycastSurface,
    showGhost,
    hideGhost,
    setSelectionHighlight,
    setInteracting,
    capture() {
      if (dead || !renderer) return null;
      render();
      try {
        return renderer.domElement.toDataURL('image/png');
      } catch (err) {
        console.warn('[House3D] Snapshot capture error:', err);
        return null;
      }
    },
    dispose(){
      dead=true;cancelAnimationFrame(frame);cancelAnimationFrame(particleRaf);
      if(currentTween){cancelAnimationFrame(currentTween.raf);currentTween=null;}
      observer.disconnect();intersectionObserver.disconnect();controls.dispose();
      if(typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
      if(gyroHandler && typeof window !== 'undefined') window.removeEventListener('deviceorientation', gyroHandler);
      resetGyroOffset();
      renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('webglcontextlost',lost);
      clearDecor();
      for(const t of textures.values())t.dispose();
      titleTexture?.dispose();disposeTree(titleMesh);disposeTree(house);disposeTree(library);
      particleGeo.dispose();particleMat.dispose();particleTexture?.dispose();
      renderer.dispose();renderer.domElement.remove();
    }
  };
}
