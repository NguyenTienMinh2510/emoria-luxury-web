import * as THREE from 'three';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function ringPose(points, width, height, finger = 'ring') {
  if (!points || !Array.isArray(points) || points.length < 21) return null;
  
  // Finger joint indices: [mcp, pip]
  const fingerMap = {
    index: [5, 6],
    middle: [9, 10],
    ring: [13, 14],
    pinky: [17, 18]
  };
  const [mcpIdx, pipIdx] = fingerMap[finger] || fingerMap.ring;
  const mcp = points[mcpIdx];
  const pip = points[pipIdx];

  if (!mcp || !pip) return null;
  if (![mcp.x, mcp.y, pip.x, pip.y].every(Number.isFinite)) return null;
  if ([mcp, pip].some(p => p.x < 0.01 || p.x > 0.99 || p.y < 0.01 || p.y > 0.99)) return null;

  const dx = (pip.x - mcp.x) * width;
  const dy = (pip.y - mcp.y) * height;
  const dz = ((pip.z || 0) - (mcp.z || 0)) * width;
  const boneLen = Math.hypot(dx, dy);

  if (boneLen < width * 0.03 || boneLen > width * 0.45) return null;

  // Ring sits around 42% along the proximal phalanx from MCP towards PIP
  const ringX = (mcp.x + (pip.x - mcp.x) * 0.42) * width;
  const ringY = (mcp.y + (pip.y - mcp.y) * 0.42) * height;
  const ringZ = ((mcp.z || 0) + ((pip.z || 0) - (mcp.z || 0)) * 0.42) * width;
  const angle = Math.atan2(dy, dx);

  // 3D Quaternion Orientation
  let quaternion = null;
  try {
    const vBone = new THREE.Vector3(dx, -dy, -dz).normalize();
    const indexBase = points[5];
    const pinkyBase = points[17];
    if (indexBase && pinkyBase) {
      const kx = (pinkyBase.x - indexBase.x) * width;
      const ky = -(pinkyBase.y - indexBase.y) * height;
      const kz = -((pinkyBase.z || 0) - (indexBase.z || 0)) * width;
      const vKnuckle = new THREE.Vector3(kx, ky, kz).normalize();
      const vNorm = new THREE.Vector3().crossVectors(vKnuckle, vBone).normalize();
      if (vNorm.lengthSq() > 0.1) {
        const vTan = new THREE.Vector3().crossVectors(vBone, vNorm).normalize();
        const m = new THREE.Matrix4().makeBasis(vTan, vBone, vNorm);
        quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
      }
    }
  } catch {}

  return {
    x: ringX,
    y: ringY,
    z: ringZ,
    span: boneLen,
    angle,
    quaternion,
    type: 'ring'
  };
}

export function braceletPose(points, width, height) {
  if (!points || !Array.isArray(points) || points.length < 21) return null;

  const wrist = points[0];
  const indexBase = points[5];
  const pinkyBase = points[17];

  if (!wrist || !indexBase || !pinkyBase) return null;
  if (![wrist.x, wrist.y, indexBase.x, indexBase.y, pinkyBase.x, pinkyBase.y].every(Number.isFinite)) return null;
  if ([wrist, indexBase, pinkyBase].some(p => p.x < 0.01 || p.x > 0.99 || p.y < 0.01 || p.y > 0.99)) return null;

  // Vector across the palm knuckles
  const palmDx = (pinkyBase.x - indexBase.x) * width;
  const palmDy = (pinkyBase.y - indexBase.y) * height;
  const palmDz = ((pinkyBase.z || 0) - (indexBase.z || 0)) * width;
  const palmWidth = Math.hypot(palmDx, palmDy);

  if (palmWidth < width * 0.08 || palmWidth > width * 0.75) return null;

  // Arm axis: vector from palm center towards wrist
  const palmCenterX = (indexBase.x + pinkyBase.x) / 2;
  const palmCenterY = (indexBase.y + pinkyBase.y) / 2;
  const palmCenterZ = ((indexBase.z || 0) + (pinkyBase.z || 0)) / 2;
  const armDx = (wrist.x - palmCenterX) * width;
  const armDy = (wrist.y - palmCenterY) * height;
  const armDz = ((wrist.z || 0) - palmCenterZ) * width;
  const armAngle = Math.atan2(armDy, armDx);

  // Bracelet sits slightly below wrist crease
  const wristOffset = palmWidth * 0.15;
  const braceletX = (wrist.x * width) + Math.cos(armAngle) * wristOffset;
  const braceletY = (wrist.y * height) + Math.sin(armAngle) * wristOffset;
  const braceletZ = ((wrist.z || 0) * width);

  // 3D Quaternion Orientation for Bracelet
  let quaternion = null;
  try {
    const vArm = new THREE.Vector3(armDx, -armDy, -armDz).normalize();
    const vKnuckle = new THREE.Vector3(palmDx, -palmDy, -palmDz).normalize();
    const vNorm = new THREE.Vector3().crossVectors(vKnuckle, vArm).normalize();
    if (vNorm.lengthSq() > 0.1) {
      const vTan = new THREE.Vector3().crossVectors(vArm, vNorm).normalize();
      const m = new THREE.Matrix4().makeBasis(vTan, vArm, vNorm);
      quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
    }
  } catch {}

  return {
    x: braceletX,
    y: braceletY,
    z: braceletZ,
    span: palmWidth * 1.05,
    angle: armAngle + Math.PI / 2, // Perpendicular to arm
    quaternion,
    type: 'bracelet'
  };
}

export function smoothHandPose(previous, next, dt) {
  if (!next) return null;
  if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) > next.span * 0.8) {
    return { ...next };
  }
  const alpha = 1 - Math.exp(-clamp(dt, 0, 200) / 85);
  let quaternion = next.quaternion;
  if (previous.quaternion && next.quaternion) {
    quaternion = previous.quaternion.clone().slerp(next.quaternion, alpha);
  }
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
    z: (previous.z || 0) + ((next.z || 0) - (previous.z || 0)) * alpha,
    span: previous.span + (next.span - previous.span) * alpha,
    angle: previous.angle + (next.angle - previous.angle) * alpha,
    quaternion,
    type: next.type
  };
}

export function drawRing(ctx, pose, image, { size = 17, scale = 1, offset = 0, ringScale = 0.22 } = {}) {
  if (!pose) return;
  const span = pose.span;
  const ringWidth = span * clamp(ringScale, 0.15, 0.45) * clamp(scale, 0.65, 1.6);
  const ringHeight = ringWidth * 0.48;
  const sizeRatio = (size / 17); // Normalizes around 17mm standard ring size

  ctx.save();
  ctx.translate(pose.x, pose.y + span * clamp(offset, -0.3, 0.3));
  // Rotate perpendicular to finger axis
  ctx.rotate(pose.angle + Math.PI / 2);

  const finalWidth = ringWidth * sizeRatio;
  const finalHeight = ringHeight * sizeRatio;

  // Shadow for 3D realism
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;

  // Elegant procedural S925 Double-Band Ring (EMORIA Horizon Design)
  const grad = ctx.createLinearGradient(-finalWidth / 2, -finalHeight / 2, finalWidth / 2, finalHeight / 2);
  grad.addColorStop(0, '#71717a');
  grad.addColorStop(0.3, '#f4f4f5');
  grad.addColorStop(0.6, '#ffffff');
  grad.addColorStop(0.85, '#a1a1aa');
  grad.addColorStop(1, '#52525b');

  // Outer band
  ctx.beginPath();
  ctx.ellipse(0, 0, finalWidth / 2, finalHeight / 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(3, finalWidth * 0.14);
  ctx.stroke();

  // Inner rim reflection
  ctx.beginPath();
  ctx.ellipse(0, 0, finalWidth / 2 - 1.5, finalHeight / 2 - 1.5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Center sparkling diamond accent
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#e2e8f0';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, -finalHeight / 2, finalWidth * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawBracelet(ctx, pose, image, { size = 16, scale = 1, offset = 0, braceletScale = 0.35 } = {}) {
  if (!pose) return;
  const span = pose.span;
  const bWidth = span * clamp(braceletScale, 0.2, 0.6) * clamp(scale, 0.65, 1.6);
  const bHeight = bWidth * 0.55;
  const sizeRatio = size / 16; // Normalizes around 16cm wrist size

  ctx.save();
  ctx.translate(pose.x, pose.y + span * clamp(offset, -0.3, 0.3));
  ctx.rotate(pose.angle);

  const finalWidth = bWidth * sizeRatio;
  const finalHeight = bHeight * sizeRatio;

  // Shadow for realistic wrist wrap
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;

  // S925 Pulse Cuff Bracelet design with heartbeat accent
  const grad = ctx.createLinearGradient(-finalWidth / 2, 0, finalWidth / 2, 0);
  grad.addColorStop(0, '#52525b');
  grad.addColorStop(0.25, '#e4e4e7');
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(0.75, '#d4d4d8');
  grad.addColorStop(1, '#71717a');

  ctx.beginPath();
  ctx.ellipse(0, 0, finalWidth / 2, finalHeight / 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(4, finalWidth * 0.08);
  ctx.stroke();

  // Pulse heartbeat center emblem
  ctx.save();
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const pw = finalWidth * 0.25;
  ctx.moveTo(-pw, 0);
  ctx.lineTo(-pw * 0.4, 0);
  ctx.lineTo(-pw * 0.2, -finalHeight * 0.3);
  ctx.lineTo(0, finalHeight * 0.3);
  ctx.lineTo(pw * 0.2, -finalHeight * 0.2);
  ctx.lineTo(pw * 0.4, 0);
  ctx.lineTo(pw, 0);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
