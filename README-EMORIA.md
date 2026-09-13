# Bộ bàn giao UX/UI EMORIA

Đã phân tích 133 ảnh trong DIGITAL MARKETING.zip và source tại `C:\Users\Minh\Desktop\Project`. Chưa sửa project gốc hoặc deploy.

## Đọc theo thứ tự

1. **EMORIA-UX-UI-SPEC.md** — quyết định giữ/sửa UX của BA, thiết kế các màn, tokens, NFC/quyền riêng tư, khoảng cách source, ưu tiên và nghiệm thu.
2. **EMORIA-IMPLEMENTATION-PROMPTS.md** — câu lệnh có thể giao trực tiếp cho Antigravity/Codex; dùng mục A để khởi động, B và C khi phân chia việc.
3. **EMORIA-TOKENS.json** — giá trị thiết kế để máy đọc.
4. **BA-SCREEN-MAP.csv** — ánh xạ đủ 133 tên ảnh sang nhóm tính năng; ID BA theo thứ tự trong ZIP, không suy diễn số trang Canva.

Tải cả bộ rồi đính kèm vào công cụ thực hiện. Không chỉ gửi câu “làm cho luxury”; gửi SPEC và prompt cùng nhau. ZIP UI gốc vẫn là tài liệu tham chiếu độc lập, không nhúng lại vào bộ bàn giao.

## Quyết định chính

- Hướng hình ảnh: bạc, nền ngà, chữ than, ảnh lớn, bố cục tạp chí; ít hiệu ứng.
- Ba khu: cửa hàng / không gian kỷ niệm / quản trị.
- Giữ các tình huống nghiệp vụ BA đã nghĩ tới, rút gọn popup và đăng nhập.
- Lối NFC chính là mở link/QR; không ép mọi thiết bị quét NFC bằng JavaScript.
- Không báo lưu/đặt hàng thành công khi chỉ là demo hoặc backend lỗi.

## Giới hạn đã ghi nhận

Chưa xem được deploy qua link Vercel vì chuyển tới đăng nhập. Chưa kiểm tra Supabase thực, cổng thanh toán hay chip vật lý. Các dòng audit mã nguồn là ảnh chụp trạng thái ngày 13/09/2026; cần kiểm tra lại khi triển khai. Giá, thông số và quyền dùng hình cần chủ shop xác nhận trước phát hành.
