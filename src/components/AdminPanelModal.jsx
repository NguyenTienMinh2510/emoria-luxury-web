import MemoryAccountsAdmin from './MemoryAccountsAdmin';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, ShieldAlert, Package, Truck, SmartphoneNfc, Power,
  CheckCircle2, Clock, AlertTriangle, Key, RefreshCw,
  Settings, UserCheck, Eye, Edit3, Lock, Unlock, Database,
  BookOpen, MessageSquare, Plus, Trash2, Check, EyeOff, FileText, Send
} from 'lucide-react';
import CommentModeration from './CommentModeration';
import MarketingPanel from './MarketingPanel';
import VideoModerationAdmin from './VideoModerationAdmin';
import EventModerationAdmin from './EventModerationAdmin';
import NfcOperations,{OrderGiftSetup} from './NfcOperations';
import ShipmentEditor from './ShipmentEditor';
import StoreAdminPanel from './StoreAdminPanel';
import MarkdownContent from './MarkdownContent';
import ArticleEditor from './ArticleEditor';
import { callStore } from '../services/catalogService';
import {getGuestHouseStatus, setGuestHouseEnabled as updateGuestHouseEnabled} from '../services/eventService';
import { listOrdersForAdmin, updateOrderStatus } from '../services/orderBackendService';
import {
  getSystemAvailability,
  updateSystemAvailability
} from '../services/authRoleService';
import {
  getAllShowcaseMemories,
  updateMemoryAvailability
} from '../services/memoryService';
import {
  getArticleAdminData,
  saveArticleAdmin,
  deleteArticleAdmin,
  moderateArticleComment,
  DEMO_ARTICLES,
  DEMO_COMMENTS
} from '../services/articleService';

export default function AdminPanelModal({ isOpen, onClose, onRefresh }) {
  const [activeTab, setActiveTab] = useState('marketing'); // 'orders' | 'articles' | 'moderation' | 'system' | 'nfc' | 'infrastructure'

  // Orders State
  const [orders, setOrders] = useState([]);
  const [orderPage,setOrderPage]=useState(0);
  const [orderSearch,setOrderSearch]=useState('');
  const [preview,setPreview]=useState(false);
  const [savingArticle,setSavingArticle]=useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // System Availability State
  const [systemConfig, setSystemConfig] = useState(getSystemAvailability());
  const [saveMessage, setSaveMessage] = useState('');
  const [guestHouseEnabled, setGuestHouseEnabled] = useState(null);
  const [guestHouseBusy, setGuestHouseBusy] = useState(false);

  // NFC Memories State
  const [memories, setMemories] = useState([]);

  // Articles & Moderation State
  const [adminArticles, setAdminArticles] = useState([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState(null);
  const [articleForm, setArticleForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    cover_image: '',
    category: 'Chế tác & Nghệ thuật',
    author_name: 'EMORIA Atelier',
    status: 'draft',
    allow_comments: true
  });
  const [adminComments,setAdminComments]=useState([]);

  // Load orders & memories on open
  const loadData = async () => {
    setIsLoadingOrders(true);
    try {
      const ords = await listOrdersForAdmin(orderPage,orderSearch);
      setOrders(ords);
    } catch (e) {
      setSaveMessage(e.message);
      setOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
    const editorial = await getArticleAdminData();
    if(editorial.success){setAdminArticles(editorial.articles);setAdminComments(editorial.comments);}else setSaveMessage(editorial.message);
    setMemories([]);
    setSystemConfig(getSystemAvailability());
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSaveMessage('');
    }
  }, [isOpen,orderPage,orderSearch]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setGuestHouseEnabled(null);
    getGuestHouseStatus().then(status => { if (active) setGuestHouseEnabled(status.enabled === true); })
      .catch(error => { if (active) setSaveMessage(error.message); });
    return () => { active = false; };
  }, [isOpen]);

  // Helpers cho Bài viết
  const handleOpenCreateArticle = () => {
    setEditingArticleId(null);
    setArticleForm({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      cover_image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1200&q=80',
      category: 'Chế tác & Nghệ thuật',
      author_name: 'EMORIA Atelier',
      status: 'draft',
      allow_comments: true
    });
    setPreview(false);
    setIsEditorOpen(true);
  };

  const handleOpenEditArticle = (art) => {
    setEditingArticleId(art.id);
    setArticleForm({
      title: art.title,
      slug: art.slug,
      excerpt: art.excerpt || '',
      content: art.content || '',
      cover_image: art.cover_image || '',
      category: art.category || 'Chế tác & Nghệ thuật',
      author_name: art.author_name || 'EMORIA Atelier',
      status: art.status || 'draft',
      allow_comments: art.allow_comments ?? true
    });
    setPreview(false);
    setIsEditorOpen(true);
  };

  const handleSaveArticle = async (statusOverride) => {
    if(savingArticle)return;
    setSavingArticle(true);
    const payload = {
      ...articleForm,
      status: statusOverride || articleForm.status,
      slug: articleForm.slug || articleForm.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    };

    const res = await saveArticleAdmin({ articleId: editingArticleId, payload });
    setSavingArticle(false);
    if (res.success) {
      if (editingArticleId) {
        setAdminArticles(prev => prev.map(a => a.id === editingArticleId ? { ...a, ...payload } : a));
      } else {
        setAdminArticles(prev => [{ id: res.article_id || 'art-' + Date.now(), ...payload, view_count: 0, likes_count: 0, published_at: new Date().toISOString() }, ...prev]);
      }
      await loadData();
      setIsEditorOpen(false);
      setSaveMessage(`Đã ${payload.status === 'published' ? 'xuất bản' : 'lưu nháp'} bài viết thành công!`);
      setTimeout(() => setSaveMessage(''), 3000);
      if (onRefresh) onRefresh();
    } else {
      alert(res.message || 'Lỗi khi lưu bài viết.');
    }
  };

  const handleDeleteArticle = async (art) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn bài viết "${art.title}" không? Hành động này không thể hoàn tác.`)) {
      return;
    }
    const res = await deleteArticleAdmin(art.id);
    if (res.success) {
      setAdminArticles(prev => prev.filter(a => a.id !== art.id));
      setSaveMessage(`Đã xóa vĩnh viễn bài viết "${art.title}".`);
      setTimeout(() => setSaveMessage(''), 3000);
      if (onRefresh) onRefresh();
    } else {
      alert(res.message || 'Lỗi khi xóa bài viết.');
    }
  };

  const handleToggleArticleStatus = async (art) => {
    const nextStatus = art.status === 'published' ? 'archived' : 'published';
    const res = await saveArticleAdmin({
      articleId: art.id,
      payload: { ...art, status: nextStatus }
    });
    if (res.success) {
      setAdminArticles(prev => prev.map(a => a.id === art.id ? { ...a, status: nextStatus } : a));
      setSaveMessage(`Đã chuyển trạng thái bài "${art.title}" thành: ${nextStatus === 'published' ? 'Đã xuất bản' : 'Bản nháp'}`);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Helpers cho Duyệt bình luận
  const handleModerateComment = async (commentId, nextStatus) => {
    const res = await moderateArticleComment(commentId, nextStatus);
    if (res.success) {
      setAdminComments(prev => nextStatus === 'deleted' ? prev.filter(c => c.id !== commentId) : prev.map(c => c.id === commentId ? {...c, status:nextStatus} : c));
      setSaveMessage(`Đã ${nextStatus === 'approved' ? 'phê duyệt' : nextStatus === 'hidden' ? 'ẩn' : 'xóa'} bình luận.`);
      setTimeout(() => setSaveMessage(''), 3000);
    } else {
      alert(res.message || 'Không thể xử lý bình luận.');
    }
  };

  if (!isOpen) return null;

  // Handle Order Status Update
  const handleStatusChange = async (orderId, newStatus) => {
    if(newStatus==='shipping'){setSaveMessage('Mở “Chi tiết món hàng & chuẩn bị NFC”, nhập mã vận đơn rồi bấm Bàn giao vận chuyển.');return;}
    setUpdatingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      await loadData();
      setUpdatingOrderId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
      setUpdatingOrderId(null);
    }
  };

  // Handle System Availability Toggle
  const handleToggleMaintenance = async () => {
    try {
      const updated = await updateSystemAvailability({
        isMaintenanceMode: !systemConfig.isMaintenanceMode,
      });
      setSystemConfig(updated);
      setSaveMessage('Đã cập nhật trạng thái khả dụng toàn hệ thống.');
      setTimeout(() => setSaveMessage(''), 3000);
      if (onRefresh) onRefresh();
    } catch (error) { setSaveMessage(error.message); }
  };

  const handleToggleGuestHouse = async () => {
    if (guestHouseBusy || guestHouseEnabled === null) return;
    if (guestHouseEnabled && !window.confirm('Tắt Sự kiện Guest xây nhà sẽ xóa vĩnh viễn ngôi nhà, ảnh và tài khoản của khách anonymous chưa đăng ký. Nhà của người đã đăng ký được giữ lại ở chế độ chỉ xem. Bạn có chắc muốn tắt?')) return;
    setGuestHouseBusy(true);
    try {
      await updateGuestHouseEnabled(!guestHouseEnabled);
      setGuestHouseEnabled(!guestHouseEnabled);
      setSaveMessage('Đã cập nhật Sự kiện Guest xây nhà.');
      if (onRefresh) onRefresh();
    } catch (error) { setSaveMessage(error.message); }
    finally { setGuestHouseBusy(false); }
  };

  // Handle Save VIP Passcode
  const handleSaveVipCode = async (newCode) => {
    try {
      const updated = await updateSystemAvailability({ vipPasscode: newCode });
      setSystemConfig(updated);
      setSaveMessage('Đã cập nhật mã VIP Passcode thành công.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) { setSaveMessage(error.message); }
  };

  // Handle Tag Availability Toggle
  const handleToggleTagAvailability = async (tagUid, nextStatus) => {
    await updateMemoryAvailability(tagUid, {
      status: nextStatus,
      unlockDate: nextStatus === 'timed_lock' ? '2026-10-20T18:00:00.000Z' : null,
      message: nextStatus === 'timed_lock' ? 'Đang niêm phong đến ngày kỷ niệm' : 'Khả dụng bình thường',
    });
    const editorial = await getArticleAdminData();
    if(editorial.success){setAdminArticles(editorial.articles);setAdminComments(editorial.comments);}else setSaveMessage(editorial.message);
    setMemories([]);
    if (onRefresh) onRefresh();
  };

  return (
    <AnimatePresence>
      <div
        className="admin-page min-h-screen px-3 sm:px-6 pt-32 pb-16 max-w-7xl mx-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full min-w-0 rounded-3xl bg-dark-900/95 border border-white/15 p-4 sm:p-8 text-slate-100"
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

            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Làm mới dữ liệu"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                aria-label="Về cửa hàng"
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <button className="store-button mb-3" onClick={()=>setActiveTab('memories')}>Memory Space & Tài khoản</button>
          <label className="sm:hidden store-label mb-6">Khu vực quản trị<select className="store-input" value={activeTab} onChange={e=>setActiveTab(e.target.value)}>{[['video-moderation','Kiểm duyệt video'],['marketing','Phân tích marketing'],['orders','Đơn hàng'],['catalog','Sản phẩm & kho'],['articles','Bài viết'],['moderation','Duyệt bình luận'],['memories','Memory Space & Tài khoản'],['nfc','Chip NFC'],['contacts','Liên hệ'],['store-settings','Cấu hình bán hàng'],['system','Bảo trì']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          {/* Navigation Tabs */}
          <div className="hidden sm:flex flex-wrap gap-2 mb-4">{[['video-moderation','Kiểm duyệt video'],['marketing','Phân tích marketing'],['catalog','Sản phẩm & kho'],['store-settings','Cấu hình bán hàng'],['contacts','Liên hệ']].map(([key,label])=><button key={key} onClick={()=>setActiveTab(key)} className={activeTab===key?'store-button':'px-4 py-2 text-sm bg-white/5 rounded-xl'}>{label}</button>)}</div>
          <div className="hidden sm:flex flex-wrap items-center gap-2 mb-6 border-b border-white/10 pb-3">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                activeTab === 'orders'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Đơn Hàng ({orders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('articles')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                activeTab === 'articles'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Bài Viết ({adminArticles.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('moderation')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                activeTab === 'moderation'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Duyệt Bình Luận ({adminComments.filter(c => c.status === 'pending').length})</span>
            </button>

            <button
              onClick={() => setActiveTab('events-moderation')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                activeTab === 'events-moderation'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Sự Kiện & Báo Cáo</span>
            </button>

            <button
              onClick={() => setActiveTab('nfc')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                activeTab === 'nfc'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <SmartphoneNfc className="w-4 h-4" />
              <span>Chip NFC</span>
            </button>

            <button
              onClick={() => setActiveTab('system')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                activeTab === 'system'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>Khả Dụng</span>
            </button>

            <button
              onClick={() => setActiveTab('infrastructure')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                activeTab === 'infrastructure'
                  ? 'bg-white text-dark-950 shadow-silver-glow'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Schema & RLS</span>
            </button>
          </div>

          {saveMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveMessage}</span>
            </div>
          )}

          {/* ================= TAB 1: ORDERS ================= */}
          {activeTab==='marketing' && <MarketingPanel />}
          {activeTab==='catalog' && <StoreAdminPanel />}
          {activeTab==='store-settings' && <StoreAdminPanel section="settings" />}
          {activeTab==='contacts' && <StoreAdminPanel section="contacts" />}
          {activeTab==='orders' && <div className="flex flex-wrap gap-3 mb-4"><input aria-label="Tìm mã đơn" placeholder="Tìm mã đơn" className="store-input !w-64" value={orderSearch} onChange={e=>{setOrderSearch(e.target.value);setOrderPage(0);}}/><button disabled={!orderPage} onClick={()=>setOrderPage(p=>p-1)}>Trước</button><span>Trang {orderPage+1}</span><button disabled={orders.length<25} onClick={()=>setOrderPage(p=>p+1)}>Sau</button><button onClick={async()=>{try{const n=await callStore('rpc_expire_orders');await loadData();setSaveMessage(`Đã xử lý ${n} đơn hết hạn.`);}catch(e){setSaveMessage(e.message);}}}>Xử lý đơn hết hạn</button></div>}
          {activeTab === 'video-moderation' && <VideoModerationAdmin/>}
          {activeTab === 'events-moderation' && <EventModerationAdmin/>}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {isLoadingOrders ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang tải danh sách đơn hàng...</span>
                </div>
              ) : orders.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Chưa có đơn hàng nào được đặt trong hệ thống.
                </div>
              ) : (
                orders.map((order) => (
                  <div key={order.id} className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs space-y-3">
                    <OrderGiftSetup order={order} onRefresh={loadData}/><ShipmentEditor order={order} onRefresh={loadData}/>
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
                        disabled={updatingOrderId === order.id}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-black/80 border border-white/20 text-white font-medium focus:outline-none focus:border-white/50 cursor-pointer disabled:opacity-50"
                      >
                        <option disabled={order.status!=='pending_payment'} value="pending_payment">Chờ Thanh Toán VietQR</option>
                        <option disabled={order.status!=='confirmed' && !(order.status==='pending_payment' && ['paid','overpaid'].includes(order.paymentStatus))} value="confirmed">Đã Tiếp Nhận & Xác Nhận</option>
                        <option disabled={!['confirmed','crafting_nfc'].includes(order.status)} value="crafting_nfc">Đang Đúc Bạc & Nạp Chip NFC</option>
                        <option disabled={!['crafting_nfc','shipping'].includes(order.status)} value="shipping">Đang Vận Chuyển</option>
                        <option disabled={order.status!=='completed'} value="completed">Đã Giao Hoàn Tất</option>
                        <option disabled={!['pending_payment','confirmed','crafting_nfc','cancelled'].includes(order.status)} value="cancelled">Đã Hủy Đơn</option>
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

                <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-white text-sm">Sự kiện Guest xây nhà</h3>
                    <p className="text-xs text-slate-400 mt-1">Cho khách xây nhà miễn phí. Khi tắt, nhà của khách chưa đăng ký sẽ bị xóa vĩnh viễn.</p>
                  </div>
                  <button type="button" role="switch" aria-checked={guestHouseEnabled === true} aria-label="Sự kiện Guest xây nhà"
                    disabled={guestHouseBusy || guestHouseEnabled === null} onClick={handleToggleGuestHouse}
                    className="min-h-11 px-4 py-2 rounded-xl bg-white/10 text-slate-200 text-xs font-bold disabled:opacity-50">
                    {guestHouseBusy ? 'Đang cập nhật…' : guestHouseEnabled === null ? 'Chưa tải trạng thái' : guestHouseEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
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
          {activeTab==='memories'&&<MemoryAccountsAdmin/>}
          {activeTab==='nfc'&&<NfcOperations/>}

          {/* ================= TAB: ARTICLES MANAGEMENT ================= */}
          {activeTab === 'articles' && (
            <div className="space-y-6 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-white text-sm">Danh Sách Bài Viết & Tạp Chí</h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">Soạn thảo, quản lý xuất bản, gỡ bài và xem trước</p>
                </div>
                <button
                  onClick={handleOpenCreateArticle}
                  className="px-4 py-2 rounded-xl bg-white text-dark-950 font-bold hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Soạn Bài Viết Mới</span>
                </button>
              </div>

              {/* Editor Form Modal / Overlay */}
              {isEditorOpen && (
                <div className="p-5 rounded-2xl bg-black/80 border border-white/20 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-300" />
                      <span>{editingArticleId ? 'Chỉnh Sửa Bài Viết' : 'Soạn Bài Viết Mới'}</span>
                    </h4>
                    <button
                      onClick={() => {if(window.confirm('Đóng trình soạn thảo? Thay đổi chưa lưu sẽ mất.'))setIsEditorOpen(false);}}
                      className="p-1 rounded-lg text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-300 block mb-1">Tiêu đề bài viết (*):</label>
                      <input
                        type="text"
                        value={articleForm.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setArticleForm(prev => ({
                            ...prev,
                            title: val,
                            slug: prev.slug || val.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                          }));
                        }}
                        placeholder="Nhập tiêu đề hấp dẫn..."
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-white/40"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 block mb-1">Đường dẫn tĩnh (Slug) (*):</label>
                      <input
                        type="text"
                        value={articleForm.slug}
                        onChange={(e) => setArticleForm(prev => ({ ...prev, slug: e.target.value }))}
                        placeholder="duong-dan-tinh-bai-viet"
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-white/40"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 block mb-1">Danh mục:</label>
                      <select
                        value={articleForm.category}
                        onChange={(e) => setArticleForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-white/15 text-white text-xs focus:outline-none"
                      >
                        <option value="Chế tác & Nghệ thuật">Chế tác & Nghệ thuật</option>
                        <option value="Công nghệ & NFC">Công nghệ & NFC</option>
                        <option value="Phong cách sống">Phong cách sống</option>
                        <option value="Hướng dẫn">Hướng dẫn</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-300 block mb-1">Ảnh bìa (URL):</label>
                      <input
                        type="text"
                        value={articleForm.cover_image}
                        onChange={(e) => setArticleForm(prev => ({ ...prev, cover_image: e.target.value }))}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-300 block mb-1">Đoạn tóm tắt mở đầu (Excerpt):</label>
                    <textarea
                      value={articleForm.excerpt}
                      onChange={(e) => setArticleForm(prev => ({ ...prev, excerpt: e.target.value }))}
                      rows={2}
                      placeholder="Tóm tắt ngắn gọn 1-2 câu về nội dung bài viết..."
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none resize-none"
                    />
                  </div>

                  <ArticleEditor value={articleForm.content}
                    onChange={content => setArticleForm(prev => ({ ...prev, content }))} />

                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={articleForm.allow_comments}
                        onChange={(e) => setArticleForm(prev => ({ ...prev, allow_comments: e.target.checked }))}
                        className="rounded border-white/20 text-dark-950"
                      />
                      <span>Cho phép bạn đọc gửi bình luận</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingArticle}
                        onClick={() => handleSaveArticle('draft')}
                        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-all cursor-pointer"
                      >
                        Lưu Bản Nháp
                      </button>
                      <button
                        type="button"
                        disabled={savingArticle}
                        onClick={() => handleSaveArticle('published')}
                        className="px-5 py-2 rounded-xl bg-white text-dark-950 font-bold hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Xuất Bản Ngay</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isEditorOpen && <><button className="store-button mb-4" onClick={()=>setPreview(!preview)}>Xem trước nội dung</button>{preview && <div className="p-6 border border-white/20 rounded-xl mb-5"><h2 className="font-serif text-2xl mb-4">{articleForm.title}</h2><MarkdownContent content={articleForm.content}/></div>}</>}
              {/* Articles Table */}
              <div className="space-y-3">
                {adminArticles.map((art) => (
                  <div
                    key={art.id}
                    className="p-4 rounded-2xl bg-black/40 border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={art.cover_image}
                        alt={art.title}
                        className="w-16 h-12 rounded-lg object-cover bg-white/5 border border-white/10 shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            art.status === 'published'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {art.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                          </span>
                          <span className="text-[10px] text-slate-400">{art.category}</span>
                        </div>
                        <h4 className="font-semibold text-white text-xs line-clamp-1">{art.title}</h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          slug: /{art.slug} • {art.view_count || 0} lượt đọc • {art.likes_count || 0} lượt thích
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleOpenEditArticle(art)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                        title="Chỉnh sửa nội dung"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleArticleStatus(art)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                          art.status === 'published'
                            ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                        }`}
                      >
                        {art.status === 'published' ? 'Gỡ Về Nháp' : 'Xuất Bản'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= TAB: COMMENTS MODERATION ================= */}
          {activeTab === 'moderation' && (
            <CommentModeration comments={adminComments} onModerate={handleModerateComment} />
          )}

          {/* ================= TAB 4: SCHEMA & RLS ================= */}
          {activeTab === 'infrastructure' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span>Cấu trúc Dữ liệu & RLS Policies (PostgreSQL)</span>
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  Toàn bộ 10 bảng cơ sở dữ liệu cùng 4 hàm RPC bảo mật đã được thiết kế tại file migration:
                  <code className="block mt-1 font-mono text-cyan-300 bg-black/60 p-2 rounded-xl">
                    supabase/migrations/20260913_init_emoria_schema.sql
                  </code>
                </p>
                <div className="space-y-2 pt-2 text-slate-400 border-t border-white/10">
                  <p>• <strong>Bảo vệ Thư tay & PIN:</strong> Hàm RPC <code className="text-white">rpc_get_memory_view</code> không trả về trường thư tay nếu chưa xác thực PIN.</p>
                  <p>• <strong>Cấp quyền tạm thời:</strong> <code className="text-white">rpc_verify_memory_pin</code> cấp grant token 2 giờ lưu tại bảng <code className="text-white">memory_access_grants</code>.</p>
                  <p>• <strong>Chống mất PIN ngoài ý muốn:</strong> <code className="text-white">rpc_update_memory_space</code> hỗ trợ 3 tùy chọn PIN: KEEP, SET, REMOVE.</p>
                  <p>• <strong>Phân quyền Admin:</strong> Đối chiếu trực tiếp từ bảng <code className="text-white">role_assignments</code>, loại bỏ hoàn toàn mật khẩu hardcoded.</p>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
