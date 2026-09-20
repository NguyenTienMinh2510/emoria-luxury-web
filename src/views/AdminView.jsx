import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Package, Truck, SmartphoneNfc, Power, 
  CheckCircle2, Clock, AlertTriangle, Key, RefreshCw, 
  Settings, UserCheck, Eye, Edit3, Lock, Unlock, Database,
  BookOpen, MessageSquare, Plus, Trash2, Check, EyeOff, FileText, Send,
  ArrowLeft, LogOut, ExternalLink, Sparkles, ChevronRight, Store, BarChart3
} from 'lucide-react';
import CommentModeration from '../components/CommentModeration';
import MarketingPanel from '../components/MarketingPanel';
import VideoModerationAdmin from '../components/VideoModerationAdmin';
import NfcOperations, { OrderGiftSetup } from '../components/NfcOperations';
import PaymentStatus from '../components/PaymentStatus';
import PaymentReview from '../components/PaymentReview';
import ShipmentEditor from '../components/ShipmentEditor';
import StoreAdminPanel from '../components/StoreAdminPanel';
import MarkdownContent from '../components/MarkdownContent';
import { callStore } from '../services/catalogService';
import { listOrdersForAdmin, updateOrderStatus } from '../services/orderBackendService';
import { 
  getSystemAvailability, 
  updateSystemAvailability,
  signOutUser
} from '../services/authRoleService';
import { 
  getAllShowcaseMemories, 
  updateMemoryAvailability 
} from '../services/memoryService';
import { 
  getArticleAdminData, 
  saveArticleAdmin, 
  moderateArticleComment 
} from '../services/articleService';

export default function AdminView({ 
  currentUser, 
  isAdmin = false, 
  onOpenAuth, 
  onNavigateToHome,
  onRefresh
}) {
  // Tabs: 'orders' | 'marketing' | 'nfc' | 'settings' | 'articles' | 'moderation'
  const [activeTab, setActiveTab] = useState('orders');
  
  // Orders State
  const [orders, setOrders] = useState([]);
  const [orderPage, setOrderPage] = useState(0);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus,setOrderStatus]=useState('');
  const [preview, setPreview] = useState(false);
  const [savingArticle, setSavingArticle] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // System Availability State
  const [systemConfig, setSystemConfig] = useState(getSystemAvailability());
  const [saveMessage, setSaveMessage] = useState('');
  const [settingsSubSection, setSettingsSubSection] = useState('settings');

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
  const [adminComments, setAdminComments] = useState([]);

  // Load orders & system data
  const loadData = async () => {
    setIsLoadingOrders(true);
    try {
      const ords = await listOrdersForAdmin(orderPage, orderSearch, orderStatus);
      setOrders(ords || []);
    } catch (e) {
      setSaveMessage(e.message);
      setOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }

    try {
      const editorial = await getArticleAdminData();
      if (editorial && editorial.success) {
        setAdminArticles(editorial.articles || []);
        setAdminComments(editorial.comments || []);
      }
    } catch (e) {
      console.warn('Could not load editorial admin data:', e);
    }

    setSystemConfig(getSystemAvailability());
  };

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin, orderPage, orderSearch, orderStatus]);

  // Handle Order Status Update
  const handleStatusChange = async (orderId, newStatus) => {
    if (newStatus === 'shipping') {
      setSaveMessage('Mở "Chi tiết món hàng & chuẩn bị NFC", nhập mã vận đơn rồi bấm Bàn giao vận chuyển.');
      return;
    }
    setUpdatingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      await loadData();
      setSaveMessage('Cập nhật trạng thái đơn hàng thành công!');
      setTimeout(() => setSaveMessage(''), 3000);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Handle Article editor
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
    if (savingArticle) return;
    setSavingArticle(true);
    const payload = {
      ...articleForm,
      status: statusOverride || articleForm.status,
      slug: articleForm.slug || articleForm.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    };

    const res = await saveArticleAdmin({ articleId: editingArticleId, payload });
    setSavingArticle(false);
    if (res.success) {
      await loadData();
      setIsEditorOpen(false);
      setSaveMessage(`Đã ${payload.status === 'published' ? 'xuất bản' : 'lưu nháp'} bài viết thành công!`);
      setTimeout(() => setSaveMessage(''), 3000);
      if (onRefresh) onRefresh();
    } else {
      alert(res.message || 'Lỗi khi lưu bài viết.');
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

  // ACCESS DENIED GATE (If not Admin)
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-dark-950 text-slate-100 flex items-center justify-center p-4 pt-24 selection:bg-white/20">
        <div className="w-full max-w-lg p-8 sm:p-10 rounded-3xl bg-dark-900/90 border border-white/20 shadow-2xl backdrop-blur-2xl text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-red-400">
            <Lock className="w-8 h-8 stroke-1" />
          </div>

          <span className="font-serif text-2xl font-bold tracking-[0.2em] text-metallic">
            EMORIA LUXURY
          </span>
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-white mt-2 mb-2 uppercase">
            Bảng Quản Trị Hệ Thống
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6 font-light">
            Trang này chỉ dành cho tài khoản có quyền Quản trị viên (Admin). 
            {currentUser ? ` Bạn đang đăng nhập với tài khoản: ${currentUser}.` : ' Vui lòng đăng nhập bằng tài khoản Quản trị để tiếp tục.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onOpenAuth}
              className="store-button flex items-center justify-center gap-2 min-h-11"
            >
              <Key className="w-4 h-4" />
              <span>{currentUser ? 'Đổi Tài Khoản Quản Trị' : 'Đăng Nhập Quản Trị Viên'}</span>
            </button>
            <button
              onClick={onNavigateToHome}
              className="px-5 py-2.5 rounded-full border border-white/20 hover:bg-white/10 text-slate-200 text-sm font-semibold transition-all flex items-center justify-center gap-2 min-h-11"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Về Trang Chủ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // TABS CONFIGURATION
  const tabs = [
    { id:'video-moderation',label:'Kiểm Duyệt Video',icon:Shield },
    { id: 'orders', label: 'Đơn Hàng & Vận Chuyển', icon: Package },
    { id: 'marketing', label: 'Báo Cáo & GA4', icon: BarChart3 },
    { id: 'nfc', label: 'Kỷ Vật & Chip NFC', icon: SmartphoneNfc },
    { id: 'settings', label: 'Cấu Hình Cửa Hàng', icon: Settings },
    { id: 'articles', label: 'Tạp Chí & Bài Viết', icon: BookOpen },
    { id: 'moderation', label: 'Duyệt Bình Luận', icon: MessageSquare, badge: adminComments.filter(c => c.status === 'pending').length },
  ];

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 pt-24 pb-20 selection:bg-white/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* TOP BAR / BREADCRUMB */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateToHome}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border border-white/10 shadow-sm"
              title="Quay lại trang chủ"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Về Trang Chủ</span>
            </button>

            <div className="h-4 w-px bg-white/15 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-300">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-serif font-bold text-white tracking-wide flex items-center gap-2">
                  <span>Trung Tâm Quản Trị EMORIA</span>
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-mono font-bold">
                    Admin
                  </span>
                </h1>
              </div>
            </div>
          </div>

          {/* User info & Reload */}
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 animate-fade-in">
                {saveMessage}
              </span>
            )}
            <button
              onClick={loadData}
              disabled={isLoadingOrders}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all flex items-center gap-1.5 text-xs cursor-pointer"
              title="Tải lại dữ liệu quản trị"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-slate-400 font-medium">Tài khoản quản trị:</p>
              <p className="text-xs font-semibold text-white">{currentUser}</p>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS PILL */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar border-b border-white/10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-white text-dark-950 shadow-silver-glow font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-white/10 bg-white/5 border border-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB CONTENTS */}
        <div className="min-w-0">
          {/* 1. ORDERS TAB */}
          {activeTab === 'video-moderation' && <VideoModerationAdmin/>}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">Quản Lý Đơn Hàng & Giao Nhận</h2>
                  <p className="text-xs text-slate-400 mt-1">Duyệt chuyển trạng thái đơn, kiểm tra thanh toán VietQR / COD và chuẩn bị chip NFC.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Mã đơn, SĐT hoặc mã vận đơn"
                    value={orderSearch}
                    onChange={(e) => {setOrderSearch(e.target.value);setOrderPage(0);}}
                    className="store-input !py-2 text-xs w-full sm:w-64"
                  />
                </div>
              </div>

              <PaymentReview/>
              <div className="flex flex-wrap items-center gap-3"><label className="store-label">Lọc trạng thái<select className="store-input" value={orderStatus} onChange={e=>{setOrderStatus(e.target.value);setOrderPage(0);}}>{[['','Tất cả'],['pending_payment','Chờ thanh toán / duyệt'],['confirmed','Đã tiếp nhận'],['crafting_nfc','Đang chuẩn bị'],['shipping','Đang giao'],['completed','Đã giao'],['cancelled','Đã hủy']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button className="store-button" disabled={!orderPage||isLoadingOrders} onClick={()=>setOrderPage(p=>p-1)}>Trước</button><span>Trang {orderPage+1}</span><button className="store-button" disabled={orders.length<25||isLoadingOrders} onClick={()=>setOrderPage(p=>p+1)}>Sau</button></div>
              {isLoadingOrders ? (
                <div className="p-12 text-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-500" />
                  <p className="text-sm">Đang tải danh sách đơn hàng...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-white/15 rounded-2xl bg-white/[0.02]">
                  <Package className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                  <p className="text-sm text-slate-300 font-semibold">Chưa có đơn hàng nào.</p>
                  <p className="text-xs text-slate-500 mt-1">Các đơn đặt mua từ Cửa Hàng sẽ xuất hiện tại đây.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((ord) => (
                    <div 
                      key={ord.id}
                      className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-white text-sm break-all">{ord.id}</span>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            ord.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            ord.status === 'confirmed' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' :
                            ord.status === 'shipping' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            ord.status === 'cancelled' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                            'bg-white/10 text-slate-300 border border-white/15'
                          }`}>
                            {ord.status === 'pending_payment' ? (['paid','overpaid'].includes(ord.paymentStatus)?'Đã thanh toán · Chờ duyệt':'Chờ thanh toán') :
                             ord.status === 'confirmed' ? 'Đã xác nhận' :
                             ord.status === 'crafting_nfc' ? 'Đang chuẩn bị NFC' :
                             ord.status === 'shipping' ? 'Đang giao hàng' :
                             ord.status === 'completed' ? 'Hoàn tất' : 'Đã hủy'}
                          </span>
                          {ord.isTest && (
                            <span className="px-2 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Đơn Thử Nghiệm
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400">
                          {new Date(ord.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-4 text-xs">
                        <div>
                          <p className="text-slate-400">Khách hàng:</p>
                          <p className="font-bold text-white mt-0.5">{ord.customerName || 'Khách vãng lai'}</p>
                          <p className="text-slate-400 font-mono mt-0.5">{ord.phone}</p>
                          <p className="text-slate-400 mt-1 line-clamp-2">{ord.address}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Thanh toán:</p>
                          <p className="font-bold text-white mt-0.5 uppercase">{ord.paymentMethod}</p>
                          <p className="text-slate-300 font-semibold mt-1">
                            Tổng: {new Intl.NumberFormat('vi-VN').format(ord.totals?.finalTotal || 0)} đ
                          </p>
                          {ord.hasGiftBox && (
                            <p className="text-amber-300 mt-1 flex items-center gap-1 text-[11px]">
                              <span>✦ Có gói hộp quà EMORIA</span>
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col justify-between gap-3">
                          <div>
                            <p className="text-slate-400">Thao tác duyệt đơn:</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {ord.status === 'pending_payment' && (
                                <button
                                  onClick={() => handleStatusChange(ord.id, 'confirmed')}
                                  disabled={updatingOrderId === ord.id || !['paid','overpaid'].includes(ord.paymentStatus)}
                                  className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold border border-sky-500/30 transition-all cursor-pointer"
                                >
                                  Duyệt đơn đã thanh toán
                                </button>
                              )}
                              {ord.status === 'confirmed' && (
                                <button
                                  onClick={() => handleStatusChange(ord.id, 'crafting_nfc')}
                                  disabled={updatingOrderId === ord.id}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-all cursor-pointer"
                                >
                                  Bắt đầu chuẩn bị
                                </button>
                              )}
                              {['pending_payment','confirmed','crafting_nfc'].includes(ord.status) && (
                                <button
                                  onClick={() => handleStatusChange(ord.id, 'cancelled')}
                                  disabled={updatingOrderId === ord.id}
                                  className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold border border-red-500/30 transition-all cursor-pointer"
                                >
                                  Hủy Đơn
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Chi tiết chuẩn bị quà & NFC nếu có */}
                      <PaymentStatus order={ord}/>
                      <OrderGiftSetup order={ord} onRefresh={loadData} />
                      <ShipmentEditor order={ord} onRefresh={loadData} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. MARKETING & GA4 TAB */}
          {activeTab === 'marketing' && (
            <div className="space-y-6">
              <MarketingPanel />
            </div>
          )}

          {/* 3. NFC & MEMORY SPACES TAB */}
          {activeTab === 'nfc' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl font-bold text-white">Quản Lý Chip NFC & Không Gian Kỷ Niệm</h2>
                <p className="text-xs text-slate-400 mt-1">Cấp phát mã định danh chip, bàn giao mã nhận quyền (Claim Code) và kiểm soát trạng thái kỷ niệm.</p>
              </div>
              <NfcOperations onRefresh={loadData} />
            </div>
          )}

          {/* 4. SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">Cấu Hình Cửa Hàng & Toàn Hệ Thống</h2>
                  <p className="text-xs text-slate-400 mt-1">Bật/tắt chế độ thử nghiệm (Sandbox banner), nhận đơn, COD, ngân hàng VietQR và danh mục sản phẩm.</p>
                </div>
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setSettingsSubSection('settings')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${settingsSubSection === 'settings' ? 'bg-white text-dark-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
                  >
                    Cấu Hình & Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubSection('catalog')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${settingsSubSection === 'catalog' ? 'bg-white text-dark-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
                  >
                    Sản Phẩm & Tồn Kho
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubSection('contacts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${settingsSubSection === 'contacts' ? 'bg-white text-dark-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
                  >
                    Yêu Cầu Liên Hệ
                  </button>
                </div>
              </div>
              <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10">
                <StoreAdminPanel section={settingsSubSection} />
              </div>
            </div>
          )}

          {/* 5. ARTICLES TAB */}
          {activeTab === 'articles' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">Tạp Chí & Bài Viết Chế Tác</h2>
                  <p className="text-xs text-slate-400 mt-1">Biên tập các câu chuyện thương hiệu, kỹ nghệ đính đá và hướng dẫn trang sức NFC.</p>
                </div>
                <button
                  onClick={handleOpenCreateArticle}
                  className="store-button flex items-center gap-2 min-h-11 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Viết Bài Mới</span>
                </button>
              </div>

              {/* Articles List */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {adminArticles.map((art) => (
                  <div
                    key={art.id}
                    className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      {art.cover_image && (
                        <img 
                          src={art.cover_image} 
                          alt={art.title} 
                          className="w-full h-40 object-cover rounded-xl mb-3" 
                        />
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          art.status === 'published' 
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {art.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                        </span>
                        <span className="text-[11px] text-slate-400">{art.category}</span>
                      </div>
                      <h3 className="font-serif text-base font-bold text-white line-clamp-2">{art.title}</h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{art.excerpt}</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                      <button
                        onClick={() => handleToggleArticleStatus(art)}
                        className="text-slate-300 hover:text-white underline cursor-pointer"
                      >
                        {art.status === 'published' ? 'Ẩn về nháp' : 'Xuất bản ngay'}
                      </button>
                      <button
                        onClick={() => handleOpenEditArticle(art)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa bài</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Editor Modal */}
              {isEditorOpen && (
                <div className="fixed inset-0 z-50 bg-dark-950/85 backdrop-blur-xl p-4 sm:p-6 flex items-center justify-center">
                  <div className="relative w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/20 bg-dark-900 p-6 sm:p-8 text-white space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <h3 className="font-serif text-xl font-bold">
                        {editingArticleId ? 'Chỉnh Sửa Bài Viết' : 'Soạn Thảo Bài Viết Mới'}
                      </h3>
                      <button 
                        onClick={() => setIsEditorOpen(false)}
                        className="p-1 rounded-full hover:bg-white/10"
                      >
                        <Trash2 className="w-5 h-5 text-slate-400" />
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="store-label">Tiêu đề bài viết</label>
                        <input
                          type="text"
                          value={articleForm.title}
                          onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                          className="store-input"
                          placeholder="Ví dụ: Nghệ thuật chế tác trang sức S925..."
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="store-label">Chuyên mục</label>
                          <input
                            type="text"
                            value={articleForm.category}
                            onChange={(e) => setArticleForm({ ...articleForm, category: e.target.value })}
                            className="store-input"
                          />
                        </div>
                        <div>
                          <label className="store-label">Ảnh bìa (URL)</label>
                          <input
                            type="text"
                            value={articleForm.cover_image}
                            onChange={(e) => setArticleForm({ ...articleForm, cover_image: e.target.value })}
                            className="store-input"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="store-label">Tóm tắt ngắn (Excerpt)</label>
                        <textarea
                          rows={2}
                          value={articleForm.excerpt}
                          onChange={(e) => setArticleForm({ ...articleForm, excerpt: e.target.value })}
                          className="store-input"
                        />
                      </div>
                      <div>
                        <label className="store-label">Nội dung chi tiết (Markdown)</label>
                        <textarea
                          rows={8}
                          value={articleForm.content}
                          onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
                          className="store-input font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                      <button
                        onClick={() => setIsEditorOpen(false)}
                        className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => handleSaveArticle('draft')}
                        disabled={savingArticle}
                        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold"
                      >
                        Lưu Nháp
                      </button>
                      <button
                        onClick={() => handleSaveArticle('published')}
                        disabled={savingArticle}
                        className="store-button"
                      >
                        {savingArticle ? 'Đang lưu...' : 'Xuất Bản'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. MODERATION TAB */}
          {activeTab === 'moderation' && (
            <CommentModeration comments={adminComments} onModerate={handleModerateComment} />
          )}
        </div>

      </div>
    </div>
  );
}
