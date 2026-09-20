import {supabase} from '../lib/supabaseClient.js';
import {apiRequest} from './apiClient.js';
export async function moderateUploadedVideo(tag,path,consent) {
  const result=await apiRequest(`/memories/${encodeURIComponent(tag)}/video-labels/analyze`,{method:'POST',body:{path,consent},timeoutMs:175000});
  if(result.approved!==true)throw new Error(result.reason||'Video chưa đạt kiểm duyệt và không được gắn vào kỷ vật.');
  return result;
}
export async function uploadModeratedVideo(tag,file,consent) {
  if(!consent)throw new Error('Bạn cần đồng ý kiểm duyệt video bằng Google trước khi tải lên.');
  if(!['video/mp4','video/webm'].includes(file?.type)||!file.size||file.size>50*1024*1024)throw new Error('Video MP4/WebM tối đa 50 MB.');
  const path=`${tag}/${crypto.randomUUID()}`;
  const {error}=await supabase.storage.from('emoria-memory').upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  await moderateUploadedVideo(tag,path,true);
  return path;
}
