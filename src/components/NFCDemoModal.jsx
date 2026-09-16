import React from 'react';
import { X, SmartphoneNfc, ArrowRight } from 'lucide-react';
import { useStore } from './StoreProvider';

export default function NFCDemoModal({ isOpen, onClose, selectedProductId, onOpenMemoryViewer }) {
  const { products } = useStore();
  const product = products.find(p => p.id === selectedProductId);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[80] bg-dark-950/85 backdrop-blur-xl p-3 sm:p-6 flex items-center justify-center" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="nfc-preview-title" onClick={e => e.stopPropagation()} className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/20 bg-dark-900 p-5 sm:p-8 text-white">
      <button onClick={onClose} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-white/10" aria-label="Đóng giới thiệu NFC"><X size={20}/></button>
      <SmartphoneNfc className="mb-4 text-slate-300" size={32}/>
      <h3 id="nfc-preview-title" className="font-serif text-2xl pr-8">Một chạm mở kỷ niệm</h3>
      <div className="grid sm:grid-cols-2 gap-6 mt-6 items-center">
        {product && <img src={product.image} alt={product.name} className="w-full aspect-square object-cover rounded-2xl"/>}
        <div className="space-y-4 text-sm text-slate-300">
          {product && <h4 className="font-serif text-xl text-white">{product.name}</h4>}
          <p>Mỗi chiếc trang sức NFC dẫn tới một không gian riêng: xem video mở quà, đọc thư, nghe nhạc và xem ảnh do người mua chuẩn bị.</p>
          <p>Sau khi nhận mã bàn giao, người mua đăng nhập để chỉnh sửa và đặt PIN cho người nhận.</p>
          <p className="text-xs text-slate-400">Bạn có thể xem kỷ vật mẫu Lumen bên dưới. Đây là trang trải nghiệm có sẵn; sản phẩm mới sẽ nhận liên kết riêng khi cấp chip.</p>
          <button className="store-button flex items-center gap-2 min-h-[44px]" onClick={() => {onClose();onOpenMemoryViewer?.('emoria-lumen');}}>Xem kỷ vật mẫu <ArrowRight size={16}/></button>
        </div>
      </div>
    </section>
  </div>;
}
