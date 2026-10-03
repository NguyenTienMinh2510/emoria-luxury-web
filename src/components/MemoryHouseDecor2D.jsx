import React, {useId} from 'react';

// Vector interpretations of the downloaded Cozy D01–D46 references.
// Furnishings share a 100 × 100 canvas and rest on y=90.
export default function MemoryHouseDecor2D({item, photos = [], text = '', accent = '#a36f52', onPhoto}) {
  const uid = useId().replace(/:/g, '');
  const cream = '#f7efdf', clay = '#c88a70', sage = '#94a585', blush = '#d9b4a7';
  const fill = name => `url(#${uid}-${name})`;
  const wood = fill('wood'), porcelain = fill('cream'), leaf = fill('sage'), pink = fill('pink'), gold = fill('gold');
  const star = (x,y,size=7,color='#d9b478',rotation=0) => <path d="M0-10 3-3 10-3 5 2 6 9 0 5-6 9-5 2-10-3-3-3Z" transform={`translate(${x} ${y}) rotate(${rotation}) scale(${size/10})`} fill={color} stroke="#b79b77" strokeWidth=".7"/>;
  const heartLeaf = (x,y,size,rotation=0) => <path d="M0 12C-25-3-20-22-7-19-2-19 0-15 0-12 3-23 20-24 23-10 26 1 10 8 0 12Z" transform={`translate(${x} ${y}) rotate(${rotation}) scale(${size/24})`} fill={leaf} stroke="#809276" strokeWidth="1"/>;
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
  const label = (x, y, max = 15, size = 6) => <text x={x} y={y} textAnchor="middle" fontFamily="Georgia, serif" fontSize={size} fill={accent} stroke="none">{text.slice(0,max)}</text>;
  let drawing;
  switch (item) {
    case 'calendar':
      drawing = <>
        <path d="M38 88h25l-4-9H43Z" fill={porcelain}/>
        <path d="M50 17C39-1 15 4 13 24 12 32 17 39 24 43 2 49 9 73 28 76 37 78 43 74 48 68l-4 16h13l-5-16c11 16 35 12 37-8 1-9-4-14-13-18 16-10 13-33-6-37-9-2-15 3-20 12Z" fill={porcelain} stroke={sage} strokeWidth="3.5"/>
        <rect x="25" y="26" width="50" height="51" rx="2" fill={pink}/><rect x="27" y="29" width="46" height="47" rx="1" fill={porcelain}/>
        {[34,45,56,67].map(x=><path key={x} d={`M${x} 33v-11q0-5 3-5`} fill="none" stroke="#c5a36b" strokeWidth="3"/>)}
        {photo(0,31,37,38,27)}{text ? label(50,71,18,5) : <path d="M36 69h6m5 0h6m5 0h6" stroke="#c5b294"/>}
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
    case 'capybara':
      drawing = <>
        <path d="M30 84c-22-6-22-33-6-42 10-13 35-16 49-4 23 7 24 35 11 47Z" fill={gold}/>
        <ellipse cx="27" cy="55" rx="20" ry="23" fill={gold}/><ellipse cx="18" cy="63" rx="12" ry="16" fill="#c3a176"/>
        <ellipse cx="38" cy="36" rx="5" ry="6" fill="#c7a576"/><ellipse cx="37" cy="35" rx="2.5" ry="3" fill="#ab8861"/>
        <path d="M31 49q4 5 8 0M15 59l2-1m-3 8 1 9q2 4 5 1" fill="none" stroke="#957556" strokeWidth="1.6"/>
        <ellipse cx="35" cy="83" rx="14" ry="7" fill={gold}/><ellipse cx="77" cy="82" rx="11" ry="7" fill={gold}/>
        <circle cx="31" cy="27" r="9" fill="#dca36b" stroke="#c99362"/><path d="M32 18l-1-6" stroke={sage} strokeWidth="3"/>
        <path d="M32 17q6-14 18-6-5 8-18 6Z" fill={leaf}/>
      </>;
      break;
    case 'corgi':
      drawing = <>
        <path d="M57 35c-5-18 9-20 11-9l-1 10" fill={gold}/>
        <path d="M11 67c-5-17 11-36 31-35 26-4 47 12 48 29 5 28-31 37-39 20C38 95 11 90 11 67Z" fill={gold}/>
        <path d="M50 80c-7-19-21-26-20-38 1-11 15-14 22-5 13-11 29-8 28 3-1 11-21 16-30 40Z" fill={porcelain} stroke="none"/>
        <path d="M15 71q13 13 31 3m10 3q17 11 30-8" fill="none" stroke="#c8a176"/>
      </>;
      break;
    case 'shiba':
      drawing = <>
        <path d="M30 77c-20 3-22-20-11-21 12 0 7 12 1 9" fill="none" stroke="#cba16c" strokeWidth="10"/>
        <path d="M28 87c-8-13-3-26 9-40h27c13 16 15 28 9 40Z" fill={gold}/>
        <path d="M35 29 30 9q7-11 19 14m13 0Q80 1 81 16l-6 22" fill={gold}/>
        <path d="M35 25l-1-10 10 9m23 2 9-11v11" fill={pink} stroke="none"/>
        <ellipse cx="54" cy="36" rx="26" ry="24" fill={gold}/>
        <path d="M29 40c3-15 17-6 24-4 10-6 26-8 27 5 0 16-13 17-26 14-16 6-26 0-25-15Z" fill={porcelain} stroke="none"/>
        <path d="M44 32q4-4 7 0m12 0q4-4 7 0" fill="none" stroke="#7e6148" strokeWidth="2"/>
        <ellipse cx="44" cy="24" rx="3" ry="1.5" fill={cream} stroke="none"/><ellipse cx="66" cy="24" rx="3" ry="1.5" fill={cream} stroke="none"/>
        <path d="M53 39q4-4 8 0-1 6-4 6t-4-6Z" fill="#846248" stroke="none"/>
        <ellipse cx="54" cy="66" rx="11" ry="17" fill={porcelain} stroke="none"/>
        <path d="M44 52h32v24H44Z" fill={pink}/><path d="M44 52 60 64 76 52m-32 24 10-13m22 13-10-13" fill="none" stroke="#bb9386"/>
        <path d="M36 71v13q0 7 11 5l1-14m19-4 1 13q0 7 10 4V74" fill={gold}/>
      </>;
      break;
    case 'duck':
    case 'duckling':
      drawing = item==='duck' ? <>
        <path d="M41 85v-8m18 8v-8" stroke="#d4b777" strokeWidth="8"/>
        <ellipse cx="41" cy="86" rx="12" ry="4" fill={gold}/><ellipse cx="62" cy="86" rx="12" ry="4" fill={gold}/>
        <path d="M25 70c-10-22 3-37 19-38 12-3 23 6 26 8 15-16 22-4 15 15 0 23-45 30-60 15Z" fill={gold}/>
        <ellipse cx="39" cy="29" rx="19" ry="22" fill={gold}/><circle cx="39" cy="27" r="2" fill="#746147" stroke="none"/>
        <path d="M23 28q-12 0-16 7 1 6 17 6 10 0 10-5-2-7-11-8Z" fill={clay}/><path d="M9 37h18" stroke="#b58360"/>
        <path d="M66 49q11-9 15-4 4 4-2 10 8 2-2 8 7 5-5 9-14 1-14-13 0-5 8-10Z" fill={porcelain}/>
      </> : <>
        <ellipse cx="39" cy="85" rx="11" ry="5" fill={clay}/><ellipse cx="59" cy="85" rx="11" ry="5" fill={clay}/>
        <path d="M24 53q-8-22-15-7c-5 8-4 23 7 29 15 15 43 10 53-3 8-12 1-29-12-34Z" fill={gold}/>
        <ellipse cx="54" cy="32" rx="23" ry="24" fill={gold}/><circle cx="57" cy="30" r="2.4" fill="#61543e" stroke="none"/>
        <path d="M72 30q9-1 17 8-1 7-13 6-10-1-9-6Z" fill={clay}/>
        <path d="M23 55c-15-7-17 8-9 18 8 12 22 3 20-8-2-12-6-13-11-10Z" fill={porcelain}/>
      </>;
      break;
    case 'penguin':
      drawing = <>
        <path d="M23 80c-8-24-1-69 27-70s36 41 29 68c-3 15-49 15-56 2Z" fill={leaf}/>
        <path d="M23 48q-14 6-18 21t11 5l14-16m47-10q14 6 18 21t-11 5L70 58" fill={leaf}/>
        <path d="M49 38c-2-21-25-16-21 2l-4 24c-1 21 52 22 52 0l-5-24c4-18-19-23-22-2Z" fill={porcelain}/>
        <circle cx="38" cy="35" r="2" fill="#776e5d" stroke="none"/><circle cx="62" cy="35" r="2" fill="#776e5d" stroke="none"/>
        <ellipse cx="50" cy="43" rx="5" ry="3.5" fill={gold}/><ellipse cx="32" cy="83" rx="10" ry="7" fill={gold} transform="rotate(-12 32 83)"/><ellipse cx="68" cy="83" rx="10" ry="7" fill={gold} transform="rotate(12 68 83)"/>
        <path d="M50 12v8" fill="none" stroke="#aebca1"/>
      </>;
      break;
    case 'nameplate':
      drawing = <><path d="M14 83c-22-14-5-37 9-32-6-25 28-31 34-13 20-19 35 3 27 17 23 10 12 34-5 32Z" fill={cream}/><rect x="25" y="52" width="49" height="28" rx="2" fill="#fffcf4" stroke="#d7c2a4"/>{photos[0]?.photo_url ? <>{photo(0,29,56,17,19)}{label(60,69,10,5.5)}</> : label(50,69,20,6)}<path d="M41 89h20" stroke="#b99a75" strokeWidth="5"/></>;
      break;
    case 'plant':
      drawing = <>
        <path d="M48 66V22m3 44 16-31M47 66 28 40m23 23 25-8" fill="none" stroke="#b99871" strokeWidth="3"/>
        {heartLeaf(49,24,15)}{heartLeaf(28,36,12,-35)}{heartLeaf(71,35,12,30)}{heartLeaf(33,51,11,-45)}{heartLeaf(68,53,11,50)}
        <path d="M28 66c-9 21 1 24 22 24s31-3 22-24Z" fill={pink}/>
        <ellipse cx="50" cy="66" rx="23" ry="7" fill={porcelain}/><ellipse cx="50" cy="66" rx="18" ry="4" fill="#796c53"/>
        <path d="M37 83q13 4 26 0" fill="none" stroke="#e3c7b8"/>
      </>;
      break;
    case 'mugs':
    case 'mugs-jam':
      drawing = <>
        <path d="M72 39h9c15 0 15 35 0 35h-9" fill="none" stroke="#bf955e" strokeWidth="9"/>
        <path d="M19 30q4-14 26-14t28 14v45q0 13-27 13t-27-13Z" fill={porcelain}/><ellipse cx="46" cy="27" rx="26" ry="8" fill="#cabc9b"/><ellipse cx="46" cy="27" rx="22" ry="5" fill="#ddd0b4"/>
        <path d="M22 47q-8-20 12-20h26q20 0 11 20l2 29q0 10-26 10T21 76Z" fill={porcelain} stroke="#bf955e" strokeWidth="4"/>
        {item==='mugs' ? <rect x="39" y="52" width="15" height="15" rx="4" fill="#efdca1" stroke="#dac68c"/> : <path d="M47 49q5-2 8 3 6 0 6 6 4 6-2 10-3 6-10 4-7 2-10-4-6-2-3-10-1-6 5-7 2-5 6-2Z" fill="#c77e78" stroke="#b7756d"/>}
      </>;
      break;
    case 'avocado-mug':
    case 'avocado-mug-cutout':
      drawing = <>
        <path d="M72 36h8c19 0 19 38 0 38H69" fill="none" stroke="#91a47b" strokeWidth="9"/>
        <path d="M19 28h54l4 41c2 27-59 27-59 0Z" fill={leaf}/>
        <ellipse cx="46" cy="28" rx="27" ry="8" fill="#bfc8a0"/><ellipse cx="46" cy="28" rx="22" ry="5" fill="#d1d4ad" stroke="none"/>
        {item==='avocado-mug' ? <>
          <ellipse cx="47" cy="60" rx="14" ry="16" fill={gold} stroke="#bc945e"/>
          <path d="M39 52q2-6 6-5" fill="none" stroke="#e8cf9d" strokeWidth="2"/>
        </> : <>
          <circle cx="47" cy="62" r="15" fill={fill('pit')} stroke="#ac8551" strokeWidth="2"/>
          <path d="M36 70q11 12 23 0" fill="none" stroke="#d9b47c" strokeWidth="2"/>
        </>}
      </>;
      break;
    case 'succulent':
      drawing = <>
        <path d="M71 53h9c20 0 20 28 0 28H67" fill="none" stroke="#e2d4bc" strokeWidth="8"/>
        <path d="M18 48h57v23c0 26-57 26-57 0Z" fill={porcelain}/><ellipse cx="46" cy="48" rx="29" ry="8" fill={porcelain}/><ellipse cx="46" cy="48" rx="23" ry="5" fill="#86705a"/>
        {[[-28,0,13],[-5,-8,15],[20,-3,12],[40,6,13],[-45,10,14],[0,11,14]].map(([angle,dy,height],i)=><path key={i} d={`M0 5Q-14-5 0-${height}Q14-5 0 5Z`} transform={`translate(46 ${41+dy}) rotate(${angle})`} fill={leaf} stroke="#87977a"/>)}
        <path d="M34 44q-7-17 8-20 10 10 9 22m0-2q2-19 15-15 6 13-15 20" fill={leaf}/>
        {[[31,67],[56,78],[68,58]].map(([x,y])=><g key={`${x}-${y}`} transform={`translate(${x} ${y})`} fill={blush} stroke="none">{[0,1,2,3,4].map(i=><ellipse key={i} cy="-2" rx="1.4" ry="2" transform={`rotate(${i*72})`}/>)}<circle r="1" fill="#b89b80"/></g>)}
      </>;
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
        <path d="M10 87V26m80 61V32" stroke="#c3a17a" strokeWidth="5"/>
        <path d="M11 34Q49 48 89 38" fill="none" stroke="#d3b778" strokeWidth="2.5"/>
        {[0,1,2].map(index => <g key={index} transform={`translate(${16+index*25} ${40+(index===1?4:0)}) rotate(${index===0?-6:index===2?5:0} 10 0)`}>
          <rect width="20" height="27" rx="1" fill={cream} stroke="#c5b297" strokeWidth=".8"/>
          {photo(index,2,3,16,18)}
          {star(10,-1,5)}
          <path d="M5 24h10" stroke="#d9bd9d" strokeWidth=".7"/>
        </g>)}
        {label(50,79,20,5.5)}
      </>;
      break;
    case 'frame':
      drawing = <>
        <path d="M66 59 86 90H70Z" fill={wood}/>
        <path d="M20 20Q26 10 32 20Q38 10 44 20Q50 10 56 20Q62 10 68 20Q74 10 80 20Q90 26 80 32Q90 38 80 44Q90 50 80 56Q90 62 80 68Q90 74 80 80Q74 90 68 80Q62 90 56 80Q50 90 44 80Q38 90 32 80Q26 90 20 80Q10 74 20 68Q10 62 20 56Q10 50 20 44Q10 38 20 32Q10 26 20 20Z" fill={gold} stroke="#bfa177"/>
        <rect x="28" y="28" width="44" height="44" rx="2" fill={porcelain} stroke="#c4a57b"/>
        {photo(0,31,31,38,36)}{text&&label(50,76,20,4.5)}
        {[[20,20],[80,20],[20,80],[80,80]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill={porcelain} stroke="#d7c7a9"/>)}
      </>;
      break;
    case 'star-frame':
      drawing = <>
        <path d="M67 62 78 89H63Z" fill={wood}/>
        <path d="M26 15H74Q88 15 88 29V76Q88 89 74 89H26Q12 89 12 76V29Q12 15 26 15ZM27 26Q24 26 24 31V72Q24 78 30 78H70Q76 78 76 72V31Q76 26 70 26Z" fill={wood} fillRule="evenodd"/>
        <path d="M24 31Q50 40 76 31" fill="none" stroke={sage} strokeWidth="2"/>
        <rect x="30" y="37" width="41" height="36" rx="1" fill={porcelain}/>{photo(0,33,41,35,25)}
        {star(38,36,6,'#d8c19a')}{star(63,36,6,'#d8c19a')}{text&&label(51,70,17,4)}
        <path d="M18 28q0-8 10-8m45 64q9 0 9-9" fill="none" stroke="#e5d2b2"/>
      </>;
      break;
    case 'birdcage':
      drawing = <><ellipse cx="50" cy="86" rx="21" ry="4" fill={cream}/><path d="M50 85V68m-19-1h38" stroke="#ad9068" strokeWidth="6"/><path d="M36 62c-16-16-2-28 10-27-4-15 14-24 23-13l10 5-10 4c5 21-12 40-33 31Z" fill={cream}/><path d="M33 42q22-5 16 21-13 3-19-10Z" fill={sage}/><circle cx="66" cy="26" r="1.5" fill="#604a3c" stroke="none"/><path d="M73 27l9 3-9 4" fill="#d2ad6d"/></>;
      break;
    case 'candles':
      drawing = <>
        <path d="M21 43h58v38q0 8-10 8H31q-10 0-10-8Z" fill={porcelain}/><path d="M21 65q29-4 58 0v10q-29 4-58 0Z" fill={pink} stroke="none"/>
        <path d="M20 41q2-9 17-9h27q15 0 16 9l1 11q-6-5-10-1c-7 0-2 19-10 19s-4-20-11-18c-10 13-17 4-22-1-5-4-8 6-8-10Z" fill={porcelain} stroke="#d6c5aa"/>
        <path d="M64 32v-9" stroke="#665348" strokeWidth="1.8"/>
        <path d="M36 31c-9 0-4-19 2-24 6-5 14 20 8 24Z" fill="#ca8a84" stroke="#b97e77"/>
        {[[37,17],[41,22],[34,24],[42,12]].map(([x,y])=><ellipse key={`${x}-${y}`} cx={x} cy={y} rx=".7" ry="1.1" fill="#ecd0ad" stroke="none"/>)}
        <path d="M25 82q25 2 50 0" fill="none" stroke="#e8dcc4"/>
      </>;
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
    case 'pear-lamp':
      drawing = <>
        <path d="M50 27l-2-12" stroke="#b99a61" strokeWidth="5"/><path d="M51 21q4-16 20-10-2 12-20 10Z" fill={leaf}/>
        <path d="M50 24c-18-2-16 19-23 32-17 22-12 33 23 34 35-1 40-12 23-34-7-13-5-34-23-32Z" fill={fill('pear')}/>
        <circle cx="42" cy="53" r="1.6" fill="#a9936c" stroke="none"/><circle cx="59" cy="53" r="1.6" fill="#a9936c" stroke="none"/>
        <ellipse cx="36" cy="58" rx="4" ry="2" fill="#dfc79c" opacity=".6" stroke="none"/><ellipse cx="65" cy="58" rx="4" ry="2" fill="#dfc79c" opacity=".6" stroke="none"/>
      </>;
      break;
    case 'orange-lamp':
      drawing = <>
        <path d="M50 24l-3-11" stroke={sage} strokeWidth="5"/><path d="M50 21q7-14 23-8-8 9-23 8Zm0 0q20-3 24 10-13 2-24-10Z" fill={leaf}/>
        <path d="M50 26c-43-1-50 64 0 64s43-65 0-64Z" fill={fill('orange')}/>
        <circle cx="39" cy="59" r="1.7" fill="#bd8a65" stroke="none"/><circle cx="59" cy="59" r="1.7" fill="#bd8a65" stroke="none"/><ellipse cx="49" cy="62" rx="1.5" ry="1" fill="#bd8a65" stroke="none"/>
        <ellipse cx="31" cy="64" rx="4" ry="2" fill="#d99d7c" opacity=".65" stroke="none"/><ellipse cx="67" cy="64" rx="4" ry="2" fill="#d99d7c" opacity=".65" stroke="none"/>
        <path d="M25 42l1 1m46 9 1 1M34 79l1 1m33-5 1 1" stroke="#e2b577" strokeWidth="1.6"/>
      </>;
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
    case 'snow-globe':
      drawing = <>
        <path d="M23 71h54l4 12q0 7-31 7t-31-7Z" fill={wood}/>
        <circle cx="50" cy="42" r="34" fill="#e5e7db" fillOpacity=".24" stroke="#c9c4b8"/>
        <ellipse cx="50" cy="70" rx="27" ry="5" fill={porcelain}/>
        <path d="M61 60v9m9-8v8" stroke="#b7a283" strokeWidth="3"/>
        <path d="M61 23q-8 9-8 16h4q-10 9-9 15h8q-11 10-4 10h20q7 0-4-10h7q0-6-10-15h4q0-7-8-16Zm11 14q-6 7-6 12h3q-8 7-7 11h6q-8 9-4 9h16q5 0-3-9h5q0-4-8-11h3q0-5-5-12Z" fill={leaf} stroke="#a5b397"/>
        <path d="M31 50h22v19H31Z" fill={porcelain}/><path d="M27 50 42 37 58 50 54 54 42 43 31 54Z" fill={pink}/><path d="M36 69V58h7v11" fill="#d4c3a4"/><rect x="47" y="55" width="4" height="5" rx="1" fill="#cbbfa9"/>
        <path d="M24 32q4-13 15-17m-12 8q-5 8-5 16" fill="none" stroke="#fffaf1" strokeOpacity=".8" strokeWidth="3"/>
        {[[28,61],[61,65],[69,60],[31,34],[68,29]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill={cream} stroke="none"/>)}
        <path d="M24 78q26 5 52 0m-52 6q26 4 52 0" fill="none" stroke="#bd9f78"/>
      </>;
      break;
    case 'star-jar':
    case 'crane-jar':
      drawing = <>
        <path d="M25 27v8q-9 6-9 15v27c0 17 68 17 68 0V50q0-9-9-15v-8Z" fill="#ebe6d8" fillOpacity=".18" stroke="#c4c0b4"/>
        <ellipse cx="50" cy="27" rx="27" ry="7" fill="none" stroke="#c4c0b4" strokeWidth="2.5"/>
        <ellipse cx="50" cy="78" rx="31" ry="7" fill="#e8e0ce" fillOpacity=".25" stroke="#c6c1b4"/>
        {item==='star-jar' ? <>
          {[[33,65,7,blush,-12],[45,70,8,cream,4],[65,68,9,cream,22],[29,57,7,sage,-6],[52,48,9,'#d9b478',9],[60,58,8,sage,25]].map(([x,y,size,color,angle],i)=><g key={i}>{star(x,y,size,color,angle)}<path d={`M${x} ${y-size*.7}v${size*1.2}m0-${size*.5} ${size*.7} ${size*.3}`} fill="none" stroke="#a99678" strokeOpacity=".45" strokeWidth=".6"/></g>)}
        </> : <>
          {[[32,65,cream,-15,.85],[62,64,blush,12,.85],[49,49,sage,4,.8]].map(([x,y,color,angle,size],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
            <path d="M0 13-7-3-18-13-13 4-22 1-10 13 0 16 6-4 9-9 13-4 16-5 10-12 5-10 2 1 19-11 13 8Z" fill={color} stroke="#b6a78c" strokeWidth=".8"/>
            <path d="M-13 4 0 13 13 8M0 13 3 1" fill="none" stroke="#b6a78c" strokeWidth=".7"/>
          </g>)}
        </>}
        <path d="M24 39v30m51-27 2 13M31 27q19-4 37 0" fill="none" stroke="#fffaf1" strokeOpacity=".8" strokeWidth="2"/>
        <ellipse cx="50" cy="84" rx="31" ry="5" fill="none" stroke="#c4c0b4" strokeWidth="1.5"/>
      </>;
      break;
    case 'pinecone':
      drawing = <>
        <path d="M78 44 94 40l1 11-16 9Z" fill="#a58a61"/>
        <path d="M8 64C-1 44 20 29 45 29 82 26 88 66 65 82 45 99 8 85 8 64Z" fill="#a98250"/>
        {[0,1,2,3,4].map(col=><g key={col} transform={`translate(${19+col*13} ${52-col*2}) rotate(${col*5-20})`}>
          {[-1,0,1].map(row=><path key={row} d="M-6-8Q5-20 9-4Q12 11 0 15Q-13 16-6-8Z" transform={`translate(${row%2?3:0} ${row*14}) rotate(${row*28})`} fill={gold} stroke="#b18d5d" strokeWidth=".8"/>)}
        </g>)}
      </>;
      break;
    case 'daisy-rug':
      drawing = <g transform="translate(50 57) scale(1 .62)">{Array.from({length:10},(_,i) => <ellipse key={i} cx="0" cy="-28" rx="13" ry="24" fill={cream} transform={`rotate(${i*36})`}/>)}<circle r="21" fill="#dcb776"/><circle r="16" fill="none" stroke="#ebd198"/><path d="M-10 0q10 -7 20 0" fill="none" stroke="#bfa068" strokeWidth="1.5"/></g>;
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
  return <g fill={cream} stroke="#765746" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"><defs>{Object.entries({wood:['#e3cfad','#b89467'],cream:['#fff9ed','#e3d4bb'],sage:['#aebb9c','#738b65'],pink:['#ebc7bd','#c89e90'],gold:['#e7c38d','#b58c55'],pear:['#eee9aa','#c7ce8e'],orange:['#f0c58c','#d79b63']}).map(([name,colors])=><linearGradient key={name} id={`${uid}-${name}`} x2=".7" y2="1"><stop stopColor={colors[0]}/><stop offset="1" stopColor={colors[1]}/></linearGradient>)}</defs>{drawing}</g>;
}
