from pathlib import Path
root=Path(__file__).resolve().parent.parent
def edit(name, fn):
 p=root/name; p.write_text(fn(p.read_text(encoding='utf-8')),encoding='utf-8')
edit('src/main.jsx',lambda s:s.replace("import App from './App.jsx';","import App from './App.jsx';\nimport StoreProvider from './components/StoreProvider.jsx';").replace('<App />','<StoreProvider><App /></StoreProvider>'))
for file in ['src/components/ProductCatalog.jsx','src/views/ShopView.jsx','src/components/ProductDetailModal.jsx']:
 def change(s):
  s=s.replace("import { products, categories } from '../data/products';","import { categories } from '../data/products';\nimport { useStore } from './StoreProvider';")
  s=s.replace("import { products } from '../data/products';","import { useStore } from '../components/StoreProvider';")
  marker="  const [activeCategory" if 'ProductCatalog' in file else ('  const [searchQuery' if 'ShopView' in file else '  const product =')
  s=s.replace(marker,"  const { products, settings, loading: catalogLoading, error: catalogError } = useStore();\n"+marker,1)
  s=s.replace('[activeCategory, searchQuery, sortBy]','[products, activeCategory, searchQuery, sortBy]').replace('[selectedCategory, searchQuery, priceFilter, sortBy]','[products, selectedCategory, searchQuery, priceFilter, sortBy]')
  if 'ProductCatalog' in file:
   s=s.replace('if (onAddToCart) onAddToCart(product);','if (onSelectProduct) onSelectProduct(product.id);\n    return;')
   s=s.replace('{filteredProducts.length === 0 ? (','{catalogLoading ? <p role="status">Đang tải sản phẩm…</p> : catalogError ? <p role="alert">{catalogError}</p> : filteredProducts.length === 0 ? (')
  if 'ShopView' in file:
   s=s.replace("import React, { useState, useMemo }", "import React, { useState, useMemo, useEffect }")
   s=s.replace('  onSelectProduct,','  initialSearch = \'\',\n  onSelectProduct,',1)
   s=s.replace("  const [selectedCategory", "  useEffect(() => { setSearchQuery(initialSearch); }, [initialSearch]);\n  const [selectedCategory",1)
   s=s.replace('{filteredProducts.length === 0 ? (','{catalogLoading ? <p role="status">Đang tải sản phẩm…</p> : catalogError ? <p role="alert">{catalogError}</p> : filteredProducts.length === 0 ? (')
  if 'ProductDetailModal' in file:
   a=s.index('  // Derive default sizes'); b=s.index('  const [quantity',a)
   s=s[:a]+"  const defaultSizes = (product?.variants || []).map(v => v.size);\n"+s[b:]
   s=s.replace('  if (!product) return null;',"  const selectedVariant = product?.variants?.find(v => v.size === selectedSize);\n  const canBuy = settings?.sales_enabled && product?.active && selectedVariant?.stock >= quantity;\n  if (!product) return null;")
   s=s.replace('  const handleAdd = () => {','  const handleAdd = () => {\n    if (!canBuy) return;')
   s=s.replace('onClick={() => setQuantity(quantity + 1)}','onClick={() => setQuantity(Math.min(selectedVariant?.stock || 1, quantity + 1))}')
   s=s.replace('onClick={handleAdd}','onClick={handleAdd}\n                  disabled={!canBuy}')
   s=s.replace('<span>Thêm Vào Giỏ Hàng</span>',"<span>{canBuy ? 'Thêm Vào Giỏ Hàng' : 'Chưa có hàng để bán'}</span>")
   s=s.replace('onClick={() => setSelectedSize(sz)}','disabled={!product.variants.find(v => v.size === sz)?.stock}\n                        onClick={() => { setSelectedSize(sz); setQuantity(1); }}')
   s=s.replace('Kèm hộp quà sơn mài & thiệp chúc mừng (+35.000 VNĐ)',"Hộp quà & thiệp (+{new Intl.NumberFormat('vi-VN').format(settings?.gift_fee || 0)} đ / đơn)")
  return s
 edit(file,change)
edit('src/App.jsx',lambda s:s.replace("import Navbar from './components/Navbar';","import Navbar from './components/Navbar';\nimport { useStore } from './components/StoreProvider';").replace('export default function App() {','export default function App() {\n  const store = useStore();').replace('<ShopView\n','<ShopView\n            initialSearch={searchQuery}\n').replace('<ProductDetailModal\n','<ProductDetailModal\n          key={selectedProductId}\n').replace('    setCartItems((prev) => {',"    const real = store.products.find(p => p.id === product.id);\n    const variant = real?.variants?.find(v => v.size === product.size);\n    if (!real?.available || !variant || !Number.isInteger(quantity) || quantity < 1 || quantity > variant.stock) { setSelectedProductId(product.id); return; }\n    product = { ...real, size: product.size, isGift: product.isGift };\n    setCartItems((prev) => {",1).replace('item.quantity + quantity','Math.min(variant.stock, item.quantity + quantity)').replace('return { ...item, quantity };',"const stock = store.products.find(p => p.id === id)?.variants?.find(v => v.size === item.size)?.stock || 0;\n        return { ...item, quantity: Math.max(1, Math.min(stock, Number(quantity) || 1)) };").replace('      {/* Main Dynamic View Area */}',"      {store.settings?.sandbox && <div className=\"fixed top-0 inset-x-0 z-[60] bg-amber-200 text-black text-center text-xs py-1\">CỬA HÀNG THỬ NGHIỆM · Dữ liệu được lưu thật · Không thu tiền / giao hàng</div>}\n      {/* Main Dynamic View Area */}").replace('      <Footer />',"      {currentView !== 'memory' && <Footer />}").replace('    setCartItems([]);','    setCartItems([]);\n    store.refresh();',1))
