import React, {useId} from 'react';
import {DECORATIONS, roomDecorations} from '../services/house3d.js';
import MemoryHouseDecor2D from './MemoryHouseDecor2D.jsx';

const activate = (event, callback) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); callback(); }
};

function RoomScene({room, x=0, y=0, width=340, height=270, active, accent, onSelectRoom, onPhoto}) {
  const uid = useId().replace(/:/g, '');
  const night = room.lighting === 'night';
  const sunset = room.lighting === 'sunset';
  const ink = night ? '#eee2ce' : '#705449';
  const floor = height-65, desk = height-73;
  const decor = roomDecorations(room);
  const lanes = {wall:[], table:[], floor:[]};
  for (const item of decor) {
    const asset = DECORATIONS.find(d => d.id === item.item);
    const surface = item.surface || asset.defaultSurface;
    lanes[surface === 'wall' || surface === 'ceiling' ? 'wall' : surface === 'table' || surface === 'shelf' ? 'table' : 'floor'].push(item);
  }
  // The illustration arranges each surface neatly; saved 3D coordinates remain untouched.
  for (const lane of Object.values(lanes)) lane.sort((a,b) => {
    const original = item => room.decorations?.find(d => d.id ? d.id === item.id : d.slot === item.slot);
    return (original(a)?.position?.[0] || 0) - (original(b)?.position?.[0] || 0);
  });
  const attached = new Set(decor.flatMap(d => d.photos || []));
  const photos = (room.memories || []).filter(m => !attached.has(m.id)).slice(0,3);
  const wallStart=100, wallWidth=width-wallStart-16;
  const wallCount=photos.length+lanes.wall.length;
  const wallCell=wallWidth/Math.max(1,wallCount);
  return <g transform={`translate(${x} ${y})`}>
    <defs>
      <clipPath id={`${uid}-room`}><rect x="4" y="4" width={width-8} height={height-8} rx="6"/></clipPath>
      <linearGradient id={`${uid}-wall`} x2="0" y2="1"><stop stopColor={night ? '#55515e' : '#fffaf0'}/><stop offset="1" stopColor={night ? '#77717c' : sunset ? '#f2d5be' : '#eee2cf'}/></linearGradient>
    </defs>
    <rect width={width} height={height} rx="8" fill={`url(#${uid}-wall)`} stroke={active ? accent : '#cbb89f'} strokeWidth={active ? 4 : 2}
      role="button" tabIndex="0" aria-label={`Vào phòng ${room.name}`} aria-pressed={active} onClick={() => onSelectRoom?.(room.id)} onKeyDown={e => activate(e, () => onSelectRoom?.(room.id))} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-700" style={{cursor:'pointer'}}/>
    <g clipPath={`url(#${uid}-room)`} pointerEvents="none">
      {Array.from({length:Math.ceil(width/22)},(_,i) => <path key={i} d={`M${i*22} 38V${floor}`} stroke={night ? '#b0a6ac' : '#ccb99d'} strokeOpacity=".14"/>)}
      <path d={`M0 ${floor}H${width}V${height}H0Z`} fill={night ? '#8d7770' : '#cbb194'}/>
      {[16,34,53].map(n => <path key={n} d={`M0 ${floor+n}H${width}`} stroke="#95795f" opacity=".26"/>)}
      {[.12,.38,.65,.88].map((n,i) => <path key={n} d={`M${width*n} ${floor+(i%2)*34}v${i%2 ? 31 : 34}`} stroke="#95795f" opacity=".25"/>)}
      <path d={`M0 ${floor}H${width}`} stroke="#ae9273" strokeWidth="5"/>
      <rect x="14" y="14" width={width-28} height="25" rx="4" fill={night ? '#49444f' : '#fffcf5'} opacity=".95"/>
      <text x="25" y="31" fontFamily="Georgia,serif" fontSize="13" fontWeight="600" fill={ink}>{room.name}</text>
      <text x={width-24} y="31" textAnchor="end" fontSize="10" fill={ink} opacity=".7">{room.memories?.length || 0} ảnh</text>

      {/* A recessed window and curtains give the room depth without pasted furniture. */}
      <g stroke="#a48a70" strokeWidth="1.5">
        <rect x="22" y="54" width="60" height="78" rx="27" fill={night ? '#384757' : sunset ? '#efd4c1' : '#c8dfdd'}/>
        {night ? <path d="M64 65a10 10 0 1 0 6 16 11 11 0 0 1-6-16" fill="#fff1c3" stroke="none"/> : <circle cx="65" cy="72" r="9" fill="#f8e6ba" stroke="none"/>}
        <path d="M23 106Q42 90 58 110T81 105V131H23Z" fill={night ? '#617678' : '#a9b9a1'} stroke="none"/>
        <path d="M52 54V132M23 96H81" fill="none" stroke="#fff6e7" strokeWidth="3"/>
        <path d="M18 51Q29 47 36 52L29 137H17ZM68 52Q80 47 87 51L87 137H76Z" fill={night ? '#a69899' : '#e7c5b3'}/>
        <rect x="15" y="133" width="74" height="5" rx="2" fill="#a48a70"/>
      </g>

      {/* Actual memories live inside a drawn gallery frame. */}
      {photos.map((memory,i) => {
        const scale=Math.min(1,wallCell*.88/52);
        const px=wallStart+wallCell*(i+.5)-26*scale, py=120-60*scale;
        const clip=`${uid}-photo-${i}`;
        const open = () => memory.photo_url && onPhoto?.(memory.photo_url,memory);
        return <g key={memory.id || i} transform={`translate(${px} ${py}) scale(${scale})`}>
          <defs><clipPath id={clip}><rect x="5" y="5" width="42" height="43" rx="1"/></clipPath></defs>
          <rect x="2" y="3" width="52" height="60" rx="3" fill="#755d4a" opacity=".12"/>
          <rect width="52" height="60" rx="2" fill="#fff9ef" stroke="#b59a76" strokeWidth="2"/>
          {memory.photo_url ? <g pointerEvents="auto" role="button" tabIndex="0" aria-label={memory.caption || 'Mở ảnh kỷ niệm'} onClick={open} onKeyDown={e => activate(e,open)} style={{cursor:'pointer'}}>
            <image href={memory.photo_url} x="5" y="5" width="42" height="43" clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice"/>
            <rect width="52" height="60" fill="transparent"/>
          </g> : <path d="M26 21c-12-13-23 7 0 19 23-12 12-32 0-19" fill={accent} opacity=".5"/>}
          <path d="M15 54h22" stroke="#bea88e" strokeWidth="1.5"/>
        </g>;
      })}

      {/* Illustrated joinery: one shelf, a credenza and a woven rug. */}
      <rect x={wallStart} y="120" width={wallWidth} height="5" rx="2" fill="#b29472"/>
      <path d={`M${wallStart+16} 125v8M${width-32} 125v8`} stroke="#957255" strokeWidth="3"/>
      <ellipse cx={width/2} cy={height-28} rx={width*.28} ry="17" fill={night ? '#aa8984' : '#e6c3ad'} stroke="#b89b83"/>
      <ellipse cx={width/2} cy={height-28} rx={width*.25} ry="13" fill="none" stroke="#f4ded0" strokeWidth="2"/>
      <g fill={night ? '#a48b76' : '#bd9c78'} stroke="#947358" strokeWidth="1.5">
        <rect x={width*.24} y={desk+5} width={width*.56} height="30" rx="3"/>
        <path d={`M${width*.25} ${desk+35}v15M${width*.78} ${desk+35}v15M${width*.52} ${desk+6}v27`} fill="none" strokeWidth="4"/>
        <rect x={width*.22} y={desk} width={width*.60} height="6" rx="2" fill="#dac2a3"/>
        <path d={`M${width*.35} ${desk+20}h15M${width*.65} ${desk+20}h15`} stroke="#f8e6ca" strokeWidth="2"/>
      </g>
      {!lanes.floor.length && <g transform={`translate(28 ${height-64})`} stroke="#a98c74" strokeWidth="1.5"><path d="M1 13Q3 0 17 0H59Q71 0 72 13V32H1Z" fill="#d7b4a4"/><rect x="1" y="20" width="72" height="17" rx="6" fill="#e6cbbc"/><path d="M8 36v9M65 36v9" strokeWidth="4"/><path d="M36 3v17"/><rect x="8" y="7" width="20" height="14" rx="5" fill="#e7daca"/></g>}

      {Object.entries(lanes).map(([surface,items]) => items.map((item,i) => {
        const asset=DECORATIONS.find(d => d.id === item.item);
        const scale=Array.isArray(item.scale) ? item.scale[1] : item.scale;
        const area=surface === 'table' ? width*.54 : surface === 'wall' ? wallWidth : width-36;
        const size=Math.min(surface === 'wall' ? 67 : 76, surface === 'wall' ? wallCell*.88 : area/Math.max(1,items.length), 64*Math.max(.55,Math.min(1.4,Number(scale)||1)));
        const cx=surface === 'wall' ? wallStart+wallCell*(photos.length+i+.5) : surface === 'floor' && items.length <= 2 ? (i === 0 ? 48 : width-48) : (width-area)/2+area*(i+.5)/items.length;
        const baseline=surface === 'wall' ? 120 : surface === 'table' ? desk+1 : height-12;
        const memories=(item.photos || []).map(id => room.memories?.find(m => m.id === id));
        return <g key={item.id || item.slot || i} data-decoration={item.item} data-surface={surface} transform={`translate(${cx-size/2} ${baseline-size*.9}) scale(${size/100})`}>
          <title>{`${asset.name}${item.text ? `: ${item.text}` : ''}`}</title>
          <MemoryHouseDecor2D item={item.item} photos={memories} text={item.text} accent={accent} onPhoto={onPhoto}/>
        </g>;
      }))}
    </g>
  </g>;
}

// Both views share saved room data. All furniture is drawn SVG, with no WebGL dependency.
export default function MemoryHouse2D({rooms=[], title, theme, activeRoomId, onSelectRoom, onPhoto}) {
  const uid=useId().replace(/:/g,'');
  const accent=theme === 'rose_romance' ? '#b57780' : '#9c7350';
  const current=rooms.find(r => r.id === activeRoomId) || rooms[0];
  const props={accent,onSelectRoom,onPhoto};
  return <div className="overflow-hidden rounded-2xl bg-[#f7f1e8] p-3 sm:p-5 text-stone-800" data-testid="memory-house-2d">
    <div className="mb-3 text-center"><p className="text-[9px] uppercase tracking-[.24em] text-stone-500">Một góc bình yên</p><p className="mt-1 font-serif text-lg sm:text-xl">{title || 'Ngôi nhà của đôi mình'}</p></div>
    <svg viewBox="0 0 1160 880" className="hidden w-full md:block" aria-label="Ngôi nhà kỷ niệm 2D, chọn phòng hoặc ảnh để xem">
      <defs><linearGradient id={`${uid}-roof`} x2="0" y2="1"><stop stopColor="#bb8d78"/><stop offset="1" stopColor="#94695a"/></linearGradient></defs>
      <g pointerEvents="none" strokeLinejoin="round">
        <ellipse cx="580" cy="826" rx="538" ry="20" fill="#6b5142" opacity=".10"/>
        <rect x="930" y="99" width="55" height="97" rx="3" fill="#d1af96" stroke="#a7846f" strokeWidth="3"/>
        <path d="M922 99h72v14h-72Z" fill="#b39078"/>
        <path d="M36 251L580 40l544 211-13 24L580 72 49 275Z" fill={`url(#${uid}-roof)`} stroke="#81594d" strokeWidth="3"/>
        {[0,1,2,3].map(i => <path key={i} d={`M${135+i*100} ${215-i*40}L580 ${83+i*31}l${445-i*100} ${132-i*9}`} fill="none" stroke="#dfb4a1" strokeWidth="2" opacity=".5"/>)}
        <path d="M59 256L580 75l521 181V810H59Z" fill="#d8c2a6" stroke="#b89b7b" strokeWidth="7"/>
        <path d="M72 254L580 89l508 165" fill="#eee3d1" stroke="#c7ac8c" strokeWidth="3"/>
        <circle cx="580" cy="181" r="38" fill="#f8f1e5" stroke="#c6a787" strokeWidth="5"/>
        <path d="M580 170c-22-25-43 14 0 35 43-21 22-60 0-35" fill={accent} opacity=".8"/>
        <path d="M68 532h1024M68 801h1024" stroke="#b09372" strokeWidth="14"/>
        <rect x="45" y="803" width="1070" height="18" rx="6" fill="#b79979"/>
        <path d="M23 801Q24 718 39 679M1137 801Q1136 718 1121 679" fill="none" stroke="#9fa889" strokeWidth="3"/>
        {[0,1,2].map(i => <g key={i} fill="#a8b395"><ellipse cx={25+i*5} cy={773-i*30} rx="8" ry="18" transform={`rotate(-35 ${25+i*5} ${773-i*30})`}/><ellipse cx={1135-i*5} cy={773-i*30} rx="8" ry="18" transform={`rotate(35 ${1135-i*5} ${773-i*30})`}/></g>)}
      </g>
      {rooms.slice(0,5).map((room,index) => <RoomScene key={room.id} room={room} x={index < 3 ? 76+index*341 : 76+(index-3)*513} y={index < 3 ? 545 : 270} width={index < 3 ? 326 : 497} height={250} active={room.id === current?.id} {...props}/>)}
      <text x="580" y="862" textAnchor="middle" fill={accent} fontSize="12" letterSpacing="4">EMORIA · NHÀ LÀ NƠI CÓ NHAU</text>
    </svg>
    {current && <svg viewBox="-8 -8 376 294" className="w-full md:hidden" aria-label={`Cận cảnh phòng ${current.name} trong ngôi nhà 2D`}><RoomScene room={current} width={360} height={278} active {...props}/></svg>}
    <p className="mt-3 text-center text-xs text-stone-600">Chạm ảnh trong khung để mở kỷ niệm<span className="hidden md:inline"> · Chạm phòng để ghé thăm</span></p>
  </div>;
}
