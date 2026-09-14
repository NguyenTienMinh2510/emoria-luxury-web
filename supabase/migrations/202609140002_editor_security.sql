BEGIN;
CREATE TABLE public.article_drafts(article_id uuid PRIMARY KEY REFERENCES public.articles(id) ON DELETE CASCADE,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.article_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.article_drafts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.articles,public.article_comments,public.article_likes,public.article_bookmarks,public.comment_reports FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_toggle_article_like(uuid),public.rpc_toggle_article_bookmark(uuid) FROM PUBLIC,anon,authenticated;
ALTER TABLE public.articles ADD COLUMN seo_title text,ADD COLUMN seo_description text;

CREATE OR REPLACE FUNCTION public.rpc_save_article_admin(p_article_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE aid uuid:=p_article_id; old public.articles; target text:=p_payload->>'status'; slug text:=lower(trim(p_payload->>'slug'));
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 IF length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_payload->>'content',''))) NOT BETWEEN 1 AND 100000 OR slug IS NULL OR slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(slug)>160 OR target IS NULL OR target NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Kiểm tra tiêu đề, nội dung và đường dẫn bài viết.'; END IF;
 IF aid IS NOT NULL THEN
  SELECT * INTO old FROM public.articles WHERE id=aid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bài viết.'; END IF;
  IF old.slug<>slug THEN RAISE EXCEPTION 'Đường dẫn đã được cố định. Tạo bài mới nếu cần đường dẫn khác.'; END IF;
 ELSE
  INSERT INTO public.articles(slug,title,content,author_id) VALUES(slug,p_payload->>'title',p_payload->>'content',auth.uid()) RETURNING id INTO aid;
 END IF;
 INSERT INTO public.article_drafts(article_id,payload) VALUES(aid,p_payload) ON CONFLICT(article_id) DO UPDATE SET payload=excluded.payload,updated_at=now();
 IF target<>'draft' OR old.status IS DISTINCT FROM 'published' THEN
  UPDATE public.articles SET title=p_payload->>'title',content=p_payload->>'content',excerpt=p_payload->>'excerpt',cover_image=p_payload->>'cover_image',
   category=coalesce(nullif(p_payload->>'category',''),'Câu chuyện EMORIA'),author_name=coalesce(nullif(p_payload->>'author_name',''),'EMORIA'),
   tags=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'tags','[]'))),related_product_ids=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'related_product_ids','[]'))),
   seo_title=p_payload->>'seo_title',seo_description=p_payload->>'seo_description',
   allow_comments=coalesce((p_payload->>'allow_comments')::boolean,true),status=target,updated_at=now(),
   published_at=CASE WHEN target='published' THEN coalesce(published_at,now()) ELSE published_at END WHERE id=aid;
 END IF;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),aid::text,'article.save',jsonb_build_object('status',target));
 RETURN jsonb_build_object('success',true,'article_id',aid,'status',target);
END $$;

CREATE FUNCTION public.rpc_article_admin_data() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE arts jsonb; comments jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 SELECT coalesce(jsonb_agg((to_jsonb(a)||coalesce(d.payload,'{}'))||jsonb_build_object('id',a.id,'status',a.status) ORDER BY a.updated_at DESC),'[]') INTO arts FROM public.articles a LEFT JOIN public.article_drafts d ON d.article_id=a.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'article_title',a.title,'content',c.content,'status',c.status,'created_at',c.created_at,'author_name',coalesce(p.full_name,'Thành viên'),'report_count',(SELECT count(*) FROM public.comment_reports r WHERE r.comment_id=c.id)) ORDER BY c.created_at),'[]') INTO comments FROM public.article_comments c JOIN public.articles a ON a.id=c.article_id LEFT JOIN public.profiles p ON p.id=c.user_id WHERE c.status<>'deleted';
 RETURN jsonb_build_object('success',true,'articles',arts,'comments',comments);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_get_article_detail(p_slug text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE art public.articles; comments jsonb;
BEGIN
 SELECT * INTO art FROM public.articles WHERE slug=lower(trim(p_slug)) AND status='published';
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Bài viết không khả dụng.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'parent_id',c.parent_id,'content',c.content,'status',c.status,'created_at',to_char(c.created_at,'DD/MM/YYYY HH24:MI'),'author_name',coalesce(p.full_name,'Thành viên'),'is_mine',coalesce(c.user_id=auth.uid(),false)) ORDER BY c.created_at),'[]') INTO comments
 FROM public.article_comments c LEFT JOIN public.profiles p ON p.id=c.user_id
 WHERE c.article_id=art.id AND (c.status='approved' OR (c.user_id=auth.uid() AND c.status='pending'))
 AND (c.parent_id IS NULL OR EXISTS(SELECT 1 FROM public.article_comments parent WHERE parent.id=c.parent_id AND parent.article_id=art.id AND parent.status='approved'));
 RETURN jsonb_build_object('success',true,'article',(to_jsonb(art)-'author_id')||jsonb_build_object('is_liked',EXISTS(SELECT 1 FROM public.article_likes WHERE article_id=art.id AND user_id=auth.uid()),'is_bookmarked',EXISTS(SELECT 1 FROM public.article_bookmarks WHERE article_id=art.id AND user_id=auth.uid())),'comments',comments);
END $$;

CREATE FUNCTION public.rpc_set_article_reaction(p_article_id uuid,p_kind text,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập để tương tác.'; END IF;
 PERFORM 1 FROM public.articles WHERE id=p_article_id AND status='published' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bài viết không khả dụng.'; END IF;
 IF p_enabled IS NULL OR p_kind IS NULL OR p_kind NOT IN ('like','bookmark') THEN RAISE EXCEPTION 'Tương tác không hợp lệ.'; END IF;
 IF p_kind='like' THEN
  IF p_enabled THEN INSERT INTO public.article_likes(article_id,user_id) VALUES(p_article_id,auth.uid()) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.article_likes WHERE article_id=p_article_id AND user_id=auth.uid(); END IF;
  SELECT count(*) INTO n FROM public.article_likes WHERE article_id=p_article_id;
  UPDATE public.articles SET likes_count=n WHERE id=p_article_id;
 ELSE
  IF p_enabled THEN INSERT INTO public.article_bookmarks(article_id,user_id) VALUES(p_article_id,auth.uid()) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.article_bookmarks WHERE article_id=p_article_id AND user_id=auth.uid(); END IF;
 END IF;
 RETURN jsonb_build_object('success',true,'is_liked',p_enabled,'is_bookmarked',p_enabled,'likes_count',n);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_add_article_comment(p_article_id uuid,p_content text,p_parent_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập để bình luận.'; END IF;
 PERFORM 1 FROM public.articles WHERE id=p_article_id AND status='published' AND allow_comments FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bài viết không nhận bình luận.'; END IF;
 IF p_content IS NULL OR length(trim(p_content)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Bình luận cần từ 1 đến 2000 ký tự.'; END IF;
 IF p_parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.article_comments WHERE id=p_parent_id AND article_id=p_article_id AND parent_id IS NULL AND status='approved') THEN RAISE EXCEPTION 'Chỉ được trả lời bình luận gốc đã duyệt của bài này.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,12));
 IF EXISTS(SELECT 1 FROM public.article_comments WHERE user_id=auth.uid() AND created_at>now()-interval '15 seconds') THEN RAISE EXCEPTION 'Vui lòng đợi 15 giây trước khi bình luận tiếp.'; END IF;
 INSERT INTO public.article_comments(article_id,user_id,parent_id,content,status) VALUES(p_article_id,auth.uid(),p_parent_id,trim(p_content),'pending') RETURNING id INTO cid;
 RETURN jsonb_build_object('success',true,'comment_id',cid,'status','pending','message','Bình luận đã lưu và đang chờ duyệt.');
END $$;

CREATE FUNCTION public.rpc_edit_article_comment(p_comment_id uuid,p_content text,p_delete boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập.'; END IF;
 IF NOT p_delete AND (p_content IS NULL OR length(trim(p_content)) NOT BETWEEN 1 AND 2000) THEN RAISE EXCEPTION 'Bình luận cần từ 1 đến 2000 ký tự.'; END IF;
 UPDATE public.article_comments c SET content=CASE WHEN p_delete THEN '' ELSE trim(p_content) END,status=CASE WHEN p_delete THEN 'deleted' ELSE 'pending' END,updated_at=now()
 WHERE c.id=p_comment_id AND c.user_id=auth.uid() AND c.status IN ('approved','pending') AND EXISTS(SELECT 1 FROM public.articles a WHERE a.id=c.article_id AND a.status='published' AND a.allow_comments);
 IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền sửa bình luận này.'; END IF;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.rpc_report_comment(p_comment_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Đăng nhập và nhập lý do (tối đa 500 ký tự).'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.article_comments c JOIN public.articles a ON a.id=c.article_id WHERE c.id=p_comment_id AND c.status='approved' AND a.status='published') THEN RAISE EXCEPTION 'Bình luận không khả dụng.'; END IF;
 INSERT INTO public.comment_reports(comment_id,reporter_id,reason) VALUES(p_comment_id,auth.uid(),trim(p_reason)) ON CONFLICT(comment_id,reporter_id) DO NOTHING;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.rpc_saved_articles() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE arts jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Vui lòng đăng nhập để xem bài đã lưu.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'excerpt',a.excerpt,'cover_image',a.cover_image,'category',a.category,'author_name',a.author_name,'published_at',a.published_at,'likes_count',a.likes_count,'view_count',a.view_count) ORDER BY b.created_at DESC),'[]') INTO arts FROM public.article_bookmarks b JOIN public.articles a ON a.id=b.article_id WHERE b.user_id=auth.uid() AND a.status='published';
 RETURN jsonb_build_object('success',true,'articles',arts,'total',jsonb_array_length(arts));
END $$;
CREATE OR REPLACE FUNCTION public.rpc_moderate_article_comment(p_comment_id uuid,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('approved','hidden','deleted') THEN RAISE EXCEPTION 'Trạng thái không hợp lệ.'; END IF;
 UPDATE public.article_comments SET status=p_status,updated_at=now() WHERE id=p_comment_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bình luận.'; END IF;
 INSERT INTO public.operation_audit(actor_id,resource_id,action,detail) VALUES(auth.uid(),p_comment_id::text,'comment.moderate',jsonb_build_object('status',p_status));
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_article_admin_data(),public.rpc_set_article_reaction(uuid,text,boolean),public.rpc_edit_article_comment(uuid,text,boolean),public.rpc_report_comment(uuid,text),public.rpc_saved_articles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_article_admin_data(),public.rpc_set_article_reaction(uuid,text,boolean),public.rpc_edit_article_comment(uuid,text,boolean),public.rpc_report_comment(uuid,text),public.rpc_saved_articles() TO authenticated;
COMMIT;
