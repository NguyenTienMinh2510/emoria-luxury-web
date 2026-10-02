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
      drawing = <><path d="M22 83V29q-18-18-1-29 17-9 28 6 11-15 28-6 17 11-1 29v54q-14 10-26 0-14 10-28 0Z" transform="translate(0 10) scale(1 .84)" fill={sage}/><rect x="27" y="26" width="46" height="57" rx="3" fill={cream}/><path d="M34 30v-9m16 9v-9m16 9v-9" stroke="#c8a570" strokeWidth="4"/>{photo(0,32,36,36,30)}{text ? label(50,77,18,5.8) : <path d="M36 73h6m5 0h6m5 0h6m-29 5h6m5 0h6m5 0h6" stroke="#b29b81"/>}<path d="M38 89h24" stroke="#b4936d" strokeWidth="4"/></>;
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
      drawing = <><path d="M14 83c-22-14-5-37 9-32-6-25 28-31 34-13 20-19 35 3 27 17 23 10 12 34-5 32Z" fill={cream}/><rect x="25" y="52" width="49" height="28" rx="2" fill="#fffcf4" stroke="#d7c2a4"/>{photos[0]?.photo_url ? <>{photo(0,29,56,17,19)}{label(60,69,10,5.5)}</> : label(50,69,20,6)}<path d="M41 89h20" stroke="#b99a75" strokeWidth="5"/></>;
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
      drawing = <><path d="M70 39h12c17 0 17 34 0 34H70" fill="none" stroke="#b68b57" strokeWidth="8"/><path d="M25 36q-13-21 9-21h23q22 0 9 21v42q-20 10-41 0Z" fill="#b68b57"/><path d="M31 38q-9-15 8-15h14q17 0 8 15v35q-15 7-30 0Z" fill={cream}/><ellipse cx="46" cy="24" rx="13" ry="4" fill="#6c5140"/><rect x="41" y="50" width="13" height="13" rx="3" fill="#e4c77c"/></>;
      break;
    case 'lamp':
      drawing = <><ellipse cx="50" cy="85" rx="20" ry="5" fill={cream}/><path d="M39 81l4-41h14l4 41q-11 10-22 0Z" fill={cream}/><path d="M10 48q10-47 40-43t40 43q-40 18-80 0Z" fill={clay}/>{[{x:29,y:28,r:6},{x:54,y:16,r:5},{x:71,y:32,r:6},{x:45,y:43,r:5}].map(p => <circle key={p.x} cx={p.x} cy={p.y} r={p.r} fill={cream} stroke="none"/>)}</>;
      break;
    case 'vase':
      drawing = <><path d="M43 60 29 22m21 38 13-45m-12 45 23-23" stroke={sage} strokeWidth="2"/>{[{x:29,y:22},{x:63,y:15},{x:74,y:37}].map(p => <g key={p.x} transform={`translate(${p.x} ${p.y})`}>{[0,1,2,3,4,5].map(i => <ellipse key={i} cx="0" cy="-6" rx="3" ry="6" fill={cream} transform={`rotate(${i*60})`}/>)}<circle r="4" fill="#d8b16b"/></g>)}<path d="M30 62h40l4 26H27Z" fill="#d0b58f"/><path d="M30 62l-2-9h44l-2 9Z" fill="#e2ceaa"/><path d="M39 65l-4 18m22-16 8 15" stroke="#b79770" fill="none"/></>;
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
      drawing = <><ellipse cx="50" cy="86" rx="21" ry="4" fill={cream}/><path d="M50 85V68m-19-1h38" stroke="#ad9068" strokeWidth="6"/><path d="M36 62c-16-16-2-28 10-27-4-15 14-24 23-13l10 5-10 4c5 21-12 40-33 31Z" fill={cream}/><path d="M33 42q22-5 16 21-13 3-19-10Z" fill={sage}/><circle cx="66" cy="26" r="1.5" fill="#604a3c" stroke="none"/><path d="M73 27l9 3-9 4" fill="#d2ad6d"/></>;
      break;
    case 'candles':
      drawing = <><ellipse cx="50" cy="84" rx="30" ry="6" fill="#c7a782"/>{[{x:31,y:50,h:31},{x:58,y:31,h:50}].map(p => <g key={p.x}><rect x={p.x-8} y={p.y} width="16" height={p.h} rx="3" fill={cream}/><path d={`M${p.x} ${p.y}v-6`} stroke="#75553a"/><path d={`M${p.x} ${p.y-20}q-11 15 0 15 10 0 0-15Z`} fill="#ddb672" stroke="none"/></g>)}</>;
      break;
    case 'rabbit':
    case 'teddy':
      drawing = <>
        <ellipse cx="50" cy="65" rx="22" ry="24" fill={item === 'rabbit' ? cream : '#bf946a'}/>
        <ellipse cx="50" cy="37" rx="22" ry="19" fill={item === 'rabbit' ? cream : '#bf946a'}/>
        {[-1,1].map(side => <g key={side}>
          <ellipse cx={50+side*21} cy={item === 'rabbit' ? 39 : 19} rx={item === 'rabbit' ? 7 : 8} ry={item === 'rabbit' ? 22 : 8} transform={`rotate(${side*-12} ${50+side*21} 39)`} fill={item === 'rabbit' ? cream : '#bf946a'}/>
          <ellipse cx={50+side*17} cy="83" rx="11" ry="7" fill={item === 'rabbit' ? cream : '#bf946a'}/>
          <circle cx={50+side*7} cy="36" r="1.5" fill="#614537" stroke="none"/>
        </g>)}
        <ellipse cx="50" cy="45" rx="8" ry="5" fill={cream}/><circle cx="50" cy="42" r="2" fill={clay}/>
        {item === 'teddy' ? <><path d="M30 56q20-8 40 0v19q-20 6-40 0Z" fill={sage}/><path d="M38 58v16m8-18v20m8-20v20m8-18v16" stroke="#a9ba9d"/></> : <><path d="M47 58l15 5-13 18Z" fill="#d69b55"/><path d="M54 60l-2-11 7 7 6-8-2 14" fill={sage}/></>}
      </>;
      break;
    case 'cloud-lamp':
      drawing = <><path d="M15 85c-20-20-6-39 7-40-1-24 27-30 40-14 17-7 28 6 26 19 20 8 12 35-2 37Z" fill={cream}/><path d="M39 63q5 5 10 0m10 0q5 5 10 0" fill="none" stroke={clay}/><ellipse cx="51" cy="89" rx="31" ry="2" fill="#d2b58c" stroke="none"/></>;
      break;
    case 'honey-candle':
      drawing = <><path d="M23 37h54v41c0 17-54 17-54 0Z" fill="#d5ac6b"/><ellipse cx="50" cy="37" rx="27" ry="9" fill={cream}/><ellipse cx="50" cy="37" rx="23" ry="6" fill="#ead6a7"/><path d="M50 37v-8" stroke="#644f3a"/><path d="M23 50q27 10 54 0" fill="none" stroke={sage} strokeWidth="3"/><path d="M48 53q-20-15-21 0t21 0q20-15 21 0t-21 0l-8 19m8-19 9 18" fill="none" stroke={cream}/></>;
      break;
    case 'turntable':
      drawing = <><path d="M12 33h76v48q-38 11-76 0Z" fill={sage}/><path d="M12 33l11-10h55l10 10-11 23H23Z" fill="#a4b19a"/><ellipse cx="48" cy="39" rx="24" ry="11" fill="#534b42"/><ellipse cx="48" cy="39" rx="6" ry="3" fill="#d0ad68"/><path d="M73 27l-5 16-11 4" fill="none" stroke="#c9a66c" strokeWidth="4"/><circle cx="71" cy="69" r="5" fill={cream}/><circle cx="83" cy="68" r="3" fill={cream}/></>;
      break;
    case 'camera':
      drawing = <><rect x="17" y="22" width="66" height="53" rx="8" fill={blush}/><rect x="21" y="26" width="15" height="45" rx="5" fill={sage}/><circle cx="51" cy="49" r="18" fill={cream}/><circle cx="51" cy="49" r="12" fill="#c4b18f"/><circle cx="51" cy="49" r="7" fill="#515350"/><rect x="65" y="27" width="10" height="6" rx="2" fill={cream}/><path d="M31 72h43l-6 18H24Z" fill={cream}/><path d="M35 77h33l-3 8H31Z" fill="#e1d4bd"/></>;
      break;
    case 'daisy-rug':
      drawing = <g transform="translate(50 57) scale(1 .62)">{Array.from({length:10},(_,i) => <ellipse key={i} cx="0" cy="-28" rx="13" ry="24" fill={cream} transform={`rotate(${i*36})`}/>)}<circle r="21" fill="#dcb776"/><circle r="16" fill="none" stroke="#ebd198"/></g>;
      break;
    case 'fern':
    case 'vine':
      drawing = <><path d="M28 65h44l-5 23H33Z" fill={cream}/><ellipse cx="50" cy="65" rx="22" ry="5" fill="#6f7155"/>
        {item === 'fern' ? [-2,-1,0,1,2].map(n => <g key={n} transform={`rotate(${n*15} 50 65)`}><path d="M50 65V20" stroke={sage}/>{[0,1,2,3].map(i => <g key={i} fill={sage}><ellipse cx="44" cy={27+i*8} rx="7" ry="3" transform={`rotate(25 44 ${27+i*8})`}/><ellipse cx="56" cy={27+i*8} rx="7" ry="3" transform={`rotate(-25 56 ${27+i*8})`}/></g>)}</g>) : <><path d="M35 64q20-38 31-20t-2 22q-9 12 8 25" fill="none" stroke={sage} strokeWidth="3"/>{[0,1,2,3,4,5].map(i => <ellipse key={i} cx={68+(i%2 ? -5 : 5)} cy={48+i*7} rx="7" ry="4" fill={sage} transform={`rotate(${i%2 ? 25 : -25} 68 ${48+i*7})`}/>)}</>}
      </>;
      break;
    case 'cushion':
      drawing = <><ellipse cx="50" cy="68" rx="39" ry="21" fill={sage}/><path d="M12 65v9c0 26 76 26 76 0v-9" fill={sage}/><ellipse cx="50" cy="65" rx="37" ry="20" fill="#a2b096"/><ellipse cx="50" cy="64" rx="5" ry="2" fill="#718264"/><path d="M20 79q30 14 60 0" fill="none" stroke={cream}/></>;
      break;
    case 'shelf':
      drawing = <><path d="M12 47l9-9h65l5 9v13H12Z" fill="#dcc39f"/><path d="M12 58h79v12q-7 9-13 0-7 10-13 0-7 10-13 0-7 10-13 0-7 10-13 0-7 10-14 0Z" fill="#c5a37d"/><path d="M24 71v15h8V71m44 0v15h8V71" fill="#bc9771"/><path d="M17 47h68" stroke={cream}/></>;
      break;
    case 'sofa':
      drawing = <><path d="M15 67V42q0-14 14-14h43q14 0 14 14v25" fill={cream}/><rect x="9" y="62" width="82" height="21" rx="7" fill={blush}/><rect x="7" y="44" width="14" height="34" rx="7" fill={clay}/><rect x="79" y="44" width="14" height="34" rx="7" fill={clay}/><rect x="22" y="58" width="27" height="15" rx="6" fill={cream}/><rect x="51" y="58" width="27" height="15" rx="6" fill={cream}/><path d="M17 83v7m66-7v7" stroke="#a78761" strokeWidth="5"/></>;
      break;
    case 'coffee-table':
    case 'bistro-table':
      drawing = <>
        {item === 'coffee-table' ? <><path d="M27 63l-5 25m51-25 5 25m-25-26v23" stroke="#b2936c" strokeWidth="7"/><path d="M10 51c4-18 39-26 46-17 16 14 29-5 35 11 8 23-83 34-81 6Z" fill="#d4b790"/><path d="M15 54q38 14 72-5" fill="none" stroke={cream}/></> : <><path d="M50 52v30m-17 5h34m-17-7-11 9m11-9 11 9" stroke={cream} strokeWidth="7"/><ellipse cx="50" cy="48" rx="39" ry="12" fill="#d8bf9b"/><path d="M11 48v4c0 15 78 15 78 0v-4" fill="#c2a47d"/><ellipse cx="50" cy="46" rx="39" ry="11" fill="#e1ccaa"/></>}
      </>;
      break;
    case 'chair':
      drawing = <><path d="M26 62l-3 28m53-28 3 28M29 64l4 24m36-24-3 24" stroke="#b29470" strokeWidth="6"/><path d="M26 30v36m48-36v36" stroke="#b29470" strokeWidth="5"/><path d="M24 30q26-17 52 0v10q-26-15-52 0Z" fill="#d4b992"/><ellipse cx="50" cy="64" rx="29" ry="8" fill={sage}/></>;
      break;
    case 'cubby':
      drawing = <><rect x="15" y="20" width="70" height="68" rx="8" fill="#c7aa85"/><rect x="22" y="26" width="56" height="55" rx="3" fill={cream}/><path d="M50 26v56M22 54h56" stroke="#c7aa85" strokeWidth="6"/><path d="M20 89h60" stroke="#aa8962"/></>;
      break;
    case 'desk':
      drawing = <><path d="M17 52v37m65-37v37M25 55v29m49-29v29" stroke="#ba9871" strokeWidth="5"/><path d="M51 51h30v18H51Z" fill="#bea07b"/><rect x="55" y="53" width="23" height="12" rx="2" fill={sage}/><circle cx="67" cy="59" r="1.8" fill={cream}/><path d="M10 44l7-8h69l6 8v9H10Z" fill="#ddc8a7"/><path d="M12 44h77" stroke={cream}/></>;
      break;
    default:
      drawing = null;
  }
  return <g fill={cream} stroke="#765746" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{drawing}</g>;
}
