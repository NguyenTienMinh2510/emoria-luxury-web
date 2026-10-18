import MemoryAccountsAdmin from '../components/MemoryAccountsAdmin';
import {useLanguage} from '../i18n/LanguageProvider';
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
import ArticleEditor from '../components/ArticleEditor';
import { callStore } from '../services/catalogService';
import {getGuestHouseStatus, setGuestHouseEnabled as updateGuestHouseEnabled} from '../services/eventService';
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
  deleteArticleAdmin,
  moderateArticleComment
} from '../services/articleService';

export default function AdminView({
  currentUser,
  isAdmin = false,
  onOpenAuth,
  onNavigateToHome,
  onRefresh
}) {
  const {t}=useLanguage();
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
  const [guestHouseEnabled, setGuestHouseEnabled] = useState(null);
  const [guestHouseBusy, setGuestHouseBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    getGuestHouseStatus().then(status => { if (active) setGuestHouseEnabled(status.enabled === true); })
      .catch(error => { if (active) setSaveMessage(error.message); });
    return () => { active = false; };
  }, [isAdmin]);

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

  const handleDeleteArticle = async (art) => {
    if (!window.confirm(t(`Bạn có chắc chắn muốn xóa vĩnh viễn bài viết "${art.title}" không? Hành động này không thể hoàn tác.`, `Are you sure you want to permanently delete article "${art.title}"? This cannot be undone.`))) {
      return;
    }
    const res = await deleteArticleAdmin(art.id);
    if (res.success) {
      setAdminArticles(prev => prev.filter(a => a.id !== art.id));
      setSaveMessage(t(`Đã xóa vĩnh viễn bài viết "${art.title}".`, `Permanently deleted article "${art.title}".`));
      setTimeout(() => setSaveMessage(''), 3000);
      if (onRefresh) onRefresh();
    } else {
      alert(res.message || t('Lỗi khi xóa bài viết.', 'Failed to delete article.'));
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
            {t("Bảng Quản Trị Hệ Thống","Admin dashboard")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6 font-light">
            {t("Trang này chỉ dành cho tài khoản có quyền Quản trị viên (Admin).","This page requires an administrator account.")}
            {currentUser ? ` Bạn đang đăng nhập với tài khoản: ${currentUser}.` : t("Vui lòng đăng nhập bằng tài khoản Quản trị để tiếp tục.","Sign in as an administrator to continue.")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onOpenAuth}
              className="store-button flex items-center justify-center gap-2 min-h-11"
            >
              <Key className="w-4 h-4" />
              <span>{currentUser ? t("Đổi Tài Khoản Quản Trị","Switch admin account") : t("Đăng Nhập Quản Trị Viên","Admin sign in")}</span>
            </button>
            <button
              onClick={onNavigateToHome}
              className="px-5 py-2.5 rounded-full border border-white/20 hover:bg-white/10 text-slate-200 text-sm font-semibold transition-all flex items-center justify-center gap-2 min-h-11"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("Về Trang Chủ","Back to Home")}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // TABS CONFIGURATION
  const tabs = [
    { id:'video-moderation',label:t("Kiểm Duyệt Video","AI media moderation"),icon:Shield },
    { id: 'orders', label: t("Đơn Hàng & Vận Chuyển","Orders & shipping"), icon: Package },
    { id: 'marketing', label: t("Báo Cáo & GA4","Reports & GA4"), icon: BarChart3 },
    { id: 'memories', label: t('Memory Space & Tài khoản','Memory Spaces & Accounts'), icon: UserCheck },
    { id: 'nfc', label: 'Chip NFC', icon: SmartphoneNfc },
    { id: 'settings', label: t("Cấu Hình Cửa Hàng","Store settings"), icon: Settings },
    { id: 'articles', label: t("Tạp Chí & Bài Viết","Journal & articles"), icon: BookOpen },
    { id: 'moderation', label: t("Duyệt Bình Luận","Comment moderation"), icon: MessageSquare, badge: adminComments.filter(c => c.status === 'pending').length },
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
              title={t("Quay lại trang chủ","Back to Home")}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("Về Trang Chủ","Back to Home")}</span>
            </button>

            <div className="h-4 w-px bg-white/15 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-300">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-serif font-bold text-white tracking-wide flex items-center gap-2">
                  <span>{t("Trung Tâm Quản Trị EMORIA","EMORIA Admin")}</span>
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
              title={t("Tải lại dữ liệu quản trị","Refresh admin data")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t("Làm mới","Refresh")}</span>
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-slate-400 font-medium">{t("Tài khoản quản trị:","Administrator:")}</p>
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
                  <h2 className="font-serif text-2xl font-bold text-white">{t("Quản Lý Đơn Hàng & Giao Nhận","Orders & delivery")}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t("Duyệt chuyển trạng thái đơn, kiểm tra thanh toán VietQR / COD và chuẩn bị chip NFC.","Manage order status, VietQR / COD payments and gift preparation.")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={t("Mã đơn, SĐT hoặc mã vận đơn","Order ID, phone or tracking number")}
                    value={orderSearch}
                    onChange={(e) => {setOrderSearch(e.target.value);setOrderPage(0);}}
                    className="store-input !py-2 text-xs w-full sm:w-64"
                  />
                </div>
              </div>

              <PaymentReview/>
              <div className="flex flex-wrap items-center gap-3"><label className="store-label">{t("Lọc trạng thái","Filter status")}<select className="store-input" value={orderStatus} onChange={e=>{setOrderStatus(e.target.value);setOrderPage(0);}}>{[['',t("Tất cả","All")],['pending_payment',t("Chờ thanh toán / duyệt","Awaiting payment / review")],['confirmed',t("Đã tiếp nhận","Accepted")],['crafting_nfc',t("Đang chuẩn bị","Preparing")],['shipping',t("Đang giao","Shipping")],['completed',t("Đã giao","Delivered")],['cancelled',t("Đã hủy","Cancelled")]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button className="store-button" disabled={!orderPage||isLoadingOrders} onClick={()=>setOrderPage(p=>p-1)}>{t("Trước","Previous")}</button><span>Trang {orderPage+1}</span><button className="store-button" disabled={orders.length<25||isLoadingOrders} onClick={()=>setOrderPage(p=>p+1)}>{t("Sau","Next")}</button></div>
              {isLoadingOrders ? (
                <div className="p-12 text-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-500" />
                  <p className="text-sm">{t("Đang tải danh sách đơn hàng...","Loading orders...")}</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-white/15 rounded-2xl bg-white/[0.02]">
                  <Package className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                  <p className="text-sm text-slate-300 font-semibold">{t("Chưa có đơn hàng nào.","No orders yet.")}</p>
                  <p className="text-xs text-slate-500 mt-1">{t("Các đơn đặt mua từ Cửa Hàng sẽ xuất hiện tại đây.","Shop orders will appear here.")}</p>
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
                            {ord.status === 'pending_payment' ? (['paid','overpaid'].includes(ord.paymentStatus)?t("Đã thanh toán · Chờ duyệt","Paid · awaiting review"):t("Chờ thanh toán","Awaiting payment")) :
                             ord.status === 'confirmed' ? t("Đã xác nhận","Confirmed") :
                             ord.status === 'crafting_nfc' ? t("Đang chuẩn bị NFC","Preparing gift") :
                             ord.status === 'shipping' ? t("Đang giao hàng","Shipping") :
                             ord.status === 'completed' ? t("Hoàn tất","Completed") : t("Đã hủy","Cancelled")}
                          </span>
                          {ord.isTest && (
                            <span className="px-2 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {t("Đơn Thử Nghiệm","Test order")}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400">
                          {new Date(ord.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-4 text-xs">
                        <div>
                          <p className="text-slate-400">{t("Khách hàng:","Customer:")}</p>
                          <p className="font-bold text-white mt-0.5">{ord.customerName || t("Khách vãng lai","Guest")}</p>
                          <p className="text-slate-400 font-mono mt-0.5">{ord.phone}</p>
                          <p className="text-slate-400 mt-1 line-clamp-2">{ord.address}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">{t("Thanh toán:","Payment:")}</p>
                          <p className="font-bold text-white mt-0.5 uppercase">{ord.paymentMethod}</p>
                          <p className="text-slate-300 font-semibold mt-1">
                            {t("Tổng:","Total:")} {new Intl.NumberFormat('vi-VN').format(ord.totals?.finalTotal || 0)} đ
                          </p>
                          {ord.hasGiftBox && (
                            <p className="text-amber-300 mt-1 flex items-center gap-1 text-[11px]">
                              <span>{t("✦ Có gói hộp quà EMORIA","✦ EMORIA gift wrapping")}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col justify-between gap-3">
                          <div>
                            <p className="text-slate-400">{t("Thao tác duyệt đơn:","Order actions:")}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {ord.status === 'pending_payment' && (
                                <button
                                  onClick={() => handleStatusChange(ord.id, 'confirmed')}
                                  disabled={updatingOrderId === ord.id || !['paid','overpaid'].includes(ord.paymentStatus)}
                                  className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold border border-sky-500/30 transition-all cursor-pointer"
                                >
                                  {t("Duyệt đơn đã thanh toán","Approve paid order")}
                                </button>
                              )}
                              {ord.status === 'confirmed' && (
                                <button
                                  onClick={() => handleStatusChange(ord.id, 'crafting_nfc')}
                                  disabled={updatingOrderId === ord.id}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-all cursor-pointer"
                                >
                                  {t("Bắt đầu chuẩn bị","Start preparation")}
                                </button>
                              )}
                              {['pending_payment','confirmed','crafting_nfc'].includes(ord.status) && (
                                <button
                                  onClick={() => handleStatusChange(ord.id, 'cancelled')}
                                  disabled={updatingOrderId === ord.id}
                                  className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold border border-red-500/30 transition-all cursor-pointer"
                                >
                                  {t("Hủy Đơn","Cancel order")}
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
          {activeTab==='memories'&&<MemoryAccountsAdmin/>}
          {activeTab === 'nfc' && (
            <div className="space-y-6">
              <NfcOperations onRefresh={loadData} />
            </div>
          )}

          {/* 4. SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-white">{t("Cấu Hình Cửa Hàng & Toàn Hệ Thống","Store & system settings")}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t("Bật/tắt chế độ thử nghiệm (Sandbox banner), nhận đơn, COD, ngân hàng VietQR và danh mục sản phẩm.","Configure sandbox mode, orders, COD, VietQR bank details and the catalog.")}</p>
                </div>
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setSettingsSubSection('settings')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${settingsSubSection === 'settings' ? 'bg-white text-dark-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
                  >
                    {t("Cấu Hình & Sandbox","Settings & sandbox")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubSection('catalog')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${settingsSubSection === 'catalog' ? 'bg-white text-dark-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
                  >
                    {t("Sản Phẩm & Tồn Kho","Products & stock")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubSection('contacts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${settingsSubSection === 'contacts' ? 'bg-white text-dark-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
                  >
                    {t("Yêu Cầu Liên Hệ","Contact requests")}
                  </button>
                </div>
              </div>
              <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-white text-sm">Sự kiện Guest xây nhà</h3>
                  <p className="text-xs text-slate-400 mt-1">Cho khách xây nhà miễn phí. Khi tắt, nhà của khách chưa đăng ký sẽ bị xóa vĩnh viễn.</p>
                </div>
                <button type="button" role="switch" aria-checked={guestHouseEnabled === true} aria-label="Sự kiện Guest xây nhà"
                  disabled={guestHouseBusy || guestHouseEnabled === null} onClick={handleToggleGuestHouse}
                  className={`min-h-11 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 ${guestHouseEnabled ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-slate-200'}`}>
                  {guestHouseBusy ? 'Đang cập nhật…' : guestHouseEnabled === null ? 'Chưa tải trạng thái' : guestHouseEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                </button>
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
                  <h2 className="font-serif text-2xl font-bold text-white">{t("Tạp Chí & Bài Viết Chế Tác","Journal & craft stories")}</h2>
                  <p className="text-xs text-slate-400 mt-1">{t("Biên tập các câu chuyện thương hiệu, kỹ nghệ đính đá và hướng dẫn trang sức NFC.","Edit brand stories, craft articles and NFC jewelry guides.")}</p>
                </div>
                <button
                  onClick={handleOpenCreateArticle}
                  className="store-button flex items-center gap-2 min-h-11 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t("Viết Bài Mới","New article")}</span>
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
                        {art.status === 'published' ? t("Ẩn về nháp","Unpublish") : t("Xuất bản ngay","Publish now")}
                      </button>
                      <button
                        onClick={() => handleOpenEditArticle(art)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{t("Sửa bài","Edit article")}</span>
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
                        {editingArticleId ? t("Chỉnh Sửa Bài Viết","Edit article") : t("Soạn Thảo Bài Viết Mới","New article")}
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
                        <label className="store-label">{t("Tiêu đề bài viết","Article title")}</label>
                        <input
                          type="text"
                          value={articleForm.title}
                          onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                          className="store-input"
                          placeholder={t("Ví dụ: Nghệ thuật chế tác trang sức S925...","e.g. The art of S925 jewelry...")}
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="store-label">{t("Chuyên mục","Category")}</label>
                          <input
                            type="text"
                            value={articleForm.category}
                            onChange={(e) => setArticleForm({ ...articleForm, category: e.target.value })}
                            className="store-input"
                          />
                        </div>
                        <div>
                          <label className="store-label">{t("Ảnh bìa (URL)","Cover image URL")}</label>
                          <input
                            type="text"
                            value={articleForm.cover_image}
                            onChange={(e) => setArticleForm({ ...articleForm, cover_image: e.target.value })}
                            className="store-input"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="store-label">{t("Tóm tắt ngắn (Excerpt)","Excerpt")}</label>
                        <textarea
                          rows={2}
                          value={articleForm.excerpt}
                          onChange={(e) => setArticleForm({ ...articleForm, excerpt: e.target.value })}
                          className="store-input"
                        />
                      </div>
                      <ArticleEditor value={articleForm.content} disabled={savingArticle}
                        onChange={content => setArticleForm(form => ({ ...form, content }))} />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                      <button
                        onClick={() => setIsEditorOpen(false)}
                        className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                      >
                        {t("Hủy","Cancel")}
                      </button>
                      <button
                        onClick={() => handleSaveArticle('draft')}
                        disabled={savingArticle}
                        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold"
                      >
                        {t("Lưu Nháp","Save draft")}
                      </button>
                      <button
                        onClick={() => handleSaveArticle('published')}
                        disabled={savingArticle}
                        className="store-button"
                      >
                        {savingArticle ? t("Đang lưu...","Saving...") : t("Xuất Bản","Publish")}
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
