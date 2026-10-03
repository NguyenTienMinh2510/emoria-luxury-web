import {HOUSE_PRESETS, ROOM_PRESETS, applyPresetToRooms, applyPresetToSingleRoom} from '../data/housePresets.js';

// A synchronous lock covers the gap before React renders disabled controls.
export function createHousePresetSession({read, flush, save, commit, onChange = () => {}}) {
  let state = {busy: false, preview: null, undo: null};
  let generation = 0;
  const update = patch => {state = {...state, ...patch}; onChange(state);};
  const session = {
    get locked() {return state.busy || Boolean(state.preview);},
    get state() {return state;},
    reset() {generation++; update({busy: false, preview: null, undo: null});},
    async run(task, {allowPreview = false} = {}) {
      if (state.busy || (state.preview && !allowPreview)) return false;
      const current = generation;
      const isCurrent = () => current === generation;
      update({busy: true});
      try {return await task(isCurrent);}
      finally {if (isCurrent()) update({busy: false});}
    },
    preview(presetId, roomId = null) {
      return session.run(async isCurrent => {
        await flush();
        if (!isCurrent()) return false;
        const before = structuredClone(read());
        const preset = (roomId ? ROOM_PRESETS[roomId] : HOUSE_PRESETS)?.find(p => p.id === presetId);
        if (!preset || (roomId && !before.rooms.some(r => r.id === roomId))) throw new Error('Không tìm thấy mẫu bài trí.');
        const next = {...before,
          theme: roomId ? before.theme : preset.theme,
          rooms: roomId ? before.rooms.map(r => r.id === roomId ? applyPresetToSingleRoom(r, presetId) : r) : applyPresetToRooms(before.rooms, presetId)};
        update({preview: {before, next, roomId, name: preset.name}});
        return true;
      });
    },
    cancel() {if (!state.busy) update({preview: null});},
    apply() {
      return session.run(async isCurrent => {
        const plan = state.preview;
        if (!plan) return false;
        if (JSON.stringify(read()) !== JSON.stringify(plan.before)) throw new Error('Bản nháp đã thay đổi. Hãy hủy và xem trước lại.');
        await save(plan.next);
        if (!isCurrent()) return false;
        commit(structuredClone(plan.next));
        update({preview: null, undo: structuredClone(plan)});
        return true;
      }, {allowPreview: true});
    },
    undo() {
      return session.run(async isCurrent => {
        if (!state.undo) return false;
        await flush();
        if (!isCurrent()) return false;
        const plan = state.undo, current = read();
        const rooms = current.rooms.map(room => {
          if (plan.roomId && room.id !== plan.roomId) return room;
          const previous = plan.before.rooms.find(r => r.id === room.id);
          if (!previous) return room;
          const {furnishingVersion, furnishingBaseline, decorations, share_preview_path, ...content} = room;
          const ids = new Set((room.memories || []).map(m => m.id));
          return {...content,
            ...(previous.furnishingVersion === undefined ? {} : {furnishingVersion: previous.furnishingVersion}),
            ...(previous.furnishingBaseline === undefined ? {} : {furnishingBaseline: structuredClone(previous.furnishingBaseline)}),
            decorations: structuredClone(previous.decorations || []).map(d => {
              const edited = room.decorations?.find(item => (item.id || item.slot) === (d.id || d.slot));
              const restored = {...d, ...(edited?.text === undefined ? {} : {text: edited.text})};
              if (restored.photos) restored.photos = restored.photos.map(id => ids.has(id) ? id : null);
              return restored;
            })};
        });
        const next = {...current, rooms, theme: !plan.roomId && current.theme === plan.next.theme ? plan.before.theme : current.theme};
        await save(next);
        if (!isCurrent()) return false;
        commit(next);
        update({undo: null});
        return true;
      });
    },
  };
  return session;
}
