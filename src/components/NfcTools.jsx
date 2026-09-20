import React,{useEffect,useRef,useState} from 'react';
import {canUseNfc,nfcMemoryUrl,readMemoryTag,nfcError} from '../services/nfc.js';

export default function NfcTools({tag,onRead}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[overwrite,setOverwrite]=useState(false);
  const controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[tag]);
  const run=async write=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setBusy(true);setMessage(write?'Đưa chip sát điện thoại để ghi link…':'Đưa chip sát điện thoại để đọc…');
    const timeout=setTimeout(()=>abort.abort(),30000);
    try {
      const reader=new window.NDEFReader();
      if(write){
        await reader.write({records:[{recordType:'url',data:nfcMemoryUrl(tag)}]},{signal:abort.signal,overwrite});
        setMessage('Đã ghi link. Bấm “Đọc kiểm tra chip” để xác nhận đúng kỷ vật.');setOverwrite(false);
      }else{
        const found=await new Promise((resolve,reject)=>{
          abort.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
          reader.onreading=event=>{try{resolve(readMemoryTag(event.message));}catch(e){reject(e);}};
          reader.onreadingerror=()=>reject(new Error('Không đọc được dữ liệu chip. Hãy chạm lại.'));
          reader.scan({signal:abort.signal}).catch(reject);
        });
        if(tag){if(found!==tag)throw new Error('Chip đang trỏ đến kỷ vật khác. Chưa xác minh thành công.');setMessage('Đã xác minh: chip trỏ đúng kỷ vật này.');}
        else {setMessage(`Đã đọc mã ${found}.`);onRead?.(found);}
      }
    }catch(error){setMessage(nfcError(error));}
    finally{clearTimeout(timeout);abort.abort();if(controller.current===abort){controller.current=null;setBusy(false);}}
  };
  return <div className="p-3 rounded-xl border border-white/15 space-y-3 text-sm">
    <p className="font-semibold">{tag?'Ghi & kiểm tra chip NFC':'Quét chip NFC'}</p>
    {tag&&<><code className="block break-all text-xs select-all">{nfcMemoryUrl(tag)}</code><button type="button" className="underline" onClick={async()=>{try{await navigator.clipboard.writeText(nfcMemoryUrl(tag));setMessage('Đã sao chép link để ghi vào chip.');}catch{setMessage('Hãy chọn và sao chép link hiển thị phía trên.');}}}>Sao chép link NFC</button></>}
    {canUseNfc()?<>
      {tag&&<label className="flex items-start gap-2"><input type="checkbox" checked={overwrite} disabled={busy} onChange={e=>setOverwrite(e.target.checked)}/>Cho phép thay nội dung nếu chip đã được ghi trước đó.</label>}
      <div className="flex flex-wrap gap-2">
        {tag&&<button type="button" className="store-button" disabled={busy} onClick={()=>run(true)}>Ghi link vào chip</button>}
        <button type="button" className="store-button" disabled={busy} onClick={()=>run(false)}>{tag?'Đọc kiểm tra chip':'Quét NFC để mở kỷ vật'}</button>
        {busy&&<button type="button" className="underline" onClick={()=>controller.current?.abort()}>Dừng quét</button>}
      </div>
    </>:<p className="text-slate-400 text-xs">Trình duyệt này chưa hỗ trợ đọc/ghi Web NFC. Dùng Chrome trên Android có NFC và HTTPS. Với iPhone, ghi link bằng ứng dụng NFC hỗ trợ ghi URL; khi xem, chạm điện thoại vào chip và mở thông báo. Bạn vẫn có thể mở kỷ vật bằng mã hoặc đường link.</p>}
    {message&&<p role="status" className="text-amber-200">{message}</p>}
  </div>;
}
