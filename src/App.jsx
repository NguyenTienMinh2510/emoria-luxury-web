import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ShopView from './views/ShopView';
import MemorySpaceView from './views/MemorySpaceView';
import ArticlesView from './views/ArticlesView';
import ArticleDetailView from './views/ArticleDetailView';
import ArticlesSection from './components/ArticlesSection';
import HeroSection from './components/HeroSection';
import CollectionShowcase from './components/CollectionShowcase';
import ProductCatalog from './components/ProductCatalog';
import FeedbackSection from './components/FeedbackSection';
import AboutSection from './components/AboutSection';
import ContactSection from './components/ContactSection';
import Footer from './components/Footer';
import NFCDemoModal from './components/NFCDemoModal';
import MemoryViewer from './components/MemoryViewer';
import ProductDetailModal from './components/ProductDetailModal';
import CartDrawer from './components/CartDrawer';
import AuthModal from './components/AuthModal';
import CheckoutModal from './components/CheckoutModal';
import AdminPanelModal from './components/AdminPanelModal';
import { 
  SmartphoneNfc, Shield, User, Key, Lock, Unlock, 
  Sparkles, CheckCircle2, ChevronUp, ChevronDown, Power
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import { 
  ROLES, 
  getCurrentAuthSession, 
  resolveCurrentSessionRole,
  getSystemAvailability, 
  fetchSystemStatus,
  updateSystemAvailability,
  signOutUser
} from './services/authRoleService';

export default function App() {
  // Navigation View: Mặc định là 'home' (Trang chủ & Câu chuyện thương hiệu)
  const [currentView, setCurrentView] = useState('home');
  const [currentTag, setCurrentTag] = useState('emoria-lumen');
  const [selectedArticleSlug, setSelectedArticleSlug] = useState('nghe-thuat-che-tac-da-quy-emoria');
  const [activeSection, setActiveSection] = useState('collection');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Real RBAC Session State
  const [authSession, setAuthSession] = useState({
    role: ROLES.GUEST,
    user: null,
    isAdmin: false,
  });
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isSessionInfoOpen, setIsSessionInfoOpen] = useState(false);

  // System Availability (Maintenance Gate) State
  const [systemConfig, setSystemConfig] = useState(getSystemAvailability());
  const [vipInput, setVipInput] = useState('');
  const [vipError, setVipError] = useState('');
  const [vipBypassed, setVipBypassed] = useState(false);

  // Persistent Cart via localStorage
  const [cartItems, setCartItems] = useState(() => {
    try {
      const raw = localStorage.getItem('emoria_cart_v1');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [nfcModalState, setNfcModalState] = useState({ isOpen: false, productId: 'emoria-pulse' });
  const [memoryViewerState, setMemoryViewerState] = useState({ isOpen: false, tagUid: 'emoria-lumen', token: null });

  // Refresh Real Session Role
  const refreshSessionRole = async () => {
    const resolved = await resolveCurrentSessionRole();
    setAuthSession(resolved);
    if (resolved.user) {
      setCurrentUser(resolved.user.fullName || resolved.user.email);
    } else {
      setCurrentUser(null);
    }
  };

  // Save cart changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('emoria_cart_v1', JSON.stringify(cartItems));
    } catch (e) {
      console.error('Failed to save cart to localStorage', e);
    }
  }, [cartItems]);

  // Listen to Supabase Auth State on mount
  useEffect(() => {
    let active = true;
    fetchSystemStatus().then(() => { if (active) setSystemConfig(getSystemAvailability()); });
    return () => { active = false; };
  }, []);

  // Listen to Supabase Auth State on mount
  useEffect(() => {
    refreshSessionRole();

    if (isSupabaseConfigured()) {
      const { data: authListener } = supabase.auth.onAuthStateChange(() => {
        refreshSessionRole();
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  // Check URL query parameters on initial load - TRANG CHỦ LÀ MẶC ĐỊNH
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const tagParam = urlParams.get('tag') || urlParams.get('memory');
    const articleParam = urlParams.get('article');

    if (articleParam) {
      setSelectedArticleSlug(articleParam);
      setCurrentView('article-detail');
    } else if (tagParam) {
      setCurrentView('memory');
      setCurrentTag(tagParam);
    } else if (viewParam === 'memory') {
      setCurrentView('memory');
    } else if (viewParam === 'shop') {
      setCurrentView('shop');
    } else if (viewParam === 'articles') {
      setCurrentView('articles');
    } else {
      // MẶC ĐỊNH LÀ TRANG CHỦ (HOME)
      setCurrentView('home');
    }
  }, []);

  // Cart Handlers
  const handleAddToCart = (product, quantity = 1) => {
    setCartItems((prev) => {
      const sizeKey = product.size || 'Tiêu chuẩn';
      const existing = prev.find(item => item.id === product.id && item.size === sizeKey);
      if (existing) {
        return prev.map(item =>
          item.id === product.id && item.size === sizeKey
            ? { ...item, quantity: item.quantity + quantity, isGift: product.isGift || item.isGift }
            : item
        );
      }
      return [
        ...prev,
        {
          ...product,
          size: sizeKey,
          isGift: Boolean(product.isGift),
          quantity
        }
      ];
    });
    setIsCartOpen(true);
  };

  const handleUpdateCartQuantity = (id, quantity, size) => {
    setCartItems(prev => prev.map(item => {
      if (item.id === id && (!size || item.size === size)) {
        return { ...item, quantity };
      }
      return item;
    }));
  };

  const handleRemoveCartItem = (id, size) => {
    setCartItems(prev => prev.filter(item => !(item.id === id && (!size || item.size === size))));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleOpenNfcDemo = (productId = 'emoria-lumen') => {
    setNfcModalState({ isOpen: true, productId });
  };

  const handleCloseNfcDemo = () => {
    setNfcModalState(prev => ({ ...prev, isOpen: false }));
  };

  const handleOpenMemoryViewer = (tagUid = 'emoria-lumen') => {
    setCurrentTag(tagUid);
    setCurrentView('memory');
    setNfcModalState({ isOpen: false, productId: 'emoria-pulse' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseMemoryViewer = () => {
    setMemoryViewerState(prev => ({ ...prev, isOpen: false }));
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleExploreClick = () => {
    setCurrentView('shop');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Check VIP Passcode for Maintenance Bypass
  const handleVipSubmit = (e) => {
    e.preventDefault();
    setVipError('');
    if (!isSupabaseConfigured() && systemConfig.vipPasscode && vipInput.trim().toUpperCase() === systemConfig.vipPasscode.toUpperCase()) {
      setVipBypassed(true);
    } else {
      setVipError('Mã VIP Passcode không chính xác.');
    }
  };

  // SYSTEM MAINTENANCE GATE CHECK
  const isSystemBlocked = systemConfig.isMaintenanceMode && 
    authSession.role === ROLES.GUEST && 
    !vipBypassed;

  if (isSystemBlocked) {
    return (
      <div className="min-h-screen bg-dark-950 text-slate-100 flex items-center justify-center p-4 selection:bg-white/20">
        <div className="w-full max-w-lg p-8 sm:p-10 rounded-3xl bg-dark-900/90 border border-white/20 shadow-2xl backdrop-blur-2xl text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-full bg-white/10 border border-white/30 flex items-center justify-center mx-auto mb-4 text-white shadow-silver-glow">
            <Lock className="w-8 h-8 stroke-1" />
          </div>

          <span className="font-serif text-2xl font-bold tracking-[0.2em] text-metallic">
            EMORIA
          </span>
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-white mt-2 mb-2 uppercase">
            Phiên Đóng Cửa Riêng Tư
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6 font-light">
            {systemConfig.maintenanceMessage}
          </p>

          <form onSubmit={handleVipSubmit} className="space-y-3 max-w-xs mx-auto mb-6">
            <input
              type="text"
              placeholder="Nhập Mã Mời VIP (Gợi ý: EMORIAVIP)"
              value={vipInput}
              onChange={(e) => setVipInput(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs text-center font-mono uppercase focus:outline-none focus:border-white/50"
            />
            {vipError && <p className="text-xs text-red-400">{vipError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-white text-dark-950 font-bold text-xs uppercase hover:bg-slate-200 transition-all cursor-pointer shadow-silver-glow"
            >
              Mở Khóa VIP Salon
            </button>
          </form>

          <div className="pt-4 border-t border-white/10 text-xs text-slate-400">
            <span>Dành cho Quản trị viên: </span>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="text-white underline underline-offset-4 hover:text-slate-200 cursor-pointer font-semibold"
            >
              Đăng nhập tài khoản Quản trị viên
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 relative selection:bg-slate-200 selection:text-dark-950 overflow-x-hidden w-full max-w-[100vw]">
      
      {/* Top Fixed Navigation with Mode Switcher */}
      <Navbar
        activeSection={activeSection}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenNfcDemo={() => handleOpenNfcDemo('emoria-lumen')}
        cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        currentView={currentView}
        onSelectView={(view) => {
          setCurrentView(view);
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('view', view);
          window.history.replaceState({}, '', newUrl.toString());
        }}
        onSearch={(query) => {
          setSearchQuery(query);
          if (currentView !== 'shop') {
            setCurrentView('shop');
          }
        }}
      />

      {/* Main Dynamic View Area */}
      <main>
        {/* VIEW 1: TRANG CHỦ & CÂU CHUYỆN THƯƠNG HIỆU (MẶC ĐỊNH) */}
        {currentView === 'home' && (
          <div>
            <HeroSection
              onExploreClick={handleExploreClick}
              onLoginSuccess={(name) => setCurrentUser(name)}
            />
            <CollectionShowcase
              onSelectProduct={(id) => {
                setSelectedProductId(id);
              }}
              onOpenNfcDemo={handleOpenNfcDemo}
            />
            <ProductCatalog
              searchQuery={searchQuery}
              onSelectProduct={(id) => setSelectedProductId(id)}
              onAddToCart={handleAddToCart}
              onOpenNfcDemo={handleOpenNfcDemo}
            />
            <ArticlesSection
              onSelectArticle={(slug) => {
                setSelectedArticleSlug(slug);
                setCurrentView('article-detail');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateToArticles={() => {
                setCurrentView('articles');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
            <FeedbackSection onOpenNfcDemo={handleOpenNfcDemo} />
            <AboutSection onOpenNfcDemo={handleOpenNfcDemo} />
            <ContactSection />
          </div>
        )}

        {/* VIEW 2: DEDICATED STOREFRONT / SHOPPING INTERFACE */}
        {currentView === 'shop' && (
          <ShopView
            onSelectProduct={(id) => setSelectedProductId(id)}
            onAddToCart={handleAddToCart}
            onOpenNfcDemo={handleOpenNfcDemo}
            onOpenCart={() => setIsCartOpen(true)}
          />
        )}

        {/* VIEW 3: DEDICATED MEMORY SPACE VAULT SHOWCASE */}
        {currentView === 'memory' && (
          <MemorySpaceView
            initialTag={currentTag}
            onNavigateToShop={() => {
              setCurrentView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 4: DEDICATED ARTICLES & BLOG MAGAZINE */}
        {currentView === 'articles' && (
          <ArticlesView
            onSelectArticle={(slug) => {
              setSelectedArticleSlug(slug);
              setCurrentView('article-detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateToShop={() => {
              setCurrentView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 5: ARTICLE DETAIL & COMMUNITY COMMENTS */}
        {currentView === 'article-detail' && (
          <ArticleDetailView
            slug={selectedArticleSlug}
            onBack={() => {
              setCurrentView('articles');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectProduct={(id) => setSelectedProductId(id)}
            onOpenAuth={() => setIsAuthOpen(true)}
            currentUser={currentUser ? { name: currentUser } : null}
          />
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* SECURITY & SESSION STATUS BADGE (Góc dưới bên trái) */}
      <div className="fixed bottom-6 left-6 z-40">
        <div className="relative">
          <button
            onClick={() => setIsSessionInfoOpen(!isSessionInfoOpen)}
            className="px-3.5 py-2 rounded-full bg-black/85 border border-white/20 backdrop-blur-xl text-slate-200 text-xs font-semibold shadow-2xl hover:border-white/40 flex items-center gap-2 cursor-pointer transition-all"
            title="Nhấn để xem trạng thái phân quyền và bảo mật"
          >
            <Shield className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline text-slate-400">Phiên:</span>
            <span className="font-bold text-white uppercase">
              {authSession.isAdmin ? 'Quản Trị Viên (Admin)' : 
               currentUser ? `Khách Đã Đăng Nhập` : 'Khách Vãng Lai (Guest)'}
            </span>
            {isSessionInfoOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Session Detail Dropdown */}
          {isSessionInfoOpen && (
            <div className="absolute bottom-12 left-0 w-72 p-4 rounded-2xl bg-dark-900 border border-white/20 shadow-2xl backdrop-blur-2xl space-y-3 text-xs">
              <div className="border-b border-white/10 pb-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                  Thông Tin Phiên & Phân Quyền
                </p>
                <p className="text-white font-bold mt-1 truncate">
                  {currentUser ? currentUser : 'Chưa đăng nhập tài khoản'}
                </p>
                <p className="text-[11px] text-slate-400">
                  Vai trò RBAC: <span className="text-white font-medium">{authSession.isAdmin ? 'Admin' : 'Guest / Viewer'}</span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-1.5 pt-1">
                {authSession.isAdmin ? (
                  <button
                    onClick={() => {
                      setIsAdminPanelOpen(true);
                      setIsSessionInfoOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl bg-white text-dark-950 font-bold flex items-center gap-2 transition-all cursor-pointer hover:bg-slate-200"
                  >
                    <Shield className="w-3.5 h-3.5 text-dark-950" />
                    <span>Mở Bảng Quản Trị Hệ Thống</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsAuthOpen(true);
                      setIsSessionInfoOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5 text-slate-300" />
                    <span>{currentUser ? 'Đăng nhập tài khoản khác' : 'Đăng nhập Quản Trị Viên'}</span>
                  </button>
                )}

                {currentUser && (
                  <button
                    onClick={async () => {
                      await signOutUser();
                      await refreshSessionRole();
                      setIsSessionInfoOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-red-500/20 text-red-400 font-medium transition-all cursor-pointer text-[11px]"
                  >
                    Đăng xuất khỏi thiết bị
                  </button>
                )}
              </div>

              <div className="pt-2 border-t border-white/10 text-[10px] text-slate-500 leading-tight">
                Chế độ bảo mật RBAC kích hoạt. Vai trò chỉ được cấp từ máy chủ Supabase Auth, không thể tự sửa phía client.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button for NFC Experience (Góc dưới bên phải) */}
      <button
        onClick={() => {
          if (currentView === 'memory') {
            handleOpenNfcDemo('emoria-pulse');
          } else {
            setCurrentView('memory');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        className="fixed bottom-6 right-6 z-40 px-4 py-2.5 h-11 rounded-full bg-white text-dark-950 font-bold text-xs shadow-2xl hover:scale-105 hover:bg-slate-200 active:scale-95 transition-all flex items-center gap-2 border border-white/40 cursor-pointer min-h-[44px]"
        title="Trải nghiệm chạm NFC"
      >
        <SmartphoneNfc className="w-4 h-4 animate-bounce" />
        <span className="hidden sm:inline">
          {currentView === 'memory' ? 'Thử Chạm NFC' : 'Vào Memory Space'}
        </span>
      </button>

      {/* NFC Touch Simulation Modal */}
      <NFCDemoModal
        isOpen={nfcModalState.isOpen}
        onClose={handleCloseNfcDemo}
        selectedProductId={nfcModalState.productId}
        onOpenMemoryViewer={handleOpenMemoryViewer}
      />

      {/* Legacy Memory Viewer Modal fallback */}
      {memoryViewerState.isOpen && (
        <MemoryViewer
          tagUid={memoryViewerState.tagUid}
          token={memoryViewerState.token}
          onClose={handleCloseMemoryViewer}
          currentUser={currentUser}
        />
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onAddToCart={handleAddToCart}
        onOpenNfcDemo={handleOpenNfcDemo}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onOpenCheckout={() => setIsCheckoutOpen(true)}
      />

      {/* Dark Luxury Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        onOrderComplete={handleClearCart}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(name) => setCurrentUser(name)}
      />

      {/* Admin Panel Modal */}
      <AdminPanelModal
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        onRefresh={() => {
          setSystemConfig(getSystemAvailability());
        }}
      />

    </div>
  );
}
