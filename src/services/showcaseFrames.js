// A small request queue lets the current frame take priority over background preload.
export function loadShowcaseFrames({ count, getPath, getFallbackPath, onLoad, ImageClass = Image }) {
  const images = new Array(count);
  const pending = [];
  const started = new Set();
  let active = true, running = 0;
  const pump = () => {
    while (active && running < 3 && pending.length) {
      const index = pending.shift();
      if (started.has(index)) continue;
      started.add(index);
      running++;
      const image = new ImageClass();
      images[index] = image;
      image.decoding = 'async';
      let fallback = false;
      const done = () => {
        image.onload = image.onerror = null;
        running--;
        if (active) {
          onLoad(index, image.naturalWidth > 0);
          pump();
        }
      };
      image.onload = done;
      image.onerror = () => {
        if (!fallback && getFallbackPath) {
          fallback = true;
          image.src = getFallbackPath(index);
        } else done();
      };
      image.src = getPath(index);
    }
  };
  return {
    images,
    request(index) {
      if (!active || index < 0 || index >= count || started.has(index)) return;
      const queued = pending.indexOf(index);
      if (queued >= 0) pending.splice(queued, 1);
      pending.unshift(index);
      pump();
    },
    preload() {
      if (!active) return;
      for (let index = 0; index < count; index++) {
        if (!started.has(index) && !pending.includes(index)) pending.push(index);
      }
      pump();
    },
    dispose() {
      active = false;
      pending.length = 0;
      images.forEach(image => {
        image.onload = image.onerror = null;
        image.removeAttribute('src');
      });
    },
  };
}
