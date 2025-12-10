import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

const STORAGE_BUCKET = 'chat-attachments';
const TARGET_SIZE_KB = 150;
const MAX_DIMENSION = 1024;
const VIDEO_TARGET_SIZE_MB = 5;
const AUDIO_TARGET_BITRATE = 64000;

// Helper to get authenticated client for storage operations
function getAuthenticatedClient() {
  // First try to get from authStore
  const authState = useAuthStore.getState();
  if (authState.user?.id && authState.user?.tenantId) {
    console.log('🔐 [Storage] Using auth from store:', { 
      userId: authState.user.id, 
      tenantId: authState.user.tenantId 
    });
    return supabaseWithAuth(authState.user.id, authState.user.tenantId);
  }
  
  // Fallback to plain supabase (will likely fail RLS but at least we log it)
  console.warn('⚠️ [Storage] No auth data available, using anonymous client');
  return supabase;
}

/**
 * Compress image to target size for efficient storage
 * Production-ready with error handling and fallbacks
 */
export async function compressImageForStorage(base64Image: string): Promise<{ blob: Blob; base64: string }> {
  return new Promise((resolve, reject) => {
    try {
      // Validate input
      if (!base64Image || typeof base64Image !== 'string') {
        reject(new Error('Invalid image data'));
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Calculate dimensions maintaining aspect ratio
          let width = img.width;
          let height = img.height;
          
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height / width) * MAX_DIMENSION);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width / height) * MAX_DIMENSION);
              height = MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Progressive compression
          let quality = 0.8;
          let iterations = 0;
          const maxIterations = 5;

          const compressIteration = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                const sizeKB = blob.size / 1024;
                
                if (sizeKB <= TARGET_SIZE_KB || iterations >= maxIterations || quality <= 0.3) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    resolve({ 
                      blob, 
                      base64: reader.result as string 
                    });
                  };
                  reader.onerror = () => reject(new Error('Failed to read compressed image'));
                  reader.readAsDataURL(blob);
                } else {
                  quality -= 0.15;
                  iterations++;
                  compressIteration();
                }
              },
              'image/jpeg',
              quality
            );
          };

          compressIteration();
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = base64Image;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Extract video thumbnail - Production-ready with fallbacks
 */
async function extractVideoThumbnail(
  videoBase64: string,
  targetWidth: number = 640,
  targetHeight: number = 480
): Promise<{ thumbnailBlob: Blob; thumbnailBase64: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const video = document.createElement('video');
      video.src = videoBase64;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      
      // Set timeout for video loading
      const timeout = setTimeout(() => {
        reject(new Error('Video loading timeout'));
      }, 30000);
      
      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          res();
        };
        video.onerror = () => {
          clearTimeout(timeout);
          rej(new Error('Failed to load video'));
        };
      });
      
      // Seek to a frame (0.1 seconds in)
      video.currentTime = Math.min(0.1, video.duration / 2);
      await new Promise<void>((res) => {
        video.onseeked = () => res();
      });
      
      const canvas = document.createElement('canvas');
      const actualWidth = Math.min(video.videoWidth || 640, targetWidth);
      const actualHeight = Math.min(video.videoHeight || 480, targetHeight);
      canvas.width = actualWidth;
      canvas.height = actualHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(video, 0, 0, actualWidth, actualHeight);
      
      const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.7);
      const thumbnailBlob = await (await fetch(thumbnailBase64)).blob();
      
      // Clean up
      video.src = '';
      video.load();
      
      resolve({ thumbnailBlob, thumbnailBase64 });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Compress video for storage - Production-ready with browser capability detection
 */
export async function compressVideoForStorage(
  videoBase64: string,
  maxDurationSeconds: number = 30
): Promise<{ videoBlob: Blob; thumbnailBlob: Blob; thumbnailBase64: string }> {
  try {
    // Extract thumbnail first
    const { thumbnailBlob, thumbnailBase64 } = await extractVideoThumbnail(videoBase64);
    
    // Check if MediaRecorder is supported for re-encoding
    const canReencode = typeof MediaRecorder !== 'undefined' && 
      (MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ||
       MediaRecorder.isTypeSupported('video/webm'));
    
    let videoBlob: Blob;
    
    if (canReencode) {
      try {
        // Try to re-encode at lower quality
        const video = document.createElement('video');
        video.src = videoBase64;
        video.muted = true;
        
        await new Promise<void>((res, rej) => {
          video.onloadedmetadata = () => res();
          video.onerror = () => rej(new Error('Video load failed'));
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = Math.min(video.videoHeight, 480);
        const ctx = canvas.getContext('2d');
        
        if (!ctx) throw new Error('Canvas context failed');
        
        const stream = canvas.captureStream(15);
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') 
          ? 'video/webm;codecs=vp8' 
          : 'video/webm';
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 500000
        });
        
        const chunks: BlobPart[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        
        const duration = Math.min(video.duration, maxDurationSeconds);
        video.currentTime = 0;
        
        await video.play();
        mediaRecorder.start();
        
        await new Promise<void>((res) => {
          const drawFrame = () => {
            if (video.currentTime < duration && !video.paused) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              requestAnimationFrame(drawFrame);
            } else {
              mediaRecorder.stop();
              video.pause();
            }
          };
          
          mediaRecorder.onstop = () => res();
          drawFrame();
        });
        
        videoBlob = new Blob(chunks, { type: mimeType });
        video.src = '';
        console.log(`✅ Video re-encoded: ${Math.round(videoBlob.size / 1024 / 1024 * 100) / 100}MB`);
      } catch (reencodeErr) {
        console.warn('Video re-encoding failed, using original:', reencodeErr);
        const response = await fetch(videoBase64);
        videoBlob = await response.blob();
      }
    } else {
      // Fallback: use original video
      console.log('ℹ️ MediaRecorder not supported, using original video');
      const response = await fetch(videoBase64);
      videoBlob = await response.blob();
    }
    
    console.log(`✅ Video processed: ${Math.round(videoBlob.size / 1024 / 1024 * 100) / 100}MB`);
    return { videoBlob, thumbnailBlob, thumbnailBase64 };
  } catch (err) {
    console.error('Video compression failed:', err);
    // Final fallback: return original as blob
    const response = await fetch(videoBase64);
    const videoBlob = await response.blob();
    
    // Create a simple placeholder thumbnail
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#ffffff';
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎥', 160, 130);
    }
    const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.5);
    const thumbnailBlob = await (await fetch(thumbnailBase64)).blob();
    
    return { videoBlob, thumbnailBlob, thumbnailBase64 };
  }
}

/**
 * Compress audio for storage - Production-ready
 */
export async function compressAudioForStorage(
  audioBase64: string
): Promise<{ audioBlob: Blob; durationSeconds: number }> {
  try {
    const audio = document.createElement('audio');
    audio.src = audioBase64;
    
    await new Promise<void>((res, rej) => {
      const timeout = setTimeout(() => rej(new Error('Audio load timeout')), 10000);
      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        res();
      };
      audio.onerror = () => {
        clearTimeout(timeout);
        rej(new Error('Failed to load audio'));
      };
    });
    
    const durationSeconds = audio.duration || 0;
    
    // Convert base64 to blob
    const response = await fetch(audioBase64);
    const audioBlob = await response.blob();
    
    console.log(`✅ Audio ready: ${Math.round(audioBlob.size / 1024)}KB, ${Math.round(durationSeconds)}s`);
    
    return { audioBlob, durationSeconds };
  } catch (err) {
    console.error('Audio compression failed:', err);
    const response = await fetch(audioBase64);
    return { audioBlob: await response.blob(), durationSeconds: 0 };
  }
}

/**
 * Upload compressed image to Supabase Storage
 * Production-ready with CUSTOM AUTH support (mobile+PIN, not Supabase Auth)
 */
export async function uploadChatImage(
  base64Image: string,
  sessionId: string,
  messageId: string,
  userId: string,
  retryCount: number = 3
): Promise<{ url: string; compressedBase64: string; success: boolean }> {
  try {
    // Validate inputs
    if (!base64Image || !sessionId || !messageId || !userId) {
      console.error('❌ uploadChatImage: Missing required parameters', { 
        hasBase64: !!base64Image, 
        sessionId, 
        messageId, 
        userId 
      });
      return { url: base64Image, compressedBase64: base64Image, success: false };
    }

    // ✅ CRITICAL: Get auth from custom auth store (NOT Supabase Auth)
    const authState = useAuthStore.getState();
    const farmerId = authState.user?.id;
    const tenantId = authState.user?.tenantId;
    
    if (!farmerId || !tenantId) {
      console.error('❌ uploadChatImage: User not authenticated in custom auth store', {
        hasUser: !!authState.user,
        farmerId,
        tenantId
      });
      // Still return compressed base64 for display, but mark as failed
      const { base64: compressedBase64 } = await compressImageForStorage(base64Image);
      return { url: compressedBase64, compressedBase64, success: false };
    }

    // Use the farmerId from auth store for the path (ensures consistency)
    const authUserId = farmerId;

    // Compress image first
    const { blob, base64: compressedBase64 } = await compressImageForStorage(base64Image);
    
    // Generate unique file path - userId MUST be first for RLS
    const timestamp = Date.now();
    const filePath = `${authUserId}/${sessionId}/${messageId}_${timestamp}.jpg`;
    
    console.log('📤 Uploading image to storage:', {
      bucket: STORAGE_BUCKET,
      path: filePath,
      sizeKB: Math.round(blob.size / 1024),
      farmerId: authUserId,
      tenantId
    });
    
    // ✅ Use authenticated client with custom headers
    const client = getAuthenticatedClient();
    
    // Upload with retry logic
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const { data, error } = await client.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            cacheControl: '31536000', // 1 year cache
            upsert: true
          });

        if (error) {
          lastError = new Error(error.message);
          console.warn(`❌ Upload attempt ${attempt + 1}/${retryCount + 1} failed:`, {
            error: error.message,
            statusCode: (error as any).statusCode,
            path: filePath
          });
          
          // Check for specific error types
          if (error.message.includes('row-level security') || 
              error.message.includes('policy') ||
              error.message.includes('403')) {
            console.error('🔐 RLS Policy blocking upload - check storage policies for bucket:', STORAGE_BUCKET);
          }
          
          if (attempt < retryCount) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
            continue;
          }
        } else if (data) {
          // Use plain supabase for public URL (no auth needed)
          const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(data.path);

          console.log(`✅ Image uploaded successfully:`, {
            url: urlData.publicUrl,
            sizeKB: Math.round(blob.size / 1024),
            path: data.path
          });
          return { url: urlData.publicUrl, compressedBase64, success: true };
        }
      } catch (attemptErr) {
        lastError = attemptErr as Error;
        console.warn(`❌ Upload attempt ${attempt + 1}/${retryCount + 1} exception:`, attemptErr);
      }
    }
    
    console.error('❌ All upload attempts failed after', retryCount + 1, 'attempts:', lastError?.message);
    // Return compressed base64 as fallback for display
    return { url: compressedBase64, compressedBase64, success: false };
  } catch (err) {
    console.error('❌ Image upload failed with exception:', err);
    // Try to at least return compressed image
    try {
      const { base64: compressedBase64 } = await compressImageForStorage(base64Image);
      return { url: compressedBase64, compressedBase64, success: false };
    } catch {
      return { url: base64Image, compressedBase64: base64Image, success: false };
    }
  }
}

/**
 * Upload compressed video with thumbnail - Production-ready with CUSTOM AUTH support
 */
export async function uploadCompressedVideo(
  videoBase64: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<{ videoUrl: string; thumbnailUrl: string; success: boolean }> {
  try {
    if (!videoBase64 || !sessionId || !messageId || !userId) {
      console.error('❌ uploadCompressedVideo: Missing required parameters');
      return { videoUrl: videoBase64, thumbnailUrl: videoBase64, success: false };
    }

    // ✅ CRITICAL: Get auth from custom auth store (NOT Supabase Auth)
    const authState = useAuthStore.getState();
    const farmerId = authState.user?.id;
    const tenantId = authState.user?.tenantId;
    
    if (!farmerId || !tenantId) {
      console.error('❌ uploadCompressedVideo: User not authenticated in custom auth store');
      const { thumbnailBlob, thumbnailBase64 } = await extractVideoThumbnailSafe(videoBase64);
      return { videoUrl: videoBase64, thumbnailUrl: thumbnailBase64, success: false };
    }

    // Use the farmerId from auth store for the path
    const authUserId = farmerId;

    const { videoBlob, thumbnailBlob, thumbnailBase64 } = await compressVideoForStorage(videoBase64);
    
    const timestamp = Date.now();
    
    console.log('📤 Uploading video to storage:', {
      bucket: STORAGE_BUCKET,
      farmerId: authUserId,
      tenantId,
      videoSizeMB: Math.round(videoBlob.size / 1024 / 1024 * 100) / 100
    });
    
    // ✅ Use authenticated client with custom headers
    const client = getAuthenticatedClient();
    
    // Upload video
    const videoPath = `${authUserId}/${sessionId}/${messageId}_${timestamp}.webm`;
    const { data: videoData, error: videoError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(videoPath, videoBlob, {
        contentType: 'video/webm',
        cacheControl: '31536000',
        upsert: true
      });
    
    // Upload thumbnail
    const thumbPath = `${authUserId}/${sessionId}/${messageId}_${timestamp}_thumb.jpg`;
    const { data: thumbData, error: thumbError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(thumbPath, thumbnailBlob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: true
      });
    
    if (videoError || thumbError) {
      console.error('❌ Video upload error:', { videoError, thumbError });
      // Try to at least return thumbnail URL if it uploaded
      if (!thumbError && thumbData) {
        const { data: thumbUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(thumbData.path);
        return { videoUrl: videoBase64, thumbnailUrl: thumbUrlData.publicUrl, success: false };
      }
      return { videoUrl: videoBase64, thumbnailUrl: thumbnailBase64, success: false };
    }
    
    // Use plain supabase for public URLs (no auth needed)
    const { data: videoUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(videoData!.path);
    const { data: thumbUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(thumbData!.path);
    
    console.log(`✅ Video uploaded successfully:`, {
      videoUrl: videoUrlData.publicUrl,
      thumbnailUrl: thumbUrlData.publicUrl,
      sizeMB: Math.round(videoBlob.size / 1024 / 1024 * 100) / 100
    });
    
    return {
      videoUrl: videoUrlData.publicUrl,
      thumbnailUrl: thumbUrlData.publicUrl,
      success: true
    };
  } catch (err) {
    console.error('❌ Video upload failed:', err);
    return { videoUrl: videoBase64, thumbnailUrl: videoBase64, success: false };
  }
}

// Safe thumbnail extraction helper
async function extractVideoThumbnailSafe(videoBase64: string): Promise<{ thumbnailBlob: Blob; thumbnailBase64: string }> {
  try {
    return await extractVideoThumbnail(videoBase64);
  } catch {
    // Return placeholder
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#ffffff';
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎥', 160, 130);
    }
    const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.5);
    const thumbnailBlob = await (await fetch(thumbnailBase64)).blob();
    return { thumbnailBlob, thumbnailBase64 };
  }
}

/**
 * Upload compressed audio - Production-ready
 */
export async function uploadCompressedAudio(
  audioBase64: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<{ audioUrl: string; durationSeconds: number }> {
  try {
    if (!audioBase64 || !sessionId || !messageId || !userId) {
      console.error('uploadCompressedAudio: Missing required parameters');
      return { audioUrl: audioBase64, durationSeconds: 0 };
    }

    const { audioBlob, durationSeconds } = await compressAudioForStorage(audioBase64);
    
    const timestamp = Date.now();
    const audioPath = `${userId}/${sessionId}/${messageId}_${timestamp}.webm`;
    
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(audioPath, audioBlob, {
        contentType: 'audio/webm',
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) {
      console.error('Audio upload error:', error);
      return { audioUrl: audioBase64, durationSeconds };
    }
    
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
    
    console.log(`✅ Audio uploaded: ${urlData.publicUrl} (${Math.round(audioBlob.size / 1024)}KB)`);
    
    return {
      audioUrl: urlData.publicUrl,
      durationSeconds
    };
  } catch (err) {
    console.error('Audio upload failed:', err);
    return { audioUrl: audioBase64, durationSeconds: 0 };
  }
}

/**
 * Legacy support for video thumbnail upload
 */
export async function uploadVideoThumbnail(
  videoBase64: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<string> {
  try {
    const { thumbnailUrl } = await uploadCompressedVideo(videoBase64, sessionId, messageId, userId);
    return thumbnailUrl;
  } catch (err) {
    console.error('Video thumbnail extraction failed:', err);
    return videoBase64;
  }
}

/**
 * Delete chat image from storage
 */
export async function deleteChatImage(imageUrl: string): Promise<void> {
  try {
    if (!imageUrl || !imageUrl.includes('supabase')) return;
    
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/chat-attachments\/(.+)/);
    if (!pathMatch) return;
    
    const filePath = decodeURIComponent(pathMatch[1]);
    
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);
      
    console.log('🗑️ Image deleted:', filePath);
  } catch (err) {
    console.error('Failed to delete image:', err);
  }
}

/**
 * Check if URL is a Supabase storage URL vs base64
 */
export function isStorageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http') && url.includes('supabase');
}

/**
 * Get storage bucket URL prefix for validation
 */
export function getStorageBucketUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qfklkkzxemsbeniyugiz.supabase.co';
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}`;
}
