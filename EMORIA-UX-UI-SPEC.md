# EMORIA — Đặc tả trải nghiệm và thiết kế

Phiên bản 1.0 · 13/09/2026 · Dành cho BA, designer, Antigravity và Codex.

## 1. Kết luận thiết kế

EMORIA nên là **cửa hàng trang sức giàu cảm xúc, có dịch vụ lưu giữ kỷ niệm đi cùng sản phẩm**. Khách mới cần hiểu món trang sức đẹp ra sao, có ý nghĩa gì và mua thế nào. Người đã nhận quà cần mở được kỷ niệm nhanh. Người vận hành cần quản lý đơn hàng, hàng tồn và trang sức đã cấp phát.

Giữ ý tưởng “Một chạm mở ký ức”, các luồng nghiệp vụ và trạng thái ngoại lệ của BA. Thiết kế lại thứ bậc nội dung, điều hướng, biểu mẫu và hệ thống phản hồi. Hướng hình ảnh đề xuất: **bố cục tạp chí, bạc trên nền ngà, chi tiết có tiết chế**. Không thay đổi tên thương hiệu hay tự tăng giá để tạo cảm giác cao cấp.

Đây là đặc tả đề xuất, không phải báo cáo đã triển khai. Project gốc chưa bị chỉnh sửa trong lượt phân tích này.

## 2. Căn cứ và giới hạn

- Đã kiểm kê và xem tổng quan toàn bộ **133 ảnh JPG** trong `C:\Users\Minh\Downloads\DIGITAL MARKETING.zip`. Các số BA-001…BA-133 trong tài liệu tương ứng thứ tự entry trong ZIP, không phải số trang Canva. Xem `BA-SCREEN-MAP.csv` để tìm đúng tên gốc.
- Đã đọc mã nguồn của `C:\Users\Minh\Desktop\Project`, gồm App, hero, catalog, chi tiết sản phẩm, giỏ hàng, NFC demo, MemoryViewer và các service NFC/Storage. Đã xem 7 ảnh mockup cũ trong `public/assets`.
- Bản ZIP mới có nhiều nghiệp vụ hơn 7 ảnh cũ; lấy ZIP mới làm căn cứ UX chính. Không giả định 133 ảnh là 133 route hay 133 màn hình cần code riêng.
- Link Vercel được cung cấp chuyển tới đăng nhập Vercel trong phiên kiểm tra. Chưa xác minh giao diện đang chạy, tình trạng production hoặc việc source local có cùng phiên bản deploy.
- Canva mở được tiêu đề “DIGITAL MARKETING” nhưng không hiển thị nội dung thiết kế trong phiên kiểm tra. Tài liệu này dựa trên bản xuất ZIP người dùng vừa cung cấp.
- Chưa truy cập database, schema thực, policy RLS, Storage dashboard, cổng thanh toán hoặc chip vật lý. Các bảng, API và chính sách đề xuất dưới đây cần đối chiếu trước khi tích hợp.
- Dữ liệu giá, đánh giá, ảnh khách, tuyên bố sản phẩm trong mockup/source là dữ liệu tham chiếu, chưa được xác thực kinh doanh.

## 3. Tinh túy từ BA: giữ, sửa, bổ sung

| Cụm ảnh | Phần đáng giữ | Thay đổi cần làm |
|---|---|---|
| BA-001–010: đăng nhập, đăng ký | Hiện/ẩn mật khẩu; lỗi; trạng thái gửi và hoàn thành | Cho xem hàng trước; chuyển đăng nhập khỏi hero; nhãn nằm ngoài ô nhập; chỉ hiện OAuth đã cấu hình |
| BA-011–022: khôi phục, đổi mật khẩu | Có luồng khôi phục và lỗi xác thực | Dùng luồng Supabase thực tế; mặc định email recovery link, chỉ dùng OTP nếu đã tích hợp; không dựng chuỗi 6 ô OTP chỉ để giống ảnh |
| BA-023–028: tài khoản | Chỉnh sửa hồ sơ và đăng xuất | Bỏ CCCD; bỏ yêu cầu giới tính/ngày sinh không phục vụ mua hàng; tách địa chỉ và bảo mật; chỉ cảnh báo đăng xuất nếu có bản nháp chưa lưu |
| BA-029–036: tìm kiếm, lọc, chi tiết | Lọc theo thuộc tính, chip điều kiện đã chọn, sắp xếp, đánh giá | Bỏ sidebar quản trị ở cửa hàng; ảnh sản phẩm lớn hơn; route sản phẩm riêng; chỉ hiện bộ lọc có dữ liệu; loại/chất liệu phải thống nhất |
| BA-037 | Ảnh trắng | Không triển khai thành tính năng |
| BA-038–045: giỏ hàng | Có hết hàng, vượt tồn kho, sửa số lượng, tổng tiền | Kiểm tra tồn ở lúc chọn và khi đặt; báo ngay tại dòng hàng; dùng drawer và toast; bỏ chuỗi popup cho mỗi thao tác |
| BA-046–057: đặt hàng, thanh toán | Chia thông tin nhận hàng và thanh toán; có thất bại, mã giảm giá | Checkout gọn; bỏ ngày sinh; bỏ nội dung PNJ còn sót; chỉ hiện phương thức đã hoạt động; phân biệt “đã nhận đơn” và “đã thanh toán” |
| BA-058–061: đơn của tôi | Bộ lọc trạng thái, timeline, hủy đơn | Timeline lấy từ sự kiện thật; hủy theo điều kiện đơn; thể hiện trạng thái hoàn tiền riêng |
| BA-062–078: NFC/kích hoạt/xem | Nhận diện trang sức, kiểm tra liên kết cũ, lỗi không có quyền | Gộp xác nhận lặp; dùng link NFC/QR làm lối vào chính; tách quyền xem khỏi quyền sở hữu; không cho desktop chờ quét vô hạn |
| BA-079–087: liên kết Memory Space | Chọn kỷ niệm có sẵn, xem trước, thay/hủy liên kết | Một trang chọn + một hành động lưu; xác nhận khi thay liên kết đang dùng; gỡ liên kết không xóa kỷ niệm |
| BA-088–100: quản lý trang sức/NFC | Danh sách tag, trạng thái hoạt động, lịch sử thao tác | Chuyển sang khu quản trị; “Tạm ngừng mở kỷ niệm” mô tả đúng việc chặn server, không giả định tắt chip vật lý |
| BA-101–105: quản trị đơn | Danh sách, chi tiết, cập nhật trạng thái | Chỉ cho chuyển trạng thái hợp lệ; phân quyền vận hành; có lịch sử; BA-101 là khung điều hướng, không cần trang trắng riêng |
| BA-106–109: báo cáo | Phễu mua hàng và phễu kích hoạt NFC đều có ích | Triển khai sau khi có sự kiện thật; không sao chép số liệu mẫu; không gọi mọi lượt mở link là một lần chạm NFC |
| BA-110–125: Memory Space | Tạo album, thêm/sửa/xóa kỷ niệm, lỗi và thành công | Dùng editor đơn giản; bản nháp; tiến độ từng tệp; giữ dữ liệu khi lỗi; gộp các màn thông báo thành trạng thái component |
| BA-126–128: chia sẻ | Link/QR; phân biệt chỉ xem và có thể đóng góp | Link công khai chỉ cấp xem; đóng góp qua lời mời gắn tài khoản; có thu hồi, hết hạn; sao chép không đồng nghĩa người nhận đã xem |
| BA-129–133: quản trị sản phẩm | Xem trước; kiểm tra lỗi từng trường; tóm tắt thay đổi; nhật ký | Đây là nhóm đáng học về phản hồi biểu mẫu; dùng chung pattern cho toàn admin; không đem banner quảng cáo vào trang thao tác |

Điểm mới bổ sung: mua không cần tài khoản, quà tặng cho người khác, trang nhận quà, kích hoạt bằng mã kín trong hộp, khôi phục bản nháp, quản lý thiết bị thất lạc, bảo vệ ảnh riêng tư và fallback QR.

## 4. Người dùng, nhiệm vụ và phạm vi

**Khách mua cho mình:** tìm món phù hợp → chọn biến thể → đặt hàng → nhận hàng → kích hoạt → thêm kỷ niệm.

**Người mua quà:** chọn quà → chọn gói quà nếu có → đặt hàng → chuẩn bị lời nhắn qua tài khoản đã xác minh → trao quà. Không ép người mua viết cả album trong checkout.

**Người nhận:** chạm/QR → đọc nội dung được cho phép → tùy chọn nhận quyền quản lý bằng thông tin kích hoạt riêng. Không yêu cầu tài khoản chỉ để xem link được chủ sở hữu cho phép chia sẻ.

**Chủ Memory Space:** tạo, biên tập, kiểm soát ai được xem/đóng góp; quản lý các trang sức liên kết.

**Nhân viên:** xử lý đơn và tag; không tự động được đọc mọi ảnh/thư riêng tư của khách.

### Ưu tiên

| Mức | Nội dung | Điều kiện hoàn tất |
|---|---|---|
| P0 — nền tảng | Trạng thái lưu/đặt hàng trung thực; phân quyền; route; design tokens; tách demo | Không báo thành công khi thất bại; người lạ không đọc/sửa nội dung riêng tư |
| P1 — hành trình chính | Home, catalog, PDP, cart, checkout với phương thức thật, đơn hàng, auth, claim tag, editor và viewer | Một đơn thực trong môi trường thử nghiệm và một tag thử đi hết luồng |
| P1 — vận hành tối thiểu | Sản phẩm/tồn kho, đơn, cấp tag, liên kết tag với vật phẩm/đơn, tạm ngừng liên kết | Nhân viên có thể hoàn thành đơn và giao trang sức kích hoạt được |
| P2 — quà tặng nâng cao | Chuẩn bị quà trước nhận hàng, chuyển quyền, mời đóng góp, thu hồi chia sẻ nâng cao, audio | Luồng ownership và quyền truy cập được kiểm thử riêng |
| P3 — tăng trưởng | Wishlist, nội dung SEO, báo cáo, bản đồ kỷ niệm, hẹn ngày mở, nhiều theme | Chỉ làm khi có nhu cầu và dữ liệu; không cản P1 |

Quà tặng P1 vẫn dùng được theo cách đơn giản: người nhận kích hoạt rồi tự tạo kỷ niệm. Chuẩn bị album trước và chuyển quyền hoàn chỉnh thuộc P2; không hứa tính năng này trên trang bán hàng trước khi hoạt động.

## 5. Kiến trúc thông tin và route

Ba layout dùng chung nền tảng component, mỗi layout ưu tiên một nhiệm vụ.

| Khu | Route đề xuất | Nội dung/điều hướng |
|---|---|---|
| Cửa hàng | `/`, `/shop`, `/collections/:slug`, `/products/:slug`, `/gifts` | Header: Trang sức · Bộ sưu tập · Cách hoạt động · Câu chuyện; tài khoản và giỏ ở bên phải |
| Mua hàng | `/cart`, `/checkout`, `/orders/:id/confirmation` | Checkout dùng header rút gọn, có đường quay về giỏ |
| Hỗ trợ | `/how-it-works`, `/help`, `/help/nfc`, `/policies/:slug` | Cỡ nhẫn, chăm sóc, giao/đổi trả, tương thích thiết bị, NFC không mở |
| Tài khoản | `/auth`, `/auth/callback`, `/auth/recovery`, `/account`, `/account/orders`, `/account/orders/:id` | Quay lại tác vụ ban đầu sau đăng nhập; đơn khách vãng lai có link tra cứu an toàn |
| Trang sức của tôi | `/account/jewelry`, `/account/jewelry/:id`, `/activate` | Trạng thái kích hoạt, liên kết, tạm ngừng; mỗi sản phẩm vật lý có ID riêng |
| Studio kỷ niệm | `/memories`, `/memories/new`, `/memories/:id/edit`, `/memories/:id/settings` | Danh sách không gian, editor, chia sẻ; sidebar nhỏ chỉ dùng trong khu cá nhân |
| Lối vào NFC | `/n/:publicId` | Resolver kiểm tra trạng thái và quyền; không tải cả cửa hàng ở phía sau |
| Viewer được chia sẻ | `/s/:shareToken` | Trang đọc riêng, không menu mua hàng, không nút sửa của chủ nếu người xem không có quyền |
| Trải nghiệm mẫu | `/demo/memory` | Nội dung mẫu rõ nhãn; không truy vấn tag thật hay ghi dữ liệu production |
| Quản trị | `/admin/products`, `/admin/orders`, `/admin/jewelry` | Layout dữ liệu; quyền server; báo cáo `/admin/analytics` làm sau |

Đổi tên nhãn “Jewelry” thành “Trang sức”, “Memory Space” thành “Không gian kỷ niệm” ở lần giới thiệu đầu. Có thể giữ “Memory Space” làm tên dịch vụ trong phần thương hiệu. Không dùng “NFC & Jewelry”, “Jewelry Memory Space” và “Memory Space” làm ba menu gần như trùng nhau.

Giữ tương thích `?tag=`, `?memory=`, `?token=` từ App hiện tại qua adapter có kiểm tra quyền. Không đổi token cũ thành quyền sở hữu. `/n/:publicId` nên dùng domain thương hiệu ổn định khi ghi chip; URL preview Vercel theo phiên deploy không phải đích dài hạn.

## 6. Đặc tả các màn hình chính

### Home — giải thích giá trị trước, tài khoản sau

Thứ tự nội dung: header → hero → 3 bước hoạt động → 4 sản phẩm chủ đạo → câu chuyện quà tặng → chất liệu/chăm sóc → đánh giá thật nếu có → FAQ → footer.

- Hero desktop: khối chữ 5/12 và ảnh 7/12; có thể tràn ảnh tới mép phải. Một ảnh rõ chủ thể, nền thoáng; không dùng logo lớn chiếm cả màn hình.
- Eyebrow: “TRANG SỨC LƯU GIỮ KỶ NIỆM”. H1: **“Mang theo điều đáng nhớ.”**
- Mô tả: “Một món trang sức. Một lối mở đến những bức ảnh và lời nhắn bạn muốn giữ gần bên.” Chỉ thêm giọng nói khi audio đã triển khai.
- CTA chính “Khám phá trang sức”; CTA phụ “Xem một kỷ niệm mẫu”. Demo hoạt động bằng click trên mọi thiết bị và phải được nhận diện là demo.
- Ba bước: “Chọn món trang sức” → “Thêm kỷ niệm của bạn” → “Chạm để mở lại”. Có chú thích kích hoạt sau nhận hàng và link hướng dẫn.
- Mobile: chữ trước, ảnh sau; CTA không xuống dưới nhiều màn hình; không ép hero cao 100vh.
- Không tự dựng countdown, số lượng khách, lượng bán, ưu đãi hoặc cam kết bảo hành.

### Catalog

- Header trang gồm tên danh mục + số kết quả thực. Lọc loại, khoảng giá; màu/chất liệu chỉ hiện khi tập dữ liệu có nhiều lựa chọn có ý nghĩa.
- Desktop 4 cột ở ≥1200px; 3 cột ở 900–1199px; 2 cột từ 360px; 1 cột khi nhỏ hơn hoặc nội dung thực không vừa.
- Card: ảnh 4:5 → tên → loại/chất liệu đã xác minh → giá; tối đa một nhãn có căn cứ. Card không chứa đoạn mô tả dài, player và nhiều CTA cùng cấp.
- Nhẫn cần chọn cỡ thì CTA “Chọn kích cỡ”, không thêm biến thể mặc định không rõ ràng.
- Mobile dùng nút “Bộ lọc” mở bottom sheet, nút “Xem N sản phẩm”, “Xóa bộ lọc”; chip đã chọn hiển thị ở danh sách.
- Tìm kiếm không phân biệt hoa/thường, hỗ trợ chuỗi có/không dấu; debounce khoảng 300ms; Enter có tác dụng. Trạng thái rỗng cho sửa từ khóa và xóa lọc.
- Ghi q, category, sort, filters vào URL; Back khôi phục điều kiện và vị trí cuộn.

### Chi tiết sản phẩm — PDP

- Route riêng; breadcrumb; gallery 7/12 và thông tin mua 5/12. Quick view chỉ bổ trợ.
- Thứ tự thông tin: tên → một câu ý nghĩa → giá → chọn cỡ/màu → tồn kho → CTA → thời gian giao/đổi trả có căn cứ → NFC → chi tiết/chăm sóc.
- Ảnh mong muốn: toàn cảnh, macro, đeo thực tế để biết kích thước, vị trí chạm, hộp quà. Chưa có ảnh thì ghi vào backlog tài sản, không nhân bản một ảnh thành nhiều góc.
- Hướng dẫn đo cỡ mở sheet; lỗi thiếu cỡ nằm cạnh lựa chọn. Mỗi biến thể có SKU, giá và tồn riêng nếu có biến thể.
- “Đây là một món quà” là lựa chọn tùy ý; phụ phí gói quà và nội dung gồm trong hộp phải rõ.
- Giải thích ngắn: “Điện thoại tương thích mở liên kết kỷ niệm khi chạm vào vị trí NFC. Có mã QR dự phòng.” Link “Kiểm tra cách sử dụng”.
- Thanh mua sticky trên mobile chỉ xuất hiện khi CTA gốc ra khỏi màn hình, không che nội dung/cuối form; có safe-area.

### Cart và checkout

- Cart drawer xác nhận thêm hàng, có “Xem giỏ” và “Tiếp tục mua”. Trang cart dùng cho sửa nhiều mục; lưu cart qua refresh. Giỏ không lưu ảnh/thư riêng tư.
- Dòng hàng chứa đúng biến thể, số lượng, giá. Vượt tồn báo inline “Hiện còn X sản phẩm”, không popup chặn cả trang.
- Xóa dòng hàng có hoàn tác. Khi đổi giá/tồn ở checkout: chỉ rõ thay đổi và yêu cầu xem lại trước khi gửi đơn.
- Checkout 2 nhóm/bước: **Giao hàng → Thanh toán & kiểm tra**. Không buộc tạo tài khoản; không hỏi CCCD, ngày sinh.
- Trường tối thiểu: người nhận, số điện thoại, địa chỉ phù hợp vùng giao, email nhận xác nhận nếu cần; ghi chú tùy chọn. Không hardcode danh mục hành chính lỗi thời, dùng nguồn địa chỉ đang được đơn vị giao hàng hỗ trợ.
- Tóm tắt sticky desktop; mobile dạng accordion, tổng cuối luôn dễ thấy. Tách tiền hàng, phí giao, giảm giá, gói quà, tổng cộng.
- Mã ưu đãi thu gọn; lỗi nằm tại trường. Chỉ hiện COD/chuyển khoản/cổng thanh toán đã tích hợp và có quy trình đối soát.
- Gửi đơn chỉ một lần với khóa chống trùng. Giá/tồn/giảm giá tính lại ở server. Thành công khi có order ID do server trả về.
- COD: “Đã nhận đơn — thanh toán khi nhận hàng”. Chuyển khoản: “Đang chờ xác nhận thanh toán”. Quay về từ cổng thanh toán chưa đủ để xác nhận đã trả tiền.
- Khi thanh toán thất bại vẫn giữ đơn/giỏ phù hợp và cho thử lại; trạng thái không rõ phải kiểm tra lại server trước khi tạo giao dịch mới.
- Confirmation là trang bền vững có mã đơn, tổng tiền, trạng thái và bước tiếp theo, không tự biến mất sau 2,5 giây.

### Đơn hàng

Trạng thái đơn và thanh toán là hai trục khác nhau. Ví dụ: `confirmed + pending_payment`, `shipped + paid`, `cancelled + refund_pending`. Timeline sự kiện có thời gian thực. Không bật “Hủy đơn” nếu backend không cho phép; hiển thị lý do và đường liên hệ. Khách vãng lai tra đơn qua token/lần xác minh riêng, không chỉ nhập số đơn đoán được.

### Kích hoạt và liên kết trang sức

BA đang có nhận diện → xác nhận → popup xác nhận lần nữa → thành công. Thay bằng:

1. **Mở link / nhập mã:** chạm NFC, quét QR hoặc nhập mã trong hộp; có hướng dẫn thiết bị.
2. **Xác minh quyền nhận:** đăng nhập khi cần quản lý và nhập claim secret kín; hiện đúng vật phẩm và trạng thái, không lộ danh tính chủ cũ.
3. **Chọn kỷ niệm:** tạo mới hoặc chọn một Memory Space có quyền liên kết; hành động cuối “Kích hoạt và liên kết”. Thành công dẫn ngay tới studio/viewer phù hợp.

Một tag đang liên kết có đường “Thay kỷ niệm” và “Gỡ liên kết”. Thay liên kết chỉ đổi đích server, không ghi lại chip trong luồng phổ thông. Gỡ liên kết giữ nguyên album và giải thích tác động. Trường hợp đã được người khác nhận: không tự chiếm quyền, hướng dẫn liên hệ hoặc nhận chuyển giao.

**Quà tặng P2:** người mua chuẩn bị album riêng bằng tài khoản xác minh → cấp quyền xem qua món quà khi chủ động phát hành → người nhận có thể xem nội dung được chia sẻ → quyền quản lý chỉ đổi sau quy trình chuyển/nhận riêng. Chuyển chủ tag không tự động chuyển sở hữu tất cả album của người mua; mỗi lần chuyển phải chỉ rõ album nào được tặng/bản sao nào được chuyển và ai còn quyền. Sau khi người nhận xác nhận, quyền cũ phải được thu hồi theo lựa chọn đã công bố. Mã nhận quà hết hạn/có thể thu hồi, không trùng public ID trên NFC.

### Studio kỷ niệm

- Danh sách album: ảnh bìa, tên, lần cập nhật, nhãn riêng tư, trang sức liên kết; CTA “Tạo kỷ niệm”.
- Form đầu chỉ cần tên; ảnh bìa/mô tả tùy chọn. Mặc định riêng tư. Lưu bản nháp không đồng nghĩa phát hành.
- Editor theo khối: lời mở đầu → ảnh/video → lời nhắn; audio thuộc P2. Có “Xem như người nhận” và “Lưu thay đổi”.
- Upload theo từng tệp: chờ/tải/đang xử lý/hoàn thành/lỗi, thử lại đúng tệp lỗi, giữ các tệp đã xong. Chặn phát hành khi còn tệp chưa tải.
- Giới hạn khởi đầu đề xuất: ảnh JPEG/PNG/WebP ≤15MB; video MP4/WebM ≤50MB. Kiểm tra tương thích codec thực; HEIC/MOV chỉ bật khi có chuyển đổi. Không quảng cáo định dạng chưa được xử lý.
- Dùng giới hạn tổng dung lượng/tệp do backend cấu hình; hiển thị phần còn lại. Không tự hứa lưu trữ vĩnh viễn/không giới hạn.
- Khi lưu lỗi: giữ nội dung, thông báo tại editor, có thử lại. Khi rời với thay đổi chưa lưu: cảnh báo một lần. Nếu có autosave, dùng bản nháp độc lập, không âm thầm sửa bản người nhận đang xem.
- Media xóa theo hai bước phù hợp: bỏ khỏi bản nháp → lưu thay đổi; có undo trước lưu. Xóa vĩnh viễn/album cần xác nhận nêu đúng tên và ảnh hưởng.

### Viewer — trải nghiệm nhận quà

- Mở trực tiếp từ NFC/link; không landing page thương mại phía sau và không chuỗi popup.
- Màn đầu gồm ảnh bìa nếu có, người gửi/tiêu đề được phép hiển thị, CTA “Mở kỷ niệm”. Nếu riêng tư và chưa được cấp quyền: chỉ hiện màn xin xác thực, không tải ảnh bìa/thư trước.
- Sau mở: lời nhắn lớn vừa đủ, ảnh theo câu chuyện, video có controls; âm thanh chỉ phát sau thao tác và phải có tệp thật.
- Một cột dễ đọc, chiều rộng chữ tối đa 640px. Lời nhắn dùng chữ lớn hơn metadata. Có liên kết phụ quay lại, hỗ trợ và báo nội dung khi cần.
- Không autoplay audio; không confetti liên tục; không quảng cáo thêm giỏ hàng ở giữa thư.
- Lần mở bình thường không cần hỏi lại quyền nếu quyền hiện tại đủ; tuy nhiên server phải xác thực lại mỗi request cần bảo vệ.

### Chia sẻ

Hai chế độ P1: “Chỉ mình tôi” và “Ai có liên kết đều có thể xem”. Mô tả rõ chế độ thứ hai cũng cho người cầm trang sức/QR hoặc nhận link chuyển tiếp xem. Không dùng chữ “Riêng tư tuyệt đối”.

Mời người đóng góp P2 qua tài khoản cụ thể. Người đóng góp có thể thêm/sửa phần mình nếu được cấp, không đổi chủ, xóa album hoặc cấp quyền người khác. QR chỉ là cách biểu diễn link, không phải lớp bảo mật riêng.

Sau bấm sao chép chỉ báo “Đã sao chép liên kết” khi clipboard thành công; lỗi thì hiện ô để sao chép thủ công. Thu hồi link phải chặn truy cập mới; URL media ký sẵn có thể còn hiệu lực tới TTL, cần công bố và dùng TTL ngắn. Nếu cần ngắt tức thì, dùng lớp proxy kiểm tra quyền trên mỗi request.

### Admin tối thiểu

Sidebar giữ lại ở đây. Mỗi trang có một H1, bộ lọc ngắn, bảng đọc được, chi tiết có lịch sử. Ưu tiên đơn cần xử lý, tồn kho và tag chưa giao. Vai trò do server cấp, không từ `user_metadata` mà khách có thể tự sửa. Chỉ hiện menu/động tác được phép; API cũng phải kiểm tra tương ứng.

Form sản phẩm học từ BA-130–133: label rõ → lỗi từng trường → summary lỗi đầu form → xem trước → lưu → kết quả ngắn và lịch sử. Không cần popup xác nhận cho mọi lần lưu thông tin bình thường. Hành động hủy đơn, thay liên kết, tạm ngừng truy cập phải nêu tác động.

## 7. Design system đủ để triển khai

### Hướng thẩm mỹ

**Silver editorial:** 70% nền sáng trung tính, 20% ảnh/vùng than, 10% khoảng nhấn; đây là tỷ lệ cảm giác, không phải phân chia pixel. Hero và gallery ưu tiên sản phẩm thật, khoảng trắng và typography. Một mảng nền tối ở phần trải nghiệm kỷ niệm tạo điểm chuyển nhịp. Tránh nền kim cương, chrome chữ toàn trang, hạt bay, glow quanh mọi nút, glassmorphism dày và nhiều kiểu font cùng lúc.

Giữ logo EMORIA như tài sản thương hiệu, dùng bản sạch, đủ nét; nếu logo hiện tại chỉ hợp nền tối thì đặt vào khu tối hoặc dùng phiên bản một màu được chủ thương hiệu duyệt. Không tự vẽ lại logo. Không dùng ảnh có watermark làm ảnh bán hàng; cần thay bằng tài sản có quyền sử dụng.

### Tokens

| Token | Giá trị đề xuất | Vai trò |
|---|---|---|
| canvas | `#F7F5F0` | Nền cửa hàng |
| surface | `#FFFFFF` | Form, drawer, nội dung chức năng |
| ink | `#202321` | Chữ chính, CTA chính |
| muted | `#646862` | Chữ phụ trên nền sáng; vẫn cần kiểm tra contrast |
| line | `#DADDD5` | Phân tách trang trí |
| controlBorder | `#7C8279` | Ranh giới input cần nhìn rõ |
| accent | `#536452` | Link/điểm nhấn xanh olive xám; không biến thành thương hiệu vàng |
| silver | `#B8BFC2` | Màu trang trí, không dùng cho đoạn chữ nhỏ |
| darkCanvas / darkText | `#171D1C` / `#F7F5F0` | Viewer hoặc đoạn kể chuyện tối |
| error / success | `#B23B32` / `#316548` | Đi cùng chữ và icon; không chỉ dùng màu |

File `EMORIA-TOKENS.json` là nguồn giá trị máy đọc; designer cần kiểm tra tổ hợp foreground/background thực trước khi chốt.

- Heading: **Cormorant Garamond**, 500/600; body: **Be Vietnam Pro**, 400/500/600. Kiểm tra dấu tiếng Việt trên chữ thật, fallback `Georgia` và `system-ui`. Dùng tối đa hai họ font, self-host WOFF2 có subset tiếng Việt khi triển khai.
- H1 desktop 64px/1.08, mobile 38px/1.15; H2 40px/1.15 và 30px/1.2; body 16px/1.6; label 14px/1.4; caption 12px/1.5, không dùng caption cho giá hoặc lỗi.
- Container 1280px; gutter desktop 48px, tablet 32px, mobile 20px. Khoảng section 96/64/48px. Spacing scale 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Button cao 48px, input 48px, radius 8px; product image radius 4px; panel 12px; viewer cover 16px. Pill dành cho nhãn/filters, không bo tròn tất cả hình chữ nhật.
- Header desktop 76px, mobile 64px. Không gắn cả top nav lẫn sidebar trên cửa hàng.
- Motion 160–240ms cho phản hồi; tối đa 400ms cho reveal nhẹ. Tôn trọng reduced motion. Không scroll hijacking, custom cursor hoặc animation che nội dung đang chờ.
- Desktop focus mua hàng ở cột phải; mobile stack theo thứ tự DOM đọc được. Các tiện ích không phủ CTA/footer.

### Component bắt buộc và trạng thái

`Button`, `TextField`, `Select`, `Checkbox`, `RadioGroup`, `InlineError`, `Toast`, `Dialog`, `Drawer/BottomSheet`, `ProductCard`, `Price`, `QuantityStepper`, `FilterChip`, `StatusBadge`, `UploadItem`, `OrderTimeline`, `EmptyState`, `Skeleton`, `MemoryBlock`, `PrivacyPicker`.

Mỗi component tương tác có default, hover, focus-visible, disabled, loading và error khi phù hợp. Toast không dùng để báo lỗi cần sửa trong form. Dialog trả focus về nút mở, giữ focus trong khi mở, đóng bằng Escape trừ khi đang ở bước không thể hủy an toàn. Icon-only phải có tên truy cập.

### Microcopy thống nhất

| Trường hợp | Nội dung |
|---|---|
| Đang tải viewer | “Đang mở kỷ niệm…” |
| Lưu thành công | “Đã lưu thay đổi.” |
| Lưu thất bại | “Chưa lưu được. Nội dung bạn vừa nhập vẫn được giữ ở đây.” |
| Tag chưa kích hoạt | “Món trang sức này chưa được kích hoạt.” + “Kích hoạt bằng mã trong hộp” |
| Không có quyền | “Bạn chưa có quyền mở kỷ niệm này.” + “Đăng nhập” / “Liên hệ người gửi” nếu có kênh đã được phép |
| Link không còn hiệu lực | “Liên kết này không còn sử dụng được.” |
| Không hỗ trợ quét trong web | “Bạn có thể dùng camera quét mã QR trên thẻ hướng dẫn.” |
| Không có kết quả lọc | “Chưa tìm thấy món phù hợp.” + “Xóa bộ lọc” |
| Giỏ trống | “Giỏ hàng của bạn đang trống.” + “Khám phá trang sức” |
| Thanh toán chưa xác nhận | “Chúng tôi đang kiểm tra thanh toán. Bạn chưa cần thanh toán lại.” |

Không đưa “bucket”, “Supabase Cloud”, “giải mã chip S925”, UUID, tên bảng vào nội dung người mua. S925 là thông số chất liệu, không phải một loại chip hay cơ chế mã hóa.

## 8. NFC và Supabase: hành vi phải khớp UI

### NFC

Luồng mặc định là **tag chứa NDEF URL → điện thoại tương thích mở URL → server tìm đúng kỷ niệm và kiểm tra quyền**. Nội dung ảnh/video ở dịch vụ lưu trữ, không phải toàn bộ nằm trên chip. Web NFC không nên là điều kiện bắt buộc; tài liệu Chrome mô tả Web NFC cho Chrome Android và giới hạn NDEF. Xem [Chrome Web NFC](https://developer.chrome.com/docs/capabilities/nfc) và [Android NFC](https://developer.android.com/develop/connectivity/nfc/nfc).

Trước phát hành phải thử chip thật trong sản phẩm bạc hoàn chỉnh, với các thiết bị được nhóm cam kết hỗ trợ. Mô phỏng bằng click không chứng minh chip đọc được. QR và nhập mã giúp phục hồi khi không đọc được; không suy luận website có thể phân biệt tuyệt đối lượt chạm vật lý với việc mở lại cùng URL.

`publicId` dùng định tuyến, `claimSecret` dùng nhận quyền lần đầu, `shareToken` dùng cấp quyền xem: ba mục đích khác nhau. Một product ID như `emoria-lumen` không định danh mọi chiếc Lumen vật lý. Mỗi vật phẩm cần ID riêng, liên kết SKU và đơn khi giao.

### Mô hình dữ liệu đề xuất, chưa phải schema đã xác nhận

| Thực thể | Trách nhiệm |
|---|---|
| products, variants | Thông tin catalog; SKU, giá, tồn |
| orders, order_items, payment_attempts | Snapshot giá/biến thể; trạng thái đơn/thanh toán; chống trùng |
| jewelry_items | Một bản ghi mỗi sản phẩm vật lý; product/variant/order item; owner có thể chưa có |
| nfc_tags | Public ID, jewelry item, trạng thái; claim secret dạng hash được quản lý ở server |
| memory_spaces | Chủ sở hữu, tên, privacy, draft/published, version |
| memory_entries, media_assets | Nội dung theo khối; storage path, MIME, kích thước, trạng thái xử lý |
| jewelry_memory_links | Một liên kết đang hoạt động/tag; một album có thể gắn nhiều tag nếu được cấp quyền |
| space_members, share_links | Viewer/contributor, hạn dùng, thu hồi; token hash |
| audit_events | Các thay đổi quyền, liên kết, trạng thái đơn và vận hành |

Quy tắc nhận tag cần transaction/điều kiện duy nhất để hai tài khoản không nhận cùng lúc. Đổi liên kết không xóa album. Đổi chủ tag không mặc nhiên đổi chủ Memory Space. RLS dựa vào user ID và membership, không dựa vào tên hiển thị/email do client gửi.

Ảnh sản phẩm công khai có thể ở public bucket. Ảnh/thư/video kỷ niệm mặc định ở private bucket; server chỉ cấp URL ký hạn ngắn sau khi kiểm tra người xem hoặc share grant. Public bucket cho phép người có URL tải file, nên không phù hợp cho chế độ kỷ niệm riêng tư. Xem [Supabase buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) và [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Không gửi service-role key xuống frontend. Không gửi access token thô trong response `select('*')` cho người xem. Không cache nội dung riêng tư chỉ theo tag UID; cache phải theo quyền/session/version hoặc không cache. Đăng xuất/thu hồi quyền cần dọn cache phù hợp. Log và analytics không thu nội dung thư, ảnh, email hoặc token trong URL.

### Contract service đề xuất

```ts
type MemoryResult =
  | { ok: true; data: MemoryView; permissions: { canEdit: boolean; canShare: boolean }; version: number }
  | { ok: false; code: 'AUTH_REQUIRED' | 'ACCESS_DENIED' | 'NOT_AVAILABLE' | 'UNCLAIMED' | 'NETWORK_ERROR' };

type SaveResult =
  | { ok: true; persisted: true; version: number }
  | { ok: false; code: 'VALIDATION' | 'CONFLICT' | 'ACCESS_DENIED' | 'NETWORK_ERROR'; fieldErrors?: Record<string, string> };
```

Thông báo public nên gộp các trạng thái nhạy cảm khi cần tránh lộ sự tồn tại của album. Chỉ trả `UNCLAIMED` kèm thông tin tối thiểu theo chính sách tag. Version conflict không ghi đè im lặng; cho xem bản mới và giữ bản đang nhập.

## 9. Khoảng cách cụ thể trong project hiện tại

Các đường dẫn bên dưới tương đối với `C:\Users\Minh\Desktop\Project`. Đây là quan sát mã nguồn, không phải kết luận đã kiểm thử backend.

| File / điểm | Quan sát | Yêu cầu triển khai |
|---|---|---|
| `src/App.jsx:21` | Giỏ trong state, chưa thấy persistence trong App | Cart storage có version, chỉ lưu product/variant ID và quantity; refresh và đối chiếu giá/tồn |
| `src/App.jsx` | Một trang dài, hầu hết luồng chi tiết qua modal | Chuyển sang route và 3 layout; giữ adapter link NFC cũ |
| `src/components/HeroSection.jsx:102` | Tự ghép username thành email `@emoria.vn` | Yêu cầu email thật theo phương thức Auth đã chọn; không tự tạo danh tính giả |
| `src/components/CartDrawer.jsx:15` | Timer tự chuyển orderComplete và xóa giỏ | Order service thật; không confetti/success thay cho xác nhận server |
| `src/services/nfcService.js:83` | Cache theo tag trước khi kiểm tra token | Không trả cache vượt qua quyền; tách cache demo và dữ liệu thật |
| `src/services/nfcService.js:104` | Chỉ so token khi cả token DB và token input đều có | Thiếu token cần bị chặn khi yêu cầu quyền; kiểm tra ở server/RLS; chưa biết DB hiện chặn ra sao |
| `src/services/nfcService.js:129–153` | Query lỗi hoặc không thấy chuyển sang demo | Production trả lỗi/trạng thái đúng; demo chỉ ở route/mode riêng |
| `src/services/nfcService.js:185–213` | Cập nhật cache trước, DB lỗi vẫn trả success | Success chỉ khi bền vững; optimistic update phải rollback hoặc giữ draft có nhãn |
| `src/services/storageService.js:96–110` | Bucket không có thì trả blob preview; dùng public URL | Không coi blob là file đã lưu; private storage cho memories, kiểm tra MIME/server/quota |
| `src/components/MemoryViewer.jsx:284` | Nút chỉnh sửa không gắn điều kiện quyền trong phần UI đã đọc | UI dùng permissions do backend trả; backend từ chối người không có quyền |
| `src/components/MemoryViewer.jsx:54` | Audio được mô phỏng bằng state | Tệp audio và player thật hoặc ẩn tính năng |
| `src/components/MemoryViewer.jsx` | Upload tự lưu nội dung đang nhập; có nút Hủy | Tách draft khỏi publish để “Hủy” không gây hiểu nhầm |
| `src/data/products.js` | Giá/rating/mô tả hardcode; các lời hứa IP/chống nước/mã hóa cần chứng minh | Giữ ID/giá cho fixture; gắn cờ demo; chủ shop xác nhận thông số, ảnh, SKU |
| `package.json` | React 19, Vite 6, Tailwind 3; chưa có router/test scripts | Giữ stack; bổ sung router và công cụ kiểm thử đúng nhu cầu; không tự rewrite framework |

Đặc biệt cần thống nhất Halo được mô tả là vòng tay trong catalog nhưng là nhẫn trong dữ liệu kỷ niệm demo; một số hình được tái sử dụng cho sản phẩm khác. Không đưa inconsistency này vào site mới.

## 10. Tiêu chí nghiệm thu

### Trải nghiệm và hình ảnh

- Ở 360/390/768/1280/1440px không tràn ngang; chữ tiếng Việt không cắt dấu; zoom 200% vẫn dùng được.
- Home có CTA mua và demo nhìn thấy sớm; người mới không gặp đăng nhập bắt buộc.
- Thẻ sản phẩm, form, drawer và trạng thái tuân tokens; giá/tên/biến thể nhất quán.
- Keyboard đi hết luồng; có focus rõ; modal focus trap/restore; mỗi icon action có label; lỗi gắn input.
- Mục tiêu WCAG 2.2 AA: contrast chữ thường ≥4.5:1, chữ lớn ≥3:1, UI cần nhận biết ≥3:1. Chọn mục tiêu chạm 44×44px cho sản phẩm này; không nhầm đây là ngưỡng AA tối thiểu 24px của 2.5.8. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- Ảnh có width/height và responsive source; lazy load phần dưới; tách bundle editor/admin khỏi storefront. Mục tiêu khi có dữ liệu thực: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 ở p75; đây là mục tiêu, chưa đo site hiện tại.

### Test luồng có ý nghĩa

1. Khách chọn biến thể → thêm giỏ → refresh → sửa số lượng → checkout → server trả order ID.
2. Giỏ gặp hết hàng/đổi giá → người dùng được thông báo → không gửi sai đơn.
3. Bấm đặt hai lần hoặc retry mạng → không tạo hai đơn.
4. Thanh toán pending/failed/paid trả ba UI khác nhau; không xác nhận paid từ query string.
5. Link tag cũ và route mới đều tới đúng resolver; tag lạ không hiện album mẫu.
6. Tag chưa nhận được nhận bởi một tài khoản; hai lần claim cạnh tranh chỉ một lần thành công.
7. Người A không xem/sửa album riêng tư của B; thử trực tiếp API và URL media, không chỉ ẩn nút.
8. Mở album rồi đăng xuất/mở tài khoản khác không còn nội dung qua cache cũ.
9. Upload một tệp lỗi trong batch → giữ tệp đã xong và draft; save DB lỗi không báo đã lưu.
10. Thu hồi link → request mới bị chặn; kiểm thử TTL URL media theo chính sách đã chọn.
11. Người nhận mở album được chia sẻ không cần tài khoản; không tự nhận quyền sửa.
12. Admin cập nhật đơn theo chuyển trạng thái hợp lệ; tài khoản thường gọi endpoint admin bị chặn.
13. NFC vật lý trên thiết bị mục tiêu và QR đều hoạt động; kết quả ghi riêng với test mô phỏng.

Build pass không thay thế test quyền, thanh toán hoặc chip thật. Báo cáo kết quả phải tách “đã kiểm thử”, “mô phỏng”, “chưa có cấu hình để thử”.

### Đo hiệu quả sau phát hành

Sự kiện: `view_product`, `demo_opened`, `add_to_cart`, `checkout_started`, `order_created`, `payment_confirmed`, `claim_completed`, `memory_published`, `memory_opened`. Đo bỏ dở checkout, hoàn tất kích hoạt và tỷ lệ xuất bản kỷ niệm. Không đếm animation demo là kích hoạt thật. Không nhúng ID/token riêng tư hay nội dung kỷ niệm vào analytics.

## 11. Hướng tham khảo và điều cần chốt trước bán thật

Tham khảo cấu trúc nội dung, không sao chép nhận diện: [Mejuri](https://mejuri.com/) đặt All Jewelry/Gifts/Collections cạnh lối mua; [Catbird](https://www.catbirdnyc.com/) phân loại sản phẩm và cá nhân hóa/quà tặng rõ. Từ đó, đề xuất riêng cho EMORIA là ưu tiên sản phẩm và ngữ cảnh tặng quà trên storefront. “Silver editorial” là lựa chọn thiết kế cho dự án, không phải khẳng định một xu hướng phổ quát hay kết quả nghiên cứu người dùng.

Cần chủ shop/BA xác nhận trước khi bật nghiệp vụ production: danh mục/giá/tồn thật; quyền dùng ảnh và đánh giá; thông số chip/tương thích/chống nước; chính sách giao/đổi trả; thời hạn/quota lưu trữ; phương thức thanh toán; quyền trong quà tặng; domain NFC ổn định. Trong lúc chưa có, tiếp tục thiết kế bằng fixtures có nhãn, ẩn lời hứa chưa được chứng minh và không tạo success giả.
