# Vận hành, phát hành và phục hồi

Ngày 04/10/2026. Source `16c0601d09edd5676d7a6fd6d64dcac820a7855c`. Các mục bên dưới dựa trên file hiện có và kiểm tra HTTP đọc cơ bản, không giả định cấu hình dashboard.

## O1 — Backup script không đủ để khôi phục hệ thống (P1, xác nhận phạm vi backup)

**Bằng chứng:** `scripts/backup-cloud.mjs:7–10` xuất JSON của 11 bảng, một phần hàm public (`rpc_%`, `is_admin`, `handle_new_user`) và policy. Không xuất đầy đủ hàm private, table DDL hoặc grants. Danh sách không có `orders`, `order_items`, `checkout_requests`, `bank_payment_events`, `gateway_payment_events`, `profiles`, `auth.users`, `nfc_links`, `memory_recipients`, `memory_houses`, `memory_matches`, các bảng event/review. Không tải các object của Storage. File cùng tên bị ghi đè qua mỗi lượt; các truy vấn từng bảng không dùng một snapshot transaction chung. Không thấy lịch backup, bản sao ngoài máy hay quy trình restore đã kiểm chứng trong workflow được kiểm tra.

**Viễn cảnh:** xóa nhầm dữ liệu, lỗi migration, hỏng máy chứa bản sao hoặc tài khoản quản trị bị chiếm. Chỉ phục hồi từ script này sẽ thiếu đơn hàng, đối soát tiền, danh tính, quyền chia sẻ, nhà/Match và ảnh/video. Đây là thiếu hụt phục hồi đã xác nhận trong script; trạng thái backup/PITR thực tế trên Supabase chưa kiểm tra.

**Khắc phục:** backup nhất quán toàn database bằng công cụ được hỗ trợ, backup riêng object Storage có manifest/checksum, mã hóa và lưu bản có phiên bản ngoài máy/tài khoản triển khai; kiểm tra restore vào dự án cô lập. Chốt RPO/RTO phù hợp rồi cảnh báo backup thất bại. Supabase xác nhận database backup không chứa object Storage: [Database Backups](https://supabase.com/docs/guides/platform/backups).

## O2 — CI xanh chưa xác nhận tính tương thích SQL/runtime của bản phát hành (P2, xác nhận khoảng trống kiểm chứng)

**Bằng chứng:** `.github/workflows/ci.yml:25–27` chỉ `npm ci`, `test:ci`, `build`; `vercel.json:2` tương tự. `tests/mismatch_integration.test.mjs:41–62` thoát 0 và bỏ qua database khi không có `.local/supabase.json` hoặc local backend. `.vercelignore` loại `.local` và `supabase`. Các bộ DB bắt buộc riêng trong package scripts không thuộc workflow. `scripts/apply-cloud-migrations.mjs:5–11` chỉ liệt kê 5 migration tháng 9, là công cụ nâng cấp cũ, không phải manifest của bản hiện tại. `tests/cron_health.sql` có kiểm tra cron nhưng không được gọi trong CI này.

**Viễn cảnh:** triển khai frontend/server mới trước SQL/grants tương ứng; build xanh nhưng lưu nhà, publish, AI quota hoặc checkout trả lỗi thiếu hàm/quyền/cột. Rollback frontend riêng có thể tiếp tục lệch database. Hôm kiểm tra, homepage live dùng `/assets/main-Dzxj91QX.js`, local build dùng `/assets/main-B1OnzZTv.js`; đây chỉ chứng minh artifact khác nhau, không chứng minh live đang thiếu bản vá, vì env build cũng có thể đổi hash.

**Khắc phục:** CI riêng chạy toàn bộ migration trên DB mới dùng một lần, kiểm tra RPC/RLS/Storage/cron, thử nâng cấp từ schema bản trước; release manifest ghi SHA code + migration versions + env/runtime. Dùng bước triển khai có thứ tự và schema tương thích ngược; sau deploy chạy smoke có xác thực trong staging. Đối chiếu deployment SHA và schema/grants production trước khi kết luận lỗ hổng live. Repo có công cụ DB verification cô lập và release event theo transaction, nhưng chúng chưa được gọi thành gate bắt buộc trong CI này. Lệch schema thật có thể là sự cố P1; khoảng trống được xác nhận hiện tại xếp P2.

## O3 — Scheduler ngừng chạy sẽ giữ tồn kho đơn chưa thanh toán (P1, viễn cảnh có điều kiện)

**Bằng chứng:** `supabase/migrations/20260915114549_checkout_recovery_and_expiry.sql:95` lên lịch `private.expire_orders()` mỗi phút; phiên bản mới của hàm ở `20260917011000_verified_bank_payments.sql:91–104`. `tests/cron_health.sql:3–8` kiểm job active và lần thành công trong 5 phút gần nhất nhưng workflow không chạy. Không có bằng chứng cron production đang lỗi.

**Viễn cảnh:** sau migration/restore, job bị mất, bị tắt hoặc chạy lỗi; đơn không nhận tiền đã quá hạn vẫn giữ stock, khách thấy hết hàng giả. Trường hợp nhận một phần tiền là lỗi logic riêng D1, vẫn xảy ra ngay khi cron hoạt động.

**Khắc phục:** giám sát lần chạy thành công và số đơn quá hạn chưa hoàn kho; canary tạo/hủy đơn trong staging, runbook gọi expiry có quyền, cảnh báo trước khi stock cạn. Giữ cơ chế row lock/stock_released để hoàn kho đúng một lần.

## O4 — Lệnh test event xóa dữ liệu trên sandbox đang dùng (P2, xác nhận mã nguồn)

**Bằng chứng:** `tests/event_studios_database.test.js:4` mặc định container `supabase_db_emoria-sandbox`; `:36` dùng DB `postgres`, `:39–45` DROP CASCADE các bảng House, Match, reply, report, analytics. Lệnh nằm trong `npm run test:event-db`. Không tạo database dùng một lần trước thao tác này.

**Viễn cảnh:** người vận hành chạy lệnh test vì tưởng chỉ xác minh, làm mất dữ liệu studio của môi trường local dùng chung. Phạm vi mặc định là sandbox local; không có chứng cứ script này đang chạy vào cloud. Đợt audit này không chạy script này.

**Khắc phục:** tạo DB/stack riêng theo invocation, xác nhận đích là môi trường dùng một lần, cleanup chỉ DB được tạo; test phải thất bại nếu thiếu môi trường riêng. Dùng cách cô lập tương tự `tests/backend_database.test.js` hoặc audit harness.

## O5 — Khả năng phục vụ public và giới hạn hạ tầng cần xác minh dashboard (chưa xếp là exploit đã chứng minh)

**Quan sát:** 6 HTTP kiểm tra đọc cơ bản thành công: homepage/catalog/system-status/Auth-health/catalog-schema HTTP200, analytics không đăng nhập HTTP401. Homepage có HSTS nhưng không trả CSP, X-Frame-Options, nosniff hoặc Referrer-Policy. API v1 có một số header bảo vệ riêng; không suy từ header API sang trang HTML.

**Viễn cảnh cần drill:** Vercel/Supabase/CDN/SMTP ngừng hoạt động, DNS hoặc certificate lỗi, egress/storage/GPU hết quota, key bị thu hồi, tài khoản chủ sở hữu bị chiếm. Source không thể chứng minh WAF, spend caps, MFA, PITR, SMTP và alert thực tế. Không chứng minh XSS hay chiếm admin chỉ vì thiếu CSP.

**Việc kiểm chứng:** export cấu hình không chứa secrets của dashboard, xác minh limit/rate rule/spend alert, quyền tài khoản/MFA, backup, error/latency/storage/cron metrics; staging thử mất từng dependency. Supabase Auth giới hạn endpoint auth không thay thế quota cho RPC database: [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits). Có thể đặt rate rules trước function bằng [Vercel WAF](https://vercel.com/kb/guide/add-rate-limiting-vercel), đồng thời vẫn bảo vệ đường gọi trực tiếp Supabase.
