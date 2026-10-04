# EMORIA — rà rủi ro gián đoạn, lạm dụng và phục hồi

**Production audit: 60/100 — còn rủi ro trước khi mở rộng lưu lượng public**, ưu tiên lỗi giữ tồn kho khi trả thiếu, quota tài nguyên ở Supabase/AI và khả năng phục hồi. Điểm này là đánh giá triage theo bằng chứng hiện có, không phải số đo khả năng chịu tải hay chứng nhận bảo mật.

Ngày **04/10/2026**. Mã nguồn: `16c0601d09edd5676d7a6fd6d64dcac820a7855c`, nhánh `main`. Áp dụng skill ECC [production-audit](C:/Users/Minh/.codex/plugins/cache/ecc/ecc/2.2.3/skills/production-audit/SKILL.md) và [security-review](C:/Users/Minh/.codex/plugins/cache/ecc/ecc/2.2.3/skills/security-review/SKILL.md).

Đã rà 92 route REST: 21 public, 36 user, 35 admin; thêm các endpoint share/media/analytics/webhook, RPC/RLS/Storage trong migration, React/Auth/checkout/article, studio House/Match, AR/video, cấu hình phát hành và backup. Những đường gọi trực tiếp Supabase được xét riêng vì giới hạn tại Vercel không tự bảo vệ chúng.

Website `https://emoria-luxury-web.vercel.app` trả HTTP200 ở homepage, catalog và system-status khi kiểm tra đọc. Supabase Auth-health/catalog-schema HTTP200; analytics không đăng nhập HTTP401. Bundle live và local khác tên hash; chưa đối chiếu SHA deployment, schema/grants production hoặc cấu hình dashboard. Vì vậy các lỗi dưới đây được kết luận cho source/local đã kiểm tra; không gán tự động mọi lỗi cho bản production đang phục vụ.

## Các kịch bản có căn cứ

P1: cần ưu tiên xử lý trước tăng traffic hoặc phụ thuộc vào chức năng này trong vận hành. P2: ảnh hưởng hẹp hơn hoặc cần lưu lượng/điều kiện bổ sung. “Tái hiện” nghĩa là tái hiện cơ chế với fixture/DB local; không có lần cố ý làm sập production.

| Mã / mức | Kịch bản thực tế | Phạm vi ảnh hưởng | Bằng chứng / hướng sửa |
|---|---|---|---|
| DB-1 / **P1** | Vô ý chuyển thiếu tiền hoặc cố ý giữ hàng bằng khoản rất nhỏ. Đơn quá hạn vẫn giữ stock. | SKU hết hàng giả; khách thật không mua được. | PostgreSQL: nhận 1 đồng, expiry trả 0, 3/3 sản phẩm vẫn bị giữ. [Expiry](C:/Users/Minh/Desktop/Project/supabase/migrations/20260917011000_verified_bank_payments.sql:94). Tách đối soát tiền khỏi deadline giữ kho; hoàn kho đúng một lần. |
| DB-2 / **P1** | Một account gọi thẳng Storage để upload liên tục; hoặc người dùng thay ảnh tạo nhiều file mồ côi. | Storage/bandwidth/budget tăng, upload người dùng khác có thể lỗi khi chạm giới hạn. | RLS cho 100 metadata object của account sở hữu 0 Memory; chưa upload byte. [Policy](C:/Users/Minh/Desktop/Project/supabase/migrations/20260930120000_mismatch_accounts_and_progress.sql:768). Reserve tổng byte/count, giới hạn account mới, cleanup có kiểm tra reference. |
| DB-3 / **P1** | Bot đọc liên tục một Memory đã khóa PIN. Mỗi lượt đọc vẫn INSERT tap và COUNT lịch sử. | DB chung chịu write/WAL/COUNT tăng; checkout/admin có thể chậm theo tải. | 20 lần đọc anon tạo 20 tap. [Tap write](C:/Users/Minh/Desktop/Project/supabase/migrations/20260921163000_pin_hint_support.sql:139). Tách read khỏi analytics ingest, dedupe/rate-limit/counter aggregate/retention. |
| GW-1 / **P1** | Publish ở hai tab hoặc retry đồng thời cùng ảnh; sau khi hết quota vẫn tải lại ảnh trước trả lỗi. | AI quota/GPU, memory và băng thông API tăng. | Offline: 2 request tạo 2 inference; khi quota hết vẫn 1 download. [Moderation](C:/Users/Minh/Desktop/Project/server/houseModeration.js:91). Lease theo phiên bản ảnh, reserve quota trước download, queue worker có trần. |
| GW-2 / **P1** | Nhà có nhiều ảnh mới và AI chậm/cold-start. Một nhà hợp lệ tối đa 50 ảnh + preview cần 51 review nhưng quota 40/giờ. | Publish lỗi hoặc vượt deadline 180 giây; bản nháp vẫn còn. | Offline: 40 AI + 41 download rồi 429. [Quota](C:/Users/Minh/Desktop/Project/server/houseModeration.js:138), [duration](C:/Users/Minh/Desktop/Project/vercel.json:4). Review nền có progress/resume; quota khớp dung lượng được chấp nhận. |
| GW-3 / **P1** | Video dài/độ phân giải lớn nén dưới 50 MB, thiếu duration; hoặc ảnh nhiều pixel có byte nhỏ. Có thể là file bình thường hay cố ý chế tạo. | CPU/RAM của worker và backlog kiểm duyệt; mức lan rộng phụ thuộc capacity. | Sampler chỉ giữ 16 frame nhưng decode 1108 frame từ fixture 1000 frame. [Decode](C:/Users/Minh/Desktop/Project/server/modal_tagger.py:147). Pixel/duration/frame budget, preprocess timeout/RAM cap và quota toàn hệ thống. |
| F1 / **P1** | Phiên cũ cần refresh nhưng Auth/network treo. Timeout API chưa bắt đầu vì vẫn chờ getSession. | Người dùng có thể mắc tại startup; các yêu cầu chưa bắt đầu HTTP. | Offline: timeout 10 ms vẫn pending sau 80 ms; SDK chờ token ngay cả khi signal đã abort. [Session wait](C:/Users/Minh/Desktop/Project/src/services/apiClient.js:5). Deadline bao trùm Auth + request; public startup dùng anonymous client. |
| F2 / **P1** | Ba ảnh animation đầu tải/decode treo do CDN hoặc mạng chập chờn. | Overlay trang chủ giữ mãi; queue không chạy, chưa xuất hiện retry. | Offline: đúng 3 ảnh pending, ready=false/failed=false. [Loader](C:/Users/Minh/Desktop/Project/src/services/showcaseFrames.js:10). Timeout từng ảnh và toàn màn mở đầu; poster và nút vào shop. |
| O1 / **P1** | Xóa nhầm, migration lỗi, hỏng máy hoặc tài khoản quản trị bị chiếm; khôi phục chỉ bằng backup script hiện có. | Thiếu đơn/tiền/tài khoản/quyền chia sẻ/House/Match và file media. | Script chỉ backup 11 bảng + một phần hàm public/policy, thiếu table DDL/grants và object Storage. [Backup](C:/Users/Minh/Desktop/Project/scripts/backup-cloud.mjs:7). Backup toàn DB + Storage riêng, có phiên bản ngoài máy, restore drill. Backup dashboard chưa xác minh. |
| O2 / **P2** | Deploy code mới trước SQL/grants tương ứng hoặc rollback code trong khi schema đã đổi. | Lưu/publish/checkout lỗi dù CI xanh; sự cố thật có thể thành P1. | CI không có DB migration gate bắt buộc; Match integration được skip trên CI/Vercel. [CI](C:/Users/Minh/Desktop/Project/.github/workflows/ci.yml:25), [skip](C:/Users/Minh/Desktop/Project/tests/mismatch_integration.test.mjs:41). CI DB cô lập, release manifest code/schema, smoke staging. Đây là khoảng trống kiểm chứng, chưa chứng minh production đang lệch schema. |
| O3 / **P1 có điều kiện** | Cron expiry bị mất/tắt/lỗi sau restore hoặc nâng cấp. | Đơn chưa nhận tiền vẫn giữ stock quá hạn. | [Schedule](C:/Users/Minh/Desktop/Project/supabase/migrations/20260915114549_checkout_recovery_and_expiry.sql:95). Có [cron test](C:/Users/Minh/Desktop/Project/tests/cron_health.sql:3) nhưng chưa được chạy như monitor. Cảnh báo last-success và số đơn quá hạn. Chưa thấy cron production lỗi. |
| DB-4 / **P2** | Người biết tag gửi 5 PIN sai, rồi người nhận nhập PIN đúng. | Memory đó bị chặn mở bằng PIN 15 phút; có thể lặp sau khi hết khóa. | PostgreSQL xác nhận. [Global counter](C:/Users/Minh/Desktop/Project/supabase/migrations/20260913_init_emoria_schema.sql:444). Giới hạn nguồn + tài nguyên và challenge/backoff; giữ chống brute-force. Account owner/recipient và grant còn hợp lệ có đường truy cập riêng. |
| DB-5 / **P2** | Bot đổi phone tự khai để gửi contact liên tục. | Inbox spam, bảng tăng, query chống trùng tốn hơn. | 10 phone khác nhau insert trong một transaction anon. [Contact](C:/Users/Minh/Desktop/Project/supabase/migrations/202609140001_store_operations.sql:129). Hạn mức theo identity tin cậy + budget tổng, normalize phone, index và retention. |
| GW-4 / **P2** | Link House viral hoặc crawler tải lại; người giữ invite mở nhiều SSE đồng thời. | Fanout Storage/RPC và quota Realtime tăng. | 50 ảnh tạo 50 metadata call + query approval + batch sign; cùng IP/invite mở được 60 channel 25 giây. [Photo metadata](C:/Users/Minh/Desktop/Project/server/housePreview.js:59), [SSE](C:/Users/Minh/Desktop/Project/server/eventGateway.js:43). Batch/cache có invalidation, quota theo chi phí, cap concurrent stream/backoff. |
| F3 / **P2** | Giỏ hàng cache của release cũ/extension/import có JSON đúng cú pháp nhưng sai kiểu (`null`, `{}`, `[null]`). | Trắng toàn app trong browser đó, reload tiếp tục lỗi. | TypeError ở initializer/reduce ngoài boundary. [Cart](C:/Users/Minh/Desktop/Project/src/App.jsx:113). Validate schema, bỏ cache sai và root recovery boundary. Chưa chứng minh kẻ từ xa có quyền ghi localStorage của nạn nhân. |
| F4 / **P2** | Status dependency lỗi ngắn rồi phục hồi sau lượt kiểm tra ban đầu. | Khách vẫn gặp maintenance suốt lượt truy cập, kể cả trang tĩnh. | [Fail-closed status](C:/Users/Minh/Desktop/Project/src/services/authRoleService.js:54), [one-shot check](C:/Users/Minh/Desktop/Project/src/App.jsx:177). Phân biệt unavailable với maintenance, thêm retry/freshness; giữ quyền server cho thao tác nhạy cảm. |
| O4 / **P2** | Người vận hành chạy `npm run test:event-db` trên sandbox đang dùng vì nghĩ chỉ kiểm tra. | Mất bảng House/Match/reply/report/analytics local. | [DROP CASCADE](C:/Users/Minh/Desktop/Project/tests/event_studios_database.test.js:39), không tạo DB tạm. Chuyển test sang DB/stack dùng một lần. Audit không chạy lệnh này. |

## Thứ tự khắc phục đề xuất

1. **Giữ kho và phục hồi:** sửa DB-1 với test cạnh tranh webhook–expiry–cancel; xác minh backup/PITR/Storage và chạy restore drill trước khi tin vào phục hồi. Chuyển đơn partial quá hạn sang xử lý đối soát thay vì giữ hàng vô hạn; không làm mất ledger tiền nhận.
2. **Bịt đường tiêu hao tài nguyên:** DB-2/DB-3/DB-5 phải có quota ngay nơi dữ liệu được ghi hoặc ràng buộc server đáng tin cậy. WAF ở Vercel riêng lẻ không ngăn gọi thẳng Supabase. Giới hạn tổng dự án bổ sung cho quota account; giữ CAPTCHA/challenge phù hợp.
3. **Đưa AI vào queue:** xử lý GW-1/2/3 cùng nhau: lease/idempotency, admission trước download, quota toàn hệ thống, preprocessing có trần, worker concurrency, progress và resume. Dedupe theo byte/version đã review; tiếp tục chặn ảnh chưa được duyệt xuất bản.
4. **Trang có đường hồi phục:** xử lý F1/F2/F3/F4, cho người dùng thấy retry và nội dung tĩnh khi hợp lý. Không dùng fallback “thành công” giả cho checkout hay dữ liệu riêng tư.
5. **Kiểm soát phát hành:** CI database/migration bắt buộc, manifest code/schema và smoke staging; giám sát cron, storage growth, DB latency, AI backlog/spend, 429/5xx. Chặn test phá dữ liệu trên stack dùng chung.

## Các phép thử staging còn cần làm

| Drill | Tiêu chí nghiệm thu |
|---|---|
| Auth/DB/CDN ngắt 30–60 giây rồi phục hồi | Trang hiện trạng thái lỗi trong deadline, retry hoạt động; chức năng được phép phục hồi, không mắc overlay. |
| Webhook trùng/trễ, partial rồi hết hạn, expiry và thanh toán chạy cạnh tranh | Không trừ/hoàn kho hai lần; tiền nhận vẫn đối soát được; trạng thái đơn và stock nhất quán. |
| Upload nhiều file, file bị hủy/không được dùng, nhiều account | Từ chối trước khi vượt budget; cleanup không xóa file còn nằm trong draft/published snapshot. |
| Publish nhiều ảnh, hai tab, request bị ngắt, Modal chậm | Một inference/phiên bản, request ngắn trả job ID, job resume và quota không bị tiêu trùng. |
| Traffic công khai tăng và nhiều SSE trên load generator có trần | Đo RPS/concurrency an toàn, DB/Storage/GPU giữ giới hạn, 429 có backoff; checkout không bị chiếm tài nguyên. |
| Restore vào môi trường cô lập từ backup | Khôi phục đủ user/role/order/ledger/Memory/House/Match/media; đo được thời gian hồi phục và lượng dữ liệu có thể mất. |

Chưa có căn cứ để ghi “chịu được N người dùng” hoặc “N request sẽ làm sập”. Cần cấu hình gói, memory/concurrency, WAF, kích thước DB/Storage và kết quả load test có trần để đưa ra số này.

## Bằng chứng kiểm thử và giới hạn

- `npm run test:ci` **PASS**; trên máy này có thêm kiểm tra Mismatch qua HTTP/Auth/PostgreSQL local. Trên CI/Vercel phần DB này có thể được skip. `npm run build` **PASS**, 2459 module; AR model integrity pass.
- PostgreSQL 16.15 trong DB riêng được tạo/xóa bởi audit: **5 cơ chế DB/RLS đã xác minh**. Không upload byte thật hoặc gọi DB cloud để khai thác.
- Repro gateway/frontend/decoder **PASS**, dùng hàm ứng dụng và fixture ngoại vi. Không gọi GPU hoặc mạng production; sampler dùng stdlib mock, không tạo decompression bomb lớn.
- Scan giá trị bí mật server đang cấu hình trong 73 text assets của `dist`: **không thấy giá trị trùng**. Phạm vi này không bao phủ toàn git history, mọi loại secret hoặc advisory dependency.
- HTTP live chỉ là smoke đọc: không đăng nhập, không tạo đơn, không mở nội dung Memory riêng, không stress-test. Không sửa source ứng dụng, deploy, push hay dữ liệu production.

Điểm đã có bảo vệ: giá/stock authoritative trong DB, transaction/row lock/idempotency; webhook kiểm khóa/account/mode; RLS/owner checks và private Storage/signed URL; AI auth, allowlist chống SSRF và quota account; lọc HTML bài viết; lazy boundary, AR/camera cleanup và giới hạn composer. Chưa xác nhận RCE, SQL injection, chiếm admin hay giả thanh toán không có khóa trong phạm vi kiểm tra này.

Các giả thuyết tách riêng: animation giữ 150 frame có pixel-budget khoảng 132 MiB mobile, 297 MiB desktop hoặc 1187 MiB JPEG fallback, nhưng chưa đo OOM; query `upper(id)`, article hot-row/search/comments và claim bcrypt cần EXPLAIN/profiling; giới hạn WAF/Realtime/GPU, spend alert, MFA/SMTP/PITR trên dashboard chưa xác minh. Homepage live thiếu CSP/XFO/nosniff/Referrer-Policy ở response được kiểm tra, nhưng không suy từ đó thành exploit XSS.

Tài liệu chính thức đối chiếu: Vercel sẽ kết thúc function quá `maxDuration` ([duration](https://vercel.com/docs/functions/configuring-functions/duration)); database backup Supabase không chứa object Storage ([backups](https://supabase.com/docs/guides/platform/backups)); rate-limit ở firewall có thể chặn trước function ([Vercel WAF](https://vercel.com/kb/guide/add-rate-limiting-vercel)); Auth rate limits áp dụng endpoint auth ([Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits)).

## Tài liệu và repro

- [Database / Storage: nguyên nhân, line và kiểm soát hiện có](C:/Users/Minh/Desktop/Project/docs/resilience-audit-2026-10-04/database-findings.md)
- [Gateway / AI: nguyên nhân, line và kiểm soát hiện có](C:/Users/Minh/Desktop/Project/docs/resilience-audit-2026-10-04/gateway-findings.md)
- [Frontend: nguyên nhân, line và kiểm soát hiện có](C:/Users/Minh/Desktop/Project/docs/resilience-audit-2026-10-04/frontend-findings.md)
- [Vận hành / backup / release](C:/Users/Minh/Desktop/Project/docs/resilience-audit-2026-10-04/operations-findings.md)
- [Runtime evidence](C:/Users/Minh/Desktop/Project/docs/resilience-audit-2026-10-04/runtime-evidence.json), [inventory](C:/Users/Minh/Desktop/Project/docs/resilience-audit-2026-10-04/inventory-evidence.json), [verification](C:/Users/Minh/Desktop/Project/docs/resilience-audit-2026-10-04/verification-summary.json)

Chạy từ root Project:

```text
node docs/resilience-audit-2026-10-04/database-reproduce.mjs
node docs/resilience-audit-2026-10-04/frontend-repro.mjs
node docs/resilience-audit-2026-10-04/gateway-reproduce.mjs
python docs/resilience-audit-2026-10-04/gateway-decoder-reproduce.py
```

Database harness chỉ dùng container `emoria-test-db`, tạo DB theo prefix audit và xóa DB đó trong `finally`. Các script frontend/gateway/decoder còn lại dùng fixture offline. Script `collect-runtime.mjs` riêng chỉ dùng các kiểm tra HTTP đọc có timeout, như mô tả trong source.
