export const MOVIE_LIMITS = { files: 12, seconds: 180, inputBytes: 200 * 1024 * 1024, outputBytes: 50 * 1024 * 1024 };
export function validateMovie(clips) {
  if (!clips.length || clips.length > MOVIE_LIMITS.files) throw new Error('Chọn từ 1 đến 12 ảnh hoặc clip.');
  const duration = clips.reduce((sum, clip) => {
    const length = clip.kind === 'image' ? Number(clip.seconds) : Number(clip.end) - Number(clip.start);
    if (!Number.isFinite(length) || length < 1 || (clip.kind === 'video' && (clip.start < 0 || clip.end > clip.duration + .1))) throw new Error('Mỗi cảnh cần ít nhất 1 giây và nằm trong độ dài clip gốc.');
    return sum + length;
  }, 0);
  if (duration > MOVIE_LIMITS.seconds) throw new Error('Video ghép tối đa 3 phút. Hãy rút ngắn hoặc bớt cảnh.');
  if (clips.reduce((sum, c) => sum + c.file.size, 0) > MOVIE_LIMITS.inputBytes) throw new Error('Tổng tệp nguồn tối đa 200 MB.');
  return duration;
}

function waitMedia(element, event, signal) {
  return new Promise((resolve, reject) => {
    const done = (error) => { clearTimeout(timer); element.removeEventListener(event, ready); element.removeEventListener('error', fail); signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(); };
    const ready = () => done(), fail = () => done(new Error('Không đọc được tệp. Hãy thử định dạng khác.')), cancel = () => done(new DOMException('Đã hủy', 'AbortError'));
    const timer = setTimeout(fail, 15000);
    element.addEventListener(event, ready, { once: true }); element.addEventListener('error', fail, { once: true }); signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

export async function inspectMovieFile(file) {
  const kind = file.type.startsWith('image/') ? 'image' : 'video';
  if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type) || file.size > MOVIE_LIMITS.outputBytes) throw new Error('Chọn JPG/PNG/WebP hoặc MP4/WebM, tối đa 50 MB mỗi tệp.');
  const url = URL.createObjectURL(file);
  const element = document.createElement(kind === 'image' ? 'img' : 'video');
  try {
    const ready = waitMedia(element, kind === 'image' ? 'load' : 'loadedmetadata'); element.src = url; await ready;
    if (kind === 'video' && (!Number.isFinite(element.duration) || element.duration < 1)) throw new Error('Không đọc được thời lượng clip. Hãy dùng MP4 có thời lượng hợp lệ.');
    return { id: crypto.randomUUID(), file, url, kind, seconds: 4, start: 0, end: Math.min(element.duration || 4, 15), duration: element.duration || 4, caption: '' };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { if (kind === 'video') { element.removeAttribute('src'); element.load(); } }
}

// Native browser export: real-time rendering, bounded to 720p and three minutes.
export async function renderMemoryMovie(clips, { music, keepClipAudio = false, signal, onProgress = () => {} } = {}) {
  const duration = validateMovie(clips);
  const mime = ['video/mp4;codecs=avc1.424028,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => globalThis.MediaRecorder?.isTypeSupported(type));
  if (!mime || !HTMLCanvasElement.prototype.captureStream) throw new Error('Trình duyệt chưa hỗ trợ ghép video. Hãy dùng Chrome/Edge trên máy tính hoặc tải video đã dựng.');
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d'), stream = canvas.captureStream(24);
  const audio = new (window.AudioContext || window.webkitAudioContext)();
  const destination = audio.createMediaStreamDestination();
  // Keep the audio clock running even for a silent slideshow.
  const clock = audio.createOscillator(), silence = audio.createGain(); silence.gain.value = 0; clock.connect(silence).connect(destination); clock.start();
  stream.addTrack(destination.stream.getAudioTracks()[0]);
  const musicElement = new Audio(); let musicUrl, recorder, size = 0, renderError, completed = 0;
  const media = [], chunks = [];
  try {
    await audio.resume();
    if (music) {
      musicUrl = URL.createObjectURL(music); const ready = waitMedia(musicElement, 'canplay', signal); musicElement.src = musicUrl; musicElement.loop = true; await ready;
      const source = audio.createMediaElementSource(musicElement); const gain = audio.createGain(); gain.gain.value = keepClipAudio ? .3 : .8; source.connect(gain).connect(destination);
    }
    for (const clip of clips) {
      signal?.throwIfAborted();
      const element = document.createElement(clip.kind === 'image' ? 'img' : 'video');
      const ready = waitMedia(element, clip.kind === 'image' ? 'load' : 'loadeddata', signal);
      if (clip.kind === 'video') { element.playsInline = true; element.preload = 'auto'; }
      media.push(element); element.src = clip.url; await ready;
      if (clip.kind === 'video') {
        const source = audio.createMediaElementSource(element), gain = audio.createGain(); gain.gain.value = keepClipAudio ? 1 : 0; source.connect(gain).connect(destination);
        if (clip.start > 0) { const seeked = waitMedia(element, 'seeked', signal); element.currentTime = clip.start; await seeked; }
      }
    }
    const first = media[0], firstWidth = first.videoWidth || first.naturalWidth, firstHeight = first.videoHeight || first.naturalHeight;
    const firstScale = Math.min(1280 / firstWidth, 720 / firstHeight);
    ctx.fillStyle='#030712';ctx.fillRect(0,0,1280,720);ctx.drawImage(first,(1280-firstWidth*firstScale)/2,(720-firstHeight*firstScale)/2,firstWidth*firstScale,firstHeight*firstScale);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    signal?.throwIfAborted();
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1800000, audioBitsPerSecond: 128000 });
    recorder.ondataavailable = ({data}) => { size += data.size; chunks.push(data); if (size > MOVIE_LIMITS.outputBytes) renderError = new Error('Video vượt 50 MB. Hãy rút ngắn rồi xuất lại.'); };
    recorder.onerror = () => { renderError = new Error('Không xuất được video. Hãy thử lại hoặc tải bản đã dựng.'); };
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start(500);
    if (music) await musicElement.play();
    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index], element = media[index], length = clip.kind === 'image' ? clip.seconds : clip.end - clip.start;
      if (clip.kind === 'video') await element.play();
      await new Promise((resolve, reject) => {
        const started = performance.now(); let lastTime = started, lastPosition = -1;
        const frame = () => {
          try {
            signal?.throwIfAborted();
            if (renderError) throw renderError;
            if (document.hidden) throw new Error('Đã dừng xuất khi rời tab. Giữ tab này mở và xuất lại để video không bị mất cảnh.');
            const elapsed = clip.kind === 'image' ? (performance.now() - started) / 1000 : Math.max(0, element.currentTime - clip.start);
            if (elapsed !== lastPosition) { lastTime = performance.now(); lastPosition = elapsed; }
            if (performance.now() - lastTime > 10000) throw new Error('Clip bị dừng khi giải mã. Hãy đổi clip hoặc định dạng.');
            const width = element.videoWidth || element.naturalWidth, height = element.videoHeight || element.naturalHeight;
            const scale = Math.min(canvas.width / width, canvas.height / height);
            ctx.fillStyle = '#030712'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(element, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
            if (clip.caption) { ctx.fillStyle = 'rgba(3,7,18,.75)'; ctx.fillRect(0, 614, 1280, 106); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '28px sans-serif'; ctx.fillText(clip.caption.slice(0, 100), 640, 676, 1180); }
            onProgress(Math.min(1, (completed + elapsed) / duration));
            if (elapsed >= length || (clip.kind === 'video' && element.ended)) resolve(); else requestAnimationFrame(frame);
          } catch (error) { reject(error); }
        }; frame();
      });
      if (clip.kind === 'video') element.pause(); completed += length;
    }
    recorder.stop(); await stopped; if (renderError) throw renderError;
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (!blob.size) throw new Error('Video xuất trống. Hãy thử lại.');
    onProgress(1); return new File([blob], `ky-niem.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`, { type: blob.type });
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    musicElement.pause(); musicElement.removeAttribute('src'); musicElement.load(); if (musicUrl) URL.revokeObjectURL(musicUrl);
    for (const element of media) if (element.tagName === 'VIDEO') { element.pause(); element.removeAttribute('src'); element.load(); }
    clock.stop(); stream.getTracks().forEach(track => track.stop()); await audio.close();
  }
}
