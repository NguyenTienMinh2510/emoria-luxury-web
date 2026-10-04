# Gateway, AI và tài nguyên — kiểm tra ECC ngày 04/10/2026

Phạm vi: toàn bộ `api/`, `server/`, cấu hình function `vercel.json`, các migration liên quan quota và các test bảo mật. Áp dụng ECC `security-review` và `production-audit`. Không sửa runtime/database, không gọi URL live, không xuất khóa. Các proof dưới đây dùng hàm ứng dụng thật nhưng thay toàn bộ HTTP/Reatime bằng fixture; không đo ngưỡng sập máy chủ thực.

## GW-1 — P1: Publish House lặp công việc AI, và tải file trước khi từ chối quota

- Evidence: `server/routes.js:365-370`, `server/houseModeration.js:91-120`, `server/houseModeration.js:136-156`.
- Kịch bản: owner bấm Publish ở hai tab, retry khi mạng chậm, hoặc cố ý gửi nhiều publish đồng thời cho cùng phiên bản ảnh. Cache chỉ đọc kết quả `ready/rejected`; không có reservation/lease khóa công việc đang chạy. Hai request đều thấy cache miss và gửi cùng ảnh sang AI. Sau khi hết quota, mỗi lần retry vẫn download file trước khi kiểm tra giới hạn 40/giờ.
- Điều kiện: một account có quyền sở hữu House và một ảnh chưa được duyệt; không cần admin hoặc khóa Modal.
- Proof: `gateway-reproduce.mjs` xác nhận cùng path, hai lần gọi đồng thời => 2 downloads + 2 AI requests, `maxActive=2`. Quota bị từ chối => 1 download và 0 AI, sau đó HTTP-equivalent 429. Không bỏ qua được quota AI atomic; thiếu giới hạn download và dedupe công việc.
- Hậu quả: tiêu phí quota người dùng/GPU, tăng memory và băng thông function; nhiều account hoặc retry đồng thời có thể làm service chậm/hết ngân sách. Một ảnh 8 MB được tải lại 60 lần/phút tương ứng khoảng 480 MB/phút ở ứng dụng trước khi tính overhead; đây là phép tính từ giới hạn source, không phải số đo production. Draft-read limiter 60/phút vẫn áp dụng trước moderation; limiter publish chỉ chạy ở bước sau moderation, nên không bảo vệ download khi quota moderation đã hết.
- Sửa: reserve bằng transaction theo `(bucket,path,content_version)` với lease, check/reserve owner + global quota trước download, job queue với số worker cố định; trả job ID và trạng thái để retry không tạo thêm inference. Ưu tiên signed URL để Modal tải House trực tiếp như Memory review đang làm.
- Độ tin cậy: cao về duplicate inference/thứ tự quota; mức làm cả hệ thống sập phụ thuộc cấu hình memory, autoscale và ngân sách thực.

## GW-2 — P1: Publish House đồng bộ không phù hợp dung lượng hợp lệ và thời hạn function

- Evidence: `server/houseModeration.js:91` vòng lặp tuần tự; `server/aiService.js:113` timeout 120 giây mỗi ảnh; `vercel.json:4` maxDuration 180 giây; `src/services/eventService.js:201-205` browser timeout 180 giây; `supabase/migrations/20260928072518_event_studios.sql:939-973` 5 phòng x 10 ảnh.
- Kịch bản khách quan: một nhà có nhiều ảnh mới, Modal khởi động lạnh hoặc xử lý mỗi ảnh vài chục giây. Tổng request vượt 180 giây mặc dù từng ảnh đều dưới timeout 120 giây. Trường hợp hợp lệ lớn nhất có 50 ảnh + một preview cần 51 lượt nhưng budget là 40/giờ.
- Điều kiện: owner publish nhà có nhiều phiên bản ảnh chưa có cache; không cần tấn công.
- Proof: fixture 51 ảnh => 40 AI calls, 41 downloads, lỗi quota ở ảnh thứ 41; `rpc_house_publish` chưa tới bước commit. Tổng duration theo source có thể vượt 180 giây với ba ảnh mất 70 giây/ảnh, hoặc 10 ảnh mất 20 giây/ảnh. Đây là mô hình deadline, không giả lập overload live.
- Hậu quả: chức năng publish thất bại/timeout cho dữ liệu được UI/DB chấp nhận; retry nhiều lần làm GW-1 nặng hơn. Kết quả từng ảnh đã lưu cache có thể giúp retry tiến dần, nhưng muốn hoàn thành 51 ảnh vẫn phải chờ quota reset. Không mất bản nháp và không chứng minh toàn site sập.
- Sửa: chuyển review sang background job có trạng thái tiến độ/resume; tách publish snapshot transaction khỏi review; áp dụng quota nhất quán với maximum gallery và xác nhận đủ budget trước khi bắt đầu.
- Độ tin cậy: cao về mismatch 51/40 và chuỗi request; tác động timeout chắc chắn khi tổng xử lý thực vượt deadline, tốc độ Modal hiện tại chưa đo.

## GW-3 — P1: Giới hạn 50 MB / 16 frame chưa giới hạn chi phí giải mã media

- Evidence: `server/modal_tagger.py:147-152` decode toàn bộ video khi thiếu duration; `:160-175` decode frame gốc trước reformat; `:342` `Image.open(...).convert('RGB')` trước resize của processor. Không có max duration, frame count, source resolution hay preprocess deadline riêng. `:186` function timeout 300 giây; `server/aiService.js:113` gateway timeout 120 giây.
- Kịch bản: video WebM dài nhưng nén tốt, 4K/8K hoặc GOP dài dưới 50 MB; ảnh PNG có kích thước pixel lớn dưới giới hạn file (House 8 MB, Memory 50 MB). Tệp hợp lệ hoặc cố ý chế tạo đều có thể tốn nhiều CPU/RAM trước khi thu nhỏ đầu vào AI. Không cần truyền URL nội bộ hoặc đánh cắp key; gửi qua owner review được phép.
- Proof: `gateway-decoder-reproduce.py` nạp đúng hàm sampler bằng AST, mock một video 1000 frame không duration: chỉ giữ 16 frame nhưng decode 1000 trong lượt đo duration, 1108 tổng. Stdlib, không GPU/network/ảnh khổng lồ. Với ảnh, kiểm tra source xác nhận thiếu application pixel cap; chưa chạy ảnh decompression bomb hoặc xác nhận OOM thực. Pillow có cơ chế riêng theo phiên bản, không kết luận Pillow vô hiệu bảo vệ.
- Hậu quả: container review chậm, worker bị giới hạn thời gian/thiếu RAM, backlog kiểm duyệt; gateway có thể hết hạn trước worker. Quota mỗi owner giảm số lần gọi nhưng không giới hạn tổng tài nguyên khi nhiều owner/account hoạt động. Source Modal không có `max_containers`, quota inference toàn hệ thống hoặc circuit breaker; cấu hình dashboard/quota ngoài repo chưa xác minh. Không tuyên bố HTTP abort chắc chắn hủy/không hủy GPU task, hoặc đã phát sinh phí cụ thể.
- Sửa: trước decode, kiểm tra pixel/resolution/duration/frame count, giới hạn tệp thiếu duration bằng demux/probe và frame scan budget; chạy preprocess trong process có timeout/RAM cap; giới hạn số job và số container toàn hệ thống, theo dõi backlog/spend, thêm cảnh báo/circuit breaker. Cần test với media hợp lệ dài/4K trong môi trường staging có hạn mức.
- Độ tin cậy: cao về decode toàn bộ và thiếu cap ứng dụng; trung bình về đạt OOM/ảnh hưởng production vì chưa đo.

## GW-4 — P2: Public House view và SSE khuếch đại tải backend

- Evidence House: `server/housePreview.js:59-65` kiểm metadata từng ảnh với `Promise.all`; `server/routes.js:384-424` public view và sign; `api/share.js:100,110-111` metadata HTML/HEAD và redirect preview đều resolve resource, `Cache-Control:no-store`.
- Proof: signing 50 ảnh của published snapshot hợp lệ tạo 50 metadata HTTP requests, 1 query approvals, 1 batch sign. Public gateway còn cần rate-check + dispatch và có thể preview lookup/sign. Giá trị 52 là số từ riêng hàm signing, không tổng HTTP của một lượt xem.
- Kịch bản: liên kết nhà được chia sẻ rộng, bot preview/social crawler gọi HTML/HEAD + image, hoặc người biết public link tải lại. Bản thân limit 60/phút là theo identity và action, không theo số backend operations; 60 lượt ở riêng signing tương đương 3000 metadata requests/phút. Nhiều user cùng NAT lại có thể gặp 429 sớm. Không khẳng định source thiếu access/version check: việc kiểm tra này cần giữ để chống đổi byte sau publish.
- Evidence SSE: `server/eventGateway.js:43-45,66-68` mỗi request tạo service client/private channel, giữ tối đa 25 giây; `src/services/matchStream.js:20` client reconnect sau 1 giây; rate 60/phút `eventGateway.js:18` không có simultaneous connection quota.
- Proof: fixture gateway cho cùng IP/invite mở đồng thời 60 SSE channels; request thứ 61 bị 429. Đóng kết nối đã remove đủ 60 channels. Một người giữ invite hợp lệ có thể dùng hết phần quota concurrent mà không vượt rate. Một lượt mở SSE đồng thời cũng dùng 60 auth/view RPC initial; không đo quota Realtime production.
- Hậu quả: fanout storage/RPC và connection Realtime/function tăng theo traffic; bão retry hoặc nhiều invite/account có thể chạm giới hạn provider gây lỗi toàn phần Event Studio. Ngưỡng, autoscale, dashboard firewall/CDN, Realtime plan chưa kiểm tra.
- Sửa: batch metadata hoặc cache approvals/version theo snapshot bất biến với invalidation rõ ràng; giữ TTL phù hợp quyền riêng tư; edge limit cân theo chi phí, cap concurrent streams per user/IP/invite + global; backoff+jitter và dùng shared relay/cached polling khi tải tăng.
- Độ tin cậy: cao về fanout/channels; trung bình về outage thực tế, cần load test staging có trần.

## Những rủi ro đã loại trừ hoặc có kiểm soát

- Modal: cả 4 endpoints có `requires_proxy_auth=True`; gateway gửi server-only proxy credentials, thiếu key dừng trước HTTP. Không có endpoint public inference vô danh trong source hiện tại.
- SSRF: JavaScript và Python đều chỉ cho signed URL của đúng host Supabase và đúng hai bucket, chặn path traversal/query lạ; downloader tắt redirects, stream cap 50 MB và deadline. Test giả network xác nhận URL nội bộ/host khác không được gọi.
- Memory AI review: owner/unlocked + consent; reserve 20/ngày atomic; cache và lease cùng file 4 phút; recheck ownership sau AI, lưu bằng request_id hiện hành. Không báo quota bypass đã được migration mới sửa như báo cáo tháng 09 cũ.
- Letter AI: 20/ngày/account, 30 giây giữa lần gọi; validation giới hạn độ dài/enum, consent, có template fallback khi Modal lỗi. Warmup 3/giờ/account. Rủi ro còn lại là nhiều account + thiếu global cap trong repo, không phải anonymous endpoint.
- SePay: auth constant-time API key trước đọc body, account/amount/mode validation, trả lỗi retry nếu lookup/DB lỗi. Webhook test pass; phần idempotency/payment-stock do DB audit phụ trách.
- API body: REST cap 512 KiB; Memory media cap 4 KiB; payment cap 16 KiB. Supabase REST calls ở gateway đa số có timeout 10–20 giây. Chính các bounds này giới hạn phạm vi tấn công, không bảo đảm chống mọi DDoS.
- Signed media: fail closed khi thiếu approval/key/Storage, namespace checks và immutable version House; URL đã phát hành vẫn có TTL. Không thấy bypass cho arbitrary bucket/file trong các test đã chạy.
- Không xác nhận RCE, SQL injection, admin takeover, giả webhook không key hoặc crash toàn hệ thống bằng một request đơn lẻ.

## Kiểm tra và giới hạn chứng cứ

Pass: `node tests/modal_security.test.mjs`, `python tests/modal_security_test.py`, `node tests/video_nfc.test.mjs`, `node tests/memory_media.test.mjs`, `node tests/sepay_webhook.test.mjs`; cả hai scripts proof cạnh báo cáo pass. Tất cả đều offline/mock, chưa đối chiếu deployment SHA, env production, WAF, hosting memory/concurrency, actual provider budgets, CDN/Realtime limits.

Contact spam, global PIN lockout, NFC tap amplification, Storage total quota và giữ stock qua payment partial được báo cáo DB riêng xác minh; không đếm lại thành finding khác ở đây.
