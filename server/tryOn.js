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

export function tryOnConfig(id) {
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
  return null;
}

