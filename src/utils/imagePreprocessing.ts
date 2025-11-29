/**
 * Image Preprocessing Utilities for InstaScan
 * Handles EXIF orientation, resizing, compression, and quality validation
 */

export interface ImageQualityMetrics {
  brightness: number; // 0-255
  contrast: number; // 0-255
  sharpness: number; // 0-100 estimated
  fileSize: number; // bytes
  width: number;
  height: number;
}

export interface PreprocessingResult {
  processedImage: string; // base64 data URL
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
  qualityMetrics: ImageQualityMetrics;
  warnings: string[];
}

/**
 * Normalize EXIF orientation to ensure correct image display
 */
function normalizeOrientation(canvas: HTMLCanvasElement, img: HTMLImageElement, orientation: number): void {
  const ctx = canvas.getContext('2d')!;
  const width = img.width;
  const height = img.height;

  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break;
  }
}

/**
 * Calculate image quality metrics
 */
export function calculateQualityMetrics(canvas: HTMLCanvasElement): ImageQualityMetrics {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  let totalBrightness = 0;
  let minBrightness = 255;
  let maxBrightness = 0;
  let totalVariation = 0;
  
  // Calculate brightness and contrast
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    totalBrightness += brightness;
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
    
    // Calculate variation for sharpness estimation
    if (i > 0) {
      const prevBrightness = (pixels[i - 4] + pixels[i - 3] + pixels[i - 2]) / 3;
      totalVariation += Math.abs(brightness - prevBrightness);
    }
  }
  
  const avgBrightness = totalBrightness / (pixels.length / 4);
  const contrast = maxBrightness - minBrightness;
  const avgVariation = totalVariation / (pixels.length / 4);
  
  // Estimate sharpness (0-100) based on pixel variation
  const sharpness = Math.min(100, (avgVariation / 255) * 200);
  
  return {
    brightness: Math.round(avgBrightness),
    contrast: Math.round(contrast),
    sharpness: Math.round(sharpness),
    fileSize: 0, // Will be set after compression
    width: canvas.width,
    height: canvas.height
  };
}

/**
 * Validate image quality and generate warnings (RELAXED for rural farmers)
 */
export function validateImageQuality(metrics: ImageQualityMetrics): string[] {
  const warnings: string[] = [];
  
  // Much more relaxed thresholds
  if (metrics.brightness < 25) {
    warnings.push('Very dark image - may affect accuracy');
  } else if (metrics.brightness > 250) {
    warnings.push('Very bright image - may affect accuracy');
  }
  
  if (metrics.contrast < 30) {
    warnings.push('Low image quality detected');
  }
  
  // Removed blur warning - let AI handle sub-optimal images
  
  if (metrics.fileSize > 2 * 1024 * 1024) { // 2MB
    warnings.push('Large file size - compression recommended');
  }
  
  return warnings;
}

/**
 * Auto-enhance image brightness and contrast
 */
export function autoEnhanceImage(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Calculate current brightness
  let totalBrightness = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    totalBrightness += brightness;
  }
  const avgBrightness = totalBrightness / (pixels.length / 4);
  
  // Auto-adjust if too dark or too bright
  let adjustment = 0;
  if (avgBrightness < 60) {
    adjustment = 40; // Brighten dark images
  } else if (avgBrightness > 220) {
    adjustment = -30; // Darken bright images
  }
  
  if (adjustment !== 0) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = Math.max(0, Math.min(255, pixels[i] + adjustment));
      pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + adjustment));
      pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + adjustment));
    }
    ctx.putImageData(imageData, 0, 0);
    console.log('🎨 Auto-enhanced image brightness by', adjustment);
  }
}

/**
 * Select best frame from multi-frame burst based on sharpness
 */
export function selectBestFrame(frames: string[]): Promise<string> {
  return new Promise((resolve) => {
    if (frames.length === 1) {
      resolve(frames[0]);
      return;
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const scores: { frame: string; sharpness: number }[] = [];
    let processed = 0;
    
    frames.forEach(frame => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const metrics = calculateQualityMetrics(canvas);
        scores.push({ frame, sharpness: metrics.sharpness });
        
        processed++;
        if (processed === frames.length) {
          // Return frame with highest sharpness
          scores.sort((a, b) => b.sharpness - a.sharpness);
          console.log('🎯 Selected best frame with sharpness:', scores[0].sharpness);
          resolve(scores[0].frame);
        }
      };
      img.src = frame;
    });
  });
}

/**
 * Preprocess image: resize, normalize orientation, compress
 */
export async function preprocessImage(
  imageDataUrl: string,
  options: {
    maxDimension?: number;
    targetQuality?: number;
    targetSizeKB?: number;
  } = {}
): Promise<PreprocessingResult> {
  const {
    maxDimension = 1536, // OpenAI recommends 1536x1536 max
    targetQuality = 0.85,
    targetSizeKB = 500
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        const originalSize = imageDataUrl.length;
        
        // Calculate target dimensions maintaining aspect ratio
        let targetWidth = img.width;
        let targetHeight = img.height;
        
        if (img.width > maxDimension || img.height > maxDimension) {
          const aspectRatio = img.width / img.height;
          
          if (img.width > img.height) {
            targetWidth = maxDimension;
            targetHeight = Math.round(maxDimension / aspectRatio);
          } else {
            targetHeight = maxDimension;
            targetWidth = Math.round(maxDimension * aspectRatio);
          }
        }
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d')!;
        
        // Apply smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // TODO: Extract and handle EXIF orientation if needed
        // For now, assume correct orientation from modern devices
        
        // Draw resized image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Auto-enhance if needed
        autoEnhanceImage(canvas);
        
        // Calculate quality metrics
        const qualityMetrics = calculateQualityMetrics(canvas);
        
        // Compress to target size
        let quality = targetQuality;
        let processedImage = canvas.toDataURL('image/jpeg', quality);
        let processedSize = processedImage.length;
        
        // Iteratively reduce quality if file too large
        const maxIterations = 5;
        let iteration = 0;
        const targetSizeBytes = targetSizeKB * 1024 * 1.37; // base64 overhead
        
        while (processedSize > targetSizeBytes && quality > 0.5 && iteration < maxIterations) {
          quality -= 0.1;
          processedImage = canvas.toDataURL('image/jpeg', quality);
          processedSize = processedImage.length;
          iteration++;
        }
        
        qualityMetrics.fileSize = processedSize;
        const warnings = validateImageQuality(qualityMetrics);
        
        const result: PreprocessingResult = {
          processedImage,
          originalSize,
          processedSize,
          compressionRatio: originalSize / processedSize,
          qualityMetrics,
          warnings
        };
        
        console.log('📸 Image preprocessing complete:', {
          originalSize: `${Math.round(originalSize / 1024)}KB`,
          processedSize: `${Math.round(processedSize / 1024)}KB`,
          compression: `${result.compressionRatio.toFixed(2)}x`,
          dimensions: `${targetWidth}x${targetHeight}`,
          quality: `${Math.round(quality * 100)}%`,
          warnings: warnings.length
        });
        
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageDataUrl;
  });
}

/**
 * Extract frames from video (for future video support)
 */
export async function extractVideoFrames(
  videoBlob: Blob,
  options: {
    maxFrames?: number;
    interval?: number; // seconds between frames
  } = {}
): Promise<string[]> {
  const { maxFrames = 5, interval = 1 } = options;
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const frames: string[] = [];
    
    video.preload = 'metadata';
    video.muted = true;
    
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const duration = video.duration;
      const frameInterval = Math.min(interval, duration / maxFrames);
      const frameTimes: number[] = [];
      
      for (let i = 0; i < maxFrames && i * frameInterval < duration; i++) {
        frameTimes.push(i * frameInterval);
      }
      
      let currentFrame = 0;
      
      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.85));
        
        currentFrame++;
        if (currentFrame < frameTimes.length) {
          video.currentTime = frameTimes[currentFrame];
        } else {
          resolve(frames);
        }
      };
      
      video.currentTime = frameTimes[0];
    };
    
    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = URL.createObjectURL(videoBlob);
  });
}

/**
 * Batch preprocess multiple images
 */
export async function preprocessMultipleImages(
  imageUrls: string[],
  options?: Parameters<typeof preprocessImage>[1]
): Promise<PreprocessingResult[]> {
  const results = await Promise.all(
    imageUrls.map(url => preprocessImage(url, options))
  );
  
  return results;
}
