import fs from 'node:fs';
const target = 'local-stack/supabase';
fs.mkdirSync(`${target}/migrations`, { recursive: true });
const files = ['20260913_init_emoria_schema.sql','20260914_atomic_checkout.sql','20260914_articles_system.sql','202609140001_store_operations.sql','202609140002_editor_security.sql'];
files.forEach((file, i) => fs.copyFileSync(`supabase/migrations/${file}`, `${target}/migrations/20260914000${i+1}_${file.split('_').slice(1).join('_')}`));
let config = fs.readFileSync(`${target}/config.toml`, 'utf8');
config = config.replace('project_id = "local-stack"','project_id = "emoria-sandbox"').replaceAll('5432','5532');
config = config.replace(/site_url = .*/, 'site_url = "http://127.0.0.1:3000"').replace(/additional_redirect_urls = .*/, 'additional_redirect_urls = ["http://127.0.0.1:3000/**", "http://localhost:3000/**"]');
for (const section of ['analytics','realtime','studio','edge_runtime','storage.vector']) config=config.replace(new RegExp('(\\['+section.replace('.','\\.')+'\\][\\s\\S]*?enabled = )true'), '$1false');
fs.writeFileSync(`${target}/config.toml`, config);
fs.writeFileSync(`${target}/seed.sql`, fs.readFileSync('supabase/seeds/demo_memory_spaces.sql','utf8')+'\n'+fs.readFileSync('supabase/seeds/checkout_variants_inventory.sql','utf8')+`\nUPDATE public.store_settings SET sandbox=true,sales_enabled=true,cod_enabled=true,transfer_enabled=true,contact_email='support@emoria.example',address='Cửa hàng trực tuyến thử nghiệm',shipping_policy='Chính sách thử nghiệm: phí giao 30.000 đ, miễn phí từ 1.000.000 đ. Không giao hàng thật.',return_policy='Chính sách thử nghiệm. Cần thay bằng điều kiện đổi trả đã duyệt trước khi mở bán.',privacy_policy='Môi trường thử nghiệm. Chỉ nhập thông tin giả lập.' WHERE id=true;
INSERT INTO public.articles(slug,title,excerpt,content,category,cover_image,status,published_at) VALUES
('bat-dau-voi-emoria','Một món quà, một câu chuyện','Khám phá cửa hàng và không gian ký ức trong bản thử nghiệm EMORIA.','## Chào mừng đến EMORIA\n\nĐây là nội dung thử nghiệm. Bạn có thể chọn trang sức, đặt đơn và theo dõi quá trình xử lý.\n\n## Thử một đơn hàng\n\n- Chọn kích cỡ và số lượng.\n- Nhập thông tin nhận hàng giả lập.\n- Giữ mã tra cứu riêng của bạn.\n\n> Không chuyển tiền hoặc nhập dữ liệu cá nhân thật ở môi trường này.','Hướng dẫn','/assets/product_lumen.png','published',now()),
('mon-qua-cua-ban','Lưu giữ câu chuyện của bạn','Tìm hiểu cách trải nghiệm Memory Space.','## Không gian dành cho kỷ niệm\n\nTrang sức chứa một đường dẫn NFC. Nội dung ký ức được lưu trên máy chủ.\n\nChủ sở hữu có thể đặt PIN để giới hạn người xem. Liên kết chỉ mở nội dung khi đáp ứng quyền truy cập.','Công nghệ & NFC','/assets/product_pulse.png','published',now()) ON CONFLICT(slug) DO NOTHING;
`);
console.log('Prepared isolated local migrations and fictional fixtures. No cloud changes.');
