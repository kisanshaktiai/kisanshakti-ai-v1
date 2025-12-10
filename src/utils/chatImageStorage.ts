import { supabase } from '@/integrations/supabase/client';

const STORAGE_BUCKET = 'chat-attachments';
const TARGET_SIZE_KB = 150;
const MAX_DIMENSION = 1024;

/**
 * Compress image to target size for efficient storage
 */
export async function compressImageForStorage(base64Image: string): Promise<{ blob: Blob; base64: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
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
          height = (height / width) * MAX_DIMENSION;
          width = MAX_DIMENSION;
        } else {
          width = (width / height) * MAX_DIMENSION;
          height = MAX_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Start with quality 0.8 and reduce if needed
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
              // Convert blob back to base64 for local display
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
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64Image;
  });
}

/**
 * Upload compressed image to Supabase Storage
 * Returns public URL for the uploaded image
 */
export async function uploadChatImage(
  base64Image: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<{ url: string; compressedBase64: string }> {
  try {
    // Compress image first
    const { blob, base64: compressedBase64 } = await compressImageForStorage(base64Image);
    
    // Generate unique file path
    const timestamp = Date.now();
    const filePath = `${userId}/${sessionId}/${messageId}_${timestamp}.jpg`;
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Storage upload error:', error);
      // Return compressed base64 as fallback if upload fails
      return { url: compressedBase64, compressedBase64 };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path);

    console.log(`✅ Image uploaded: ${urlData.publicUrl} (${Math.round(blob.size / 1024)}KB)`);
    
    return { 
      url: urlData.publicUrl, 
      compressedBase64 
    };
  } catch (err) {
    console.error('Image upload failed:', err);
    // Return original as fallback
    return { url: base64Image, compressedBase64: base64Image };
  }
}

/**
 * Upload video thumbnail to storage (for video analysis)
 */
export async function uploadVideoThumbnail(
  videoBase64: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<string> {
  try {
    // Extract first frame from video as thumbnail
    const video = document.createElement('video');
    video.src = videoBase64;
    
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => {
        video.currentTime = 0.1; // Get frame at 0.1 seconds
      };
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth, 640);
    canvas.height = Math.min(video.videoHeight, 480);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return videoBase64;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.7);
    
    // Upload thumbnail
    const result = await uploadChatImage(thumbnailBase64, sessionId, messageId, userId);
    return result.url;
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
    // Extract path from URL
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/chat-attachments\/(.+)/);
    if (!pathMatch) return;
    
    const filePath = pathMatch[1];
    
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
  return url.startsWith('http') && url.includes('supabase');
}
