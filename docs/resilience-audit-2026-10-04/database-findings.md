# Database / Storage resilience audit — 2026-10-04

Áp dụng ECC `security-review` và `production-audit`. Kết luận dưới đây dựa trên các định nghĩa mới nhất trong migration của checkout hiện tại, không xác nhận migration nào đã được triển khai lên Cloud. Không truy cập DB production hay đọc credential. Năm cơ chế lỗi được xác minh bằng PostgreSQL 16 local; mức lưu lượng gây hết tài nguyên production chưa đo.

## DB-1 — P1: Thanh toán thiếu một khoản rất nhỏ giữ tồn kho vô thời hạn

- **Tình huống thực tế:** khách đặt toàn bộ số lượng còn lại theo VietQR rồi chuyển một khoản dương thấp hơn tổng đơn; có thể là vô ý trả thiếu hoặc cố ý giữ hàng với chi phí rất thấp. Webhook hợp lệ từ SePay ghi khoản tiền này. Khi hết thời hạn, hệ thống không giải phóng hàng.
- **Bằng chứng:** `api/sepay-webhook.js:19` chấp nhận mọi số nguyên dương, và `:38` gọi bank-payment RPC. `supabase/migrations/20260917011000_verified_bank_payments.sql:50` cập nhật `paid_amount`; `:51` đặt `partial` khi chưa đủ. Định nghĩa cuối cùng `private.expire_orders()` ở cùng file `:94` chỉ chọn `paid_amount=0`, không chọn đơn trả thiếu. `supabase/migrations/20260918000000_sepay_payment_gateway.sql:165` khóa tồn kho; `:167` trừ kho trong giao dịch; wrapper `:242` gán hạn hết giữ hàng. Các migration sau không sửa expiry này.
- **Kết quả tái hiện:** đặt 3/3 sản phẩm, nhận 1 VND qua bank RPC, đẩy `expires_at` về một giờ trước; expiry trả `0`, đơn vẫn `pending_payment|1|partial`, kho vẫn `0`. Hành vi này không phụ thuộc việc giả mạo webhook: kịch bản dùng giao dịch ngân hàng thật có số tiền thiếu; 1 VND chỉ là fixture cho điều kiện dương.
- **Tác động:** toàn bộ hàng của SKU có thể bị giữ, checkout khách thật báo hết hàng, admin phải dò và hủy thủ công. Đây là ngừng bán do logic nghiệp vụ, chưa phải lỗi process chết.
- **Khắc phục:** tách trạng thái tiền nhận và thời hạn giữ kho; khi hết hạn mà tổng tiền chưa đủ, chuyển sang hàng chờ xử lý/hoàn tiền và giải phóng kho bằng giao dịch idempotent. Đặt trần số lượng/đơn và tổng đơn đang giữ/account; không để một khoản partial nhỏ tự gia hạn vô hạn. Cần kiểm thử concurrency webhook–expiry và khoản tiền đến sau khi kho đã giải phóng.
- **Kiểm soát đã có:** giá tính tại DB, khóa hàng tồn kho, chống lặp `request_id`, giới hạn 30 đơn/account/giờ, webhook kiểm tra API key/account/mode, bank event idempotent. Các kiểm soát đó không xử lý partial-payment hold.

## DB-2 — P1: Account bất kỳ được tải số lượng file Match không giới hạn vào Storage

- **Tình huống thực tế:** người dùng đăng nhập gọi trực tiếp Storage upload, tạo tên file mới trong `match_<user_id>/...`; không cần mua sản phẩm, sở hữu Memory hay tạo Match. Lặp upload gây tăng dung lượng, metadata và chi phí. Người dùng bình thường thay ảnh nhiều lần cũng có thể làm file mồ côi tích lũy.
- **Bằng chứng hiệu lực:** `supabase/migrations/20260930120000_mismatch_accounts_and_progress.sql:768`–`:770` chỉ kiểm tra bucket, namespace trùng account và đường dẫn. Không kiểm tra số file, tổng byte, phiên upload hoặc Match tồn tại. Bucket ở `supabase/migrations/20260928072518_event_studios.sql:27` có trần **mỗi file** 8 MiB, `:28` hạn chế MIME; đó không phải hạn mức tổng/account. Memory bucket có kiểm tra chủ sở hữu nhưng tương tự không có tổng quota: `supabase/migrations/20260915044000_memory_media_runtime.sql:3`–`:7`.
- **Kết quả tái hiện:** RLS với nguyên văn policy cuối cùng cho phép account không sở hữu Memory chèn 100 object metadata có tên khác nhau. Đây là xác minh SQL authorization trên Storage schema shim; không thực hiện upload byte hay đo chi phí thật, và không xác minh giới hạn hạ tầng ngoài repository.
- **Tác động:** chiếm dung lượng/bandwidth, hóa đơn tăng, upload thật có thể lỗi khi giới hạn project hoặc tài nguyên Storage bị chạm. Không có bằng chứng production đã đầy.
- **Khắc phục:** reserve quota atomic trước upload, gồm tổng byte/count/account/ngày và số upload đang chờ; ràng buộc chính sách insert với reservation hợp lệ, kiểm tra kích thước thực lúc commit; giới hạn account mới và cấp quyền theo Match/Memory thực. Thu hồi reservation hết hạn và dọn orphan có khoảng đệm, có kiểm tra reference cả bản nháp lẫn published snapshot.
- **Bằng chứng orphan bình thường:** `src/services/eventService.js:273` upload tên mới; `src/components/MemoryMediaEditor.jsx:161` bỏ audio reference, `:241` bỏ gallery item nhưng không gọi Storage remove; `src/services/videoUpload.js:39` giữ file khi review lỗi để retry. Không tìm thấy worker dọn upload mồ côi trong migrations/scripts/server. Cần cleanup có reference check, không xóa ngay file đang có trong snapshot/publication.
- **Kiểm soát đã có:** bucket private, giới hạn MIME/kích thước mỗi file, namespace account, owner check cho Memory, moderation quota. Gallery tối đa 30 reference và quota 20 lần AI/ngày không giới hạn số upload trực tiếp.

## DB-3 — P1: Anonymous Memory read ghi log vô hạn và COUNT toàn lịch sử mỗi lần

- **Tình huống thực tế:** bot gọi public Memory RPC liên tục, kể cả Memory có PIN và bot chưa mở khóa. Mỗi request vẫn ghi một tap rồi đếm toàn lịch sử của Memory. Website/signed-media/API nội bộ cũng gọi cùng hàm, nên traffic bình thường làm log lớn dần.
- **Bằng chứng hiệu lực:** internal view cuối cùng ở `supabase/migrations/20260921163000_pin_hint_support.sql:139` INSERT tap và `:142` COUNT toàn bộ tap. Wrapper sanitized cuối cùng ở `supabase/migrations/20260915104510_memory_cinema_and_operations.sql:11` gọi internal trước khi xóa nội dung private ở `:12`; public EXECUTE vẫn được cấp cho wrapper ở `supabase/migrations/20260915044000_memory_media_runtime.sql:81`. Đã xét `20260922100000_security_hardening.sql:14`: internal RPC được thu hồi, nhưng wrapper vẫn là đường công khai hợp lệ.
- **Kết quả tái hiện:** 20 lần gọi wrapper với `SET ROLE anon`, không grant token và Memory vẫn có PIN, tạo đúng 20 `nfc_tap_events`.
- **Tác động:** request đọc trở thành write + index/WAL + COUNT ngày càng nhiều row. Một Memory bị flood kéo CPU/I/O/connection của DB chung, làm checkout/admin/AI quota chậm hoặc timeout; tap analytics không còn phản ánh lượt quét thật.
- **Khắc phục:** tách data read và event ingest; read không ghi DB, cache public metadata; ingest có limiter không bypass và dedupe theo cửa sổ, counter aggregate atomic, retention/batch archive. Giới hạn query và timeout tại DB/gateway; không đếm toàn raw history trong đường đọc nóng.
- **Kiểm soát đã có:** private payload bị lọc, internal EXECUTE thu hồi; index `audit_taps_memory` ở `supabase/migrations/20260922100000_security_hardening.sql:118` giúp lookup nhưng không loại bỏ việc đọc tăng theo lịch sử. Không đo tải làm cạn production, không thử DoS thật.

## DB-4 — P2: Năm lần nhập sai PIN khóa mọi người xem Memory trong 15 phút

- **Tình huống thực tế:** kẻ biết tag gửi năm mã sai, sau đó người nhận biết đúng PIN cũng không mở được Memory trong 15 phút. Kẻ đó có thể lặp sau mỗi lần hết khóa để duy trì gián đoạn một hoặc nhiều Memory.
- **Bằng chứng hiệu lực:** bộ đếm khóa theo `memory_id` duy nhất (`supabase/migrations/20260913_init_emoria_schema.sql:61`), kiểm tra khóa **trước** xác thực PIN ở `:444`; năm lỗi đặt thời hạn 15 phút ở `:459`. RPC công khai tại `:627`. Hardening mới nhất ở `supabase/migrations/20260922100000_security_hardening.sql:23` chỉ thêm khóa row Memory và kiểm tra suspended, không thay khóa toàn cục này.
- **Kết quả tái hiện:** sau năm sai bằng anon, PIN đúng bị trả `success:false`, row `failed_count=5`, `locked_until>now()`.
- **Tác động:** targeted denial của món quà/Memory có PIN. Chủ sở hữu đăng nhập và recipient đã được cấp account có đường xem riêng; attack không chặn toàn bộ website và không tự thu hồi grant hợp lệ đang tồn tại.
- **Khắc phục:** rate-limit theo nguồn tin cậy kết hợp account/session và Memory; cap tổng traffic chống brute-force nhưng không cho một nguồn tạo khóa toàn cục dễ dàng. Progressive delay/challenge khi vượt ngưỡng, thông báo/reset được xác thực cho owner. Không chỉ đổi sang IP đơn thuần vì bot phân tán có thể brute-force.
- **Kiểm soát đã có:** bcrypt, counter atomic/row lock, khóa 15 phút không bị kéo dài bởi request trong thời gian đang khóa, PIN edit revoke grants. Đây là tradeoff availability còn lại của khóa toàn cục.

## DB-5 — P2: Rate-limit contact dùng chuỗi phone do khách tự chọn nên bypass dễ dàng

- **Tình huống thực tế:** bot gửi số điện thoại giả khác nhau hoặc thay cách viết bằng dấu cách/dấu `+`, mỗi request pass cooldown. Contact inbox tăng vô hạn, admin đọc inbox phải chịu spam; SQL kiểm tra trùng tiếp tục quét bảng tăng dần.
- **Bằng chứng hiệu lực:** `supabase/migrations/202609140001_store_operations.sql:129` lock theo `p_phone`; `:130` kiểm tra chính chuỗi đó trong một phút; `:131` chèn row. `:135` cấp EXECUTE cho anon; không có migration thay định nghĩa này. Schema `:122` không có index phone/time và không tìm thấy index hoặc retention sau đó. API route `server/routes.js:119` là public và chỉ trim/validate shape rồi gọi RPC ở `:127`.
- **Kết quả tái hiện:** 10 số fixture khác nhau được anon gửi thành công trong cùng một transaction, không phải đợi cooldown.
- **Tác động:** inbox không dùng được, DB tăng dung lượng; scan/index/WAL tăng gây contention DB chung. Chưa có load test xác định ngưỡng production bị sập.
- **Khắc phục:** anti-bot/challenge và hạn mức theo nguồn tin cậy trước insert, cộng budget tổng; đưa RPC sau server gateway hoặc bắt quota tại DB theo identity được server cấp. Normalize phone trước rate-limit; thêm index `(phone,created_at)` và retention/archival. Index đơn thuần không chặn spam.
- **Kiểm soát đã có:** field length validation, private admin inbox, serialized duplicate-phone cooldown; không phải SQL injection hay lộ PII.

## Các điểm cần đo thêm / chưa kết luận là outage

- `rpc_track_order` cuối cùng (`supabase/migrations/20260918000000_sepay_payment_gateway.sql:275`) tìm bằng `upper(id)`, nhưng chỉ thấy primary key `id` và lookup-token index, không thấy expression index `upper(id)`. Với số đơn lớn, query này có thể scan toàn bảng; cần EXPLAIN trên dữ liệu có phân bố tương tự production. Không kết luận hiện đang chậm.
- Article detail (`supabase/migrations/20260917000000_article_views_memory_author_guestbook_moderation.sql:10`) UPDATE cùng article row ở mỗi read, tổng hợp comments không phân trang `:13`. Public search COUNT + ILIKE `%query%` (`supabase/migrations/20260914_articles_system.sql:178`) và offset không có trần trực tiếp. Cần đo traffic/dữ liệu thực để chọn cache, search index và pagination; chưa tái hiện outage.
- Claim RPC (`supabase/migrations/20260916095740_claim_code_compatibility.sql:13`) dùng bcrypt cho chip chưa nhận nhưng không có attempt quota; account có thể gây CPU/row contention khi có nhiều tag chưa nhận. Claim code ngẫu nhiên dài và row lock chống chiếm ownership đồng thời; chưa chứng minh cạn CPU.
- Account/Auth CAPTCHA, provider Storage rate-limit, budget alerts, quota project, actual cron health và migrations đang áp dụng không được đọc từ production trong audit này.

## Xác minh đã chạy

`node docs/resilience-audit-2026-10-04/database-reproduce.mjs` — exit **0**, PostgreSQL **16.15** trong container local `emoria-test-db`. Script tạo database riêng `emoria_resilience_audit_<timestamp>` và xóa trong `finally`. Không chạy suite event DB cũ vì suite đó xóa table trên sandbox dùng chung. Bank/checkout/contact migration under test giữ nguyên function body; môi trường PostgreSQL tối thiểu bỏ riêng GRANT tới role Cloud `service_role`, không load cron Cloud. PIN dùng đúng block patch H3 hiện tại. Memory view dùng đúng internal/wrapper cuối cùng. Storage dùng schema shim và nguyên văn policy insert hiệu lực, không upload byte.
