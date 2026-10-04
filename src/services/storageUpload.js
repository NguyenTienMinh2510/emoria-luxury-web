import {apiRequest} from './apiClient.js';
import {supabase} from '../lib/supabaseClient.js';

// Every private Storage insert consumes an atomic, expiring reservation first.
export async function uploadReservedMedia(bucket,path,file) {
  await apiRequest('/storage/uploads/reserve',{method:'POST',body:{bucket,path,bytes:file.size,mime:file.type}});
  try {
    const result=await supabase.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
    if(result.error)throw result.error;
    return result;
  }catch(error){
    try{await apiRequest('/storage/uploads/cancel',{method:'POST',body:{bucket,path},timeoutMs:5000});}catch{/* Reservation expires if disconnected. */}
    throw error;
  }
}
