import {apiRequest} from './apiClient.js';
const id=encodeURIComponent;
async function request(path,method='GET',body){try{return await apiRequest(path,{method,body});}catch(e){return {success:false,message:e.message};}}
export const getPublishedArticles=({category=null,search=null,limit=12,offset=0}={})=>request('/articles?'+new URLSearchParams({...(category?{category}:{}),...(search?{search}:{}),limit,offset}));
export const getArticleDetail=slug=>request('/articles/'+id(slug));
export const toggleArticleLike=(article,enabled)=>request('/articles/'+id(article)+'/reactions/like','PUT',{enabled});
export const toggleArticleBookmark=(article,enabled)=>request('/articles/'+id(article)+'/reactions/bookmark','PUT',{enabled});
export const addArticleComment=({articleId,content,parentId=null})=>request('/articles/'+id(articleId)+'/comments','POST',{content,parentId});
export const moderateArticleComment=(comment,status)=>request('/admin/comments/'+id(comment)+'/status','PATCH',{status});
export const saveArticleAdmin=({articleId=null,payload})=>request('/admin/articles'+(articleId?'/'+id(articleId):''),articleId?'PUT':'POST',payload);
export const deleteArticleAdmin=articleId=>request('/admin/articles/'+id(articleId),'DELETE');
export const getArticleAdminData=()=>request('/admin/articles');
export const getSavedArticles=()=>request('/me/saved-articles');
export const editArticleComment=(comment,content,remove=false)=>request('/comments/'+id(comment),remove?'DELETE':'PATCH',{content});
export const reportArticleComment=(comment,reason)=>request('/comments/'+id(comment)+'/reports','POST',{reason});
export const DEMO_ARTICLES=[];
export const DEMO_COMMENTS={};
