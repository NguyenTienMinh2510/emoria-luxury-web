import {supabase} from '../lib/supabaseClient.js';
import {apiRequest} from './apiClient.js';
import {estimateMediaSeconds, mediaProgress, recordMediaTiming} from './mediaUploadProgress.js';

export async function moderateUploadedMedia(tag,path,consent,onProgress=()=>{},file={type:/\.(jpg|jpeg|png|webp)$/i.test(path)?'image/jpeg':'video/mp4'}) {
  if(!consent)throw new Error('Bạn cần đồng ý kiểm duyệt bằng AI trước khi tải lên.');
  onProgress(mediaProgress(file,'reviewing',estimateMediaSeconds(file,'reviewing')));
  const startedAt=Date.now();
  const result=await apiRequest(`/memories/${encodeURIComponent(tag)}/video-labels/analyze`,{
    method:'POST',
    body:{path,consent,include_labels:true},
    timeoutMs:175000
  });
  recordMediaTiming(file,'reviewing',(Date.now()-startedAt)/1000);
  if(result.approved!==true)throw Object.assign(new Error(result.reason||'Phương tiện chưa đạt kiểm duyệt và không được gắn vào kỷ vật.'),{code:'MEDIA_REJECTED'});
  return result;
}

export const moderateUploadedVideo = moderateUploadedMedia;

export async function uploadModeratedMedia(tag,file,consent,role='intro',onProgress=()=>{}) {
  if(!consent)throw new Error('Bạn cần đồng ý kiểm duyệt bằng AI trước khi tải lên.');
  const allowed=['video/mp4','video/webm','image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file?.type)||!file?.size||file.size>50*1024*1024){
    throw new Error('Chọn ảnh JPEG/PNG/WebP hoặc video MP4/WebM, dung lượng tối đa 50 MB.');
  }
  const extMap={'video/mp4':'mp4','video/webm':'webm','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const ext=extMap[file.type]||(file.type.startsWith('image/')?'jpg':'mp4');
  const prefix=role==='intro'?'intro-':'gallery-';
  const path=`${tag}/${prefix}${crypto.randomUUID()}.${ext}`;
  onProgress(mediaProgress(file,'uploading'));
  const startedAt=Date.now();
  const {error}=await supabase.storage.from('emoria-memory').upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  recordMediaTiming(file,'uploading',(Date.now()-startedAt)/1000);
  let mod;
  try { mod=await moderateUploadedMedia(tag,path,true,onProgress,file); }
  catch(error) {
    // Keep the uploaded file available for review retries without replacing the approved intro.
    if(error.code!=='MEDIA_REJECTED')error.uploadedPath=path;
    throw error;
  }
  return {path,labels:mod.labels||[],approved:mod.approved};
}

export async function uploadModeratedVideo(tag,file,consent) {
  const res=await uploadModeratedMedia(tag,file,consent,'intro');
  return res.path;
}

export async function fetchMediaUploads(tag) {
  return apiRequest(`/memories/${encodeURIComponent(tag)}/video-uploads?include_labels=1`);
}
