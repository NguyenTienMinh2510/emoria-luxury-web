// A small request queue lets the current frame take priority over background preload.
export function loadShowcaseFrames({ count, getPath, getFallbackPath, onLoad, ImageClass = Image, timeoutMs=8000, maxCached=count }) {
  const images = new Array(count);
  const ready = new Array(count).fill(false);
  const settled = new Array(count).fill(false);
  const pending = [];
  const started = new Set();
  const cancellations = new Map();
  let active = true, running = 0, focus = 0;
  const trim = () => {
    const cached=ready.flatMap((value,index)=>value?[index]:[]);
    cached.sort((a,b)=>Math.abs(b-focus)-Math.abs(a-focus));
    for(const index of cached.slice(0,Math.max(0,cached.length-maxCached))){
      images[index]?.removeAttribute('src');images[index]=undefined;
      ready[index]=false;settled[index]=false;started.delete(index);
    }
  };
  const pump = () => {
    while (active && running < 3 && pending.length) {
      const index = pending.shift();
      if (started.has(index)) continue;
      started.add(index);
      running++;
      const image = new ImageClass();
      images[index] = image;
      image.decoding = 'async';
      let fallback = false, finished = false, timer, attempt=0;
      const done = success => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);cancellations.delete(index);
        image.onload = image.onerror = null;
        running--;
        if (active) {
          ready[index] = success;
          settled[index] = true;
          trim();
          onLoad(index, success);
          pump();
        }
      };
      const fail = () => {
        if (!active || finished) return;
        if (!fallback && getFallbackPath) {
          fallback = true;
          start(getFallbackPath(index));
        } else done(false);
      };
      const start = path => {
      const currentAttempt=++attempt;
      clearTimeout(timer);
      timer=setTimeout(fail,timeoutMs);timer?.unref?.();
      image.onload = async () => {
        try {
          if (typeof image.decode === 'function') await image.decode();
          if (active && !finished && currentAttempt===attempt) done(image.naturalWidth > 0);
        } catch { if(currentAttempt===attempt)fail(); }
      };
      image.onerror = () => {if(currentAttempt===attempt)fail();};
      image.src = path;
      };
      cancellations.set(index,()=>{finished=true;clearTimeout(timer);image.onload=image.onerror=null;image.removeAttribute('src');running--;cancellations.delete(index);});
      start(getPath(index));
    }
  };
  return {
    images,
    ready,
    settled,
    maxCached,
    request(index) {
      if (!active || index < 0 || index >= count) return;
      focus=index;
      if(started.has(index))return;
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
      if (!active || index<0 || index>=count || ready[index]) return;
      cancellations.get(index)?.();
      images[index]?.removeAttribute('src');
      settled[index] = false;
      started.delete(index);
      pending.unshift(index);
      pump();
    },
    dispose() {
      active = false;
      for(const cancel of [...cancellations.values()])cancel();
      pending.length = 0;
      ready.fill(false);
      settled.fill(false);
      images.forEach(image => {if(!image)return;
        image.onload = image.onerror = null;
        image.removeAttribute('src');
      });
    },
  };
}

export const SHOWCASE_FRAME_COUNT = 150;
export const SHOWCASE_DURATION_MS = 299 / 72 * 1000;

export function getShowcasePreloadCount(loadedCount, elapsedMs) {
  // Reserve 30% of measured throughput and 12 frames for network/decode variation.
  const rate = loadedCount * 1000 / Math.max(1, elapsedMs) * 0.7;
  return Math.min(SHOWCASE_FRAME_COUNT, Math.max(30,
    Math.ceil(SHOWCASE_FRAME_COUNT - rate * SHOWCASE_DURATION_MS / 1000 + 12)));
}
let showcaseSequence;

// One decoded sequence per visit, shared by the entry screen and home page.
export function prepareShowcaseFrames({entryTimeoutMs=12000,imageTimeoutMs=8000}={}) {
  if (showcaseSequence) return showcaseSequence;
  const listeners = new Set();
  let loadedCount = 0, bufferedCount = 0, ready = false, bypassed=false, deadline, idleTimer;
  const everLoaded=new Set();
  const startedAt = performance.now();
  let snapshot = { loadedCount: 0, bufferedCount: 0, preloadCount: SHOWCASE_FRAME_COUNT, ready: false, failed: false };
  const publish = () => {
    while (loader.ready[bufferedCount]) bufferedCount++;
    const preloadCount = Math.min(loader.maxCached,getShowcasePreloadCount(bufferedCount, performance.now() - startedAt));
    ready ||= bufferedCount >= preloadCount || bypassed;
    if(ready)clearTimeout(deadline);
    snapshot = { loadedCount, bufferedCount, preloadCount, ready,
      bypassed,failed: !ready && loader.settled.slice(0,preloadCount).some((settled,index)=>settled&&!loader.ready[index]) };
    listeners.forEach(listener => listener());
  };
  const mobile = window.innerWidth < 768;
  const loader = loadShowcaseFrames({
    count: SHOWCASE_FRAME_COUNT,
    maxCached:mobile?48:60,timeoutMs:imageTimeoutMs,
    getPath: index => `/assets/animation-optimized/frame-${String(Math.round(index * 299 / (SHOWCASE_FRAME_COUNT - 1))).padStart(3, '0')}${mobile ? '-640' : ''}.webp?v=3`,
    // A second optimized size avoids decoding 1080p originals after delivery failures.
    getFallbackPath: index => `/assets/animation-optimized/frame-${String(Math.round(index * 299 / (SHOWCASE_FRAME_COUNT - 1))).padStart(3, '0')}${mobile ? '' : '-640'}.webp?v=3`,
    onLoad: (index, loaded) => {
      if (loaded && !everLoaded.has(index)){everLoaded.add(index);loadedCount++;}
      publish();
    },
  });
  showcaseSequence = {
    loader,
    getSnapshot: () => snapshot,
    subscribe: listener => {
      clearTimeout(idleTimer);listeners.add(listener);
      return () => {listeners.delete(listener);if(!listeners.size){idleTimer=setTimeout(()=>{loader.dispose();clearTimeout(deadline);showcaseSequence=undefined;},30000);idleTimer?.unref?.();}};
    },
    bypass() {bypassed=true;publish();},
    retry() {
      const failed=Array.from({length:Math.min(30,loader.maxCached)},(_,index)=>index).filter(index=>!loader.ready[index]);
      failed.forEach(index => loader.retry(index));
      publish();
    },
    dispose(){clearTimeout(deadline);clearTimeout(idleTimer);loader.dispose();listeners.clear();if(showcaseSequence?.loader===loader)showcaseSequence=undefined;},
  };
  deadline=setTimeout(()=>{bypassed=true;publish();},entryTimeoutMs);deadline?.unref?.();
  loader.preload(0,loader.maxCached);
  return showcaseSequence;
}
