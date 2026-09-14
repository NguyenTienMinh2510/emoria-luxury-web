-- ==============================================================================
-- EMORIA LUXURY - BÀI VIẾT, BÌNH LUẬN, TƯƠNG TÁC & QUẢN TRỊ (ARTICLES & ENGAGEMENT)
-- Phiên bản: 20260914_articles_system
-- Mô tả: Cung cấp đầy đủ cơ sở dữ liệu, RLS và RPC cho bài viết tin tức/câu chuyện,
--        hệ thống bình luận 1 cấp có kiểm duyệt, thích bài viết, lưu bài viết riêng tư,
--        báo cáo vi phạm, và quản trị xuất bản cho Admin.
-- ==============================================================================

BEGIN;

-- 1. BẢNG BÀI VIẾT (ARTICLES)
CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    cover_image TEXT,
    category TEXT NOT NULL DEFAULT 'Câu chuyện EMORIA',
    tags TEXT[] DEFAULT '{}',
    author_name TEXT DEFAULT 'EMORIA',
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at TIMESTAMPTZ,
    view_count BIGINT DEFAULT 0,
    likes_count BIGINT DEFAULT 0,
    related_product_ids TEXT[] DEFAULT '{}',
    allow_comments BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG BÌNH LUẬN BÀI VIẾT (ARTICLE COMMENTS - HỖ TRỢ TRẢ LỜI 1 CẤP)
CREATE TABLE IF NOT EXISTS public.article_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.article_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG THÍCH BÀI VIẾT (ARTICLE LIKES)
CREATE TABLE IF NOT EXISTS public.article_likes (
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (article_id, user_id)
);

-- 4. BẢNG LƯU BÀI VIẾT (ARTICLE BOOKMARKS - HOÀN TOÀN RIÊNG TƯ)
CREATE TABLE IF NOT EXISTS public.article_bookmarks (
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (article_id, user_id)
);

-- 5. BẢNG BÁO CÁO VI PHẠM BÌNH LUẬN (COMMENT REPORTS)
CREATE TABLE IF NOT EXISTS public.comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES public.article_comments(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (comment_id, reporter_id)
);

-- ==============================================================================
-- 6. BẬT ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

-- 6.1 Policies cho Articles
-- Khách vãng lai và user thường chỉ đọc bài đã published; Admin đọc tất cả (draft, archived)
DROP POLICY IF EXISTS articles_public_read ON public.articles;
CREATE POLICY articles_public_read ON public.articles FOR SELECT
    USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS articles_admin_manage ON public.articles;
CREATE POLICY articles_admin_manage ON public.articles FOR ALL
    TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6.2 Policies cho Article Comments
-- Người khác chỉ thấy comment approved trên bài published; Chính chủ thấy comment của mình; Admin thấy hết
DROP POLICY IF EXISTS comments_read ON public.article_comments;
CREATE POLICY comments_read ON public.article_comments FOR SELECT
    USING (
        (status = 'approved' AND EXISTS (
            SELECT 1 FROM public.articles a WHERE a.id = article_comments.article_id AND a.status = 'published'
        ))
        OR user_id = auth.uid()
        OR public.is_admin()
    );

DROP POLICY IF EXISTS comments_insert ON public.article_comments;
CREATE POLICY comments_insert ON public.article_comments FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND length(trim(content)) BETWEEN 1 AND 2000
        AND EXISTS (
            SELECT 1 FROM public.articles a 
            WHERE a.id = article_comments.article_id 
              AND a.status = 'published' 
              AND a.allow_comments = TRUE
        )
    );

DROP POLICY IF EXISTS comments_owner_update ON public.article_comments;
CREATE POLICY comments_owner_update ON public.article_comments FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS comments_owner_delete ON public.article_comments;
CREATE POLICY comments_owner_delete ON public.article_comments FOR DELETE
    TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- 6.3 Policies cho Article Likes
DROP POLICY IF EXISTS likes_read ON public.article_likes;
CREATE POLICY likes_read ON public.article_likes FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS likes_manage ON public.article_likes;
CREATE POLICY likes_manage ON public.article_likes FOR ALL
    TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6.4 Policies cho Article Bookmarks (Tuyệt đối riêng tư)
DROP POLICY IF EXISTS bookmarks_private ON public.article_bookmarks;
CREATE POLICY bookmarks_private ON public.article_bookmarks FOR ALL
    TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6.5 Policies cho Comment Reports
DROP POLICY IF EXISTS reports_insert ON public.comment_reports;
CREATE POLICY reports_insert ON public.comment_reports FOR INSERT
    TO authenticated
    WITH CHECK (reporter_id = auth.uid() AND length(trim(reason)) > 0);

DROP POLICY IF EXISTS reports_admin_read ON public.comment_reports;
CREATE POLICY reports_admin_read ON public.comment_reports FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Phân quyền cơ sở
GRANT SELECT ON public.articles, public.article_comments, public.article_likes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_bookmarks TO authenticated;
GRANT INSERT ON public.article_comments, public.article_likes, public.comment_reports TO authenticated;
GRANT SELECT ON public.comment_reports TO authenticated;

-- ==============================================================================
-- 7. CÁC HÀM NGHIỆP VỤ BẢO MẬT (SECURITY RPC FUNCTIONS)
-- ==============================================================================

-- 7.1 Lấy danh sách bài viết đã xuất bản (kèm lọc danh mục, tìm kiếm và phân trang)
CREATE OR REPLACE FUNCTION public.rpc_get_published_articles(
    p_category TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_limit INT DEFAULT 10,
    p_offset INT DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_total BIGINT;
    v_articles JSONB;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM public.articles
    WHERE status = 'published'
      AND (p_category IS NULL OR p_category = '' OR p_category = 'Tất cả' OR category = p_category)
      AND (p_search IS NULL OR p_search = '' OR (
          title ILIKE '%' || p_search || '%' OR excerpt ILIKE '%' || p_search || '%'
      ));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'slug', slug,
        'title', title,
        'excerpt', excerpt,
        'cover_image', cover_image,
        'category', category,
        'tags', tags,
        'author_name', author_name,
        'published_at', published_at,
        'view_count', view_count,
        'likes_count', likes_count,
        'allow_comments', allow_comments
    ) ORDER BY published_at DESC NULLS LAST, created_at DESC), '[]'::jsonb)
    INTO v_articles
    FROM (
        SELECT *
        FROM public.articles
        WHERE status = 'published'
          AND (p_category IS NULL OR p_category = '' OR p_category = 'Tất cả' OR category = p_category)
          AND (p_search IS NULL OR p_search = '' OR (
              title ILIKE '%' || p_search || '%' OR excerpt ILIKE '%' || p_search || '%'
          ))
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT LEAST(p_limit, 50) OFFSET GREATEST(p_offset, 0)
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'total', v_total,
        'articles', v_articles
    );
END;
$$;

-- 7.2 Lấy chi tiết bài viết (chỉ bài published, hoặc bài nháp nếu là Admin)
CREATE OR REPLACE FUNCTION public.rpc_get_article_detail(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_article RECORD;
    v_is_liked BOOLEAN := FALSE;
    v_is_bookmarked BOOLEAN := FALSE;
    v_comments JSONB;
BEGIN
    SELECT * INTO v_article
    FROM public.articles
    WHERE slug = lower(trim(p_slug));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy bài viết.');
    END IF;

    -- Nếu không phải published và caller không phải admin -> từ chối
    IF v_article.status <> 'published' AND NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết hiện không khả dụng.');
    END IF;

    -- Tăng lượt xem an toàn khi bài published
    IF v_article.status = 'published' THEN
        UPDATE public.articles SET view_count = view_count + 1 WHERE id = v_article.id;
    END IF;

    -- Kiểm tra like & bookmark của caller
    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.article_likes WHERE article_id = v_article.id AND user_id = auth.uid()
        ) INTO v_is_liked;

        SELECT EXISTS (
            SELECT 1 FROM public.article_bookmarks WHERE article_id = v_article.id AND user_id = auth.uid()
        ) INTO v_is_bookmarked;
    END IF;

    -- Lấy danh sách bình luận (approved hoặc của chính caller nếu đang pending)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'parent_id', c.parent_id,
        'author_name', COALESCE(p.full_name, 'Khách hàng EMORIA'),
        'author_avatar', p.avatar_url,
        'content', c.content,
        'status', c.status,
        'created_at', to_char(c.created_at, 'DD/MM/YYYY HH24:MI'),
        'is_mine', (auth.uid() IS NOT NULL AND c.user_id = auth.uid())
    ) ORDER BY c.created_at ASC), '[]'::jsonb)
    INTO v_comments
    FROM public.article_comments c
    LEFT JOIN public.profiles p ON p.id = c.user_id
    WHERE c.article_id = v_article.id
      AND (c.status = 'approved' OR (auth.uid() IS NOT NULL AND c.user_id = auth.uid()) OR public.is_admin());

    RETURN jsonb_build_object(
        'success', true,
        'article', jsonb_build_object(
            'id', v_article.id,
            'slug', v_article.slug,
            'title', v_article.title,
            'excerpt', v_article.excerpt,
            'content', v_article.content,
            'cover_image', v_article.cover_image,
            'category', v_article.category,
            'tags', v_article.tags,
            'author_name', v_article.author_name,
            'status', v_article.status,
            'published_at', v_article.published_at,
            'view_count', v_article.view_count + CASE WHEN v_article.status = 'published' THEN 1 ELSE 0 END,
            'likes_count', v_article.likes_count,
            'related_product_ids', v_article.related_product_ids,
            'allow_comments', v_article.allow_comments,
            'is_liked', v_is_liked,
            'is_bookmarked', v_is_bookmarked
        ),
        'comments', v_comments
    );
END;
$$;

-- 7.3 Thích / Bỏ thích bài viết nguyên tử
CREATE OR REPLACE FUNCTION public.rpc_toggle_article_like(p_article_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_liked BOOLEAN;
    v_count BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để thích bài viết.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.articles WHERE id = p_article_id AND status = 'published') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết không tồn tại hoặc chưa xuất bản.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.article_likes WHERE article_id = p_article_id AND user_id = auth.uid()) THEN
        DELETE FROM public.article_likes WHERE article_id = p_article_id AND user_id = auth.uid();
        v_liked := FALSE;
    ELSE
        INSERT INTO public.article_likes (article_id, user_id) VALUES (p_article_id, auth.uid());
        v_liked := TRUE;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.article_likes WHERE article_id = p_article_id;
    UPDATE public.articles SET likes_count = v_count WHERE id = p_article_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_liked', v_liked,
        'likes_count', v_count
    );
END;
$$;

-- 7.4 Lưu / Bỏ lưu bài viết (Bookmark cá nhân)
CREATE OR REPLACE FUNCTION public.rpc_toggle_article_bookmark(p_article_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_bookmarked BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để lưu bài viết.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.articles WHERE id = p_article_id AND status = 'published') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết không tồn tại hoặc chưa xuất bản.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.article_bookmarks WHERE article_id = p_article_id AND user_id = auth.uid()) THEN
        DELETE FROM public.article_bookmarks WHERE article_id = p_article_id AND user_id = auth.uid();
        v_bookmarked := FALSE;
    ELSE
        INSERT INTO public.article_bookmarks (article_id, user_id) VALUES (p_article_id, auth.uid());
        v_bookmarked := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_bookmarked', v_bookmarked,
        'message', CASE WHEN v_bookmarked THEN 'Đã lưu bài viết vào tài khoản.' ELSE 'Đã bỏ lưu bài viết.' END
    );
END;
$$;

-- 7.5 Thêm bình luận hoặc trả lời 1 cấp
CREATE OR REPLACE FUNCTION public.rpc_add_article_comment(
    p_article_id UUID,
    p_content TEXT,
    p_parent_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_art RECORD;
    v_parent RECORD;
    v_comment_id UUID;
    v_default_status TEXT := 'pending'; -- Mặc định chờ duyệt để bảo vệ nội dung
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vui lòng đăng nhập để bình luận.');
    END IF;

    IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nội dung bình luận không được để trống.');
    END IF;

    IF length(trim(p_content)) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bình luận không được vượt quá 2000 ký tự.');
    END IF;

    SELECT * INTO v_art FROM public.articles WHERE id = p_article_id AND status = 'published';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết không tồn tại hoặc chưa xuất bản.');
    END IF;

    IF NOT v_art.allow_comments THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bài viết này hiện đã đóng phần bình luận.');
    END IF;

    -- Kiểm tra parent_id: chỉ cho phép trả lời 1 cấp
    IF p_parent_id IS NOT NULL THEN
        SELECT * INTO v_parent FROM public.article_comments WHERE id = p_parent_id AND article_id = p_article_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Bình luận gốc không tồn tại.');
        END IF;
        -- Ngăn chặn lồng nhiều cấp: Nếu parent_id bản thân nó đã có parent_id thì từ chối
        IF v_parent.parent_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Hệ thống chỉ hỗ trợ phản hồi 1 cấp.');
        END IF;
    END IF;

    -- Nếu là Admin thì bình luận tự động approved
    IF public.is_admin() THEN
        v_default_status := 'approved';
    END IF;

    INSERT INTO public.article_comments (article_id, user_id, parent_id, content, status)
    VALUES (p_article_id, auth.uid(), p_parent_id, trim(p_content), v_default_status)
    RETURNING id INTO v_comment_id;

    RETURN jsonb_build_object(
        'success', true,
        'comment_id', v_comment_id,
        'status', v_default_status,
        'message', CASE 
            WHEN v_default_status = 'approved' THEN 'Bình luận đã được đăng thành công.'
            ELSE 'Bình luận đã được gửi và đang chờ ban quản trị kiểm duyệt.'
        END
    );
END;
$$;

-- 7.6 Kiểm duyệt bình luận (Dành cho Admin)
CREATE OR REPLACE FUNCTION public.rpc_moderate_article_comment(
    p_comment_id UUID,
    p_status TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Yêu cầu quyền Quản trị viên.');
    END IF;

    IF p_status NOT IN ('approved', 'hidden', 'deleted') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Trạng thái kiểm duyệt không hợp lệ.');
    END IF;

    UPDATE public.article_comments
    SET status = p_status, updated_at = NOW()
    WHERE id = p_comment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy bình luận.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã cập nhật trạng thái bình luận thành công.');
END;
$$;

-- 7.7 Quản trị bài viết: Tạo / Sửa / Xuất bản (Dành cho Admin)
CREATE OR REPLACE FUNCTION public.rpc_save_article_admin(
    p_article_id UUID,
    p_payload JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_slug TEXT;
    v_status TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Yêu cầu quyền Quản trị viên.');
    END IF;

    v_slug := lower(trim(COALESCE(p_payload->>'slug', '')));
    IF length(v_slug) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Đường dẫn tĩnh (Slug) không được để trống.');
    END IF;

    v_status := COALESCE(p_payload->>'status', 'draft');
    IF v_status NOT IN ('draft', 'published', 'archived') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Trạng thái bài viết không hợp lệ.');
    END IF;

    IF p_article_id IS NOT NULL THEN
        -- Cập nhật bài viết hiện có
        UPDATE public.articles SET
            slug = v_slug,
            title = COALESCE(p_payload->>'title', title),
            excerpt = COALESCE(p_payload->>'excerpt', excerpt),
            content = COALESCE(p_payload->>'content', content),
            cover_image = COALESCE(p_payload->>'cover_image', cover_image),
            category = COALESCE(p_payload->>'category', category),
            author_name = COALESCE(p_payload->>'author_name', author_name),
            status = v_status,
            allow_comments = COALESCE((p_payload->>'allow_comments')::boolean, allow_comments),
            published_at = CASE 
                WHEN v_status = 'published' AND published_at IS NULL THEN NOW() 
                ELSE published_at 
            END,
            updated_at = NOW()
        WHERE id = p_article_id
        RETURNING id INTO v_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy bài viết để cập nhật.');
        END IF;
    ELSE
        -- Tạo mới bài viết
        INSERT INTO public.articles (
            slug, title, excerpt, content, cover_image, category, author_name,
            author_id, status, allow_comments, published_at
        ) VALUES (
            v_slug,
            COALESCE(p_payload->>'title', 'Bài viết mới'),
            p_payload->>'excerpt',
            COALESCE(p_payload->>'content', ''),
            p_payload->>'cover_image',
            COALESCE(p_payload->>'category', 'Câu chuyện EMORIA'),
            COALESCE(p_payload->>'author_name', 'EMORIA'),
            auth.uid(),
            v_status,
            COALESCE((p_payload->>'allow_comments')::boolean, TRUE),
            CASE WHEN v_status = 'published' THEN NOW() ELSE NULL END
        )
        RETURNING id INTO v_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'article_id', v_id,
        'slug', v_slug,
        'status', v_status,
        'message', 'Đã lưu bài viết thành công.'
    );
END;
$$;

-- Phân quyền thực thi RPC
REVOKE ALL ON FUNCTION public.rpc_get_published_articles(TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_published_articles(TEXT, TEXT, INT, INT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_article_detail(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_article_detail(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_toggle_article_like(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_article_like(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_toggle_article_bookmark(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_article_bookmark(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_add_article_comment(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_article_comment(UUID, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_moderate_article_comment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_moderate_article_comment(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_save_article_admin(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_article_admin(UUID, JSONB) TO authenticated;

COMMIT;
