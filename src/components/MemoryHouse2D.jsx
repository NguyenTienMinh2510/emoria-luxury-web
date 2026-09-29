import React, {useId} from 'react';
import {DECORATIONS, ROOM_BOUNDS, roomDecorations, getDefaultPosition} from '../services/house3d.js';

// The same room data drives both views; 2D also works without WebGL or model downloads.
export default function MemoryHouse2D({rooms, title, theme, activeRoomId, onSelectRoom, onPhoto}) {
  const uid = useId().replace(/:/g, '');
  const rose = theme === 'rose_romance';
  const accent = rose ? '#b8697d' : '#987344';
  const activate = (event, callback) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); callback(); } };
  return <div className="bg-[#f7eee6] p-3 sm:p-6 text-stone-800" data-testid="memory-house-2d">
    <p className="text-center font-serif text-lg mb-2">{title || 'Ngôi nhà của đôi mình'}</p>
    <svg viewBox="0 0 900 660" className="w-full" aria-label="Ngôi nhà kỷ niệm 2D, chọn phòng hoặc ảnh để xem">
      <defs>
        <linearGradient id={`${uid}-wall`} x2="0" y2="1"><stop stopColor="#fff9ed"/><stop offset="1" stopColor={rose ? '#edc9c4' : '#e4cfac'}/></linearGradient>
        <linearGradient id={`${uid}-roof`} x2="0" y2="1"><stop stopColor={accent}/><stop offset="1" stopColor="#67443e"/></linearGradient>
      </defs>
      <ellipse cx="450" cy="622" rx="410" ry="22" fill="#604639" opacity=".12"/>
      <path d="M55 215 L450 25 L845 215 L825 230 L450 60 L75 230Z" fill={`url(#${uid}-roof)`}/>
      <path d="M94 210 L450 58 L806 210V603H94Z" fill="#ead7c4" stroke="#c2a17f" strokeWidth="10"/>
      <path d="M432 124 C410 98 390 135 432 153 C474 135 454 98 432 124Z" fill={accent} transform="translate(18 0)"/>
      {rooms.map((room, index) => {
        const upper = index >= 3;
        const x = upper ? 108 + (index - 3) * 345 : 108 + index * 230;
        const y = upper ? 202 : 401, width = upper ? 332 : 217, height = 184;
        const bounds = ROOM_BOUNDS[room.id] || ROOM_BOUNDS.beginning;
        const night = room.lighting === 'night';
        const clip = `${uid}-room-${index}`;
        return <g key={room.id}>
          <defs><clipPath id={clip}><rect x={x+3} y={y+3} width={width-6} height={height-6} rx="4"/></clipPath></defs>
          <rect x={x} y={y} width={width} height={height} rx="5" fill={night ? '#665363' : `url(#${uid}-wall)`} stroke={activeRoomId === room.id ? accent : '#ccb399'} strokeWidth={activeRoomId === room.id ? 5 : 2}
            role="button" tabIndex="0" aria-label={`Vào phòng ${room.name}`} onClick={() => onSelectRoom?.(room.id)} onKeyDown={e => activate(e, () => onSelectRoom?.(room.id))} style={{cursor:'pointer'}}/>
          <g clipPath={`url(#${clip})`}>
            <path d={`M${x} ${y+140}h${width}v44h-${width}Z`} fill="#c3a183" pointerEvents="none"/>
            {[1,2,3].map(n => <path key={n} d={`M${x} ${y+140+n*11}h${width}`} stroke="#b38e70" opacity=".6" pointerEvents="none"/>)}
            <text x={x+width/2} y={y+23} textAnchor="middle" fill={night?'#fff3da':'#694b40'} fontSize="13" fontFamily="serif" pointerEvents="none">{room.name}</text>
            {(room.memories || []).slice(0,3).map((memory, photoIndex, photos) => {
              const px = x+width/2+(photoIndex-(photos.length-1)/2)*58-25, py = y+39;
              return <g key={memory.id} role="button" tabIndex="0" aria-label={memory.caption || 'Mở ảnh kỷ niệm'} style={{cursor:'pointer'}}
                onClick={() => memory.photo_url && onPhoto?.(memory.photo_url,memory)} onKeyDown={e => activate(e, () => memory.photo_url && onPhoto?.(memory.photo_url,memory))}>
                <rect x={px} y={py} width="50" height="61" rx="2" fill="#fffcf6" stroke="#c9ab7d"/>
                {memory.photo_url ? <image href={memory.photo_url} x={px+4} y={py+4} width="42" height="43" preserveAspectRatio="xMidYMid slice"/> : <text x={px+25} y={py+32} textAnchor="middle" fill={accent}>♥</text>}
                <text x={px+25} y={py+56} textAnchor="middle" fontSize="6" fill="#745c53">{(memory.caption || 'Đôi mình').slice(0,14)}</text>
              </g>;
            })}
            {roomDecorations(room).map((decor, di) => {
              const asset = DECORATIONS.find(a => a.id === decor.item);
              const p = decor.position || getDefaultPosition(room.id,decor.surface,decor.slot);
              const dx = x+22+Math.max(0,Math.min(1,(p[0]-bounds.x)/bounds.width+.5))*(width-44);
              const dy = y+164-Math.max(0,Math.min(1,(p[1]-bounds.y)/bounds.height))*110;
              const size = Math.min(62, 40*(Number(decor.scale)||1));
              const photo = room.memories?.find(m => m.id === decor.photos?.[0]);
              return <g key={decor.id || decor.slot || di}>
                <title>{asset?.name}{decor.text ? `: ${decor.text}` : ''}</title>
                <image href={asset?.image} x={dx-size/2} y={dy-size} width={size} height={size} preserveAspectRatio="xMidYMid meet" pointerEvents="none"/>
                {photo?.photo_url && <image href={photo.photo_url} x={dx-12} y={dy-size+9} width="24" height="20" preserveAspectRatio="xMidYMid slice" role="button" tabIndex="0" aria-label={photo.caption || 'Xem ảnh trên đồ vật'} style={{cursor:'pointer'}} onClick={() => onPhoto?.(photo.photo_url,photo)} onKeyDown={e => activate(e, () => onPhoto?.(photo.photo_url,photo))}/>}
                {decor.text && <text x={dx} y={dy+9} textAnchor="middle" fontSize="8" fill={night?'#fff3da':'#694b40'} pointerEvents="none">{decor.text.slice(0,26)}</text>}
              </g>;
            })}
          </g>
        </g>;
      })}
      <rect x="80" y="595" width="740" height="15" rx="5" fill="#b99a7c"/>
      <text x="450" y="650" textAnchor="middle" fill={accent} fontSize="13" letterSpacing="4">EMORIA · NHÀ LÀ NƠI CÓ NHAU</text>
    </svg>
    <p className="text-center text-xs text-stone-600">Chạm vào phòng để chọn · Chạm ảnh để mở kỷ niệm</p>
  </div>;
}
