/**
 * Storage Service - Handles file uploads and downloads
 * Provides utilities for working with Supabase Storage buckets
 */

import { supabase } from '@/integrations/supabase/client';

export type StorageBucket = 
  | 'avatars'
  | 'land-images'
  | 'chat-attachments'
  | 'soil-reports'
  | 'social-posts';

interface UploadOptions {
  bucket: StorageBucket;
  filePath: string;
  file: File;
  onProgress?: (progress: number) => void;
}

interface StorageUsage {
  bucket_name: string;
  file_count: number;
  total_size_bytes: number;
  total_size_mb: number;
}

/**
 * Upload a file to a storage bucket
 */
export const uploadFile = async ({
  bucket,
  filePath,
  file,
  onProgress,
}: UploadOptions): Promise<{ url: string; path: string }> => {
  try {
    // Upload the file
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // Get public URL for public buckets
    if (bucket === 'avatars' || bucket === 'social-posts') {
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      return {
        url: urlData.publicUrl,
        path: data.path,
      };
    }

    // For private buckets, return path only
    return {
      url: '',
      path: data.path,
    };
  } catch (error: any) {
    console.error('Upload error:', error);
    throw new Error(error.message || 'Failed to upload file');
  }
};

/**
 * Download a file from storage (for private buckets)
 */
export const downloadFile = async (
  bucket: StorageBucket,
  filePath: string
): Promise<Blob> => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(filePath);

  if (error) throw error;
  return data;
};

/**
 * Get a signed URL for temporary access to private files
 */
export const getSignedUrl = async (
  bucket: StorageBucket,
  filePath: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw error;
  return data.signedUrl;
};

/**
 * Delete a file from storage
 */
export const deleteFile = async (
  bucket: StorageBucket,
  filePath: string
): Promise<void> => {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([filePath]);

  if (error) throw error;
};

/**
 * Delete multiple files from storage
 */
export const deleteFiles = async (
  bucket: StorageBucket,
  filePaths: string[]
): Promise<void> => {
  const { error } = await supabase.storage
    .from(bucket)
    .remove(filePaths);

  if (error) throw error;
};

/**
 * List files in a bucket folder
 */
export const listFiles = async (
  bucket: StorageBucket,
  folderPath: string = ''
): Promise<any[]> => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folderPath, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) throw error;
  return data;
};

/**
 * Get user's storage usage statistics
 */
export const getUserStorageUsage = async (
  userId: string
): Promise<StorageUsage[]> => {
  const { data, error } = await supabase.rpc('get_user_storage_usage', {
    user_id: userId,
  });

  if (error) throw error;
  return data || [];
};

/**
 * Get public URL for a file in a public bucket
 */
export const getPublicUrl = (
  bucket: StorageBucket,
  filePath: string
): string => {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return data.publicUrl;
};

/**
 * Validate file before upload
 */
export const validateFile = (
  file: File,
  bucket: StorageBucket
): { valid: boolean; error?: string } => {
  const maxSizes: Record<StorageBucket, number> = {
    'avatars': 5 * 1024 * 1024, // 5MB
    'land-images': 10 * 1024 * 1024, // 10MB
    'chat-attachments': 20 * 1024 * 1024, // 20MB
    'soil-reports': 10 * 1024 * 1024, // 10MB
    'social-posts': 15 * 1024 * 1024, // 15MB
  };

  const allowedTypes: Record<StorageBucket, string[]> = {
    'avatars': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    'land-images': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'],
    'chat-attachments': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'image/heic'],
    'soil-reports': ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    'social-posts': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
  };

  // Check file size
  if (file.size > maxSizes[bucket]) {
    return {
      valid: false,
      error: `File size exceeds ${(maxSizes[bucket] / 1024 / 1024).toFixed(0)}MB limit`,
    };
  }

  // Check file type
  if (!allowedTypes[bucket].includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed for this bucket`,
    };
  }

  return { valid: true };
};

/**
 * Generate a unique file path for upload
 */
export const generateFilePath = (
  userId: string,
  fileName: string,
  folder?: string
): string => {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
  
  if (folder) {
    return `${userId}/${folder}/${uniqueFileName}`;
  }
  
  return `${userId}/${uniqueFileName}`;
};

/**
 * Upload avatar image for user
 */
export const uploadAvatar = async (
  userId: string,
  file: File
): Promise<string> => {
  const validation = validateFile(file, 'avatars');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const filePath = generateFilePath(userId, file.name);
  const { url } = await uploadFile({
    bucket: 'avatars',
    filePath,
    file,
  });

  return url;
};

/**
 * Upload land image
 */
export const uploadLandImage = async (
  userId: string,
  landId: string,
  file: File
): Promise<string> => {
  const validation = validateFile(file, 'land-images');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const filePath = generateFilePath(userId, file.name, `land_${landId}`);
  const { path } = await uploadFile({
    bucket: 'land-images',
    filePath,
    file,
  });

  return path;
};

/**
 * Upload chat attachment
 */
export const uploadChatAttachment = async (
  userId: string,
  file: File
): Promise<string> => {
  const validation = validateFile(file, 'chat-attachments');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const filePath = generateFilePath(userId, file.name, 'chat');
  const { path } = await uploadFile({
    bucket: 'chat-attachments',
    filePath,
    file,
  });

  return path;
};
