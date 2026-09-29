/**
 * EMORIA LUXURY - Interactive Music Box (Chặng C)
 * Synthesizes a gentle, acoustic music box melody using Web Audio API.
 * 100% royalty-free, works completely offline, zero external asset dependencies.
 * STRICTLY user-gesture activated; never autoplays.
 */

export function createMusicBoxPlayer() {
  let ctx = null;
  let masterGain = null;
  let isPlaying = false;
  let currentVolume = 0.55;
  let timerId = null;
  let noteIndex = 0;

  // Gentle music box waltz melody ("Emoria Romance")
  // Frequencies in Hz for natural music box bells
  const notes = [
    { freq: 659.25, dur: 0.4 }, // E5
    { freq: 783.99, dur: 0.4 }, // G5
    { freq: 880.00, dur: 0.4 }, // A5
    { freq: 987.77, dur: 0.8 }, // B5
    { freq: 783.99, dur: 0.4 }, // G5
    { freq: 659.25, dur: 0.8 }, // E5
    { freq: 587.33, dur: 0.4 }, // D5
    { freq: 659.25, dur: 1.2 }, // E5
    { freq: 440.00, dur: 0.4 }, // A4
    { freq: 523.25, dur: 0.4 }, // C5
    { freq: 659.25, dur: 0.4 }, // E5
    { freq: 783.99, dur: 0.8 }, // G5
    { freq: 739.99, dur: 0.4 }, // F#5
    { freq: 587.33, dur: 0.8 }, // D5
    { freq: 493.88, dur: 0.4 }, // B4
    { freq: 440.00, dur: 1.2 }, // A4
  ];

  function ensureContext() {
    if (typeof window === 'undefined') return false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    if (!ctx) {
      ctx = new AudioContextClass();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(currentVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return true;
  }

  function playTone(freq, duration) {
    if (!ctx || !masterGain || !isPlaying) return;
    const now = ctx.currentTime;

    // Fundamental chime tone
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Overtone for bell-like sparkle (chime harmonic at 2.76x frequency)
    const overtone = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2.76, now);

    // Exponential decay typical of physical music box tines
    const decay = Math.max(0.8, duration * 2.2);
    oscGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    overtoneGain.gain.setValueAtTime(0.12, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.5);

    osc.connect(oscGain);
    oscGain.connect(masterGain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(masterGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + decay);
    overtone.stop(now + decay);
  }

  function scheduleNextNote() {
    if (!isPlaying) return;
    const current = notes[noteIndex];
    playTone(current.freq, current.dur);
    noteIndex = (noteIndex + 1) % notes.length;
    timerId = setTimeout(scheduleNextNote, current.dur * 850);
  }

  function play() {
    if (isPlaying) return;
    const ok = ensureContext();
    if (!ok) return;
    isPlaying = true;
    scheduleNextNote();
  }

  function pause() {
    isPlaying = false;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function toggle() {
    if (isPlaying) {
      pause();
      return false;
    } else {
      play();
      return true;
    }
  }

  function setVolume(vol) {
    currentVolume = Math.max(0, Math.min(1, vol));
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(currentVolume, ctx.currentTime);
    }
  }

  // Auto-pause when tab is hidden or minimized
  const handleVisibility = () => {
    if (document.hidden && isPlaying) {
      pause();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  function dispose() {
    pause();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    if (ctx && typeof ctx.close === 'function') {
      ctx.close().catch(() => {});
      ctx = null;
      masterGain = null;
    }
  }

  return {
    play,
    pause,
    toggle,
    setVolume,
    isPlaying: () => isPlaying,
    getVolume: () => currentVolume,
    dispose
  };
}
