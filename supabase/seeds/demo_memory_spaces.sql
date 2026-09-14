-- ==============================================================================
-- EMORIA LUXURY - DEMO SEED DATA (CHỈ DÙNG CHO LOCAL / TEST / DEMO)
-- TUYỆT ĐỐI KHÔNG CHẠY FILE NÀY TRÊN SUPABASE PRODUCTION
-- ==============================================================================

INSERT INTO public.memory_spaces (
  tag_uid, jewelry_name, title, date, quote, author_name, recipient_name, 
  letter, audio_title, audio_url, is_protected, pin_hash, claim_code_hash, availability_status, unlock_at
) VALUES 
(
  'emoria-lumen',
  'Dây Chuyền S925 Emoria Lumen',
  'Dưới Ánh Hoàng Hôn Santorini',
  '14 Tháng 02, 2025',
  'Mỗi ánh sao đêm nay đều lưu giữ trọn vẹn lời hẹn ước của đôi ta dưới hoàng hôn rực rỡ.',
  'Minh Hoàng',
  'Bảo Trâm',
  'Gửi người con gái anh yêu nhất, chiếc dây chuyền này chứa đựng khoảnh khắc chúng ta cùng nhìn về một tương lai tươi sáng.',
  'Bản Dạ Khúc Hoàng Hôn (Acoustic)',
  'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=melody-of-nature-110481.mp3',
  false,
  null,
  encode(digest('OWNER-LUMEN-2025', 'sha256'), 'hex'),
  'available',
  null
),
(
  'emoria-pulse',
  'Vòng Tay S925 Emoria Pulse',
  'Nhịp Đập Đầu Tiên',
  '20 Tháng 10, 2024',
  'Dù ở bất kỳ phương trời nào, chiếc vòng sẽ luôn nhắc nhở về nhịp đập trái tim ta dành cho nhau.',
  'Khánh An',
  'Hương Giang',
  'Kỷ niệm 1000 ngày bên nhau. Cảm ơn em đã luôn là ánh sáng dịu êm nhất trong cuộc đời anh.',
  'VoiceMemo - Lời Thì Thầm 1000 Ngày',
  'https://cdn.pixabay.com/download/audio/2022/11/06/audio_29114f6b21.mp3?filename=lofi-study-112191.mp3',
  true,
  crypt('1000', gen_salt('bf', 10)), -- PIN demo 1000
  encode(digest('OWNER-PULSE-2024', 'sha256'), 'hex'),
  'available',
  null
),
(
  'emoria-horizon',
  'Nhẫn Đôi S925 Emoria Horizon',
  'Tọa Độ Chân Trời Vĩnh Cửu',
  '20 Tháng 10, 2026',
  'Chân trời không phải là điểm kết thúc, mà là nơi hai linh hồn hòa làm một.',
  'Đức Huy',
  'Thanh Nhã',
  'Thời khắc mở niêm phong đang đếm ngược đến ngày kỷ niệm của chúng mình!',
  'Giai Điệu Giao Thừa & Nguyện Ước',
  'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=sweet-love-121471.mp3',
  false,
  null,
  encode(digest('OWNER-HORIZON-2025', 'sha256'), 'hex'),
  'timed_lock',
  '2026-10-20T18:00:00.000Z'
)
ON CONFLICT (tag_uid) DO NOTHING;

-- ==============================================================================
-- 2. DỮ LIỆU MEDIA ẢNH & VIDEO KỶ NIỆM (public.memory_media)
-- ==============================================================================
INSERT INTO public.memory_media (memory_id, url, type, caption, order_index, is_private)
SELECT id, 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=85', 'image', 'Hoàng hôn tuyệt mỹ trên vịnh biển Santorini', 1, false
FROM public.memory_spaces WHERE tag_uid = 'emoria-lumen'
ON CONFLICT DO NOTHING;

INSERT INTO public.memory_media (memory_id, url, type, caption, order_index, is_private)
SELECT id, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', 'video', 'Khoảnh khắc hoa nở rộ cùng lời ước nguyện dưới ánh chiều', 2, false
FROM public.memory_spaces WHERE tag_uid = 'emoria-lumen'
ON CONFLICT DO NOTHING;

INSERT INTO public.memory_media (memory_id, url, type, caption, order_index, is_private)
SELECT id, 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=1200&q=85', 'image', 'Tay trong tay và lời hẹn ước trăm năm', 3, false
FROM public.memory_spaces WHERE tag_uid = 'emoria-lumen'
ON CONFLICT DO NOTHING;

INSERT INTO public.memory_media (memory_id, url, type, caption, order_index, is_private)
SELECT id, 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=85', 'image', 'Nụ cười rạng rỡ của em ngày đầu đông', 1, false
FROM public.memory_spaces WHERE tag_uid = 'emoria-pulse'
ON CONFLICT DO NOTHING;

INSERT INTO public.memory_media (memory_id, url, type, caption, order_index, is_private)
SELECT id, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', 'video', 'Thước phim kỷ niệm 1000 ngày yêu thương', 2, false
FROM public.memory_spaces WHERE tag_uid = 'emoria-pulse'
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 3. DỮ LIỆU SỔ LƯU NIỆM (public.guestbook_entries)
-- ==============================================================================
INSERT INTO public.guestbook_entries (memory_id, author_name, relationship, message)
SELECT id, 'Minh Hoàng', 'Người tặng', 'Mãi mãi bên nhau em nhé!'
FROM public.memory_spaces WHERE tag_uid = 'emoria-lumen'
ON CONFLICT DO NOTHING;

INSERT INTO public.guestbook_entries (memory_id, author_name, relationship, message)
SELECT id, 'Hồng Ánh', 'Bạn thân', 'Chúc hai bạn mãi hạnh phúc và ngọt ngào như ngày đầu!'
FROM public.memory_spaces WHERE tag_uid = 'emoria-lumen'
ON CONFLICT DO NOTHING;

INSERT INTO public.guestbook_entries (memory_id, author_name, relationship, message)
SELECT id, 'Khánh An', 'Người tặng', 'Mỗi nhịp đập nơi cổ tay sẽ luôn có anh kề bên em.'
FROM public.memory_spaces WHERE tag_uid = 'emoria-pulse'
ON CONFLICT DO NOTHING;
