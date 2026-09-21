import React, { useEffect, useState } from 'react';
import PaymentStatus from './PaymentStatus';
import { apiRequest } from '../services/apiClient.js';
import { trackOrderSecure } from '../services/orderBackendService';
import { Sparkles, ArrowRight, Package, Clock, Truck, CheckCircle2 } from 'lucide-react';

const statusName = {
  pending_payment: 'Chờ xác nhận chuyển khoản',
  confirmed: 'Đã tiếp nhận',
  crafting_nfc: 'Đang chuẩn bị trang sức và NFC',
  shipping: 'Đang giao hàng',
  completed: 'Đã giao thành công',
  cancelled: 'Đã hủy'
};

export default function CustomerOrders({ onNavigateToMemory, onClose }) {
  const [orders, setOrders] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setDetail(null);
    (async () => {
      try {
        const rows = await apiRequest('/me/orders?' + new URLSearchParams({ page }));
        if (active) setOrders(rows || []);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [page]);

  const handleOpenStudio = () => {
    onClose?.();
    if (onNavigateToMemory) {
      onNavigateToMemory();
    } else {
      window.location.hash = '#/memory';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  };

  return (
    <section className="space-y-4 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-amber-300" />
          <span>Đơn hàng của bạn</span>
        </h3>
        <button
          type="button"
          onClick={handleOpenStudio}
          className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Vào Memory Studio</span>
        </button>
      </div>

      {loading && <p role="status" className="text-sm text-slate-400">Đang tải đơn hàng…</p>}
      {error && <p role="alert" className="text-sm text-red-300 bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}
      {!loading && !orders.length && (
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-3">
          <p className="text-sm text-slate-400">
            Chưa có đơn đặt bằng tài khoản này. Đơn mua khi chưa đăng nhập vẫn có thể tra cứu bằng mã đơn và mã tra cứu riêng trong cửa hàng.
          </p>
          <button
            type="button"
            onClick={handleOpenStudio}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <span>Mở không gian kỷ vật demo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {orders.map(order => (
        <button
          key={order.id}
          className="w-full text-left p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm space-y-1 cursor-pointer"
          onClick={async () => {
            try {
              setError('');
              setDetail(await trackOrderSecure(order.id));
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-amber-200">#{order.id}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
              {statusName[order.status] || order.status}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
            <span>{new Intl.NumberFormat('vi-VN').format(order.final_total)} đ</span>
            {order.is_test && <span className="text-amber-300 text-[11px]">Đơn thử nghiệm</span>}
          </div>
        </button>
      ))}

      {orders.length > 0 && (
        <div className="flex justify-between items-center text-xs text-slate-400 pt-2">
          <button
            disabled={!page}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
          >
            ← Trang trước
          </button>
          <span>Trang {page + 1}</span>
          <button
            disabled={orders.length < 10}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
          >
            Trang sau →
          </button>
        </div>
      )}

      {detail && (
        <div className="p-4 border border-amber-400/30 rounded-2xl bg-black/40 text-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Mã đơn chi tiết</span>
              <p className="font-mono text-sm text-amber-200 font-bold break-all">{detail.id}</p>
            </div>
            <button
              type="button"
              onClick={handleOpenStudio}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:brightness-110 text-dark-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>✦ Soạn Thư & Kỷ Niệm (Studio)</span>
            </button>
          </div>

          <PaymentStatus order={detail} autoRefresh />

          <div className="space-y-1.5 pt-2">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Sản phẩm trong đơn:</p>
            {detail.items?.map((item, i) => (
              <div key={i} className="flex justify-between text-xs text-slate-200 bg-white/5 p-2 rounded-lg">
                <span>{item.name} {item.size ? `(Size: ${item.size})` : ''}</span>
                <span className="font-mono">× {item.quantity}</span>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-white/10">
            <p>Đơn vị vận chuyển: <span className="text-slate-200">{detail.shippingCarrier || 'Chưa bàn giao'}</span></p>
            {detail.deliveryEstimate && (
              <p>Dự kiến giao: <span className="text-slate-200">{new Date(detail.deliveryEstimate + 'T00:00:00').toLocaleDateString('vi-VN')}</span></p>
            )}
            {detail.shippingNote && <p>Ghi chú: <span className="text-slate-200">{detail.shippingNote}</span></p>}
            <p>{detail.trackingNumber ? `Mã vận đơn: ${detail.trackingNumber}` : 'Chưa có mã vận đơn'}</p>
          </div>

          {detail.statusTimeline?.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <p className="text-xs font-semibold text-slate-300">Lịch sử trạng thái:</p>
              {detail.statusTimeline.map((event, i) => (
                <p key={i} className="text-xs text-slate-400">
                  {new Date(event.time).toLocaleString('vi-VN')} · {statusName[event.status] || event.status}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
