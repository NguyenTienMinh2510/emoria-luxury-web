// Original instrumental miniatures, synthesized locally; playback needs a user gesture.
export const MUSIC_TRACKS = [
  { id: 'romance', name: 'Ngày mình có nhau', bpm: 84, notes: [76,79,81,83,79,76,74,76,69,72,76,79,78,74,71,69,72,76,79,84,83,79,76,74,72,74,76,79,76,72,71,69] },
  { id: 'morning', name: 'Nắng qua cửa sổ', bpm: 102, notes: [72,76,79,76,74,77,81,77,76,79,84,83,81,79,76,74,72,74,76,79,81,84,79,76,77,76,74,72,71,74,72,72] },
  { id: 'rain', name: 'Mưa nhẹ bên hiên', bpm: 66, notes: [69,76,72,71,67,74,71,69,65,72,69,67,64,71,67,64,69,72,76,79,76,72,71,67,65,69,72,71,69,67,64,69] },
  { id: 'travel', name: 'Chuyến đi của đôi mình', bpm: 112, notes: [67,71,74,79,76,74,71,69,67,72,76,79,81,79,76,72,74,76,79,83,81,79,74,71,72,76,74,71,69,67,69,67] },
  { id: 'evening', name: 'Hoàng hôn ấm áp', bpm: 76, notes: [65,69,72,77,76,72,69,67,65,69,74,77,79,77,74,72,69,72,76,81,79,76,72,69,67,69,72,74,72,69,67,65] },
  { id: 'stars', name: 'Lời thì thầm của sao', bpm: 60, notes: [81,76,72,69,79,74,71,67,77,72,69,65,76,71,67,64,69,72,76,81,84,81,79,76,77,74,72,71,69,72,71,69] }
];

export function createMusicBoxPlayer({ onStateChange } = {}) {
  let ctx, master, timer, playing = false, track = MUSIC_TRACKS[0], noteIndex = 0, volume = .55, disposed = false;
  const voices = new Set();
  const notify = () => onStateChange?.({ playing, trackId: track.id });
  function stopVoices() {
    clearTimeout(timer);
    for (const osc of voices) { try { osc.stop(); } catch {} }
    voices.clear();
  }
  function tone(midi, duration, level = .2) {
    const now = ctx.currentTime, decay = Math.max(.65, duration * 2);
    for (const [harmonic, strength] of [[1, level], [2.76, level * .22]]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12) * harmonic, now);
      gain.gain.setValueAtTime(strength, now); gain.gain.exponentialRampToValueAtTime(.0001, now + decay);
      osc.connect(gain); gain.connect(master); voices.add(osc);
      osc.onended = () => { voices.delete(osc); osc.disconnect(); gain.disconnect(); };
      osc.start(now); osc.stop(now + decay);
    }
  }
  function schedule() {
    if (!playing || disposed) return;
    const duration = 60 / track.bpm * (noteIndex % 4 === 3 ? 1.5 : .75);
    tone(track.notes[noteIndex], duration);
    if (noteIndex % 4 === 0) tone(track.notes[noteIndex] - 24, duration * 2, .065);
    noteIndex++;
    if (noteIndex === track.notes.length) {
      noteIndex = 0;
      track = MUSIC_TRACKS[(MUSIC_TRACKS.indexOf(track) + 1) % MUSIC_TRACKS.length];
      notify();
    }
    timer = setTimeout(schedule, duration * 1000);
  }
  async function play() {
    if (playing || disposed || typeof window === 'undefined') return playing;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    try {
      if (!ctx) { ctx = new Audio(); master = ctx.createGain(); master.connect(ctx.destination); }
      if (ctx.state === 'suspended') await ctx.resume();
      if (disposed || document.hidden) return false;
      master.gain.setValueAtTime(volume, ctx.currentTime);
      playing = true; schedule(); notify(); return true;
    } catch { pause(); return false; }
  }
  function pause() { playing = false; stopVoices(); notify(); }
  function selectTrack(id) {
    const next = MUSIC_TRACKS.find(t => t.id === id);
    if (!next) return;
    stopVoices(); track = next; noteIndex = 0;
    if (playing) schedule();
    notify();
  }
  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, .04);
  }
  const visibility = () => { if (document.hidden) pause(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
  return {
    play, pause, toggle: async () => { if (playing) { pause(); return false; } return play(); },
    selectTrack, nextTrack: () => selectTrack(MUSIC_TRACKS[(MUSIC_TRACKS.indexOf(track) + 1) % MUSIC_TRACKS.length].id),
    setVolume, isPlaying: () => playing, getVolume: () => volume,
    dispose() { disposed = true; pause(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility); ctx?.close().catch(() => {}); }
  };
}
