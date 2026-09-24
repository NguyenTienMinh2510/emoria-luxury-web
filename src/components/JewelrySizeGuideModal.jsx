import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {useLanguage} from '../i18n/LanguageProvider';

export default function JewelrySizeGuideModal({isOpen,onClose,initialCategory='Nhẫn',onApplySize,previewSizes}){
  const {t}=useLanguage(),dialog=useRef();
  const [tab,setTab]=useState('ring'),[diameter,setDiameter]=useState('');
  useEffect(()=>{if(isOpen)setTab(initialCategory==='Dây chuyền'?'necklace':initialCategory==='Vòng tay'?'bracelet':'ring');},[initialCategory,isOpen]);
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current?.focus();
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
      if(e.key==='Tab'){
        const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input,a[href]')];
        const first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key,true);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key,true);previous?.focus();};
  },[isOpen,onClose]);
  if(!isOpen)return null;
  const value=Number(diameter),valid=diameter!==''&&Number.isFinite(value)&&value>=12&&value<=25;
  const sizes=previewSizes?.length?previewSizes:[16,17,18,19];
  const nearest=valid?sizes.reduce((a,b)=>Math.abs(b-value)<Math.abs(a-value)?b:a):null;
  return createPortal(<div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md p-3 flex items-center justify-center" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="size-guide-title" className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#101216] text-slate-100 border border-white/15 p-5 outline-none">
      <header className="flex items-center justify-between gap-3 mb-4"><h2 id="size-guide-title" className="font-serif text-xl">{t('Chọn size đơn giản','Find your size')}</h2><button className="min-h-11 min-w-11 grid place-items-center" aria-label={t('Đóng hướng dẫn','Close size guide')} onClick={onClose}><X/></button></header>
      <div className="flex gap-2 mb-5">{[['ring',t('Nhẫn','Ring')],['bracelet',t('Vòng tay','Bracelet')],['necklace',t('Dây chuyền','Necklace')]].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)} className={`flex-1 min-h-11 rounded-xl border ${tab===key?'bg-amber-100 text-black':'border-white/20'}`}>{label}</button>)}</div>
      {tab==='ring'&&<div className="space-y-4 text-sm">
        <p>{t('Dễ nhất: đo một chiếc nhẫn đang đeo vừa cùng ngón tay.','The easiest method: measure a ring that fits the same finger.')}</p>
        <ol className="list-decimal pl-5 space-y-2"><li>{t('Đặt nhẫn lên thước thật có vạch mm.','Place the ring on a real millimetre ruler.')}</li><li>{t('Đo ngang qua tâm, từ mép trong đến mép trong. Không tính phần kim loại.','Measure across the centre, inside edge to inside edge. Exclude the metal.')}</li><li>{t('Đo lại 2–3 lần rồi nhập đường kính bên dưới.','Repeat 2–3 times, then enter the inside diameter below.')}</li></ol>
        <label className="block">{t('Đường kính lòng nhẫn (mm)','Inside ring diameter (mm)')}<input type="number" inputMode="decimal" min="12" max="25" step="0.1" placeholder="17.0" value={diameter} onChange={e=>setDiameter(e.target.value)} className="text-base mt-2 block w-full min-h-11 rounded-xl bg-slate-900 border border-white/20 px-3"/></label>
        <div aria-live="polite">{valid?<p>{t('Chu vi lòng nhẫn','Inside circumference')}: {(value*Math.PI).toFixed(1)} mm · {t('Đường kính xem thử gần nhất','Closest preview diameter')}: {nearest} mm.</p>:diameter!==''?<p className="text-amber-200">{t('Nhập đường kính từ 12 đến 25 mm.','Enter a diameter between 12 and 25 mm.')}</p>:null}</div>
        {onApplySize&&initialCategory==='Nhẫn'&&<button disabled={!valid} onClick={()=>{onApplySize(nearest);onClose();}} className="w-full min-h-11 rounded-xl bg-amber-100 text-black disabled:opacity-40">{t('Dùng size này để xem AR','Use this size in AR')}</button>}
        <p className="text-slate-400">{t('Chưa có nhẫn vừa? Dùng bộ vòng đo nhẫn hoặc đo tại cửa hàng. Nếu nằm giữa hai size, nên thử trực tiếp; độ rộng bản nhẫn và khớp ngón tay ảnh hưởng độ vừa.','No ring to measure? Use a ring sizing set or visit a jeweller. Between sizes, try them in person; band width and knuckle size affect fit.')}</p>
        <p className="text-slate-400">{t('Số ni tùy bảng size của hãng. Dùng đường kính/chu vi mm để đối chiếu, không suy ra ni từ giới tính.','Numbered sizes depend on the brand chart. Compare diameter/circumference in mm.')}</p>
      </div>}
      {tab==='bracelet'&&<div className="space-y-4 text-sm"><ol className="list-decimal pl-5 space-y-2"><li>{t('Quấn thước dây mềm quanh vị trí đeo, vừa sát da và không siết.','Wrap a soft tape around the wearing position, snug without tightening.')}</li><li>{t('Ghi chu vi cổ tay bằng cm; đo lại một lần.','Note your wrist circumference in cm and measure again.')}</li><li>{t('Đối chiếu với chiều dài vòng và đoạn tăng đơ của sản phẩm. Chọn thêm độ rộng theo độ ôm bạn thích.','Compare with the bracelet length and extension. Allow extra room for your preferred fit.')}</li></ol><p className="text-slate-400">{t('Chu vi cổ tay và chiều dài vòng là hai số khác nhau. Vòng cứng cần kiểm tra thêm kích thước bàn tay khi luồn qua.','Wrist circumference and bracelet length differ. A rigid bangle also needs to pass over your hand.')}</p></div>}
      {tab==='necklace'&&<div className="space-y-4 text-sm"><ol className="list-decimal pl-5 space-y-2"><li>{t('Cắt một sợi dây mềm bằng chiều dài dây chuyền muốn thử, ví dụ 45 cm.','Cut a soft cord to the necklace length you want, for example 45 cm.')}</li><li>{t('Vòng qua cổ và giữ hai đầu chạm nhau để xem điểm rủ trong gương.','Wrap it around your neck and hold the ends together to check the drop in a mirror.')}</li><li>{t('Thử thêm 5 cm nếu sản phẩm có tăng đơ. Chiều dài dây không bao gồm mặt trang sức.','Try another 5 cm if the product has an extension. Chain length excludes the pendant.')}</li></ol><p className="text-slate-400">{t('Cùng chiều dài nhưng điểm rủ thay đổi theo vòng cổ và dáng người.','The same length sits differently depending on neck size and body shape.')}</p></div>}
      <p className="mt-5 pt-4 border-t border-white/10 text-xs text-slate-400">{t('AR giúp so sánh dáng đeo và kích cỡ ước lượng. Số đo bằng dụng cụ thật là cơ sở chọn mua.','AR compares styles and estimated sizes. Use physical measurements to choose your purchase.')}</p>
    </section>
  </div>,document.body);
}
