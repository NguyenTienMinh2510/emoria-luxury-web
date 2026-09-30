import React, { useRef, useState, useEffect } from 'react';
import {
  DECORATIONS,
  roomDecorations,
  setDecorationPhoto,
  addDecorationInstance,
  updateDecorationInstance,
  removeDecorationInstance,
  generateInstanceId, houseLighting, withHouseLighting
} from '../services/house3d.js';
import { createMusicBoxPlayer, MUSIC_TRACKS } from '../services/musicBoxPlayer.js';
import MemoryHouse2D from './MemoryHouse2D.jsx';

// Style Packages (Gói phong cách một chạm)
export const STYLE_PACKAGES = [
  {
    id: 'first_date',
    name: 'Buổi hẹn đầu',
    desc: 'Bình tulip, cốc đôi & lịch hẹn hò',
    lighting: 'sunset',
    slots: { left: 'vase', table: 'mugs', right: 'calendar' }
  },
  {
    id: 'cozy_home',
    name: 'Tổ ấm bình yên',
    desc: 'Mèo ngủ ngoan, cây xanh & đèn ấm áp',
    lighting: 'day',
    slots: { left: 'cat', table: 'plant', right: 'lamp' }
  },
  {
    id: 'cherished_love',
    name: 'Kỷ vật tình yêu',
    desc: 'Dây ảnh, khung ảnh & album kỷ niệm',
    lighting: 'sunset',
    slots: { left: 'bunting', table: 'frame', right: 'album' }
  },
  {
    id: 'travel_memories',
    name: 'Kỷ niệm chuyến đi',
    desc: 'Dây ảnh (Máy ảnh & Postcard đang chờ tạo asset 3D)',
    lighting: 'day',
    slots: { left: 'bunting' },
    isPendingAsset: true
  }
];

export default function MemoryHouse3D({
  rooms,
  title,
  theme,
  activeRoomId,
  onSelectRoom,
  onRoomsChange,
  onPhoto,
  onSave,
  onUploadPhoto,
  uploading = false,
  saving,
  readOnly = false,
  onRegisterCapture
}) {
  const host = useRef(null), engine = useRef(null), latest = useRef({});
  const fileInput = useRef(null), uploadTarget = useRef(null), tourTimer = useRef(null);
  const musicBox = useRef(null), contentEditor = useRef(null);

  const [view, setView] = useState('3d'), [status, setStatus] = useState('loading'), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [touring, setTouring] = useState(false), [tourPaused, setTourPaused] = useState(false);

  // Freeform Decor States
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [activeTool, setActiveTool] = useState('idle'); // 'idle' | 'place' | 'move'
  const [placingItem, setPlacingItem] = useState(null);
  const [placingScale, setPlacingScale] = useState(1);
  const [pendingPlacement, setPendingPlacement] = useState(null);
  const [removing, setRemoving] = useState(false);

  const [history, setHistory] = useState({ past: [], future: [] });

  // Music Box, Gyroscope, Decor Inspection, Welcome Door
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.55);
  const [musicTrack, setMusicTrack] = useState(MUSIC_TRACKS[0].id);
  const [gyroSensitivity, setGyroSensitivity] = useState(.6);
  const [gyroNotice, setGyroNotice] = useState('');
  const [isGyroEnabled, setIsGyroEnabled] = useState(false);
  const [inspectingDecor, setInspectingDecor] = useState(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [arrangeNotice, setArrangeNotice] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(null);

  latest.current = { rooms, title, theme, activeRoomId, onSelectRoom, onPhoto, readOnly };
  const room = rooms.find(r => r.id === activeRoomId) || rooms[0];
  const decorationsList = roomDecorations(room);
  const selectedInstance = decorationsList.find(d => (d.id && d.id === selectedInstanceId) || (d.slot && d.slot === selectedInstanceId));
  const selectedAsset = selectedInstance ? DECORATIONS.find(d => d.id === selectedInstance.item) : null;
  const placingAsset = placingItem ? DECORATIONS.find(d => d.id === placingItem) : null;

  // Initialize Music Box Player (Web Audio API)
  useEffect(() => {
    musicBox.current = createMusicBoxPlayer({ onStateChange: ({ playing, trackId }) => { setIsMusicPlaying(playing); setMusicTrack(trackId); } });
    return () => {
      musicBox.current?.dispose();
      musicBox.current = null;
    };
  }, []);

  async function toggleMusic() {
    if (!musicBox.current) return;
    const playing = await musicBox.current.toggle();
    setIsMusicPlaying(playing);
  }

  function handleVolumeChange(v) {
    setMusicVolume(v);
    musicBox.current?.setVolume(v);
  }

  async function toggleGyro() {
    const next = !isGyroEnabled;
    const ok = await engine.current?.enableGyroscope(next);
    setIsGyroEnabled(Boolean(ok && next));
  }

  function chooseUpload(target) {
    if (readOnly || uploading || !room) return;
    uploadTarget.current = { roomId: room.id, target };
    fileInput.current?.click();
  }

  // Snapshot only editable decoration/mood fields, preserving uploads during undo.
  const snapshot = () => rooms.map(r => ({ id: r.id, decorations: roomDecorations(r), lighting: r.lighting || 'day' }));
  function commitRooms(nextRooms, recordHistory = true) {
    if (readOnly) return;
    if (recordHistory) setHistory(h => ({ past: [...h.past.slice(-25), snapshot()], future: [] }));
    onRoomsChange?.(nextRooms);
  }
  function commitChange(nextRoom, recordHistory = true) {
    if (room) commitRooms(rooms.map(r => r.id === room.id ? nextRoom : r), recordHistory);
  }
  function restoreSnapshot(saved) {
    onRoomsChange?.(rooms.map(r => ({ ...r, ...saved.find(s => s.id === r.id) })));
    setSelectedInstanceId(null); cancelPlacement();
  }
  function handleUndo() {
    if (readOnly || !history.past.length) return;
    setHistory({ past: history.past.slice(0, -1), future: [snapshot(), ...history.future.slice(0, 25)] });
    restoreSnapshot(history.past.at(-1));
  }
  function handleRedo() {
    if (readOnly || !history.future.length) return;
    setHistory({ past: [...history.past, snapshot()], future: history.future.slice(1) });
    restoreSnapshot(history.future[0]);
  }

  // 3D Engine Setup
  latest.current.placement = placingItem || activeTool === 'move' ? {
    item: placingItem || selectedInstance?.item,
    scale: placingItem ? placingScale : selectedInstance?.scale,
    rotation: placingItem ? 0 : selectedInstance?.rotation,
    excludeId: placingItem ? null : selectedInstanceId
  } : null;
  latest.current.onPlacementPreview = hit => {
    if (!readOnly && placingItem) setPendingPlacement(hit);
  };
  latest.current.onSurfaceTap = hit => {
    if (readOnly || !hit?.isValid || hit.roomId !== room?.id) return;
    if (placingItem) confirmPlacement(hit);
    else if (activeTool === 'move' && selectedInstanceId) {
      commitChange(updateDecorationInstance(room, selectedInstanceId, {
        position: hit.position, surface: hit.surface, parent_id: hit.parentId
      }, { validatedPlacement: true }));
      cancelPlacement();
    }
  };
  latest.current.onDecorSelect = data => {
    if (removing) {
      const targetRoom = rooms.find(r => r.id === data.roomId);
      if (!targetRoom) return;
      const updated = removeDecorationInstance(targetRoom, data.id, { action: 'delete_children' });
      commitRooms(rooms.map(r => r.id === targetRoom.id ? updated : r));
      setSelectedInstanceId(null);
    } else {
      if (data.roomId) onSelectRoom?.(data.roomId);
      setSelectedInstanceId(data.id);
      engine.current?.setSelectionHighlight(data.id);
    }
  };
  useEffect(() => {
    if (view !== '3d' || !host.current) return;
    let cancelled = false; setStatus('loading'); setError('');
    import('../services/house3dRenderer.js').then(({ createHouseRenderer }) => {
      if (cancelled) return;
      try {
        engine.current = createHouseRenderer(host.current, {
          getPlacement: () => latest.current.placement,
          isEditing: () => !latest.current.readOnly,
          onGyroChange: (enabled, message) => { setIsGyroEnabled(enabled); setGyroNotice(message); },
          onPlacementPreview: hit => latest.current.onPlacementPreview?.(hit),
          onRoom: id => {
            latest.current.onSelectRoom?.(id);
            engine.current?.focus(id, true);
          },
          onPhoto: (url, memory) => {
            latest.current.onPhoto?.(url, memory);
          },
          onDecorItem: (item, decorData) => {
            if (latest.current.readOnly) {
              const asset = DECORATIONS.find(d => d.id === item);
              if (asset) {
                setInspectingDecor({ ...asset, ...decorData, id: asset.id });
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
              }
            } else {
              latest.current.onDecorSelect?.(decorData);
              if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
            }
          },
          onSurfaceTap: hit => latest.current.onSurfaceTap?.(hit),
          onReady: () => { if (!cancelled) setStatus('ready'); },
          onError: message => { if (!cancelled) { setError(message); setStatus('error'); } }
        });
        engine.current.update(latest.current);
        if (onRegisterCapture) {
          onRegisterCapture(() => engine.current?.capture());
        }
      } catch {
        setError('Thiết bị chưa mở được 3D. Khung 2D bên dưới vẫn dùng bình thường.');
        setStatus('error');
      }
    }).catch(() => {
      if (!cancelled) {
        setStatus('error');
        setError('Chưa tải được chế độ 3D. Hãy thử lại khi kết nối ổn định.');
      }
    });

    return () => {
      cancelled = true;
      if (onRegisterCapture) onRegisterCapture(null);
      engine.current?.dispose();
      engine.current = null;
    };
  }, [view, retry]);

  useEffect(() => {
    engine.current?.update({ rooms, title, theme, activeRoomId });
  }, [rooms, title, theme, activeRoomId]);

  useEffect(() => {
    engine.current?.setInteracting(Boolean(placingItem || activeTool === 'move'));
  }, [placingItem, activeTool, status]);

  useEffect(() => {
    cancelPlacement();
    if (!roomDecorations(room).some(d => (d.id || d.slot) === selectedInstanceId)) setSelectedInstanceId(null);
    setRemoving(false);
  }, [activeRoomId, readOnly]);

  useEffect(() => {
    engine.current?.setSelectionHighlight(selectedInstanceId);
  }, [rooms, selectedInstanceId, status]);

  // Guided Tour timer (steps through rooms smoothly every 6.5s)
  useEffect(() => {
    if (!touring || tourPaused) {
      if (tourTimer.current) clearInterval(tourTimer.current);
      return;
    }
    tourTimer.current = setInterval(() => {
      const currentIdx = rooms.findIndex(r => r.id === activeRoomId);
      const nextIdx = (currentIdx + 1) % rooms.length;
      const nextId = rooms[nextIdx].id;
      onSelectRoom?.(nextId);
      engine.current?.focus(nextId, true);
    }, 6500);
    return () => { if (tourTimer.current) clearInterval(tourTimer.current); };
  }, [touring, tourPaused, rooms, activeRoomId, onSelectRoom]);

  // Freeform Placement Flow
  function startPlacement(itemId) {
    if (readOnly || !room || status !== 'ready' || view !== '3d') return;
    engine.current?.hideGhost();
    const currentDecor = roomDecorations(room);
    if (currentDecor.length > 35) {
      setArrangeNotice('Phòng đang có nhiều đồ vật. Bạn vẫn có thể tiếp tục đặt thêm thoải mái.');
      setTimeout(() => setArrangeNotice(''), 3000);
    }
    const asset = DECORATIONS.find(d => d.id === itemId);
    if (!asset) return;
    setSelectedInstanceId(null);
    engine.current?.setSelectionHighlight(null);
    setPlacingItem(itemId);
    setActiveTool('place');

    setRemoving(false);
    setTouring(false);
    const initialPlacement = engine.current?.findPlacement(room.id, itemId);
    setPendingPlacement(initialPlacement || null);
    setPlacingScale(initialPlacement?.scale || 1);
    if (initialPlacement) engine.current?.showGhost(itemId, initialPlacement.position, true, 0, initialPlacement.scale);
    else setArrangeNotice('Chưa còn chỗ vừa món này. Hãy gỡ bớt đồ hoặc chọn món nhỏ hơn.');
    engine.current?.focus(room.id, true);
    host.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function confirmPlacement(hit = pendingPlacement) {
    if (readOnly || !placingItem || !hit?.isValid || !room) return;
    const checked = engine.current?.findPlacement(room.id, placingItem, { position: hit.position, scale: placingScale });
    if (!checked) return;
    const nextRoom = addDecorationInstance(room, placingItem, {
      position: checked.position, surface: checked.surface, scale: checked.scale, parent_id: checked.parentId
    });
    commitChange(nextRoom, true);
    cancelPlacement();
    const newest = roomDecorations(nextRoom).at(-1);
    if (newest?.id) setSelectedInstanceId(newest.id);
  }

  function cancelPlacement() {
    latest.current.placement = null;
    engine.current?.setInteracting(false);
    engine.current?.hideGhost();
    setPlacingItem(null);
    setPendingPlacement(null);
    setActiveTool('idle');
  }

  // Selected Instance Actions
  function toggleMoveMode() {
    if (decorationsList.some(d => d.parent_id === selectedInstanceId)) {
      setArrangeNotice('Hãy chuyển các món bên trên trước khi di chuyển vật đỡ.');
      return;
    }
    if (activeTool === 'move') {
      cancelPlacement();
    } else {
      setActiveTool('move');
      engine.current?.setInteracting(true); // Lock camera orbit during move
    }
  }

  function transformSelected(updates) {
    if (readOnly || !selectedInstance || !room) return;
    if (decorationsList.some(d => d.parent_id === selectedInstanceId)) {
      setArrangeNotice('Hãy chuyển các món bên trên trước khi đổi vật đỡ.');
      return;
    }
    const next = { ...selectedInstance, ...updates };
    const hit = engine.current?.findPlacement(room.id, next.item, { ...next, excludeId: selectedInstanceId });
    if (!hit) return;
    commitChange(updateDecorationInstance(room, selectedInstanceId, { ...updates, position: hit.position, surface: hit.surface, parent_id: null }, { validatedPlacement: true }));
  }

  function rotateSelected(deltaDegrees) {
    const yaw = Array.isArray(selectedInstance?.rotation) ? selectedInstance.rotation[1] : (Number(selectedInstance?.rotation) || 0);
    transformSelected({ rotation: (yaw + deltaDegrees + 360) % 360 });
  }

  function scaleSelected(scale) { transformSelected({ scale }); }

  function cloneSelected() {
    if (readOnly || !selectedInstance || !room) return;
    const hit = engine.current?.findPlacement(room.id, selectedInstance.item, selectedInstance);
    if (!hit) { setArrangeNotice('Chưa còn chỗ vừa bản sao. Hãy gỡ bớt đồ trước.'); return; }
    const clone = { ...selectedInstance, id: generateInstanceId(selectedInstance.item), slot: undefined, parent_id: null, position: hit.position, surface: hit.surface };
    commitChange({ ...room, decorations: [...decorationsList, clone] });
    setSelectedInstanceId(clone.id);
  }

  function requestDelete(instId) {
    if (!instId || !room) return;
    const currentDecor = roomDecorations(room);
    const children = currentDecor.filter(d => d.parent_id === instId);
    if (children.length > 0) {
      setDeleteDialog({
        targetId: instId,
        children
      });
      return;
    }
    executeDelete(instId, { action: 'drop_or_cancel' });
  }

  function executeDelete(targetId, options) {
    if (readOnly || !room) return;
    let updated = removeDecorationInstance(room, targetId, { action: 'delete_children' });
    if (options.action !== 'delete_children') {
      const remainingIds = new Set(roomDecorations(updated).map(d => d.id || d.slot));
      const displaced = decorationsList.filter(d => !remainingIds.has(d.id || d.slot) && (d.id || d.slot) !== targetId);
      const excludeIds = [targetId, ...displaced.map(d => d.id || d.slot)];
      const extra = [];
      for (const d of displaced) {
        const hit = engine.current?.findPlacement(room.id, d.item, { ...d, excludeIds, extra });
        if (!hit) { setArrangeNotice('Chưa đủ chỗ để chuyển các món bên trên. Các món vẫn được giữ nguyên.'); setDeleteDialog(null); return; }
        extra.push({ ...d, parent_id: null, position: hit.position, surface: hit.surface });
      }
      updated = { ...updated, decorations: [...roomDecorations(updated), ...extra] };
    }
    commitChange(updated, true);
    if (selectedInstanceId === targetId) {
      setSelectedInstanceId(null);
      engine.current?.setSelectionHighlight(null);
    }
    setDeleteDialog(null);
  }

  function deleteSelected() {
    if (!selectedInstanceId) return;
    requestDelete(selectedInstanceId);
  }

  // Apply one-touch style package
  function applyStylePackage(pkg) {
    if (readOnly || !room || status !== 'ready' || view !== '3d') return;
    cancelPlacement();
    const existingDecor = roomDecorations(room);
    const added = [];
    for (const itemId of Object.values(pkg.slots)) {
      const hit = engine.current?.findPlacement(room.id, itemId, { extra: added });
      if (!hit) { setArrangeNotice('Phòng chưa đủ chỗ cho bộ này. Hãy gỡ bớt đồ trước.'); return; }
      added.push({ id: generateInstanceId(itemId), item: itemId, position: hit.position, surface: hit.surface, rotation: 0, scale: hit.scale, photos: [], text: '' });
    }
    const nextDecor = [...existingDecor, ...added];
    const updatedRoom = {
      ...room,
      decorations: nextDecor
    };
    commitRooms(withHouseLighting(rooms.map(r => r.id === room.id ? updatedRoom : r), pkg.lighting));
    engine.current?.focus(room.id, true);
    host.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // Helper: Classify photo aspect ratio
  function classifyMemoryAspectRatio(mem) {
    if (!mem) return 'square';
    if (typeof mem.aspect_ratio === 'number') {
      if (mem.aspect_ratio < 0.92) return 'portrait';
      if (mem.aspect_ratio > 1.08) return 'landscape';
      return 'square';
    }
    if (typeof mem.aspectRatio === 'number') {
      if (mem.aspectRatio < 0.92) return 'portrait';
      if (mem.aspectRatio > 1.08) return 'landscape';
      return 'square';
    }
    return 'square';
  }

  // "✦ Dọn nhà giúp mình" (Auto-arrange available photos into empty slots/instances)
  function autoArrangePhotos() {
    if (readOnly || !room || !room.memories || room.memories.length === 0 || status !== 'ready' || view !== '3d') return;
    cancelPlacement();
    const existingDecor = roomDecorations(room);

    let targetDecor = existingDecor.map(d => ({ ...d, photos: Array.isArray(d.photos) ? [...d.photos] : [] }));
    const totalSlots = targetDecor.reduce((sum, d) => {
      const asset = DECORATIONS.find(a => a.id === d.item);
      return sum + (asset?.photoCount || 0);
    }, 0);

    // If room currently has no photo-holding decor items, place standard set
    if (totalSlots === 0) {
      const added = [];
      for (const item of ['frame', 'album', 'bunting']) {
        const hit = engine.current?.findPlacement(room.id, item, { extra: added });
        if (!hit) continue;
        added.push({ id: generateInstanceId(item), item, position: hit.position, surface: hit.surface, rotation: 0, scale: hit.scale, photos: Array(DECORATIONS.find(d => d.id === item).photoCount).fill(null) });
      }
      if (!added.length) { setArrangeNotice('Chưa còn chỗ cho khung ảnh. Hãy gỡ bớt đồ trước.'); return; }
      targetDecor.push(...added);
    }

    const usedIds = new Set(targetDecor.flatMap(d => d.photos || []).filter(Boolean));
    const availableMemories = room.memories.filter(m => (m.photo_url || m.photo_path) && !usedIds.has(m.id));

    if (availableMemories.length === 0) {
      setArrangeNotice('Tất cả ảnh trong phòng đã được sắp xếp vào các vị trí!');
      setTimeout(() => setArrangeNotice(''), 3500);
      return;
    }

    const portraits = [], landscapes = [], squares = [];
    for (const m of availableMemories) {
      const cat = classifyMemoryAspectRatio(m);
      if (cat === 'portrait') portraits.push(m);
      else if (cat === 'landscape') landscapes.push(m);
      else squares.push(m);
    }

    const openSlots = [];
    targetDecor.forEach((d, dIdx) => {
      const asset = DECORATIONS.find(a => a.id === d.item);
      if (!asset || !asset.photoCount) return;
      const count = asset.photoCount;
      while (d.photos.length < count) d.photos.push(null);
      for (let i = 0; i < count; i++) {
        if (!d.photos[i]) {
          let pref = 'square';
          if (d.item === 'frame') pref = 'portrait';
          else if (d.item === 'album') pref = 'landscape';
          openSlots.push({ dIdx, pIdx: i, pref, item: d.item });
        }
      }
    });

    if (openSlots.length === 0) {
      setArrangeNotice('Các khung ảnh và vật phẩm trong phòng đã đầy!');
      setTimeout(() => setArrangeNotice(''), 3500);
      return;
    }

    let placedCount = 0;
    for (const slotInfo of openSlots) {
      let match = null;
      if (slotInfo.pref === 'portrait' && portraits.length > 0) match = portraits.shift();
      else if (slotInfo.pref === 'landscape' && landscapes.length > 0) match = landscapes.shift();
      else if (slotInfo.pref === 'square' && squares.length > 0) match = squares.shift();
      if (match) {
        targetDecor[slotInfo.dIdx].photos[slotInfo.pIdx] = match.id;
        slotInfo.filled = true;
        placedCount++;
      }
    }

    const leftover = [...portraits, ...landscapes, ...squares];
    for (const slotInfo of openSlots) {
      if (!slotInfo.filled && leftover.length > 0) {
        const next = leftover.shift();
        targetDecor[slotInfo.dIdx].photos[slotInfo.pIdx] = next.id;
        slotInfo.filled = true;
        placedCount++;
      }
    }

    const updatedRoom = { ...room, decorations: targetDecor };
    commitChange(updatedRoom, true);
    engine.current?.focus(room.id, true);
    setArrangeNotice(`✦ Đã tự động sắp xếp ${placedCount} ảnh vào vị trí tối ưu theo tỷ lệ khung hình.`);
    setTimeout(() => setArrangeNotice(''), 4500);
  }

  const button = 'min-h-11 min-w-11 px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white hover:bg-white/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <section aria-label="Ngôi nhà kỷ niệm 3D" className="rounded-3xl border border-white/15 bg-gradient-to-b from-stone-900/90 to-stone-950/90 shadow-2xl backdrop-blur-xl overflow-hidden relative">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={async e => {
          const file = e.target.files?.[0], t = uploadTarget.current;
          e.target.value = ''; uploadTarget.current = null;
          if (file && t) {
            await onUploadPhoto?.(t.roomId, file, t.target);
          }
        }}
      />

      {/* Top Bar: Title, Controls, Music Box, Gyroscope */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] uppercase tracking-wider text-amber-200/90 font-bold">Mô hình 3D thực tế</p>
          </div>
          <h2 className="font-serif text-lg text-white font-bold">{title || 'Ngôi nhà kỷ niệm'}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleMusic} className={button} aria-pressed={isMusicPlaying}>
            🎵 {isMusicPlaying ? 'Dừng nhạc' : 'Bật nhạc'}
          </button>
          <button type="button" onClick={toggleGyro} disabled={status !== 'ready' || view !== '3d'} className={button} aria-pressed={isGyroEnabled}>
            📱 {isGyroEnabled ? 'Tắt nghiêng' : 'Nghiêng máy'}
          </button>

          {/* Undo / Redo Buttons */}
          {!readOnly && (
            <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                className={`${button} px-2 py-1`}
                disabled={history.past.length === 0}
                onClick={handleUndo}
                title="Hoàn tác (Undo)"
              >
                ↶
              </button>
              <button
                type="button"
                className={`${button} px-2 py-1`}
                disabled={history.future.length === 0}
                onClick={handleRedo}
                title="Làm lại (Redo)"
              >
                ↷
              </button>
            </div>
          )}

          <div className="flex rounded-xl bg-black/30 p-1 border border-white/10" role="group" aria-label="Chế độ hiển thị">
            <button type="button" className={`${button} ${view === '3d' ? 'bg-white/20 font-bold' : ''}`} onClick={() => setView('3d')}>Khung 3D</button>
            <button type="button" className={`${button} ${view === '2d' ? 'bg-white/20 font-bold' : ''}`} onClick={() => { cancelPlacement(); setView('2d'); }}>Ngôi nhà 2D</button>
          </div>
        </div>
      </div>

      <details className="border-b border-white/10 px-3 py-2 sm:px-4">
        <summary className="cursor-pointer py-2 text-sm font-semibold text-amber-200">Không khí & âm nhạc của ngôi nhà</summary>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 text-sm">
          <label className="space-y-1"><span>Ánh sáng toàn bộ nhà</span>
            <select aria-label="Ánh sáng toàn bộ nhà" disabled={readOnly} value={houseLighting(rooms)} onChange={e => commitRooms(withHouseLighting(rooms, e.target.value))} className="block w-full min-h-11 rounded-xl bg-stone-900 border border-white/20 px-3 text-base sm:text-sm">
              <option value="day">Bình minh trong trẻo</option><option value="sunset">Hoàng hôn mật ngọt</option><option value="night">Đêm hẹn hò</option>
            </select>
            <span className="block text-xs text-stone-400">Giữ nguyên khi đổi phòng và lưu cùng ngôi nhà.</span>
          </label>
          <label className="space-y-1"><span>Danh sách nhạc · 6 giai điệu</span>
            <select aria-label="Chọn giai điệu" value={musicTrack} onChange={e => musicBox.current?.selectTrack(e.target.value)} className="block w-full min-h-11 rounded-xl bg-stone-900 border border-white/20 px-3 text-base sm:text-sm">
              {MUSIC_TRACKS.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
            </select>
            <span className="block text-xs text-stone-400">Tự chuyển bài khi phát hết; chỉ phát khi bạn bật.</span>
          </label>
          <div className="space-y-2"><button type="button" className={button} onClick={() => musicBox.current?.nextTrack()}>Bài tiếp theo ⏭</button>
            <label className="flex items-center gap-3">Âm lượng<input type="range" aria-label="Âm lượng nhạc" min="0" max="1" step="0.05" value={musicVolume} onChange={e => handleVolumeChange(Number(e.target.value))} className="w-full min-w-0 accent-amber-300" /></label>
          </div>
        </div>
        {isGyroEnabled && <div className="flex flex-wrap gap-3 items-center pb-3 text-sm"><button type="button" className={button} onClick={() => engine.current?.calibrateGyroscope()}>Lấy lại tâm nhìn</button><label className="flex items-center gap-2">Độ nhạy<input type="range" aria-label="Độ nhạy nghiêng máy" min="0.2" max="1.5" step="0.1" value={gyroSensitivity} onChange={e => { const value = Number(e.target.value); setGyroSensitivity(value); engine.current?.setGyroSensitivity(value); }} /></label></div>}
        {gyroNotice && <p role="status" className="pb-3 text-xs text-amber-200">{gyroNotice}</p>}
      </details>

      {/* 3D Canvas Container */}
      {view === '3d' ? (
        <>
          <div className="relative h-[58svh] min-h-[340px] sm:h-auto sm:aspect-[16/9] w-full max-h-[580px] bg-stone-950 overflow-hidden">
            <div ref={host} className="w-full h-full" />

            {/* Soft Welcome Door Entrance */}
            {!welcomeDismissed && readOnly && (
              <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                <div className="max-w-md space-y-4">
                  <span className="text-4xl animate-bounce">🚪✨</span>
                  <h3 className="text-2xl font-serif font-bold text-white">Chào mừng bạn ghé thăm</h3>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Ngôi nhà kỷ niệm lưu giữ những khoảnh khắc ngọt ngào nhất của đôi mình. Mời bạn dạo bước qua 5 căn phòng ấm áp.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setWelcomeDismissed(true);
                        engine.current?.focus(rooms[0]?.id || 'beginning', true);
                      }}
                      className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-stone-950 font-bold text-xs shadow-lg hover:from-amber-300 hover:to-amber-400 transition-all cursor-pointer"
                    >
                      Bắt đầu dạo bước
                    </button>
                    <button
                      type="button"
                      onClick={() => setWelcomeDismissed(true)}
                      className="px-4 py-2.5 rounded-2xl bg-white/10 text-stone-300 hover:text-white text-xs font-semibold cursor-pointer"
                    >
                      Bỏ qua
                    </button>
                  </div>
                </div>
              </div>
            )}

            {status === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-950/80 text-white text-xs">
                <div className="w-8 h-8 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
                <span>Đang bài trí ngôi nhà 3D...</span>
              </div>
            )}
            {status === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-950/90 text-stone-200 text-xs p-4 text-center">
                <p>{error}</p>
                <button type="button" className={button} onClick={() => setRetry(r => r + 1)}>Tải lại mô hình</button>
                <button type="button" className={button} onClick={() => setView('2d')}>Mở ngôi nhà 2D</button>
              </div>
            )}

            {removing && !readOnly && <div className="absolute top-3 left-3 right-3 z-30 p-3 rounded-xl bg-stone-900/95 text-xs text-white flex justify-between gap-3"><span>Chạm món muốn gỡ (kèm đồ bên trên, nếu có). Có thể Hoàn tác.</span><button type="button" className={button} onClick={() => setRemoving(false)}>Xong</button></div>}
            {/* Floating Placement Confirmation Banner */}
            {!readOnly && placingItem && placingAsset && (
              <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 z-30 flex flex-wrap items-center justify-between gap-2 p-2 sm:p-3 rounded-2xl bg-stone-900/95 border border-amber-400/40 backdrop-blur-xl shadow-2xl animate-scaleUp">
                <div className="flex items-center gap-2.5">
                  <img src={placingAsset.image} alt="" className="w-9 h-9 rounded-xl object-cover border border-amber-300/30" />
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Đang đặt: {placingAsset.name} · {placingScale}×</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">
                        {pendingPlacement?.surface === 'table' ? 'Mặt bàn' : pendingPlacement?.surface === 'wall' ? 'Tường' : 'Sàn phòng'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-stone-300">
                      {pendingPlacement?.isValid
                        ? 'Giữ và kéo trên mô hình, thả tay để đặt. Vật luôn bám chỗ hợp lệ.'
                        : 'Chưa còn chỗ vừa món này. Hãy chọn món nhỏ hơn hoặc gỡ bớt đồ.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => confirmPlacement()}
                    disabled={!pendingPlacement?.isValid}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-40"
                  >
                    ✓ Xác nhận đặt
                  </button>
                  <button
                    type="button"
                    onClick={cancelPlacement}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}

            {/* Floating Concise Action Toolbar for Selected Instance */}
            {!readOnly && selectedInstance && selectedAsset && !placingItem && (
              <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 z-30 flex flex-wrap items-center justify-between gap-2 p-2 sm:p-3 rounded-2xl bg-stone-900/95 border border-amber-400/40 backdrop-blur-xl shadow-2xl animate-scaleUp">
                <div className="flex items-center gap-2.5">
                  <img src={selectedAsset.image} alt="" className="w-9 h-9 rounded-xl object-cover border border-amber-300/30" />
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{selectedAsset.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">
                        {selectedInstance.surface === 'table' ? 'Mặt bàn' : selectedInstance.surface === 'wall' ? 'Tường' : 'Sàn phòng'}
                      </span>
                    </h4>
                    <p className="text-[10px] text-stone-400">
                      {activeTool === 'move' ? 'Giữ và kéo đến chỗ mới, thả tay để đặt' : 'Đang chọn món này'}
                    </p>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleMoveMode}
                    className={`${button} ${activeTool === 'move' ? 'bg-amber-400 text-stone-950 font-bold border-amber-300 shadow' : ''}`}
                    title="Chạm vị trí mới để di chuyển đồ vật"
                  >
                    {activeTool === 'move' ? '✓ Đang di chuyển' : 'Di chuyển'}
                  </button>

                  <button
                    type="button"
                    onClick={() => rotateSelected(45)}
                    className={button}
                    title="Xoay đồ vật 45 độ"
                  >
                    Xoay 45°
                  </button>

                  {/* Quick Scale Toggle (0.8x -> 1.0x -> 1.3x) */}
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(selectedInstance.scale) || 1.0;
                      const next = cur < 0.9 ? 1.0 : cur < 1.15 ? 1.3 : 0.8;
                      scaleSelected(next);
                    }}
                    className={button}
                    title="Đổi kích thước đồ vật"
                  >
                    {(Number(selectedInstance.scale) || 1.0) > 1.1 ? 'Lớn (1.3x)' : (Number(selectedInstance.scale) || 1.0) < 0.9 ? 'Nhỏ (0.8x)' : 'Vừa (1.0x)'}
                  </button>

                  <button
                    type="button"
                    onClick={cloneSelected}
                    className={button}
                    title="Tạo thêm một bản sao của món này"
                  >
                    Nhân bản
                  </button>

                  {(selectedAsset.photoCount > 0 || selectedAsset.textLabel) && (
                    <button
                      type="button"
                      onClick={() => contentEditor.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                      className={`${button} bg-amber-400/20 text-amber-300 border-amber-400/40`}
                      title="Gắn ảnh hoặc thay đổi nội dung chữ"
                    >
                      Viết chữ / Gắn ảnh
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="px-2.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 text-xs font-semibold cursor-pointer transition-all"
                    title="Xóa món này khỏi phòng"
                  >
                    Xóa
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInstanceId(null);
                      engine.current?.setSelectionHighlight(null);
                      setActiveTool('idle');
                      engine.current?.setInteracting(false);
                    }}
                    className="text-stone-400 hover:text-white px-2 py-1 text-xs cursor-pointer"
                    title="Bỏ chọn"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Floating View Controls */}
            <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${button} bg-black/60 backdrop-blur-md hover:bg-black/80`}
                disabled={status !== 'ready'}
                onClick={() => { setTouring(false); setTourPaused(false); engine.current?.overview(true); }}
                title="Đưa góc nhìn về toàn cảnh ngôi nhà"
              >
                Toàn cảnh
              </button>
              <button
                type="button"
                className={`${button} bg-black/60 backdrop-blur-md hover:bg-black/80`}
                disabled={status !== 'ready'}
                onClick={() => engine.current?.focus(room?.id, true)}
                title="Tập trung góc nhìn vào phòng đang chọn"
              >
                Ghé phòng này
              </button>
              <button
                type="button"
                className={`${button} ${touring ? 'bg-amber-300 text-stone-950 font-bold' : 'bg-black/60 backdrop-blur-md text-amber-200 border-amber-300/30'}`}
                disabled={status !== 'ready'}
                onClick={() => {
                  if (touring) {
                    setTouring(false);
                    setTourPaused(false);
                  } else {
                    setTouring(true);
                    setTourPaused(false);
                    engine.current?.focus(room?.id, true);
                  }
                }}
                title="Dạo bước tự động qua từng căn phòng"
              >
                {touring ? 'Đang dạo bước' : 'Dạo bước'}
              </button>
            </div>

            {/* Visitor Decor Inspection Modal */}
            {inspectingDecor && (
              <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                <div className="w-full max-w-sm bg-stone-900 border border-white/20 rounded-3xl p-5 shadow-2xl space-y-4 animate-scaleUp">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                      <img src={inspectingDecor.image} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/15" />
                      <div>
                        <h4 className="font-serif font-bold text-white text-sm">{inspectingDecor.name}</h4>
                        <span className="text-[10px] text-amber-300">Đồ vật tương tác 3D</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectingDecor(null)}
                      className="text-stone-400 hover:text-white text-sm font-bold p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {inspectingDecor.id === 'calendar' && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
                      <p className="font-bold">📅 Ngày kỷ niệm của đôi mình</p>
                      <p className="italic text-stone-200 leading-relaxed">
                        {inspectingDecor.text || '28.09.2026 — Ngày chúng mình có nhau'}
                      </p>
                    </div>
                  )}

                  {inspectingDecor.id === 'cat' && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200 space-y-1">
                      <p className="font-bold">🐾 Bé Miu cưng</p>
                      <p className="italic text-stone-200 leading-relaxed">
                        "Meow meow! Bé mèo ngủ ngoan chứng kiến từng câu chuyện hạnh phúc trong căn nhà."
                      </p>
                    </div>
                  )}

                  {inspectingDecor.id === 'plant' && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 space-y-1">
                      <p className="font-bold">🌱 Cây tình yêu</p>
                      <p className="italic text-stone-200 leading-relaxed">
                        "Mỗi ngày một chút quan tâm, tình yêu chúng mình sẽ lớn lên xanh tươi."
                      </p>
                    </div>
                  )}

                  {inspectingDecor.id === 'mugs' && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
                      <p className="font-bold">☕ Cốc đôi buổi sáng</p>
                      <p className="italic text-stone-200 leading-relaxed">
                        "Cùng nhau thưởng thức tách cà phê sớm, ấm áp từng khoảnh khắc bắt đầu ngày mới."
                      </p>
                    </div>
                  )}

                  {inspectingDecor.id === 'lamp' && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
                      <p className="font-bold">💡 Đèn ấm áp</p>
                      <p className="italic text-stone-200 leading-relaxed">
                        "Ánh đèn dịu dàng cho những buổi tối ngồi bên nhau sẻ chia mọi điều."
                      </p>
                    </div>
                  )}

                  {inspectingDecor.id === 'vase' && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200 space-y-1">
                      <p className="font-bold">🌷 Bình tulip</p>
                      <p className="italic text-stone-200 leading-relaxed">
                        "Gợi nhớ những đóa hoa thơm ngát của buổi hẹn hò đầu tiên."
                      </p>
                    </div>
                  )}

                  {['album', 'bunting', 'frame'].includes(inspectingDecor.id) && (
                    <div className="p-3.5 rounded-2xl bg-stone-800/80 border border-white/10 text-xs text-stone-200 space-y-2">
                      <p className="font-bold text-amber-300">🖼️ Kỷ niệm gắn trên đồ vật</p>
                      <p className="text-[11px] text-stone-300">
                        Bấm vào ảnh trên tường hoặc danh sách bên dưới để phóng to xem trọn vẹn.
                      </p>
                    </div>
                  )}

                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setInspectingDecor(null)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* 2D Fallback View: Accessible List of Placed Decorations */
        <div className="p-5 space-y-4">
          <MemoryHouse2D rooms={rooms} title={title} theme={theme} activeRoomId={activeRoomId} onSelectRoom={onSelectRoom} onPhoto={onPhoto}/>
          {!readOnly && placingItem && <div className="flex items-center gap-3 text-sm"><span>Đặt {placingAsset?.name} tại vị trí gợi ý trong {room?.name}</span><button type="button" className={button} onClick={() => confirmPlacement()}>Xác nhận đặt</button><button type="button" className={button} onClick={cancelPlacement}>Hủy</button></div>}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-serif font-bold text-white">Danh sách đồ trang trí trong phòng · {room?.name}</h3>
            <span className="text-xs text-amber-300 font-mono">{decorationsList.length} món</span>
          </div>

          {decorationsList.length === 0 ? (
            <p className="text-xs text-stone-400 italic">Chưa có đồ trang trí nào trong phòng này.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {decorationsList.map((d, idx) => {
                const asset = DECORATIONS.find(a => a.id === d.item);
                const instId = d.id || d.slot || idx;
                return (
                  <div key={instId} className="p-3 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <img src={asset?.image} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/15" />
                      <div>
                        <h4 className="text-xs font-bold text-white">{asset?.name || d.item}</h4>
                        <span className="text-[10px] text-amber-200/80">
                          {d.surface === 'table' ? 'Mặt bàn' : d.surface === 'wall' ? 'Tường' : 'Sàn phòng'}
                        </span>
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInstanceId(instId);
                            requestAnimationFrame(() => contentEditor.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
                          }}
                          className={`${button} text-[10px] px-2 py-1`}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(instId)}
                          className="text-rose-400 hover:text-rose-300 text-xs p-1 cursor-pointer"
                          title="Xóa"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

            {/* Personalized Content Editor for Selected Instance */}
            {!readOnly && selectedInstance && selectedAsset && (selectedAsset.textLabel || selectedAsset.photoCount > 0) && (
              <div ref={contentEditor} className="m-3 sm:m-4 rounded-2xl border border-amber-200/25 bg-amber-200/5 p-4 space-y-4 animate-scaleUp" aria-label="Cá nhân hóa đồ vật">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-amber-100 text-sm flex items-center gap-2">
                    <span>Viết chữ / Gắn ảnh · {selectedAsset.name}</span>
                    
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSelectedInstanceId(null)}
                    className="text-stone-400 hover:text-white text-xs cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>

                {selectedAsset.textLabel && (
                  <label className="block text-sm text-slate-300">
                    {selectedAsset.textLabel}
                    <textarea
                      value={selectedInstance.text || ''}
                      maxLength={80}
                      rows={2}
                      placeholder={selectedInstance.item === 'calendar' ? '28.09.2026\nNgày mình có nhau' : 'Minh & An\nNhà là nơi có nhau'}
                      className="mt-2 block w-full rounded-xl border border-white/20 bg-stone-900 p-3 text-white text-base sm:text-sm"
                      onChange={e => {
                        const updated = updateDecorationInstance(room, selectedInstanceId, { text: e.target.value });
                        commitChange(updated, true);
                      }}
                    />
                    <span className="text-[11px] text-stone-400">
                      {(selectedInstance.text || '').length}/80 ký tự · Hiện trên mặt đồ vật; nếu có ảnh, chữ nằm dưới ảnh
                    </span>
                  </label>
                )}

                {Array.from({ length: selectedAsset.photoCount }, (_, index) => {
                  const photoId = selectedInstance.photos?.[index];
                  const photo = room.memories?.find(m => m.id === photoId);
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-3">
                      {photo?.photo_url && (
                        <img src={photo.photo_url} alt={`Ảnh ${index + 1} trên ${selectedAsset.name}`} className="h-16 w-16 rounded-xl object-cover border border-white/10" />
                      )}
                      <label className="flex-1 min-w-32 text-xs text-slate-300">
                        Ảnh {index + 1} trên {selectedAsset.name}
                        <select
                          value={photo?.id || ''}
                          className="mt-1 block w-full rounded-lg border border-white/20 bg-stone-900 p-2 text-white text-base sm:text-sm cursor-pointer"
                          onChange={e => {
                            const updated = setDecorationPhoto(room, selectedInstanceId, selectedInstance.item, index, e.target.value || null);
                            commitChange(updated, true);
                          }}
                        >
                          <option value="">Chưa chọn ảnh</option>
                          {(room.memories || []).map((m, i) => (
                            <option key={m.id} value={m.id}>
                              {m.caption || `Kỷ niệm ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>

                      {onUploadPhoto && (
                        <button
                          type="button"
                          className={button}
                          disabled={uploading || (room.memories?.length || 0) >= 10}
                          onClick={() => chooseUpload({ slot: selectedInstanceId, item: selectedInstance.item, index })}
                        >
                          Tải ảnh {index + 1} lên đồ vật
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
      {/* Rooms selector pills */}
      <div className="px-3 py-3 flex gap-2 overflow-x-auto whitespace-nowrap border-t border-white/5" role="group" aria-label="Chọn phòng trong nhà 3D">
        {rooms.map(r => (
          <button
            key={r.id}
            type="button"
            className={`${button} ${r.id === room?.id ? 'bg-amber-200 text-stone-950 font-bold shadow-md' : 'text-stone-300'}`}
            aria-pressed={r.id === room?.id}
            onClick={() => {
              onSelectRoom?.(r.id);
              engine.current?.focus(r.id, true);
            }}
          >
            {r.name}
          </button>
        ))}
      </div>

      {room?.note && <p className="px-5 pb-4 text-sm italic text-amber-100/80">“{room.note}”</p>}

      {!readOnly && room && (
        <div className="border-t border-white/10 p-4 sm:p-5 space-y-6">
          {/* Gói phong cách một chạm (Style Packages) & Dọn nhà giúp mình */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-serif text-sm font-bold text-amber-300 flex items-center gap-1.5">
                  <span>Gói phong cách một chạm · {room.name}</span>
                </h3>
                <p className="text-[11px] text-stone-400">
                  Áp dụng bộ trang trí có sẵn để bắt đầu nhanh, sau đó bạn có thể tự do di chuyển, xoay, thêm món tùy ý.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(room.memories?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={autoArrangePhotos}
                    className="px-3 py-1.5 rounded-xl bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-semibold cursor-pointer"
                    title="Tự động gắn ảnh trong phòng vào các khung, album và dây ảnh còn trống"
                  >
                    ✦ Dọn nhà giúp mình
                  </button>
                )}
                <button
                  type="button"
                  className={button}
                  disabled={history.past.length === 0}
                  onClick={handleUndo}
                  title="Khôi phục trạng thái trang trí trước đó"
                >
                  Hoàn tác
                </button>
              </div>
            </div>

            {arrangeNotice && (
              <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-200 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold">✦</span>
                  <span>{arrangeNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setArrangeNotice('')}
                  className="text-stone-400 hover:text-white text-xs px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {STYLE_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => { if (!pkg.isPendingAsset) applyStylePackage(pkg); }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    pkg.isPendingAsset
                      ? 'border-white/10 bg-white/[0.01] opacity-60'
                      : 'border-white/15 bg-white/5 hover:border-amber-300/50 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{pkg.name}</span>
                    {pkg.isPendingAsset && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Chờ asset 3D</span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1 line-clamp-2 leading-relaxed">{pkg.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Freeform Decoration Library & Placement */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <div>
                <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                  <span>Trang trí tự do · {room.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono">
                    {decorationsList.length} món
                  </span>
                </h3>
                <p className="text-xs text-stone-400">
                  Chọn món rồi giữ và kéo trên ngôi nhà; thả tay để đặt trên sàn, bàn hoặc ghế.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { cancelPlacement(); setSelectedInstanceId(null); engine.current?.setSelectionHighlight(null); setRemoving(!removing); host.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
                  className={`${button} ${removing ? 'bg-amber-400/20 text-amber-200 border-amber-400/40' : 'text-stone-400'}`}
                  aria-pressed={removing} title="Bật rồi chạm món cần gỡ; dùng Hoàn tác để khôi phục"
                >
                  {removing ? '✓ Đang gỡ đồ' : 'Gỡ đồ bằng chạm'}
                </button>


                {onSave && (
                  <button
                    type="button"
                    className={`${button} bg-amber-200 text-stone-950 font-bold`}
                    disabled={saving}
                    onClick={() => onSave()}
                  >
                    {saving ? 'Đang lưu…' : 'Lưu trang trí'}
                  </button>
                )}
              </div>
            </div>

            {/* Library Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {DECORATIONS.map(d => (
                <button
                  key={d.id}
                  type="button"
                  disabled={status !== 'ready' || view !== '3d'}
                  onClick={() => startPlacement(d.id)}
                  className={`text-left rounded-2xl border p-2 transition-all cursor-pointer relative group ${
                    placingItem === d.id
                      ? 'border-amber-400 bg-amber-400/15 ring-2 ring-amber-400/30'
                      : 'border-white/10 hover:border-amber-300/40 bg-white/[0.02] hover:bg-white/[0.06]'
                  }`}
                >
                  <img
                    loading="lazy"
                    src={d.image}
                    alt=""
                    className="w-full aspect-[4/3] object-cover rounded-xl"
                  />
                  <div className="pt-2 px-1">
                    <span className="block text-xs font-medium text-white truncate">{d.name}</span>
                    <div className="flex items-center justify-between mt-1 text-[10px]">
                      <span className="text-stone-400">
                        {d.defaultSurface === 'table' ? 'Mặt bàn' : d.defaultSurface === 'wall' ? 'Tường' : 'Sàn'}
                      </span>
                      {d.photoCount > 0 && (
                        <span className="text-amber-300 font-semibold">{d.photoCount} ảnh</span>
                      )}
                      {d.textLabel && (
                        <span className="text-indigo-300 font-semibold">Chữ</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>


          </div>
        </div>
      )}

      {/* Supporting Object Deletion Choice Modal */}
      {deleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="w-full max-w-md rounded-2xl border border-amber-200/30 bg-stone-900 p-6 shadow-2xl space-y-4">
            <h3 id="delete-dialog-title" className="text-base font-semibold text-amber-200">
              Vật phẩm này đang đỡ các món đồ bên trên
            </h3>
            <p className="text-xs text-stone-300 leading-relaxed">
              Bạn đang xóa một vật đỡ có <strong className="text-white">{deleteDialog.children.length} món đồ</strong> đặt bên trên ({deleteDialog.children.map(c => DECORATIONS.find(d => d.id === c.item)?.name || c.item).join(', ')}).
              Vui lòng chọn cách xử lý để không làm mất đồ hoặc để đồ lơ lửng:
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => executeDelete(deleteDialog.targetId, { action: 'drop_or_cancel' })}
                className="w-full rounded-xl border border-white/20 bg-stone-800 p-2.5 text-xs text-stone-200 hover:bg-stone-700 text-left transition cursor-pointer"
              >
                🏠 Chuyển các món bên trên sang chỗ trống hợp lệ
              </button>

              <button
                type="button"
                onClick={() => executeDelete(deleteDialog.targetId, { action: 'delete_children' })}
                className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 hover:bg-rose-500/20 text-left transition cursor-pointer"
              >
                🗑️ Xóa cả vật đỡ lẫn toàn bộ đồ bên trên
              </button>

              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="w-full rounded-xl border border-white/10 bg-transparent p-2.5 text-xs text-stone-400 hover:text-white text-center transition cursor-pointer"
              >
                ✕ Hủy thao tác (giữ nguyên tất cả)
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
