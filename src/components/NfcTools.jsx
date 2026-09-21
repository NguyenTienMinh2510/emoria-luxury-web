import React,{useEffect,useRef,useState} from 'react';
import {canUseNfc,nfcMemoryUrl,nfcChipUrl,readNfcTarget,nfcError} from '../services/nfc.js';

import {apiRequest} from '../services/apiClient.js';
import {useLanguage} from '../i18n/LanguageProvider';

export default function NfcTools({tag,chipId,onRead}) {
  const {t}=useLanguage();
  const targetUrl=chipId?nfcChipUrl(chipId):tag?nfcMemoryUrl(tag):'';
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[overwrite,setOverwrite]=useState(false);
  const controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[tag,chipId]);
  const run=async write=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setBusy(true);setMessage(write?t("Đưa chip sát điện thoại để ghi link…","Hold the chip near your phone to write…"):t("Đưa chip sát điện thoại để đọc…","Hold the chip near your phone to read…"));
    const timeout=setTimeout(()=>abort.abort(),30000);
    try {
      const reader=new window.NDEFReader();
      if(write){
        await reader.write({records:[{recordType:'url',data:targetUrl}]},{signal:abort.signal,overwrite});
        setMessage(t("Đã ghi link. Bấm “Đọc kiểm tra chip” để xác nhận đúng kỷ vật.","Link written. Select “Verify chip” to check the link."));setOverwrite(false);
      }else{
        const found=await new Promise((resolve,reject)=>{
          abort.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
          reader.onreading=event=>{try{resolve(readNfcTarget(event.message));}catch(e){reject(e);}};
          reader.onreadingerror=()=>reject(new Error(t("Không đọc được dữ liệu chip. Hãy chạm lại.","Could not read the chip. Try tapping again.")));
          reader.scan({signal:abort.signal}).catch(reject);
        });
        if(chipId||tag){if(found.kind!==(chipId?'chip':'memory')||found.id!==(chipId||tag))throw new Error(t("Chip đang trỏ đến kỷ vật khác. Chưa xác minh thành công.","This chip contains a different link. Verification failed."));setMessage(t("Đã xác minh: chip trỏ đúng kỷ vật này.","Verified: the chip contains the correct link."));}
        else {const resolved=found.kind==='chip'?await apiRequest(`/nfc-chips/${found.id}`):{tag_uid:found.id};if(!abort.signal.aborted){setMessage(t('Đã đọc chip.','Chip read.'));onRead?.(resolved.tag_uid);}}
      }
    }catch(error){setMessage(nfcError(error));}
    finally{clearTimeout(timeout);abort.abort();if(controller.current===abort){controller.current=null;setBusy(false);}}
  };
  return <div className="p-3 rounded-xl border border-white/15 space-y-3 text-sm">
    <p className="font-semibold">{targetUrl?t("Ghi & kiểm tra chip NFC","Write & verify NFC chip"):t("Quét chip NFC","Scan NFC chip")}</p>
    {targetUrl&&<><code className="block break-all text-xs select-all">{targetUrl}</code><button type="button" className="underline" onClick={async()=>{try{await navigator.clipboard.writeText(targetUrl);setMessage(t("Đã sao chép link để ghi vào chip.","Chip URL copied."));}catch{setMessage(t("Hãy chọn và sao chép link hiển thị phía trên.","Select and copy the URL shown above."));}}}>{t("Sao chép link NFC","Copy NFC link")}</button></>}
    {canUseNfc()?<>
      {targetUrl&&<label className="flex items-start gap-2"><input type="checkbox" checked={overwrite} disabled={busy} onChange={e=>setOverwrite(e.target.checked)}/>{t("Cho phép thay nội dung nếu chip đã được ghi trước đó.","Allow overwriting a previously written chip.")}</label>}
      <div className="flex flex-wrap gap-2">
        {targetUrl&&<button type="button" className="store-button" disabled={busy} onClick={()=>run(true)}>{t("Ghi link vào chip","Write link to chip")}</button>}
        <button type="button" className="store-button" disabled={busy} onClick={()=>run(false)}>{targetUrl?t("Đọc kiểm tra chip","Verify chip"):t("Quét NFC để mở kỷ vật","Scan NFC to open memory")}</button>
        {busy&&<button type="button" className="underline" onClick={()=>controller.current?.abort()}>{t("Dừng quét","Stop scanning")}</button>}
      </div>
    </>:<p className="text-slate-400 text-xs">{t("Trình duyệt này chưa hỗ trợ đọc/ghi Web NFC. Dùng Chrome trên Android có NFC và HTTPS. Với iPhone, ghi link bằng ứng dụng NFC hỗ trợ ghi URL; khi xem, chạm điện thoại vào chip và mở thông báo. Bạn vẫn có thể mở kỷ vật bằng mã hoặc đường link.","This browser cannot read/write Web NFC. Use Chrome on an NFC-enabled Android phone over HTTPS. On iPhone, write the URL using an NFC app; tap the chip and open the notification to view it. You can also open a memory using its ID or link.")}</p>}
    {message&&<p role="status" className="text-amber-200">{message}</p>}
  </div>;
}
