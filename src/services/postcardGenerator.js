import QRCode from 'qrcode';

/**
 * EMORIA LUXURY - POSTCARD & SOCIAL SHARE CARD GENERATOR (Chặng D)
 * Generates ultra-high quality, social-ready graphics (1080x1080 & 1080x1920)
 * with Vietnamese typography, couples' names, romance captions, and verified QR codes.
 */

export const POSTCARD_FORMATS = {
  square: { width: 1080, height: 1080, label: 'Vuông (1:1 - Instagram / Facebook Post)' },
  story: { width: 1080, height: 1920, label: 'Dọc (9:16 - Instagram / Facebook Story / TikTok)' }
};

export const POSTCARD_TEMPLATES = {
  panorama: {
    id: 'panorama',
    name: 'Góc Nhà Toàn Cảnh',
    description: 'Khắc họa không gian ngôi nhà 3D cùng lời tựa tình yêu'
  },
  polaroid: {
    id: 'polaroid',
    name: 'Khung Kỷ Niệm Polaroid',
    description: 'Nổi bật bức ảnh kỷ niệm gắn liền với căn phòng thân thương'
  }
};

/**
 * Load an image safely with anonymous CORS and fallback handling
 */
function loadImageSafe(src) {
  return new Promise((resolve) => {
    if (!src || typeof src !== 'string') {
      return resolve(null);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // In case CORS fails or network error, resolve null gracefully
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Helper to wrap text into multiple lines on HTML5 Canvas
 */
function wrapCanvasText(ctx, text, maxWidth, maxLines = 4) {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
      if (lines.length === maxLines - 1) {
        break;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine && lines.length < maxLines) {
    // If there were remaining words beyond maxLines, add ellipsis
    const remainingWordsCount = words.length - (lines.join(' ').split(/\s+/).length + currentLine.split(/\s+/).length);
    if (remainingWordsCount > 0) {
      currentLine += '...';
    }
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Draw an elegant Emoria brand emblem / crest
 */
function drawEmoriaEmblem(ctx, x, y, scale = 1, color = '#d4af37') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  // Diamond crown / luxury heart flourish
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(14, -4);
  ctx.lineTo(0, 16);
  ctx.lineTo(-14, -4);
  ctx.closePath();
  ctx.stroke();

  // Subtle inner diamond
  ctx.beginPath();
  ctx.arc(0, -2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Horizontal delicate accents
  ctx.beginPath();
  ctx.moveTo(-28, -4);
  ctx.lineTo(-17, -4);
  ctx.moveTo(17, -4);
  ctx.lineTo(28, -4);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw decorative corner filigree
 */
function drawCornerFlourish(ctx, x, y, size = 30, rotation = 0, color = '#d4af37') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, 0);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, size);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(size * 0.45, size * 0.45, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

/**
 * Validate URL to prevent leaking tokens or private storage paths into public QR
 */
export function validatePublicShareUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  // Must be http or https
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return null;
  // Must NOT contain internal private tokens or secret keys
  if (clean.includes('token=') || clean.includes('service_role') || clean.includes('sbp_')) return null;
  // Must NOT be a direct authenticated Supabase Storage object URL
  if (clean.includes('/storage/v1/object/authenticated/')) return null;
  return clean;
}

/**
 * Main Postcard Canvas Generation
 */
export async function renderPostcardCanvas({
  template = 'polaroid',
  aspectRatio = 'square',
  themeMode = 'dark',
  houseTitle = 'Tổ Ấm Yêu Thương',
  coupleNames = 'Minh & Thảo',
  roomName = 'Phòng 1: Buổi Hẹn Đầu',
  caption = '',
  date = '',
  photoUrl = '',
  houseCaptureDataUrl = '',
  publicUrl = null,
  isPublished = false,
  canvasElement = null
}) {
  const spec = POSTCARD_FORMATS[aspectRatio] || POSTCARD_FORMATS.square;
  const width = spec.width;
  const height = spec.height;

  const canvas = canvasElement || document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Theme palettes
  const isDark = themeMode === 'dark';
  const palette = isDark
    ? {
        bg: '#0c0a09',
        bgGradientTop: '#17120e',
        bgGradientBottom: '#070605',
        cardBg: '#181412',
        cardBorder: 'rgba(212, 175, 55, 0.35)',
        gold: '#d4af37',
        goldLight: '#f6e05e',
        textPrimary: '#ffffff',
        textSecondary: '#d6d3d1',
        textMuted: '#a8a29e',
        polaroidBg: '#fbfaf8',
        polaroidText: '#1c1917'
      }
    : {
        bg: '#faf6f0',
        bgGradientTop: '#ffffff',
        bgGradientBottom: '#f3ece2',
        cardBg: '#ffffff',
        cardBorder: 'rgba(180, 140, 60, 0.3)',
        gold: '#b8860b',
        goldLight: '#d4af37',
        textPrimary: '#1c1917',
        textSecondary: '#44403c',
        textMuted: '#78716c',
        polaroidBg: '#ffffff',
        polaroidText: '#1c1917'
      };

  // 1. Draw Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, palette.bgGradientTop);
  bgGrad.addColorStop(1, palette.bgGradientBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle radial glow at center top
  const radialGlow = ctx.createRadialGradient(width / 2, height * 0.25, 0, width / 2, height * 0.25, width * 0.7);
  radialGlow.addColorStop(0, isDark ? 'rgba(212, 175, 55, 0.08)' : 'rgba(212, 175, 55, 0.12)');
  radialGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Decorative Outer Border
  const margin = 50;
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

  // Inner thin border
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  ctx.strokeRect(margin + 8, margin + 8, width - (margin + 8) * 2, height - (margin + 8) * 2);

  // 4 Corner Flourishes
  const fSize = 28;
  drawCornerFlourish(ctx, margin + 18, margin + 18, fSize, 0, palette.gold);
  drawCornerFlourish(ctx, width - margin - 18, margin + 18, fSize, Math.PI / 2, palette.gold);
  drawCornerFlourish(ctx, width - margin - 18, height - margin - 18, fSize, Math.PI, palette.gold);
  drawCornerFlourish(ctx, margin + 18, height - margin - 18, fSize, -Math.PI / 2, palette.gold);

  // 3. Header: Brand & Couple Names
  const headerY = margin + 55;
  drawEmoriaEmblem(ctx, width / 2, headerY, 1.1, palette.gold);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.gold;
  ctx.font = '600 16px "Inter", sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText('E M O R I A   L U X U R Y', width / 2, headerY + 36);
  ctx.letterSpacing = '0px';

  // Couple names / House Title
  ctx.fillStyle = palette.textPrimary;
  ctx.font = 'bold 36px "Playfair Display", "Cormorant Garamond", Georgia, serif';
  ctx.fillText(coupleNames || houseTitle || 'Kỷ Niệm Tình Yêu', width / 2, headerY + 80);

  // Room Name subtitle
  ctx.fillStyle = palette.goldLight;
  ctx.font = 'italic 18px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(`“${roomName || houseTitle}”`, width / 2, headerY + 115);

  // 4. Central Visual Frame
  const isStory = aspectRatio === 'story';
  const frameY = headerY + 145;
  const frameWidth = width - margin * 2 - 120;
  // Frame height adapts to story vs square
  const frameHeight = isStory ? height * 0.52 : height * 0.44;
  const frameX = (width - frameWidth) / 2;

  // Decide image source based on template
  const activeImageSrc = template === 'panorama' ? (houseCaptureDataUrl || photoUrl) : (photoUrl || houseCaptureDataUrl);
  const loadedImage = await loadImageSafe(activeImageSrc);

  if (template === 'polaroid') {
    // Polaroid Style Card inside the central frame
    const pMargin = 20;
    const polaroidWidth = frameWidth;
    const polaroidHeight = frameHeight;
    const polaroidX = frameX;
    const polaroidY = frameY;

    // Drop shadow for Polaroid
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.fillStyle = palette.polaroidBg;
    ctx.beginPath();
    ctx.roundRect(polaroidX, polaroidY, polaroidWidth, polaroidHeight, 18);
    ctx.fill();
    ctx.restore();

    // Image Area inside Polaroid
    const photoPadding = 24;
    const photoBottomArea = 70; // area for handwritten date & caption
    const photoW = polaroidWidth - photoPadding * 2;
    const photoH = polaroidHeight - photoPadding - photoBottomArea;
    const photoX = polaroidX + photoPadding;
    const photoY = polaroidY + photoPadding;

    if (loadedImage) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(photoX, photoY, photoW, photoH, 10);
      ctx.clip();

      // Cover-fit image calculation
      const imgAspect = loadedImage.width / loadedImage.height;
      const slotAspect = photoW / photoH;
      let drawW, drawH, drawX, drawY;

      if (imgAspect > slotAspect) {
        drawH = photoH;
        drawW = photoH * imgAspect;
        drawX = photoX - (drawW - photoW) / 2;
        drawY = photoY;
      } else {
        drawW = photoW;
        drawH = photoW / imgAspect;
        drawX = photoX;
        drawY = photoY - (drawH - photoH) / 2;
      }

      ctx.drawImage(loadedImage, drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      // Elegant empty placeholder with romantic quote
      ctx.fillStyle = '#f3ede2';
      ctx.beginPath();
      ctx.roundRect(photoX, photoY, photoW, photoH, 10);
      ctx.fill();

      ctx.fillStyle = '#8c7d6b';
      ctx.font = 'italic 20px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('“Nơi thời gian dừng lại cùng những dấu yêu”', photoX + photoW / 2, photoY + photoH / 2);
    }

    // Polaroid Bottom Title / Date
    ctx.fillStyle = palette.polaroidText;
    ctx.font = '600 16px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(roomName || 'Kỷ Niệm Thân Thương', photoX + 6, photoY + photoH + photoBottomArea / 2);

    if (date) {
      ctx.textAlign = 'right';
      ctx.font = 'italic 15px "Inter", sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(date, photoX + photoW - 6, photoY + photoH + photoBottomArea / 2);
    }
  } else {
    // Panorama / Architectural 3D Frame
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 35;
    ctx.shadowOffsetY = 15;

    // Outer architectural frame
    ctx.fillStyle = isDark ? '#14110f' : '#ffffff';
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameWidth, frameHeight, 16);
    ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = palette.gold;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const padding = 12;
    const photoX = frameX + padding;
    const photoY = frameY + padding;
    const photoW = frameWidth - padding * 2;
    const photoH = frameHeight - padding * 2;

    if (loadedImage) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(photoX, photoY, photoW, photoH, 10);
      ctx.clip();

      const imgAspect = loadedImage.width / loadedImage.height;
      const slotAspect = photoW / photoH;
      let drawW, drawH, drawX, drawY;

      if (imgAspect > slotAspect) {
        drawH = photoH;
        drawW = photoH * imgAspect;
        drawX = photoX - (drawW - photoW) / 2;
        drawY = photoY;
      } else {
        drawW = photoW;
        drawH = photoW / imgAspect;
        drawX = photoX;
        drawY = photoY - (drawH - photoH) / 2;
      }

      ctx.drawImage(loadedImage, drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = isDark ? '#1a1614' : '#f7f4ee';
      ctx.beginPath();
      ctx.roundRect(photoX, photoY, photoW, photoH, 10);
      ctx.fill();

      ctx.fillStyle = palette.gold;
      ctx.font = 'italic 20px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('“Mỗi góc nhà là một câu chuyện tình yêu”', photoX + photoW / 2, photoY + photoH / 2);
    }
  }

  // 5. Romantic Caption
  const captionY = frameY + frameHeight + (isStory ? 45 : 30);
  const maxCaptionWidth = width - margin * 2 - 140;
  const quoteText = caption?.trim() || '“Chúng ta không nhớ những ngày tháng, chúng ta nhớ những khoảnh khắc.”';

  ctx.fillStyle = palette.textSecondary;
  ctx.font = 'italic 20px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const captionLines = wrapCanvasText(ctx, quoteText, maxCaptionWidth, 3);
  captionLines.forEach((line, idx) => {
    ctx.fillText(line, width / 2, captionY + idx * 30);
  });

  // 6. Bottom Section: QR Code & Invitation Link
  const bottomY = isStory ? height - margin - 150 : height - margin - 130;
  const cleanPublicUrl = isPublished ? validatePublicShareUrl(publicUrl) : null;

  if (cleanPublicUrl) {
    // Generate standard ISO/IEC 18004 QR Code
    try {
      const qrDataUrl = await QRCode.toDataURL(cleanPublicUrl, {
        width: 130,
        margin: 1,
        color: {
          dark: isDark ? '#ffffff' : '#1c1917',
          light: '#00000000' // transparent background
        }
      });
      const qrImg = await loadImageSafe(qrDataUrl);
      if (qrImg) {
        const qrSize = 95;
        const qrX = width / 2 - qrSize / 2;
        const qrY = bottomY - 10;

        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        ctx.fillStyle = palette.gold;
        ctx.font = '600 13px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.letterSpacing = '1px';
        ctx.fillText('QUÉT ĐỂ GHÉ THĂM NGÔI NHÀ', width / 2, qrY + qrSize + 8);
        ctx.letterSpacing = '0px';
      }
    } catch {
      // Fallback text if QR fails to render
      ctx.fillStyle = palette.gold;
      ctx.font = 'italic 14px "Cormorant Garamond", serif';
      ctx.textAlign = 'center';
      ctx.fillText('emoria.vn/kỷ-niệm', width / 2, bottomY + 30);
    }
  } else {
    // Draft or Private Mode: Elegant Seal watermark instead of a fake link
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(212, 175, 55, 0.4)' : 'rgba(180, 140, 60, 0.5)';
    ctx.font = 'italic 16px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ Bản Lưu Niệm Riêng Tư — EMORIA LUXURY ✦', width / 2, bottomY + 25);
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillStyle = palette.textMuted;
    ctx.fillText('Xuất bản ngôi nhà để mở mã QR chia sẻ cho bạn bè', width / 2, bottomY + 48);
    ctx.restore();
  }

  return canvas;
}

/**
 * Export canvas to PNG Blob
 */
export function exportPostcardBlob(canvas, quality = 0.95) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      'image/png',
      quality
    );
  });
}

/**
 * Direct file download trigger in browser
 */
export function downloadPostcardFile(canvas, filename = 'emoria-postcard.png') {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png', 0.95);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Modern Web Share API with intelligent fallback
 */
export async function sharePostcard({
  canvas,
  title = 'Ngôi Nhà Kỷ Niệm - EMORIA',
  text = 'Ghé thăm ngôi nhà kỷ niệm của chúng mình tại EMORIA nhé!',
  url = ''
}) {
  const filename = `emoria-postcard-${Date.now()}.png`;

  // 1. Try Web Share API with File payload
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const blob = await exportPostcardBlob(canvas);
      if (blob) {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title,
            text,
            url: url || undefined
          });
          return { success: true, method: 'web-share-file' };
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled the share dialog naturally
        return { success: false, cancelled: true };
      }
      // Fall through to fallback
    }
  }

  // 2. Try Web Share API with URL only
  if (typeof navigator !== 'undefined' && navigator.share && url) {
    try {
      await navigator.share({ title, text, url });
      return { success: true, method: 'web-share-url' };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
    }
  }

  // 3. Fallback: Automatically download image and copy link to clipboard
  downloadPostcardFile(canvas, filename);

  let copied = false;
  if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }
  }

  return {
    success: true,
    method: 'download-and-copy',
    copied
  };
}
