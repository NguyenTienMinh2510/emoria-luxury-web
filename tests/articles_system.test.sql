-- ==============================================================================
-- EMORIA LUXURY - KIỂM THỬ TÍCH HỢP HỆ THỐNG BÀI VIẾT & BÌNH LUẬN
-- File: tests/articles_system.test.sql
-- Mục tiêu: Kiểm tra RLS, RPCs, phân quyền Admin, tính riêng tư Bookmark,
--          tính nguyên tử của Like và cấu trúc bình luận 1 cấp có kiểm duyệt.
-- ==============================================================================

BEGIN;

-- 1. SETUP TÀI KHOẢN KIỂM THỬ
INSERT INTO auth.users (id, email)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'admin_art@emoria.vn'),
    ('22222222-2222-2222-2222-222222222222', 'user1_art@emoria.vn'),
    ('33333333-3333-3333-3333-333333333333', 'user2_art@emoria.vn')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'admin_art@emoria.vn', 'Admin Emoria'),
    ('22222222-2222-2222-2222-222222222222', 'user1_art@emoria.vn', 'Người Dùng 1'),
    ('33333333-3333-3333-3333-333333333333', 'user2_art@emoria.vn', 'Người Dùng 2')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.role_assignments (user_id, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. TEST QUẢN TRỊ VIÊN TẠO BÀI VIẾT (1 Published, 1 Draft)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- Tạo bài đã xuất bản
SELECT public.rpc_save_article_admin(
    NULL,
    jsonb_build_object(
        'slug', 'nghe-thuat-che-tac-da-quy-emoria',
        'title', 'Nghệ Thuật Chế Tác Đá Quý EMORIA',
        'excerpt', 'Hành trình tạo nên chiếc nhẫn thông minh tinh xảo...',
        'content', 'Chi tiết bài viết về quy trình nung và cắt vát đá quý...',
        'cover_image', 'https://images.unsplash.com/photo-gem',
        'category', 'Chế tác & Nghệ thuật',
        'status', 'published',
        'allow_comments', true
    )
);

-- Tạo bài nháp (Draft - chỉ Admin mới thấy)
SELECT public.rpc_save_article_admin(
    NULL,
    jsonb_build_object(
        'slug', 'bi-mat-cong-nghe-nfc-2026',
        'title', 'Bí Mật Công Nghệ NFC Thế Hệ Mới (Bản Nháp)',
        'excerpt', 'Tài liệu mật nội bộ...',
        'content', 'Nội dung chưa công bố...',
        'category', 'Công nghệ',
        'status', 'draft',
        'allow_comments', false
    )
);

-- Kiểm tra Admin thấy cả 2 bài
DO $$
DECLARE
    v_cnt INT;
BEGIN
    SELECT COUNT(*) INTO v_cnt FROM public.articles;
    IF v_cnt < 2 THEN
        RAISE EXCEPTION 'Admin phải thấy ít nhất 2 bài viết, thực tế: %', v_cnt;
    END IF;
END $$;

-- 3. TEST USER THƯỜNG KHÔNG ĐƯỢC PHÉP TẠO BÀI (Bảo vệ RLS/RPC)
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.rpc_save_article_admin(
        NULL,
        jsonb_build_object('slug', 'hack-bai-viet', 'title', 'Hack', 'status', 'published')
    );
    IF (v_res->>'success')::boolean = TRUE THEN
        RAISE EXCEPTION 'Người dùng thường không được phép gọi rpc_save_article_admin!';
    END IF;
END $$;

-- 4. TEST ANON / KHÁCH CHỈ ĐỌC ĐƯỢC BÀI PUBLISHED, KHÔNG ĐỌC ĐƯỢC DRAFT
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);

-- Anon query trực tiếp bảng articles
DO $$
DECLARE
    v_draft_cnt INT;
BEGIN
    SELECT COUNT(*) INTO v_draft_cnt FROM public.articles WHERE status = 'draft';
    IF v_draft_cnt > 0 THEN
        RAISE EXCEPTION 'Anon không được phép thấy bài viết nháp (draft) qua SELECT! Thực tế thấy: %', v_draft_cnt;
    END IF;
END $$;

-- Anon gọi rpc_get_article_detail cho bài draft
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.rpc_get_article_detail('bi-mat-cong-nghe-nfc-2026');
    IF (v_res->>'success')::boolean = TRUE THEN
        RAISE EXCEPTION 'Anon không được phép xem chi tiết bài viết nháp!';
    END IF;
END $$;

-- Anon gọi rpc_get_article_detail cho bài published -> Thành công & Tăng view
DO $$
DECLARE
    v_res JSONB;
    v_views BIGINT;
BEGIN
    v_res := public.rpc_get_article_detail('nghe-thuat-che-tac-da-quy-emoria');
    IF (v_res->>'success')::boolean <> TRUE THEN
        RAISE EXCEPTION 'Anon phải đọc được chi tiết bài published!';
    END IF;
    
    SELECT view_count INTO v_views FROM public.articles WHERE slug = 'nghe-thuat-che-tac-da-quy-emoria';
    IF v_views < 1 THEN
        RAISE EXCEPTION 'View count phải tự động tăng khi xem bài published!';
    END IF;
END $$;

-- 5. TEST TƯƠNG TÁC LIKE & BOOKMARK NGUYÊN TỬ VÀ BẢO MẬT RIÊNG TƯ
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

DO $$
DECLARE
    v_art_id UUID;
    v_like_res JSONB;
    v_bm_res JSONB;
    v_likes_count BIGINT;
BEGIN
    SELECT id INTO v_art_id FROM public.articles WHERE slug = 'nghe-thuat-che-tac-da-quy-emoria';
    
    -- Lần 1: Like
    v_like_res := public.rpc_toggle_article_like(v_art_id);
    IF (v_like_res->>'is_liked')::boolean <> TRUE OR (v_like_res->>'likes_count')::bigint <> 1 THEN
        RAISE EXCEPTION 'Lần đầu like phải trả về is_liked=true và likes_count=1, thực tế: %', v_like_res;
    END IF;
    
    -- Lần 2: Bỏ Like
    v_like_res := public.rpc_toggle_article_like(v_art_id);
    IF (v_like_res->>'is_liked')::boolean <> FALSE OR (v_like_res->>'likes_count')::bigint <> 0 THEN
        RAISE EXCEPTION 'Lần hai like phải hủy like và likes_count=0, thực tế: %', v_like_res;
    END IF;

    -- Like lại để kiểm tra
    v_like_res := public.rpc_toggle_article_like(v_art_id);
    
    -- Bookmark bài viết
    v_bm_res := public.rpc_toggle_article_bookmark(v_art_id);
    IF (v_bm_res->>'is_bookmarked')::boolean <> TRUE THEN
        RAISE EXCEPTION 'Bookmark lần đầu phải trả về is_bookmarked=true';
    END IF;
END $$;

-- Kiểm tra tính riêng tư của Bookmarks giữa 2 phiên người dùng (User 1 vs User 2)
DO $$
DECLARE
    v_count INT;
BEGIN
    -- User 1 đang active -> thấy 1 bookmark
    SELECT COUNT(*) INTO v_count FROM public.article_bookmarks;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'User 1 phải thấy chính xác 1 bookmark của mình, thực tế: %', v_count;
    END IF;
END $$;

-- Chuyển sang User 2
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
DO $$
DECLARE
    v_count INT;
BEGIN
    -- User 2 KHÔNG được thấy bookmark của User 1
    SELECT COUNT(*) INTO v_count FROM public.article_bookmarks;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'User 2 KHÔNG được thấy bookmark của User 1 qua RLS! Thực tế thấy: %', v_count;
    END IF;
END $$;

-- 6. TEST BÌNH LUẬN 1 CẤP, CHẶN LỒNG SÂU & QUY TRÌNH KIỂM DUYỆT
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

DO $$
DECLARE
    v_art_id UUID;
    v_c1_res JSONB;
    v_c1_id UUID;
    v_c2_res JSONB;
    v_c2_id UUID;
    v_c3_res JSONB;
BEGIN
    SELECT id INTO v_art_id FROM public.articles WHERE slug = 'nghe-thuat-che-tac-da-quy-emoria';

    -- Người dùng gửi bình luận gốc (parent_id = NULL)
    v_c1_res := public.rpc_add_article_comment(v_art_id, 'Thiết kế nhẫn quá đẳng cấp!');
    IF (v_c1_res->>'success')::boolean <> TRUE OR (v_c1_res->>'status') <> 'pending' THEN
        RAISE EXCEPTION 'Bình luận người dùng phải ở trạng thái pending chờ duyệt, thực tế: %', v_c1_res;
    END IF;
    v_c1_id := (v_c1_res->>'comment_id')::uuid;

    -- Người dùng gửi phản hồi cấp 1 (parent_id = v_c1_id)
    v_c2_res := public.rpc_add_article_comment(v_art_id, 'Tôi cũng đồng ý với ý kiến này.', v_c1_id);
    IF (v_c2_res->>'success')::boolean <> TRUE THEN
        RAISE EXCEPTION 'Gửi phản hồi cấp 1 phải thành công, thực tế: %', v_c2_res;
    END IF;
    v_c2_id := (v_c2_res->>'comment_id')::uuid;

    -- Thử gửi phản hồi cấp 2 vào v_c2_id (lồng quá 1 cấp) -> Phải bị chặn!
    v_c3_res := public.rpc_add_article_comment(v_art_id, 'Phản hồi cấp 2 này phải bị từ chối.', v_c2_id);
    IF (v_c3_res->>'success')::boolean = TRUE THEN
        RAISE EXCEPTION 'Hệ thống không được cho phép lồng phản hồi quá 1 cấp!';
    END IF;
END $$;

-- Kiểm tra RLS bình luận: Anon chưa thấy bình luận pending
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
DECLARE
    v_cnt INT;
BEGIN
    SELECT COUNT(*) INTO v_cnt FROM public.article_comments;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'Khách vãng lai (anon) không được thấy bình luận đang pending kiểm duyệt!';
    END IF;
END $$;

-- 7. TEST ADMIN DUYỆT BÌNH LUẬN
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

DO $$
DECLARE
    v_c1_id UUID;
    v_mod_res JSONB;
BEGIN
    SELECT id INTO v_c1_id FROM public.article_comments WHERE parent_id IS NULL LIMIT 1;
    
    -- Admin duyệt bình luận
    v_mod_res := public.rpc_moderate_article_comment(v_c1_id, 'approved');
    IF (v_mod_res->>'success')::boolean <> TRUE THEN
        RAISE EXCEPTION 'Admin duyệt bình luận thất bại: %', v_mod_res;
    END IF;
END $$;

-- Khách vãng lai kiểm tra lại: Bây giờ đã thấy bình luận approved!
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
DECLARE
    v_cnt INT;
BEGIN
    SELECT COUNT(*) INTO v_cnt FROM public.article_comments;
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'Sau khi duyệt, khách vãng lai phải thấy đúng 1 bình luận approved, thực tế: %', v_cnt;
    END IF;
END $$;

ROLLBACK;
