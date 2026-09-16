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
  | 'social-posts'
  | 'ndvi-thumbnails';

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

export const uploadFile = async ({ bucket, filePath, file }: UploadOptions): Promise<{ url: string; path: string }> => {
  try {
    const { data, error } = await supabase.storage.from(bucket).upload(filePath, file, {
      cacheControl: '3600', upsert: false,
    });
    if (error) throw error;
    if (bucket === 'avatars' || bucket === 'social-posts') {
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
      return { url: urlData.publicUrl, path: data.path };
    }
    return { url: '', path: data.path };
  } catch (error: any) {
    console.error('Upload error:', error);
    throw new Error(error.message || 'Failed to upload file');
  }
};

export const downloadFile = async (bucket: StorageBucket, filePath: string): Promise<Blob> => {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error) throw error;
  return data;
};

export const getSignedUrl = async (
  bucket: StorageBucket,
  filePath: string,
  expiresIn: number = 3600,
): Promise<string> => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
};

export const deleteFile = async (bucket: StorageBucket, filePath: string): Promise<void> => {
  const { error } = await supabase.storage.from(bucket).remove([filePath]);
  if (error) throw error;
};

export const deleteFiles = async (bucket: StorageBucket, filePaths: string[]): Promise<void> => {
  const { error } = await supabase.storage.from(bucket).remove(filePaths);
  if (error) throw error;
};

export const listFiles = async (bucket: StorageBucket, folderPath: string = ''): Promise<any[]> => {
  const { data, error } = await supabase.storage.from(bucket).list(folderPath, {
    limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  return data;
};

export const getUserStorageUsage = async (userId: string): Promise<StorageUsage[]> => {
  const { data, error } = await supabase.rpc('get_user_storage_usage', { user_id: userId });
  if (error) throw error;
  return data || [];
};

export const getPublicUrl = (bucket: StorageBucket, filePath: string): string => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
};

export const validateFile = (
  file: File,
  bucket: StorageBucket,
): { valid: boolean; error?: string } => {
  const maxSizes: Record<StorageBucket, number> = {
    avatars: 5 * 1024 * 1024,
    'land-images': 10 * 1024 * 1024,
    'chat-attachments': 20 * 1024 * 1024,
    'soil-reports': 10 * 1024 * 1024,
    'social-posts': 15 * 1024 * 1024,
    'ndvi-thumbnails': 10 * 1024 * 1024,
  };
  const allowedTypes: Record<StorageBucket, string[]> = {
    avatars: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    'land-images': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'],
    'chat-attachments': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'image/heic'],
    'soil-reports': ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    'social-posts': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
    'ndvi-thumbnails': ['image/png'],
  };
  if (file.size > maxSizes[bucket]) return { valid: false, error: `File size exceeds ${(maxSizes[bucket] / 1024 / 1024).toFixed(0)}MB limit` };
  if (!allowedTypes[bucket].includes(file.type)) return { valid: false, error: `File type ${file.type} is not allowed for this bucket` };
  return { valid: true };
};

export const generateFilePath = (userId: string, fileName: string, folder?: string): string => {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
  return folder ? `${userId}/${folder}/${uniqueFileName}` : `${userId}/${uniqueFileName}`;
};

export const uploadAvatar = async (userId: string, file: File): Promise<string> => {
  const validation = validateFile(file, 'avatars');
  if (!validation.valid) throw new Error(validation.error);
  const filePath = generateFilePath(userId, file.name);
  const { url } = await uploadFile({ bucket: 'avatars', filePath, file });
  return url;
};

export const uploadLandImage = async (userId: string, landId: string, file: File): Promise<string> => {
  const validation = validateFile(file, 'land-images');
  if (!validation.valid) throw new Error(validation.error);
  const filePath = generateFilePath(userId, file.name, `land_${landId}`);
  const { path } = await uploadFile({ bucket: 'land-images', filePath, file });
  return path;
};

export const uploadChatAttachment = async (userId: string, file: File): Promise<string> => {
  const validation = validateFile(file, 'chat-attachments');
  if (!validation.valid) throw new Error(validation.error);
  const filePath = generateFilePath(userId, file.name, 'chat');
  const { path } = await uploadFile({ bucket: 'chat-attachments', filePath, file });
  return path;
};
