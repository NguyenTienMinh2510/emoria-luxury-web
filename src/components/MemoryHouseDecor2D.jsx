import React, {useId} from 'react';

// Drawn furnishings share a 100 × 100 canvas and rest on y=90.
export default function MemoryHouseDecor2D({item, photos = [], text = '', accent = '#a36f52', onPhoto}) {
  const uid = useId().replace(/:/g, '');
  const cream = '#fff4df', clay = '#c88a70', sage = '#839b79', blush = '#e1acaa';
  const photo = (index, x, y, width, height, outline) => {
    const memory = photos[index], interactive = Boolean(memory?.photo_url && onPhoto);
    return <g key={index} stroke="none" pointerEvents={interactive ? 'auto' : 'none'} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? memory.caption || 'Xem ảnh trên đồ vật' : undefined} style={interactive ? {cursor:'pointer'} : undefined}
      onClick={interactive ? () => onPhoto(memory.photo_url, memory) : undefined}
      onKeyDown={interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPhoto(memory.photo_url, memory); } } : undefined}>
      <defs><clipPath id={`${uid}-photo-${index}`}>{outline ? <path d={outline}/> : <rect x={x} y={y} width={width} height={height} rx="1"/>}</clipPath></defs>
      <g clipPath={`url(#${uid}-photo-${index})`}>
        <rect x={x} y={y} width={width} height={height} fill="#ede0c9"/>
        {memory?.photo_url ? <image href={memory.photo_url} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid slice"/> : <>
          <path d={`M${x} ${y+height}V${y+height*.75}l${width*.28} -${height*.34} ${width*.26} ${height*.25} ${width*.2} -${height*.17} ${width*.26} ${height*.26}v${height}Z`} fill="#9aab92"/>
          <circle cx={x+width*.75} cy={y+height*.25} r={Math.min(width,height)*.1} fill="#d9b879"/>
        </>}
      </g>
    </g>;
  };
  const label = (x, y, max = 15, size = 6) => <text x={x} y={y} textAnchor="middle" fontFamily="Georgia, serif" fontSize={size} fill="#674b3e" stroke="none">{text.slice(0,max)}</text>;
  let drawing;
  switch (item) {
    case 'calendar':
      drawing = <>
        <path d="M76 24l7 6v55l-7 5H24V26Z" fill="#c1a084"/>
        <rect x="22" y="25" width="54" height="61" rx="3" fill={cream}/>
        <path d="M22 38h54" stroke="#cbb398"/>
        <path d="M32 31v-9c0-9 11-9 11 0v9m15 0v-9c0-9 11-9 11 0v9" fill="none" stroke={accent} strokeWidth="3"/>
        {photo(0,29,42,40,28)}
        {text ? label(49,79,18,5.8) : <g stroke="#baa38e">{[34,44,54,64].map(x => <path key={x} d={`M${x} 76h4m-4 5h4`}/>)}</g>}
        <path d="M27 89h49" stroke={accent} strokeWidth="2"/>
      </>;
      break;
    case 'cat':
      drawing = <>
        <ellipse cx="50" cy="83" rx="43" ry="7" fill="#c3a186"/>
        <path d="M8 78c2-18 81-18 85 0v5c-5 10-79 10-85 0Z" fill="#dec3a0"/>
        <ellipse cx="54" cy="67" rx="33" ry="15" fill={cream}/>
        <path d="M24 58l-8-13-6 17c-9 11-2 23 9 23 14 0 21-10 14-20l-2-15Z" fill={cream}/>
        <path d="M13 61l3-9 5 8m6-2 3-3 1 9" fill={blush} stroke="none"/>
        <path d="M13 72l5 1m8 0 5-1m-11 6 3 1 3-2" fill="none"/>
        <path d="M83 67c12 16-24 23-46 10" fill="none" stroke="#d9c6aa" strokeWidth="7"/>
        <path d="M78 78c-10 3-27 3-37 0" fill="none" stroke="#bba28b"/>
      </>;
      break;
    case 'nameplate':
      drawing = <>
        <path d="M13 53l-3 30h81l-5-30Z" fill="#c2a082"/>
        <rect x="11" y="84" width="81" height="6" rx="3" fill="#b88b66"/>
        <rect x="10" y="48" width="78" height="36" rx="2" fill={cream} stroke={accent} strokeWidth="3"/>
        {photos[0]?.photo_url ? <>{photo(0,16,55,19,23)}{label(59,68,12,7)}</> : <>
          <path d="M49 58c-6-7-13 1 0 9 13-8 6-16 0-9Z" fill={blush} stroke="none"/>
          {label(49,77,20,7)}
        </>}
        <path d="M19 85h62" stroke="#e9cbaa"/>
      </>;
      break;
    case 'plant':
      drawing = <>
        <path d="M48 69V20m3 48 16-45M47 68 28 37m23 27 25-14" fill="none" stroke="#6c8565" strokeWidth="2.5"/>
        <ellipse cx="36" cy="28" rx="15" ry="5" transform="rotate(-24 36 28)" fill={sage}/>
        <ellipse cx="68" cy="30" rx="15" ry="5" transform="rotate(-28 68 30)" fill="#a0b28c"/>
        <ellipse cx="31" cy="48" rx="14" ry="5" transform="rotate(24 31 48)" fill="#a0b28c"/>
        <ellipse cx="66" cy="52" rx="16" ry="5" transform="rotate(-24 66 52)" fill={sage}/>
        <path d="M31 63c-6 26 5 27 19 27s25-1 19-27Z" fill={cream}/>
        <ellipse cx="50" cy="63" rx="19" ry="4" fill="#d8c7ad"/>
        <path d="M37 82c4 5 22 5 26 0" fill="none" stroke="#d9bea0"/>
      </>;
      break;
    case 'mugs':
      drawing = <>
        <ellipse cx="50" cy="83" rx="44" ry="7" fill="#d4af88"/>
        <ellipse cx="50" cy="79" rx="44" ry="7" fill="#ead1a9"/>
        <path d="M25 54H16c-13 0-13 24 1 24h8m50-21h9c13 0 13 23-1 23h-8" fill="none" stroke="#b8947b" strokeWidth="6"/>
        <path d="M24 51h26v22c0 12-26 12-26 0Z" fill={cream}/>
        <ellipse cx="37" cy="51" rx="13" ry="5" fill="#8f6e5c"/>
        <path d="M55 55h24v22c0 11-24 11-24 0Z" fill={blush}/>
        <ellipse cx="67" cy="55" rx="12" ry="4.5" fill="#8f6e5c"/>
        <path d="M31 34c-5 5 4 6 0 11m36-7c-4 4 4 5 0 10" fill="none" stroke="#bfa68d"/>
        <path d="M34 63c-4-5-8 1 0 6 8-5 4-11 0-6Z" fill={blush} stroke="none"/>
      </>;
      break;
    case 'lamp':
      drawing = <>
        <ellipse cx="50" cy="85" rx="23" ry="5" fill="#b98f69"/>
        <path d="M28 82c0-27 44-27 44 0-9 8-34 8-44 0Z" fill="#d5ae88"/>
        <path d="M50 70V49" stroke={accent} strokeWidth="5"/>
        <path d="M32 17c10-4 26-4 36 0l12 37c-14 10-46 10-60 0Z" fill={cream}/>
        <path d="M39 22l-6 31m28-31 6 31" stroke="#e1d0b3"/>
        <path d="M21 54c16 6 42 6 58 0" fill="none" stroke="#bda080" strokeWidth="2"/>
        <path d="M72 65v10" fill="none" stroke="#bda080"/>
        <circle cx="72" cy="77" r="2" fill={accent}/>
      </>;
      break;
    case 'vase':
      drawing = <>
        <path d="M47 64 35 17m16 48 16-41m-18 41-1-35m5 35 18-14" fill="none" stroke="#758f67" strokeWidth="2"/>
        <ellipse cx="34" cy="42" rx="14" ry="4" transform="rotate(25 34 42)" fill={sage}/>
        <ellipse cx="66" cy="49" rx="14" ry="4" transform="rotate(-24 66 49)" fill="#a0b28c"/>
        <path d="M34 7c-12 6-11 23 2 24 12-1 15-18 2-24l-1 5Z" fill={blush}/>
        <path d="M65 16c-12 6-11 23 2 24 12-1 15-18 2-24l-1 5Z" fill="#dba2a2"/>
        <path d="M47 23c-12 6-11 23 2 24 12-1 15-18 2-24l-1 5Z" fill="#ebc0b1"/>
        <path d="M37 63c-4 9-10 11-8 18 3 12 39 12 42 0 2-7-4-9-8-18Z" fill={cream}/>
        <ellipse cx="50" cy="63" rx="13" ry="3" fill="#d9c7ac"/>
        <path d="M37 85c6 3 20 3 26 0" stroke="#d5b48e" fill="none"/>
      </>;
      break;
    case 'album':
      drawing = <>
        <path d="M8 53 49 48l45 10-4 27-39 5L7 83Z" fill={blush}/>
        <path d="M12 51 48 47l2 35-38-4ZM51 47l39 9-3 25-36 1Z" fill={cream}/>
        {photo(0,18,54,27,20,'M18 56 43 53l1 20-26 2Z')}
        {photo(1,57,55,25,20,'M58 54 83 59l-2 17-25-1Z')}
        <path d="M50 49v34m-34-3 30 4m10 0 27-1" stroke="#b79888" fill="none"/>
        {label(50,89,22,5)}
      </>;
      break;
    case 'bunting':
      drawing = <>
        <ellipse cx="50" cy="87" rx="45" ry="3" fill="#c4a17e"/>
        <path d="M10 87V26m80 61V32" stroke={accent} strokeWidth="5"/>
        <path d="M11 34Q49 48 89 38" fill="none" stroke="#bd8770"/>
        {[0,1,2].map(index => <g key={index} transform={`translate(${16+index*25} ${40+(index===1?4:0)}) rotate(${index===0?-6:index===2?5:0} 10 0)`}>
          <rect width="20" height="27" rx="1" fill={cream} stroke="#c5b297" strokeWidth=".8"/>
          {photo(index,2,3,16,18)}
          <path d="M9-3v6" stroke="#b69775" strokeWidth="3"/>
          <path d="M5 24h10" stroke="#d9bd9d" strokeWidth=".7"/>
        </g>)}
        {label(50,79,20,5.5)}
      </>;
      break;
    case 'frame':
      drawing = <>
        <path d="M65 55 83 90H66Z" fill="#b98f71"/>
        <rect x="15" y="28" width="69" height="58" rx="2" fill={accent}/>
        <rect x="20" y="33" width="59" height="48" rx="1" fill={cream} stroke="#d0b496"/>
        {photo(0,24,37,51,34)}
        {text ? label(50,78,21,5.5) : <path d="M46 75h8" stroke="#ccb596"/>}
        <path d="M21 87v3m56-3v3" stroke={accent} strokeWidth="3"/>
      </>;
      break;
    case 'birdcage':
      drawing = <>
        <ellipse cx="50" cy="86" rx="28" ry="4" fill="#cfaa79"/>
        <path d="M25 81V45c0-31 50-31 50 0v36Z" fill="#f4e5c7" fillOpacity=".35" stroke="#af9063"/>
        <ellipse cx="50" cy="81" rx="25" ry="5" fill="#dbc19b"/>
        <path d="M29 64h42" stroke={accent} strokeWidth="2"/>
        <path d="M39 64c-6-11 0-19 10-16 3-8 14-5 15 0l5 3-6 2c-2 10-13 18-24 11Z" fill={cream}/>
        <path d="M42 56c6-5 11-1 8 4" fill={sage}/>
        <circle cx="60" cy="48" r="1" fill="#624b3d" stroke="none"/>
        <path d="M33 79V43c0-23 34-23 34 0v36M42 81V37m16 44V37M26 43c9 6 39 6 48 0" fill="none" stroke="#c3a475"/>
        <ellipse cx="50" cy="26" rx="22" ry="5" fill="none" stroke="#c3a475"/>
        <ellipse cx="50" cy="17" rx="6" ry="8" fill="none" stroke="#af9063" strokeWidth="2"/>
      </>;
      break;
    case 'candles':
      drawing = <>
        <ellipse cx="50" cy="85" rx="25" ry="5" fill={cream}/>
        <path d="M50 85V44m-24 9v11l24 6 24-6V53" fill="none" stroke="#b69a6d" strokeWidth="5"/>
        {[{x:20,y:30,h:25},{x:44,y:17,h:26},{x:68,y:33,h:23}].map(({x,y,h}) => <g key={x}>
          <rect x={x} y={y} width="12" height={h} rx="2" fill={blush}/>
          <path d={`M${x+6} ${y}v-4`} stroke="#6b5740" strokeWidth="1"/>
          <path d={`M${x+6} ${y-15}c-8 11-2 13 0 11 5-2 4-6 0-11Z`} fill="#e7b461" stroke="none"/>
          <path d={`M${x+3} ${y+4}v${h-9}`} stroke="#f2d3c8" strokeWidth="1"/>
        </g>)}
        <path d="M34 87h32" stroke="#ddc7a7" fill="none"/>
      </>;
      break;
    default:
      drawing = null;
  }
  return <g fill={cream} stroke="#765746" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{drawing}</g>;
}
