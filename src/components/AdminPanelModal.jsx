import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Shield, Package, Truck, SmartphoneNfc, Power, 
  CheckCircle2, Clock, AlertTriangle, Key, RefreshCw, 
  Settings, UserCheck, Eye, Edit3, Lock, Unlock
} from 'lucide-react';
import { updateOrderStatus } from '../services/orderBackendService';
import { 
  getSystemAvailability, 
  updateSystemAvailability 
} from '../services/authRoleService';
import { 
  getAllShowcaseMemories, 
  updateMemoryAvailability 
} from '../services/memoryBackendService';

export default function AdminPanelModal({ isOpen, onClose, onRefresh }) {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'system' | 'nfc'
  
  // Orders State
  const [orders, setOrders] = useState([]);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  // System Availability State
  const [systemConfig, setSystemConfig] = useState(getSystemAvailability());
  const [saveMessage, setSaveMessage] = useState('');

  // NFC Memories State
  const [memories, setMemories] = useState([]);

  // Load orders & memories on open
  useEffect(() => {
    if (isOpen) {
      // Load orders from localStorage
      try {
        const raw = localStorage.getItem('emoria_orders_v1');
        setOrders(raw ? JSON.parse(raw) : []);
      } catch (e) {
        setOrders([]);
      }
      setMemories(getAllShowcaseMemories());
      setSystemConfig(getSystemAvailability());
      setSaveMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Order Status Update
  const handleStatusChange = (orderId, newStatus) => {
    setUpdatingOrderId(orderId);
    try {
      updateOrderStatus(orderId, newStatus);
      // Refresh local orders
      const raw = localStorage.getItem('emoria_orders_v1');
      setOrders(raw ? JSON.parse(raw) : []);
      setUpdatingOrderId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
      setUpdatingOrderId(null);
    }
  };

  // Handle System Availability Toggle
  const handleToggleMaintenance = () => {
    const updated = updateSystemAvailability({
      isMaintenanceMode: !systemConfig.isMaintenanceMode,
    });
    setSystemConfig(updated);
    setSaveMessage('Đã cập nhật trạng thái khả dụng toàn hệ thống.');
    setTimeout(() => setSaveMessage(''), 3000);
    if (onRefresh) onRefresh();
  };

  // Handle Save VIP Passcode
  const handleSaveVipCode = (newCode) => {
    const updated = updateSystemAvailability({ vipPasscode: newCode });
    setSystemConfig(updated);
    setSaveMessage('Đã cập nhật mã VIP Passcode thành công.');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Handle Tag Availability Toggle
  const handleToggleTagAvailability = (tagUid, nextStatus) => {
    updateMemoryAvailability(tagUid, {
      status: nextStatus,
      unlockDate: nextStatus === 'timed_lock' ? '2026-10-20T18:00:00.000Z' : null,
      message: nextStatus === 'timed_lock' ? 'Đang niêm phong đến ngày kỷ niệm' : 'Khả dụng bình thường',
    });
    setMemories(getAllShowcaseMemories());
    if (onRefresh) onRefresh();
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-2xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-4xl rounded-3xl bg-dark-900/95 border border-white/20 p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-silver-glow">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-serif text-lg sm:text-xl font-bold text-white uppercase tracking-wider">
                  Bảng Quản Trị Hệ Thống EMORIA
                </h2>
                <p className="text-xs text-slate-400">
                  Phân quyền Admin • Quản lý đơn hàng, tính khả dụng và vi chip NFC
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-3">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all ${
                activeTab === 'orders'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Quản Lý Đơn Hàng ({orders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all ${
                activeTab === 'system'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>Khả Dụng Toàn Trang</span>
            </button>

            <button
              onClick={() => setActiveTab('nfc')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all ${
                activeTab === 'nfc'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <SmartphoneNfc className="w-4 h-4" />
              <span>Quản Lý Chip NFC ({memories.length})</span>
            </button>
          </div>

          {saveMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveMessage}</span>
            </div>
          )}

          {/* ================= TAB 1: ORDERS ================= */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Chưa có đơn hàng nào được đặt trong hệ thống.
                </div>
              ) : (
                orders.map((order) => (
                  <div key={order.id} className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">{order.id}</span>
                        <span className="text-slate-400 font-light">
                          {order.customerName} ({order.phone})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-300 font-bold">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.totals?.finalTotal || 0)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      <strong>Địa chỉ: </strong> {order.address}, {order.city} • 
                      <strong> Thanh toán: </strong> <span className="uppercase text-slate-200">{order.paymentMethod}</span>
                    </div>

                    {/* Change Status Control */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      <span className="text-slate-400">Trạng thái hiện tại:</span>
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-black/80 border border-white/20 text-white font-medium focus:outline-none focus:border-white/50 cursor-pointer"
                      >
                        <option value="pending_payment">Chờ Thanh Toán VietQR</option>
                        <option value="confirmed">Đã Tiếp Nhận & Xác Nhận</option>
                        <option value="crafting_nfc">Đang Đúc Bạc & Nạp Chip NFC</option>
                        <option value="shipping">Đang Vận Chuyển</option>
                        <option value="completed">Đã Giao Hoàn Tất</option>
                        <option value="cancelled">Đã Hủy Đơn</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================= TAB 2: SYSTEM AVAILABILITY ================= */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-black/40 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-white text-sm">Chế Độ Bảo Trì / VIP Private Salon Gate</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Khi bật, toàn bộ khách vãng lai sẽ bị chặn lại ở màn hình Private Salon và chỉ những người có Mã VIP Passcode mới được vào.
                    </p>
                  </div>

                  <button
                    onClick={handleToggleMaintenance}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                      systemConfig.isMaintenanceMode
                        ? 'bg-amber-400 text-dark-950 shadow-md'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                    <span>{systemConfig.isMaintenanceMode ? 'ĐANG BẬT BẢO TRÌ' : 'ĐANG MỞ CÔNG KHAI'}</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-3">
                  <label className="text-xs text-slate-300 font-semibold block">Mã VIP Passcode (Vượt qua màn hình bảo trì):</label>
                  <div className="flex gap-2 max-w-sm">
                    <input
                      type="text"
                      defaultValue={systemConfig.vipPasscode}
                      id="vip-passcode-input"
                      className="px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white font-mono text-xs focus:outline-none flex-1"
                    />
                    <button
                      onClick={() => {
                        const val = document.getElementById('vip-passcode-input')?.value;
                        if (val) handleSaveVipCode(val.trim());
                      }}
                      className="px-4 py-2 rounded-xl bg-white text-dark-950 text-xs font-bold uppercase cursor-pointer"
                    >
                      Lưu Mã
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: NFC MEMORY TAGS ================= */}
          {activeTab === 'nfc' && (
            <div className="space-y-4">
              {memories.map((mem) => (
                <div key={mem.tagUid} className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{mem.jewelryName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono">
                          #{mem.tagUid}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">Tiêu đề: {mem.title}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-slate-500 text-[10px]">Mã Owner Secret:</p>
                      <p className="font-mono text-amber-300 font-bold">{mem.ownerSecret}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Trạng thái khả dụng:</span>
                      <span className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] ${
                        mem.availability?.status === 'available'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : mem.availability?.status === 'timed_lock'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}>
                        {mem.availability?.status || 'available'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleTagAvailability(mem.tagUid, 'available')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
                          mem.availability?.status === 'available'
                            ? 'bg-white text-dark-950 font-bold'
                            : 'bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        Khả Dụng
                      </button>
                      <button
                        onClick={() => handleToggleTagAvailability(mem.tagUid, 'timed_lock')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
                          mem.availability?.status === 'timed_lock'
                            ? 'bg-white text-dark-950 font-bold'
                            : 'bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        Hẹn Giờ Mở
                      </button>
                      <button
                        onClick={() => handleToggleTagAvailability(mem.tagUid, 'suspended')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
                          mem.availability?.status === 'suspended'
                            ? 'bg-white text-dark-950 font-bold'
                            : 'bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        Tạm Khóa
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
