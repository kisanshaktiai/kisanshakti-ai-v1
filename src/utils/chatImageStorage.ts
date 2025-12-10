import { supabase } from '@/integrations/supabase/client';

const STORAGE_BUCKET = 'chat-attachments';
const TARGET_SIZE_KB = 150;
const MAX_DIMENSION = 1024;
const VIDEO_TARGET_SIZE_MB = 5; // Target 5MB for video
const AUDIO_TARGET_BITRATE = 64000; // 64kbps for audio

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
 * Compress video for storage - extracts keyframes and reduces quality
 * Returns a compressed video blob and thumbnail
 */
export async function compressVideoForStorage(
  videoBase64: string,
  maxDurationSeconds: number = 30
): Promise<{ videoBlob: Blob; thumbnailBlob: Blob; thumbnailBase64: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const video = document.createElement('video');
      video.src = videoBase64;
      video.muted = true;
      
      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error('Failed to load video'));
      });
      
      // Create thumbnail from first frame
      video.currentTime = 0.1;
      await new Promise<void>((res) => {
        video.onseeked = () => res();
      });
      
      const canvas = document.createElement('canvas');
      const targetWidth = Math.min(video.videoWidth, 640);
      const targetHeight = Math.min(video.videoHeight, 480);
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      
      // Get thumbnail
      const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.7);
      const thumbnailBlob = await (await fetch(thumbnailBase64)).blob();
      
      // For video, we'll extract frames and create a compressed version
      // Since browser doesn't have native video encoding, we'll use the original
      // but with reduced quality via re-encoding if MediaRecorder is available
      
      let videoBlob: Blob;
      
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        // Try to re-encode at lower quality
        const stream = (canvas as any).captureStream(15); // 15 fps
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 500000 // 500kbps
        });
        
        const chunks: BlobPart[] = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        
        const duration = Math.min(video.duration, maxDurationSeconds);
        video.currentTime = 0;
        video.play();
        
        await new Promise<void>((res) => {
          mediaRecorder.onstop = () => res();
          mediaRecorder.start();
          
          const drawFrame = () => {
            if (video.currentTime < duration && !video.paused) {
              ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
              requestAnimationFrame(drawFrame);
            } else {
              mediaRecorder.stop();
              video.pause();
            }
          };
          drawFrame();
        });
        
        videoBlob = new Blob(chunks, { type: 'video/webm' });
      } else {
        // Fallback: convert base64 to blob
        const response = await fetch(videoBase64);
        videoBlob = await response.blob();
      }
      
      console.log(`✅ Video compressed: ${Math.round(videoBlob.size / 1024 / 1024 * 100) / 100}MB`);
      
      resolve({ videoBlob, thumbnailBlob, thumbnailBase64 });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Compress audio for storage
 */
export async function compressAudioForStorage(
  audioBase64: string
): Promise<{ audioBlob: Blob; durationSeconds: number }> {
  return new Promise(async (resolve, reject) => {
    try {
      const audio = document.createElement('audio');
      audio.src = audioBase64;
      
      await new Promise<void>((res, rej) => {
        audio.onloadedmetadata = () => res();
        audio.onerror = () => rej(new Error('Failed to load audio'));
      });
      
      const durationSeconds = audio.duration;
      
      // Convert base64 to blob - browser doesn't support native audio re-encoding
      // So we'll use the original format but could use Web Audio API for more control
      const response = await fetch(audioBase64);
      const audioBlob = await response.blob();
      
      console.log(`✅ Audio ready: ${Math.round(audioBlob.size / 1024)}KB, ${Math.round(durationSeconds)}s`);
      
      resolve({ audioBlob, durationSeconds });
    } catch (err) {
      reject(err);
    }
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
 * Upload compressed video to storage with thumbnail
 * Returns public URLs for both video and thumbnail
 */
export async function uploadCompressedVideo(
  videoBase64: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  try {
    // Compress video and get thumbnail
    const { videoBlob, thumbnailBlob, thumbnailBase64 } = await compressVideoForStorage(videoBase64);
    
    const timestamp = Date.now();
    
    // Upload video
    const videoPath = `${userId}/${sessionId}/${messageId}_${timestamp}.webm`;
    const { data: videoData, error: videoError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(videoPath, videoBlob, {
        contentType: 'video/webm',
        cacheControl: '3600',
        upsert: true
      });
    
    // Upload thumbnail
    const thumbPath = `${userId}/${sessionId}/${messageId}_${timestamp}_thumb.jpg`;
    const { data: thumbData, error: thumbError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(thumbPath, thumbnailBlob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true
      });
    
    if (videoError || thumbError) {
      console.error('Video upload error:', videoError || thumbError);
      // Fallback to thumbnail only
      const result = await uploadChatImage(thumbnailBase64, sessionId, messageId, userId);
      return { videoUrl: videoBase64, thumbnailUrl: result.url };
    }
    
    const { data: videoUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(videoData!.path);
    const { data: thumbUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(thumbData!.path);
    
    console.log(`✅ Video uploaded: ${videoUrlData.publicUrl} (${Math.round(videoBlob.size / 1024 / 1024 * 100) / 100}MB)`);
    
    return {
      videoUrl: videoUrlData.publicUrl,
      thumbnailUrl: thumbUrlData.publicUrl
    };
  } catch (err) {
    console.error('Video upload failed:', err);
    // Fallback
    return { videoUrl: videoBase64, thumbnailUrl: videoBase64 };
  }
}

/**
 * Upload compressed audio to storage
 */
export async function uploadCompressedAudio(
  audioBase64: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<{ audioUrl: string; durationSeconds: number }> {
  try {
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
 * Upload video thumbnail to storage (for video analysis) - Legacy support
 */
export async function uploadVideoThumbnail(
  videoBase64: string,
  sessionId: string,
  messageId: string,
  userId: string
): Promise<string> {
  try {
    // Use the new compressed video upload but return only thumbnail URL
    const { thumbnailUrl } = await uploadCompressedVideo(videoBase64, sessionId, messageId, userId);
    return thumbnailUrl;
  } catch (err) {
    console.error('Video thumbnail extraction failed:', err);
    // Fallback to old method
    try {
      const video = document.createElement('video');
      video.src = videoBase64;
      
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => {
          video.currentTime = 0.1;
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
      
      const result = await uploadChatImage(thumbnailBase64, sessionId, messageId, userId);
      return result.url;
    } catch (fallbackErr) {
      return videoBase64;
    }
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
