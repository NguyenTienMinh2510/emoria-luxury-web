import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Camera,ShoppingBag,RotateCcw,ShieldCheck,Download,Check} from 'lucide-react';
import {useLanguage} from '../i18n/LanguageProvider';
import {apiRequest} from '../services/apiClient.js';
import {NecklaceTracker} from '../services/arNecklaceTracker.js';
import {HandTracker} from '../services/arHandTracker.js';
import {tryOnConfig} from '../services/tryOnConfig.js';
import ARFramingGuide from './ARFramingGuide.jsx';

export default function VirtualTryOnModal({product,settings,onClose,onAddToCart,initialSize}){
  const {t}=useLanguage(),video=useRef(),canvas=useRef(),engine=useRef(),dialog=useRef(),alive=useRef(true),close=useRef(onClose);
  close.current=onClose;
  const [config,setConfig]=useState(null),[status,setStatus]=useState('intro'),[error,setError]=useState(''),[loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
  const [length,setLength]=useState(45),[scale,setScale]=useState(1),[offset,setOffset]=useState(0),[manual,setManual]=useState(false),[added,setAdded]=useState(false),[photo,setPhoto]=useState(null);
  const [trySize,setTrySize]=useState(17),[selectedFinger,setSelectedFinger]=useState('ring');
  const [showGuide,setShowGuide]=useState(true);
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
      engine.current.setOptions({size:trySize,scale,offset,finger:selectedFinger});
    }else{
      engine.current.setOptions({length,scale,offset});
    }
  },[length,trySize,selectedFinger,scale,offset,isHand]);

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
      tracker.setOptions({size:trySize,scale,offset,finger:selectedFinger});
    }else{
      tracker.setOptions({length,scale,offset});
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
    intro: config?.type==='ring'?t('Gương thử nhẫn','Your ring mirror'):config?.type==='bracelet'?t('Gương thử vòng tay','Your bracelet mirror'):t('Gương thử trang sức','Your jewelry mirror'),
    starting: t('Đang mở camera…','Opening camera…'),
    'loading-model': t('Đang tải bộ nhận diện trên thiết bị…','Loading on-device tracking…'),
    tracking: isHand?(config?.type==='bracelet'?t('Đã nhận diện cổ tay','Wrist detected'):t('Đã nhận diện bàn tay','Hand detected')):t('Đã nhận diện vai & cổ','Shoulders & neck detected'),
    searching: isHand?(config?.type==='bracelet'?t('Giơ cổ tay và bàn tay trước camera','Show your wrist and hand to the camera'):t('Giơ bàn tay trước camera, xòe nhẹ các ngón tay','Show your hand facing the camera, spread fingers slightly')):t('Lùi nhẹ để thấy cả hai vai, nhìn thẳng camera','Step back to show both shoulders and face the camera'),
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
            EMORIA · {config?.type==='ring'?'VIRTUAL RING TRY-ON':config?.type==='bracelet'?'VIRTUAL BRACELET TRY-ON':'VIRTUAL TRY-ON'}
          </p>
          <h2 id="tryon-title" className="font-serif text-xl">{product.name}</h2>
        </div>
        <button onClick={onClose} aria-label={t('Đóng gương AR','Close AR mirror')} className="min-w-11 min-h-11 grid place-items-center rounded-full hover:bg-white/10"><X/></button>
      </header>
      <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative bg-[#0b0d12] min-h-[400px] md:min-h-[540px] flex items-center justify-center overflow-hidden rounded-2xl m-3 border border-white/10 shadow-2xl">
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
          {!active&&<button disabled={!config||status==='starting'} onClick={start} className="w-full min-h-12 rounded-xl bg-white text-black font-semibold disabled:opacity-40 flex items-center justify-center gap-2 shadow-silver-glow"><Camera size={18}/>{status==='starting'?t('Đang mở…','Starting…'):t('Bật camera để thử','Start camera')}</button>}
          {active&&<>
            {/* Necklace controls */}
            {config?.type==='necklace'&&config?.previewLengths&&<fieldset>
              <legend className="text-sm mb-2">{t('Độ rủ mô phỏng','Simulated chain drop')}</legend>
              <div className="flex gap-2">{config.previewLengths.map(n=><button key={n} aria-pressed={length===n} onClick={()=>setLength(n)} className={`flex-1 min-h-11 rounded-xl border ${length===n?'bg-white text-black font-bold':'border-white/20'}`}>{n} cm</button>)}</div>
            </fieldset>}

            {/* Ring controls */}
            {config?.type==='ring'&&<>
              <fieldset>
                <legend className="text-sm mb-2">{t('Size nhẫn mô phỏng','Simulated ring size')}</legend>
                <div className="flex gap-2">{config.previewSizes?.map(s=><button key={s} aria-pressed={trySize===s} onClick={()=>setTrySize(s)} className={`flex-1 min-h-11 rounded-xl border text-xs ${trySize===s?'bg-white text-black font-bold':'border-white/20'}`}>{s} mm</button>)}</div>
              </fieldset>
              <fieldset>
                <legend className="text-xs text-slate-400 mb-1">{t('Ngón tay đeo nhẫn','Target finger')}</legend>
                <div className="flex gap-1.5">
                  {[['index',t('Ngón trỏ','Index')],['middle',t('Ngón giữa','Middle')],['ring',t('Ngón áp út','Ring')]].map(([fKey,fLabel])=><button key={fKey} onClick={()=>setSelectedFinger(fKey)} className={`flex-1 py-1.5 px-2 rounded-lg border text-xs ${selectedFinger===fKey?'bg-amber-200/20 border-amber-300 text-amber-200':'border-white/10 text-slate-300'}`}>{fLabel}</button>)}
                </div>
              </fieldset>
            </>}

            {/* Bracelet controls */}
            {config?.type==='bracelet'&&config?.previewSizes&&<fieldset>
              <legend className="text-sm mb-2">{t('Size vòng tay','Wrist size')}</legend>
              <div className="flex gap-2">{config.previewSizes.map(s=><button key={s} aria-pressed={trySize===s} onClick={()=>setTrySize(s)} className={`flex-1 min-h-11 rounded-xl border ${trySize===s?'bg-white text-black font-bold':'border-white/20'}`}>{s} cm</button>)}</div>
            </fieldset>}

            <label className="block text-sm">{config?.type==='ring'?t('Độ to của nhẫn','Ring scale'):config?.type==='bracelet'?t('Độ to của vòng','Bracelet scale'):t('Kích thước mặt dây','Pendant scale')}<input aria-label="Scale slider" className="w-full h-11 accent-slate-200" type="range" min="0.65" max="1.6" step="0.05" value={scale} onChange={e=>setScale(Number(e.target.value))}/></label>
            <label className="block text-sm">{t('Vị trí cao / thấp','Vertical placement')}<input aria-label="Vertical placement" className="w-full h-11 accent-slate-200" type="range" min="-0.3" max="0.3" step="0.01" value={offset} onChange={e=>setOffset(Number(e.target.value))}/></label>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs flex items-center gap-2 min-h-11 cursor-pointer"><input type="checkbox" checked={manual} disabled={!engine.current?.workerReady} onChange={e=>{setManual(e.target.checked);engine.current.setManual(e.target.checked);}}/>{t('Căn chỉnh thủ công','Manual placement')}</label>
              <button aria-label={t('Đặt lại vị trí','Reset placement')} className="min-h-11 min-w-11 grid place-items-center rounded-lg hover:bg-white/10" onClick={()=>{setLength(45);setTrySize(config?.defaultSize||17);setScale(1);setOffset(0);}}><RotateCcw size={17}/></button>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <label className="text-xs flex items-center gap-2 cursor-pointer text-slate-300">
                <input type="checkbox" checked={showGuide} onChange={e=>setShowGuide(e.target.checked)} className="rounded accent-amber-300"/>
                {t('Hiện khung gợi ý căn chỉnh AR','Show AR framing guide')}
              </label>
            </div>
            <button disabled={!['tracking','manual','manual-fallback'].includes(status)} onClick={capture} className="w-full min-h-11 rounded-xl border border-white/25 flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-white/10 transition-colors"><Camera size={17}/>{t('Chụp ảnh gương','Capture mirror')}</button>
          </>}
          <p className="text-[11px] text-slate-400">{t('Mô phỏng thử trang sức để tham khảo phong cách, không đo kích thước thật. Che khuất theo tóc/quần áo chưa được mô phỏng. Kích cỡ thử không thay đổi phiên bản trong giỏ hàng.','A jewelry style preview, not a size measurement. Hair and clothing occlusion are not simulated. Preview size does not change the cart variant.')}{product.unitsPerItem===2?' '+t('Combo hiển thị một chiếc để thử.','The duo set previews one item.'):''}</p>
          <div className="border-t border-white/10 pt-4 space-y-3">
            <label className="block text-xs">{t('Phiên bản mua','Purchase variant')}<select value={size} onChange={e=>{setSize(e.target.value);setAdded(false);}} className="w-full mt-2 min-h-11 rounded-xl bg-slate-900 border border-white/20 px-3">{product.variants?.map(v=><option key={v.size} value={v.size} disabled={v.stock<=0}>{v.size}{v.stock<=0?' · '+t('Hết hàng','Sold out'):''}</option>)}</select></label>
            <p className="font-serif text-xl">{product.formattedPrice}</p>
            <button disabled={!canBuy} onClick={()=>{onAddToCart({...product,size,isGift:false},1);setAdded(true);}} className="w-full min-h-12 bg-amber-100 text-black rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40 shadow-silver-glow">{added?<Check size={17}/>:<ShoppingBag size={17}/>} {added?t('Đã thêm vào giỏ','Added to cart'):canBuy?t('Thêm vào giỏ','Add to cart'):t('Chưa có hàng để bán','Currently unavailable')}</button>
          </div>
        </div>
      </div>
      {photo&&<div className="mx-5 mb-5 p-3 rounded-xl border border-white/15 flex gap-4 items-center bg-black/60"><img src={photo} alt={t('Ảnh thử vừa chụp','Your captured try-on')} className="w-20 max-h-28 object-contain rounded-lg"/><div className="flex-1"><p className="text-xs text-slate-400">{t('Ảnh chỉ lưu khi bạn bấm tải xuống.','The photo is saved only when you download it.')}</p><a href={photo} download={`EMORIA-${product.id}-try-on.jpg`} className="inline-flex items-center gap-2 min-h-11 underline text-amber-200"><Download size={16}/>{t('Tải ảnh','Download photo')}</a></div><button className="min-h-11 min-w-11 grid place-items-center" aria-label={t('Bỏ ảnh vừa chụp','Discard photo')} onClick={()=>setPhoto(null)}><X size={17}/></button></div>}
    </section>
  </div>,document.body);
}
