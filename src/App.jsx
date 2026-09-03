import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
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
import { SmartphoneNfc } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';

export default function App() {
  const [activeSection, setActiveSection] = useState('collection');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [nfcModalState, setNfcModalState] = useState({ isOpen: false, productId: 'emoria-pulse' });
  const [memoryViewerState, setMemoryViewerState] = useState({ isOpen: false, tagUid: 'emoria-lumen', token: null });

  // Listen to Supabase Auth State & URL params on mount
  useEffect(() => {
    // 1. Check if user is already logged in
    if (isSupabaseConfigured()) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setCurrentUser(session.user.user_metadata?.full_name || session.user.email);
        }
      });

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          setCurrentUser(session.user.user_metadata?.full_name || session.user.email);
        } else {
          setCurrentUser(null);
        }
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  // Check URL query parameters for direct NFC touch (?tag=emoria-lumen)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tag = urlParams.get('tag') || urlParams.get('memory');
    const token = urlParams.get('token');

    if (tag) {
      setMemoryViewerState({
        isOpen: true,
        tagUid: tag,
        token: token || null,
      });
    }
  }, []);

  // Scrollspy to detect current active section for navbar
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['collection', 'products', 'feedback', 'about', 'contact'];
      const scrollPos = window.scrollY + 200;

      for (const sectionId of sections) {
        const element = document.getElementById(sectionId);
        if (element) {
          const top = element.offsetTop;
          const height = element.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cart Handlers
  const handleAddToCart = (product, quantity = 1) => {
    setCartItems((prev) => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prev, { ...product, quantity }];
    });
  };

  const handleUpdateCartQuantity = (id, quantity) => {
    setCartItems(prev => prev.map(item => item.id === id ? { ...item, quantity } : item));
  };

  const handleRemoveCartItem = (id) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
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

  const handleOpenMemoryViewer = (tagUid = 'emoria-lumen', token = null) => {
    setMemoryViewerState({ isOpen: true, tagUid, token });
  };

  const handleCloseMemoryViewer = () => {
    setMemoryViewerState(prev => ({ ...prev, isOpen: false }));
    // Remove query param from URL cleanly without reload
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleExploreClick = () => {
    const el = document.getElementById('collection');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 relative selection:bg-slate-200 selection:text-dark-950 overflow-x-hidden w-full max-w-[100vw]">
      
      {/* Top Fixed Navigation */}
      <Navbar
        activeSection={activeSection}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenNfcDemo={() => handleOpenNfcDemo('emoria-lumen')}
        cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onSearch={(query) => {
          setSearchQuery(query);
          const el = document.getElementById('products');
          if (el && query) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />

      {/* Main Sections matching Mockups 1 - 7 */}
      <main>
        {/* Section 1 & 2: Hero & Auth */}
        <HeroSection
          onExploreClick={handleExploreClick}
          onLoginSuccess={(name) => {
            setCurrentUser(name);
          }}
        />

        {/* Section 3: Collection Showcase (Emoria Summer) */}
        <CollectionShowcase
          onSelectProduct={(id) => setSelectedProductId(id)}
          onOpenNfcDemo={handleOpenNfcDemo}
        />

        {/* Section 4: Product Catalog & Filter */}
        <ProductCatalog
          searchQuery={searchQuery}
          onSelectProduct={(id) => setSelectedProductId(id)}
          onAddToCart={handleAddToCart}
          onOpenNfcDemo={handleOpenNfcDemo}
        />

        {/* Section 5: Feedback & Social Proof */}
        <FeedbackSection
          onOpenNfcDemo={handleOpenNfcDemo}
        />

        {/* Section 6: About EMORIA & S925 NFC Technology */}
        <AboutSection
          onOpenNfcDemo={handleOpenNfcDemo}
        />

        {/* Section 7: Contact & Social Channels */}
        <ContactSection />
      </main>

      {/* Footer */}
      <Footer />

      {/* Floating Action Button for NFC Experience */}
      <button
        onClick={() => handleOpenNfcDemo('emoria-pulse')}
        className="fixed bottom-6 right-6 z-40 px-4 py-2.5 h-11 rounded-full bg-white text-dark-950 font-bold text-xs shadow-2xl hover:scale-105 hover:bg-slate-200 active:scale-95 transition-all flex items-center gap-2 border border-white/40 cursor-pointer min-h-[44px]"
        title="Trải nghiệm chạm NFC"
      >
        <SmartphoneNfc className="w-4 h-4 animate-bounce" />
        <span className="hidden sm:inline">Thử Chạm NFC</span>
      </button>

      {/* NFC Touch Simulation Modal */}
      <NFCDemoModal
        isOpen={nfcModalState.isOpen}
        onClose={handleCloseNfcDemo}
        selectedProductId={nfcModalState.productId}
        onOpenMemoryViewer={handleOpenMemoryViewer}
      />

      {/* NFC Memory Space Full Viewer & Media Manager */}
      {memoryViewerState.isOpen && (
        <MemoryViewer
          tagUid={memoryViewerState.tagUid}
          token={memoryViewerState.token}
          onClose={handleCloseMemoryViewer}
          currentUser={currentUser}
        />
      )}

      <ProductDetailModal
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onAddToCart={handleAddToCart}
        onOpenNfcDemo={handleOpenNfcDemo}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(name) => setCurrentUser(name)}
      />

    </div>
  );
}
