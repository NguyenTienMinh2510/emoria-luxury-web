import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export const BUCKET_NAME = 'emoria-media';

const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/heic',
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
  'video/x-m4v',
];

/**
 * Validate file before uploading
 * @param {File} file 
 */
export const validateFile = (file) => {
  if (!file) {
    throw new Error('Vui lòng chọn tệp để tải lên.');
  }

  const isImage = file.type.startsWith('image/') || ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = file.type.startsWith('video/') || ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    throw new Error('Định dạng tệp không được hỗ trợ. Vui lòng tải ảnh (JPEG, PNG, WebP) hoặc video (MP4, WebM, MOV).');
  }

  if (isImage && file.size > MAX_IMAGE_SIZE) {
    throw new Error(`Kích thước ảnh vượt quá giới hạn 15MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    throw new Error(`Kích thước video vượt quá giới hạn 50MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
  }

  return { isImage, isVideo };
};

/**
 * Upload image or video to Supabase Storage bucket 'emoria-media'
 * @param {File} file 
 * @param {string} pathFolder - subfolder e.g. 'memories' | 'products' | 'avatars'
 * @returns {Promise<{ publicUrl: string, filePath: string, fileType: 'image' | 'video' }>}
 */
export async function uploadMedia(file, pathFolder = 'memories') {
  const { isImage, isVideo } = validateFile(file);

  // Clean filename and create unique path
  const sanitizedName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .toLowerCase();

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const filePath = `${pathFolder}/${timestamp}_${randomStr}_${sanitizedName}`;

  // If Supabase is not configured or in local demo mode, create local object URL with simulated delay
  if (!isSupabaseConfigured()) {
    console.warn('[Storage] Supabase chưa được cấu hình. Sử dụng URL cục bộ cho demo.');
    const objectUrl = URL.createObjectURL(file);
    return {
      publicUrl: objectUrl,
      filePath,
      fileType: isImage ? 'image' : 'video',
      isLocal: true,
    };
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('[Storage Upload Error]', error);
      // Fallback to local Object URL if bucket doesn't exist yet so user isn't blocked
      if (error.message && (error.message.includes('Bucket not found') || error.statusCode === '404')) {
        console.warn(`[Storage] Bucket '${BUCKET_NAME}' chưa được tạo trên Supabase. Dùng Local Preview URL.`);
        return {
          publicUrl: URL.createObjectURL(file),
          filePath,
          fileType: isImage ? 'image' : 'video',
          warning: `Bucket '${BUCKET_NAME}' chưa được khởi tạo trên Supabase Dashboard.`,
        };
      }
      throw new Error(`Tải file thất bại: ${error.message}`);
    }

    // Retrieve public URL from bucket
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path || filePath);

    return {
      publicUrl: urlData.publicUrl,
      filePath: data.path || filePath,
      fileType: isImage ? 'image' : 'video',
    };
  } catch (err) {
    console.error('[Storage Service Error]', err);
    throw err;
  }
}

/**
 * Get public URL for an existing file in 'emoria-media'
 * @param {string} filePath 
 */
export function getPublicUrl(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('http') || filePath.startsWith('blob:')) return filePath;

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return data?.publicUrl || '';
}

/**
 * Delete a media file from 'emoria-media'
 * @param {string} filePath 
 */
export async function deleteMedia(filePath) {
  if (!filePath || !isSupabaseConfigured()) return { success: true };

  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[Delete Media Error]', err);
    return { success: false, error: err.message };
  }
}
