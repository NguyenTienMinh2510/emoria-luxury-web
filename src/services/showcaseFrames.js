// A small request queue lets the current frame take priority over background preload.
export function loadShowcaseFrames({ count, getPath, getFallbackPath, onLoad, ImageClass = Image }) {
  const images = new Array(count);
  const ready = new Array(count).fill(false);
  const settled = new Array(count).fill(false);
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
      let fallback = false, finished = false;
      const done = success => {
        if (finished) return;
        finished = true;
        image.onload = image.onerror = null;
        running--;
        if (active) {
          ready[index] = success;
          settled[index] = true;
          onLoad(index, success);
          pump();
        }
      };
      const fail = () => {
        if (!active || finished) return;
        if (!fallback && getFallbackPath) {
          fallback = true;
          image.src = getFallbackPath(index);
        } else done(false);
      };
      image.onload = async () => {
        try {
          if (typeof image.decode === 'function') await image.decode();
          if (active && !finished) done(image.naturalWidth > 0);
        } catch { fail(); }
      };
      image.onerror = fail;
      image.src = getPath(index);
    }
  };
  return {
    images,
    ready,
    settled,
    request(index) {
      if (!active || index < 0 || index >= count || started.has(index)) return;
      const queued = pending.indexOf(index);
      if (queued >= 0) pending.splice(queued, 1);
      pending.unshift(index);
      pump();
    },
    preload(start = 0, end = count) {
      if (!active) return;
      for (let index = Math.max(0, start); index < Math.min(count, end); index++) {
        if (!started.has(index) && !pending.includes(index)) pending.push(index);
      }
      pump();
    },
    retry(index) {
      if (!active || !settled[index] || ready[index]) return;
      images[index]?.removeAttribute('src');
      settled[index] = false;
      started.delete(index);
      pending.unshift(index);
      pump();
    },
    dispose() {
      active = false;
      pending.length = 0;
      ready.fill(false);
      settled.fill(false);
      images.forEach(image => {
        image.onload = image.onerror = null;
        image.removeAttribute('src');
      });
    },
  };
}

export const SHOWCASE_FRAME_COUNT = 300;
let showcaseSequence;

// One decoded sequence per visit, shared by the entry screen and home page.
export function prepareShowcaseFrames() {
  if (showcaseSequence) return showcaseSequence;
  const listeners = new Set();
  let loadedCount = 0, settledCount = 0;
  let snapshot = { loadedCount: 0, ready: false, failed: false };
  const publish = () => {
    snapshot = { loadedCount, ready: loadedCount === SHOWCASE_FRAME_COUNT,
      failed: settledCount === SHOWCASE_FRAME_COUNT && loadedCount < SHOWCASE_FRAME_COUNT };
    listeners.forEach(listener => listener());
  };
  const mobile = window.innerWidth < 768;
  const loader = loadShowcaseFrames({
    count: SHOWCASE_FRAME_COUNT,
    getPath: index => `/assets/animation-optimized/frame-${String(index).padStart(3, '0')}${mobile ? '-640' : ''}.webp?v=3`,
    getFallbackPath: index => `/assets/animation/ezgif-frame-${String(index + 1).padStart(3, '0')}.jpg?v=2`,
    onLoad: (index, loaded) => {
      settledCount++;
      if (loaded) loadedCount++;
      publish();
    },
  });
  showcaseSequence = {
    loader,
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    retry() {
      if (!snapshot.failed) return;
      const failed = loader.settled.flatMap((settled, index) => settled && !loader.ready[index] ? [index] : []);
      settledCount -= failed.length;
      publish();
      failed.forEach(index => loader.retry(index));
    },
  };
  loader.preload();
  return showcaseSequence;
}
