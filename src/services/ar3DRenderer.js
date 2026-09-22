import * as THREE from 'three';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function isWebGLAvailable() {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

/**
 * Creates luxury PBR materials for jewelry metals and gemstones
 */
export function createJewelryMaterials() {
  // S925 Sterling Silver Material (High metallic, low roughness, mirror sheen)
  const silver = new THREE.MeshPhysicalMaterial({
    color: 0xf2f4f8,
    metalness: 0.98,
    roughness: 0.12,
    clearcoat: 0.65,
    clearcoatRoughness: 0.1,
    reflectivity: 0.95,
    envMapIntensity: 1.5
  });

  // 18K Luxury Yellow Gold
  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xf5d061,
    metalness: 0.96,
    roughness: 0.15,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    reflectivity: 0.9,
    envMapIntensity: 1.4
  });

  // 18K Rose Gold
  const roseGold = new THREE.MeshPhysicalMaterial({
    color: 0xf2a89b,
    metalness: 0.96,
    roughness: 0.16,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    reflectivity: 0.9,
    envMapIntensity: 1.4
  });

  // Brilliant Cubic Zirconia / Diamond Material
  const diamond = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.02,
    transmission: 0.93,
    ior: 2.417, // Natural Diamond index of refraction
    thickness: 1.8,
    specularIntensity: 1.0,
    specularColor: 0xffffff,
    envMapIntensity: 2.2
  });

  // Red Ruby Enamel (Pulse signature)
  const ruby = new THREE.MeshPhysicalMaterial({
    color: 0xd90429,
    metalness: 0.2,
    roughness: 0.08,
    transmission: 0.82,
    ior: 1.77,
    thickness: 1.2
  });

  // Invisible Depth Occluder (Writes only to depth buffer, hides back half of jewelry behind finger/wrist)
  const occluder = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true
  });

  return { silver, gold, roseGold, diamond, ruby, occluder };
}

/**
 * Builds high-fidelity 3D Ring Model with Finger Occlusion Cylinder
 */
export function buildRingModel(productId, { size = 17, scale = 1, ringScale = 0.22 } = {}) {
  const materials = createJewelryMaterials();
  const root = new THREE.Group();
  root.name = 'RingRoot';

  // Base dimensions calibrated to finger phalanx
  const baseRadius = 24 * (size / 17) * clamp(scale, 0.7, 1.5) * (ringScale / 0.22);
  const bandThickness = baseRadius * 0.18;
  const fingerRadius = baseRadius * 0.95; // Snug fit inside the ring
  const fingerLength = baseRadius * 4.0;

  // 1. FINGER OCCLUDER: Cylinder aligned along the finger axis (Y-axis)
  // This cuts off the back-half of the ring that passes behind the human finger!
  const occluderGeo = new THREE.CylinderGeometry(fingerRadius, fingerRadius, fingerLength, 32);
  const occluderMesh = new THREE.Mesh(occluderGeo, materials.occluder);
  occluderMesh.renderOrder = 0; // Must be rendered first to establish depth buffer
  root.add(occluderMesh);

  // 2. MAIN 3D RING GROUP (renderOrder = 1)
  const ringGroup = new THREE.Group();
  ringGroup.renderOrder = 1;

  // Choose style based on product
  const isGoldAccented = productId.includes('horizon');
  const isHalo = productId.includes('halo');
  const primaryMat = isGoldAccented ? materials.silver : (productId.includes('echo') ? materials.silver : materials.silver);

  // Main Band: Torus lying in X-Z plane (normal along Y-axis, matching finger axis)
  const bandGeo = new THREE.TorusGeometry(baseRadius, bandThickness / 2, 24, 64);
  bandGeo.rotateX(Math.PI / 2); // Rotate torus so finger passes through it along Y axis
  const mainBand = new THREE.Mesh(bandGeo, primaryMat);
  mainBand.renderOrder = 1;
  ringGroup.add(mainBand);

  // Inner rim polish highlight
  const innerBandGeo = new THREE.TorusGeometry(baseRadius * 0.98, bandThickness * 0.15, 16, 48);
  innerBandGeo.rotateX(Math.PI / 2);
  const innerBand = new THREE.Mesh(innerBandGeo, materials.silver);
  innerBand.renderOrder = 1;
  ringGroup.add(innerBand);

  if (isGoldAccented) {
    // 18K Gold inlay ribbon along outer center channel
    const inlayGeo = new THREE.TorusGeometry(baseRadius * 1.02, bandThickness * 0.22, 16, 64);
    inlayGeo.rotateX(Math.PI / 2);
    const inlay = new THREE.Mesh(inlayGeo, materials.gold);
    inlay.renderOrder = 1;
    ringGroup.add(inlay);

    // Bezel solitaire gem at top (+Z outward from dorsal finger surface)
    const gemGeo = new THREE.OctahedronGeometry(baseRadius * 0.28, 2);
    const gem = new THREE.Mesh(gemGeo, materials.diamond);
    gem.position.set(0, 0, baseRadius + bandThickness * 0.6);
    gem.renderOrder = 1;
    ringGroup.add(gem);

    // Bezel collar
    const collarGeo = new THREE.CylinderGeometry(baseRadius * 0.32, baseRadius * 0.35, bandThickness * 0.5, 16);
    collarGeo.rotateX(Math.PI / 2);
    const collar = new THREE.Mesh(collarGeo, materials.gold);
    collar.position.set(0, 0, baseRadius + bandThickness * 0.3);
    collar.renderOrder = 1;
    ringGroup.add(collar);

  } else if (isHalo) {
    // Solitaire center cushion diamond with 4 prongs
    const gemGeo = new THREE.OctahedronGeometry(baseRadius * 0.36, 2);
    const gem = new THREE.Mesh(gemGeo, materials.diamond);
    gem.position.set(0, 0, baseRadius + bandThickness * 0.7);
    gem.renderOrder = 1;
    ringGroup.add(gem);

    // Halo micro-pavé ring around the center gem
    const haloGeo = new THREE.TorusGeometry(baseRadius * 0.38, bandThickness * 0.18, 16, 32);
    const halo = new THREE.Mesh(haloGeo, materials.silver);
    halo.position.set(0, 0, baseRadius + bandThickness * 0.5);
    halo.renderOrder = 1;
    ringGroup.add(halo);

    // 4 prongs
    for (let i = 0; i < 4; i++) {
      const prongAngle = (i * Math.PI) / 2 + Math.PI / 4;
      const prongGeo = new THREE.CylinderGeometry(bandThickness * 0.08, bandThickness * 0.08, bandThickness * 0.8, 8);
      prongGeo.rotateX(Math.PI / 2);
      const prong = new THREE.Mesh(prongGeo, materials.silver);
      prong.position.set(
        Math.cos(prongAngle) * baseRadius * 0.32,
        Math.sin(prongAngle) * baseRadius * 0.32,
        baseRadius + bandThickness * 0.55
      );
      prong.renderOrder = 1;
      ringGroup.add(prong);
    }

  } else {
    // Elegant Classic / Duo Pavé
    const gemGeo = new THREE.OctahedronGeometry(baseRadius * 0.3, 2);
    const gem = new THREE.Mesh(gemGeo, materials.diamond);
    gem.position.set(0, 0, baseRadius + bandThickness * 0.5);
    gem.renderOrder = 1;
    ringGroup.add(gem);

    // Subtle side stones
    [-1, 1].forEach(dir => {
      const sideGemGeo = new THREE.OctahedronGeometry(baseRadius * 0.16, 1);
      const sideGem = new THREE.Mesh(sideGemGeo, materials.diamond);
      sideGem.position.set(dir * baseRadius * 0.38, 0, baseRadius + bandThickness * 0.35);
      sideGem.renderOrder = 1;
      ringGroup.add(sideGem);
    });
  }

  root.add(ringGroup);
  return root;
}

/**
 * Builds high-fidelity 3D Bracelet / Bangle Model with Wrist Occlusion
 */
export function buildBraceletModel(productId, { size = 16, scale = 1, braceletScale = 0.35 } = {}) {
  const materials = createJewelryMaterials();
  const root = new THREE.Group();
  root.name = 'BraceletRoot';

  // Wrist is elliptical in cross section: wider horizontally, flatter in thickness
  const radiusX = 52 * (size / 16) * clamp(scale, 0.7, 1.5) * (braceletScale / 0.35);
  const radiusY = radiusX * 0.68;
  const cuffThickness = radiusX * 0.14;
  const armLength = radiusX * 3.5;

  // 1. WRIST OCCLUDER: Elliptical cylinder along Y-axis (forearm axis)
  const wristGeo = new THREE.CylinderGeometry(radiusX * 0.95, radiusX * 0.95, armLength, 32);
  wristGeo.scale(1, 1, radiusY / radiusX); // Flatten into ellipse
  const wristMesh = new THREE.Mesh(wristGeo, materials.occluder);
  wristMesh.renderOrder = 0;
  root.add(wristMesh);

  // 2. 3D BRACELET GROUP
  const braceletGroup = new THREE.Group();
  braceletGroup.renderOrder = 1;

  // Elliptical Torus Curve (Cuff band)
  const curvePoints = [];
  const segments = 64;
  const isCuff = true; // open cuff on underside
  const maxTheta = isCuff ? Math.PI * 1.75 : Math.PI * 2;
  const startTheta = isCuff ? (Math.PI * 2 - maxTheta) / 2 : 0;

  for (let i = 0; i <= segments; i++) {
    const theta = startTheta + (i / segments) * maxTheta - Math.PI / 2;
    const x = Math.cos(theta) * radiusX;
    const z = Math.sin(theta) * radiusY;
    curvePoints.push(new THREE.Vector3(x, 0, z));
  }

  const curve = new THREE.CatmullRomCurve3(curvePoints);
  const tubeGeo = new THREE.TubeGeometry(curve, 64, cuffThickness / 2, 16, false);
  const isPulse = productId.includes('pulse');
  const isCelestial = productId.includes('celestial');
  const primaryMat = materials.silver;

  const mainTube = new THREE.Mesh(tubeGeo, primaryMat);
  mainTube.renderOrder = 1;
  braceletGroup.add(mainTube);

  if (isPulse) {
    // Pulse Heartbeat Centerpiece Crest (Top dorsal side at +Z)
    const pulseGeo = new THREE.BoxGeometry(radiusX * 0.45, cuffThickness * 1.6, cuffThickness * 0.8);
    const pulseMesh = new THREE.Mesh(pulseGeo, materials.silver);
    pulseMesh.position.set(0, 0, radiusY + cuffThickness * 0.3);
    pulseMesh.renderOrder = 1;
    braceletGroup.add(pulseMesh);

    // Red Ruby Heartbeat Inlay Line
    const rubyLineGeo = new THREE.BoxGeometry(radiusX * 0.35, cuffThickness * 0.4, cuffThickness * 0.9);
    const rubyMesh = new THREE.Mesh(rubyLineGeo, materials.ruby);
    rubyMesh.position.set(0, 0, radiusY + cuffThickness * 0.35);
    rubyMesh.renderOrder = 1;
    braceletGroup.add(rubyMesh);

  } else if (isCelestial) {
    // Twin Planetary Orbs
    [-radiusX * 0.15, radiusX * 0.15].forEach((offset, idx) => {
      const orbGeo = new THREE.SphereGeometry(cuffThickness * 0.9, 24, 24);
      const orb = new THREE.Mesh(orbGeo, idx === 0 ? materials.gold : materials.diamond);
      orb.position.set(offset, 0, radiusY + cuffThickness * 0.5);
      orb.renderOrder = 1;
      braceletGroup.add(orb);
    });
  } else {
    // Classic Luxury Orbit Double Ring
    const innerTubeGeo = new THREE.TubeGeometry(curve, 48, cuffThickness * 0.35, 12, false);
    innerTubeGeo.rotateY(0.08);
    const innerTube = new THREE.Mesh(innerTubeGeo, materials.gold);
    innerTube.renderOrder = 1;
    braceletGroup.add(innerTube);
  }

  root.add(braceletGroup);
  return root;
}

/**
 * Builds high-fidelity 3D Necklace & Starburst/Compass Pendant Model
 */
export function buildNecklaceModel(productId, { length = 45, scale = 1, pendantScale = 0.09 } = {}) {
  const materials = createJewelryMaterials();
  const root = new THREE.Group();
  root.name = 'NecklaceRoot';

  const pSize = 34 * clamp(scale, 0.7, 1.5) * (pendantScale / 0.09);

  // 1. CHEST OCCLUDER: Curved planar cylinder representing upper chest
  const chestGeo = new THREE.CylinderGeometry(pSize * 4.5, pSize * 4.5, pSize * 4.0, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3);
  chestGeo.rotateZ(Math.PI / 2);
  const chestMesh = new THREE.Mesh(chestGeo, materials.occluder);
  chestMesh.position.set(0, 0, -pSize * 0.6);
  chestMesh.renderOrder = 0;
  root.add(chestMesh);

  // 2. 3D PENDANT GROUP
  const pendantGroup = new THREE.Group();
  pendantGroup.renderOrder = 1;

  // Starburst Compass Rose Medallion (Emoria Lumen design)
  // Outer beveled disc
  const discGeo = new THREE.CylinderGeometry(pSize * 0.55, pSize * 0.58, pSize * 0.12, 32);
  discGeo.rotateX(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, materials.silver);
  disc.renderOrder = 1;
  pendantGroup.add(disc);

  // Raised beaded rim
  const rimGeo = new THREE.TorusGeometry(pSize * 0.54, pSize * 0.04, 16, 48);
  const rim = new THREE.Mesh(rimGeo, materials.gold);
  rim.position.set(0, 0, pSize * 0.06);
  rim.renderOrder = 1;
  pendantGroup.add(rim);

  // Eight-Pointed Star Compass Rose Relief
  const starGroup = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const isMainRay = i % 2 === 0;
    const rayLength = isMainRay ? pSize * 0.44 : pSize * 0.32;
    const rayWidth = isMainRay ? pSize * 0.12 : pSize * 0.08;

    const rayGeo = new THREE.ConeGeometry(rayWidth, rayLength, 4);
    rayGeo.rotateZ(Math.PI); // Point outward
    const ray = new THREE.Mesh(rayGeo, isMainRay ? materials.silver : materials.gold);
    ray.position.set(0, rayLength / 2, pSize * 0.08);
    ray.rotation.z = (i * Math.PI) / 4;
    starGroup.add(ray);
  }
  pendantGroup.add(starGroup);

  // Center Solitaire Crystal (The North Star Heart)
  const centerGemGeo = new THREE.OctahedronGeometry(pSize * 0.18, 2);
  const centerGem = new THREE.Mesh(centerGemGeo, materials.diamond);
  centerGem.position.set(0, 0, pSize * 0.14);
  centerGem.renderOrder = 1;
  pendantGroup.add(centerGem);

  // Bail Loop (connector between pendant and chain)
  const bailGeo = new THREE.TorusGeometry(pSize * 0.12, pSize * 0.03, 12, 24);
  const bail = new THREE.Mesh(bailGeo, materials.silver);
  bail.position.set(0, pSize * 0.65, 0);
  bail.renderOrder = 1;
  pendantGroup.add(bail);

  root.add(pendantGroup);
  return root;
}

/**
 * High-performance 3D Scene Controller
 */
export class AR3DScene {
  constructor(width, height) {
    this.width = width || 640;
    this.height = height || 480;
    this.activeModel = null;
    this.currentType = null;
    this.currentId = null;

    if (typeof document !== 'undefined') {
      this.domElement = document.createElement('canvas');
      this.domElement.width = this.width;
      this.domElement.height = this.height;

      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.domElement,
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.width, this.height, false);
        this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } catch (e) {
        this.renderer = null;
      }
    }

    // Scene & Pixel-Calibrated Perspective Camera
    this.scene = new THREE.Scene();
    const fov = 45;
    this.camera = new THREE.PerspectiveCamera(fov, this.width / this.height, 1, 5000);
    const cameraDist = (this.height / 2) / Math.tan((fov * Math.PI / 180) / 2);
    this.camera.position.set(0, 0, cameraDist);
    this.camera.lookAt(0, 0, 0);

    // Luxury Studio Lighting Setup
    this.setupLighting();
  }

  setupLighting() {
    // Soft Ambient Light
    const ambient = new THREE.AmbientLight(0xfff5ea, 1.4);
    this.scene.add(ambient);

    // Key Light (Crisp diamond sparkle & metallic specular highlights)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(250, 450, 500);
    this.scene.add(keyLight);

    // Fill Light (Cool silver metallic sheen)
    const fillLight = new THREE.DirectionalLight(0xdbe7f6, 1.6);
    fillLight.position.set(-300, -150, 350);
    this.scene.add(fillLight);

    // Bottom Rim Light (Bounce light simulating neck/chest/hand skin warmth)
    const rimLight = new THREE.DirectionalLight(0xffdfc4, 1.0);
    rimLight.position.set(0, -350, 200);
    this.scene.add(rimLight);

    // Top Shimmer Light
    const shimmer = new THREE.DirectionalLight(0xffffff, 1.2);
    shimmer.position.set(0, 600, 800);
    this.scene.add(shimmer);
  }

  resize(width, height) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    if (this.domElement) {
      this.domElement.width = width;
      this.domElement.height = height;
    }
    if (this.renderer) {
      this.renderer.setSize(width, height, false);
    }
    this.camera.aspect = width / height;
    const fov = 45;
    const cameraDist = (height / 2) / Math.tan((fov * Math.PI / 180) / 2);
    this.camera.position.set(0, 0, cameraDist);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  setModel(productId, type, options = {}) {
    if (this.currentId === productId && this.currentType === type && this.activeModel) return;

    if (this.activeModel) {
      this.scene.remove(this.activeModel);
      this.activeModel = null;
    }

    this.currentId = productId;
    this.currentType = type;

    if (type === 'ring') {
      this.activeModel = buildRingModel(productId, options);
    } else if (type === 'bracelet') {
      this.activeModel = buildBraceletModel(productId, options);
    } else if (type === 'necklace') {
      this.activeModel = buildNecklaceModel(productId, options);
    }

    if (this.activeModel) {
      this.scene.add(this.activeModel);
    }
  }

  /**
   * Updates 3D Model position, scale, and full 3D rotation matrix from Landmark data
   */
  updatePose3D(pose, type) {
    if (!this.activeModel || !pose) {
      if (this.activeModel) this.activeModel.visible = false;
      return;
    }
    this.activeModel.visible = true;

    // Convert pixel coordinates (0..width, 0..height) to Three.js centered camera space
    const targetX = pose.x - this.width / 2;
    const targetY = -(pose.y - this.height / 2);
    const targetZ = pose.z != null ? pose.z : 0;

    this.activeModel.position.set(targetX, targetY, targetZ);

    if (pose.quaternion) {
      // Direct full 3D orientation matrix computed from 3D hand/body landmarks
      this.activeModel.quaternion.copy(pose.quaternion);
    } else {
      // Fallback Euler rotation from 2D angle with slight natural tilt
      this.activeModel.rotation.set(0, 0, -(pose.angle || 0));
    }
  }

  render() {
    if (!this.renderer) return;
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.activeModel) {
      this.scene.remove(this.activeModel);
      this.activeModel = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
