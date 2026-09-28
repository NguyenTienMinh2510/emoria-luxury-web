import NfcLanding from './components/NfcLanding';
import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AnalyticsConsent from './components/AnalyticsConsent';
import {trackShopEvent} from './services/analyticsService';
import { useStore } from './components/StoreProvider';
import ShopView from './views/ShopView';
import MemorySpaceView from './views/MemorySpaceView';
import ArticlesView from './views/ArticlesView';
import ArticleDetailView from './views/ArticleDetailView';
import ArticlesSection from './components/ArticlesSection';
import HeroSection from './components/HeroSection';
import ProductExplodedShowcase from './components/ProductExplodedShowcase';
import CollectionShowcase from './components/CollectionShowcase';
import ProductCatalog from './components/ProductCatalog';
import FeedbackSection from './components/FeedbackSection';
import AboutSection from './components/AboutSection';
import AboutView from './views/AboutView';
import ContactSection from './components/ContactSection';
import Footer from './components/Footer';
import NFCDemoModal from './components/NFCDemoModal';
import MemoryViewer from './components/MemoryViewer';
import ProductDetailModal from './components/ProductDetailModal';
import CartDrawer from './components/CartDrawer';
import AuthModal from './components/AuthModal';
import CheckoutModal from './components/CheckoutModal';
import AdminView from './views/AdminView';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import MemoryMatchStudio from './components/MemoryMatchStudio';
import MemoryHouseStudio from './components/MemoryHouseStudio';
import { 
  SmartphoneNfc, Shield, User, Key, Lock, Unlock, 
  Sparkles, CheckCircle2, ChevronUp, ChevronDown, Power, ArrowRight
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
  const store = useStore();
  // Navigation View: Mặc định là 'home' (Trang chủ & Câu chuyện thương hiệu)
  const [currentView, setCurrentView] = useState('home');
  const [trackingRequest,setTrackingRequest]=useState(null);
  const [recovery, setRecovery] = useState(false);
  const [routeReady, setRouteReady] = useState(false);
  const [systemReady,setSystemReady]=useState(false);
  const [chipId,setChipId]=useState('');
  const [currentTag, setCurrentTag] = useState('emoria-lumen');
  const [selectedArticleSlug, setSelectedArticleSlug] = useState('nghe-thuat-che-tac-da-quy-emoria');
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [matchInviteToken, setMatchInviteToken] = useState(null);
  const [houseShareId, setHouseShareId] = useState(null);
  const [activeSection, setActiveSection] = useState('collection');
  const [searchQuery, setSearchQuery] = useState('');
  const [heroLayoutMode, setHeroLayoutMode] = useState('before-hero'); // 'before-hero' | 'hero'
  
  // Real RBAC Session State
  const [authSession, setAuthSession] = useState({
    role: ROLES.GUEST,
    user: null,
    isAdmin: false,
  });
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
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [nfcModalState, setNfcModalState] = useState({ isOpen: false, productId: 'emoria-pulse' });
  const [memoryViewerState, setMemoryViewerState] = useState({ isOpen: false, tagUid: 'emoria-lumen', token: null });

  const [hasScrolledPastHero, setHasScrolledPastHero] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setHasScrolledPastHero(window.scrollY > 320);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    fetchSystemStatus().then(() => { if (active) setSystemConfig(getSystemAvailability()); }).finally(()=>{if(active)setSystemReady(true);});
    return () => { active = false; };
  }, []);

  // Listen to Supabase Auth State on mount
  useEffect(() => {
    refreshSessionRole();

    if (isSupabaseConfigured()) {
      const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') { setRecovery(true); setIsAuthOpen(true); }
        setTimeout(refreshSessionRole, 0);
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  useEffect(() => {
    const readRoute = () => {
      const q=new URLSearchParams(window.location.search);
      const payment=q.get('payment');
      const orderId=q.get('orderId');
      const token=q.get('token');
      const policy=q.get('policy');
      const privacy=q.get('privacy');
      if (policy === 'privacy' || privacy === 'true' || window.location.hash === '#privacy') {
        setIsPrivacyOpen(true);
      }
      if (q.get('view') === 'memory-match' || q.get('match') || q.get('invite')) {
        if (q.get('match')) setActiveMatchId(q.get('match'));
        if (q.get('invite')) setMatchInviteToken(q.get('invite'));
        if (q.get('tag')) setCurrentTag(q.get('tag'));
        setCurrentView('memory-match');
      } else if (q.get('view') === 'memory-house' || q.get('share')) {
        if (q.get('share')) setHouseShareId(q.get('share'));
        if (q.get('tag')) setCurrentTag(q.get('tag'));
        setCurrentView('memory-house');
      } else if (payment && orderId) {
        if (payment === 'success') {
          setCartItems([]);
          try { localStorage.removeItem('emoria_cart_v1'); } catch {}
        }
        setTrackingRequest({ id: orderId, token, paymentResult: payment });
        setCurrentView('shop');
      } else if(q.get('article')) { setSelectedArticleSlug(q.get('article'));setCurrentView('article-detail'); }
      else if(q.get('chip')) {setChipId(q.get('chip'));setCurrentView('nfc');}
      else if(q.get('tag') || q.get('memory')) {setCurrentTag(q.get('tag') || q.get('memory'));setCurrentView('memory');}
      else {
        setCurrentView(['home','shop','memory','articles','about','admin','memory-match','memory-house'].includes(q.get('view')) ? q.get('view') : 'home');
        if(q.get('view')==='memory')setCurrentTag('');
      }
      setRouteReady(true);
    };
    const handleHashChange = () => {
      if (window.location.hash === '#privacy') {
        setIsPrivacyOpen(true);
      }
    };
    readRoute();
    window.addEventListener('popstate',readRoute);
    window.addEventListener('hashchange',handleHashChange);
    return ()=>{
      window.removeEventListener('popstate',readRoute);
      window.removeEventListener('hashchange',handleHashChange);
    };
  },[]);
  useEffect(()=>{
    if(!routeReady)return;
    const url=new URL(window.location.href);
    ['chip','view','tag','memory','article','payment','orderId','token','match','invite','share'].forEach(key=>url.searchParams.delete(key));
    if(currentView==='article-detail')url.searchParams.set('article',selectedArticleSlug);
    else if(currentView==='nfc')url.searchParams.set('chip',chipId);
    else if(currentView==='memory') {if(currentTag)url.searchParams.set('tag',currentTag);else url.searchParams.set('view','memory');}
    else if(currentView==='memory-match') {
      url.searchParams.set('view','memory-match');
      if(activeMatchId) url.searchParams.set('match',activeMatchId);
      if(matchInviteToken) url.searchParams.set('invite',matchInviteToken);
      if(currentTag) url.searchParams.set('tag',currentTag);
    }
    else if(currentView==='memory-house') {
      url.searchParams.set('view','memory-house');
      if(houseShareId) url.searchParams.set('share',houseShareId);
      if(currentTag) url.searchParams.set('tag',currentTag);
    }
    else if(currentView!=='home')url.searchParams.set('view',currentView);
    if(url.href!==window.location.href)window.history.pushState({},'',url);
  },[currentView,currentTag,chipId,selectedArticleSlug,activeMatchId,matchInviteToken,houseShareId,routeReady]);

  // Cart Handlers
  const handleAddToCart = (product, quantity = 1) => {
    const real = store.products.find(p => p.id === product.id);
    const variant = real?.variants?.find(v => v.size === product.size);
    if (!real?.available || !variant || !Number.isInteger(quantity) || quantity < 1 || quantity > variant.stock) { setSelectedProductId(product.id); return; }
    product = { ...real, size: product.size, isGift: product.isGift };
    setCartItems((prev) => {
      const sizeKey = product.size || 'Tiêu chuẩn';
      const existing = prev.find(item => item.id === product.id && item.size === sizeKey);
      if (existing) {
        return prev.map(item =>
          item.id === product.id && item.size === sizeKey
            ? { ...item, quantity: Math.min(variant.stock, item.quantity + quantity), isGift: product.isGift || item.isGift }
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
    setSelectedProductId(null);
    trackShopEvent('add_to_cart',[{...product,quantity}]);
    setIsCartOpen(true);
  };

  const handleUpdateCartQuantity = (id, quantity, size) => {
    setCartItems(prev => prev.map(item => {
      if (item.id === id && (!size || item.size === size)) {
        const stock = store.products.find(p => p.id === id)?.variants?.find(v => v.size === item.size)?.stock || 0;
        return { ...item, quantity: Math.max(1, Math.min(stock, Number(quantity) || 1)) };
      }
      return item;
    }));
  };

  const handleRemoveCartItem = (id, size) => {
    setCartItems(prev => prev.filter(item => !(item.id === id && (!size || item.size === size))));
  };

  const handleClearCart = () => {
    setCartItems([]);
    store.refresh();
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
  if(!systemReady||!routeReady)return <div role="status" className="min-h-screen flex items-center justify-center bg-dark-950 text-slate-300">Đang mở EMORIA…</div>;
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
              placeholder="Nhập mã mời VIP"
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
        <AuthModal isOpen={isAuthOpen} recovery={recovery} onClose={() => setIsAuthOpen(false)} onLoginSuccess={refreshSessionRole} currentUser={currentUser} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 relative selection:bg-slate-200 selection:text-dark-950 overflow-x-hidden w-full max-w-[100vw]">
      
      {/* Top Fixed Navigation with Mode Switcher */}
      <Navbar
        sandbox={store.settings?.sandbox}
        activeSection={activeSection}
        currentUser={currentUser}
        isAdmin={authSession.isAdmin}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenNfcDemo={() => handleOpenNfcDemo('emoria-lumen')}
        cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        currentView={currentView}
        onSelectView={(view) => {
          setCurrentView(view);
          if(view==='memory')setCurrentTag('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onSearch={(query) => {
          setSearchQuery(query);
          if (currentView !== 'shop') {
            setCurrentView('shop');
          }
        }}
      />

      {store.settings?.sandbox && <div className="fixed top-0 inset-x-0 z-[60] bg-amber-200 text-black text-center text-xs py-1">CỬA HÀNG THỬ NGHIỆM · Dữ liệu được lưu thật · Không thu tiền / giao hàng</div>}
      <AnalyticsConsent settings={store.settings} view={currentView} isAdmin={authSession.isAdmin}/>
      {store.error&&<div role="alert" className="fixed bottom-4 left-4 right-4 z-[70] p-4 bg-dark-900 border border-red-300/30 rounded-xl text-sm">{store.error} <button className="underline ml-3" onClick={store.refresh}>Thử lại</button></div>}
      {/* Main Dynamic View Area */}
      <main>
        {/* VIEW 1: TRANG CHỦ & CÂU CHUYỆN THƯƠNG HIỆU (MẶC ĐỊNH) */}
        {currentView === 'home' && (
          <div>
            <ProductExplodedShowcase
              mode="hero"
              currentUser={currentUser}
              onOpenAuth={() => setIsAuthOpen(true)}
              onExploreClick={handleExploreClick}
              onOpenNfcDemo={handleOpenNfcDemo}
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
              onNavigateToShop={() => {
                setCurrentView('shop');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
            <ArticlesSection
              isAdmin={authSession.isAdmin}
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

            {/* EDITORIAL BANNER: CÂU CHUYỆN THƯƠNG HIỆU (DẪN ĐẾN TRANG ABOUT RIÊNG BIỆT) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 my-4">
              <div className="rounded-3xl glass-panel p-8 sm:p-12 md:p-14 border border-white/15 bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-transparent flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
                <div className="space-y-3 text-center md:text-left relative z-10">
                  <span className="text-xs uppercase tracking-[0.25em] text-amber-300 font-bold font-sans flex items-center justify-center md:justify-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>EMORIA ATELIER · KHỞI NGUỒN KỶ NIỆM</span>
                  </span>
                  <h3 className="font-serif text-2xl sm:text-4xl font-normal text-white leading-snug">
                    Câu Chuyện Thương Hiệu &amp; Nghệ Thuật Chế Tác
                  </h3>
                  <p className="text-sm text-slate-300 max-w-xl font-light leading-relaxed">
                    Khám phá hành trình kết hợp giữa kỹ nghệ đúc Bạc Ý S925 và vi mạch cảm ứng NFC lưu giữ khoảnh khắc vĩnh cửu trong một không gian riêng biệt.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('about');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="cta-luxury-primary shrink-0 !px-8 !py-4 relative z-10"
                >
                  <span>Khám Phá Về EMORIA</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </section>

            <ContactSection />
          </div>
        )}

        {/* VIEW 2: DEDICATED STOREFRONT / SHOPPING INTERFACE */}
        {currentView === 'shop' && (
          <ShopView initialTracking={trackingRequest}
            initialSearch={searchQuery}
            onSelectProduct={(id) => setSelectedProductId(id)}
            onAddToCart={handleAddToCart}
            onOpenNfcDemo={handleOpenNfcDemo}
            onOpenCart={() => setIsCartOpen(true)}
          />
        )}

        {/* VIEW 3: DEDICATED MEMORY SPACE VAULT SHOWCASE */}
        {currentView==='nfc'&&<NfcLanding chipId={chipId} onResolved={handleOpenMemoryViewer} onMyMemories={()=>{setCurrentTag('');setCurrentView('memory');}}/>}
        {currentView === 'memory' && (
          <MemorySpaceView
            key={authSession.user?.id || 'guest'}
            currentUser={authSession.user?.id || null}
            onOpenAuth={()=>setIsAuthOpen(true)}
            onSelectTag={setCurrentTag}
            initialTag={currentTag}
            onOpenPrivacy={() => setIsPrivacyOpen(true)}
            onNavigateToHome={() => {
              setCurrentView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateToShop={() => {
              setCurrentView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenMatchStudio={(tag) => {
              if (tag) setCurrentTag(tag);
              setCurrentView('memory-match');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenHouseStudio={(tag) => {
              if (tag) setCurrentTag(tag);
              setCurrentView('memory-house');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 4: DEDICATED ARTICLES & BLOG MAGAZINE */}
        {currentView === 'articles' && (
          <ArticlesView
            isAdmin={authSession.isAdmin}
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
            isAdmin={authSession.isAdmin}
            onBack={() => {
              setCurrentView('articles');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectProduct={(id) => setSelectedProductId(id)}
            onOpenAuth={() => setIsAuthOpen(true)}
            currentUser={currentUser ? { name: currentUser, id: authSession.user?.id, isAdmin: authSession.isAdmin } : null}
          />
        )}

        {/* VIEW 6: DEDICATED ABOUT US & BRAND ATELIER (TRANG RIÊNG BIỆT) */}
        {currentView === 'about' && (
          <AboutView
            onNavigateToShop={() => {
              setCurrentView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateToMemory={() => {
              setCurrentView('memory');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenNfcDemo={handleOpenNfcDemo}
            onOpenPrivacy={() => setIsPrivacyOpen(true)}
          />
        )}

        {/* VIEW 7: DEDICATED FULL-PAGE ADMIN VIEW */}
        {currentView === 'admin' && (
          <AdminView
            currentUser={currentUser}
            isAdmin={authSession.isAdmin}
            onOpenAuth={() => setIsAuthOpen(true)}
            onNavigateToHome={() => {
              setCurrentView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onRefresh={() => {
              setSystemConfig(getSystemAvailability());
              store.refresh();
            }}
          />
        )}

        {/* VIEW 8: COUPLE MATCH STUDIO */}
        {currentView === 'memory-match' && (
          <MemoryMatchStudio
            tagUid={currentTag || 'emoria-lumen'}
            matchId={activeMatchId}
            inviteToken={matchInviteToken}
            currentUser={authSession.user?.id || null}
            onBack={() => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              setCurrentView('memory');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateHome={() => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              setCurrentView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateShop={() => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              setCurrentView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateMemory={(tag) => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              if (tag) setCurrentTag(tag);
              setCurrentView('memory');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSwitchStudio={(target) => {
              if (target === 'house') {
                setActiveMatchId(null);
                setMatchInviteToken(null);
                setCurrentView('memory-house');
              } else {
                setHouseShareId(null);
                setCurrentView('memory-match');
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* VIEW 9: MEMORY HOUSE STUDIO */}
        {currentView === 'memory-house' && (
          <MemoryHouseStudio
            tagUid={currentTag || 'emoria-lumen'}
            shareId={houseShareId}
            currentUser={authSession.user?.id || null}
            onBack={() => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              setCurrentView('memory');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateHome={() => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              setCurrentView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateShop={() => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              setCurrentView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateMemory={(tag) => {
              setActiveMatchId(null);
              setMatchInviteToken(null);
              setHouseShareId(null);
              if (tag) setCurrentTag(tag);
              setCurrentView('memory');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSwitchStudio={(target) => {
              if (target === 'match') {
                setHouseShareId(null);
                setCurrentView('memory-match');
              } else {
                setActiveMatchId(null);
                setMatchInviteToken(null);
                setCurrentView('memory-house');
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </main>

      {/* Footer */}
      {['home', 'shop', 'articles', 'about'].includes(currentView) && (
        <Footer 
          onSelectView={(view) => {
            setCurrentView(view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenPrivacy={() => setIsPrivacyOpen(true)}
        />
      )}

      {/* SECURITY & SESSION STATUS BADGE (Góc dưới bên trái) */}
      <div className="fixed bottom-6 left-6 z-40" hidden={currentView==='memory'&&!currentUser}>
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
                      setCurrentView('admin');
                      setIsSessionInfoOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
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

                <button
                  type="button"
                  onClick={() => {
                    setIsPrivacyOpen(true);
                    setIsSessionInfoOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-white/10 text-slate-300 font-medium transition-all cursor-pointer text-[11px] flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Chính sách bảo mật Emoria</span>
                </button>
              </div>

              <div className="pt-2 border-t border-white/10 text-[10px] text-slate-500 leading-tight">
                Chế độ bảo mật RBAC kích hoạt. Vai trò chỉ được cấp từ máy chủ Supabase Auth, không thể tự sửa phía client.
              </div>
            </div>
          )}
        </div>
      </div>

      {currentView !== 'memory' && (currentView !== 'home' || hasScrolledPastHero) && (
        <button
          onClick={() => {
            setCurrentTag('');
            setCurrentView('memory');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="fixed bottom-6 right-6 z-40 px-4 py-2.5 rounded-full bg-white text-dark-950 font-bold text-xs shadow-silver-glow hover:scale-105 transition-all duration-300 cursor-pointer"
        >
          Kỷ vật của bạn
        </button>
      )}

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
          key={selectedProductId}
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
        currentUser={authSession.user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenCheckout={() => {
          if (!authSession.user) {
            setIsAuthOpen(true);
            return;
          }
          trackShopEvent('begin_checkout', cartItems);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Dark Luxury Checkout Modal */}
      {isCheckoutOpen && <CheckoutModal
        key={authSession.user?.id||'guest'}
        currentUserId={authSession.user?.id||'guest'}
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        onOrderComplete={handleClearCart}
        onTrack={order=>{setTrackingRequest({id:order.id,token:order.lookupToken});setIsCheckoutOpen(false);setIsCartOpen(false);setCurrentView("shop");window.scrollTo({top:0});}}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
      />}

      {/* Auth Modal */}
      <AuthModal
        recovery={recovery}
        currentUser={currentUser}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onNavigateToMemory={() => {
          setIsAuthOpen(false);
          setCurrentView('memory');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Privacy Policy Modal (Bảo Mật Emoria) */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

    </div>
  );
}
