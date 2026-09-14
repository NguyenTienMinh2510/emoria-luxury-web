import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
async function rpc(name, args={}) {
 if(!isSupabaseConfigured())return {success:false,message:'Chưa kết nối máy chủ bài viết.'};
 try{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data || {success:false,message:'Máy chủ chưa trả dữ liệu.'};}
 catch(error){return {success:false,message:error.message || 'Không thể kết nối. Vui lòng thử lại.'};}
}
export const getPublishedArticles=({category=null,search=null,limit=12,offset=0}={})=>rpc('rpc_get_published_articles',{p_category:category,p_search:search,p_limit:limit,p_offset:offset});
export const getArticleDetail=slug=>rpc('rpc_get_article_detail',{p_slug:slug});
export const toggleArticleLike=(id,enabled)=>rpc('rpc_set_article_reaction',{p_article_id:id,p_kind:'like',p_enabled:enabled});
export const toggleArticleBookmark=(id,enabled)=>rpc('rpc_set_article_reaction',{p_article_id:id,p_kind:'bookmark',p_enabled:enabled});
export const addArticleComment=({articleId,content,parentId=null})=>rpc('rpc_add_article_comment',{p_article_id:articleId,p_content:content,p_parent_id:parentId});
export const moderateArticleComment=(id,status)=>rpc('rpc_moderate_article_comment',{p_comment_id:id,p_status:status});
export const saveArticleAdmin=({articleId=null,payload})=>rpc('rpc_save_article_admin',{p_article_id:articleId,p_payload:payload});
export const getArticleAdminData=()=>rpc('rpc_article_admin_data');
export const getSavedArticles=()=>rpc('rpc_saved_articles');
export const editArticleComment=(id,content,remove=false)=>rpc('rpc_edit_article_comment',{p_comment_id:id,p_content:content,p_delete:remove});
export const reportArticleComment=(id,reason)=>rpc('rpc_report_comment',{p_comment_id:id,p_reason:reason});
export const DEMO_ARTICLES=[];
export const DEMO_COMMENTS={};
