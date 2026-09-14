-- ==============================================================================
-- EMORIA LUXURY - SEED TỒN KHO BIẾN THỂ SẢN PHẨM (INVENTORY CONFIG)
-- Khớp 100% với các tùy chọn kích cỡ trên giao diện UI
-- Chạy trên Supabase Dashboard -> SQL Editor (hoặc DB local) để mở bán sản phẩm
-- ==============================================================================

INSERT INTO public.checkout_variants (product_id, size, stock) VALUES
-- 1. Nhẫn EMORIA HORIZON
('emoria-horizon', 'Size 6', 50),
('emoria-horizon', 'Size 7', 50),
('emoria-horizon', 'Size 8', 50),
('emoria-horizon', 'Tiêu chuẩn', 50),

-- 2. Vòng tay EMORIA PULSE
('emoria-pulse', '15cm (Nhỏ)', 50),
('emoria-pulse', '16.5cm (Vừa)', 50),
('emoria-pulse', '18cm (Lớn)', 50),
('emoria-pulse', 'Tiêu chuẩn', 50),

-- 3. Vòng tay EMORIA HALO
('emoria-halo', '15cm (Nhỏ)', 50),
('emoria-halo', '16.5cm (Vừa)', 50),
('emoria-halo', '18cm (Lớn)', 50),
('emoria-halo', 'Tiêu chuẩn', 50),

-- 4. Bộ đôi vòng EMORIA CELESTIAL DUO
('emoria-celestial-duo', '15cm (Nhỏ)', 50),
('emoria-celestial-duo', '16.5cm (Vừa)', 50),
('emoria-celestial-duo', '18cm (Lớn)', 50),
('emoria-celestial-duo', 'Tiêu chuẩn', 50),

-- 5. Dây chuyền EMORIA LUMEN
('emoria-lumen', 'Dây 45cm', 50),
('emoria-lumen', 'Tiêu chuẩn', 50),

-- 6. Móc khóa EMORIA SOLARIS KEYRING
('emoria-solaris-keyring', 'Dây 45cm', 50),
('emoria-solaris-keyring', 'Tiêu chuẩn', 50)

ON CONFLICT (product_id, size) 
DO UPDATE SET stock = EXCLUDED.stock;
