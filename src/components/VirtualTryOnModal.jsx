import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Camera,ShoppingBag,RotateCcw,ShieldCheck,Download,Check,Ruler} from 'lucide-react';
import {useLanguage} from '../i18n/LanguageProvider';
import {apiRequest} from '../services/apiClient.js';
import {NecklaceTracker} from '../services/arNecklaceTracker.js';
import {HandTracker} from '../services/arHandTracker.js';
import {tryOnConfig} from '../services/tryOnConfig.js';
import ARFramingGuide from './ARFramingGuide.jsx';
import ARVisualCaliper from './ARVisualCaliper.jsx';
import JewelrySizeGuideModal from './JewelrySizeGuideModal.jsx';

const ringNiMap = { 16: 'Ni 10', 17: 'Ni 13', 18: 'Ni 16', 19: 'Ni 19' };

function getNiLabel(d) {
  const num = Number(d);
  if (num < 15.3) return 'Ni 7-8';
  if (num < 15.8) return 'Ni 9';
  if (num < 16.3) return 'Ni 10';
  if (num < 16.8) return 'Ni 11-12';
  if (num < 17.3) return 'Ni 13';
  if (num < 17.8) return 'Ni 14-15';
  if (num < 18.3) return 'Ni 16';
  if (num < 18.8) return 'Ni 17-18';
  if (num < 19.3) return 'Ni 19';
  return 'Ni 20+';
}

export default function VirtualTryOnModal({product,settings,onClose,onAddToCart,initialSize}){
  const {t}=useLanguage(),video=useRef(),canvas=useRef(),engine=useRef(),dialog=useRef(),alive=useRef(true),close=useRef(onClose);
  close.current=onClose;
  const [config,setConfig]=useState(null),[status,setStatus]=useState('intro'),[error,setError]=useState(''),[loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
  const [length,setLength]=useState(45),[scale,setScale]=useState(1),[offset,setOffset]=useState(0),[manual,setManual]=useState(false),[added,setAdded]=useState(false),[photo,setPhoto]=useState(null);
  const [trySize,setTrySize]=useState(17),[selectedFinger,setSelectedFinger]=useState('ring');
  const [showGuide,setShowGuide]=useState(true);
  const [showSizeGuide,setShowSizeGuide]=useState(false);
  const [showCaliperHUD,setShowCaliperHUD]=useState(true);
  const [size,setSize]=useState(initialSize||product.variants?.find(v=>v.stock>0)?.size||'');
  const variant=product.variants?.find(v=>v.size===size),canBuy=!!onAddToCart&&settings?.sales_enabled&&product.active&&variant?.stock>0;
  const active=['tracking','searching','loading-model','manual','manual-fallback'].includes(status);
  const isHand = config?.type === 'ring' || config?.type === 'bracelet';

  useEffect(()=>{
    alive.current=true;const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();
    const key=e=>{
      if(e.key==='Escape'){e.stopPropagation();close.current();}
      if(e.key==='Tab'){
        const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href]')].filter(n=>n.getClientRects().length);
        const first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first?.focus();}
      }
    };
    const pause=()=>{if(document.hidden&&engine.current){engine.current.stop();engine.current=null;setStatus('paused');}};
    document.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',pause);
    return()=>{alive.current=false;engine.current?.stop();document.body.style.overflow=overflow;document.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',pause);previous?.focus();};
  },[]);

  useEffect(()=>{
    let cancelled=false;setLoadError(false);setError('');
    const applyConfig = data => {
      setConfig(data);
      if(data?.defaultLength)setLength(data.defaultLength);
      if(data?.defaultSize)setTrySize(data.defaultSize);
      if(data?.finger)setSelectedFinger(data.finger);
    };
    apiRequest('/products/'+encodeURIComponent(product.id)+'/try-on').then(data=>{
      if(!cancelled){
        applyConfig(data);
      }
    }).catch(()=>{
      if(!cancelled){
        const fallback = tryOnConfig(product.id, product);
        if(fallback){
          applyConfig(fallback);
        } else {
          setLoadError(true);
        }
      }
    });
    return()=>{cancelled=true;};
  },[product.id,retry]);

  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo);},[photo]);

  useEffect(()=>{
    if(!engine.current)return;
    if(isHand){
      engine.current.setOptions({size:trySize,scale:1,offset,finger:selectedFinger});
    }else{
      engine.current.setOptions({length,scale:1,offset});
    }
  },[length,trySize,selectedFinger,offset,isHand,config?.type]);

  async function start(){
    if(!config||status==='starting')return;
    engine.current?.stop();setError('');setStatus('starting');setManual(false);
    const onStateChange = next => {
      if(alive.current){
        setStatus(next);
        if(next==='manual-fallback')setManual(true);
      }
    };
    const tracker = isHand
      ? new HandTracker(video.current, canvas.current, config, onStateChange)
      : new NecklaceTracker(video.current, canvas.current, config, onStateChange);

    engine.current=tracker;
    if(isHand){
      tracker.setOptions({size:trySize,scale:1,offset,finger:selectedFinger});
    }else{
      tracker.setOptions({length,scale:1,offset});
    }

    try{await tracker.start();}catch(e){
      if(!alive.current||engine.current!==tracker)return;
      setStatus('error');setError(e.name==='Unsupported3DError'?t('Thiết bị chưa bật WebGL2 để thử model 3D. Hãy bật tăng tốc đồ họa hoặc dùng trình duyệt khác.','WebGL2 is unavailable. Enable hardware acceleration or try another browser.'):e.name==='ModelLoadError'?t('Chưa tải được model 3D. Hãy kiểm tra kết nối rồi thử lại.','Could not load the 3D model. Check your connection and retry.'):e.name==='NotAllowedError'?t('Camera chưa được cấp quyền. Cho phép camera trong cài đặt trình duyệt rồi thử lại.','Camera permission was denied. Allow camera access in browser settings and try again.'):e.name==='NotFoundError'?t('Không tìm thấy camera trên thiết bị.','No camera was found on this device.'):e.name==='NotReadableError'?t('Camera đang được ứng dụng khác sử dụng. Đóng ứng dụng đó rồi thử lại.','Camera is in use by another app. Close it and retry.'):t('Không mở được camera. Hãy thử Safari hoặc Chrome qua HTTPS.','Camera could not start. Try Safari or Chrome over HTTPS.'));
    }
  }

  async function capture(){
    try{
      const blob=await engine.current.snapshot();
      if(alive.current)setPhoto(URL.createObjectURL(blob));
    }catch{
      setError(isHand?t('Chờ nhận diện bàn tay hoặc chọn căn chỉnh thủ công trước khi chụp.','Wait for hand tracking or switch to manual placement before capturing.'):t('Chờ nhận diện vai hoặc chọn căn chỉnh thủ công trước khi chụp.','Wait for shoulder tracking or switch to manual placement before capturing.'));
    }
  }

  const labels={
    intro: config?.type==='ring'?t('Gương trải nghiệm nhẫn','Your ring mirror'):config?.type==='bracelet'?t('Gương trải nghiệm vòng tay','Your bracelet mirror'):t('Gương trải nghiệm trang sức','Your jewelry mirror'),
    starting: t('Đang mở camera…','Opening camera…'),
    'loading-model': t('Đang tải bộ nhận diện trên thiết bị…','Loading on-device tracking…'),
    tracking: isHand?(config?.type==='bracelet'?t('Đã nhận diện cổ tay','Wrist detected'):t('Đã nhận diện bàn tay','Hand detected')):t('Đã nhận diện vai & cổ','Shoulders & neck detected'),
    searching: isHand?(config?.type==='bracelet'?t('Giơ cổ tay và bàn tay trước camera','Show your wrist and hand to the camera'):t('Giơ bàn tay trước camera, xòe nhẹ các ngón tay','Show your hand facing the camera, spread fingers slightly')):t('Lùi nhẹ để camera thấy cả hai vai','Step back until both shoulders are visible'),
    manual: t('Căn chỉnh thủ công','Manual placement'),
    'manual-fallback': t('Thiết bị chưa chạy được nhận diện tự động. Bạn vẫn có thể căn chỉnh thủ công.','Automatic tracking is unavailable here. You can still adjust placement manually.'),
    paused: t('Camera đã tắt khi rời trang','Camera stopped while the page was hidden'),
    error: t('Camera chưa sẵn sàng','Camera unavailable')
  };

  const previewImage = product.image || product.image_url || product.images?.[0] || config?.referenceImage || (config?.type==='ring'?'/assets/product_horizon.png':config?.type==='bracelet'?'/assets/product_pulse.png':'/assets/catalog/emoria-faith.png');

  return createPortal(<div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-2 sm:p-5 flex items-center justify-center" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section translate="no" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tryon-title" className="notranslate w-full max-w-5xl max-h-[96dvh] overflow-y-auto rounded-3xl bg-[#101216] border border-white/15 text-slate-100 shadow-2xl outline-none">
      <header className="sticky top-0 z-10 bg-[#101216] px-5 py-3 flex items-center justify-between border-b border-white/10">
        <div>
          <p className="text-[10px] uppercase tracking-[.25em] text-amber-100/70">
            EMORIA · {config?.type==='ring'?'AR RING EXPERIENCE':config?.type==='bracelet'?'AR BRACELET EXPERIENCE':'AR JEWELRY EXPERIENCE'}
          </p>
          <h2 id="tryon-title" className="font-serif text-xl">{product.name}</h2>
        </div>
        <button onClick={onClose} aria-label={t('Đóng gương AR','Close AR mirror')} className="min-w-11 min-h-11 grid place-items-center rounded-full hover:bg-white/10"><X/></button>
      </header>
      <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative bg-[#0b0d12] min-h-[400px] md:min-h-[540px] flex items-center justify-center overflow-hidden rounded-2xl m-3 border border-white/10 shadow-2xl">
          {/* Interactive AR Visual Digital Caliper & Metric Ruler Overlay */}
          <ARVisualCaliper
            type={config?.type || 'necklace'}
            length={length}
            setLength={setLength}
            trySize={trySize}
            setTrySize={setTrySize}
            getNiLabel={getNiLabel}
            showCaliper={showCaliperHUD}
            onToggleCaliper={() => setShowCaliperHUD(prev => !prev)}
            onOpenScreenCaliper={() => setShowSizeGuide(true)}
            t={t}
            isLive={active}
          />

          <div className="relative w-full h-full flex items-center justify-center">
            <video ref={video} playsInline muted autoPlay aria-hidden="true" className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"/>
            <canvas ref={canvas} aria-label={t('Gương AR trực tiếp','Live AR mirror')} className={`max-w-full max-h-[65dvh] md:max-h-[75dvh] w-auto h-auto object-contain rounded-xl block ${active?'':'invisible'}`}/>
            {active && (
              <ARFramingGuide
                type={config?.type || 'necklace'}
                status={status}
                selectedFinger={selectedFinger}
                showGuide={showGuide}
                onToggleGuide={() => setShowGuide(prev => !prev)}
                t={t}
              />
            )}
          </div>
          {!active&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-gradient-to-b from-[#131720] via-[#0b0d13] to-black text-center z-10">
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl bg-white/[0.04] border border-white/15 p-3 shadow-[0_12px_35px_rgba(0,0,0,0.8)] flex items-center justify-center backdrop-blur-md overflow-hidden group">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-400/20 via-amber-200/10 to-transparent blur-lg opacity-70 group-hover:opacity-100 transition-opacity" />
              <img src={previewImage} alt={product.name} className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.7)] group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="space-y-1">
              <p className="font-serif text-2xl text-amber-100/90 tracking-wide">{labels[status]}</p>
              <p className="text-[11px] uppercase tracking-widest text-amber-200/60 font-medium">EMORIA LUXURY AR MIRROR</p>
            </div>
            <p className="text-sm text-slate-400 max-w-sm">
              {isHand?(config?.type==='bracelet'?t('Giơ cổ tay hướng về camera ở nơi đủ sáng.','Show your wrist facing the camera in good lighting.'):t('Giơ mu bàn tay về phía camera, xòe nhẹ các ngón tay ở nơi đủ sáng.','Show the back of your hand to the camera with fingers spread slightly.')):t('Để camera thấy khuôn mặt và cả hai vai. Thử ở nơi đủ sáng, với nền đơn giản.','Show your face and both shoulders. Use good lighting and a simple background.')}
            </p>
          </div>}
          {active&&<div className="absolute left-3 right-3 bottom-3 rounded-xl px-3 py-1.5 bg-black/80 text-xs text-center border border-white/10 shadow-lg z-20 backdrop-blur-sm pointer-events-none" role="status">{labels[status]}</div>}
        </div>
        <div className="p-5 space-y-4">
          <p className="flex gap-2 text-xs text-slate-300"><ShieldCheck className="w-5 shrink-0 text-emerald-300"/>{t('Hình camera chỉ xử lý trên thiết bị, không tải lên máy chủ. Camera tắt khi đóng gương hoặc rời trang.','Camera images stay on your device. Camera stops when you close the mirror or leave the page.')}</p>
          {loadError&&<div role="alert" className="text-sm text-amber-200">{t('Chưa tải được cấu hình AR cho sản phẩm.','Could not load this product’s AR configuration.')} <button className="underline min-h-11" onClick={()=>setRetry(n=>n+1)}>{t('Thử lại','Retry')}</button></div>}
          {error&&<p role="alert" className="text-sm text-amber-200">{error}</p>}
          {!active&&<button disabled={!config||status==='starting'} onClick={start} className="w-full min-h-12 rounded-xl bg-white text-black font-semibold disabled:opacity-40 flex items-center justify-center gap-2 shadow-silver-glow"><Camera size={18}/>{status==='starting'?t('Đang mở…','Starting…'):t('Bật camera để trải nghiệm','Start camera')}</button>}
          {active&&<>
            {/* Necklace controls */}
            {config?.type==='necklace'&&<div className="space-y-3">
              <fieldset>
                <div className="flex items-center justify-between mb-2">
                  <legend className="text-sm font-semibold text-slate-200">
                    {t('Chiều dài dây chuyền (Độ rủ AR)','Necklace length (AR drop)')}
                  </legend>
                  <span className="text-xs font-bold text-amber-200">{length} cm</span>
                </div>
                <div className="flex gap-2 mb-2.5">
                  {[
                    {l:40,label:'40 cm',sub:t('Sát cổ','Choker')},
                    {l:45,label:'45 cm',sub:t('Tiêu chuẩn','Standard')},
                    {l:50,label:'50 cm',sub:t('Dáng dài','Plunge')}
                  ].map(({l,label,sub})=>(
                    <button
                      key={l}
                      type="button"
                      aria-pressed={length===l}
                      onClick={()=>setLength(l)}
                      className={`flex-1 min-h-11 rounded-xl border text-xs flex flex-col items-center justify-center p-1 transition-all ${length===l?'bg-white text-black font-bold shadow-sm':'border-white/20 text-slate-300 hover:bg-white/5'}`}
                    >
                      <span>{label}</span>
                      <span className={`text-[10px] ${length===l?'text-black/70':'text-slate-400'}`}>{sub}</span>
                    </button>
                  ))}
                </div>

                {/* Micro-Adjustment Stepper & Slider */}
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Ruler size={13} className="text-amber-300" />
                      {t('Thước tinh chỉnh độ rủ (±1 cm):', 'Fine-tune hang drop (±1 cm):')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={()=>setLength(l=>Math.max(36,l-1))}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                        title={t('Thu ngắn 1 cm','Shorten 1 cm')}
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-amber-200 text-xs px-1">
                        {length} cm
                      </span>
                      <button
                        type="button"
                        onClick={()=>setLength(l=>Math.min(54,l+1))}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                        title={t('Kéo dài 1 cm','Extend 1 cm')}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="36"
                    max="54"
                    step="1"
                    value={length}
                    onChange={e=>setLength(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg bg-slate-800 accent-amber-300 cursor-pointer"
                    aria-label="Necklace length fine tuning slider"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>36 cm (Choker ngắn)</span>
                    <span>45 cm (Tiêu chuẩn)</span>
                    <span>54 cm (Dáng dài)</span>
                  </div>
                </div>
              </fieldset>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{t('Độ rủ dây:','Hang drop:')}</span>
                  <span className="font-semibold text-amber-200">
                    {length<=42?t('Chạm xương quai xanh (Sát cổ)','On collarbone (Choker)'):length<=47?t('Ngang ngực trên (Tiêu chuẩn)','Mid-chest (Standard)'):t('Dáng dài thanh thoát (Matinee)','Plunge drop (Matinee)')}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
                  <span>{t('Mặt charm NFC: Ø12mm x 3.5mm','NFC Charm: Ø12mm x 3.5mm')}</span>
                  <span>{t('+5cm xích phụ tăng đơ','+5cm extension included')}</span>
                </div>
              </div>
            </div>}

            {/* Ring controls */}
            {config?.type==='ring'&&<div className="space-y-3">
              <fieldset>
                <div className="flex items-center justify-between mb-2">
                  <legend className="text-sm font-semibold text-slate-200">
                    {t('Kích thước nhẫn theo sản phẩm','Ring size from product specs')}
                  </legend>
                  <span className="text-xs font-bold text-amber-200">{Number(trySize).toFixed(1)} mm · {getNiLabel(trySize)}</span>
                </div>
                <div className="flex gap-2 mb-2.5">
                  {config.previewSizes?.map(s=>(
                    <button
                      key={s}
                      type="button"
                      aria-pressed={Math.abs(trySize-s)<0.1}
                      onClick={()=>setTrySize(s)}
                      className={`flex-1 min-h-11 rounded-xl border text-xs flex flex-col items-center justify-center p-1 transition-all ${Math.abs(trySize-s)<0.1?'bg-white text-black font-bold shadow-sm':'border-white/20 text-slate-300 hover:bg-white/5'}`}
                    >
                      <span>{s} mm</span>
                      <span className={`text-[10px] ${Math.abs(trySize-s)<0.1?'text-black/70':'text-slate-400'}`}>{ringNiMap[s]||`Ni ${s}`}</span>
                    </button>
                  ))}
                </div>

                {/* Micro-Adjustment Stepper & Slider */}
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Ruler size={13} className="text-amber-300" />
                      {t('Thước tinh chỉnh vi mô (±0.2 mm):', 'Micro-tune diameter (±0.2 mm):')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={()=>setTrySize(s=>Math.max(14.5,Number((s-0.2).toFixed(1))))}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                        title={t('Giảm 0.2 mm','Decrease 0.2 mm')}
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-amber-200 text-xs px-1">
                        {Number(trySize).toFixed(1)} mm
                      </span>
                      <button
                        type="button"
                        onClick={()=>setTrySize(s=>Math.min(21.0,Number((s+0.2).toFixed(1))))}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                        title={t('Tăng 0.2 mm','Increase 0.2 mm')}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="14.5"
                    max="21.0"
                    step="0.1"
                    value={trySize}
                    onChange={e=>setTrySize(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg bg-slate-800 accent-amber-300 cursor-pointer"
                    aria-label="Ring diameter fine tuning slider"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>14.5 mm (Ni 7)</span>
                    <span>17.0 mm (Chuẩn nữ)</span>
                    <span>18.0 mm (Chuẩn nam)</span>
                    <span>21.0 mm (Ni 22)</span>
                  </div>
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-xs text-slate-400 mb-1">{t('Ngón tay đeo nhẫn','Target finger')}</legend>
                <div className="flex gap-1.5">
                  {[['index',t('Ngón trỏ','Index')],['middle',t('Ngón giữa','Middle')],['ring',t('Ngón áp út','Ring')]].map(([fKey,fLabel])=><button key={fKey} onClick={()=>setSelectedFinger(fKey)} className={`flex-1 py-1.5 px-2 rounded-lg border text-xs ${selectedFinger===fKey?'bg-amber-200/20 border-amber-300 text-amber-200 font-semibold':'border-white/10 text-slate-300 hover:bg-white/5'}`}>{fLabel}</button>)}
                </div>
              </fieldset>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-xs text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{t('Đường kính lòng trong:','Inner diameter:')}</span>
                  <span className="font-semibold text-amber-200">{Number(trySize).toFixed(1)} mm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{t('Chu vi ngón tương ứng:','Finger circumference:')}</span>
                  <span className="font-semibold text-white">{(trySize*Math.PI).toFixed(1)} mm</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
                  <span>{t('Bản nhẫn: 3.8mm · Dày 1.8mm','Band: 3.8mm · Thick: 1.8mm')}</span>
                  <span className="text-amber-300 font-semibold">{getNiLabel(trySize)}</span>
                </div>
              </div>
            </div>}

            {/* Bracelet controls */}
            {config?.type==='bracelet'&&config?.previewSizes&&<div className="space-y-3">
              <fieldset>
                <div className="flex items-center justify-between mb-2">
                  <legend className="text-sm font-semibold text-slate-200">
                    {t('Size vòng tay (Chu vi)','Wrist size (Circumference)')}
                  </legend>
                  <span className="text-xs font-bold text-amber-200">{Number(trySize).toFixed(1)} cm</span>
                </div>
                <div className="flex gap-2 mb-2.5">
                  {config.previewSizes.map(s=>{
                    const wristNotes={15:t('Mảnh','Slim'),16:t('Chuẩn nữ','Std'),17:t('Vừa vặn','Med'),18:t('Chuẩn nam','Large')};
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={Math.abs(trySize-s)<0.1}
                        onClick={()=>setTrySize(s)}
                        className={`flex-1 min-h-11 rounded-xl border text-xs flex flex-col items-center justify-center p-1 transition-all ${Math.abs(trySize-s)<0.1?'bg-white text-black font-bold shadow-sm':'border-white/20 text-slate-300 hover:bg-white/5'}`}
                      >
                        <span>{s} cm</span>
                        <span className={`text-[10px] ${Math.abs(trySize-s)<0.1?'text-black/70':'text-slate-400'}`}>{wristNotes[s]||''}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Micro-Adjustment Stepper & Slider */}
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Ruler size={13} className="text-amber-300" />
                      {t('Thước tinh chỉnh chu vi (±0.2 cm):', 'Fine-tune wrist (±0.2 cm):')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={()=>setTrySize(s=>Math.max(14.0,Number((s-0.2).toFixed(1))))}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                        title={t('Giảm 0.2 cm','Decrease 0.2 cm')}
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-amber-200 text-xs px-1">
                        {Number(trySize).toFixed(1)} cm
                      </span>
                      <button
                        type="button"
                        onClick={()=>setTrySize(s=>Math.min(19.0,Number((s+0.2).toFixed(1))))}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors"
                        title={t('Tăng 0.2 cm','Increase 0.2 cm')}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="14.0"
                    max="19.0"
                    step="0.1"
                    value={trySize}
                    onChange={e=>setTrySize(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg bg-slate-800 accent-amber-300 cursor-pointer"
                    aria-label="Wrist circumference fine tuning slider"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>14.0 cm (Mảnh)</span>
                    <span>16.0 cm (Chuẩn nữ)</span>
                    <span>18.0 cm (Chuẩn nam)</span>
                    <span>19.0 cm (Rộng)</span>
                  </div>
                </div>
              </fieldset>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{t('Chu vi cổ tay phù hợp:','Best for wrist:')}</span>
                  <span className="font-semibold text-amber-200">{(trySize - 1.0).toFixed(1)} - {Number(trySize).toFixed(1)} cm</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{t('Đường kính xấp xỉ:','Approx. diameter:')}</span>
                  <span className="font-semibold text-white">{((trySize*10)/Math.PI).toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
                  <span>{t('Mặt charm NFC: Ø12mm x 3.5mm','NFC Charm: Ø12mm x 3.5mm')}</span>
                  <span>{t('+3cm xích phụ tăng đơ','+3cm extension')}</span>
                </div>
              </div>
            </div>}

            {isHand&&<label className="block text-sm">{t('Vị trí cao / thấp','Vertical placement')}<input aria-label="Vertical placement" className="w-full h-11 accent-slate-200" type="range" min="-0.3" max="0.3" step="0.01" value={offset} onChange={e=>setOffset(Number(e.target.value))}/></label>}

            {/* Size Guide Button */}
            <button
              type="button"
              onClick={()=>setShowSizeGuide(true)}
              className="w-full py-2.5 px-3 rounded-xl border border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10 text-amber-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors min-h-[44px]"
            >
              <Ruler size={15} className="text-amber-300" />
              <span>{t('Tra cứu bảng số đo & Thước đo màn hình 1:1','View Detailed Sizing & 1:1 Screen Caliper')}</span>
            </button>

            <div className="flex items-center justify-between gap-2">
              <label className="text-xs flex items-center gap-2 min-h-11 cursor-pointer"><input type="checkbox" checked={manual} disabled={!engine.current?.workerReady} onChange={e=>{setManual(e.target.checked);engine.current.setManual(e.target.checked);}}/>{t('Đặt mẫu giữa khung hình','Center the model')}</label>
              {isHand&&<button aria-label={t('Đặt lại vị trí','Reset placement')} className="min-h-11 min-w-11 grid place-items-center rounded-lg hover:bg-white/10" onClick={()=>{setTrySize(config?.defaultSize||17);setScale(1);setOffset(0);}}><RotateCcw size={17}/></button>}
            </div>
            <div className="flex flex-col gap-2 pt-1 border-t border-white/5">
              <label className="text-xs flex items-center gap-2 cursor-pointer text-slate-300">
                <input type="checkbox" checked={showCaliperHUD} onChange={e=>setShowCaliperHUD(e.target.checked)} className="rounded accent-amber-300"/>
                {t('Hiện thước kẹp đo kỹ thuật số AR (Digital Caliper HUD)','Show Digital Caliper HUD')}
              </label>
              <label className="text-xs flex items-center gap-2 cursor-pointer text-slate-300">
                <input type="checkbox" checked={showGuide} onChange={e=>setShowGuide(e.target.checked)} className="rounded accent-amber-300"/>
                {t('Hiện khung gợi ý căn chỉnh AR','Show AR framing guide')}
              </label>
            </div>
            <button disabled={!['tracking','manual','manual-fallback'].includes(status)} onClick={capture} className="w-full min-h-11 rounded-xl border border-white/25 flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-white/10 transition-colors"><Camera size={17}/>{t('Chụp ảnh gương','Capture mirror')}</button>
          </>}
          <p className="text-[11px] text-slate-400">{t('Mô phỏng trải nghiệm trang sức AR để tham khảo phong cách. Che khuất theo tóc/quần áo chưa được mô phỏng. Kích cỡ AR không thay đổi phiên bản trong giỏ hàng.','An AR jewelry style preview. Hair and clothing occlusion are not simulated. Preview size does not change the cart variant.')}{product.unitsPerItem===2?' '+t('Combo hiển thị một chiếc để thử.','The duo set previews one item.'):''}</p>
          <div className="border-t border-white/10 pt-4 space-y-3">
            <label className="block text-xs">{t('Phiên bản mua','Purchase variant')}<select value={size} onChange={e=>{setSize(e.target.value);setAdded(false);}} className="w-full mt-2 min-h-11 rounded-xl bg-slate-900 border border-white/20 px-3">{product.variants?.map(v=><option key={v.size} value={v.size} disabled={v.stock<=0}>{v.size}{v.stock<=0?' · '+t('Hết hàng','Sold out'):''}</option>)}</select></label>
            <p className="font-serif text-xl">{product.formattedPrice}</p>
            <button disabled={!canBuy} onClick={()=>{onAddToCart({...product,size,isGift:false},1);setAdded(true);}} className="w-full min-h-12 bg-amber-100 text-black rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40 shadow-silver-glow">{added?<Check size={17}/>:<ShoppingBag size={17}/>} {added?t('Đã thêm vào giỏ','Added to cart'):canBuy?t('Thêm vào giỏ','Add to cart'):t('Chưa có hàng để bán','Currently unavailable')}</button>
          </div>
        </div>
      </div>
      {photo&&<div className="mx-5 mb-5 p-3 rounded-xl border border-white/15 flex gap-4 items-center bg-black/60"><img src={photo} alt={t('Ảnh thử vừa chụp','Your captured try-on')} className="w-20 max-h-28 object-contain rounded-lg"/><div className="flex-1"><p className="text-xs text-slate-400">{t('Ảnh chỉ lưu khi bạn bấm tải xuống.','The photo is saved only when you download it.')}</p><a href={photo} download={`EMORIA-${product.id}-try-on.jpg`} className="inline-flex items-center gap-2 min-h-11 underline text-amber-200"><Download size={16}/>{t('Tải ảnh','Download photo')}</a></div><button className="min-h-11 min-w-11 grid place-items-center" aria-label={t('Bỏ ảnh vừa chụp','Discard photo')} onClick={()=>setPhoto(null)}><X size={17}/></button></div>}
      <JewelrySizeGuideModal
        isOpen={showSizeGuide}
        onClose={()=>setShowSizeGuide(false)}
        initialCategory={config?.type==='necklace'?'Dây chuyền':config?.type==='bracelet'?'Vòng tay':'Nhẫn'}
      />
    </section>
  </div>,document.body);
}
