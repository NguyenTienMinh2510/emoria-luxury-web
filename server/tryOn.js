// Curated same-origin assets only. Camera frames never enter the API.
const RINGS = {
  'emoria-horizon': '/assets/product_horizon.png',
  'emoria-horizon-duo': '/assets/product_horizon.png',
  'emoria-halo': '/assets/product_halo.png',
  'emoria-halo-duo': '/assets/product_halo.png',
  'emoria-echo': '/assets/catalog/emoria-echo.png'
};

const BRACELETS = {
  'emoria-pulse': '/assets/product_pulse.png',
  'emoria-pulse-duo': '/assets/product_pulse.png',
  'emoria-celestial-duo': '/assets/summer_box.png',
  'emoria-orbit': '/assets/catalog/emoria-orbit.png',
  'emoria-orbit-duo': '/assets/catalog/emoria-orbit.png'
};

const NECKLACES = {
  'emoria-lumen': '/ar/lumen.svg',
  'emoria-lumen-duo': '/ar/lumen.svg',
  'emoria-faith': '/assets/catalog/emoria-faith.png',
  'emoria-sen': '/assets/catalog/emoria-sen.png'
};

export function tryOnConfig(id, product = null) {
  if (!/^[a-z0-9-]{1,80}$/.test(id || '')) return null;

  // 1. Explicit AR configuration from product details (e.g. added via Admin Panel)
  if (product?.details?.ar) {
    const ar = product.details.ar;
    if (ar.enabled === false) return null;
    if (ar.type === 'necklace') {
      return {
        version: 1,
        productId: id,
        type: 'necklace',
        pendant: ar.asset || product.image_url || '/ar/lumen.svg',
        modelUrl: ar.modelUrl || null,
        previewLengths: ar.previewLengths || [40, 45, 50],
        defaultLength: ar.defaultLength || 45,
        pendantScale: ar.scale || 0.09
      };
    }
    if (ar.type === 'ring') {
      return {
        version: 1,
        productId: id,
        type: 'ring',
        asset: ar.asset || product.image_url || '/assets/product_horizon.png',
        modelUrl: ar.modelUrl || null,
        previewSizes: ar.previewSizes || [16, 17, 18, 19],
        defaultSize: ar.defaultSize || 17,
        scale: ar.scale || 0.22,
        finger: ar.finger || 'ring'
      };
    }
    if (ar.type === 'bracelet') {
      return {
        version: 1,
        productId: id,
        type: 'bracelet',
        asset: ar.asset || product.image_url || '/assets/product_pulse.png',
        modelUrl: ar.modelUrl || null,
        previewSizes: ar.previewSizes || [15, 16, 17, 18],
        defaultSize: ar.defaultSize || 16,
        scale: ar.scale || 0.35
      };
    }
  }

  // 2. Known curated product IDs
  if (id === 'emoria-solaris-keyring') {
    return {
      version: 1,
      productId: id,
      type: 'ring',
      asset: '/assets/product_halo.png',
      previewSizes: [16, 17, 18, 19],
      defaultSize: 18,
      scale: 0.25,
      finger: 'index'
    };
  }
  if (NECKLACES[id]) {
    return {
      version: 1, productId: id, type: 'necklace', pendant: NECKLACES[id],
      previewLengths: [40, 45, 50], defaultLength: 45, pendantScale: 0.09
    };
  }
  if (RINGS[id]) {
    return {
      version: 1, productId: id, type: 'ring', asset: RINGS[id],
      previewSizes: [16, 17, 18, 19], defaultSize: 17, scale: 0.22,
      finger: 'ring'
    };
  }
  if (BRACELETS[id]) {
    return {
      version: 1, productId: id, type: 'bracelet', asset: BRACELETS[id],
      previewSizes: [15, 16, 17, 18], defaultSize: 16, scale: 0.35
    };
  }

  // 3. Dynamic Category or Name-based derivation for newly created products
  const category = product?.details?.category || product?.category;
  const name = (product?.name || '').toLowerCase();

  if (category === 'Nhẫn' || name.includes('nhẫn') || name.includes('ring')) {
    return {
      version: 1, productId: id, type: 'ring',
      asset: product?.image_url || '/assets/product_horizon.png',
      previewSizes: [16, 17, 18, 19], defaultSize: 17, scale: 0.22, finger: 'ring'
    };
  }
  if (category === 'Vòng tay' || name.includes('vòng') || name.includes('lắc') || name.includes('bracelet')) {
    return {
      version: 1, productId: id, type: 'bracelet',
      asset: product?.image_url || '/assets/product_pulse.png',
      previewSizes: [15, 16, 17, 18], defaultSize: 16, scale: 0.35
    };
  }
  if (category === 'Dây chuyền' || name.includes('dây chuyền') || name.includes('necklace') || name.includes('pendant')) {
    return {
      version: 1, productId: id, type: 'necklace',
      pendant: product?.image_url || '/ar/lumen.svg',
      previewLengths: [40, 45, 50], defaultLength: 45, pendantScale: 0.09
    };
  }

  // 4. Default fallback for any remaining jewelry/accessory to guarantee 100% AR availability
  return {
    version: 1,
    productId: id,
    type: 'necklace',
    pendant: product?.image_url || '/ar/lumen.svg',
    previewLengths: [40, 45, 50],
    defaultLength: 45,
    pendantScale: 0.09
  };
}


