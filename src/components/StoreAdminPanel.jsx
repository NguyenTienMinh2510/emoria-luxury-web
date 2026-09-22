import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/apiClient.js';
import { callStore } from '../services/catalogService';
import { useStore } from './StoreProvider';
import { Sparkles, Eye } from 'lucide-react';

export default function StoreAdminPanel({ section = 'catalog' }) {
  const store = useStore();
  const [settings, setSettings] = useState(store.settings);
  const [products, setProducts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const mapProduct = (p) => {
    const cat = p.details?.category || p.category || (p.name?.toLowerCase().includes('nhẫn') ? 'Nhẫn' : p.name?.toLowerCase().includes('vòng') ? 'Vòng tay' : 'Dây chuyền');
    const arType = p.details?.ar?.type || (cat === 'Nhẫn' ? 'ring' : cat === 'Vòng tay' ? 'bracelet' : 'necklace');
    const defaultSize = p.details?.ar?.defaultSize || (arType === 'ring' ? 17 : arType === 'bracelet' ? 16 : 45);
    const finger = p.details?.ar?.finger || 'ring';
    const modelUrl = p.details?.ar?.modelUrl || '';
    const arAsset = p.details?.ar?.asset || '';
    const scale = p.details?.ar?.scale || (arType === 'ring' ? 0.22 : arType === 'bracelet' ? 0.35 : 0.09);

    return {
      ...p,
      category: cat,
      arType,
      defaultSize,
      finger,
      modelUrl,
      arAsset,
      scale,
      variants: (p.variants || []).map(v => ({ ...v }))
    };
  };

  useEffect(() => {
    setProducts((store.products || []).map(mapProduct));
    setSettings(store.settings);
  }, [store.products, store.settings]);

  useEffect(() => {
    if (section === 'contacts') {
      apiRequest('/admin/contacts').then(setContacts).catch(e => setMessage(e.message));
    }
  }, [section]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage('Đã lưu dữ liệu lên máy chủ.');
      await store.refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCategoryChange = (index, newCat) => {
    setProducts(products.map((x, i) => {
      if (i !== index) return x;
      let arType = x.arType;
      let defaultSize = x.defaultSize;
      let scale = x.scale;

      if (newCat === 'Nhẫn') {
        arType = 'ring';
        defaultSize = 17;
        scale = 0.22;
      } else if (newCat === 'Vòng tay') {
        arType = 'bracelet';
        defaultSize = 16;
        scale = 0.35;
      } else if (newCat === 'Dây chuyền') {
        arType = 'necklace';
        defaultSize = 45;
        scale = 0.09;
      }

      return {
        ...x,
        category: newCat,
        arType,
        defaultSize,
        scale
      };
    }));
  };

  const handleAddProduct = () => {
    setProducts(prev => [
      {
        id: "product-" + crypto.randomUUID().slice(0, 8),
        name: "Sản phẩm mới",
        category: "Nhẫn",
        arType: "ring",
        defaultSize: 17,
        finger: "ring",
        modelUrl: "",
        arAsset: "",
        scale: 0.22,
        price: 250000,
        image: "/assets/product_horizon.png",
        active: false,
        variants: [{ size: "17", stock: 10 }]
      },
      ...prev
    ]);
  };

  const handleSaveProduct = async (p) => {
    // Validation: Require complete AR information to ensure AR try-on can be created immediately
    if (!p.name?.trim()) {
      setMessage('Vui lòng nhập tên sản phẩm.');
      return;
    }
    if (!p.price || Number(p.price) < 1) {
      setMessage('Vui lòng nhập giá sản phẩm hợp lệ (> 0 đ).');
      return;
    }
    if (!p.image?.trim()) {
      setMessage('Vui lòng nhập ảnh sản phẩm.');
      return;
    }
    if (!p.category) {
      setMessage('Vui lòng chọn phân loại sản phẩm.');
      return;
    }
    if (!['ring', 'bracelet', 'necklace'].includes(p.arType)) {
      setMessage('Vui lòng chọn loại AR hợp lệ (Nhẫn, Vòng tay, hoặc Dây chuyền).');
      return;
    }
    if (!p.defaultSize || Number(p.defaultSize) <= 0) {
      setMessage('Vui lòng nhập kích cỡ AR mặc định (mm hoặc cm) để tạo gương AR.');
      return;
    }
    if (!p.variants?.length) {
      setMessage('Cần ít nhất 1 kích cỡ / biến thể sản phẩm.');
      return;
    }

    const details = {
      ...(p.details || {}),
      category: p.category,
      ar: {
        enabled: true,
        type: p.arType,
        defaultSize: Number(p.defaultSize),
        finger: p.arType === 'ring' ? (p.finger || 'ring') : undefined,
        modelUrl: p.modelUrl?.trim() || null,
        asset: p.arAsset?.trim() || p.image,
        scale: Number(p.scale) || (p.arType === 'ring' ? 0.22 : p.arType === 'bracelet' ? 0.35 : 0.09)
      }
    };

    await run(async () => {
      await callStore('rpc_save_catalog', {
        p_id: p.id,
        p_expected: p.snapshot || null,
        p_product: {
          name: p.name.trim(),
          price: Number(p.price),
          active: Boolean(p.active),
          image: p.image.trim(),
          details
        },
        p_variants: p.variants.map(v => ({
          size: String(v.size).trim(),
          stock: Number(v.stock) || 0
        }))
      });
    });
  };

  if (section === 'contacts') {
    return (
      <div className="space-y-4">
        <h3 className="font-serif text-xl">Yêu cầu liên hệ</h3>
        {message && <p role="status" className="text-sm text-amber-300">{message}</p>}
        {contacts.map(c => (
          <div className="p-4 rounded-xl border border-white/10 space-y-2" key={c.id}>
            <p className="font-medium">{c.name} · {c.phone}</p>
            <p className="text-sm text-slate-300 whitespace-pre-line">{c.note}</p>
            <label className="text-xs flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={c.resolved}
                onChange={() => run(async () => {
                  await apiRequest('/admin/contacts/' + encodeURIComponent(c.id), {
                    method: 'PATCH',
                    body: { resolved: !c.resolved }
                  });
                  setContacts(prev => prev.map(x => x.id === c.id ? { ...x, resolved: !c.resolved } : x));
                })}
              /> Đã xử lý
            </label>
          </div>
        ))}
        {!contacts.length && <p className="text-slate-400">Chưa có yêu cầu.</p>}
      </div>
    );
  }

  if (section === 'settings') {
    return (
      <form
        className="space-y-5"
        onSubmit={e => {
          e.preventDefault();
          run(() => apiRequest('/admin/settings', { method: 'PATCH', body: settings }));
        }}
      >
        <h3 className="font-serif text-xl">Cấu hình cửa hàng</h3>
        {message && <p role="status" className="text-sm text-amber-300">{message}</p>}
        {settings && (
          <>
            <div className="flex gap-5 flex-wrap">
              {[
                ['sandbox', 'Chế độ thử nghiệm (Bật/tắt thanh banner vàng trên cùng)'],
                ['sales_enabled', 'Nhận đơn hàng'],
                ['cod_enabled', 'Thanh toán COD'],
                ['transfer_enabled', 'Chuyển khoản VietQR (Mở App tự động)']
              ].map(([k, l]) => (
                <label className="text-sm font-semibold flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10" key={k}>
                  <input
                    type="checkbox"
                    checked={settings[k]}
                    onChange={e => setSettings({ ...settings, [k]: e.target.checked })}
                  /> {l}
                </label>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ['shipping_fee', 'Phí giao hàng'],
                ['free_shipping_from', 'Miễn phí giao từ'],
                ['gift_fee', 'Phí hộp quà / đơn'],
                ['reservation_minutes', 'Giữ đơn thanh toán online (phút)'],
                ['bank_bin', 'Mã BIN ngân hàng VietQR'],
                ['bank_account', 'Số tài khoản'],
                ['bank_owner', 'Tên chủ tài khoản'],
                ['contact_email', 'Email hỗ trợ'],
                ['contact_phone', 'Điện thoại'],
                ['address', 'Địa chỉ'],
                ['ga4_measurement_id', 'GA4 Measurement ID (G-…)']
              ].map(([k, l]) => (
                <label className="store-label" key={k}>
                  {l}
                  <input
                    className="store-input"
                    type={typeof settings[k] === 'number' ? 'number' : 'text'}
                    min={k === 'reservation_minutes' ? 5 : 0}
                    value={settings[k] ?? ''}
                    onChange={e => setSettings({
                      ...settings,
                      [k]: typeof settings[k] === 'number' ? Number(e.target.value) : e.target.value
                    })}
                  />
                </label>
              ))}
            </div>

            {[
              ['shipping_policy', 'Chính sách giao hàng'],
              ['return_policy', 'Đổi trả / bảo hành'],
              ['privacy_policy', 'Chính sách dữ liệu']
            ].map(([k, l]) => (
              <label className="store-label" key={k}>
                {l}
                <textarea
                  rows={3}
                  className="store-input"
                  value={settings[k] || ''}
                  onChange={e => setSettings({ ...settings, [k]: e.target.value })}
                />
              </label>
            ))}

            <button disabled={busy} className="store-button">Lưu cấu hình</button>
          </>
        )}
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h3 className="font-serif text-xl flex items-center gap-2">
            Sản phẩm & Tồn kho AR
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-sans font-normal border border-amber-400/30">
              100% Hỗ trợ Gương AR 3D
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Mọi sản phẩm đều yêu cầu thông tin cấu hình AR để người dùng có thể thử trực tiếp trên gương ảo WebGL.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className="store-button flex items-center gap-2"
            disabled={busy}
            onClick={handleAddProduct}
          >
            <Sparkles size={16} />
            Thêm sản phẩm mới
          </button>
          <button
            disabled={busy}
            className="px-4 py-2.5 rounded-xl border border-white/20 text-sm hover:bg-white/5 disabled:opacity-40"
            onClick={() => {
              if (window.confirm("Tải lại và bỏ phần chỉnh sửa chưa lưu?")) store.refresh();
            }}
          >
            Tải lại
          </button>
        </div>
      </div>

      {message && (
        <div role="status" className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
          {message}
        </div>
      )}

      <div className="space-y-6">
        {products.map((p, index) => (
          <form
            key={p.id}
            className="p-5 rounded-2xl border border-white/15 bg-white/[0.02] space-y-5 shadow-lg"
            onSubmit={e => {
              e.preventDefault();
              handleSaveProduct(p);
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400">ID: {p.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.active ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700/40 text-slate-400'}`}>
                  {p.active ? 'Đang mở bán' : 'Tạm ngừng bán'}
                </span>
              </div>
              <label className="text-xs font-medium flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={p.active}
                  onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, active: e.target.checked } : x))}
                /> Mở bán sản phẩm này
              </label>
            </div>

            {/* Thông tin cơ bản */}
            <div className="grid sm:grid-cols-4 gap-4">
              <label className="store-label sm:col-span-2">
                Tên sản phẩm *
                <input
                  required
                  className="store-input"
                  value={p.name}
                  onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, name: e.target.value } : x))}
                />
              </label>
              <label className="store-label">
                Giá (VND) *
                <input
                  required
                  type="number"
                  min={1}
                  className="store-input"
                  value={p.price}
                  onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, price: e.target.value } : x))}
                />
              </label>
              <label className="store-label">
                Phân loại trang sức *
                <select
                  required
                  className="store-input bg-black/80"
                  value={p.category}
                  onChange={e => handleCategoryChange(index, e.target.value)}
                >
                  <option value="Nhẫn">Nhẫn (Ring)</option>
                  <option value="Vòng tay">Vòng tay (Bracelet)</option>
                  <option value="Dây chuyền">Dây chuyền (Necklace)</option>
                  <option value="Khác">Khác / Phụ kiện</option>
                </select>
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <label className="store-label sm:col-span-2">
                Ảnh sản phẩm chính (URL) *
                <input
                  required
                  className="store-input"
                  value={p.image}
                  onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, image: e.target.value } : x))}
                />
              </label>
              <div className="flex items-end">
                {p.image && (
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/10 w-full h-[46px]">
                    <img src={p.image} alt={p.name} className="w-8 h-8 object-cover rounded-md" />
                    <span className="text-xs text-slate-300 truncate">Xem trước ảnh</span>
                  </div>
                )}
              </div>
            </div>

            {/* Khung cấu hình AR BẮT BUỘC */}
            <div className="p-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.03] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  <Eye size={16} /> Cấu hình Thử AR (Gương ảo WebGL) *
                </h4>
                <span className="text-[11px] text-amber-200/70">Bắt buộc đủ thông tin để kích hoạt AR</span>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <label className="store-label">
                  Loại AR trải nghiệm *
                  <select
                    required
                    className="store-input bg-black/80 text-amber-100"
                    value={p.arType}
                    onChange={e => {
                      const newType = e.target.value;
                      setProducts(products.map((x, i) => {
                        if (i !== index) return x;
                        const defSize = newType === 'ring' ? 17 : newType === 'bracelet' ? 16 : 45;
                        const defScale = newType === 'ring' ? 0.22 : newType === 'bracelet' ? 0.35 : 0.09;
                        return { ...x, arType: newType, defaultSize: defSize, scale: defScale };
                      }));
                    }}
                  >
                    <option value="ring">Nhẫn (Thử trên ngón tay 3D)</option>
                    <option value="bracelet">Vòng tay (Thử trên cổ tay 3D)</option>
                    <option value="necklace">Dây chuyền (Thử trên cổ / ngực 3D)</option>
                  </select>
                </label>

                <label className="store-label">
                  {p.arType === 'ring' ? 'Kích cỡ nhẫn mặc định (mm) *' : p.arType === 'bracelet' ? 'Kích cỡ vòng mặc định (cm) *' : 'Chiều dài dây mặc định (cm) *'}
                  <input
                    required
                    type="number"
                    step={p.arType === 'bracelet' ? '0.5' : '1'}
                    min={1}
                    className="store-input"
                    value={p.defaultSize}
                    onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, defaultSize: e.target.value } : x))}
                  />
                </label>

                {p.arType === 'ring' ? (
                  <label className="store-label">
                    Vị trí ngón tay đeo AR *
                    <select
                      className="store-input bg-black/80"
                      value={p.finger}
                      onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, finger: e.target.value } : x))}
                    >
                      <option value="ring">Ngón áp út (Ring Finger)</option>
                      <option value="middle">Ngón giữa (Middle Finger)</option>
                      <option value="index">Ngón trỏ (Index Finger)</option>
                      <option value="thumb">Ngón cái (Thumb)</option>
                      <option value="pinky">Ngón út (Pinky)</option>
                    </select>
                  </label>
                ) : (
                  <label className="store-label">
                    Tỉ lệ hiển thị AR (Scale) *
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="2.0"
                      className="store-input"
                      value={p.scale}
                      onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, scale: e.target.value } : x))}
                    />
                  </label>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="store-label">
                  Đường dẫn 3D Model (.glb / .gltf)
                  <input
                    placeholder="Để trống để dùng Three.js PBR Engine tự động"
                    className="store-input placeholder:text-slate-600"
                    value={p.modelUrl}
                    onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, modelUrl: e.target.value } : x))}
                  />
                </label>
                <label className="store-label">
                  Asset AR tùy biến (Ảnh PNG/SVG overlay)
                  <input
                    placeholder="Để trống sẽ dùng ảnh sản phẩm chính"
                    className="store-input placeholder:text-slate-600"
                    value={p.arAsset}
                    onChange={e => setProducts(products.map((x, i) => i === index ? { ...x, arAsset: e.target.value } : x))}
                  />
                </label>
              </div>
            </div>

            {/* Quản lý Biến thể & Tồn kho */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">Biến thể & Tồn kho kích cỡ</span>
                <button
                  type="button"
                  className="text-xs underline text-amber-300 hover:text-amber-200"
                  onClick={() => {
                    const size = window.prompt("Tên kích cỡ mới (ví dụ: 16, 17, 18 hoặc 45cm):");
                    if (size?.trim() && !p.variants.some(v => v.size === size.trim())) {
                      setProducts(prev => prev.map((x, i) => i === index ? {
                        ...x,
                        variants: [...x.variants, { size: size.trim(), stock: 10 }]
                      } : x));
                    }
                  }}
                >
                  + Thêm kích cỡ
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {p.variants.map((v, j) => (
                  <label className="store-label" key={v.size}>
                    Size {v.size}
                    <input
                      className="store-input"
                      type="number"
                      min={0}
                      required
                      value={v.stock}
                      onChange={e => setProducts(products.map((x, i) => i === index ? {
                        ...x,
                        variants: x.variants.map((variant, k) => k === j ? { ...variant, stock: e.target.value } : variant)
                      } : x))}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={busy}
                className="store-button flex items-center gap-2"
              >
                <Sparkles size={15} />
                Lưu cấu hình sản phẩm & AR
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
