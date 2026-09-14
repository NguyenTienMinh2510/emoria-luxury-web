from pathlib import Path
root=Path(__file__).resolve().parent.parent
def edit(name,fn):
 p=root/name;p.write_text(fn(p.read_text(encoding='utf-8-sig')),encoding='utf-8')
def app(s):
 s=s.replace("  const [currentView, setCurrentView] = useState('home');", "  const [currentView, setCurrentView] = useState('home');\n  const [recovery, setRecovery] = useState(false);\n  const [routeReady, setRouteReady] = useState(false);")
 s=s.replace("supabase.auth.onAuthStateChange(() => {\n        refreshSessionRole();", "supabase.auth.onAuthStateChange((event) => {\n        if (event === 'PASSWORD_RECOVERY') { setRecovery(true); setIsAuthOpen(true); }\n        setTimeout(refreshSessionRole, 0);")
 a=s.index('  // Check URL query parameters');b=s.index('  // Cart Handlers',a)
 s=s[:a]+'''  useEffect(() => {
    const readRoute = () => {
      const q=new URLSearchParams(window.location.search);
      if(q.get('article')) { setSelectedArticleSlug(q.get('article'));setCurrentView('article-detail'); }
      else if(q.get('tag') || q.get('memory')) {setCurrentTag(q.get('tag') || q.get('memory'));setCurrentView('memory');}
      else setCurrentView(['home','shop','memory','articles'].includes(q.get('view')) ? q.get('view') : 'home');
      setRouteReady(true);
    };
    readRoute();window.addEventListener('popstate',readRoute);
    return ()=>window.removeEventListener('popstate',readRoute);
  },[]);
  useEffect(()=>{
    if(!routeReady)return;
    const url=new URL(window.location.href);
    ['view','tag','memory','article'].forEach(key=>url.searchParams.delete(key));
    if(currentView==='article-detail')url.searchParams.set('article',selectedArticleSlug);
    else if(currentView==='memory')url.searchParams.set('tag',currentTag);
    else if(currentView!=='home')url.searchParams.set('view',currentView);
    if(url.href!==window.location.href)window.history.pushState({},'',url);
  },[currentView,currentTag,selectedArticleSlug,routeReady]);

'''+s[b:]
 a=s.index('          const newUrl = new URL');b=s.index('\n        }}',a)
 s=s[:a]+s[b:]
 s=s.replace('      role: ROLES.GUEST,','      role: ROLES.GUEST,')
 s=s.replace("      <AuthModal\n", "      <AuthModal\n        recovery={recovery}\n")
 # Maintenance login must render even when the normal app is gated.
 s=s.replace('Nhập Mã Mời VIP (Gợi ý: EMORIAVIP)','Nhập mã mời VIP')
 s=s.replace('          </div>\n        </div>\n      </div>\n    );\n  }', '          </div>\n        </div>\n        <AuthModal isOpen={isAuthOpen} recovery={recovery} onClose={() => setIsAuthOpen(false)} onLoginSuccess={refreshSessionRole} currentUser={currentUser} />\n      </div>\n    );\n  }',1)
 return s
edit('src/App.jsx',app)
def orders(s):
 a=s.index('export async function trackOrderSecure(');b=s.index('/**',a+40)
 s=s[:a]+'''export async function trackOrderSecure(orderId, token) {
  if (!isSupabaseConfigured()) throw new Error('Chưa kết nối máy chủ.');
  const {data,error}=await supabase.rpc('rpc_track_order',{p_order_id:orderId.trim(),p_token:token?.trim() || null});
  if(error || !data?.success) throw new Error(error?.message || data?.message || 'Không thể tra cứu đơn.');
  return data.order;
}

'''+s[b:]
 a=s.index('export async function updateOrderStatus(');b=s.index('/**',a+40)
 s=s[:a]+'''export async function updateOrderStatus(orderId, nextStatus, tracking = null) {
  if (!isSupabaseConfigured()) throw new Error('Chưa kết nối máy chủ.');
  const {data,error}=await supabase.rpc('rpc_order_status',{p_order_id:orderId,p_status:nextStatus,p_tracking:tracking});
  if(error || !data?.success)throw new Error(error?.message || data?.message || 'Không thể cập nhật đơn.');
  return data;
}

'''+s[b:]
 s=s.replace('export async function listOrdersForAdmin() {','export async function listOrdersForAdmin(page = 0, search = \'\') {')
 s=s.replace(".order('created_at', { ascending: false });", ".order('created_at', { ascending: false }).ilike('id', `%${search}%`).range(page * 25, page * 25 + 24);")
 s=s.replace('      if (!error && data && data.length > 0) {','      if (error) throw new Error(error.message);\n      if (data) {')
 s=s.replace("      console.warn('[Admin list orders Notice]', e.message);",'      throw e;')
 s=s.replace("Đang chờ chuyển khoản VietQR vào tài khoản MB Bank.","Đang chờ đối soát chuyển khoản.")
 return s
edit('src/services/orderBackendService.js',orders)
def shop(s):
 s=s.replace("import { getOrderById, getOrdersByPhone }", "import { trackOrderSecure }")
 s=s.replace("  const [trackingInput, setTrackingInput] = useState('');", "  const [trackingInput, setTrackingInput] = useState('');\n  const [trackingToken, setTrackingToken] = useState('');")
 a=s.index('  const handleTrackOrder =');b=s.index('  const getStatusBadge',a)
 s=s[:a]+'''  const handleTrackOrder = async (e) => {
    e.preventDefault();setTrackingError('');setTrackingResults(null);setIsSearchingOrder(true);
    try { const order=await trackOrderSecure(trackingInput,trackingToken);setTrackingResults([order]); }
    catch(error){setTrackingError(error.message);}finally{setIsSearchingOrder(false);}
  };

'''+s[b:]
 s=s.replace('Nhập mã đơn hàng (ví dụ: <span className="font-mono text-white">EMO-849201</span>) hoặc số điện thoại bạn đã dùng khi đặt hàng tại Emoria.','Nhập mã đơn và mã tra cứu riêng nhận được sau khi đặt hàng. Nếu đã đăng nhập đúng tài khoản đặt đơn, có thể bỏ trống mã tra cứu.')
 s=s.replace('Nhập mã EMO-XXXXXX hoặc Số điện thoại...','Mã đơn EMO-…')
 s=s.replace('<form onSubmit={handleTrackOrder} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">','<form onSubmit={handleTrackOrder} className="flex flex-col gap-3 max-w-lg mx-auto">\n                <input aria-label="Mã tra cứu riêng" type="password" placeholder="Mã tra cứu riêng (UUID)" value={trackingToken} onChange={e=>setTrackingToken(e.target.value)} className="store-input" />')
 return s
edit('src/views/ShopView.jsx',shop)
def checkout(s):
 s=s.replace("import { createOrder }", "import { useStore } from './StoreProvider';\nimport { createOrder }")
 s=s.replace("  const [fullName", "  const { settings } = useStore();\n  const [submitError, setSubmitError] = useState('');\n  const [fullName",1)
 s=s.replace("import.meta.env.VITE_PAYMENT_BANK_NAME || ''", "settings?.bank_bin || ''").replace("import.meta.env.VITE_PAYMENT_ACCOUNT_NUMBER || ''", "settings?.bank_account || ''").replace("import.meta.env.VITE_PAYMENT_ACCOUNT_NAME || ''", "settings?.bank_owner || ''")
 s=s.replace('Boolean(bankName && bankAccount && bankOwner)','Boolean(!settings?.sandbox && bankName && bankAccount && bankOwner)')
 s=s.replace('cartItems.some(i => i.isGift) ? 35000 : 0','cartItems.some(i => i.isGift) ? (settings?.gift_fee || 0) : 0').replace('subtotal >= 1000000 || subtotal === 0 ? 0 : 30000','subtotal >= (settings?.free_shipping_from || 0) || subtotal === 0 ? 0 : (settings?.shipping_fee || 0)')
 s=s.replace('    setIsSubmitting(true);','    setIsSubmitting(true);\n    setSubmitError(\'\');',1)
 s=s.replace("      alert(err.message || 'Đã xảy ra lỗi khi tạo đơn hàng');", "      setSubmitError(err.message || 'Đã xảy ra lỗi khi tạo đơn hàng');")
 s=s.replace("disabled={isSubmitting}","disabled={isSubmitting || !settings?.sales_enabled || !cartItems.length || (paymentMethod === 'cod' ? !settings?.cod_enabled : !settings?.transfer_enabled)}")
 s=s.replace('      <div \n        className="fixed', '      <div role="dialog" aria-modal="true" aria-label="Đặt hàng"\n        className="fixed')
 s=s.replace('<form onSubmit={handlePlaceOrder} className="space-y-6">','<form onSubmit={handlePlaceOrder} className="space-y-6">\n              {submitError && <p role="alert" className="text-red-300 bg-red-500/10 p-3 rounded-xl text-sm">{submitError}</p>}\n              {settings?.sandbox && <p className="text-amber-200 text-sm">Đơn thử nghiệm. Dùng thông tin giả lập; không chuyển tiền.</p>}')
 s=s.replace("{completedOrder.paymentMethod === 'vietqr' ? 'Đã Ghi Nhận Đơn Hàng' : 'Đặt Hàng Thành Công!'}", "{completedOrder.isTest ? 'Đã lưu đơn thử nghiệm' : completedOrder.paymentMethod === 'vietqr' ? 'Đã Ghi Nhận Đơn Hàng' : 'Đặt Hàng Thành Công!'}")
 s=s.replace('              {/* Bank transfer info if selected */}', '''              {completedOrder.lookupToken && <div className="rounded-xl p-4 bg-white/5 text-left text-sm space-y-2"><p>Mã tra cứu riêng — hãy lưu lại:</p><code className="break-all select-all">{completedOrder.lookupToken}</code><p className="text-slate-400 text-xs">Dùng cùng mã đơn ở mục Tra cứu. Không chia sẻ mã này công khai.</p></div>}
              {/* Bank transfer info if selected */}''')
 s=s.replace('Thông tin tài khoản nhận tiền đang được cập nhật. Vui lòng liên hệ EMORIA và cung cấp mã đơn để nhận hướng dẫn; đơn chưa được xác nhận thanh toán.', "{settings?.sandbox ? 'Thanh toán thử nghiệm: quản trị viên xác nhận trong mục Đơn hàng. Không chuyển tiền thật.' : 'Chưa có thông tin nhận chuyển khoản. Đơn chưa được xác nhận thanh toán.'}")
 s=s.replace('Email nhận mã đơn (Tùy chọn)','Email liên hệ (Tùy chọn)')
 return s
edit('src/components/CheckoutModal.jsx',checkout)
