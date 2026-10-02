import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DECORATIONS, roomDecorations, getDefaultPosition, houseLighting, gyroTilt, withEditableHouseFurniture} from './house3d.js';
import {createPlacementSolver, placementTriangles, transformDecoration} from './housePlacement.js';

export function createHouseRenderer(host, {onRoom, onPhoto, onDecorItem, onSurfaceTap, onPlacementPreview, getPlacement, getDragPlacement, isEditing, onGyroChange, onError, onReady}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  const compact = window.matchMedia?.('(pointer: coarse)').matches || host.clientWidth < 640;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,compact ? 1 : 1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  // Shadows change with furniture, not with the camera or floating dust.
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Ngôi nhà 3D: kéo nền để xoay, kéo đồ vật bằng chuột để di chuyển, chạm phòng để chọn');
  renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none';
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9dfd2');
  const camera=new THREE.PerspectiveCamera(34,1,.1,80);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enablePan=false;controls.minDistance=4;controls.maxDistance=40;
  controls.minPolarAngle=.55;controls.maxPolarAngle=1.48;
  controls.minAzimuthAngle=-.65;controls.maxAzimuthAngle=.65;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  controls.enableDamping=false;

  // Lighting setup for 3 distinct moods (Chặng C)
  const ambient=new THREE.HemisphereLight('#fff5e3','#b89d88',1.5);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#ffe3bb',2.4);sun.position.set(-4,8,7);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(compact ? 512 : 1024,compact ? 512 : 1024);
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
  const PARTICLE_COUNT = compact ? 20 : 35;
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
  let lastParticleTime = 0;

  function updateParticles(now) {
    if (dead || !isTabVisible || isReducedMotion || !isCanvasVisible) return;
    particleRaf = requestAnimationFrame(updateParticles);
    const elapsed = now - lastParticleTime;
    if (elapsed < 1000 / 30) return;
    const step = Math.min(elapsed, 70) / (1000 / 60);
    lastParticleTime = now;
    const pos = particleGeo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3 + 1] += particleVel[i * 3 + 1] * step;
      pos[i * 3] += particleVel[i * 3] * step;
      pos[i * 3 + 2] += particleVel[i * 3 + 2] * step;
      if (pos[i * 3 + 1] > 5.5) pos[i * 3 + 1] = 0.5;
      if (pos[i * 3] > 6) pos[i * 3] = -6;
      if (pos[i * 3] < -6) pos[i * 3] = 6;
      if (pos[i * 3 + 2] > 6) pos[i * 3 + 2] = -6;
      if (pos[i * 3 + 2] < -6) pos[i * 3 + 2] = 6;
    }
    particleGeo.attributes.position.needsUpdate = true;
    render();
  }

  function restartParticleLoop() {
    cancelAnimationFrame(particleRaf);
    lastParticleTime = performance.now();
    if (!dead && isTabVisible && !isReducedMotion && isCanvasVisible) {
      particleRaf = requestAnimationFrame(updateParticles);
    }
  }

  const onVisibilityChange = () => {
    isTabVisible = !document.hidden;
    if (!isTabVisible) resetGyroOffset();
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
  let gyroBaseline = null, gyroRaf = 0, gyroTimeout = null, gyroSensitivity = .65;
  const currentGyroOffset = new THREE.Vector3(0, 0, 0);
  const targetGyroOffset = new THREE.Vector3(0, 0, 0);

  function resetGyroOffset() {
    cancelAnimationFrame(gyroRaf); gyroRaf = 0; gyroBaseline = null;
    camera.position.sub(currentGyroOffset);
    currentGyroOffset.set(0, 0, 0); targetGyroOffset.set(0, 0, 0);
    controls.update(); render();
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
  const render=()=>{if(!dead&&!frame&&isTabVisible&&isCanvasVisible){frame=requestAnimationFrame(()=>{frame=0;if(!dead&&isTabVisible&&isCanvasVisible)renderer.render(scene,camera);});}};
  controls.addEventListener('change',render);
  controls.addEventListener('start',()=>{
    resetGyroOffset();
    if(currentTween){
      cancelAnimationFrame(currentTween.raf);
      currentTween=null;
    }
  });

  function tweenCamera(targetPos, targetLookAt, duration=650) {
    resetGyroOffset();
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

  let focusedRoom = null;
  function viewDistance(width, height, depth = 0) { return Math.max(height, width / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.15 + depth / 2; }
  function overview(smooth=false){
    focusedRoom = null;
    resetGyroOffset();
    const destPos=new THREE.Vector3(.35,.22,1).normalize().multiplyScalar(viewDistance(10,5.8,2.6)).add(new THREE.Vector3(0,2.45,0));
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
  const observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(focusedRoom)focusRoom(focusedRoom,false);else overview(false);render();}});observer.observe(host);
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
    next={...next, rooms:withEditableHouseFurniture(next.rooms || [])};
    state=next;if(!house||dead)return;
    const rooms=next.rooms||[];
    const colors={classic:'#c2a77e',warm_gold:'#c9a375',rose_romance:'#d6a0a6',midnight:'#8995bc',minimal_dark:'#8e8b88',editorial_cream:'#d4c4a5'};
    house.traverse(o=>{if(o.isMesh&&o.material?.name==='Theme blush')o.material.color.set(colors[next.theme]||colors.warm_gold);});
    const light=houseLighting(rooms);

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
      renderer.shadowMap.needsUpdate=true;
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

        const instId = d.id || d.slot;
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
            o.userData.decorPhotoIndex = 0;
            o.userData.placeholderText = d.item === 'calendar' ? '01 / 01' : 'Emoria';
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
      if (Number.isInteger(surface.userData.photoIndex)) surface.visible=Boolean(url);
      const caption = surface.userData.decorText || '';
      if (!url && (caption || surface.userData.placeholderText)) {
        let texture = surface.userData.textTexture;
        if (!texture) { texture = textTexture(caption || surface.userData.placeholderText, surface.userData.photoAspect || 4/3); surface.userData.textTexture = texture; decorTextTextures.push(texture); }
        surface.material.map = texture; surface.material.color.set('#fff');
      }
      const aspect=surface.userData.photoAspect||4/3,textureKey=JSON.stringify([url,aspect,caption]);surface.userData.textureKey=url?textureKey:null;
      if(url){
        needed.add(textureKey);
        if(textures.has(textureKey)){surface.material.map=textures.get(textureKey);surface.material.color.set('#ffffff');}
        else if(!failedPhotos.has(url)) loadPhoto(url,textureKey,aspect,caption);
      }
      surface.material.needsUpdate=true;
    }
    for(const [url,texture] of textures)if(!needed.has(url)){texture.dispose();textures.delete(url);}
    render();
  }
  const pending=new Set();
  function loadPhoto(url,key,aspect,caption){
    if(pending.has(key))return;pending.add(key);
    const img=new Image();img.crossOrigin='anonymous';img.decoding='async';
    img.onload=()=>{
      pending.delete(key);if(dead||!photoSurfaces().some(s=>s.userData.textureKey===key))return;
      try{
        const c=document.createElement('canvas');c.width=Math.round(512*Math.min(1,aspect));c.height=Math.round(512/Math.max(1,aspect));const ctx=c.getContext('2d');
        const scale=Math.max(c.width/img.width,c.height/img.height),w=img.width*scale,h=img.height*scale;
        ctx.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);
        if (caption) {
          const lines = caption.split('\n');
          ctx.font = `600 ${Math.max(12, Math.round(c.height * .065))}px Georgia, serif`;
          const wrapped = [];
          for (const line of lines) {
            let current = '';
            for (const word of line.split(' ')) {
              if (current && ctx.measureText(current + ' ' + word).width > c.width - 24) { wrapped.push(current); current = word; }
              else current += (current ? ' ' : '') + word;
            }
            wrapped.push(current);
          }
          const lineHeight = Math.max(16, c.height * .08), shown = wrapped.slice(0, 4);
          const top = c.height - shown.length * lineHeight - 12;
          ctx.fillStyle = 'rgba(25,18,14,.72)'; ctx.fillRect(0, top, c.width, c.height - top);
          ctx.fillStyle = '#fff5df'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          shown.forEach((line, i) => ctx.fillText(line, c.width / 2, top + 6 + (i + .5) * lineHeight, c.width - 20));
        }
        const texture=new THREE.CanvasTexture(c);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.set(key,texture);
        for(const s of photoSurfaces())if(s.userData.textureKey===key){s.material.map=texture;s.material.color.set('#fff');s.material.needsUpdate=true;}render();
      }catch{failedPhotos.add(url);}
    };
    img.onerror=()=>{pending.delete(key);failedPhotos.add(url);};img.src=url;
  }
  const ray=new THREE.Raycaster();let down;
  const ghostMaterials=[];

  let ghostKey = '';
  function showGhost(item, position, isValid = true, rotation = 0, scale = 1) {
    if (!library || !position || !isValid) return;
    const key = JSON.stringify([item, rotation, scale]);
    if (key !== ghostKey || !ghostMesh) {
      hideGhost();
      const template = library.getObjectByName('decor_' + item);
      if (!template) return;
      ghostMesh = template.clone(true);
      ghostMesh.traverse(child => {
        if (!child.isMesh) return;
        const cloneMaterial = original => {
          const mat = original.clone();
          mat.transparent = true; mat.opacity = .72; mat.depthWrite = false;
          ghostMaterials.push(mat); return mat;
        };
        child.material = Array.isArray(child.material) ? child.material.map(cloneMaterial) : cloneMaterial(child.material);
        child.castShadow = false;
      });
      ghostGroup.add(ghostMesh); ghostKey = key;
    }
    transformDecoration(ghostMesh, position, rotation, scale);
    render();
  }

  function hideGhost() {
    if (ghostMesh) ghostGroup.remove(ghostMesh);
    // Clones share geometry and textures with the library: only release cloned materials.
    ghostMesh = null; ghostKey = '';
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

  const roomTriangles = new Map();
  const supportTriangles = new WeakMap();
  let houseTriangles;
  let solverKey = '', solver;
  const supportType = item => DECORATIONS.find(d => d.id === item)?.supportsItems ? (item === 'shelf' ? 'shelf' : 'table') : null;
  function placementSupports(roomId, excludeId = null, excludeIds = []) {
    return decorGroup.children.filter(o => o.userData.roomId === roomId && o.userData.instanceId !== excludeId && !excludeIds.includes(o.userData.instanceId) && supportType(o.userData.decorItem));
  }
  function getSolver(roomId, item, scale = 1, rotation = 0, excludeId = null, extra = [], excludeIds = []) {
    const template = library?.getObjectByName('decor_' + item);
    const root = roomObjects.get(roomId);
    if (!template || !root) return null;
    const key = JSON.stringify([decorKey, roomId, item, scale, rotation, excludeId, extra, excludeIds]);
    if (key === solverKey) return solver;
    if (!roomTriangles.has(roomId)) roomTriangles.set(roomId, placementTriangles(root));
    houseTriangles ||= placementTriangles(house);
    const triangles = [...roomTriangles.get(roomId)], collisionTriangles = [...houseTriangles], obstacles = [];
    function include(copy, itemId, parentId, inRoom = true) {
      const surface = supportType(itemId);
      if (!surface) { obstacles.push(new THREE.Box3().setFromObject(copy, true)); return; }
      if (!supportTriangles.has(copy)) supportTriangles.set(copy, placementTriangles(copy).map(entry => ({ ...entry, surface, parentId })));
      const entries = supportTriangles.get(copy);
      if (inRoom) triangles.push(...entries);
      // A support's empty space remains usable (e.g. inside a cubby). Its real
      // triangles still reject penetration into boards, legs and table edges.
      collisionTriangles.push(...entries);
    }
    for (const copy of decorGroup.children) {
      if (copy.userData.instanceId === excludeId || excludeIds.includes(copy.userData.instanceId)) continue;
      include(copy, copy.userData.decorItem, copy.userData.instanceId, copy.userData.roomId === roomId);
    }
    for (const d of extra) {
      const source = library.getObjectByName('decor_' + d.item);
      if (!source) continue;
      const copy = source.clone(true);
      transformDecoration(copy, d.position, d.rotation, d.scale);
      include(copy, d.item, d.id || d.slot || null);
    }
    solver = createPlacementSolver({ template, roomId, triangles, collisionTriangles, obstacles, scale, rotation });
    solverKey = key;
    return solver;
  }
  function findPlacement(roomId, item, options = {}) {
    for (const scale of options.scale === undefined ? [1, .8, .6] : [options.scale]) {
      const hit = getSolver(roomId, item, scale, options.rotation, options.excludeId, options.extra, options.excludeIds)?.find(options.position ? new THREE.Vector3(...options.position) : undefined);
      if (hit) return hit;
    }
    return null;
  }
  function raycastSurface(clientX, clientY, roomId, item, scale = 1, rotation = 0, excludeId = null) {
    if (!house || dead) return null;
    const activeRoom = roomId || state.activeRoomId;
    const resolver = getSolver(activeRoom, item, scale, rotation, excludeId);
    if (!resolver) return null;
    const r = renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1, -(clientY-r.top)/r.height*2+1), camera);
    const hit = ray.intersectObjects([roomObjects.get(activeRoom), ...placementSupports(activeRoom, excludeId)], true)[0];
    let point = hit?.point;
    if (!point) {
      point = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), point)) return null;
    }
    return resolver.find(point);
  }
  function pick(clientX, clientY) {
    if (!house) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1, -(clientY-r.top)/r.height*2+1), camera);
    return ray.intersectObjects([house, decorGroup], true)[0];
  }
  function previewPointer(e, placement = getPlacement?.()) {
    if (!placement?.item) return null;
    const hit = raycastSurface(e.clientX, e.clientY, placement.roomId || state.activeRoomId, placement.item, placement.scale, placement.rotation, placement.excludeId);
    if (hit) {
      showGhost(placement.item, hit.position, true, placement.rotation, placement.scale);
      onPlacementPreview?.(hit);
    }
    return hit;
  }
  function pointerDown(e) {
    if (down || e.button !== 0 || e.isPrimary === false) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, placing: Boolean(getPlacement?.()?.item) };
    if (!down.placing && e.pointerType === 'mouse' && isEditing?.()) {
      const hit = pick(e.clientX, e.clientY);
      if (hit?.object.userData.decorItem) {
        let root = hit.object;
        while (root.parent && root.parent !== decorGroup) root = root.parent;
        down.drag = getDragPlacement?.(root.userData);
      }
    }
    resetGyroOffset();
    if (down.placing || down.drag) {
      if(currentTween){cancelAnimationFrame(currentTween.raf);currentTween=null;}
      controls.enabled = false;
      renderer.domElement.setPointerCapture(e.pointerId);
      if (down.placing) down.hit = previewPointer(e);
      e.stopImmediatePropagation();
    }
  }
  function pointerMove(e) {
    if (!down) {
      if (e.pointerType === 'mouse' && !e.buttons) previewPointer(e);
      return;
    }
    if (down.id !== e.pointerId || (!down.placing && !down.drag)) return;
    if (down.drag && Math.hypot(e.clientX-down.x, e.clientY-down.y) <= 6 && !down.moved) return;
    down.moved = true;
    down.hit = previewPointer(e, down.drag || getPlacement?.()) || down.hit;
  }
  function pointerCancel(e) {
    if (down?.id !== e.pointerId) return;
    down = null;
    if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
    controls.enabled = !getPlacement?.()?.item;
    hideGhost();
  }
  function pointerUp(e) {
    if (!down || down.id !== e.pointerId) return;
    const gesture = down; down = null;
    if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
    if (gesture.drag) {
      controls.enabled = !getPlacement?.()?.item;
      hideGhost();
      if (gesture.moved) {
        const hit = raycastSurface(e.clientX, e.clientY, gesture.drag.roomId, gesture.drag.item, gesture.drag.scale, gesture.drag.rotation, gesture.drag.excludeId) || gesture.hit;
        if (hit && isEditing?.()) onSurfaceTap?.(hit, gesture.drag.excludeId);
        return;
      }
    }
    if (gesture.placing) {
      const hit = previewPointer(e) || gesture.hit;
      if (hit && getPlacement?.()?.item) onSurfaceTap?.(hit);
      return;
    }
    if (Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>6 || !house) return;
    const hit=pick(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.object.userData.decorItem && (isEditing?.() || !hit.object.userData.url)) {
      let root = hit.object;
      while (root.parent && root.parent !== decorGroup) root = root.parent;
      const data = root.userData;
      onDecorItem?.(data.decorItem, { id: data.instanceId, roomId: data.roomId, slot: data.decorSlot, text: data.decorText, photos: data.decorPhotos, surface: data.decorSurface, position: data.decorPosition, rotation: data.decorRotation, scale: data.decorScale, parent_id: data.decorParentId });
      return;
    }
    if (hit.object.userData.url) { onPhoto?.(hit.object.userData.url, hit.object.userData.memory); return; }
    let o=hit.object;while(o&&!o.userData.roomId)o=o.parent;
    if(o)onRoom?.(o.userData.roomId);
  }
  function lost(e){e.preventDefault();onError?.('Chế độ 3D tạm dừng. Chuyển sang khung 2D hoặc tải lại mô hình.');}
  renderer.domElement.addEventListener('pointerdown',pointerDown,true);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointercancel',pointerCancel);renderer.domElement.addEventListener('lostpointercapture',pointerCancel);renderer.domElement.addEventListener('webglcontextlost',lost);

  function animateGyro() {
    gyroRaf = 0;
    if (!gyroActive || dead || !isTabVisible || !isCanvasVisible || down || currentTween || !controls.enabled) return;
    camera.position.sub(currentGyroOffset);
    currentGyroOffset.lerp(targetGyroOffset, .12);
    camera.position.add(currentGyroOffset); render();
    if (currentGyroOffset.distanceToSquared(targetGyroOffset) > .000001) gyroRaf = requestAnimationFrame(animateGyro);
  }
  const orientationChanged = () => resetGyroOffset();
  async function enableGyroscope(enable) {
    clearTimeout(gyroTimeout);
    if (gyroHandler) window.removeEventListener('deviceorientation', gyroHandler);
    window.removeEventListener('orientationchange', orientationChanged);
    gyroHandler = null; gyroActive = false; resetGyroOffset();
    if (!enable) { onGyroChange?.(false, ''); return false; }
    const Orientation = window.DeviceOrientationEvent;
    if (!Orientation) { onGyroChange?.(false, 'Thiết bị này không cung cấp cảm biến nghiêng. Bạn vẫn có thể kéo để xoay.'); return false; }
    try {
      if (typeof Orientation.requestPermission === 'function' && await Orientation.requestPermission() !== 'granted') {
        onGyroChange?.(false, 'Chưa được cấp quyền cảm biến. Bạn có thể tiếp tục kéo để xoay.'); return false;
      }
    } catch { onGyroChange?.(false, 'Chưa bật được cảm biến. Hãy mở trang bằng HTTPS trên điện thoại.'); return false; }
    if (dead) return false;
    gyroActive = true;
    gyroTimeout = setTimeout(() => {
      enableGyroscope(false);
      onGyroChange?.(false, 'Chưa nhận được cảm biến. Hãy thử lại trên điện thoại hoặc kéo để xoay.');
    }, 3500);
    gyroHandler = e => {
      if (!Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
      clearTimeout(gyroTimeout);
      if (!gyroActive || !isTabVisible || !isCanvasVisible || down || currentTween || !controls.enabled) { gyroBaseline = null; return; }
      gyroBaseline ||= [e.beta, e.gamma];
      const [x, y] = gyroTilt(e.beta, e.gamma, gyroBaseline, window.screen.orientation?.angle ?? window.orientation ?? 0, gyroSensitivity);
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();
      targetGyroOffset.copy(right).multiplyScalar(x * .28).addScaledVector(up, -y * .2);
      if (!gyroRaf) gyroRaf = requestAnimationFrame(animateGyro);
    };
    window.addEventListener('deviceorientation', gyroHandler, { passive: true });
    window.addEventListener('orientationchange', orientationChanged);
    onGyroChange?.(true, ''); return true;
  }

  function focusRoom(roomId, smooth = true) {
    const root=roomObjects.get(roomId);if(!root)return;
    focusedRoom = roomId; resetGyroOffset();
    const box=new THREE.Box3().setFromObject(root),target=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const destPos=target.clone().add(new THREE.Vector3(.12,.14,1).normalize().multiplyScalar(viewDistance(size.x,size.y,size.z)));
    if(smooth) tweenCamera(destPos,target,500);
    else { controls.target.copy(target);camera.position.copy(destPos);controls.update();render(); }
  }

  return {
    update,
    overview,
    focus: focusRoom,
    calibrateGyroscope: resetGyroOffset,
    setGyroSensitivity(value) { if (Number.isFinite(value)) gyroSensitivity = Math.max(.2, Math.min(1.5, value)); },
    enableGyroscope,
    raycastSurface,
    findPlacement,
    showGhost,
    hideGhost,
    setSelectionHighlight,
    setInteracting,
    capture() {
      if (dead || !renderer) return null;
      renderer.render(scene,camera);
      try {
        return renderer.domElement.toDataURL('image/png');
      } catch (err) {
        console.warn('[House3D] Snapshot capture error:', err);
        return null;
      }
    },
    async captureWhenReady({ timeoutMs = 5000 } = {}) {
      const end = Date.now() + Math.max(0, Math.min(10000, timeoutMs));
      while (!dead && (!house || pending.size) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 30));
      if (dead || !house || pending.size) return null;
      overview(false);renderer.render(scene,camera);
      try { return renderer.domElement.toDataURL('image/png'); } catch { return null; }
    },
    async captureOverviewWhenReady(options) {
      const position=camera.position.clone(), target=controls.target.clone(), room=focusedRoom;
      try { return await this.captureWhenReady(options); }
      finally {
        if (!dead) { focusedRoom=room;camera.position.copy(position);controls.target.copy(target);controls.update();render(); }
      }
    },
    dispose(){
      dead=true;cancelAnimationFrame(frame);cancelAnimationFrame(particleRaf);
      if(currentTween){cancelAnimationFrame(currentTween.raf);currentTween=null;}
      observer.disconnect();intersectionObserver.disconnect();controls.dispose();
      if(typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
      if(gyroHandler && typeof window !== 'undefined') window.removeEventListener('deviceorientation', gyroHandler);
      clearTimeout(gyroTimeout); cancelAnimationFrame(gyroRaf);
      window.removeEventListener('orientationchange', orientationChanged);
      resetGyroOffset();
      renderer.domElement.removeEventListener('pointerdown',pointerDown,true);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointercancel',pointerCancel);renderer.domElement.removeEventListener('lostpointercapture',pointerCancel);renderer.domElement.removeEventListener('webglcontextlost',lost);
      clearDecor();
      for(const t of textures.values())t.dispose();
      titleTexture?.dispose();disposeTree(titleMesh);disposeTree(house);disposeTree(library);
      particleGeo.dispose();particleMat.dispose();particleTexture?.dispose();
      renderer.dispose();renderer.domElement.remove();
    }
  };
}
