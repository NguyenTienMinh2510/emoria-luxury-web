-- Migration: Add rpc_delete_article_admin for permanent admin deletion of articles
CREATE OR REPLACE FUNCTION public.rpc_delete_article_admin(p_article_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Yêu cầu quyền Quản trị viên.');
    END IF;

    IF p_article_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã bài viết không hợp lệ.');
    END IF;

    DELETE FROM public.articles WHERE id = p_article_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy bài viết để xóa.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã xóa bài viết thành công.');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_article_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_article_admin(UUID) TO authenticated;
