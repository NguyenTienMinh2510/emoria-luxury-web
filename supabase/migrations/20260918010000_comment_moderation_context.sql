-- Keep existing admin authorization and grants; expose article context for moderation.
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_article_admin_data() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE arts jsonb; comments jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yêu cầu quyền quản trị.'; END IF;
 SELECT coalesce(jsonb_agg((to_jsonb(a)||coalesce(d.payload,'{}'))||jsonb_build_object('id',a.id,'status',a.status) ORDER BY a.updated_at DESC),'[]') INTO arts FROM public.articles a LEFT JOIN public.article_drafts d ON d.article_id=a.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'article_id',a.id,'article_title',a.title,'article_slug',a.slug,'article_status',a.status,'parent_id',c.parent_id,'content',c.content,'status',c.status,'created_at',c.created_at,'author_name',coalesce(p.full_name,'Thành viên'),'report_count',(SELECT count(*) FROM public.comment_reports r WHERE r.comment_id=c.id)) ORDER BY c.created_at),'[]') INTO comments FROM public.article_comments c JOIN public.articles a ON a.id=c.article_id LEFT JOIN public.profiles p ON p.id=c.user_id WHERE c.status<>'deleted';
 RETURN jsonb_build_object('success',true,'articles',arts,'comments',comments);
END $$;
COMMIT;
