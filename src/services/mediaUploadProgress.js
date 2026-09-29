// ponytail: session-local estimates; persist aggregate timings only if cross-session calibration is needed.
const reviewSeconds = {image: 15, video: 45};
let secondsPerMiB = 2;
const mediaKind = file => file?.type?.startsWith('image/') ? 'image' : 'video';

export function estimateMediaSeconds(file, stage = 'uploading') {
  if (stage === 'reviewing') return Math.ceil(reviewSeconds[mediaKind(file)]);
  return Math.ceil(3 + (file?.size || 0) / 1048576 * secondsPerMiB);
}

export function recordMediaTiming(file, stage, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  if (stage === 'reviewing') {
    const kind = mediaKind(file);
    reviewSeconds[kind] = reviewSeconds[kind] * 0.5 + Math.min(175, seconds) * 0.5;
  } else if (file?.size >= 262144) {
    secondsPerMiB = secondsPerMiB * 0.5 + Math.min(60, seconds / (file.size / 1048576)) * 0.5;
  }
}

export function mediaProgress(file, stage, estimatedSeconds = estimateMediaSeconds(file, stage)) {
  return {name: file?.name || '', stage, startedAt: Date.now(), estimatedSeconds};
}

export function remainingMediaSeconds(progress, now = Date.now()) {
  return Math.max(0, Math.ceil(progress.estimatedSeconds - Math.max(0, now - progress.startedAt) / 1000));
}

// Bound the entire upload-and-review pipeline to two files at a time.
export async function runMediaBatch(files, upload, onResult) {
  const results = new Array(files.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(2, files.length)}, async () => {
    while (next < files.length) {
      const index = next++;
      try { results[index] = {status: 'fulfilled', value: await upload(files[index], index)}; }
      catch (reason) { results[index] = {status: 'rejected', reason}; }
      onResult(results[index], index);
    }
  }));
  return results;
}
